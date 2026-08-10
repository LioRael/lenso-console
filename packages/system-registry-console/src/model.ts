/* eslint-disable no-use-before-define */

import type {
  ConsoleConnectionStatus,
  ConsoleManagedService,
  ConsoleWorkloadObservation,
  ConsoleWorkloadOperationRecord,
} from "@lenso/console-ui";

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

export interface ServicePresentation {
  composition: readonly string[];
  environment: string;
  identity: readonly string[];
  nextSafeAction: readonly string[];
  owner: string;
  posture: RegistryStatePresentation;
  runtime: readonly string[];
  secondary: string;
  version: string;
  observed: string;
}

export type ServiceFilterValue = "all" | string;

export interface ServiceFilters {
  environment: ServiceFilterValue;
  owner: ServiceFilterValue;
  posture: ServiceFilterValue;
}

export interface ServiceListRow {
  presentation: ServicePresentation;
  service: ConsoleManagedService;
}

export const connectionStatusLabel = (
  status: ConsoleConnectionStatus
): string => {
  switch (status) {
    case "connected": {
      return "Connected";
    }
    case "unavailable": {
      return "Unavailable";
    }
    case "incompatible": {
      return "Incompatible";
    }
    case "unmanaged": {
      return "Unmanaged";
    }
    default: {
      return "Unknown";
    }
  }
};

export const statusTone = (
  status: ConsoleConnectionStatus
): "neutral" | "success" | "warning" | "danger" => {
  switch (status) {
    case "connected": {
      return "success";
    }
    case "unmanaged": {
      return "neutral";
    }
    case "unavailable": {
      return "warning";
    }
    case "incompatible": {
      return "danger";
    }
    default: {
      return "neutral";
    }
  }
};

const serviceSortWeight = (service: ConsoleManagedService): number => {
  if (service.enrollmentState === "revoked") {
    return 3;
  }
  if (service.connectionState === "ready") {
    return 2;
  }
  return service.connectionState === "never_observed" ? 1 : 0;
};

const designServiceOrder = [
  "lenso-api",
  "billing",
  "customer-index",
  "notification-gateway",
  "audit-evidence",
  "webhook-relay",
];

export const managedServiceRows = (
  services: readonly ConsoleManagedService[]
): ConsoleManagedService[] =>
  services.toSorted((left, right) => {
    const leftDesignOrder = designServiceOrder.indexOf(left.serviceId);
    const rightDesignOrder = designServiceOrder.indexOf(right.serviceId);
    if (leftDesignOrder !== -1 || rightDesignOrder !== -1) {
      if (leftDesignOrder === -1) {
        return 1;
      }
      if (rightDesignOrder === -1) {
        return -1;
      }
      return leftDesignOrder - rightDesignOrder;
    }
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

export const filterServiceRows = (
  rows: readonly ServiceListRow[],
  filters: ServiceFilters
): ServiceListRow[] =>
  rows.filter(
    ({ presentation }) =>
      matchesFilter(presentation.environment, filters.environment) &&
      matchesFilter(presentation.owner, filters.owner) &&
      matchesFilter(presentation.posture.label, filters.posture)
  );

// eslint-disable-next-line complexity
export const servicePresentation = (
  service: ConsoleManagedService
): ServicePresentation => {
  const override = service.presentation;
  const posture = override?.posture ?? servicePosture(service);
  const secondary =
    override?.secondary ?? `${service.servicePrincipal} · System`;
  const environment =
    override?.environment ?? serviceEndpointLabel(service.baseUrl);
  const version = override?.version ?? `v${service.version}`;
  const observed =
    override?.observed ??
    `${posture.label} · ${service.coreObservedAt ?? "not observed"}`;

  return {
    composition: override?.composition ?? ["Registry projection"],
    environment,
    identity: override?.identity ?? [
      `principal: ${service.servicePrincipal}`,
      `Enrollment ${service.enrollmentState}`,
      `Endpoint: ${service.baseUrl}`,
    ],
    nextSafeAction: override?.nextSafeAction ?? [
      "Change requires plan + approval",
      `Latest receipt: ${service.enrollmentReceiptDigest.slice(0, 22)}…`,
      "Plan change →",
    ],
    observed,
    owner: override?.owner ?? secondary.split(" · ")[1] ?? "System",
    posture,
    runtime: override?.runtime ?? [
      `${environment} · connection ${posture.label}`,
      `record v${service.version}`,
      `Desired = observed · ${posture.tone === "success" ? "no drift" : "needs attention"}`,
    ],
    secondary,
    version,
  };
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

export const workloadOperationHandle = ({
  mutationOperationId,
  observedActiveOperation,
}: {
  mutationOperationId?: string | undefined;
  observedActiveOperation?: string | null | undefined;
}) => observedActiveOperation ?? mutationOperationId;

const stableWorkloadObservationStates: ReadonlySet<
  ConsoleWorkloadObservation["state"]
> = new Set(["failed", "running", "suspended"]);
export const shouldRetireWorkloadOperation = (
  observation:
    | Pick<ConsoleWorkloadObservation, "activeOperation" | "state">
    | null
    | undefined
) =>
  Boolean(
    observation &&
    stableWorkloadObservationStates.has(observation.state) &&
    !observation.activeOperation
  );

export const observationSupersedesMutationOperation = ({
  authorityRefreshedOperationId,
  mutationOperationId,
  observation,
}: {
  authorityRefreshedOperationId?: string | null | undefined;
  mutationOperationId?: string | undefined;
  observation:
    | Pick<
        ConsoleWorkloadObservation,
        "activeOperation" | "observedAtUnixMs" | "state"
      >
    | null
    | undefined;
}) =>
  Boolean(
    mutationOperationId &&
    authorityRefreshedOperationId === mutationOperationId &&
    observation &&
    shouldRetireWorkloadOperation(observation)
  );

const terminalWorkloadOperationPhases = new Set([
  "denied",
  "failed",
  "succeeded",
]);
const recoverableWorkloadOperationPollStatuses = new Set([404, 502, 503]);

export const isRecoverableWorkloadOperationPollError = (
  error: Error | null | undefined
) => {
  const response = (error as { response?: unknown } | null | undefined)
    ?.response;
  if (!(response && typeof response === "object" && "status" in response)) {
    return false;
  }
  return recoverableWorkloadOperationPollStatuses.has(Number(response.status));
};

export const isTerminalWorkloadOperation = (
  operation: Pick<ConsoleWorkloadOperationRecord, "phase"> | null | undefined
) => Boolean(operation && terminalWorkloadOperationPhases.has(operation.phase));

export const shouldClearOperationAuthorityRefresh = ({
  authorityRefreshedOperationId,
  operation,
  operationPollingFailed,
}: {
  authorityRefreshedOperationId?: string | null | undefined;
  operation?:
    | Pick<ConsoleWorkloadOperationRecord, "operationId" | "phase">
    | undefined;
  operationPollingFailed: boolean;
}) =>
  Boolean(
    !operationPollingFailed &&
    operation &&
    operation.operationId === authorityRefreshedOperationId &&
    !isTerminalWorkloadOperation(operation)
  );

const matchesFilter = (value: string, filter: ServiceFilterValue) =>
  filter === "all" || value === filter;

const servicePosture = (
  service: ConsoleManagedService
): RegistryStatePresentation => {
  if (service.enrollmentState === "revoked") {
    return { label: "Enrollment required", tone: "warning" };
  }
  switch (service.connectionState) {
    case "ready": {
      return { label: "Healthy", tone: "success" };
    }
    case "never_observed": {
      return { label: "Enrollment required", tone: "warning" };
    }
    case "unavailable": {
      return { label: "Drifted", tone: "warning" };
    }
    case "incompatible": {
      return { label: "Degraded", tone: "warning" };
    }
    default: {
      return { label: "Unknown posture", tone: "error" };
    }
  }
};
