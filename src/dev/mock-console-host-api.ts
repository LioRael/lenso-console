import type { UseQueryResult } from "@tanstack/react-query";

import type { ConsoleAdminRecord } from "../app/console-admin-data-api";
import type { ConsoleConfigValue } from "../app/console-config-api";
import type { RuntimeConsoleHostApi } from "../app/console-host-api";

type ConsoleSlotContributions = ReturnType<
  RuntimeConsoleHostApi["contributions"]["useSlot"]
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
};

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
  baseHostApi: RuntimeConsoleHostApi,
  fixtures: MockConsoleFixtures = {}
): RuntimeConsoleHostApi {
  return {
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
      useMetadata: () => mockSuccessQueryResult({ modules: [] }),
    },
    queries: baseHostApi.queries,
    routing: baseHostApi.routing,
    story: baseHostApi.story,
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
