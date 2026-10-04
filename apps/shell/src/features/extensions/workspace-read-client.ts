import { useQuery, type QueryClient } from "@tanstack/react-query";

import {
  freezeReadSnapshot,
  snapshotReadValue,
  type WorkspaceReadOptions,
  type WorkspaceReads,
} from "../../../../../packages/console-authoring/src/read";
import {
  deriveReadRefreshState,
  resolveReadRefreshPolicy,
  type ReadRefreshPolicy,
} from "../../../../../packages/console-authoring/src/read-refresh";
import { ConsoleQueryClient } from "../../lib/console-query-client";

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
      const query = useQuery(
        {
          queryKey: keyFor(options.key, params),
          queryFn: async ({ signal: querySignal }) => {
            const signal = AbortSignal.any([querySignal, binding.signal]);
            active(signal);
            const data = await options.read({ params, signal });
            active(signal);
            return snapshotReadValue(data);
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
      return {
        data: query.data,
        error: query.error,
        ...deriveReadRefreshState(query),
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
