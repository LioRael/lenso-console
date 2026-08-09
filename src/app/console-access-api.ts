import { useQuery } from "@tanstack/react-query";

import { httpClient, isApiMode } from "../lib/http-client";

export type ConsoleAccessUser = {
  id: string;
  is_anonymous: boolean;
  created_at: string;
  disabled_at: string | null;
  disabled_reason: string | null;
  disabled_until: string | null;
};

export type ConsoleAccessOrganization = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ConsoleAccessGrant = {
  id: string;
  subject_type: "user" | "organization";
  subject_id: string;
  service_id: string;
  capabilities: string[];
  created_by: string;
  created_at: string;
  revoked_at: string | null;
  revision: number;
};

export type ConsoleAccessPage<T> = {
  data: T[];
  page: {
    limit: number;
    next_cursor: string | null;
  };
};

export const consoleAccessQueryKeys = {
  grants: ["console-access", "grants"] as const,
  organizations: ["console-access", "organizations"] as const,
  users: ["console-access", "users"] as const,
};

export function useConsoleAccessUsers() {
  return useQuery({
    enabled: isApiMode(),
    initialData: isApiMode() ? undefined : emptyPage<ConsoleAccessUser>(),
    queryKey: consoleAccessQueryKeys.users,
    queryFn: () =>
      httpClient
        .get("api/console/v1/access/users")
        .json<ConsoleAccessPage<ConsoleAccessUser>>(),
  });
}

export function useConsoleAccessOrganizations() {
  return useQuery({
    enabled: isApiMode(),
    initialData: isApiMode()
      ? undefined
      : emptyPage<ConsoleAccessOrganization>(),
    queryKey: consoleAccessQueryKeys.organizations,
    queryFn: () =>
      httpClient
        .get("api/console/v1/access/organizations")
        .json<ConsoleAccessPage<ConsoleAccessOrganization>>(),
  });
}

export function useConsoleAccessGrants() {
  return useQuery({
    enabled: isApiMode(),
    initialData: isApiMode() ? undefined : [],
    queryKey: consoleAccessQueryKeys.grants,
    queryFn: () =>
      httpClient
        .get("api/console/v1/access/grants")
        .json<ConsoleAccessGrant[]>(),
  });
}

function emptyPage<T>(): ConsoleAccessPage<T> {
  return {
    data: [],
    page: { limit: 50, next_cursor: null },
  };
}
