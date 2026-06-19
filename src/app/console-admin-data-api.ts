import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AdminActionInvokeRequest,
  AdminActionInvokeResponse,
} from "../hooks/runtime-api-types";
import { httpClient, isApiMode } from "../lib/http-client";

export type ConsoleAdminRecord = Record<string, unknown>;

export type ConsoleAdminListResponse = {
  data: ConsoleAdminRecord[];
  page: {
    limit: number;
    next_cursor: string | null;
  };
};

export function useConsoleAdminRecords({
  entityName,
  limit = 50,
  moduleName,
}: {
  moduleName: string;
  entityName: string;
  limit?: number;
}) {
  return useQuery({
    enabled: isApiMode(),
    queryKey: ["admin-data", "list", moduleName, entityName, limit] as const,
    queryFn: () =>
      httpClient
        .get(
          `admin/data/${encodeURIComponent(moduleName)}/${encodeURIComponent(entityName)}?limit=${limit}`
        )
        .json<ConsoleAdminListResponse>(),
  });
}

export function useConsoleAdminAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      actionName,
      input,
      moduleName,
    }: {
      moduleName: string;
      actionName: string;
      input: Record<string, unknown>;
    }) =>
      httpClient
        .post(
          `admin/data/${encodeURIComponent(moduleName)}/actions/${encodeURIComponent(actionName)}`,
          {
            json: { input } satisfies AdminActionInvokeRequest,
          }
        )
        .json<AdminActionInvokeResponse>(),
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-data", "list", variables.moduleName],
      });
      await queryClient.invalidateQueries({
        queryKey: ["runtime", "admin-actions"],
      });
    },
  });
}
