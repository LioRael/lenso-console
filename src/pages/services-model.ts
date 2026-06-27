import type { ServiceModuleLifecycleModule } from "./available-modules-model";
import { remoteProxyCallsPath } from "./remote-proxy-calls-model";

export type ServiceCenterModule = Pick<
  ServiceModuleLifecycleModule,
  "moduleName" | "status"
> &
  Partial<Pick<ServiceModuleLifecycleModule, "restartPending">> & {
    providerName?: string | null;
    services?: Array<{ name: string; ready?: boolean }>;
  };

export type ServiceCenterResponse = {
  modules: ServiceCenterModule[];
};

export type ServiceCenterRow = {
  providerName: string;
  state: string;
  modules: string[];
  managedServices: string[];
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
    .map(([providerName, modules]) => ({
      providerName,
      state: providerState(modules),
      modules: modules.map((module) => module.moduleName).sort(),
      managedServices: Array.from(
        new Set(
          modules.flatMap(
            (module) => module.services?.map((service) => service.name) ?? []
          )
        )
      ).sort(),
    }))
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
}

export function serviceStateLabel(state: string) {
  return state.replaceAll("_", " ");
}

export function serviceRemoteCallsPath(moduleName: string) {
  return remoteProxyCallsPath({ moduleName });
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
    return "restart pending";
  }
  if (modules.every((module) => module.status === "ready")) {
    return "ready";
  }
  return "configured";
}
