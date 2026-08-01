import type { ComponentType, FunctionComponent, ReactNode } from "react";

import type { ConsoleLocale } from "./locale.js";
import type { ConsoleUiComponents } from "./ui.js";

export {
  ConsoleLocaleProvider,
  useConsoleLocale,
  type ConsoleLanguagePreference,
  type ConsoleLocale,
  type ConsoleLocaleContextValue,
} from "./locale.js";

export {
  Badge,
  Button,
  ConsolePage,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  Input,
  KeyValueList,
  Panel,
  Section,
  Select,
  SettingsGroup,
  SettingsRow,
  StatusMarker,
  StateView,
  SummaryStrip,
  SplitView,
  Tabs,
  Textarea,
  consoleUi,
  type BadgeProps,
  type ButtonProps,
  type ButtonVariant,
  type ConsoleUiComponents,
  type ControlSize,
  type IconButtonProps,
  type SemanticTone,
  type StatusMarkerProps,
} from "./ui.js";

export const CONSOLE_HOST_API_VERSION = "1" as const;

export type ConsoleSurfaceArea =
  | "runtime"
  | "operations"
  | "data"
  | "configuration";

export type ConsoleSurfaceIcon =
  | "activity"
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

export type ConsolePackageRegistrySource =
  | "first_party"
  | "installed"
  | "runtime_bundle";

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
  | "input"
  | "output"
  | "events"
  | "logs"
  | "errors"
  | "related";

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
  serviceId: string;
  servicePrincipal: string;
  version: number;
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
    useRuntimeConsole: () => {
      activeStoryTarget: { nodeId?: string; storyId: string } | null;
      clearStoryTarget: () => void;
      openRetry: (target: unknown) => void;
    };
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
      options?: {
        enabled?: boolean;
      }
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
    useRevokeEnrollment: () => {
      error: Error | null;
      isError: boolean;
      isPending: boolean;
      mutate: (request: {
        expectedVersion: number;
        reason: string;
        serviceId: string;
      }) => void;
    };
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

const missingHostApi = () => {
  throw new Error("Console host API is only available inside Lenso Console.");
};

export const consoleHostApi: ConsoleHostApi = new Proxy(
  {},
  {
    get: missingHostApi,
  }
) as ConsoleHostApi;

export interface ConsolePackageSurfaceManifest {
  surfaceName: string;
  label: string;
  localizedLabels?: ConsoleLocalizedLabels;
  area: ConsoleSurfaceArea;
  route: string;
  requiredCapabilities: readonly string[];
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

export interface ConsolePackageManifestBase {
  id: string;
  packageName: string;
  exportName: string;
  source: ConsolePackageRegistrySource;
  version?: string;
}

export type ConsolePackageManifest =
  | (ConsolePackageManifestBase & ConsolePackageSurfaceManifest)
  | (ConsolePackageManifestBase & {
      surfaces: readonly ConsolePackageSurfaceManifest[];
    });

export interface ConsoleSurfaceManifest {
  name: string;
  label: string;
  localizedLabels?: ConsoleLocalizedLabels;
  area: ConsoleSurfaceArea;
  route: string;
  package: {
    name: string;
    export: string;
  };
  required_capabilities: readonly string[];
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

export const defineConsolePackageManifest = <
  Manifest extends ConsolePackageManifest,
>(
  manifest: Manifest
): Manifest => manifest;

const packageManifestSurfaces = (
  manifest: ConsolePackageManifest
): readonly ConsolePackageSurfaceManifest[] => {
  if ("surfaces" in manifest) {
    return manifest.surfaces;
  }
  return [manifest];
};

export interface ConsoleExtension<
  Manifest extends ConsolePackageManifest = ConsolePackageManifest,
  Module extends ConsoleModule = ConsoleModule,
> {
  manifest: Manifest;
  module: Module;
}

type ConsoleSurfaceName<Manifest extends ConsolePackageManifest> =
  Manifest extends { surfaces: readonly (infer Surface)[] }
    ? Surface extends ConsolePackageSurfaceManifest
      ? Surface["surfaceName"]
      : never
    : Manifest extends ConsolePackageSurfaceManifest
      ? Manifest["surfaceName"]
      : never;

export type ConsoleSurfaceComponents<Manifest extends ConsolePackageManifest> =
  Readonly<Record<ConsoleSurfaceName<Manifest>, FunctionComponent>>;

export type ConsoleExtensionDefinition<
  Manifest extends ConsolePackageManifest,
  Module extends ConsoleModule = ConsoleModule,
> =
  | {
      components: ConsoleSurfaceComponents<Manifest>;
      manifest: Manifest;
    }
  | {
      manifest: Manifest;
      module: Module;
    };

export const defineConsoleExtension = <
  const Manifest extends ConsolePackageManifest,
  const Module extends ConsoleModule = ConsoleModule,
>(
  definition: ConsoleExtensionDefinition<Manifest, Module>
): ConsoleExtension<Manifest, Module | ConsoleModule> => {
  const { manifest } = definition;
  const module =
    "module" in definition
      ? definition.module
      : defineConsoleModule({
          id: manifest.id,
          surfaces: packageManifestSurfaces(manifest).map((surface) => {
            const component = (
              definition.components as Readonly<
                Record<string, FunctionComponent | undefined>
              >
            )[surface.surfaceName];
            if (!component) {
              throw new TypeError(
                `Console extension has no component for surface ${surface.surfaceName}.`
              );
            }
            const moduleSurface: ConsoleModuleSurface = {
              area: surface.area,
              component,
              label: surface.label,
              path: surface.route,
            };
            if (surface.icon) {
              moduleSurface.icon = surface.icon;
            }
            if (surface.localizedLabels) {
              moduleSurface.localizedLabels = surface.localizedLabels;
            }
            if (surface.navigation) {
              moduleSurface.navigation = surface.navigation;
            }
            return moduleSurface;
          }),
        });
  defineConsoleModule(module);
  if (module.id !== manifest.id) {
    throw new TypeError(
      `Console extension module id ${module.id} does not match manifest id ${manifest.id}.`
    );
  }
  const declaredRoutes = new Set(
    packageManifestSurfaces(manifest).map((surface) => surface.route)
  );
  const implementedRoutes = new Set(
    module.surfaces.map((surface) => surface.path)
  );
  if (
    declaredRoutes.size !== implementedRoutes.size ||
    [...declaredRoutes].some((route) => !implementedRoutes.has(route))
  ) {
    throw new TypeError(
      "Console extension manifest routes must match its module surfaces."
    );
  }
  return { manifest, module };
};

export const consoleSurfacesFromPackageManifest = (
  manifest: ConsolePackageManifest
): ConsoleSurfaceManifest[] =>
  packageManifestSurfaces(manifest).map((packageSurface) => {
    const surface: ConsoleSurfaceManifest = {
      area: packageSurface.area,
      label: packageSurface.label,
      name: packageSurface.surfaceName,
      package: {
        export: manifest.exportName,
        name: manifest.packageName,
      },
      required_capabilities: packageSurface.requiredCapabilities,
      route: packageSurface.route,
    };
    if (packageSurface.icon) {
      surface.icon = packageSurface.icon;
    }
    if (packageSurface.localizedLabels) {
      surface.localizedLabels = packageSurface.localizedLabels;
    }
    if (packageSurface.navigation) {
      surface.navigation = packageSurface.navigation;
    }
    return surface;
  });

export const consoleSurfaceFromPackageManifest = (
  manifest: ConsolePackageManifest
): ConsoleSurfaceManifest => {
  const [surface] = consoleSurfacesFromPackageManifest(manifest);
  if (!surface) {
    throw new Error(
      `Console package manifest declares no surfaces: ${manifest.id}`
    );
  }
  return surface;
};
