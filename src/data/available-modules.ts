import { httpClient, isApiMode } from "../lib/http-client";
import {
  type AvailableModulesResponse,
  type AvailableModuleConsolePackagePlanState,
  type AvailableModuleLinkedSourceInstallState,
  type AvailableModuleRelease,
  type AvailableModuleRemoteSourceInstallState,
  type AvailableModuleRow,
  type ServiceModuleLifecycleResponse,
  availableModuleRowsFromResponse,
} from "../pages/available-modules-model";

export const sampleAvailableModulesResponse = {
  catalog: {
    modules: 2,
    registryFile: ".lenso/module-catalog.json",
    version: 1,
  },
  issues: [
    {
      fix: "add baseUrl or use a manifest URL ending with /manifest",
      group: "Catalog",
      message: "local-crm baseUrl is missing",
    },
  ],
  modules: [
    {
      baseUrl: "https://example.com/lenso/module/v1",
      capabilities: ["billing.read", "billing.write"],
      catalogVersion: "0.1.0",
      compatibility: {
        consolePackageApi: "1",
        lenso: {
          minVersion: "0.1.0",
        },
      },
      consolePackageHints: 1,
      hostCompatibility: {
        consolePackageApi: "1",
        lensoVersion: "0.1.0",
      },
      installState: {
        consolePlan: {
          error: null,
          exists: false,
          moduleEntryPresent: false,
          packageCount: 0,
          packages: [],
          planFile: ".lenso/console/extensions/registry.json",
          readable: false,
          restartRequired: null,
        },
        moduleRegistered: false,
        linkedSource: null,
        remoteSource: {
          configured: false,
          desiredBaseUrl: null,
          envFile: ".env",
          error: null,
          restartPending: false,
          restartReason: null,
          runningBaseUrl: null,
        },
      },
      manifestName: "billing",
      manifestReference: "https://example.com/lenso/module/v1/manifest",
      manifestStatus: "ok",
      manifestVersion: "0.1.0",
      name: "billing",
      source: "remote",
      status: "ready",
      summary: "Billing workspace and operations",
    },
    {
      baseUrl: null,
      capabilities: ["crm.contacts.read"],
      catalogVersion: "0.1.0",
      consolePackageHints: 0,
      hostCompatibility: {
        consolePackageApi: "1",
        lensoVersion: "0.1.0",
      },
      installState: {
        consolePlan: {
          error: null,
          exists: false,
          moduleEntryPresent: false,
          packageCount: 0,
          packages: [],
          planFile: ".lenso/console/extensions/registry.json",
          readable: false,
          restartRequired: null,
        },
        moduleRegistered: false,
        linkedSource: null,
        remoteSource: {
          configured: false,
          desiredBaseUrl: null,
          envFile: ".env",
          error: null,
          restartPending: false,
          restartReason: null,
          runningBaseUrl: null,
        },
      },
      manifestName: "local-crm",
      manifestReference: "./lenso.module.json",
      manifestStatus: "ok",
      manifestVersion: "0.1.0",
      name: "local-crm",
      source: "remote",
      status: "needs_attention",
      summary: "Local CRM manifest awaiting runtime base URL",
    },
  ],
  status: "failed",
  version: 1,
} satisfies AvailableModulesResponse;

export const sampleServiceModuleLifecycleResponse = {
  modules: [
    {
      baseUrl: "https://example.com/lenso/module/v1",
      configured: true,
      fixes: [],
      installed: true,
      loaded: true,
      manifestStatus: "reachable",
      manifestUrl: "https://example.com/lenso/module/v1/manifest",
      moduleName: "billing",
      restartPending: false,
      compatibility: {
        declared: {
          consolePackageApi: "1",
          lenso: {
            minVersion: "0.1.0",
          },
        },
        host: {
          consolePackageApi: "1",
          lensoVersion: "0.1.0",
        },
        issue: null,
        fix: null,
        overrideAllowed: false,
        state: "compatible",
      },
      deployment: {
        commands: ["docker compose up billing-api"],
        target: "container-paas",
      },
      serviceStatus: {
        checked: true,
        checks: [{ name: "service", status: "ok" }],
        error: null,
        state: "ready",
      },
      healthHistory: [
        {
          checkedAtUnixMs: 1_771_963_200_000,
          error: null,
          moduleName: "billing",
          state: "ready",
          statusUrl: "https://example.com/lenso/module/v1/status",
        },
      ],
      statusUrl: "https://example.com/lenso/module/v1/status",
      services: [
        {
          autoStart: true,
          lockFile: ".lenso/services/billing.lock",
          name: "billing-api",
          pidFile: ".lenso/services/billing.pid",
          ready: true,
          readyUrl: "https://example.com/lenso/module/v1/ready",
        },
      ],
      status: "ready",
    },
    {
      baseUrl: "http://127.0.0.1:4891/lenso/module/v1",
      configured: true,
      fixes: ["restart API and worker to load the configured service module"],
      installed: true,
      loaded: false,
      manifestStatus: "reachable",
      manifestUrl: "http://127.0.0.1:4891/lenso/module/v1/manifest",
      moduleName: "support-ticket",
      restartPending: true,
      compatibility: {
        declared: {
          consolePackageApi: "1",
        },
        host: {
          consolePackageApi: "1",
          lensoVersion: "0.1.0",
        },
        issue: null,
        fix: null,
        overrideAllowed: false,
        state: "compatible",
      },
      deployment: {
        commands: ["pnpm --dir examples/support-ticket start"],
        target: "container-paas",
      },
      serviceStatus: {
        checked: true,
        checks: [{ name: "service", status: "ok" }],
        error: null,
        state: "ready",
      },
      healthHistory: [
        {
          checkedAtUnixMs: 1_771_963_200_000,
          error: null,
          moduleName: "support-ticket",
          state: "ready",
          statusUrl: "http://127.0.0.1:4891/lenso/module/v1/status",
        },
      ],
      statusUrl: "http://127.0.0.1:4891/lenso/module/v1/status",
      services: [
        {
          autoStart: true,
          lockFile: ".lenso/services/support-ticket.lock",
          name: "support-ticket-api",
          pidFile: ".lenso/services/support-ticket.pid",
          ready: true,
          readyUrl: "http://127.0.0.1:4891/lenso/module/v1/ready",
        },
      ],
      status: "restart_pending",
    },
  ],
  status: "needs_attention",
  version: 1,
} satisfies ServiceModuleLifecycleResponse;

export const availableModulesQueryKey = [
  "modules",
  "available-modules",
] as const;

export const serviceModuleLifecycleQueryKey = [
  "modules",
  "service-module-lifecycle",
] as const;

const marketplaceInstallCommand =
  "lenso module marketplace install <manifest-url>";

export function moduleRefreshInvalidationQueryKeys() {
  return [
    ["modules", "registry"],
    availableModulesQueryKey,
    serviceModuleLifecycleQueryKey,
  ] as const;
}

type AvailableModulesHttpClient = {
  get: (path: string) => {
    json: () => Promise<AvailableModulesResponse>;
  };
};

type ServiceModuleLifecycleHttpClient = {
  get: (path: string) => {
    json: () => Promise<ServiceModuleLifecycleResponse>;
  };
};

export type AvailableModuleInstallResponse = {
  moduleName: string;
  manifestReference: string;
  moduleRelease?: AvailableModuleRelease | null;
  linkedSource?: AvailableModuleLinkedSourceInstallState | null;
  remoteSource?: AvailableModuleRemoteSourceInstallState | null;
  consolePlan: AvailableModuleConsolePackagePlanState;
  restartRequired: boolean;
};

type AvailableModuleInstallHttpClient = {
  post: (
    path: string,
    options: { json: Record<string, never> }
  ) => {
    json: () => Promise<AvailableModuleInstallResponse>;
  };
};

type AvailableModuleUninstallHttpClient = {
  delete: (path: string) => {
    json: () => Promise<AvailableModuleInstallResponse>;
  };
};

export async function fetchAvailableModules({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: AvailableModulesHttpClient;
} = {}): Promise<AvailableModulesResponse> {
  if (apiMode) {
    return client.get("admin/data/available-modules").json();
  }
  return sampleAvailableModulesResponse;
}

export async function fetchServiceModuleLifecycle({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: ServiceModuleLifecycleHttpClient;
} = {}): Promise<ServiceModuleLifecycleResponse> {
  if (apiMode) {
    return client.get("admin/data/service-modules").json();
  }
  return sampleServiceModuleLifecycleResponse;
}

export async function installAvailableModule({
  client = httpClient,
  moduleName,
}: {
  client?: AvailableModuleInstallHttpClient;
  moduleName: string;
}): Promise<AvailableModuleInstallResponse> {
  return client
    .post(
      `admin/data/available-modules/${encodeURIComponent(moduleName)}/install`,
      { json: {} }
    )
    .json();
}

export async function uninstallAvailableModule({
  client = httpClient,
  moduleName,
}: {
  client?: AvailableModuleUninstallHttpClient;
  moduleName: string;
}): Promise<AvailableModuleInstallResponse> {
  return client
    .delete(
      `admin/data/available-modules/${encodeURIComponent(moduleName)}/install`
    )
    .json();
}

export function applyAvailableModuleInstallResponse(
  response: AvailableModulesResponse | undefined,
  installResponse: AvailableModuleInstallResponse
): AvailableModulesResponse | undefined {
  if (!response) {
    return response;
  }
  return {
    ...response,
    modules: response.modules.map((module) =>
      module.name === installResponse.moduleName
        ? {
            ...module,
            installState: {
              consolePlan: installResponse.consolePlan,
              moduleRegistered:
                module.installState?.moduleRegistered ??
                Boolean(
                  installResponse.remoteSource?.runningBaseUrl ??
                  installResponse.linkedSource?.runningEnabled
                ),
              linkedSource: installResponse.linkedSource ?? null,
              remoteSource: installResponse.remoteSource ?? null,
            },
            moduleRelease:
              installResponse.moduleRelease ??
              module.moduleRelease ??
              module.module_release ??
              null,
          }
        : module
    ),
  };
}

export function availableModulesRows(
  response: AvailableModulesResponse = sampleAvailableModulesResponse
) {
  return availableModuleRowsFromResponse(response);
}

export type AvailableModulesPanelState = {
  actionCommand: string;
  detail: string;
  kind: "loading" | "error" | "empty" | "ready";
  label: string;
  message: string;
  moduleCount: number;
  source: string;
};

export function availableModulesPanelState({
  isError,
  isLoading,
  response,
  rows,
}: {
  isError: boolean;
  isLoading: boolean;
  response?: AvailableModulesResponse | null;
  rows: AvailableModuleRow[];
}): AvailableModulesPanelState {
  const source = response?.catalog.registryFile ?? ".lenso/module-catalog.json";
  const firstIssue = response?.issues[0];
  if (isLoading) {
    return {
      actionCommand: marketplaceInstallCommand,
      detail: source,
      moduleCount: 0,
      kind: "loading",
      label: "loading",
      message: "Loading available modules.",
      source,
    };
  }
  if (isError) {
    return {
      actionCommand: marketplaceInstallCommand,
      detail: "check the API and local catalog file",
      moduleCount: 0,
      kind: "error",
      label: "unavailable",
      message: "Available modules could not be loaded.",
      source,
    };
  }
  if (rows.length === 0) {
    return {
      actionCommand: marketplaceInstallCommand,
      detail: "install a manifest URL to show modules here",
      moduleCount: 0,
      kind: "empty",
      label: "no service modules",
      message: `No modules in ${source}.`,
      source,
    };
  }

  return {
    actionCommand: marketplaceInstallCommand,
    detail: firstIssue?.fix ?? "copy a marketplace install command",
    moduleCount: rows.length,
    kind: "ready",
    label: `${rows.length} module${rows.length === 1 ? "" : "s"}`,
    message: `Catalog: ${source}`,
    source,
  };
}
