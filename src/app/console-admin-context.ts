import { useQuery } from "@tanstack/react-query";

import { consoleApiAuthToken, httpClient, isApiMode } from "../lib/http-client";

export type ConsoleAdminActor =
  | {
      kind: "service";
      service_id: string;
    }
  | {
      kind: "user";
      user_id: string;
    }
  | {
      kind: "system";
    };

export type ConsoleAdminContext = {
  actor: ConsoleAdminActor;
  scopes: string[];
  capabilities: string[];
  managed_service_capabilities: Record<string, string[]>;
};

export const consoleAdminContextQueryKey = ["admin", "context"] as const;

export function useConsoleAdminContext() {
  const token = consoleApiAuthToken();

  return useQuery({
    enabled: isApiMode() && Boolean(token),
    queryKey: consoleAdminContextQueryKey,
    queryFn: () =>
      httpClient
        .get("api/console/v1/access/context")
        .json<ConsoleAdminContext>(),
  });
}

export function consoleAdminActorLabel(actor: ConsoleAdminActor) {
  switch (actor.kind) {
    case "service": {
      return `service:${actor.service_id}`;
    }
    case "user": {
      return `user:${actor.user_id}`;
    }
    case "system": {
      return "system";
    }
    default: {
      return "unknown";
    }
  }
}

export function consoleCapabilitiesForManagedService(
  context: ConsoleAdminContext,
  serviceId: string
): string[] {
  return [
    ...new Set([
      ...context.capabilities,
      ...(context.managed_service_capabilities[serviceId] ?? []),
    ]),
  ].sort();
}
