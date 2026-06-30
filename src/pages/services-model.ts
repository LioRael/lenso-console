import type {
  ServiceDeploymentObservation,
  ServiceEnvironment,
  ServiceOperation,
  ServiceModuleLifecycleModule,
  ServiceModuleLifecycleService,
  ServiceReleaseRecord,
  ServiceSystemDriftResponse,
  ServiceSystemReleaseTrainResponse,
  ServiceSystemResponse,
} from "./available-modules-model";
import { functionsPath, operationsPath } from "./operations-url-model";
import { remoteProxyCallsPath } from "./remote-proxy-calls-model";

export type ServiceCenterModule = Pick<
  ServiceModuleLifecycleModule,
  "moduleName" | "providerName" | "status"
> &
  Partial<
    Pick<
      ServiceModuleLifecycleModule,
      | "baseUrl"
      | "compatibility"
      | "config"
      | "configured"
      | "deployment"
      | "deploymentDrift"
      | "deploymentHistory"
      | "deploymentNextAction"
      | "deployments"
      | "environments"
      | "fixes"
      | "healthHistory"
      | "installed"
      | "loaded"
      | "latestRelease"
      | "manifestStatus"
      | "manifestUrl"
      | "moduleName"
      | "operations"
      | "providerName"
      | "releaseHistory"
      | "restartPending"
      | "serviceStatus"
      | "statusUrl"
    >
  > & {
    services?: Array<
      Pick<
        ServiceModuleLifecycleService,
        "autoStart" | "lockFile" | "name" | "pidFile" | "ready" | "readyUrl"
      >
    >;
  };

export type ServiceCenterResponse = {
  modules: ServiceCenterModule[];
};

export type ServiceSystemSummary = {
  dependencies: number;
  environments: string[];
  issues: string[];
  modules: number;
  name: string;
  services: number;
  status: string;
  targets: string[];
};

export type ServiceSystemDriftSummary = {
  commands: string[];
  drifts: string[];
  status: string;
};

export type ServiceSystemReleaseTrainSummary = {
  latest: string | null;
  commands: string[];
  releases: number;
  status: string;
};

export type ServiceCenterRow = {
  baseUrls: string[];
  compatibilityStates: string[];
  fixes: string[];
  healthChecks: number;
  environments: ServiceEnvironment[];
  deployments: ServiceDeploymentObservation[];
  deploymentHistory: ServiceDeploymentObservation[];
  deploymentDrift?: string | null;
  deploymentNextAction?: string | null;
  operatorManaged: boolean;
  operatorConditions: string[];
  operatorCommands: string[];
  manifestUrls: string[];
  moduleDetails: ServiceCenterModule[];
  providerName: string;
  state: string;
  modules: string[];
  managedServices: string[];
  nextAction: string;
  operations: ServiceOperation[];
  operationsPath: string;
  remoteCallsPath: string;
  latestRelease?: ServiceReleaseRecord | null;
  releaseHistory: ServiceReleaseRecord[];
  runtimePath: string;
  storyPath: string;
};

export function serviceCenterRows(
  response: ServiceCenterResponse
): ServiceCenterRow[] {
  const groups = new Map<string, ServiceCenterModule[]>();
  for (const module of response.modules) {
    const provider = module.providerName ?? module.moduleName;
    groups.set(provider, [...(groups.get(provider) ?? []), module]);
  }

  return Array.from(groups.entries())
    .map(([providerName, modules]) => {
      const moduleDetails = [...modules].sort((a, b) =>
        a.moduleName.localeCompare(b.moduleName)
      );
      const primaryModuleName = moduleDetails[0]?.moduleName ?? providerName;
      const releaseHistory = uniqueServiceReleases(
        modules.flatMap((module) => [
          ...(module.releaseHistory ?? []),
          ...(module.latestRelease ? [module.latestRelease] : []),
        ])
      );
      const environments = uniqueServiceEnvironments(
        modules.flatMap((module) => module.environments ?? [])
      );
      const deployments = uniqueServiceDeployments(
        modules.flatMap((module) => module.deployments ?? [])
      );
      const deploymentHistory = uniqueServiceDeploymentHistory(
        modules.flatMap((module) => module.deploymentHistory ?? [])
      );
      return {
        baseUrls: uniqueStrings(modules.map((module) => module.baseUrl)),
        compatibilityStates: uniqueStrings(
          modules.map((module) => module.compatibility?.state)
        ),
        fixes: uniqueStrings(modules.flatMap((module) => module.fixes ?? [])),
        environments,
        deployments,
        deploymentHistory,
        deploymentDrift:
          modules.find((module) => module.deploymentDrift)?.deploymentDrift ??
          modules.flatMap((module) => module.deployments ?? [])[0]?.drift ??
          null,
        deploymentNextAction:
          modules.find((module) => module.deploymentNextAction)
            ?.deploymentNextAction ??
          modules.flatMap((module) => module.deployments ?? [])[0]
            ?.nextAction ??
          null,
        healthChecks: modules.reduce(
          (total, module) => total + (module.healthHistory?.length ?? 0),
          0
        ),
        manifestUrls: uniqueStrings(
          modules.map((module) => module.manifestUrl)
        ),
        moduleDetails,
        providerName,
        state: providerState(modules, deployments),
        modules: moduleDetails.map((module) => module.moduleName),
        managedServices: Array.from(
          new Set(
            modules.flatMap(
              (module) => module.services?.map((service) => service.name) ?? []
            )
          )
        ).sort(),
        nextAction: providerNextAction(modules),
        operations: modules
          .flatMap((module) => module.operations ?? [])
          .sort((a, b) => a.operationId.localeCompare(b.operationId)),
        operationsPath: operationsPath("/operations", { q: providerName }),
        operatorManaged: deployments.some(
          (deployment) => deployment.target === "operator"
        ),
        operatorConditions: operatorConditionLabels(deployments),
        operatorCommands: serviceOperatorCommands(providerName, environments),
        remoteCallsPath: serviceRemoteCallsPath(primaryModuleName),
        latestRelease:
          releaseHistory[0] ??
          modules.find((module) => module.latestRelease)?.latestRelease ??
          null,
        releaseHistory,
        runtimePath: functionsPath({ moduleName: primaryModuleName }),
        storyPath: `/?q=${encodeURIComponent(providerName)}`,
      };
    })
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
}

export function serviceSystemSummary(
  response: ServiceSystemResponse | undefined
): ServiceSystemSummary {
  return {
    dependencies: response?.dependencies.length ?? 0,
    environments: response?.environments ?? [],
    issues:
      response?.issues.map((issue) => `${issue.code}: ${issue.message}`) ?? [],
    modules: response?.modules.length ?? 0,
    name: response?.name ?? "service system",
    services: response?.services.length ?? 0,
    status: response?.status ?? "empty",
    targets: uniqueStrings(
      response?.services.map((service) => service.target) ?? []
    ),
  };
}

export function serviceSystemDriftSummary(
  response: ServiceSystemDriftResponse | undefined
): ServiceSystemDriftSummary {
  return {
    commands: response?.commands ?? [],
    drifts:
      response?.drifts.map((drift) => `${drift.code}: ${drift.message}`) ?? [],
    status: response?.status ?? "empty",
  };
}

export function serviceSystemReleaseTrainSummary(
  response: ServiceSystemReleaseTrainResponse | undefined
): ServiceSystemReleaseTrainSummary {
  const latest = response?.releases[0];
  return {
    commands: response?.commands ?? [],
    latest: latest
      ? `${latest.systemName}/${latest.environment} ${latest.status} (${latest.policyRisk})`
      : null,
    releases: response?.releases.length ?? 0,
    status: response?.status ?? "empty",
  };
}

export function serviceStateLabel(state: string) {
  return state.replaceAll("_", " ");
}

export function serviceRemoteCallsPath(moduleName: string) {
  return remoteProxyCallsPath({ moduleName });
}

export function serviceCenterProviderDetail(
  response: ServiceCenterResponse,
  providerName: string
) {
  return (
    serviceCenterRows(response).find(
      (row) => row.providerName === providerName
    ) ?? null
  );
}

export function providerState(
  modules: ServiceCenterModule[],
  deployments: ServiceDeploymentObservation[] = modules.flatMap(
    (module) => module.deployments ?? []
  )
) {
  if (
    modules.some(
      (module) =>
        module.status === "unhealthy" ||
        module.status === "missing_config" ||
        module.status === "manifest_unreachable" ||
        module.status === "service_not_ready" ||
        module.status === "stale_state" ||
        module.services?.some((service) => service.ready === false)
    ) ||
    deployments.some(deploymentIsUnhealthy)
  ) {
    return "unhealthy";
  }
  if (
    modules.some(
      (module) => module.status === "restart_pending" || module.restartPending
    )
  ) {
    return "restart_pending";
  }
  if (
    modules.every((module) => module.status === "ready") &&
    deploymentsReady(deployments)
  ) {
    return "ready";
  }
  return "configured";
}

function deploymentIsUnhealthy(deployment: ServiceDeploymentObservation) {
  return deployment.state === "failed" || deployment.state === "unhealthy";
}

function deploymentsReady(deployments: ServiceDeploymentObservation[]) {
  return deployments.every(
    (deployment) =>
      deployment.state === "ready" &&
      (!deployment.drift || deployment.drift === "in_sync")
  );
}

export function providerNextAction(modules: ServiceCenterModule[]) {
  if (
    modules.some(
      (module) =>
        module.status === "manifest_unreachable" ||
        module.status === "missing_config" ||
        module.status === "service_not_ready" ||
        module.status === "stale_state" ||
        module.services?.some((service) => service.ready === false)
    )
  ) {
    return (
      modules.flatMap((module) => module.fixes ?? [])[0] ??
      modules.find((module) => module.compatibility?.fix)?.compatibility?.fix ??
      "start the service or fix its status endpoint"
    );
  }
  if (
    modules.some(
      (module) => module.status === "restart_pending" || module.restartPending
    )
  ) {
    return "restart API and worker to load the latest service state";
  }
  if (modules.some((module) => module.compatibility?.state === "blocked")) {
    return (
      modules.find((module) => module.compatibility?.fix)?.compatibility?.fix ??
      "upgrade the host or choose a compatible service version"
    );
  }
  if (modules.some((module) => module.loaded === false)) {
    return "configure the provider source and restart the host";
  }
  const deploymentAction = modules.find(
    (module) => module.deploymentNextAction
  )?.deploymentNextAction;
  if (deploymentAction) {
    return deploymentAction;
  }
  return "monitor remote calls and Runtime Story";
}

function uniqueStrings(values: Array<null | string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort();
}

function compactStrings(values: Array<null | string | undefined>) {
  return values.filter(Boolean) as string[];
}

function uniqueServiceEnvironments(environments: ServiceEnvironment[]) {
  const records = new Map<string, ServiceEnvironment>();
  for (const environment of environments) {
    records.set(`${environment.serviceName}:${environment.name}`, environment);
  }
  return Array.from(records.values()).sort((a, b) =>
    `${a.serviceName}:${a.name}`.localeCompare(`${b.serviceName}:${b.name}`)
  );
}

function uniqueServiceDeployments(deployments: ServiceDeploymentObservation[]) {
  const records = new Map<string, ServiceDeploymentObservation>();
  for (const deployment of deployments) {
    records.set(
      `${deployment.serviceName}:${deployment.environment}`,
      deployment
    );
  }
  return Array.from(records.values()).sort(
    (a, b) => (b.observedAtUnixMs ?? 0) - (a.observedAtUnixMs ?? 0)
  );
}

function serviceOperatorCommands(
  providerName: string,
  environments: ServiceEnvironment[]
) {
  const rolloutCommands = environments.flatMap((environment) => {
    const target =
      environment.target === "operator" ? "operator" : "kubernetes";
    const outputDir = `dist/lenso-service/${providerName}/${target}/${environment.name}`;
    if (target === "operator") {
      return [
        "lenso operator export-crd --output dist/lenso-operator/crds",
        "kubectl apply -k dist/lenso-operator/crds",
        `lenso service deploy export ${providerName} --env ${environment.name} --target operator --output-dir ${outputDir}`,
        `kubectl apply -k ${outputDir}`,
        `lenso service deploy status ${providerName} --env ${environment.name} --source operator --write-state`,
        `lenso service deploy wait ${providerName} --env ${environment.name} --source operator --write-state`,
        `lenso service release rollback ${providerName} --env ${environment.name}`,
      ];
    }
    return [
      `lenso service deploy export ${providerName} --env ${environment.name} --target kubernetes --output-dir ${outputDir}`,
      `kubectl apply -k ${outputDir}`,
      `lenso service deploy status ${providerName} --env ${environment.name} --write-state`,
      `lenso service deploy wait ${providerName} --env ${environment.name} --write-state`,
      `lenso service release rollback ${providerName} --env ${environment.name}`,
    ];
  });
  return [
    ...rolloutCommands,
    ...servicePromotionCommands(providerName, environments),
  ];
}

function servicePromotionCommands(
  providerName: string,
  environments: ServiceEnvironment[]
) {
  const names = new Set(environments.map((environment) => environment.name));
  if (!(names.has("staging") && names.has("prod"))) {
    return [];
  }
  const planPath = `.lenso/${providerName}.prod.release-plan.json`;
  return [
    `lenso service release promote ${providerName} --from staging --to prod --output ${planPath}`,
    `lenso service policy check ${planPath} --fail-on breaking`,
    `lenso service release apply ${planPath} --env prod`,
  ];
}

function uniqueServiceDeploymentHistory(
  deployments: ServiceDeploymentObservation[]
) {
  const records = new Map<string, ServiceDeploymentObservation>();
  for (const deployment of deployments) {
    records.set(
      [
        deployment.serviceName,
        deployment.environment,
        deployment.target,
        deployment.observedAtUnixMs ?? "-",
        deployment.state,
        deployment.drift,
      ].join(":"),
      deployment
    );
  }
  return Array.from(records.values()).sort(
    (a, b) => (b.observedAtUnixMs ?? 0) - (a.observedAtUnixMs ?? 0)
  );
}

function operatorConditionLabels(deployments: ServiceDeploymentObservation[]) {
  return deployments.flatMap((deployment) =>
    (deployment.operator?.conditions ?? []).map((condition) =>
      compactStrings([
        condition.type && condition.status
          ? `${condition.type}=${condition.status}`
          : (condition.type ?? condition.status ?? undefined),
        condition.reason ?? undefined,
        condition.message ? `: ${condition.message}` : undefined,
      ])
        .join(" ")
        .replace(" : ", ": ")
    )
  );
}

function uniqueServiceReleases(releases: ServiceReleaseRecord[]) {
  const records = new Map<string, ServiceReleaseRecord>();
  for (const release of releases) {
    const key =
      release.id ??
      [
        release.serviceName,
        release.appliedAtUnixMs ?? "-",
        release.candidateVersion ?? "-",
        release.candidateManifestReference ?? "-",
      ].join(":");
    records.set(key, release);
  }
  return Array.from(records.values()).sort(
    (left, right) => (right.appliedAtUnixMs ?? 0) - (left.appliedAtUnixMs ?? 0)
  );
}
