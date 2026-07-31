import { describe, expect, it, vi } from "vitest";

import {
  RuntimeObservabilityClient,
  SystemPlaneClientError,
  type ManagedServiceTarget,
  type SystemPlaneCredentialRequest,
} from "./client.js";
import {
  runtimeObservabilityFeatures,
  runtimeObservabilityProtocol,
} from "./contracts.js";

const schemaDigest = `sha256:${"b".repeat(64)}`;
const target: ManagedServiceTarget = {
  serviceId: "support",
  servicePrincipal: "service:support",
  serviceRevision: "release:one",
  baseUrl: "https://support.internal/",
  capability: {
    contractId: runtimeObservabilityProtocol,
    schemaDigest,
    endpoint: "/system-plane/v1/runtime-observability",
    featureIds: [
      runtimeObservabilityFeatures.queueSummary,
      runtimeObservabilityFeatures.recoveryFeed,
    ],
  },
};

const snapshot = {
  protocol: runtimeObservabilityProtocol,
  serviceId: "support",
  serviceRevision: "release:one",
  snapshotRevision: `sha256:${"a".repeat(64)}`,
  schemaDigest,
  nextCursor: "opaque",
  observedAt: "2026-07-30T10:00:00Z",
  status: "healthy",
  queues: [],
};

describe("RuntimeObservabilityClient", () => {
  it("binds credential audience, feature, endpoint, and absolute deadline", async () => {
    const requests: SystemPlaneCredentialRequest[] = [];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(snapshot)
    );
    const client = new RuntimeObservabilityClient({
      credentials: {
        issue: async (request) => {
          requests.push(request);
          return "workload-token";
        },
      },
      fetch: fetchMock as typeof fetch,
      now: () => 1000,
    });

    await expect(client.snapshot(target, 4000)).resolves.toEqual(snapshot);
    expect(requests).toEqual([
      {
        audience: "service:support",
        contractId: runtimeObservabilityProtocol,
        featureId: runtimeObservabilityFeatures.queueSummary,
        endpoint:
          "https://support.internal/system-plane/v1/runtime-observability",
        deadlineUnixMs: 4000,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: "Bearer workload-token",
      },
    });
  });

  it("does not retry rejection and preserves the Service error code", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { code: "runtime_observation_failed", detail: "Store unavailable" },
        { status: 503 }
      )
    );
    const client = new RuntimeObservabilityClient({
      credentials: { issue: async () => "workload-token" },
      fetch: fetchMock as typeof fetch,
      now: () => 1000,
    });

    const clientError = await client
      .snapshot(target, 4000)
      .catch((error) => error);
    expect(clientError).toBeInstanceOf(SystemPlaneClientError);
    expect(clientError).toMatchObject({
      kind: "http",
      status: 503,
      serviceCode: "runtime_observation_failed",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when response identity differs from Core discovery", async () => {
    const client = new RuntimeObservabilityClient({
      credentials: { issue: async () => "workload-token" },
      fetch: (async () =>
        Response.json({ ...snapshot, serviceId: "billing" })) as typeof fetch,
      now: () => 1000,
    });

    await expect(client.snapshot(target, 4000)).rejects.toMatchObject({
      kind: "contract",
    });
  });

  it("does not start transport after credential issuance consumes the deadline", async () => {
    const fetchMock = vi.fn();
    const times = [1000, 4001];
    const client = new RuntimeObservabilityClient({
      credentials: { issue: () => Promise.resolve("workload-token") },
      fetch: fetchMock as typeof fetch,
      now: () => times.shift() ?? 4001,
    });

    await expect(client.snapshot(target, 4000)).rejects.toMatchObject({
      kind: "deadline",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
