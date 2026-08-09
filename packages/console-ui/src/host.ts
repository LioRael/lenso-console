import type { ComponentType, FunctionComponent, ReactNode } from "react";

import type { ConsoleLocale } from "./locale";
import type { ConsoleUiComponents } from "./ui";

/**
 * The host-facing API used by Console UI modules.
 *
 * This adapter deliberately lives in the public UI package.  A module may be
 * loaded after the Shell has been built, so it must not import an app-private
 * alias to reach the host.
 */
export const CONSOLE_HOST_API_VERSION = "1" as const;

export type ConsoleSurfaceArea =
  | "runtime"
  | "operations"
  | "data"
  | "configuration";

export type ConsoleSurfaceIcon =
  | "activity"
  | "blocks"
  | "boxes"
  | "chrome"
  | "database"
  | "git-compare-arrows"
  | "github"
  | "house"
  | "key-round"
  | "network"
  | "rocket"
  | "server-cog"
  | "shield"
  | "settings"
  | "smartphone"
  | "users"
  | "workflow";

export type ConsoleLocalizedLabels = Partial<Record<ConsoleLocale, string>>;

export interface ConsoleWorkspaceRef {
  id: string;
  label: string;
  localizedLabels?: ConsoleLocalizedLabels;
  icon?: string;
}

export interface ConsoleNavigationGroup {
  id: string;
  label: string;
  localizedLabels?: ConsoleLocalizedLabels;
  icon?: string;
  order?: number;
}

export interface ConsoleNavigationMetadata {
  workspace: ConsoleWorkspaceRef;
  group?: ConsoleNavigationGroup;
  order?: number;
}

export interface ConsoleModuleSurface {
  path: string;
  label: string;
  localizedLabels?: ConsoleLocalizedLabels;
  area: ConsoleSurfaceArea;
  component: FunctionComponent;
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

export interface ConsoleActionInputBinding {
  input: string;
  value: ConsoleActionInputValue;
}

export interface ConsoleActionInputValue {
  kind: "slot_context";
  path: string;
}

export type ConsoleContributionKind = "admin_action";

export interface ConsoleContributionAction {
  kind: "admin_action";
  module: string;
  name: string;
  input_bindings?: ConsoleActionInputBinding[];
}

export interface ConsoleContribution {
  target: string;
  target_version: number;
  label: string;
  action: ConsoleContributionAction;
  icon?: string | null;
  required_capabilities?: readonly string[];
}

export interface ConsoleSlot {
  id: string;
  version: number;
  label: string;
  accepts?: readonly ConsoleContributionKind[];
  context?: readonly ConsoleSlotContext[];
}

export interface ConsoleSlotContext {
  name: string;
  fields?: readonly ConsoleSlotContextField[];
}

export interface ConsoleSlotContextField {
  name: string;
  field_type: "string" | "boolean" | "number" | "timestamp";
  required?: boolean;
}

export interface ConsoleResolvedAdminActionContribution {
  kind: "admin_action";
  key: string;
  label: string;
  moduleName: string;
  actionName: string;
  input: Record<string, unknown>;
  requiredCapabilities: readonly string[];
  icon?: string | null;
}

export type ConsoleResolvedContribution =
  ConsoleResolvedAdminActionContribution;

/** @deprecated Use ConsoleUiModule from the public module API for new modules. */
export interface ConsoleModule {
  id: string;
  surfaces: readonly ConsoleModuleSurface[];
}

export type ConsoleRouteContribution = ConsoleModuleSurface & {
  moduleId: string;
};

export interface ConsoleNavigationItem {
  path: string;
  label: string;
  localizedLabels?: ConsoleLocalizedLabels;
  moduleId: string;
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

export const consoleLocalizedLabel = (
  item: { label: string; localizedLabels?: ConsoleLocalizedLabels },
  locale: ConsoleLocale
) => item.localizedLabels?.[locale] ?? item.label;

export type ConsoleAdminRecord = Record<string, unknown>;

export interface ConsoleAdminListResponse {
  data: ConsoleAdminRecord[];
  page: {
    limit: number;
    next_cursor: string | null;
  };
}

export interface ConsoleConfigValue {
  desired_value: unknown;
  effective_value: unknown;
  key: string;
  pending_restart: boolean;
  source: string;
  value: unknown;
}

export interface ConsoleConfigValueListResponse {
  data: ConsoleConfigValue[];
}

export interface ConsoleConfigWriteResponse {
  applies_on_restart: boolean;
  key: string;
  service: string;
  updated_at: string;
  updated_by?: string | null;
  value: unknown;
}

export type RuntimeStatus =
  | "pending"
  | "processing"
  | "running"
  | "published"
  | "completed"
  | "failed"
  | "dead";

export interface TimelineItem {
  id: string;
  type: string;
  name: string;
  status: RuntimeStatus;
  attempts: number;
  maxAttempts: number;
  correlationId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
  detailId?: string;
}

export interface ExecutionNode {
  id: string;
  parentId?: string;
  name: string;
  canonicalName?: string;
  service: string;
  kind:
    | "http"
    | "command"
    | "database"
    | "event"
    | "handler"
    | "runtime"
    | "function"
    | "external";
  status: RuntimeStatus;
  startMs: number;
  durationMs: number;
  attributes: Record<string, unknown>;
  events: {
    name: string;
    timestampMs: number;
    attributes?: Record<string, unknown>;
  }[];
  logs: string[];
  context: Record<string, unknown>;
  payload?: Record<string, unknown>;
  retryable?: boolean;
  attempts?: number;
  maxAttempts?: number;
}

export interface ExecutionEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

export interface FederatedStoryGap {
  sourceServiceId: string;
  tenantId?: string;
  kind:
    | "unreachable"
    | "stale"
    | "unauthorized"
    | "truncated"
    | "retention_expired";
  detectedAt: string;
  lastObservedAt: string;
  detail: string;
  nextAction: string;
}

export interface FederatedWorkflowEntity {
  kind:
    | "instance"
    | "step"
    | "attempt"
    | "timer"
    | "child"
    | "compensation"
    | "intervention";
  id: string;
  nodeId: string;
  instanceId: string;
  parentId?: string;
  label: string;
  state: string;
  serviceId: string;
  attempt: number;
  observedAt: string;
}

export interface FederatedReliabilityCheck {
  code: string;
  state: "met" | "breached" | "unknown" | "allowed";
  observed: unknown;
  expected: unknown;
  evidenceReferences: string[];
  issueCode?: string;
  nextActions: string[];
}

export interface FederatedReliabilityEvidence {
  sourceServiceId: string;
  observedAt: string;
  status: "available" | "unavailable" | "not_declared";
  report?: {
    protocol: string;
    serviceId: string;
    contractId: string;
    contractVersion: string;
    profile: "development" | "standard" | "critical";
    overrides: Record<string, unknown>;
    effectiveValues: Record<string, unknown>;
    state: "healthy" | "degraded" | "unavailable";
    activeDegradedModes: {
      dependencyId: string;
      mode: string;
      evidenceReferences: string[];
    }[];
    checks: FederatedReliabilityCheck[];
  };
  detail?: string;
  nextAction?: string;
}

export interface FederatedStoryEvidence {
  protocol: string;
  tenantId?: string;
  assembledAt: string;
  gaps: FederatedStoryGap[];
  workflowEntities: FederatedWorkflowEntity[];
  reliability: FederatedReliabilityEvidence[];
}

export interface RuntimeStory {
  id: string;
  name: string;
  service: string;
  source: string;
  status: RuntimeStatus;
  durationMs: number;
  timestamp: string;
  correlationId: string;
  nodes: ExecutionNode[];
  edges?: ExecutionEdge[];
  timelineItems?: TimelineItem[];
  federation?: FederatedStoryEvidence;
}

export type ExecutionInspectorTab =
  | "overview"
  | "payload"
  | "logs"
  | "events"
  | "operations";

export type StoryViewMode =
  | "story"
  | "graph"
  | "timeline"
  | "waterfall"
  | "flame"
  | "heatmap";

export interface ConsoleModuleMetadata {
  module_name?: string;
  status?: "loaded" | "error";
  console_slots?: ConsoleSlot[];
  console_contributions?: ConsoleContribution[];
}

export interface ConsoleManagedServicePresentation {
  composition?: readonly string[];
  environment?: string;
  identity?: readonly string[];
  nextSafeAction?: readonly string[];
  observed?: string;
  owner?: string;
  posture?: {
    label: string;
    tone: "error" | "muted" | "success" | "warning";
  };
  runtime?: readonly string[];
  secondary?: string;
  version?: string;
}

export interface ConsoleQueryResult<T> {
  data?: T;
  error: Error;
  isError: boolean;
  isLoading: boolean;
  isPending: boolean;
}

export interface ConsoleManagedService {
  authorizationEpoch: number;
  baseUrl: string;
  connectionState: "never_observed" | "ready" | "unavailable" | "incompatible";
  coreDocument?: unknown;
  coreObservedAt?: string | null;
  enrollmentExpiresAtUnixMs: number;
  enrollmentGrantRevision: number;
  enrollmentReceiptDigest: string;
  enrollmentState: "active" | "revoked";
  lastErrorCode?: string | null;
  presentation?: ConsoleManagedServicePresentation;
  serviceId: string;
  servicePrincipal: string;
  version: number;
}

export interface ConsoleContextApi {
  activeStoryTarget: { nodeId?: string; storyId: string } | null;
  clearStoryTarget: () => void;
  openRetry: (target: unknown) => void;
}

export interface ConsoleHostApi {
  version: typeof CONSOLE_HOST_API_VERSION;
  adminData: {
    useInvokeAction: () => {
      error: Error;
      isError: boolean;
      isPending: boolean;
      mutate: (request: {
        actionName: string;
        input: Record<string, unknown>;
        moduleName: string;
      }) => void;
    };
    useRecords: (request: {
      entityName: string;
      limit?: number;
      moduleName: string;
    }) => ConsoleQueryResult<ConsoleAdminListResponse>;
  };
  capabilities: {
    useAvailable: () => readonly string[];
  };
  contributions: {
    useSlot: (
      slotId: string,
      context: Record<string, unknown>
    ) => ConsoleResolvedContribution[];
  };
  config: {
    useValues: () => ConsoleQueryResult<ConsoleConfigValueListResponse>;
    useWriteValue: () => {
      error: Error;
      isError: boolean;
      isPending: boolean;
      mutate: (request: {
        key: string;
        service: string;
        value: unknown;
      }) => void;
    };
  };
  context: {
    useConsole: () => ConsoleContextApi;
    /** @deprecated Use useConsole instead. */
    useRuntimeConsole: () => ConsoleContextApi;
  };
  data: {
    retryTargetForNode: (node: ExecutionNode) => unknown;
    runtimeStories: RuntimeStory[];
  };
  hooks: {
    useBrowserUrlPopState: (handler: (search: URLSearchParams) => void) => void;
    useListKeyboard: <Item>(options: {
      items: Item[];
      onOpen: (item: Item) => void;
      onRetry?: (item: Item) => void;
      selectedIndex: number;
      setSelectedIndex: (index: number) => void;
    }) => void;
    usePersistedLayout: <Layout extends Record<string, number | boolean>>(
      key: string,
      defaults: Layout
    ) => [Layout, (updater: (current: Layout) => Layout) => void, () => void];
    writeBrowserUrl: (path: string, mode: "push" | "replace") => void;
  };
  modules: {
    useMetadata: () => ConsoleQueryResult<{ modules: ConsoleModuleMetadata[] }>;
  };
  queries: {
    useRuntimeStoryDetail: (
      storyCorrelationId: string | null | undefined,
      options?: { enabled?: boolean }
    ) => ConsoleQueryResult<RuntimeStory>;
    useRuntimeStories: (options?: {
      enabled?: boolean;
    }) => ConsoleQueryResult<RuntimeStory[]>;
  };
  routing: {
    buildPath: (path: string, query?: Record<string, unknown>) => string;
  };
  story: {
    executionInspectorTabs: readonly {
      id: ExecutionInspectorTab;
      label: string;
    }[];
    findStoryByCorrelation: (
      stories: RuntimeStory[],
      correlationId: string
    ) => RuntimeStory | null;
  };
  systemRegistry: {
    selectService: (serviceId: string) => void;
    useServices: () => ConsoleQueryResult<ConsoleManagedService[]>;
  };
  ui: ConsoleUiComponents & {
    common: {
      EmptyState: ComponentType<Record<string, unknown>> & {
        Description: ComponentType<Record<string, unknown>>;
        Title: ComponentType<Record<string, unknown>>;
      };
    };
    runtime: {
      ExecutionInspector: ComponentType<Record<string, unknown>>;
      ResizeHandle: ComponentType<Record<string, unknown>>;
      RuntimeStoryVisualization: ComponentType<Record<string, unknown>>;
      ServiceSummaryStrip: ComponentType<Record<string, unknown>>;
      StoryHeader: (props: {
        onClose: () => void;
        onSelectNode: (node: ExecutionNode) => void;
        story: RuntimeStory;
      }) => ReactNode;
      StoryList: ComponentType<Record<string, unknown>>;
      defaultExecutionInspectorTab: (
        node: ExecutionNode
      ) => ExecutionInspectorTab;
    };
  };
}

export const isConsoleSurfaceArea = (
  value: unknown
): value is ConsoleSurfaceArea =>
  value === "runtime" ||
  value === "operations" ||
  value === "data" ||
  value === "configuration";

export const isConsoleSurfaceIcon = (
  value: unknown
): value is ConsoleSurfaceIcon =>
  value === "activity" ||
  value === "blocks" ||
  value === "boxes" ||
  value === "chrome" ||
  value === "database" ||
  value === "git-compare-arrows" ||
  value === "github" ||
  value === "house" ||
  value === "key-round" ||
  value === "network" ||
  value === "rocket" ||
  value === "server-cog" ||
  value === "shield" ||
  value === "settings" ||
  value === "smartphone" ||
  value === "users" ||
  value === "workflow";

export const isConsoleModule = (value: unknown): value is ConsoleModule => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const module = value as Partial<ConsoleModule>;
  if (!(typeof module.id === "string" && module.id && module.surfaces)) {
    return false;
  }
  if (!Array.isArray(module.surfaces) || module.surfaces.length === 0) {
    return false;
  }
  const paths = new Set<string>();
  return module.surfaces.every((surface) => {
    if (
      !surface ||
      typeof surface.path !== "string" ||
      !surface.path.startsWith("/") ||
      paths.has(surface.path) ||
      typeof surface.label !== "string" ||
      !surface.label ||
      !isConsoleSurfaceArea(surface.area) ||
      typeof surface.component !== "function"
    ) {
      return false;
    }
    paths.add(surface.path);
    return surface.icon === undefined || isConsoleSurfaceIcon(surface.icon);
  });
};

export const defineConsoleModule = <Module extends ConsoleModule>(
  module: Module
): Module => {
  if (!isConsoleModule(module)) {
    throw new TypeError(
      "Console module must have a non-empty id and unique, absolute, valid surfaces."
    );
  }
  return module;
};

let configuredHostApi: ConsoleHostApi | null = null;

const hostApiGlobalKey = "__LENSO_CONSOLE_HOST_API__";

const globallyConfiguredHostApi = (): ConsoleHostApi | null => {
  const value = (globalThis as Record<string, unknown>)[hostApiGlobalKey];
  return value && typeof value === "object" ? (value as ConsoleHostApi) : null;
};

/** Register the Shell-owned implementation before loading module entries. */
export const configureConsoleHostApi = (api: ConsoleHostApi): void => {
  configuredHostApi = api;
  (globalThis as Record<string, unknown>)[hostApiGlobalKey] = api;
};

const missingHostApi = (): never => {
  throw new Error("Console host API is only available inside Lenso Console.");
};

/** A stable proxy lets separately loaded ESM modules share the Shell API. */
export const consoleHostApi: ConsoleHostApi = new Proxy(
  {},
  {
    get: (_target, property) => {
      const hostApi = configuredHostApi ?? globallyConfiguredHostApi();
      if (!hostApi) {
        return missingHostApi();
      }
      return Reflect.get(hostApi, property);
    },
  }
) as ConsoleHostApi;
