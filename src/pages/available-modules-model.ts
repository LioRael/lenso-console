export type AvailableModulesCatalog = {
  version: number;
  modules: AvailableModulesEntry[];
};

export type AvailableModulesEntry = {
  name: string;
  version: string;
  source: "remote" | string;
  manifestReference: string;
  archivedAt?: string;
  archiveReason?: string;
  baseUrl?: string;
  capabilities?: string[];
  consolePackages?: AvailableModuleConsolePackageHint[];
  compatibility?: AvailableModuleCompatibility;
  summary?: string;
};

export type AvailableModuleConsolePackageHint = {
  packageName: string;
  exportName: string;
  route?: string;
};

export type AvailableModuleManifestSnapshot = {
  name: string;
  version: string;
  source: "remote" | string;
  consolePackages?: AvailableModuleConsolePackageHint[];
};

export type AvailableModulesResponse = {
  version: number;
  status: "passed" | "failed" | string;
  catalog: {
    modules: number;
    registryFile: string;
    version: number;
  };
  issues: AvailableModulesIssue[];
  modules: AvailableModulesResponseModule[];
};

export type AvailableModulesIssue = {
  group: string;
  message: string;
  fix?: string;
};

export type AvailableModuleCompatibility = {
  consolePackageApi?: string;
  lenso?: {
    maxVersion?: string;
    minVersion?: string;
  };
};

export type AvailableModuleHostCompatibility = {
  consolePackageApi: string;
  lensoVersion: string;
};

export type AvailableModulesResponseModule = {
  name: string;
  source: "remote" | string;
  catalogVersion: string;
  manifestReference: string;
  providedBy?: string | null;
  provided_by?: string | null;
  serviceManifest?: string | null;
  service_manifest?: string | null;
  moduleRelease?: AvailableModuleRelease | null;
  module_release?: AvailableModuleRelease | null;
  summary?: string | null;
  archivedAt?: string;
  archiveReason?: string;
  baseUrl: string | null;
  capabilities?: string[];
  consolePackageHints: number;
  compatibility?: AvailableModuleCompatibility | null;
  hostCompatibility?: AvailableModuleHostCompatibility;
  installState?: AvailableModuleInstallState;
  manifestName: string | null;
  manifestStatus: "ok" | "invalid" | "unreadable" | "archived" | string;
  manifestVersion: string | null;
  status: "ready" | "needs_attention" | "archived" | string;
};

export type AvailableModuleRelease = {
  manifestReference: string;
  name?: string | null;
  version?: string | null;
  source?: string | null;
  providerName?: string | null;
  servicePackage?: string | null;
  serviceManifest?: string | null;
};

export type ServiceModuleLifecycleResponse = {
  version: number;
  status: "ready" | "needs_attention" | "empty" | string;
  modules: ServiceModuleLifecycleModule[];
};

export type ServiceSystemResponse = {
  version: number;
  status: "ready" | "needs_attention" | "empty" | string;
  systemFile: string;
  name?: string | null;
  environments: string[];
  services: ServiceSystemService[];
  modules: ServiceSystemModule[];
  dependencies: ServiceSystemDependency[];
  issues: ServiceSystemIssue[];
};

export type ServiceSystemService = {
  name: string;
  target: string;
  modules: string[];
};

export type ServiceSystemModule = {
  name: string;
  owner: string;
  capabilities: string[];
  dependencies: string[];
};

export type ServiceSystemDependency = {
  from: string;
  capability: string;
  state: string;
  to?: string | null;
};

export type ServiceSystemIssue = {
  code: string;
  message: string;
};

export type ServiceSystemDriftResponse = {
  version: number;
  status: "ready" | "drifted" | "needs_attention" | "empty" | string;
  systemFile: string;
  graphIssues: ServiceSystemIssue[];
  drifts: ServiceSystemDrift[];
  commands: string[];
};

export type ServiceSystemDrift = {
  code: string;
  severity: "info" | "warning" | "error" | string;
  resource: string;
  name: string;
  message: string;
  command?: string | null;
};

export type ServiceSystemReleaseTrainResponse = {
  version: number;
  status: "ready" | "needs_attention" | "empty" | string;
  releases: ServiceSystemReleaseRecord[];
  commands: string[];
};

export type ServiceSystemReleaseRecord = {
  id: string;
  kind: string;
  systemName: string;
  environment: string;
  status: string;
  policyRisk: string;
  appliedAtUnixMs?: number | null;
  services: number;
  modules: number;
  rollbackAvailable: boolean;
};

export type ServiceSystemRunbooksResponse = {
  version: number;
  status: "ready" | "needs_attention" | "empty" | string;
  runbooks: ServiceSystemRunbookRecord[];
  commands: string[];
};

export type ServiceSystemRunbookRecord = {
  id: string;
  releaseId: string;
  systemName: string;
  environment: string;
  status: string;
  active: boolean;
  recordedAtUnixMs?: number | null;
  steps: number;
  currentStep?: string | null;
};

export type ServiceModuleLifecycleModuleStatus =
  | "ready"
  | "missing_config"
  | "restart_pending"
  | "configured_not_loaded"
  | "manifest_unreachable"
  | "service_not_ready"
  | "stale_state"
  | "not_configured"
  | string;

export type ServiceModuleManifestStatus =
  | "reachable"
  | "unreachable"
  | "skipped"
  | "not_configured"
  | string;

export type ServiceModuleLifecycleService = {
  name: string;
  readyUrl: string;
  ready: boolean;
  autoStart: boolean;
  lockFile?: string | null;
  pidFile?: string | null;
};

export type ServiceModuleServiceStatusState =
  | "ready"
  | "degraded"
  | "starting"
  | "unreachable"
  | "unknown"
  | string;

export type ServiceModuleServiceStatus = {
  checked: boolean;
  state: ServiceModuleServiceStatusState;
  error?: string | null;
  checks: {
    name: string;
    status: string;
    detail?: string | null;
  }[];
};

export type ServiceModuleCompatibility = {
  state: "compatible" | "blocked" | "unknown" | string;
  declared?: AvailableModuleCompatibility | null;
  host?: AvailableModuleHostCompatibility;
  issue?: string | null;
  fix?: string | null;
  overrideAllowed: boolean;
};

export type ServiceModuleDeployment = {
  target?: string | null;
  commands?: string[];
  composeService?: string | null;
};

export type ServiceOperationKind =
  | "http_route"
  | "runtime_function"
  | "event_handler"
  | "admin_action"
  | string;

export type ServiceOperationLinks = {
  remoteCalls?: string | null;
  runtime?: string | null;
  story: string;
  technicalOperations: string;
};

export type ServiceOperation = {
  operationId: string;
  providerName?: string | null;
  moduleName: string;
  kind: ServiceOperationKind;
  name: string;
  method?: string | null;
  path?: string | null;
  capability?: string | null;
  summary?: string | null;
  safeProbe: boolean;
  links: ServiceOperationLinks;
  nextAction: string;
};

export type ServiceModuleHealthCheck = {
  moduleName: string;
  checkedAtUnixMs: number;
  statusUrl: string;
  state: string;
  error?: string | null;
};

export type ServiceReleaseRecord = {
  id?: string | null;
  serviceName: string;
  environment?: string | null;
  target?: string | null;
  appliedAtUnixMs?: number | null;
  risk: "safe" | "needs_attention" | "breaking" | "blocked" | string;
  currentVersion?: string | null;
  candidateVersion?: string | null;
  currentManifestReference?: string | null;
  candidateManifestReference?: string | null;
  candidatePackageReference?: string | null;
  rollbackTarget?: string | null;
};

export type ServiceEnvironment = {
  name: string;
  serviceName: string;
  target: string;
  namespace?: string | null;
  kubeContext?: string | null;
  image?: string | null;
  publicBaseUrl?: string | null;
  manifestReference?: string | null;
  releaseTrack?: string | null;
};

export type ServiceDeploymentObservation = {
  serviceName: string;
  environment: string;
  target: string;
  observedAtUnixMs?: number | null;
  state: string;
  drift: string;
  operator?: {
    resource?: string | null;
    namespace?: string | null;
    observedGeneration?: number | null;
    conditions?: Array<{
      type?: string | null;
      status?: string | null;
      reason?: string | null;
      message?: string | null;
      lastTransitionTime?: string | null;
    }>;
  } | null;
  cluster?: {
    namespace?: string | null;
    deployment?: string | null;
    readyReplicas?: number | null;
    desiredReplicas?: number | null;
    availableReplicas?: number | null;
    image?: string | null;
    releaseId?: string | null;
    manifestReference?: string | null;
    serviceEndpoint?: string | null;
    ingressHost?: string | null;
  } | null;
  host?: {
    releaseId?: string | null;
    candidateVersion?: string | null;
  } | null;
  checks?: Array<{
    name: string;
    status: string;
    detail?: string | null;
  }>;
  nextAction?: string | null;
};

export type ServiceModuleConfig = {
  envFile: string;
  requiredEnv: string[];
  configuredEnv: string[];
  missingEnv: string[];
};

export type ServiceModuleLifecycleModule = {
  moduleName: string;
  providerName?: string | null;
  status: ServiceModuleLifecycleModuleStatus;
  installed: boolean;
  configured: boolean;
  loaded: boolean;
  restartPending: boolean;
  baseUrl?: string | null;
  manifestUrl?: string | null;
  manifestStatus: ServiceModuleManifestStatus;
  statusUrl?: string | null;
  serviceStatus?: ServiceModuleServiceStatus;
  healthHistory?: ServiceModuleHealthCheck[];
  compatibility?: ServiceModuleCompatibility;
  config?: ServiceModuleConfig;
  deployment?: ServiceModuleDeployment | null;
  environments?: ServiceEnvironment[];
  deployments?: ServiceDeploymentObservation[];
  deploymentHistory?: ServiceDeploymentObservation[];
  deploymentDrift?: string | null;
  deploymentNextAction?: string | null;
  services: ServiceModuleLifecycleService[];
  operations?: ServiceOperation[];
  moduleRelease?: AvailableModuleRelease | null;
  latestRelease?: ServiceReleaseRecord | null;
  releaseHistory?: ServiceReleaseRecord[];
  fixes: string[];
};

export type AvailableModuleInstallState = {
  moduleRegistered: boolean;
  linkedSource?: AvailableModuleLinkedSourceInstallState | null;
  remoteSource?: AvailableModuleRemoteSourceInstallState | null;
  consolePlan: AvailableModuleConsolePackagePlanState;
};

export type AvailableModuleLinkedSourceInstallState = {
  envFile: string;
  configured: boolean;
  desiredEnabled?: boolean | null;
  runningEnabled: boolean;
  restartPending: boolean;
  restartReason?: string | null;
  error?: string | null;
};

export type AvailableModuleRemoteSourceInstallState = {
  envFile: string;
  configured: boolean;
  desiredBaseUrl?: string | null;
  runningBaseUrl?: string | null;
  restartPending: boolean;
  restartReason?: string | null;
  error?: string | null;
};

export type AvailableModuleConsolePackagePlanState = {
  planFile: string;
  exists: boolean;
  readable: boolean;
  error?: string | null;
  moduleEntryPresent: boolean;
  packageCount: number;
  restartRequired?: boolean | null;
  packages: AvailableModuleConsolePackagePlanPackage[];
};

export type AvailableModuleConsolePackagePlanPackage = {
  key?: string | null;
  packageName: string;
  exportName: string;
  command?: string | null;
  route?: string | null;
  status?: string | null;
};

export type AvailableModulePreflightStatus =
  | "unknown"
  | "archived"
  | "ready"
  | "compatibility_blocked"
  | "needs_base_url"
  | "manifest_mismatch"
  | "package_hint_mismatch";

export type AvailableModuleRow = {
  key: string;
  name: string;
  version: string;
  source: string;
  manifestReference: string;
  providerName?: string | null;
  serviceManifest?: string | null;
  moduleRelease?: AvailableModuleRelease | null;
  baseUrl: string;
  capabilityCount: number;
  consolePackageHintCount: number;
  installState?: AvailableModuleInstallState;
  preflightStatus: AvailableModulePreflightStatus;
  preflightLabel: string;
  preflightFix?: string;
  preflightReason: string;
  summary: string;
};

export type AvailableModuleHandoffState =
  | {
      kind: "available";
      label: "available";
      action: "install";
      detail: string;
      moduleName: string;
      command: string;
      path?: undefined;
    }
  | {
      kind: "blocked";
      label: string;
      action: "resolve";
      detail: string;
      fix?: string;
      moduleName: string;
      command?: undefined;
      path?: undefined;
    }
  | {
      kind: "installed";
      label: "installed";
      action: "open";
      detail: string;
      moduleName: string;
      command?: undefined;
      path: string;
    }
  | {
      kind: "package_install_needed";
      label: "extension reload needed";
      action: "install_package";
      detail: string;
      moduleName: string;
      command?: undefined;
      path: string;
    }
  | {
      kind: "restart_pending";
      label: "restart pending";
      action: "restart";
      detail: string;
      moduleName: string;
      command?: undefined;
      path: string;
    };

export type AvailableModuleInstallCommand = {
  key: string;
  label: string;
  command: string;
};

export type AvailableModuleInstallStepStatus =
  | "blocked"
  | "current"
  | "done"
  | "pending"
  | "skipped";

export type AvailableModuleInstallStepKey =
  | "add"
  | "apply-plan"
  | "install-packages"
  | "restart"
  | "open";

export type AvailableModuleInstallStep = {
  key: AvailableModuleInstallStepKey;
  label: string;
  status: AvailableModuleInstallStepStatus;
  detail: string;
  command?: string;
  evidence?: string;
  path?: string;
};

export type AvailableModuleInstallEvidence = {
  catalogSource?: string;
  consoleInstallPlanCount?: number;
  desiredEnabled?: boolean | null;
  installState?: AvailableModuleInstallState;
  missingConsolePackageCount?: number;
  moduleRegistered?: boolean;
  restartPending?: boolean;
  runningEnabled?: boolean | null;
};

export type AvailableModuleDoctorCheckStatus = "fix" | "hold" | "ok" | "skip";

export type AvailableModuleDoctorCheckKey =
  | "doctor"
  | "package"
  | "plan"
  | "restart"
  | "runtime"
  | "service"
  | "source";

export type AvailableModuleDoctorCheck = {
  key: AvailableModuleDoctorCheckKey;
  label: string;
  status: AvailableModuleDoctorCheckStatus;
  detail: string;
  command?: string;
};

export type AvailableModuleManifestSnapshots = Record<
  string,
  AvailableModuleManifestSnapshot | undefined
>;

const statusLabel: Record<AvailableModulePreflightStatus, string> = {
  archived: "archived",
  compatibility_blocked: "incompatible",
  manifest_mismatch: "manifest mismatch",
  needs_base_url: "needs base URL",
  package_hint_mismatch: "package hint mismatch",
  ready: "ready",
  unknown: "unknown",
};

export function availableModuleRows(
  catalog: AvailableModulesCatalog,
  manifests: AvailableModuleManifestSnapshots = {}
): AvailableModuleRow[] {
  return catalog.modules.map((entry) => {
    const manifest = manifests[entry.name];
    const preflight = availableModulePreflight(entry, manifest);
    return {
      baseUrl: entry.baseUrl ?? "-",
      capabilityCount: entry.capabilities?.length ?? 0,
      consolePackageHintCount: entry.consolePackages?.length ?? 0,
      key: `${entry.name}:${entry.version}:${entry.manifestReference}`,
      manifestReference: entry.manifestReference,
      name: entry.name,
      ...(preflight.fix ? { preflightFix: preflight.fix } : {}),
      preflightLabel: statusLabel[preflight.status],
      preflightReason: preflight.reason,
      preflightStatus: preflight.status,
      source: entry.source,
      summary: entry.summary ?? "-",
      version: entry.version,
    };
  });
}

export function availableModuleRowsFromResponse(
  response: AvailableModulesResponse
): AvailableModuleRow[] {
  return response.modules.map((module) => {
    const preflight = availableModulePreflightFromResponse({
      issues: response.issues,
      module,
    });
    return {
      baseUrl: module.baseUrl ?? "-",
      capabilityCount: module.capabilities?.length ?? 0,
      consolePackageHintCount: module.consolePackageHints,
      ...(module.installState ? { installState: module.installState } : {}),
      key: `${module.name}:${module.catalogVersion}:${module.manifestReference}`,
      manifestReference: module.manifestReference,
      name: module.name,
      ...(preflight.fix ? { preflightFix: preflight.fix } : {}),
      preflightLabel: statusLabel[preflight.status],
      preflightReason: preflight.reason,
      preflightStatus: preflight.status,
      providerName: module.providedBy ?? module.provided_by ?? null,
      serviceManifest:
        module.serviceManifest ?? module.service_manifest ?? null,
      ...(module.moduleRelease || module.module_release
        ? { moduleRelease: module.moduleRelease ?? module.module_release }
        : {}),
      source: module.source,
      summary: module.summary ?? "-",
      version: module.catalogVersion,
    };
  });
}

export function availableModuleHandoffState({
  installed,
  installCommand,
  row,
}: {
  installed?: {
    moduleName: string;
    packageInstallNeeded?: boolean;
    restartPending: boolean;
  } | null;
  installCommand: string;
  row: AvailableModuleRow;
}): AvailableModuleHandoffState {
  if (installed?.restartPending) {
    return {
      action: "restart",
      detail: "restart API and worker",
      kind: "restart_pending",
      label: "restart pending",
      moduleName: installed.moduleName,
      path: `/modules?module=${encodeURIComponent(installed.moduleName)}`,
    };
  }

  if (installed?.packageInstallNeeded) {
    return {
      action: "install_package",
      detail: "reload Runtime Console after extension install",
      kind: "package_install_needed",
      label: "extension reload needed",
      moduleName: installed.moduleName,
      path: `/modules?module=${encodeURIComponent(installed.moduleName)}`,
    };
  }

  if (installed) {
    return {
      action: "open",
      detail: "open installed module",
      kind: "installed",
      label: "installed",
      moduleName: installed.moduleName,
      path: `/modules?module=${encodeURIComponent(installed.moduleName)}`,
    };
  }

  const sourceRestart = sourceRestartState(row);
  if (sourceRestart.restartPending) {
    return {
      action: "restart",
      detail: sourceRestart.restartReason ?? "restart API and worker",
      kind: "restart_pending",
      label: "restart pending",
      moduleName: row.name,
      path: `/modules?module=${encodeURIComponent(row.name)}`,
    };
  }

  if (!availableModuleCanInstall(row)) {
    return {
      action: "resolve",
      detail: row.preflightReason,
      ...(row.preflightFix ? { fix: row.preflightFix } : {}),
      kind: "blocked",
      label: row.preflightLabel,
      moduleName: row.name,
    };
  }

  return {
    action: "install",
    command: installCommand,
    detail: row.preflightReason,
    kind: "available",
    label: "available",
    moduleName: row.name,
  };
}

function linkedSourceForRow(
  row: AvailableModuleRow
): AvailableModuleLinkedSourceInstallState | null {
  return row.source === "linked"
    ? (row.installState?.linkedSource ?? null)
    : null;
}

function remoteSourceForRow(
  row: AvailableModuleRow
): AvailableModuleRemoteSourceInstallState | null {
  return serviceBackedSource(row.source)
    ? (row.installState?.remoteSource ?? null)
    : null;
}

function serviceBackedSource(source: string): boolean {
  return source === "remote" || source === "service";
}

function sourceRestartState(row: AvailableModuleRow): {
  restartPending: boolean;
  restartReason?: string | null;
} {
  const linkedSource = linkedSourceForRow(row);
  if (linkedSource) {
    return linkedSource.restartReason === undefined
      ? { restartPending: linkedSource.restartPending }
      : {
          restartPending: linkedSource.restartPending,
          restartReason: linkedSource.restartReason,
        };
  }
  const remoteSource = remoteSourceForRow(row);
  if (remoteSource) {
    return remoteSource.restartReason === undefined
      ? { restartPending: remoteSource.restartPending }
      : {
          restartPending: remoteSource.restartPending,
          restartReason: remoteSource.restartReason,
        };
  }
  return { restartPending: false };
}

export function availableModuleInstallSteps({
  commands,
  evidence = {},
  handoff,
  row,
}: {
  commands: AvailableModuleInstallCommand[];
  evidence?: AvailableModuleInstallEvidence;
  handoff: AvailableModuleHandoffState;
  row: AvailableModuleRow;
}): AvailableModuleInstallStep[] {
  const addCommand = commands.find((command) => command.key === "add");
  const packageDoneStatus = packageStepDoneStatus(row);
  const packagePendingStatus = packageStepPendingStatus(row);

  switch (handoff.kind) {
    case "blocked": {
      return [
        {
          detail: handoff.fix
            ? `${handoff.detail}; ${handoff.fix}`
            : handoff.detail,
          key: "add",
          label: "add",
          status: "blocked",
        },
        installStep(
          "apply-plan",
          "plan",
          "pending",
          "add module first",
          undefined,
          undefined,
          installEvidence(evidence, "module registry is not ready")
        ),
        installStep(
          "install-packages",
          "bundle",
          packagePendingStatus,
          "install module first",
          undefined,
          undefined,
          packageEvidence(evidence, row)
        ),
        installStep(
          "restart",
          "restart",
          "pending",
          "install module first",
          undefined,
          undefined,
          restartEvidence(evidence)
        ),
        installStep(
          "open",
          "open",
          "pending",
          "install module first",
          undefined,
          undefined,
          installEvidence(evidence, "module is not installed")
        ),
      ];
    }
    case "available": {
      return [
        installStep(
          "add",
          "add",
          "current",
          handoff.detail,
          addCommand,
          undefined,
          catalogEvidence(evidence)
        ),
        installStep(
          "apply-plan",
          "extension",
          packagePendingStatus,
          "add module first",
          undefined,
          undefined,
          installEvidence(evidence, "module source not registered yet")
        ),
        installStep(
          "install-packages",
          "bundle",
          packagePendingStatus,
          "install module first",
          undefined,
          undefined,
          packageEvidence(evidence, row)
        ),
        installStep(
          "restart",
          "restart",
          "pending",
          "install module first",
          undefined,
          undefined,
          restartEvidence(evidence)
        ),
        installStep(
          "open",
          "open",
          "pending",
          "install module first",
          undefined,
          undefined,
          installEvidence(evidence, "module is not installed")
        ),
      ];
    }
    case "package_install_needed": {
      return [
        installStep(
          "add",
          "add",
          "done",
          "module source is registered",
          undefined,
          undefined,
          installEvidence(evidence, "module appears in /admin/data/modules")
        ),
        installStep(
          "apply-plan",
          "extension",
          "current",
          handoff.detail,
          undefined,
          undefined,
          packageEvidence(evidence, row)
        ),
        installStep(
          "install-packages",
          "bundle",
          "pending",
          "reload Runtime Console after extension registry update",
          undefined,
          undefined,
          packageEvidence(evidence, row)
        ),
        installStep(
          "restart",
          "restart",
          "pending",
          "install package first",
          undefined,
          undefined,
          restartEvidence(evidence)
        ),
        installStep(
          "open",
          "open",
          "pending",
          "restart first",
          undefined,
          undefined,
          installEvidence(evidence, "console package still missing")
        ),
      ];
    }
    case "restart_pending": {
      return [
        installStep(
          "add",
          "add",
          "done",
          "module source is registered",
          undefined,
          undefined,
          installEvidence(evidence, "module appears in /admin/data/modules")
        ),
        installStep(
          "apply-plan",
          "extension",
          packageDoneStatus,
          "console extension registered",
          undefined,
          undefined,
          packageEvidence(evidence, row)
        ),
        installStep(
          "install-packages",
          "bundle",
          packageDoneStatus,
          "console bundle is ready",
          undefined,
          undefined,
          packageEvidence(evidence, row)
        ),
        installStep(
          "restart",
          "restart",
          "current",
          handoff.detail,
          undefined,
          handoff.path,
          restartEvidence(evidence)
        ),
        installStep(
          "open",
          "open",
          "pending",
          "restart first",
          undefined,
          undefined,
          installEvidence(evidence, "runtime restart pending")
        ),
      ];
    }
    case "installed": {
      return [
        installStep(
          "add",
          "add",
          "done",
          "module source is registered",
          undefined,
          undefined,
          installEvidence(evidence, "module appears in /admin/data/modules")
        ),
        installStep(
          "apply-plan",
          "extension",
          packageDoneStatus,
          "console extension registered",
          undefined,
          undefined,
          packageEvidence(evidence, row)
        ),
        installStep(
          "install-packages",
          "bundle",
          packageDoneStatus,
          "console bundle is ready",
          undefined,
          undefined,
          packageEvidence(evidence, row)
        ),
        installStep(
          "restart",
          "restart",
          "done",
          "runtime is current",
          undefined,
          undefined,
          restartEvidence(evidence)
        ),
        installStep(
          "open",
          "open",
          "current",
          handoff.detail,
          undefined,
          handoff.path,
          installEvidence(evidence, "no install blockers remain")
        ),
      ];
    }
    default: {
      const exhaustive: never = handoff;
      return exhaustive;
    }
  }
}

export function availableModuleDoctorChecks({
  commands,
  missingConsolePackageCount = 0,
  moduleRegistered,
  restartPending,
  row,
  serviceLifecycle,
}: {
  commands: AvailableModuleInstallCommand[];
  missingConsolePackageCount?: number;
  moduleRegistered?: boolean;
  restartPending?: boolean;
  row: AvailableModuleRow;
  serviceLifecycle?: ServiceModuleLifecycleResponse | null;
}): AvailableModuleDoctorCheck[] {
  const addCommand =
    commandByKey(commands, "add") ??
    `lenso module marketplace install ${row.manifestReference}`;
  const installPackagesCommand =
    commandByKey(commands, "install-packages") ?? "reload Runtime Console";
  const consolePlan = row.installState?.consolePlan;
  const linkedSource = linkedSourceForRow(row);
  const remoteSource = remoteSourceForRow(row);
  const sourceRestart = sourceRestartState(row);
  const isModuleRegistered =
    moduleRegistered ?? row.installState?.moduleRegistered ?? false;
  const isRestartPending = Boolean(
    restartPending || sourceRestart.restartPending
  );
  const packageCommand = installPackagesCommand;
  const checks: AvailableModuleDoctorCheck[] = [
    sourceDoctorCheck({
      addCommand,
      isModuleRegistered,
      linkedSource,
      remoteSource,
      row,
    }),
    planDoctorCheck({
      addCommand,
      isModuleRegistered,
      row,
    }),
    packageDoctorCheck({
      consolePlan,
      isModuleRegistered,
      missingConsolePackageCount,
      packageCommand,
      row,
    }),
    runtimeDoctorCheck({
      addCommand,
      isModuleRegistered,
      linkedSource,
      remoteSource,
      row,
    }),
    restartDoctorCheck({
      isModuleRegistered,
      isRestartPending,
      linkedSource,
      remoteSource,
    }),
  ];
  const serviceCheck = serviceModuleLifecycleDoctorCheck({
    lifecycle: serviceLifecycle ?? null,
    moduleName: row.name,
  });
  const hasKnownWork =
    checks.some((check) => check.status === "fix" || check.status === "hold") ||
    serviceCheck?.status === "fix" ||
    serviceCheck?.status === "hold";
  return [
    ...checks,
    ...(serviceCheck ? [serviceCheck] : []),
    doctorCheck(
      "doctor",
      "doctor",
      "ok",
      hasKnownWork ? "verify after fixes" : "verify install state",
      "lenso module doctor"
    ),
  ];
}

export function serviceModuleLifecycleModuleFor(
  moduleName: string,
  lifecycle?: ServiceModuleLifecycleResponse | null
): ServiceModuleLifecycleModule | null {
  return (
    lifecycle?.modules.find((module) => module.moduleName === moduleName) ??
    null
  );
}

export function serviceModuleLifecycleDoctorCheck({
  lifecycle,
  moduleName,
}: {
  lifecycle?: ServiceModuleLifecycleResponse | null;
  moduleName: string;
}): AvailableModuleDoctorCheck | null {
  const module = serviceModuleLifecycleModuleFor(moduleName, lifecycle);
  if (!module) {
    return null;
  }
  if (module.compatibility?.state === "blocked") {
    return doctorCheck(
      "service",
      "service",
      "fix",
      module.compatibility.fix ??
        module.compatibility.issue ??
        "install a compatible service release"
    );
  }
  if (module.serviceStatus?.state === "unreachable") {
    return doctorCheck(
      "service",
      "service",
      "fix",
      module.serviceStatus.error ??
        "start the service or fix its status endpoint"
    );
  }
  if (module.serviceStatus?.state === "degraded") {
    return doctorCheck(
      "service",
      "service",
      "hold",
      module.serviceStatus.error ?? "service status is degraded"
    );
  }
  const [firstFix] = module.fixes;
  switch (module.status) {
    case "ready": {
      return doctorCheck("service", "service", "ok", "service is ready");
    }
    case "restart_pending": {
      return doctorCheck(
        "service",
        "service",
        "fix",
        firstFix ?? "restart API and worker to load the service"
      );
    }
    case "configured_not_loaded": {
      return doctorCheck(
        "service",
        "service",
        "fix",
        firstFix ?? "restart Host after installing the service"
      );
    }
    case "manifest_unreachable": {
      return doctorCheck(
        "service",
        "service",
        "fix",
        firstFix ?? "fix the service manifest URL or start the service"
      );
    }
    case "service_not_ready": {
      return doctorCheck(
        "service",
        "service",
        "fix",
        firstFix ?? "start the service or fix its readiness endpoint"
      );
    }
    case "stale_state": {
      return doctorCheck(
        "service",
        "service",
        "fix",
        firstFix ?? "remove stale lock or pid files for the service"
      );
    }
    case "not_configured": {
      return doctorCheck(
        "service",
        "service",
        "fix",
        firstFix ?? "configure the service provider source"
      );
    }
    default: {
      return doctorCheck(
        "service",
        "service",
        "hold",
        firstFix ?? `service status ${module.status}`
      );
    }
  }
}

function availableModuleCanInstall(row: AvailableModuleRow): boolean {
  return row.preflightStatus === "ready" || row.preflightStatus === "unknown";
}

function packageStepDoneStatus(
  row: AvailableModuleRow
): Extract<AvailableModuleInstallStepStatus, "done" | "skipped"> {
  return row.consolePackageHintCount > 0 ? "done" : "skipped";
}

function packageStepPendingStatus(
  row: AvailableModuleRow
): Extract<AvailableModuleInstallStepStatus, "pending" | "skipped"> {
  return row.consolePackageHintCount > 0 ? "pending" : "skipped";
}

function installStep(
  key: AvailableModuleInstallStepKey,
  label: string,
  status: AvailableModuleInstallStepStatus,
  detail: string,
  command?: AvailableModuleInstallCommand,
  path?: string,
  evidence?: string
): AvailableModuleInstallStep {
  return {
    ...(command ? { command: command.command } : {}),
    detail,
    ...(evidence ? { evidence } : {}),
    key,
    label,
    ...(path ? { path } : {}),
    status,
  };
}

function catalogEvidence(evidence: AvailableModuleInstallEvidence): string {
  return evidence.catalogSource
    ? `catalog source: ${evidence.catalogSource}`
    : "available module catalog row";
}

function installEvidence(
  evidence: AvailableModuleInstallEvidence,
  fallback: string
): string {
  const moduleRegistered =
    evidence.installState?.moduleRegistered ?? evidence.moduleRegistered;
  const linkedSource = evidence.installState?.linkedSource;
  const remoteSource = evidence.installState?.remoteSource;
  const transport = remoteSourceTransportLabel(remoteSource);
  if (moduleRegistered === true) {
    return "module registered in /admin/data/modules";
  }
  if (linkedSource?.configured) {
    return `LENSO_MODULE_*_ENABLED=${String(linkedSource.desiredEnabled)} in ${linkedSource.envFile}`;
  }
  if (remoteSource?.configured) {
    return `service provider source configured in ${remoteSource.envFile}${transport ? ` (${transport})` : ""}`;
  }
  if (moduleRegistered === false) {
    return "module not registered in /admin/data/modules";
  }
  return fallback;
}

function packageEvidence(
  evidence: AvailableModuleInstallEvidence,
  row: AvailableModuleRow
): string {
  const consolePlan = evidence.installState?.consolePlan;
  if (consolePlan?.error) {
    return consolePlan.error;
  }
  if (consolePlan?.moduleEntryPresent) {
    return `${consolePlan.packageCount} console extension entr${consolePlan.packageCount === 1 ? "y" : "ies"} in ${consolePlan.planFile}`;
  }
  if (consolePlan?.exists) {
    return `extension registry exists at ${consolePlan.planFile}; no ${row.name} entry`;
  }
  if (row.consolePackageHintCount === 0) {
    return "catalog declares no console package hints";
  }
  const missingCount = evidence.missingConsolePackageCount ?? null;
  const planCount = evidence.consoleInstallPlanCount ?? null;
  if (missingCount !== null && planCount !== null) {
    return `${missingCount} missing console package${missingCount === 1 ? "" : "s"}; ${planCount} extension entr${planCount === 1 ? "y" : "ies"} derived from backend metadata`;
  }
  if (missingCount !== null) {
    return `${missingCount} missing console package${missingCount === 1 ? "" : "s"} from backend metadata`;
  }
  return `${row.consolePackageHintCount} console package hint${row.consolePackageHintCount === 1 ? "" : "s"} in catalog`;
}

function restartEvidence(evidence: AvailableModuleInstallEvidence): string {
  const linkedSource = evidence.installState?.linkedSource;
  if (linkedSource?.restartPending) {
    return linkedSource.restartReason ?? "linked module env override changed";
  }
  if (linkedSource?.configured) {
    return `LENSO_MODULE_*_ENABLED desired=${String(linkedSource.desiredEnabled)} running=${String(linkedSource.runningEnabled)}`;
  }
  const remoteSource = evidence.installState?.remoteSource;
  if (remoteSource?.restartPending) {
    return (
      remoteSource.restartReason ??
      "service provider source differs from loaded module metadata"
    );
  }
  if (remoteSource?.configured && remoteSource.runningBaseUrl) {
    return `REMOTE_MODULES matches running source in ${remoteSource.envFile}`;
  }
  if (
    remoteSource &&
    !remoteSource.configured &&
    !remoteSource.runningBaseUrl
  ) {
    return `service provider source not present in ${remoteSource.envFile}`;
  }
  if (
    evidence.desiredEnabled !== undefined &&
    evidence.runningEnabled !== undefined
  ) {
    return `runtime config desired=${String(evidence.desiredEnabled)} running=${String(evidence.runningEnabled)}`;
  }
  if (evidence.restartPending === true) {
    return "runtime config differs from running module state";
  }
  if (evidence.restartPending === false) {
    return "runtime config matches running module state";
  }
  return "runtime restart state unavailable";
}

function commandByKey(
  commands: AvailableModuleInstallCommand[],
  key: string
): string | undefined {
  return commands.find((command) => command.key === key)?.command;
}

function sourceDoctorCheck({
  addCommand,
  isModuleRegistered,
  linkedSource,
  remoteSource,
  row,
}: {
  addCommand: string;
  isModuleRegistered: boolean;
  linkedSource: AvailableModuleLinkedSourceInstallState | null;
  remoteSource: AvailableModuleRemoteSourceInstallState | null;
  row: AvailableModuleRow;
}): AvailableModuleDoctorCheck {
  if (linkedSource?.error) {
    return doctorCheck("source", "source", "hold", linkedSource.error);
  }
  if (remoteSource?.error) {
    return doctorCheck("source", "source", "hold", remoteSource.error);
  }
  if (linkedSource?.configured) {
    return doctorCheck(
      "source",
      "source",
      "ok",
      `LENSO_MODULE_*_ENABLED=${String(linkedSource.desiredEnabled)} in ${linkedSource.envFile}`
    );
  }
  if (isModuleRegistered || remoteSource?.configured) {
    const transport = remoteSourceTransportLabel(remoteSource);
    return doctorCheck(
      "source",
      "source",
      "ok",
      remoteSource?.desiredBaseUrl
        ? `REMOTE_MODULES -> ${remoteSource.desiredBaseUrl}${transport ? ` (${transport})` : ""}`
        : "service provider source registered"
    );
  }
  if (!availableModuleCanInstall(row)) {
    return doctorCheck(
      "source",
      "source",
      "hold",
      row.preflightFix
        ? `${row.preflightReason}; ${row.preflightFix}`
        : row.preflightReason
    );
  }
  return doctorCheck(
    "source",
    "source",
    "fix",
    row.source === "linked"
      ? "set linked module env override"
      : `register service provider source in ${remoteSource?.envFile ?? ".env"}`,
    addCommand
  );
}

function remoteSourceTransportLabel(
  remoteSource: AvailableModuleRemoteSourceInstallState | null | undefined
): string | null {
  const url =
    remoteSource?.desiredBaseUrl ?? remoteSource?.runningBaseUrl ?? "";
  if (url.startsWith("grpcs://")) {
    return "grpcs";
  }
  if (url.startsWith("grpc://")) {
    return "grpc";
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "http/json";
  }
  return null;
}

function planDoctorCheck({
  addCommand,
  isModuleRegistered,
  row,
}: {
  addCommand: string;
  isModuleRegistered: boolean;
  row: AvailableModuleRow;
}): AvailableModuleDoctorCheck {
  const consolePlan = row.installState?.consolePlan;
  const remoteSource = remoteSourceForRow(row);
  if (row.consolePackageHintCount === 0) {
    return doctorCheck("plan", "extension", "skip", "no console package hints");
  }
  if (consolePlan?.error) {
    return doctorCheck("plan", "extension", "hold", consolePlan.error);
  }
  if (consolePlan?.moduleEntryPresent) {
    return doctorCheck(
      "plan",
      "extension",
      "ok",
      `${consolePlan.packageCount} extension entr${consolePlan.packageCount === 1 ? "y" : "ies"} in ${consolePlan.planFile}`
    );
  }
  if (isModuleRegistered) {
    return doctorCheck(
      "plan",
      "extension",
      "skip",
      "no console extension needed"
    );
  }
  if (consolePlan?.exists) {
    return doctorCheck(
      "plan",
      "extension",
      "fix",
      `no ${row.name} entry in ${consolePlan.planFile}`,
      addCommand
    );
  }
  if (remoteSource?.configured) {
    return doctorCheck(
      "plan",
      "extension",
      "fix",
      `write console extension registry for ${row.name}`,
      addCommand
    );
  }
  return doctorCheck("plan", "extension", "skip", "add source first");
}

function packageDoctorCheck({
  consolePlan,
  isModuleRegistered,
  missingConsolePackageCount,
  packageCommand,
  row,
}: {
  consolePlan: AvailableModuleConsolePackagePlanState | undefined;
  isModuleRegistered: boolean;
  missingConsolePackageCount: number;
  packageCommand: string;
  row: AvailableModuleRow;
}): AvailableModuleDoctorCheck {
  if (row.consolePackageHintCount === 0) {
    return doctorCheck(
      "package",
      "package",
      "skip",
      "no console package hints"
    );
  }
  if (consolePlan?.error) {
    return doctorCheck("package", "package", "hold", consolePlan.error);
  }
  if (missingConsolePackageCount > 0) {
    return doctorCheck(
      "package",
      "package",
      "fix",
      `${missingConsolePackageCount} console package export${missingConsolePackageCount === 1 ? "" : "s"} missing`,
      packageCommand
    );
  }
  if (consolePlan?.moduleEntryPresent && consolePlan.packageCount > 0) {
    return doctorCheck(
      "package",
      "bundle",
      "ok",
      `${consolePlan.packageCount} console bundle${consolePlan.packageCount === 1 ? "" : "s"} registered`
    );
  }
  if (isModuleRegistered) {
    return doctorCheck(
      "package",
      "bundle",
      "ok",
      "console package registry current"
    );
  }
  return doctorCheck(
    "package",
    "bundle",
    "skip",
    "waiting for console extension"
  );
}

function runtimeDoctorCheck({
  addCommand,
  isModuleRegistered,
  linkedSource,
  remoteSource,
  row,
}: {
  addCommand: string;
  isModuleRegistered: boolean;
  linkedSource: AvailableModuleLinkedSourceInstallState | null;
  remoteSource: AvailableModuleRemoteSourceInstallState | null;
  row: AvailableModuleRow;
}): AvailableModuleDoctorCheck {
  if (isModuleRegistered) {
    return doctorCheck(
      "runtime",
      "runtime",
      "ok",
      "module registered in /admin/data/modules"
    );
  }
  if (linkedSource?.restartPending) {
    return doctorCheck(
      "runtime",
      "runtime",
      "fix",
      linkedSource.restartReason ??
        "restart to apply linked module env override"
    );
  }
  if (linkedSource?.configured) {
    return doctorCheck(
      "runtime",
      "runtime",
      "hold",
      "linked module override is configured but not active"
    );
  }
  if (remoteSource?.restartPending) {
    return doctorCheck(
      "runtime",
      "runtime",
      "fix",
      remoteSource.restartReason ??
        "restart to load configured service provider source"
    );
  }
  if (remoteSource?.configured) {
    return doctorCheck(
      "runtime",
      "runtime",
      "hold",
      "service provider source configured but module is not registered"
    );
  }
  if (!availableModuleCanInstall(row)) {
    return doctorCheck("runtime", "runtime", "hold", row.preflightReason);
  }
  return doctorCheck(
    "runtime",
    "runtime",
    "fix",
    "module not registered in /admin/data/modules",
    addCommand
  );
}

function restartDoctorCheck({
  isModuleRegistered,
  isRestartPending,
  linkedSource,
  remoteSource,
}: {
  isModuleRegistered: boolean;
  isRestartPending: boolean;
  linkedSource: AvailableModuleLinkedSourceInstallState | null;
  remoteSource: AvailableModuleRemoteSourceInstallState | null;
}): AvailableModuleDoctorCheck {
  if (isRestartPending) {
    return doctorCheck(
      "restart",
      "restart",
      "fix",
      linkedSource?.restartReason ??
        remoteSource?.restartReason ??
        "restart API and worker"
    );
  }
  if (linkedSource?.configured) {
    return doctorCheck(
      "restart",
      "restart",
      "ok",
      `linked override desired=${String(linkedSource.desiredEnabled)} running=${String(linkedSource.runningEnabled)}`
    );
  }
  if (remoteSource?.configured && remoteSource.runningBaseUrl) {
    return doctorCheck(
      "restart",
      "restart",
      "ok",
      `running ${remoteSource.runningBaseUrl}`
    );
  }
  if (isModuleRegistered) {
    return doctorCheck("restart", "restart", "ok", "runtime config current");
  }
  if (remoteSource?.configured) {
    return doctorCheck("restart", "restart", "skip", "restart state unknown");
  }
  return doctorCheck("restart", "restart", "skip", "source not configured");
}

function doctorCheck(
  key: AvailableModuleDoctorCheckKey,
  label: string,
  status: AvailableModuleDoctorCheckStatus,
  detail: string,
  command?: string
): AvailableModuleDoctorCheck {
  return {
    ...(command ? { command } : {}),
    detail,
    key,
    label,
    status,
  };
}

function availableModulePreflight(
  entry: AvailableModulesEntry,
  manifest: AvailableModuleManifestSnapshot | undefined
): { fix?: string; reason: string; status: AvailableModulePreflightStatus } {
  if (entry.archivedAt) {
    return {
      reason: entry.archiveReason
        ? `catalog entry archived: ${entry.archiveReason}`
        : "catalog entry is archived",
      status: "archived",
    };
  }

  const compatibilityIssue = availableModuleCompatibilityIssue({
    compatibility: entry.compatibility,
    hostCompatibility: defaultHostCompatibility,
    moduleName: entry.name,
  });
  if (compatibilityIssue) {
    return {
      reason: compatibilityIssue,
      status: "compatibility_blocked",
    };
  }

  if (
    !entry.baseUrl &&
    !/^https?:\/\/.+\/manifest$/u.test(entry.manifestReference)
  ) {
    return {
      reason:
        "install needs baseUrl when the manifest reference is not an HTTP /manifest URL",
      status: "needs_base_url",
    };
  }

  if (!manifest) {
    return {
      reason: "manifest will be read from the manifest URL during install",
      status: "unknown",
    };
  }

  if (
    manifest.name !== entry.name ||
    manifest.version !== entry.version ||
    manifest.source !== entry.source
  ) {
    return {
      reason: "catalog identity does not match the fetched module manifest",
      status: "manifest_mismatch",
    };
  }

  const manifestPackages = new Set(
    (manifest.consolePackages ?? []).map(consolePackageKey)
  );
  const hasMismatchedPackageHint = (entry.consolePackages ?? []).some(
    (hint) => !manifestPackages.has(consolePackageKey(hint))
  );
  if (hasMismatchedPackageHint) {
    return {
      reason:
        "catalog console package hints drift from manifest console declarations",
      status: "package_hint_mismatch",
    };
  }

  return {
    reason: "module manifest is available",
    status: "ready",
  };
}

function availableModulePreflightFromResponse({
  issues,
  module,
}: {
  issues: AvailableModulesIssue[];
  module: AvailableModulesResponseModule;
}): { fix?: string; reason: string; status: AvailableModulePreflightStatus } {
  if (module.status === "archived" || module.archivedAt) {
    return {
      reason: module.archiveReason
        ? `catalog entry archived: ${module.archiveReason}`
        : "catalog entry is archived",
      status: "archived",
    };
  }

  const compatibilityIssue = issues.find(
    (candidate) =>
      candidate.group === "Compatibility" &&
      candidate.message.startsWith(`${module.name} `)
  );
  if (compatibilityIssue) {
    return {
      ...(compatibilityIssue.fix ? { fix: compatibilityIssue.fix } : {}),
      reason: compatibilityIssue.message,
      status: "compatibility_blocked",
    };
  }

  const inlineCompatibilityIssue = availableModuleCompatibilityIssue({
    compatibility: module.compatibility ?? undefined,
    hostCompatibility: module.hostCompatibility ?? defaultHostCompatibility,
    moduleName: module.name,
  });
  if (inlineCompatibilityIssue) {
    return {
      reason: inlineCompatibilityIssue,
      status: "compatibility_blocked",
    };
  }

  if (module.status === "ready") {
    return {
      reason: "module manifest is available",
      status: "ready",
    };
  }

  const issue = issues.find((candidate) =>
    candidate.message.startsWith(`${module.name} `)
  );
  const reason = issue?.message ?? "module manifest needs attention";

  if (!module.baseUrl) {
    return {
      ...(issue?.fix ? { fix: issue.fix } : {}),
      reason,
      status: "needs_base_url",
    };
  }

  if (
    module.manifestStatus !== "ok" ||
    module.manifestName !== module.name ||
    module.manifestVersion !== module.catalogVersion
  ) {
    return {
      ...(issue?.fix ? { fix: issue.fix } : {}),
      reason,
      status: "manifest_mismatch",
    };
  }

  return {
    ...(issue?.fix ? { fix: issue.fix } : {}),
    reason,
    status: "package_hint_mismatch",
  };
}

function consolePackageKey(hint: AvailableModuleConsolePackageHint): string {
  return `${hint.packageName}#${hint.exportName}`;
}

const defaultHostCompatibility: AvailableModuleHostCompatibility = {
  consolePackageApi: "1",
  lensoVersion: "0.1.0",
};

function parseVersion(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: string, right: string): number | null {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!(leftParts && rightParts)) {
    return null;
  }
  for (let index = 0; index < leftParts.length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }
  return 0;
}

function availableModuleCompatibilityIssue({
  compatibility,
  hostCompatibility,
  moduleName,
}: {
  compatibility: AvailableModuleCompatibility | undefined;
  hostCompatibility: AvailableModuleHostCompatibility;
  moduleName: string;
}): string | null {
  const minVersion = compatibility?.lenso?.minVersion;
  if (minVersion) {
    const comparison = compareVersions(
      hostCompatibility.lensoVersion,
      minVersion
    );
    if (comparison === null || comparison < 0) {
      return `${moduleName} requires Lenso >= ${minVersion}; host is ${hostCompatibility.lensoVersion}`;
    }
  }
  const maxVersion = compatibility?.lenso?.maxVersion;
  if (maxVersion) {
    const comparison = compareVersions(
      hostCompatibility.lensoVersion,
      maxVersion
    );
    if (comparison === null || comparison > 0) {
      return `${moduleName} supports Lenso <= ${maxVersion}; host is ${hostCompatibility.lensoVersion}`;
    }
  }
  if (
    compatibility?.consolePackageApi &&
    compatibility.consolePackageApi !== hostCompatibility.consolePackageApi
  ) {
    return `${moduleName} requires console package API ${compatibility.consolePackageApi}; host supports ${hostCompatibility.consolePackageApi}`;
  }
  return null;
}
