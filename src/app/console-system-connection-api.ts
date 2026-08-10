import type {
  ConsoleSystemConnectRequest,
  ConsoleSystemConnection,
} from "@lenso/console-ui";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { isHTTPError } from "ky";

import { mockSystemConnection } from "../data/mock-system-connection";
import { httpClient, isApiMode } from "../lib/http-client";
import { consoleSystemRegistryQueryKey } from "./console-system-registry-api";

export const consoleSystemConnectionQueryKey = [
  "console-system",
  "connection",
] as const;

export function useConsoleSystemConnection() {
  const apiMode = isApiMode();
  return useQuery({
    enabled: apiMode,
    initialData: apiMode ? undefined : mockSystemConnection,
    queryFn: async () => {
      try {
        return await httpClient
          .get("api/console/v1/system")
          .json<ConsoleSystemConnection>();
      } catch (error) {
        if (isHTTPError(error) && error.response.status === 404) {
          return null;
        }
        throw error;
      }
    },
    queryKey: consoleSystemConnectionQueryKey,
  });
}

export function useConnectConsoleSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ConsoleSystemConnectRequest) =>
      httpClient
        .post("api/console/v1/system/connect", { json: request })
        .json<ConsoleSystemConnection>(),
    onSuccess: async (connection) => {
      queryClient.setQueryData(consoleSystemConnectionQueryKey, connection);
      await refreshConsoleSystemAuthority(queryClient);
    },
  });
}

export function refreshConsoleSystemAuthority(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: consoleSystemRegistryQueryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: ["console-system", "workload-access"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["console-system", "workload-control"],
    }),
    queryClient.invalidateQueries({
      queryKey: ["console-system", "workload-operation"],
    }),
  ]);
}
