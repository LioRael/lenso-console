import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ConfigValueDto,
  ConfigValueListResponse,
  ConfigWriteResponse,
} from "../hooks/runtime-api-types";
import { httpClient, isApiMode } from "../lib/http-client";

export type ConsoleConfigValue = ConfigValueDto;
export type ConsoleConfigValueListResponse = ConfigValueListResponse;
export type ConsoleConfigWriteResponse = ConfigWriteResponse;

export const consoleConfigQueryKeys = {
  values: ["config", "values"] as const,
};

function configPath(service: string, key: string) {
  return `admin/config/${encodeURIComponent(service)}/${encodeURIComponent(key)}`;
}

export function useConsoleConfigValues() {
  const apiMode = isApiMode();

  return useQuery({
    enabled: apiMode,
    initialData: apiMode ? undefined : { data: [] },
    queryKey: consoleConfigQueryKeys.values,
    queryFn: () =>
      httpClient.get("admin/config/values").json<ConfigValueListResponse>(),
  });
}

export function useWriteConsoleConfigValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      service,
      value,
    }: {
      key: string;
      service: string;
      value: unknown;
    }) =>
      httpClient
        .put(configPath(service, key), {
          json: { value },
        })
        .json<ConfigWriteResponse>(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: consoleConfigQueryKeys.values,
      });
    },
  });
}
