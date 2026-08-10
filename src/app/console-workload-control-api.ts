import {
  WORKLOAD_CONTROL_PROTOCOL,
  type ConsoleWorkloadMutationInput,
  type ConsoleWorkloadObservation,
  type ConsoleWorkloadOperationRecord,
  type ConsoleWorkloadReference,
} from "@lenso/console-ui";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { httpClient, isApiMode } from "../lib/http-client";

const terminalPhases = new Set(["succeeded", "failed", "denied"]);
const stableObservationStates = new Set(["failed", "running", "suspended"]);
const OPERATION_POLL_INITIAL_DELAY_MS = 500;
const OPERATION_POLL_MAX_DELAY_MS = 30_000;

export function workloadOperationRefetchInterval({
  failureCount,
  phase,
}: {
  failureCount: number;
  phase?: ConsoleWorkloadOperationRecord["phase"] | undefined;
}) {
  if (phase && terminalPhases.has(phase)) {
    return false;
  }
  const exponent = Math.min(Math.max(failureCount, 0), 6);
  return Math.min(
    OPERATION_POLL_INITIAL_DELAY_MS * 2 ** exponent,
    OPERATION_POLL_MAX_DELAY_MS
  );
}

export function workloadObservationRefetchInterval({
  dataUpdateCount,
  failureCount,
  observation,
}: {
  dataUpdateCount: number;
  failureCount: number;
  observation?: ConsoleWorkloadObservation | undefined;
}) {
  const stable = Boolean(
    observation &&
    stableObservationStates.has(observation.state) &&
    !observation.activeOperation
  );
  if (stable && failureCount === 0) {
    return false;
  }
  const exponent = Math.min(Math.max(failureCount || dataUpdateCount, 0), 6);
  return Math.min(
    OPERATION_POLL_INITIAL_DELAY_MS * 2 ** exponent,
    OPERATION_POLL_MAX_DELAY_MS
  );
}

export const consoleWorkloadQueryKey = (workload: ConsoleWorkloadReference) =>
  [
    "console-system",
    "workload-control",
    workload.systemId,
    workload.serviceId,
    workload.workloadId,
  ] as const;

export const consoleWorkloadOperationQueryKey = (
  workload: ConsoleWorkloadReference,
  operationId: string
) =>
  [
    "console-system",
    "workload-operation",
    workload.systemId,
    workload.serviceId,
    workload.workloadId,
    operationId,
  ] as const;

export const consoleWorkloadAccessQueryKey = (
  systemId: string | null | undefined,
  serviceId: string | null | undefined
) =>
  [
    "console-system",
    "workload-access",
    systemId ?? "none",
    serviceId ?? "none",
  ] as const;

export function consoleWorkloadPath(workload: ConsoleWorkloadReference) {
  return `api/console/v1/systems/${encodeConsolePathSegment(
    workload.systemId
  )}/workloads/${encodeConsolePathSegment(
    workload.serviceId
  )}/${encodeConsolePathSegment(workload.workloadId)}`;
}

function encodeConsolePathSegment(value: string) {
  if (value === "." || value === "..") {
    throw new Error("A stable identity cannot be a URL dot-segment");
  }
  return encodeURIComponent(value);
}

export function consoleWorkloadMutationBody({
  action,
  idempotencyKey,
  observedRevision,
}: ConsoleWorkloadMutationInput) {
  return { action, idempotencyKey, observedRevision };
}

export function normalizeConsoleWorkloadObservation(
  observation: ConsoleWorkloadObservation
): ConsoleWorkloadObservation {
  return {
    ...observation,
    capabilities: observation.capabilities ?? [],
  };
}

export function reconcileTerminalWorkloadOperation(
  queryClient: QueryClient,
  operation: ConsoleWorkloadOperationRecord | null | undefined
) {
  if (!operation || !terminalPhases.has(operation.phase)) {
    return undefined;
  }
  const { request, result, updatedAtUnixMs } = operation;
  const queryKey = consoleWorkloadQueryKey(request.workload);
  if (result) {
    queryClient.setQueryData<ConsoleWorkloadObservation>(
      queryKey,
      (observation) =>
        observation
          ? {
              ...observation,
              activeOperation: null,
              observedAtUnixMs: updatedAtUnixMs,
              observedRevision: result.observedRevision,
              state: result.state,
            }
          : observation
    );
  }
  return queryClient.invalidateQueries({ queryKey });
}

export function refreshConsoleWorkloadAuthority(
  queryClient: QueryClient,
  workload: ConsoleWorkloadReference
) {
  return queryClient.invalidateQueries({
    queryKey: consoleWorkloadQueryKey(workload),
  });
}

export function useConsoleWorkload(
  workload: ConsoleWorkloadReference | null | undefined
) {
  const apiMode = isApiMode();
  const mock = workload ? mockObservation(workload) : undefined;
  return useQuery({
    enabled: Boolean(workload) && apiMode,
    initialData: apiMode ? undefined : mock,
    queryFn: () => {
      if (!workload) {
        throw new Error("A stable Workload Reference is required");
      }
      return httpClient
        .get(consoleWorkloadPath(workload))
        .json<ConsoleWorkloadObservation>()
        .then(normalizeConsoleWorkloadObservation);
    },
    queryKey: workload
      ? consoleWorkloadQueryKey(workload)
      : ["console-system", "workload-control", "none"],
    refetchInterval: (result) =>
      workloadObservationRefetchInterval({
        dataUpdateCount: result.state.dataUpdateCount,
        failureCount: result.state.fetchFailureCount,
        observation: result.state.data,
      }),
  });
}

export function useConsoleWorkloadAccess(
  systemId: string | null | undefined,
  serviceId: string | null | undefined
) {
  const apiMode = isApiMode();
  return useQuery({
    enabled: Boolean(systemId) && Boolean(serviceId) && apiMode,
    initialData: apiMode
      ? undefined
      : [
          "console.workload.read",
          "console.workload.control",
          "console.workload.operation.read",
        ],
    queryFn: () => {
      if (!systemId || !serviceId) {
        throw new Error("Stable System and Service identities are required");
      }
      return httpClient
        .get(
          `api/console/v1/systems/${encodeConsolePathSegment(
            systemId
          )}/workload-access/${encodeConsolePathSegment(serviceId)}`
        )
        .json<{ capabilities: string[] }>()
        .then((response) => response.capabilities);
    },
    queryKey: consoleWorkloadAccessQueryKey(systemId, serviceId),
  });
}

export function useConsoleWorkloadOperation(
  workload: ConsoleWorkloadReference | null | undefined,
  operationId: string | null | undefined
) {
  const queryClient = useQueryClient();
  const operationQuery = useQuery({
    enabled: Boolean(workload) && Boolean(operationId) && isApiMode(),
    queryFn: () => {
      if (!workload || !operationId) {
        throw new Error(
          "A stable Workload Reference and Operation handle are required"
        );
      }
      return httpClient
        .get(
          `${consoleWorkloadPath(workload)}/operations/${encodeConsolePathSegment(
            operationId
          )}`
        )
        .json<ConsoleWorkloadOperationRecord>();
    },
    queryKey:
      workload && operationId
        ? consoleWorkloadOperationQueryKey(workload, operationId)
        : ["console-system", "workload-operation", "none"],
    refetchInterval: (result) =>
      workloadOperationRefetchInterval({
        failureCount: result.state.fetchFailureCount,
        phase: result.state.data?.phase,
      }),
  });
  useEffect(() => {
    void reconcileTerminalWorkloadOperation(queryClient, operationQuery.data);
  }, [operationQuery.data, queryClient]);
  return operationQuery;
}

export function useMutateConsoleWorkload() {
  const apiMode = isApiMode();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ConsoleWorkloadMutationInput) =>
      apiMode
        ? httpClient
            .post(`${consoleWorkloadPath(request.workload)}/operations`, {
              json: consoleWorkloadMutationBody(request),
            })
            .json<ConsoleWorkloadOperationRecord>()
        : Promise.resolve(mockOperation(request)),
    onError: async (_error, request) => {
      await refreshConsoleWorkloadAuthority(queryClient, request.workload);
    },
    onSuccess: async (operation, request) => {
      queryClient.setQueryData(
        consoleWorkloadOperationQueryKey(
          operation.request.workload,
          operation.operationId
        ),
        operation
      );
      await refreshConsoleWorkloadAuthority(queryClient, request.workload);
    },
  });
}

function mockObservation(
  workload: ConsoleWorkloadReference
): ConsoleWorkloadObservation {
  return {
    activeOperation: null,
    capabilities: ["suspend", "resume"],
    observedAtUnixMs: Date.now(),
    observedRevision: "local-revision-1",
    protection: mockWorkloadProtection(workload),
    protocol: WORKLOAD_CONTROL_PROTOCOL,
    state: "running",
    workload,
  };
}

export function mockWorkloadProtection(workload: ConsoleWorkloadReference) {
  const isConsole = workload.serviceId === "lenso-console";
  const isActiveMockAdapter =
    workload.systemId === "support-desk" &&
    workload.serviceId === "support-api" &&
    workload.workloadId === "support-workload-control-adapter";
  return isConsole || isActiveMockAdapter ? "control_plane" : "controllable";
}

function mockOperation(
  request: ConsoleWorkloadMutationInput
): ConsoleWorkloadOperationRecord {
  const now = Date.now();
  return {
    authority: {
      adapterId: "local-control-adapter",
      decision: "accepted",
    },
    decidedAtUnixMs: now,
    finishedAtUnixMs: now,
    operationId: `mock-${request.idempotencyKey}`,
    phase: "succeeded",
    protocol: WORKLOAD_CONTROL_PROTOCOL,
    request: {
      ...request,
      actor: { kind: "operator", subject: "mock-console-user" },
      protocol: WORKLOAD_CONTROL_PROTOCOL,
    },
    requestedAtUnixMs: now,
    result: {
      observedRevision: "local-revision-2",
      state: workloadResultStateForAction(request.action),
    },
    updatedAtUnixMs: now,
  };
}

export function workloadResultStateForAction(
  action: ConsoleWorkloadMutationInput["action"]
) {
  return action.kind === "suspend" ? "suspended" : "running";
}
