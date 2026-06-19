import type { ComponentType, ReactNode } from "react";

export type ConsoleSurfaceArea =
  | "runtime"
  | "operations"
  | "data"
  | "configuration";

export type ConsoleSurfaceIcon =
  | "activity"
  | "boxes"
  | "database"
  | "key-round"
  | "network"
  | "shield"
  | "settings"
  | "users"
  | "workflow";

export interface ConsoleWorkspaceRef {
  id: string;
  label: string;
  icon?: string;
}

export interface ConsoleNavigationGroup {
  id: string;
  label: string;
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
  area: ConsoleSurfaceArea;
  component: () => ReactNode;
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

export interface ConsoleModule {
  id: string;
  surfaces: ConsoleModuleSurface[];
}

export type ConsoleRouteContribution = ConsoleModuleSurface & {
  moduleId: string;
};

export interface ConsoleNavigationItem {
  path: string;
  label: string;
  moduleId: string;
  icon?: ConsoleSurfaceIcon;
  navigation?: ConsoleNavigationMetadata;
}

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
}

export type ExecutionInspectorTab =
  | "overview"
  | "payload"
  | "activity"
  | "failures"
  | "logs"
  | "context"
  | "technical";

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
}

export interface ConsoleQueryResult<T> {
  data?: T;
  error: Error;
  isError: boolean;
  isLoading: boolean;
  isPending: boolean;
}

export interface RuntimeConsoleHostApi {
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
  ui: {
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

export const defineConsoleModule = <Module extends ConsoleModule>(
  module: Module
): Module => module;

const missingHostApi = () => {
  throw new Error("Runtime Console host API is only available inside Lenso.");
};

export const runtimeConsoleHostApi: RuntimeConsoleHostApi = new Proxy(
  {},
  {
    get: missingHostApi,
  }
) as RuntimeConsoleHostApi;

export interface ConsolePackageSurfaceManifest {
  surfaceName: string;
  label: string;
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
