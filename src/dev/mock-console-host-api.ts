import type {
  ConsoleManagedService,
  ConsoleSystemConnection,
} from "@lenso/console-ui";
import type { UseQueryResult } from "@tanstack/react-query";

import type { ConsoleConfigValue } from "../app/console-config-api";
import type { ConsoleHostApi } from "../app/console-host-api";
import type { ConsoleModuleMetadata } from "../app/console-module-resolver";
import { mockManagedServices } from "../data/mock-services";
import { mockSystemConnection } from "../data/mock-system-connection";

type ConsoleSlotContributions = ReturnType<
  ConsoleHostApi["contributions"]["useSlot"]
>;
type MockSuccessQueryResult<TData> = Extract<
  UseQueryResult<TData, Error>,
  { status: "success" }
>;

export type MockConsoleFixtures = {
  capabilities?: readonly string[];
  configValues?: ConsoleConfigValue[];
  contributions?: Record<string, ConsoleSlotContributions>;
  managedServices?: ConsoleManagedService[];
  modules?: MockConsoleModuleMetadata[];
  systemConnection?: ConsoleSystemConnection | null;
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
  contributions: {
    "auth.users.detail.actions": [
      {
        contractId: "auth-password-business",
        contractVersion: "v1",
        input: { user_id: "usr_01J4Y2Q8" },
        key: "auth-password.reset_password",
        kind: "operation",
        label: "Reset password",
        operationId: "auth-password/reset-password",
        requiredCapabilities: [],
      },
      {
        contractId: "auth-phone-business",
        contractVersion: "v1",
        input: { user_id: "usr_01J4Y2Q8" },
        key: "auth-phone.reset_phone_password",
        kind: "operation",
        label: "Reset phone password",
        operationId: "auth-phone/reset-phone-password",
        requiredCapabilities: [],
      },
    ],
  },
  managedServices: mockManagedServices,
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
      selectService: () => undefined,
      useConnect: baseHostApi.systemRegistry.useConnect,
      useConnection: () =>
        mockSuccessQueryResult(
          fixtures.systemConnection === undefined
            ? mockSystemConnection
            : fixtures.systemConnection
        ),
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
