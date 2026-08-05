import { httpClient, isApiMode } from "../lib/http-client";
import {
  type AvailableModulesResponse,
  type AvailableModuleRow,
  type LaunchpadChangePlanResponse,
  type LaunchpadDoctorResponse,
  type LaunchpadProofResponse,
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
        consoleModuleApi: "1",
        lenso: {
          minVersion: "0.1.0",
        },
      },
      consoleUiArtifactHints: 1,
      hostCompatibility: {
        consoleModuleApi: "1",
        lensoVersion: "0.1.0",
      },
      installState: {
        moduleRegistered: false,
        linkedSource: null,
        serviceSource: {
          configured: false,
          desiredBaseUrl: null,
          envFile: "target-owned Service Installation Set",
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
      consoleUiArtifactHints: 0,
      hostCompatibility: {
        consoleModuleApi: "1",
        lensoVersion: "0.1.0",
      },
      installState: {
        moduleRegistered: false,
        linkedSource: null,
        serviceSource: {
          configured: false,
          desiredBaseUrl: null,
          envFile: "target-owned Service Installation Set",
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
      source: "service",
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
          consoleModuleApi: "1",
          lenso: {
            minVersion: "0.1.0",
          },
        },
        host: {
          consoleModuleApi: "1",
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
          consoleModuleApi: "1",
        },
        host: {
          consoleModuleApi: "1",
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
  compatibilityResults: [],
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
  nodes: [],
  protocolVersion: "lenso.system.v1",
  relationships: [],
  semanticKind: "provider_system",
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
      label: "Open Lenso Console Launchpad",
      nextCommand: "open http://127.0.0.1:3000/launchpad",
      status: "pending",
    },
  ],
  addons: [
    {
      label: "Support SLA",
      modules: ["support-sla"],
      name: "support-sla",
      services: ["support-sla"],
      status: "configured",
    },
  ],
  supportedAddons: ["support-sla", "customer-profile", "notifications"],
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

export const sampleLaunchpadDoctorResponse = {
  checkedAtUnixMs: 1_782_903_144_460,
  checks: [
    {
      command: null,
      id: "env",
      label: ".env file",
      message: ".env exists",
      status: "passed",
    },
    {
      command: null,
      id: "lenso-workspace-json",
      label: "Service workspace",
      message: "lenso.workspace.json parses",
      status: "passed",
    },
    {
      command: "lenso dev up",
      id: "service-ready-support-sla",
      label: "support-sla ready endpoint",
      message: "support-sla is not running on port 4150",
      status: "needs_attention",
    },
  ],
  doctorFile: ".lenso/dev-doctor.json",
  live: true,
  nextCommand: "lenso dev up",
  status: "needs_attention",
  version: 1,
} satisfies LaunchpadDoctorResponse;

export const sampleLaunchpadProofResponse = {
  addons: ["support-sla"],
  blueprint: "support-desk",
  checkedAtUnixMs: 1_782_903_155_000,
  checks: [
    {
      command: null,
      id: "launchpad-state",
      label: "Launchpad state",
      message: ".lenso/launchpad.json matches support-desk",
      status: "passed",
    },
    {
      command: null,
      id: "workspace-services",
      label: "Workspace services",
      message: "lenso.workspace.json includes generated services",
      status: "passed",
    },
  ],
  drifts: [],
  nextCommand: null,
  projectName: "support-desk",
  proofFile: ".lenso/app-proof.json",
  status: "ready",
  version: 1,
} satisfies LaunchpadProofResponse;

export const sampleLaunchpadChangePlanResponse = {
  addons: ["support-sla"],
  blocked: [],
  blueprint: "support-desk",
  changes: [
    {
      action: "restore-workspace-service",
      command: "lenso app apply .lenso/app-change-plan.json",
      id: "workspace-service-support-sla",
      kind: "workspace-service",
      message: "support-sla is missing from lenso.workspace.json",
      name: "support-sla",
      safe: true,
    },
  ],
  composition: {
    agentActions: [
      {
        command:
          'lenso agent task --from-app-plan "add customer profile lookup"',
        id: "agent:task:from-app-plan",
        kind: "agent_task",
        label: "Generate agent task pack from the app plan",
        status: "recommended",
      },
    ],
    appliedAddons: ["support-sla"],
    appliedPacks: [],
    capabilityPacks: [
      {
        modules: ["support-sla"],
        name: "support-sla",
        nextCommand: "lenso capability check ../capabilities/support-sla",
        path: "../capabilities/support-sla",
        services: ["support-sla-provider/api"],
        status: "pending",
      },
    ],
    packFit: [
      {
        command: "lenso app compose --pack support-sla",
        issues: [],
        name: "support-sla",
        path: "../capabilities/support-sla",
        status: "ready",
      },
    ],
    intent: "support desk with SLA and customer profile",
    pendingAddons: ["customer-profile"],
    pendingPacks: ["support-sla"],
    protocol: "lenso.app-composition.v1",
    requestedAddons: ["support-sla", "customer-profile"],
    requestedPacks: ["support-sla"],
    serviceActions: [
      {
        command: "lenso service workspace check customer-profile",
        id: "service:check:customer-profile",
        kind: "service_check",
        label: "Check customer-profile service readiness",
        status: "recommended",
      },
    ],
  },
  generatedAtUnixMs: 1_782_903_160_000,
  issues: [],
  nextCommand: "lenso app apply .lenso/app-change-plan.json",
  planFile: ".lenso/app-change-plan.json",
  projectName: "support-desk",
  proofStatus: "drifted",
  status: "changes",
  version: 1,
} satisfies LaunchpadChangePlanResponse;

export const availableModulesQueryKey = [
  "modules",
  "available-modules",
] as const;
export const launchpadQueryKey = ["launchpad"] as const;
export const launchpadDoctorQueryKey = ["launchpad", "doctor"] as const;
export const launchpadProofQueryKey = ["launchpad", "proof"] as const;
export const launchpadChangePlanQueryKey = [
  "launchpad",
  "change-plan",
] as const;

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

const marketplaceInstallCommand = "Use Marketplace to install a module";

export function moduleRefreshInvalidationQueryKeys() {
  return [
    ["modules", "registry"],
    availableModulesQueryKey,
    launchpadQueryKey,
    launchpadDoctorQueryKey,
    launchpadProofQueryKey,
    launchpadChangePlanQueryKey,
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

type LaunchpadDoctorHttpClient = {
  get: (path: string) => {
    json: () => Promise<LaunchpadDoctorResponse>;
  };
};

type LaunchpadProofHttpClient = {
  get: (path: string) => {
    json: () => Promise<LaunchpadProofResponse>;
  };
};

type LaunchpadChangePlanHttpClient = {
  get: (path: string) => {
    json: () => Promise<LaunchpadChangePlanResponse>;
  };
};

type ModuleRootChange =
  | {
      kind: "install";
      selection: {
        module_id: string;
        version_requirement: string;
        optional_requirements: string[];
      };
    }
  | { kind: "uninstall"; module_id: string };

type ModuleApprovalBoundary = {
  boundary_id: string;
};

type ModuleChangePlan = {
  approval_boundaries?: ModuleApprovalBoundary[];
  [key: string]: unknown;
};

export type ModuleManagementOperation = {
  operation_id: string;
  revision: number;
  state: string;
  next_actions?: string[];
};

type ModuleManagementHttpClient = {
  post: (
    path: string,
    options?: { json: unknown }
  ) => {
    json: () => Promise<unknown>;
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

export async function fetchLaunchpadDoctor({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: LaunchpadDoctorHttpClient;
} = {}): Promise<LaunchpadDoctorResponse> {
  if (apiMode) {
    return client.get("admin/data/launchpad/doctor").json();
  }
  return sampleLaunchpadDoctorResponse;
}

export async function fetchLaunchpadProof({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: LaunchpadProofHttpClient;
} = {}): Promise<LaunchpadProofResponse> {
  if (apiMode) {
    return client.get("admin/data/launchpad/proof").json();
  }
  return sampleLaunchpadProofResponse;
}

export async function fetchLaunchpadChangePlan({
  apiMode = isApiMode(),
  client = httpClient,
}: {
  apiMode?: boolean;
  client?: LaunchpadChangePlanHttpClient;
} = {}): Promise<LaunchpadChangePlanResponse> {
  if (apiMode) {
    return client.get("admin/data/launchpad/change-plan").json();
  }
  return sampleLaunchpadChangePlanResponse;
}

export async function installAvailableModule({
  client = httpClient,
  moduleName,
}: {
  client?: ModuleManagementHttpClient;
  moduleName: string;
}): Promise<ModuleManagementOperation> {
  return runAvailableModuleChange({
    client,
    change: {
      kind: "install",
      selection: {
        module_id: moduleName,
        version_requirement: "*",
        optional_requirements: [],
      },
    },
  });
}

export async function uninstallAvailableModule({
  client = httpClient,
  moduleName,
}: {
  client?: ModuleManagementHttpClient;
  moduleName: string;
}): Promise<ModuleManagementOperation> {
  return runAvailableModuleChange({
    client,
    change: { kind: "uninstall", module_id: moduleName },
  });
}

async function runAvailableModuleChange({
  client,
  change,
}: {
  client: ModuleManagementHttpClient;
  change: ModuleRootChange;
}): Promise<ModuleManagementOperation> {
  const plan = (await client
    .post("admin/modules/plans/preview", { json: change })
    .json()) as ModuleChangePlan;
  let operation = (await client
    .post("admin/modules/operations", {
      json: { idempotency_key: operationKey(), plan },
    })
    .json()) as ModuleManagementOperation;

  for (const boundary of plan.approval_boundaries ?? []) {
    if (operation.state !== "awaiting_approval") {
      break;
    }
    operation = (await client
      .post(`admin/modules/operations/${operation.operation_id}/approvals`, {
        json: {
          expected_revision: operation.revision,
          boundary_id: boundary.boundary_id,
          reason: "Approved in Console",
          nonce: operationKey(),
        },
      })
      .json()) as ModuleManagementOperation;
  }

  if (operation.state !== "ready") {
    throw new Error(
      `Module operation ${operation.operation_id} is ${operation.state}; ${operation.next_actions?.join(", ") ?? "review the operation"}`
    );
  }

  return (await client
    .post(`admin/modules/operations/${operation.operation_id}/apply`)
    .json()) as ModuleManagementOperation;
}

function operationKey(): string {
  return globalThis.crypto.randomUUID();
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
