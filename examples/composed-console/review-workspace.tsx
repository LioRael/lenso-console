import type { ConsoleLocalPageProps } from "@lenso/console-react";
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

import type { ReviewServices } from "./review-pages";

type Props = ConsoleLocalPageProps<ReviewServices>;

export function workspacePage(
  id: string,
  basePath: string,
  segments: (props: Props) => readonly string[],
  render: (props: Props, workspace: PageProps) => ReactNode
) {
  return function ReviewPage(props: Props) {
    return (
      <ReviewWorkspace
        key={props.activation.key}
        id={id}
        basePath={basePath}
        segments={segments(props)}
        activation={props.activation}
        signal={props.signal}
        services={props.services.workspace}
        navigate={props.services.navigate}
      >
        {(workspace) => render(props, workspace)}
      </ReviewWorkspace>
    );
  };
}

function useReviewRead<Params, Data>(
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

function ScopedWorkspace({
  value,
  children,
}: {
  value: Omit<PageProps, "reads">;
  children: (props: PageProps) => ReactNode;
}) {
  const query = useQueryClient();
  const reads = useMemo<WorkspaceReads>(
    () => ({
      useRead: useReviewRead,
      async invalidate({ key, params }) {
        await query.invalidateQueries({
          queryKey: params === undefined ? [key] : [key, params],
        });
      },
    }),
    [query]
  );
  const props: PageProps = { ...value, reads };
  return <WorkspaceScope value={props}>{children(props)}</WorkspaceScope>;
}

/** Local sample host for the same SDK pages used by the admitted TS host. */
export function ReviewWorkspace({
  id,
  basePath,
  segments,
  activation,
  signal,
  services,
  navigate,
  children,
}: {
  id: string;
  basePath: string;
  segments: readonly string[];
  activation: NonNullable<PageProps["activation"]>;
  signal: AbortSignal;
  services: WorkspaceServices;
  navigate(href: string): void;
  children: (props: PageProps) => ReactNode;
}) {
  const query = useMemo(() => new QueryClient(), []);
  useEffect(() => {
    const retire = () => {
      void query.cancelQueries();
      query.clear();
    };
    signal.addEventListener("abort", retire, { once: true });
    return () => {
      signal.removeEventListener("abort", retire);
      retire();
    };
  }, [query, signal]);
  const href = (parts: readonly string[]) =>
    basePath +
    (parts.length ? `/${parts.map(encodeURIComponent).join("/")}` : "");
  const value: Omit<PageProps, "reads"> = {
    activation,
    signal,
    services,
    params: {},
    mount: {
      id: `sample-${id}`,
      pageId: id,
      title: id,
      subject: { kind: "console" },
      revision: "sample-1",
      basePath,
      owner: { instance: "sample-review" },
      scopeKey: activation.key,
    },
    environment: {
      locale: "en",
      theme:
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    },
    location: {
      segments,
      search: window.location.search,
      hash: window.location.hash,
    },
    navigation: {
      href,
      go(parts) {
        if (!signal.aborted && activation.isCurrent()) {
          navigate(href(parts));
        }
      },
      openSettings() {
        throw new Error(
          "Settings navigation is not installed in this sample host"
        );
      },
      openWorkspace() {
        throw new Error(
          "Cross-workspace handoff is not installed in this sample host"
        );
      },
    },
  };
  return (
    <QueryClientProvider client={query}>
      <ScopedWorkspace value={value}>{children}</ScopedWorkspace>
    </QueryClientProvider>
  );
}
