import type { ConsoleManagedService } from "@lenso/console-ui";
import { useQuery } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../lib/http-client";

export const consoleSystemRegistryQueryKey = [
  "console-system-registry",
  "services",
] as const;

export function useConsoleManagedServices() {
  const apiMode = isApiMode();

  return useQuery({
    enabled: apiMode,
    initialData: apiMode ? undefined : [],
    queryFn: () =>
      httpClient.get("api/console/v1/services").json<ConsoleManagedService[]>(),
    queryKey: consoleSystemRegistryQueryKey,
  });
}
