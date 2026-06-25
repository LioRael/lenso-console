import { useQuery } from "@tanstack/react-query";

import { httpClient, isApiMode, runtimeApiAuthToken } from "../lib/http-client";

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
};

export const consoleAdminContextQueryKey = ["admin", "context"] as const;

export function useConsoleAdminContext() {
  const token = runtimeApiAuthToken();

  return useQuery({
    enabled: isApiMode() && Boolean(token),
    queryKey: consoleAdminContextQueryKey,
    queryFn: () => httpClient.get("admin/context").json<ConsoleAdminContext>(),
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
