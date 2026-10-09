import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import {
  freezeReadSnapshot,
  snapshotReadValue,
  type WorkspaceReadOptions,
  type WorkspaceReads,
} from "../../../../../../packages/console-authoring/src/read";
import {
  deriveReadRefreshState,
  resolveReadRefreshPolicy,
  type ReadRefreshPolicy,
} from "../../../../../../packages/console-authoring/src/read-refresh";
import { WorkspaceServiceError } from "../../../../../../packages/console-authoring/src/transport";
import { ConsoleQueryClient } from "../../lib/console-query-client";

function isReadDenied(error: unknown): error is WorkspaceServiceError {
  return error instanceof WorkspaceServiceError && error.status === 403;
}

type ReadDenial = { queryHash: string; error: WorkspaceServiceError };

function useDeniedReadCleanup(
  client: QueryClient,
  signal: AbortSignal,
  active: () => void,
  queryHash: string,
  {
    error,
    isSuccess,
    isFetching,
  }: { error: unknown; isSuccess: boolean; isFetching: boolean },
  setDenial: Dispatch<SetStateAction<ReadDenial | undefined>>
) {
  useEffect(() => {
    if (signal.aborted) {
      return;
    }
    active();
    if (isReadDenied(error)) {
      setDenial((previous) =>
        previous?.queryHash === queryHash && previous.error === error
          ? previous
          : { queryHash, error }
      );
      // Active observers may recreate an empty entry after removal. The denial
      // latch keeps them masked and disabled until an explicit read succeeds.
      const [entry] = client.getQueryCache().findAll({
        predicate: (candidate) => candidate.queryHash === queryHash,
      });
      if (entry?.state.error === error && entry.state.fetchStatus === "idle") {
        client.removeQueries({ queryKey: entry.queryKey, exact: true });
      }
    } else if (isSuccess && !isFetching) {
      setDenial((previous) =>
        previous?.queryHash === queryHash ? undefined : previous
      );
    }
  }, [
    client,
    signal,
    active,
    queryHash,
    error,
    isSuccess,
    isFetching,
    setDenial,
  ]);
}

export function createWorkspaceReads(
  client: QueryClient,
  binding: {
    scopeKey: string;
    localDevelopment?: boolean;
    signal: AbortSignal;
    policy: ReadRefreshPolicy;
  }
): WorkspaceReads {
  const epoch =
    client instanceof ConsoleQueryClient ? client.permissionEpoch : 0;
  const authority =
    client instanceof ConsoleQueryClient
      ? client.authenticationScope
      : undefined;
  const authenticationScope =
    authority ?? (binding.localDevelopment ? "local" : undefined);
  const prefix = [
    "console-workspace-read",
    globalThis.location?.origin ?? "native-fixture",
    authenticationScope,
    epoch,
    binding.scopeKey,
  ] as const;
  const active = (signal = binding.signal) => {
    signal.throwIfAborted();
    if (!authenticationScope) {
      throw new Error("Scoped reads require admitted Console session metadata");
    }
    if (
      client instanceof ConsoleQueryClient &&
      (client.permissionEpoch !== epoch ||
        client.authenticationScope !== authority)
    ) {
      throw new DOMException(
        "The admitted read scope has retired",
        "AbortError"
      );
    }
  };
  const keyFor = (key: string, params?: unknown) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u.test(key)) {
      throw new TypeError("Scoped reads require a stable business read name");
    }
    if (params === undefined) {
      return [...prefix, key];
    }
    return [...prefix, key, params];
  };
  return {
    useRead<Params, Data>(options: WorkspaceReadOptions<Params, Data>) {
      active();
      const params = snapshotReadValue(options.params);
      const queryKey = keyFor(options.key, params);
      const defaults = client.defaultQueryOptions({ queryKey });
      const { queryHash } = defaults;
      const [denial, setDenial] = useState<ReadDenial>();
      const denied = denial?.queryHash === queryHash ? denial : undefined;
      const retry = defaults.retry ?? 3;
      const query = useQuery(
        {
          queryKey,
          enabled: (entry) => !denied && !isReadDenied(entry.state.error),
          retry: (failures, error) =>
            !isReadDenied(error) &&
            (typeof retry === "function"
              ? retry(failures, error)
              : retry === true || (retry !== false && failures < retry)),
          queryFn: async ({ signal: querySignal }) => {
            const signal = AbortSignal.any([querySignal, binding.signal]);
            active(signal);
            try {
              const data = await options.read({ params, signal });
              active(signal);
              return snapshotReadValue(data);
            } catch (error) {
              active(signal);
              throw error;
            }
          },
          select: freezeReadSnapshot<Data>,
          ...resolveReadRefreshPolicy(
            binding.policy,
            undefined,
            options.policy
          ),
        },
        client
      );
      useDeniedReadCleanup(
        client,
        binding.signal,
        active,
        queryHash,
        query,
        setDenial
      );
      const data = denied || isReadDenied(query.error) ? undefined : query.data;
      return {
        data,
        error: query.error ?? denied?.error ?? null,
        ...deriveReadRefreshState({
          data,
          isPending: query.isPending && !denied,
          isFetching: query.isFetching,
        }),
        async refetch() {
          active();
          await query.refetch({ throwOnError: true });
          active();
        },
      };
    },
    async invalidate({ key, params }) {
      active();
      await client.invalidateQueries({
        queryKey: keyFor(key, params),
        exact: params !== undefined,
      });
      active();
    },
  };
}
