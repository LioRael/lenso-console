import {
  WORKLOAD_CONTROL_PROTOCOL,
  WORKLOAD_CONTROL_SCHEMA_DIGEST,
  type ConsoleWorkloadObservation,
  type ConsoleWorkloadOperationRecord,
} from "@lenso/console-ui";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";

import {
  consoleWorkloadMutationBody,
  consoleWorkloadAccessQueryKey,
  consoleWorkloadOperationQueryKey,
  consoleWorkloadPath,
  consoleWorkloadQueryKey,
  mockWorkloadProtection,
  normalizeConsoleWorkloadObservation,
  refreshConsoleWorkloadAuthority,
  reconcileTerminalWorkloadOperation,
  workloadObservationRefetchInterval,
  workloadOperationRefetchInterval,
  workloadResultStateForAction,
} from "./console-workload-control-api";

describe("Console workload control API", () => {
  test("pins the framework-owned Workload Control v1 schema", () => {
    expect(WORKLOAD_CONTROL_SCHEMA_DIGEST).toBe(
      "sha256:d3666bb1fd85576f9af4205dbcc70029acd81462678c47d2b315c40ef1a9161d"
    );
  });

  test("routes stable references through the same-origin Console Service", () => {
    expect(
      consoleWorkloadPath({
        serviceId: "support/api",
        systemId: "support-desk",
        workloadId: "support worker",
      })
    ).toBe(
      "api/console/v1/systems/support-desk/workloads/support%2Fapi/support%20worker"
    );
    expect(
      consoleWorkloadAccessQueryKey("support-desk", "support/api")
    ).toEqual([
      "console-system",
      "workload-access",
      "support-desk",
      "support/api",
    ]);
    expect(
      consoleWorkloadOperationQueryKey(
        {
          serviceId: "support/api",
          systemId: "support-desk",
          workloadId: "support worker",
        },
        "operation-7"
      )
    ).toEqual([
      "console-system",
      "workload-operation",
      "support-desk",
      "support/api",
      "support worker",
      "operation-7",
    ]);
    expect(() =>
      consoleWorkloadPath({
        serviceId: "support",
        systemId: "..",
        workloadId: "support-worker",
      })
    ).toThrow("dot-segment");
  });

  test("sends only the typed action, observed revision, and idempotency key", () => {
    expect(
      consoleWorkloadMutationBody({
        action: { kind: "suspend" },
        idempotencyKey: "workload-control-01",
        observedRevision: "revision-7",
        workload: {
          serviceId: "support",
          systemId: "support-desk",
          workloadId: "support-api",
        },
      })
    ).toEqual({
      action: { kind: "suspend" },
      idempotencyKey: "workload-control-01",
      observedRevision: "revision-7",
    });
  });

  test("backs off transient operation polling and stops for terminal records", () => {
    expect(
      workloadOperationRefetchInterval({ failureCount: 0, phase: undefined })
    ).toBe(500);
    expect(
      workloadOperationRefetchInterval({ failureCount: 1, phase: undefined })
    ).toBe(1000);
    expect(
      workloadOperationRefetchInterval({ failureCount: 20, phase: undefined })
    ).toBe(30_000);
    expect(
      workloadOperationRefetchInterval({
        failureCount: 0,
        phase: "succeeded",
      })
    ).toBe(false);
  });

  test("backs off unresolved observations and stops at stable authority", () => {
    const workload = {
      serviceId: "support",
      systemId: "support-desk",
      workloadId: "support-api",
    };
    expect(
      workloadObservationRefetchInterval({
        dataUpdateCount: 1,
        failureCount: 0,
        observation: {
          activeOperation: null,
          capabilities: [],
          observedAtUnixMs: 1,
          observedRevision: null,
          protection: "controllable",
          protocol: WORKLOAD_CONTROL_PROTOCOL,
          state: "unknown",
          workload,
        },
      })
    ).toBe(1000);
    expect(
      workloadObservationRefetchInterval({
        dataUpdateCount: 7,
        failureCount: 0,
        observation: {
          activeOperation: null,
          capabilities: ["suspend"],
          observedAtUnixMs: 2,
          observedRevision: "revision-2",
          protection: "controllable",
          protocol: WORKLOAD_CONTROL_PROTOCOL,
          state: "running",
          workload,
        },
      })
    ).toBe(false);
  });

  test("refreshes authority state after a failed terminal operation", async () => {
    const workload = {
      serviceId: "support",
      systemId: "support-desk",
      workloadId: "support-api",
    };
    const queryClient = new QueryClient();
    const observation: ConsoleWorkloadObservation = {
      activeOperation: "operation-7",
      capabilities: ["suspend", "resume"],
      observedAtUnixMs: 7,
      observedRevision: "revision-7",
      protection: "controllable",
      protocol: WORKLOAD_CONTROL_PROTOCOL,
      state: "transitioning",
      workload,
    };
    queryClient.setQueryData(consoleWorkloadQueryKey(workload), observation);
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const operation: ConsoleWorkloadOperationRecord = {
      authority: { adapterId: "local-control-adapter", decision: "accepted" },
      decidedAtUnixMs: 7,
      failure: {
        code: "authority_unavailable",
        message: "Workload action failed",
      },
      finishedAtUnixMs: 9,
      operationId: "operation-7",
      phase: "failed",
      protocol: WORKLOAD_CONTROL_PROTOCOL,
      request: {
        action: { kind: "suspend" },
        actor: { kind: "operator", subject: "operator-1" },
        idempotencyKey: "request-7",
        observedRevision: "revision-7",
        protocol: WORKLOAD_CONTROL_PROTOCOL,
        workload,
      },
      requestedAtUnixMs: 7,
      updatedAtUnixMs: 9,
    };

    await reconcileTerminalWorkloadOperation(queryClient, operation);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: consoleWorkloadQueryKey(workload),
    });
    expect(queryClient.getQueryData(consoleWorkloadQueryKey(workload))).toEqual(
      observation
    );
  });

  test("normalizes omitted capabilities and maps every mock result action", () => {
    const workload = {
      serviceId: "support",
      systemId: "support-desk",
      workloadId: "support-api",
    };
    expect(
      normalizeConsoleWorkloadObservation({
        activeOperation: null,
        observedAtUnixMs: 1,
        observedRevision: "revision-1",
        protection: "controllable",
        protocol: WORKLOAD_CONTROL_PROTOCOL,
        state: "running",
        workload,
      }).capabilities
    ).toEqual([]);
    expect(workloadResultStateForAction({ kind: "suspend" })).toBe("suspended");
    expect(workloadResultStateForAction({ kind: "resume" })).toBe("running");
    expect(workloadResultStateForAction({ kind: "restart" })).toBe("running");
    expect(
      workloadResultStateForAction({ kind: "scale", targetCapacity: 2 })
    ).toBe("running");
  });

  test("protects only the exact Console and active mock Adapter workloads", () => {
    expect(
      mockWorkloadProtection({
        serviceId: "lenso-console",
        systemId: "support-desk",
        workloadId: "runtime",
      })
    ).toBe("control_plane");
    expect(
      mockWorkloadProtection({
        serviceId: "support-api",
        systemId: "support-desk",
        workloadId: "support-workload-control-adapter",
      })
    ).toBe("control_plane");
    expect(
      mockWorkloadProtection({
        serviceId: "other-service",
        systemId: "other-system",
        workloadId: "support-workload-control-adapter",
      })
    ).toBe("controllable");
    expect(
      mockWorkloadProtection({
        serviceId: "support-api",
        systemId: "support-desk",
        workloadId: "lenso-console",
      })
    ).toBe("controllable");
  });

  test("refreshes authority state after a rejected mutation", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const workload = {
      serviceId: "support",
      systemId: "support-desk",
      workloadId: "support-api",
    };

    await refreshConsoleWorkloadAuthority(queryClient, workload);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: consoleWorkloadQueryKey(workload),
    });
  });
});
