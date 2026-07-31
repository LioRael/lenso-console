import { describe, expect, it } from "vitest";

import {
  parseRuntimeObservabilitySnapshot,
  parseRuntimeObservationFeed,
  RuntimeObservationContractError,
  runtimeObservabilityProtocol,
} from "./contracts.js";

const snapshot = {
  protocol: runtimeObservabilityProtocol,
  serviceId: "support",
  serviceRevision: "release:one",
  snapshotRevision: `sha256:${"a".repeat(64)}`,
  schemaDigest: `sha256:${"b".repeat(64)}`,
  nextCursor: "opaque",
  observedAt: "2026-07-30T10:00:00Z",
  status: "degraded",
  queues: [
    {
      queue: "outbox",
      pending: 1,
      active: 0,
      completed: 4,
      failed: 1,
      dead: 0,
      oldestPendingAgeSeconds: 8,
    },
  ],
} as const;

describe("Runtime Observability wire validation", () => {
  it("accepts the committed OpenAPI snapshot shape and rejects extensions", () => {
    expect(parseRuntimeObservabilitySnapshot(snapshot)).toEqual(snapshot);
    expect(() =>
      parseRuntimeObservabilitySnapshot({ ...snapshot, pageRoute: "/queues" })
    ).toThrow(RuntimeObservationContractError);
  });

  it("requires Evidence Gap to be explicit and non-continuous", () => {
    const gap = {
      protocol: runtimeObservabilityProtocol,
      serviceId: "support",
      serviceRevision: "release:two",
      schemaDigest: snapshot.schemaDigest,
      collectedAt: "2026-07-30T10:01:00Z",
      continuity: "reset_required",
      evidenceGap: {
        reason: "service_revision_changed",
        message: "Service revision changed.",
        requiredAction: "fetch_fresh_runtime_observability_snapshot",
      },
      changes: [],
      nextCursor: "",
      hasMore: false,
    } as const;

    expect(parseRuntimeObservationFeed(gap)).toEqual(gap);
    expect(() =>
      parseRuntimeObservationFeed({
        ...gap,
        changes: [
          {
            sequence: 1,
            queue: "outbox",
            resourceId: "event-1",
            changeKind: "deleted",
            recordedAt: "2026-07-30T10:00:30Z",
          },
        ],
      })
    ).toThrow("reset_required feeds must contain only an Evidence Gap");
  });

  it("rejects feeds whose Service-owned sequence does not advance", () => {
    const change = {
      changeKind: "upserted",
      queue: "functions",
      recordedAt: "2026-07-30T10:00:30Z",
      resourceId: "run-1",
      sequence: 2,
    } as const;
    expect(() =>
      parseRuntimeObservationFeed({
        changes: [change, change],
        collectedAt: "2026-07-30T10:01:00Z",
        continuity: "continuous",
        hasMore: false,
        nextCursor: "cursor-2",
        protocol: runtimeObservabilityProtocol,
        schemaDigest: snapshot.schemaDigest,
        serviceId: "support",
        serviceRevision: "release:one",
      })
    ).toThrow("changes must be ordered by strictly increasing sequence");
  });
});
