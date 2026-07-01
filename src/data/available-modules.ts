import { httpClient, isApiMode } from "../lib/http-client";
import {
  type AvailableModulesResponse,
  type AvailableModuleConsolePackagePlanState,
  type AvailableModuleLinkedSourceInstallState,
  type AvailableModuleRelease,
  type AvailableModuleRemoteSourceInstallState,
  type AvailableModuleRow,
  type LaunchpadResponse,
  type ServiceModuleLifecycleResponse,
  type ServiceSystemDriftResponse,
  type ServiceSystemRunbooksResponse,
  type ServiceSystemReleaseTrainResponse,
  type ServiceSystemResponse,
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
      moduleRelease: {
        manifestReference:
          "https://example.com/lenso/releases/billing/lenso.module-release.json",
        name: "billing",
        providerName: "billing-service",
        serviceManifest: "https://example.com/lenso/service/v1/manifest",
        source: "service",
        version: "0.1.0",
      },
      name: "billing",
      source: "service",
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
      latestRelease: {
        appliedAtUnixMs: 1_771_963_200_000,
        candidateManifestReference:
          "https://example.com/billing/lenso.service.json",
        candidatePackageReference:
          "https://example.com/billing/lenso.service-package.json",
        candidateVersion: "0.3.0",
        currentManifestReference:
          "https://example.com/billing/previous/lenso.service.json",
        currentVersion: "0.2.0",
        id: "rel_billing_003",
        risk: "safe",
        rollbackTarget:
          "https://example.com/billing/previous/lenso.service.json",
        serviceName: "billing-provider",
      },
      releaseHistory: [
        {
          appliedAtUnixMs: 1_771_963_200_000,
          candidateManifestReference:
            "https://example.com/billing/lenso.service.json",
          candidatePackageReference:
            "https://example.com/billing/lenso.service-package.json",
          candidateVersion: "0.3.0",
          currentManifestReference:
            "https://example.com/billing/previous/lenso.service.json",
          currentVersion: "0.2.0",
          id: "rel_billing_003",
          risk: "safe",
          rollbackTarget:
            "https://example.com/billing/previous/lenso.service.json",
          serviceName: "billing-provider",
        },
      ],
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

export const sampleServiceSystemResponse = {
  dependencies: [
    {
      capability: "billing.invoice.read",
      from: "support",
      state: "resolved",
      to: "billing",
    },
  ],
  environments: ["local", "staging", "prod"],
  issues: [],
  modules: [
    {
      capabilities: ["support.ticket.read"],
      dependencies: ["billing.invoice.read"],
      name: "support-ticket",
      owner: "support",
    },
    {
      capabilities: ["billing.invoice.read"],
      dependencies: [],
      name: "invoice",
      owner: "billing",
    },
  ],
  name: "support-platform",
  services: [
    {
      modules: ["support-ticket"],
      name: "support",
      target: "local",
    },
    {
      modules: ["invoice"],
      name: "billing",
      target: "kubernetes",
    },
  ],
  status: "ready",
  systemFile: "lenso.system.json",
  version: 1,
} satisfies ServiceSystemResponse;

export const sampleServiceSystemDriftResponse = {
  commands: ["lenso system apply"],
  drifts: [
    {
      code: "service_env_missing",
      command: "lenso system apply",
      message: "Service `billing` has no `prod` environment state.",
      name: "billing/prod",
      resource: "environment",
      severity: "warning",
    },
  ],
  graphIssues: [],
  status: "drifted",
  systemFile: "lenso.system.json",
  version: 1,
} satisfies ServiceSystemDriftResponse;

export const sampleServiceSystemReleaseTrainResponse = {
  commands: [
    "lenso system release history",
    "lenso system release promote --from staging --to prod --output system-release-prod.json",
  ],
  releases: [
    {
      appliedAtUnixMs: 1_772_300_000_000,
      environment: "staging",
      id: "sysrel_staging_001",
      kind: "release",
      modules: 5,
      policyRisk: "safe",
      rollbackAvailable: true,
      services: 2,
      status: "ready",
      systemName: "support-platform",
    },
  ],
  status: "ready",
  version: 1,
} satisfies ServiceSystemReleaseTrainResponse;

export const sampleServiceSystemRunbooksResponse = {
  commands: ["lenso system runbook history", "lenso system runbook doctor"],
  runbooks: [
    {
      active: true,
      currentStep: "Check system release",
      environment: "staging",
      id: "sysrun_staging_001",
      recordedAtUnixMs: 1_772_300_000_000,
      releaseId: "sysrel_staging_001",
      status: "ready",
      steps: 4,
      systemName: "support-platform",
    },
  ],
  status: "ready",
  version: 1,
} satisfies ServiceSystemRunbooksResponse;

export const sampleLaunchpadResponse = {
  blueprint: "support-desk",
  checklist: [
    {
      id: "app-created",
      label: "Host application scaffolded",
      nextCommand: null,
      status: "done",
    },
    {
      id: "services-created",
      label: "TypeScript and Rust services scaffolded",
      nextCommand: null,
      status: "done",
    },
    {
      id: "env-prepared",
      label: "Local environment file prepared",
      nextCommand: null,
      status: "done",
    },
    {
      id: "dev-up",
      label: "Run services and host locally",
      nextCommand: "lenso dev up",
      status: "next",
    },
    {
      id: "console-open",
      label: "Open Runtime Console Launchpad",
      nextCommand: "open http://127.0.0.1:3000/launchpad",
      status: "pending",
    },
  ],
  commands: [
    "lenso dev up",
    "lenso dev status",
    "lenso agent context",
    "http://127.0.0.1:3000/launchpad",
  ],
  issues: [],
  launchpadFile: ".lenso/launchpad.json",
  modules: [
    {
      capability: "support.tickets",
      name: "support-api",
      ownerService: "support-api",
    },
    {
      capability: "support.notifications",
      name: "notification-worker",
      ownerService: "notification-worker",
    },
  ],
  nextCommand: "lenso dev up",
  projectName: "support-desk",
  services: [
    {
      command: "pnpm start",
      cwd: "services/support-api",
      language: "ts",
      modules: ["support-api"],
      name: "support-api",
      readyUrl: "http://127.0.0.1:4110/lenso/service/v1/status",
      role: "ticket intake and admin HTTP actions",
    },
    {
      command: "cargo run",
      cwd: "services/notification-worker",
      language: "rust",
      modules: ["notification-worker"],
      name: "notification-worker",
      readyUrl: "http://127.0.0.1:4120/lenso/service/v1/status",
      role: "notification and background service functions",
    },
  ],
  status: "ready",
  summary:
    "Support desk app with one TypeScript API service and one Rust worker service.",
  version: 1,
} satisfies LaunchpadResponse;

export const availableModulesQueryKey = [
  "modules",
  "available-modules",
] as const;
export const launchpadQueryKey = ["launchpad"] as const;

export const serviceModuleLifecycleQueryKey = [
  "modules",
  "service-module-lifecycle",
] as const;

export const serviceSystemQueryKey = ["modules", "service-system"] as const;
export const serviceSystemDriftQueryKey = [
  "modules",
  "service-system-drift",
] as const;
export const serviceSystemReleaseTrainQueryKey = [
  "modules",
  "service-system-release-train",
] as const;
export const serviceSystemRunbooksQueryKey = [
  "modules",
  "service-system-runbooks",
] as const;

const marketplaceInstallCommand =
  "lenso module marketplace install <manifest-url>";

export function moduleRefreshInvalidationQueryKeys() {
  return [
    ["modules", "registry"],
    availableModulesQueryKey,
    launchpadQueryKey,
    serviceModuleLifecycleQueryKey,
    serviceSystemQueryKey,
    serviceSystemDriftQueryKey,
    serviceSystemReleaseTrainQueryKey,
    serviceSystemRunbooksQueryKey,
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

type ServiceSystemHttpClient = {
  get: (path: string) => {
    json: () => Promise<ServiceSystemResponse>;
  };
};

type ServiceSystemDriftHttpClient = {
  get: (path: string) => {
    json: () => Promise<ServiceSystemDriftResponse>;
  };
};

type ServiceSystemReleaseTrainHttpClient = {
  get: (path: string) => {
    json: () => Promise<ServiceSystemReleaseTrainResponse>;
  };
};

type ServiceSystemRunbooksHttpClient = {
  get: (path: string) => {
    json: () => Promise<ServiceSystemRunbooksResponse>;
  };
};

type LaunchpadHttpClient = {
  get: (path: string) => {
    json: () => Promise<LaunchpadResponse>;
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

export async function fetchServiceSystem({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: ServiceSystemHttpClient;
} = {}): Promise<ServiceSystemResponse> {
  if (apiMode) {
    return client.get("admin/data/service-system").json();
  }
  return sampleServiceSystemResponse;
}

export async function fetchServiceSystemDrift({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: ServiceSystemDriftHttpClient;
} = {}): Promise<ServiceSystemDriftResponse> {
  if (apiMode) {
    return client.get("admin/data/service-system/drift").json();
  }
  return sampleServiceSystemDriftResponse;
}

export async function fetchServiceSystemReleaseTrain({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: ServiceSystemReleaseTrainHttpClient;
} = {}): Promise<ServiceSystemReleaseTrainResponse> {
  if (apiMode) {
    return client.get("admin/data/service-system/release-train").json();
  }
  return sampleServiceSystemReleaseTrainResponse;
}

export async function fetchServiceSystemRunbooks({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: ServiceSystemRunbooksHttpClient;
} = {}): Promise<ServiceSystemRunbooksResponse> {
  if (apiMode) {
    return client.get("admin/data/service-system/runbooks").json();
  }
  return sampleServiceSystemRunbooksResponse;
}

export async function fetchLaunchpad({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: LaunchpadHttpClient;
} = {}): Promise<LaunchpadResponse> {
  if (apiMode) {
    return client.get("admin/data/launchpad").json();
  }
  return sampleLaunchpadResponse;
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
