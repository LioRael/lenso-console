import type { ConsoleManagedService } from "@lenso/console-package-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../lib/http-client";

export const consoleSystemRegistryQueryKey = [
  "console-system-registry",
  "services",
] as const;

export function useConsoleManagedServices() {
  return useQuery({
    enabled: isApiMode(),
    queryFn: () =>
      httpClient.get("api/console/v1/services").json<ConsoleManagedService[]>(),
    queryKey: consoleSystemRegistryQueryKey,
  });
}

export function useRevokeConsoleEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      expectedVersion,
      reason,
      serviceId,
    }: {
      expectedVersion: number;
      reason: string;
      serviceId: string;
    }) =>
      httpClient
        .post(
          `api/console/v1/services/${encodeURIComponent(serviceId)}/enrollment/revoke`,
          { json: { expectedVersion, reason } }
        )
        .json<ConsoleManagedService>(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: consoleSystemRegistryQueryKey,
      });
    },
  });
}
