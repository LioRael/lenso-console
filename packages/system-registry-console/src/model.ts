import type { ConsoleManagedService } from "@lenso/console-package-api";

export interface RegistrySummary {
  active: number;
  attention: number;
  ready: number;
  revoked: number;
  total: number;
}

export interface RegistryStatePresentation {
  label: string;
  tone: "error" | "muted" | "success" | "warning";
}

const serviceSortWeight = (service: ConsoleManagedService): number => {
  if (service.enrollmentState === "revoked") {
    return 3;
  }
  if (service.connectionState === "ready") {
    return 2;
  }
  return service.connectionState === "never_observed" ? 1 : 0;
};

export const managedServiceRows = (
  services: readonly ConsoleManagedService[]
): ConsoleManagedService[] =>
  services.toSorted((left, right) => {
    const state = serviceSortWeight(left) - serviceSortWeight(right);
    return state === 0 ? left.serviceId.localeCompare(right.serviceId) : state;
  });

export const registrySummary = (
  services: readonly ConsoleManagedService[]
): RegistrySummary => ({
  active: services.filter((service) => service.enrollmentState === "active")
    .length,
  attention: services.filter(
    (service) =>
      service.enrollmentState === "active" &&
      service.connectionState !== "ready"
  ).length,
  ready: services.filter(
    (service) =>
      service.enrollmentState === "active" &&
      service.connectionState === "ready"
  ).length,
  revoked: services.filter((service) => service.enrollmentState === "revoked")
    .length,
  total: services.length,
});

export const registryState = (
  service: ConsoleManagedService
): RegistryStatePresentation => {
  if (service.enrollmentState === "revoked") {
    return { label: "Enrollment revoked", tone: "muted" };
  }
  switch (service.connectionState) {
    case "ready": {
      return { label: "Connected", tone: "success" };
    }
    case "never_observed": {
      return { label: "Awaiting first observation", tone: "warning" };
    }
    case "unavailable": {
      return { label: "Unavailable", tone: "error" };
    }
    case "incompatible": {
      return { label: "Contract incompatible", tone: "error" };
    }
    default: {
      return { label: "Unknown connection state", tone: "error" };
    }
  }
};

export const serviceEndpointLabel = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};

export const enrollmentExpiryLabel = (
  unixMs: number,
  now = Date.now()
): string => {
  if (unixMs <= now) {
    return "Expired";
  }
  const hours = Math.ceil((unixMs - now) / 3_600_000);
  if (hours < 48) {
    return `${hours}h remaining`;
  }
  return `${Math.ceil(hours / 24)}d remaining`;
};
