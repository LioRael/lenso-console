import { describe, expect, it } from "vitest";

import { SystemPlaneClientError, type ManagedServiceTarget } from "./client.js";
import {
  runtimeObservabilityProtocol,
  type RuntimeObservabilitySnapshot,
  type RuntimeObservationFeed,
} from "./contracts.js";
import {
  RuntimeObservationReconciler,
  type ReplaceProjectionInput,
  type RuntimeObservationFreshness,
  type RuntimeObservationProjection,
  type RuntimeObservationProjectionStore,
  type RuntimeObservationSource,
} from "./projection.js";

const now = Date.parse("2026-07-30T10:00:30Z");
const schemaDigest = `sha256:${"b".repeat(64)}`;
const target = service("support");

describe("RuntimeObservationReconciler", () => {
  it("initializes from a snapshot and avoids replacing unchanged state", async () => {
    const source = new Source();
    const store = new MemoryStore();
    source.snapshots.push(snapshot("support", "cursor-1"));
    const coordinator = createReconciler(source, store);

    await expect(coordinator.reconcile(target)).resolves.toMatchObject({
      kind: "initialized",
      projection: { cursor: "cursor-1", freshness: "current", version: 1 },
    });
    source.feeds.push(feed("support", "cursor-2"));
    await expect(coordinator.reconcile(target)).resolves.toMatchObject({
      kind: "unchanged",
      projection: { cursor: "cursor-2", version: 2 },
    });
    expect(source.snapshotCalls).toBe(1);
  });

  it("records an Evidence Gap before atomically rebuilding the projection", async () => {
    const source = new Source();
    const store = new MemoryStore();
    source.snapshots.push(snapshot("support", "cursor-1"));
    const coordinator = createReconciler(
      source,
      store,
      service("support", "release:two")
    );
    await coordinator.reconcile(target);
    const gap = {
      reason: "service_revision_changed",
      message: "Service revision changed.",
      requiredAction: "fetch_fresh_runtime_observability_snapshot",
    } as const;
    source.feeds.push({
      ...feed("support", ""),
      serviceRevision: "release:two",
      continuity: "reset_required",
      evidenceGap: gap,
    });
    source.snapshots.push(snapshot("support", "cursor-9", "release:two"));

    await expect(coordinator.reconcile(target)).resolves.toMatchObject({
      kind: "rebuilt_after_gap",
      gap,
      projection: {
        serviceRevision: "release:two",
        cursor: "cursor-9",
        collectionState: "ready",
        lastEvidenceGap: gap,
        version: 3,
      },
    });
    expect(store.transitions).toEqual(["ready", "gap", "ready"]);
  });

  it("isolates one unavailable Service without discarding its last projection", async () => {
    const source = new Source();
    const store = new MemoryStore();
    source.snapshots.push(snapshot("support", "support-1"));
    source.snapshots.push(snapshot("billing", "billing-1"));
    const coordinator = createReconciler(source, store);
    await coordinator.reconcileMany([service("support"), service("billing")]);
    source.failures.set(
      "support",
      new SystemPlaneClientError("transport", "offline")
    );
    source.feeds.push(feed("billing", "billing-1"));

    const outcomes = await coordinator.reconcileMany([
      service("support"),
      service("billing"),
    ]);
    expect(outcomes.get("support")).toMatchObject({
      kind: "unavailable",
      projection: {
        cursor: "support-1",
        collectionState: "unavailable",
      },
    });
    expect(outcomes.get("billing")).toMatchObject({ kind: "unchanged" });
  });

  it("isolates Console Store coordination failure per Service", async () => {
    const source = new Source();
    const store = new MemoryStore();
    store.getFailures.add("support");
    source.snapshots.push(snapshot("billing", "billing-1"));
    const coordinator = createReconciler(source, store);

    const outcomes = await coordinator.reconcileMany([
      service("support"),
      service("billing"),
    ]);
    expect(outcomes.get("support")).toMatchObject({
      kind: "coordinator_failed",
    });
    expect(outcomes.get("billing")).toMatchObject({ kind: "initialized" });
  });
});

function service(
  serviceId: string,
  serviceRevision = "release:one"
): ManagedServiceTarget {
  return {
    serviceId,
    servicePrincipal: `service:${serviceId}`,
    serviceRevision,
    baseUrl: `https://${serviceId}.internal`,
    capability: {
      contractId: runtimeObservabilityProtocol,
      schemaDigest,
      endpoint: "/system-plane/v1/runtime-observability",
      featureIds: ["queue-summary", "recovery-feed"],
    },
  };
}

function snapshot(
  serviceId: string,
  cursor: string,
  serviceRevision = "release:one"
): RuntimeObservabilitySnapshot {
  return {
    protocol: runtimeObservabilityProtocol,
    serviceId,
    serviceRevision,
    snapshotRevision: `sha256:${"a".repeat(64)}`,
    schemaDigest,
    nextCursor: cursor,
    observedAt: "2026-07-30T10:00:00Z",
    status: "healthy",
    queues: [],
  };
}

function feed(serviceId: string, cursor: string): RuntimeObservationFeed {
  return {
    protocol: runtimeObservabilityProtocol,
    serviceId,
    serviceRevision: "release:one",
    schemaDigest,
    collectedAt: "2026-07-30T10:00:31Z",
    continuity: "continuous",
    changes: [],
    nextCursor: cursor,
    hasMore: false,
  };
}

function createReconciler(
  source: Source,
  store: MemoryStore,
  refreshedTarget?: ManagedServiceTarget
): RuntimeObservationReconciler {
  return new RuntimeObservationReconciler({
    client: source,
    store,
    currentForMs: 60_000,
    expiresAfterMs: 300_000,
    now: () => now,
    targetResolver: {
      refresh: (staleTarget) => Promise.resolve(refreshedTarget ?? staleTarget),
    },
  });
}

class Source implements RuntimeObservationSource {
  readonly snapshots: RuntimeObservabilitySnapshot[] = [];
  readonly feeds: RuntimeObservationFeed[] = [];
  readonly failures = new Map<string, SystemPlaneClientError>();
  snapshotCalls = 0;

  async snapshot(
    managedTarget: ManagedServiceTarget
  ): Promise<RuntimeObservabilitySnapshot> {
    this.snapshotCalls += 1;
    const failure = this.failures.get(managedTarget.serviceId);
    if (failure !== undefined) {
      throw failure;
    }
    const value = this.snapshots.shift();
    if (value === undefined) {
      throw new Error("missing snapshot fixture");
    }
    return value;
  }

  async changes(
    managedTarget: ManagedServiceTarget
  ): Promise<RuntimeObservationFeed> {
    const failure = this.failures.get(managedTarget.serviceId);
    if (failure !== undefined) {
      throw failure;
    }
    const index = this.feeds.findIndex(
      (value) => value.serviceId === managedTarget.serviceId
    );
    const [value] = index === -1 ? [] : this.feeds.splice(index, 1);
    if (value === undefined) {
      throw new Error(`missing feed fixture for ${managedTarget.serviceId}`);
    }
    return value;
  }
}

class MemoryStore implements RuntimeObservationProjectionStore {
  readonly records = new Map<string, RuntimeObservationProjection>();
  readonly transitions: string[] = [];
  readonly getFailures = new Set<string>();

  async get(
    serviceId: string
  ): Promise<RuntimeObservationProjection | undefined> {
    if (this.getFailures.has(serviceId)) {
      throw new Error(`Store unavailable for ${serviceId}`);
    }
    return this.records.get(serviceId);
  }

  async replace(
    expectedVersion: number | undefined,
    input: ReplaceProjectionInput
  ): Promise<RuntimeObservationProjection> {
    const current = this.records.get(input.target.serviceId);
    this.expectVersion(input.target.serviceId, current, expectedVersion);
    const projection: RuntimeObservationProjection = {
      serviceId: input.target.serviceId,
      serviceRevision: input.snapshot.serviceRevision,
      contractId: input.target.capability.contractId,
      schemaDigest: input.snapshot.schemaDigest,
      snapshotRevision: input.snapshot.snapshotRevision,
      cursor: input.snapshot.nextCursor,
      observedAt: input.snapshot.observedAt,
      collectedAt: input.collectedAt,
      freshness: input.freshness,
      collectionState: "ready",
      snapshot: input.snapshot,
      ...(input.lastEvidenceGap === undefined
        ? current?.lastEvidenceGap === undefined
          ? {}
          : { lastEvidenceGap: current.lastEvidenceGap }
        : { lastEvidenceGap: input.lastEvidenceGap }),
      version: (current?.version ?? 0) + 1,
    };
    this.records.set(input.target.serviceId, projection);
    this.transitions.push("ready");
    return projection;
  }

  async markChecked(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    freshness: RuntimeObservationFreshness,
    cursor: string
  ): Promise<RuntimeObservationProjection> {
    return this.update(expectedVersion, serviceId, {
      collectedAt,
      cursor,
      freshness,
      collectionState: "ready",
    });
  }

  async recordGap(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    lastEvidenceGap: NonNullable<
      RuntimeObservationProjection["lastEvidenceGap"]
    >
  ): Promise<RuntimeObservationProjection> {
    return this.update(expectedVersion, serviceId, {
      collectedAt,
      collectionState: "gap",
      lastEvidenceGap,
    });
  }

  async recordUnavailable(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    lastFailureCode: string,
    freshness: RuntimeObservationFreshness
  ): Promise<RuntimeObservationProjection> {
    return this.update(expectedVersion, serviceId, {
      collectedAt,
      freshness,
      collectionState: "unavailable",
      lastFailureCode,
    });
  }

  private update(
    expectedVersion: number,
    serviceId: string,
    patch: Partial<RuntimeObservationProjection>
  ): RuntimeObservationProjection {
    const current = this.records.get(serviceId);
    this.expectVersion(serviceId, current, expectedVersion);
    const updated = { ...current!, ...patch, version: expectedVersion + 1 };
    this.records.set(serviceId, updated);
    this.transitions.push(updated.collectionState);
    return updated;
  }

  private expectVersion(
    serviceId: string,
    current: RuntimeObservationProjection | undefined,
    expectedVersion: number | undefined
  ): void {
    if (current?.version !== expectedVersion) {
      throw new Error(`concurrent projection change for ${serviceId}`);
    }
  }
}
