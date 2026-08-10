import {
  CONSOLE_HOST_API_VERSION,
  EmptyState,
  configureConsoleHostApi,
  consoleUi,
  type ConsoleHostApi as PublicConsoleHostApi,
} from "@lenso/console-ui";

import { useConsole } from "../components/runtime/console-context";
import { ExecutionInspector } from "../components/runtime/execution-inspector";
import {
  defaultExecutionInspectorTab,
  executionInspectorTabs,
} from "../components/runtime/execution-inspector-model";
import { ResizeHandle } from "../components/runtime/resize-handle";
import { findStoryByCorrelation } from "../components/runtime/runtime-story-target";
import { RuntimeStoryVisualization } from "../components/runtime/runtime-story-visualization";
import { ServiceSummaryStrip } from "../components/runtime/service-summary-strip";
import { StoryHeader } from "../components/runtime/story-header";
import { StoryList } from "../components/runtime/story-list";
import { retryTargetForNode, runtimeStories } from "../data/mock-runtime";
import { consoleDevConfig } from "../dev/console-dev-config";
import {
  authConsoleMockFixtures,
  createMockConsoleHostApi,
} from "../dev/mock-console-host-api";
import {
  useBrowserUrlPopState,
  writeBrowserUrl,
} from "../hooks/use-browser-url-state";
import { useListKeyboard } from "../hooks/use-list-keyboard";
import { usePersistedLayout } from "../hooks/use-persisted-layout";
import {
  useRuntimeStories,
  useRuntimeStoryDetail,
} from "../hooks/use-runtime-queries";
import { operationsPath } from "../pages/operations-url-model";
import {
  useConsoleAdminAction,
  useConsoleAdminRecords,
} from "./console-admin-data-api";
import { useConsoleCapabilities } from "./console-capabilities";
import {
  useConsoleConfigValues,
  useWriteConsoleConfigValue,
} from "./console-config-api";
import { useConsoleSlotContributions } from "./console-contributions";
import { useConsoleModulesMetadata } from "./console-module-metadata-query";
import {
  useConnectConsoleSystem,
  useConsoleSystemConnection,
} from "./console-system-connection-api";
import { useConsoleManagedServices } from "./console-system-registry-api";
import { selectManagedService } from "./managed-service-selection";

export const productionConsoleHostApi = {
  version: CONSOLE_HOST_API_VERSION,
  adminData: {
    useInvokeAction: useConsoleAdminAction,
    useRecords: useConsoleAdminRecords,
  },
  capabilities: {
    useAvailable: useConsoleCapabilities,
  },
  contributions: {
    useSlot: useConsoleSlotContributions,
  },
  config: {
    useValues: useConsoleConfigValues,
    useWriteValue: useWriteConsoleConfigValue,
  },
  modules: {
    useMetadata: useConsoleModulesMetadata,
  },
  context: {
    useConsole,
    useRuntimeConsole: useConsole,
  },
  data: {
    retryTargetForNode,
    runtimeStories,
  },
  hooks: {
    useBrowserUrlPopState,
    useListKeyboard,
    usePersistedLayout,
    writeBrowserUrl,
  },
  queries: {
    useRuntimeStories,
    useRuntimeStoryDetail,
  },
  routing: {
    buildPath: operationsPath,
  },
  story: {
    executionInspectorTabs,
    findStoryByCorrelation,
  },
  systemRegistry: {
    selectService: selectManagedService,
    useConnect: useConnectConsoleSystem,
    useConnection: useConsoleSystemConnection,
    useServices: useConsoleManagedServices,
  },
  ui: {
    ...consoleUi,
    common: {
      EmptyState,
    },
    runtime: {
      ExecutionInspector,
      ResizeHandle,
      RuntimeStoryVisualization,
      ServiceSummaryStrip,
      StoryHeader,
      StoryList,
      defaultExecutionInspectorTab,
    },
  },
};

export const consoleHostApi =
  consoleDevConfig.mode === "mock"
    ? createMockConsoleHostApi(
        productionConsoleHostApi,
        authConsoleMockFixtures
      )
    : productionConsoleHostApi;

configureConsoleHostApi(consoleHostApi as unknown as PublicConsoleHostApi);

export type ConsoleHostApi = typeof productionConsoleHostApi;
export type {
  ConsoleAdminListResponse,
  ConsoleAdminRecord,
} from "./console-admin-data-api";
export type {
  ConsoleResolvedAdminActionContribution,
  ConsoleResolvedContribution,
} from "./console-contributions";
export type {
  ConsoleConfigValue,
  ConsoleConfigValueListResponse,
  ConsoleConfigWriteResponse,
} from "./console-config-api";
export type { ConsoleModuleMetadata } from "./console-module-resolver";
export type { ExecutionInspectorTab } from "../components/runtime/execution-inspector-model";
export type { StoryViewMode } from "../components/runtime/story-tabs";
export type { ExecutionNode, RuntimeStory } from "../data/mock-runtime";
