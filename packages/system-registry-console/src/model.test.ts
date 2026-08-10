import type { ConsoleManagedService } from "@lenso/console-ui";
import { describe, expect, test } from "vitest";

import {
  enrollmentExpiryLabel,
  filterServiceRows,
  isRecoverableWorkloadOperationPollError,
  isTerminalWorkloadOperation,
  managedServiceRows,
  observationSupersedesMutationOperation,
  registryState,
  registrySummary,
  serviceEndpointLabel,
  servicePresentation,
  shouldClearOperationAuthorityRefresh,
  shouldRetireWorkloadOperation,
  workloadOperationHandle,
} from "./model";

const service = (
  overrides: Partial<ConsoleManagedService> = {}
): ConsoleManagedService => ({
  authorizationEpoch: 0,
  baseUrl: "https://orders.example.com",
  connectionState: "ready",
  enrollmentExpiresAtUnixMs: 2_000_000,
  enrollmentGrantRevision: 1,
  enrollmentReceiptDigest: `sha256:${"a".repeat(64)}`,
  enrollmentState: "active",
  serviceId: "orders",
  servicePrincipal: "service:orders",
  version: 1,
  ...overrides,
});

describe("system registry console model", () => {
  test("places services needing attention before healthy and revoked records", () => {
    expect(
      managedServiceRows([
        service({ serviceId: "ready" }),
        service({ enrollmentState: "revoked", serviceId: "revoked" }),
        service({ connectionState: "unavailable", serviceId: "down" }),
      ]).map((item) => item.serviceId)
    ).toEqual(["down", "ready", "revoked"]);
  });

  test("summarizes authority and connection state separately", () => {
    const services = [
      service(),
      service({ connectionState: "incompatible", serviceId: "billing" }),
      service({ enrollmentState: "revoked", serviceId: "legacy" }),
    ];
    expect(registrySummary(services)).toEqual({
      active: 2,
      attention: 1,
      ready: 1,
      revoked: 1,
      total: 3,
    });
    const incompatible = services.at(1);
    expect(incompatible).toBeDefined();
    expect(registryState(incompatible as ConsoleManagedService)).toEqual({
      label: "Contract incompatible",
      tone: "error",
    });
  });

  test("formats operator-facing endpoint and expiry labels", () => {
    expect(serviceEndpointLabel("https://orders.example.com/v1")).toBe(
      "orders.example.com"
    );
    expect(enrollmentExpiryLabel(3_600_001, 1)).toBe("1h remaining");
    expect(enrollmentExpiryLabel(1, 1)).toBe("Expired");
  });

  test("projects the product inventory order and inspector details", () => {
    const lensoApi = service({
      presentation: {
        composition: [
          "4 Linked modules · 2 workloads",
          "Provides 7 capabilities",
          "Depends on auth + audit-evidence",
        ],
        environment: "prod-eu1",
        owner: "Core",
        posture: { label: "Healthy", tone: "success" },
        secondary: "svc.lenso-api · Core",
        version: "0.3.34",
      },
      serviceId: "lenso-api",
      servicePrincipal: "svc.lenso-api",
    });
    const billing = service({
      serviceId: "billing",
      servicePrincipal: "svc.billing",
    });
    const rows = [
      { presentation: servicePresentation(lensoApi), service: lensoApi },
      { presentation: servicePresentation(billing), service: billing },
    ];

    expect(
      managedServiceRows([
        service({ serviceId: "webhook-relay" }),
        lensoApi,
        service({ serviceId: "billing" }),
      ]).map((item) => item.serviceId)
    ).toEqual(["lenso-api", "billing", "webhook-relay"]);
    expect(servicePresentation(lensoApi)).toMatchObject({
      composition: [
        "4 Linked modules · 2 workloads",
        "Provides 7 capabilities",
        "Depends on auth + audit-evidence",
      ],
      environment: "prod-eu1",
      owner: "Core",
      version: "0.3.34",
    });
    expect(
      filterServiceRows(rows, {
        environment: "prod-eu1",
        owner: "Core",
        posture: "Healthy",
      })
    ).toHaveLength(1);
  });

  test("selects an operation handle from the latest authority state", () => {
    expect(
      workloadOperationHandle({
        mutationOperationId: "operation-7",
        observedActiveOperation: null,
      })
    ).toBe("operation-7");
    expect(
      workloadOperationHandle({
        mutationOperationId: "operation-7",
        observedActiveOperation: "operation-8",
      })
    ).toBe("operation-8");
    expect(
      observationSupersedesMutationOperation({
        authorityRefreshedOperationId: "operation-7",
        mutationOperationId: "operation-7",
        observation: {
          activeOperation: null,
          observedAtUnixMs: 8,
          state: "running",
        },
      })
    ).toBe(true);
    expect(
      observationSupersedesMutationOperation({
        authorityRefreshedOperationId: "operation-7",
        mutationOperationId: "operation-7",
        observation: {
          activeOperation: null,
          observedAtUnixMs: 8,
          state: "unknown",
        },
      })
    ).toBe(false);
    expect(
      shouldClearOperationAuthorityRefresh({
        authorityRefreshedOperationId: "operation-7",
        operation: { operationId: "operation-7", phase: "executing" },
        operationPollingFailed: false,
      })
    ).toBe(true);
    expect(
      shouldClearOperationAuthorityRefresh({
        authorityRefreshedOperationId: "operation-7",
        operation: { operationId: "operation-7", phase: "accepted" },
        operationPollingFailed: true,
      })
    ).toBe(false);
    expect(isTerminalWorkloadOperation({ phase: "executing" })).toBe(false);
    for (const phase of ["denied", "failed", "succeeded"] as const) {
      expect(isTerminalWorkloadOperation({ phase })).toBe(true);
    }
    for (const status of [404, 502, 503]) {
      expect(
        isRecoverableWorkloadOperationPollError(
          Object.assign(new Error("recoverable"), { response: { status } })
        )
      ).toBe(true);
    }
    for (const status of [401, 403, 500]) {
      expect(
        isRecoverableWorkloadOperationPollError(
          Object.assign(new Error("fail closed"), { response: { status } })
        )
      ).toBe(false);
    }
    expect(isRecoverableWorkloadOperationPollError(new Error("network"))).toBe(
      false
    );
    expect(
      shouldClearOperationAuthorityRefresh({
        authorityRefreshedOperationId: "operation-7",
        operation: { operationId: "operation-7", phase: "failed" },
        operationPollingFailed: false,
      })
    ).toBe(false);
    expect(
      observationSupersedesMutationOperation({
        authorityRefreshedOperationId: undefined,
        mutationOperationId: "operation-7",
        observation: {
          activeOperation: null,
          observedAtUnixMs: 8,
          state: "running",
        },
      })
    ).toBe(false);
    for (const state of ["running", "suspended", "failed"] as const) {
      expect(
        shouldRetireWorkloadOperation({ activeOperation: null, state })
      ).toBe(true);
    }
    for (const state of ["transitioning", "unknown"] as const) {
      expect(
        shouldRetireWorkloadOperation({ activeOperation: null, state })
      ).toBe(false);
    }
    expect(
      shouldRetireWorkloadOperation({
        activeOperation: "operation-8",
        state: "running",
      })
    ).toBe(false);
  });
});
