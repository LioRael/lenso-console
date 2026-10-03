import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { httpClient, isApiMode } from "../../lib/http-client";
import { globalUiModules } from "./global-ui-runtime";
import { parsePageCatalog, type PageMount } from "./page-contribution-catalog";
import {
  ContributionError,
  ContributionRenderBoundary,
  useContributionModule,
} from "./page-contribution-outlet";

export function GlobalContributionOutlet({
  suspended,
}: {
  suspended: boolean;
}) {
  const catalog = useQuery({
    queryKey: ["global-ui-catalog"],
    queryFn: async ({ signal }) =>
      parsePageCatalog(
        await httpClient.get("api/console/v1/surfaces", { signal }).json()
      ),
    enabled: isApiMode(),
    refetchInterval: 5000,
    retry: false,
  });
  return catalog.data?.map((mount) => (
    <GlobalSurface
      key={`${mount.owner.instance}:${mount.id}:${mount.revision}:${mount.module}`}
      mount={mount}
      suspended={suspended}
    />
  ));
}

function GlobalSurface({
  mount,
  suspended,
}: {
  mount: PageMount;
  suspended: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const ready =
    mount.owner.trusted &&
    mount.requirements.every(
      (requirement) => !requirement.required || requirement.available
    );
  const loaded = useContributionModule<{
    mount: PageMount;
    suspended: boolean;
    signal: AbortSignal;
    location: { segments: never[]; search: string; hash: string };
  }>(ready ? mount : undefined, attempt, globalUiModules);
  if (ready && loaded.status === "error") {
    return (
      <ContributionError
        title="Optional extension unavailable"
        message={loaded.error.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }
  if (!ready || loaded.status !== "ready") {
    return null;
  }
  const Surface = loaded.Page;
  const { Provider } = loaded;
  return (
    <ContributionRenderBoundary
      key={attempt}
      title="Optional extension failed"
      onRetry={() => setAttempt((value) => value + 1)}
    >
      <Provider>
        <Surface
          {...{
            mount,
            suspended,
            signal: loaded.signal,
            location: {
              segments: [],
              search: window.location.search,
              hash: window.location.hash,
            },
          }}
        />
      </Provider>
    </ContributionRenderBoundary>
  );
}
