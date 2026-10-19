import type {
  PageProps,
  ReadSnapshot,
  WorkspaceReadOptions,
  WorkspaceReadResult,
  WorkspaceReads,
  WorkspaceServices,
} from "@lenso/console-sdk";
import { useWorkspace, WorkspaceScope } from "@lenso/console-sdk/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, type ReactNode } from "react";

function useFixtureRead<Params, Data>(
  options: WorkspaceReadOptions<Params, Data>
): WorkspaceReadResult<Data> {
  const workspace = useWorkspace();
  const query = useQuery({
    queryKey: [options.key, options.params],
    queryFn: ({ signal }) =>
      options.read({
        params: options.params,
        signal: AbortSignal.any([signal, workspace.signal]),
      }),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  return {
    data: query.data as ReadSnapshot<Data> | undefined,
    error: query.error,
    blocking: query.isPending,
    refreshing: query.isFetching,
    async refetch() {
      await query.refetch({ throwOnError: true });
    },
  };
}
function Bridge({
  value,
  children,
}: {
  value: Omit<PageProps, "reads">;
  children: (value: PageProps) => ReactNode;
}) {
  const query = useQueryClient();
  const reads = useMemo<WorkspaceReads>(
    () => ({
      useRead: useFixtureRead,
      async invalidate({ key, params }) {
        await query.invalidateQueries({
          queryKey: params === undefined ? [key] : [key, params],
        });
      },
    }),
    [query]
  );
  const props = { ...value, reads };
  return <WorkspaceScope value={props}>{children(props)}</WorkspaceScope>;
}

const href = (parts: readonly string[]) =>
  `/identity${parts.length ? `/${parts.map(encodeURIComponent).join("/")}` : ""}`;

/** Isolated public SDK host. No server, production identity or credentials. */
export function FixtureWorkspace({
  activation,
  signal,
  segments,
  services,
  navigate,
  children,
}: {
  activation: NonNullable<PageProps["activation"]>;
  signal: AbortSignal;
  segments: readonly string[];
  services: WorkspaceServices;
  navigate(href: string): void;
  children: (value: PageProps) => ReactNode;
}) {
  const query = useMemo(() => new QueryClient(), []);
  useEffect(
    () => () => {
      void query.cancelQueries();
      query.clear();
    },
    [query]
  );
  const value: Omit<PageProps, "reads"> = {
    activation,
    signal,
    services,
    params: {},
    mount: {
      id: "identity-fixture",
      pageId: "identity",
      title: "Identity",
      subject: { kind: "console" },
      revision: "fixture",
      basePath: "/identity",
      owner: { instance: "isolated-fixture" },
    },
    environment: { locale: "en", theme: "light" },
    location: { segments, search: location.search, hash: "" },
    navigation: {
      href,
      go(parts) {
        if (!signal.aborted && activation.isCurrent()) {
          navigate(href(parts));
        }
      },
      openWorkspace() {
        throw new Error(
          "Cross-workspace navigation is not installed in this fixture."
        );
      },
      openSettings() {
        throw new Error("Settings is not installed in this fixture.");
      },
    },
  };
  return (
    <QueryClientProvider client={query}>
      <Bridge value={value}>{children}</Bridge>
    </QueryClientProvider>
  );
}
