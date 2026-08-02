import type { ConsoleManagedService } from "@lenso/console-ui-internal";
import type { UseQueryResult } from "@tanstack/react-query";

import type { ConsoleAdminRecord } from "../app/console-admin-data-api";
import type { ConsoleConfigValue } from "../app/console-config-api";
import type { ConsoleHostApi } from "../app/console-host-api";
import type { ConsoleModuleMetadata } from "../app/console-module-resolver";

type ConsoleSlotContributions = ReturnType<
  ConsoleHostApi["contributions"]["useSlot"]
>;
type MockSuccessQueryResult<TData> = Extract<
  UseQueryResult<TData, Error>,
  { status: "success" }
>;

export const emptyAdminListResponse = {
  data: [],
  page: {
    limit: 50,
    next_cursor: null,
  },
};

export type MockConsoleFixtures = {
  adminData?: Record<string, Record<string, ConsoleAdminRecord[]>>;
  capabilities?: readonly string[];
  configValues?: ConsoleConfigValue[];
  contributions?: Record<string, ConsoleSlotContributions>;
  managedServices?: ConsoleManagedService[];
  modules?: MockConsoleModuleMetadata[];
};

type MockConsoleModuleMetadata = ConsoleModuleMetadata & {
  dependencies?: readonly string[];
  http_routes?: readonly {
    display_name?: string | null;
    method?: string;
    path?: string;
    story_title?: string | null;
  }[];
};

export const authConsoleMockFixtures: MockConsoleFixtures = {
  adminData: {
    auth: {
      sessions: [
        {
          client_ip: "203.0.113.24",
          created_at: "2026-08-01T01:42:00.000Z",
          device_id: "device_7f2a",
          expires_at: "2026-08-08T01:42:00.000Z",
          id: "sess_01J4Y31D",
          revoked_at: null,
          user_agent: "Mozilla/5.0 (Macintosh; Apple Silicon)",
          user_id: "usr_01J4Y2Q8",
        },
        {
          client_ip: "198.51.100.18",
          created_at: "2026-07-31T04:04:00.000Z",
          device_id: "device_a908",
          expires_at: "2026-08-07T04:04:00.000Z",
          id: "sess_01J4VXA1",
          revoked_at: null,
          user_agent: "Mozilla/5.0 (iPhone)",
          user_id: "usr_01J4VX9M",
        },
        {
          client_ip: "192.0.2.81",
          created_at: "2026-07-30T14:51:00.000Z",
          device_id: "device_142b",
          expires_at: "2026-08-06T14:51:00.000Z",
          id: "sess_01J4TQ72",
          revoked_at: null,
          user_agent: "Mozilla/5.0 (Windows NT 10.0)",
          user_id: "usr_01J4TQ6R",
        },
      ],
      users: [
        {
          created_at: "2026-08-01T01:42:00.000Z",
          disabled_at: null,
          disabled_reason: null,
          disabled_until: null,
          id: "usr_01J4Y2Q8",
          is_anonymous: false,
        },
        {
          created_at: "2026-07-31T10:16:00.000Z",
          disabled_at: "2026-08-01T00:00:00.000Z",
          disabled_reason: "operator review",
          disabled_until: "2026-08-08T00:00:00.000Z",
          id: "usr_01J4XW1C",
          is_anonymous: false,
        },
        {
          created_at: "2026-07-31T04:04:00.000Z",
          disabled_at: null,
          disabled_reason: null,
          disabled_until: null,
          id: "usr_01J4VX9M",
          is_anonymous: true,
        },
        {
          created_at: "2026-07-30T14:51:00.000Z",
          disabled_at: null,
          disabled_reason: null,
          disabled_until: null,
          id: "usr_01J4TQ6R",
          is_anonymous: false,
        },
      ],
    },
    "auth-device": {
      devices: [
        {
          created_at: "2026-08-01T01:42:00.000Z",
          id: "device_7f2a",
          last_seen_ip: "203.0.113.24",
          last_seen_user_agent: "Mozilla/5.0 (Macintosh; Apple Silicon)",
          primary_at: "2026-08-01T01:42:00.000Z",
          trusted_at: "2026-08-01T01:44:00.000Z",
          updated_at: "2026-08-01T01:44:00.000Z",
          user_id: "usr_01J4Y2Q8",
        },
      ],
    },
  },
  configValues: [
    {
      desired_value: { usr_01J4Y2Q8: ["console.admin", "auth.users.read"] },
      effective_value: { usr_01J4Y2Q8: ["console.admin", "auth.users.read"] },
      key: "auth.console_admin_user_scopes",
      pending_restart: false,
      source: "fixture",
      value: { usr_01J4Y2Q8: ["console.admin", "auth.users.read"] },
    },
  ],
  contributions: {
    "auth.users.detail.actions": [
      {
        actionName: "reset_password",
        input: { user_id: "usr_01J4Y2Q8" },
        key: "auth-password.reset_password",
        kind: "admin_action",
        label: "Reset password",
        moduleName: "auth-password",
        requiredCapabilities: [],
      },
      {
        actionName: "reset_phone_password",
        input: { user_id: "usr_01J4Y2Q8" },
        key: "auth-phone.reset_phone_password",
        kind: "admin_action",
        label: "Reset phone password",
        moduleName: "auth-phone",
        requiredCapabilities: [],
      },
    ],
  },
  modules: [
    mockProviderModule("auth-github", [
      ["GET", "/v1/auth/github/start", "Start GitHub Login"],
      ["GET", "/v1/auth/github/callback", "Complete GitHub Login"],
    ]),
    mockProviderModule("auth-google", [
      ["GET", "/v1/auth/google/start", "Start Google Login"],
      ["GET", "/v1/auth/google/callback", "Complete Google Login"],
    ]),
    mockProviderModule("auth-oidc", [
      ["GET", "/.well-known/openid-configuration", "Discovery document"],
      ["GET", "/.well-known/jwks.json", "Signing keys"],
      ["GET", "/oauth/authorize", "Authorization endpoint"],
      ["POST", "/oauth/token", "Token endpoint"],
    ]),
  ],
};

function mockProviderModule(
  moduleName: string,
  routes: readonly (readonly [string, string, string])[]
): MockConsoleModuleMetadata {
  return {
    dependencies:
      moduleName === "auth-oidc" ? ["auth"] : ["auth", "auth-oauth"],
    error: null,
    http_routes: routes.map(([method, path, displayName]) => ({
      display_name: displayName,
      method,
      path,
    })),
    module_name: moduleName,
    status: "loaded",
  };
}

export function mockAdminRecords(
  fixtures: MockConsoleFixtures,
  {
    entityName,
    limit = 50,
    moduleName,
  }: {
    entityName: string;
    limit?: number;
    moduleName: string;
  }
) {
  const rows = fixtures.adminData?.[moduleName]?.[entityName];
  if (rows === undefined) {
    return limit === emptyAdminListResponse.page.limit
      ? emptyAdminListResponse
      : {
          ...emptyAdminListResponse,
          page: {
            ...emptyAdminListResponse.page,
            limit,
          },
        };
  }
  return {
    data: rows,
    page: {
      limit,
      next_cursor: null,
    },
  };
}

export function mockAvailableCapabilities(fixtures: MockConsoleFixtures) {
  return fixtures.capabilities ?? ["*"];
}

export function mockSlotContributions(
  fixtures: MockConsoleFixtures,
  slotId: string,
  _context: Record<string, unknown>
) {
  return fixtures.contributions?.[slotId] ?? [];
}

export function createMockConsoleHostApi(
  baseHostApi: ConsoleHostApi,
  fixtures: MockConsoleFixtures = {}
): ConsoleHostApi {
  return {
    version: baseHostApi.version,
    adminData: {
      useInvokeAction: baseHostApi.adminData.useInvokeAction,
      useRecords: ({ entityName, limit = 50, moduleName }) =>
        mockSuccessQueryResult(
          mockAdminRecords(fixtures, { entityName, limit, moduleName })
        ),
    },
    capabilities: {
      useAvailable: () => mockAvailableCapabilities(fixtures),
    },
    config: {
      useValues: () =>
        mockSuccessQueryResult({ data: fixtures.configValues ?? [] }),
      useWriteValue: baseHostApi.config.useWriteValue,
    },
    contributions: {
      useSlot: (slotId, context = {}) =>
        mockSlotContributions(fixtures, slotId, context),
    },
    context: baseHostApi.context,
    data: baseHostApi.data,
    hooks: baseHostApi.hooks,
    modules: {
      useMetadata: () =>
        mockSuccessQueryResult({ modules: fixtures.modules ?? [] }),
    },
    queries: baseHostApi.queries,
    routing: baseHostApi.routing,
    story: baseHostApi.story,
    systemRegistry: {
      useServices: () => mockSuccessQueryResult(fixtures.managedServices ?? []),
    },
    ui: baseHostApi.ui,
  };
}

function mockSuccessQueryResult<TData>(
  data: TData
): MockSuccessQueryResult<TData> {
  const result: MockSuccessQueryResult<TData> = {
    data,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "idle",
    isEnabled: true,
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    promise: Promise.resolve(data),
    refetch: async () => result,
    status: "success",
  };
  return result;
}
