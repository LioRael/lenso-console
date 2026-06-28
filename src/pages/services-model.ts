import type {
  ServiceOperation,
  ServiceModuleLifecycleModule,
  ServiceModuleLifecycleService,
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
      | "configured"
      | "deployment"
      | "fixes"
      | "healthHistory"
      | "installed"
      | "loaded"
      | "manifestStatus"
      | "manifestUrl"
      | "moduleName"
      | "operations"
      | "providerName"
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

export type ServiceCenterRow = {
  baseUrls: string[];
  compatibilityStates: string[];
  fixes: string[];
  healthChecks: number;
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
      return {
        baseUrls: uniqueStrings(modules.map((module) => module.baseUrl)),
        compatibilityStates: uniqueStrings(
          modules.map((module) => module.compatibility?.state)
        ),
        fixes: uniqueStrings(modules.flatMap((module) => module.fixes ?? [])),
        healthChecks: modules.reduce(
          (total, module) => total + (module.healthHistory?.length ?? 0),
          0
        ),
        manifestUrls: uniqueStrings(
          modules.map((module) => module.manifestUrl)
        ),
        moduleDetails,
        providerName,
        state: providerState(modules),
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
        remoteCallsPath: serviceRemoteCallsPath(primaryModuleName),
        runtimePath: functionsPath({ moduleName: primaryModuleName }),
        storyPath: `/?q=${encodeURIComponent(providerName)}`,
      };
    })
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
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

export function providerState(modules: ServiceCenterModule[]) {
  if (
    modules.some(
      (module) =>
        module.status === "unhealthy" ||
        module.status === "manifest_unreachable" ||
        module.status === "service_not_ready" ||
        module.status === "stale_state" ||
        module.services?.some((service) => service.ready === false)
    )
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
  if (modules.every((module) => module.status === "ready")) {
    return "ready";
  }
  return "configured";
}

export function providerNextAction(modules: ServiceCenterModule[]) {
  if (
    modules.some(
      (module) =>
        module.status === "manifest_unreachable" ||
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
  return "monitor remote calls and Runtime Story";
}

function uniqueStrings(values: Array<null | string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort();
}
