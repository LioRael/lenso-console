import { describe, expect, it } from "vitest";

import type { ManagedServiceTarget } from "./client.js";
import { runtimeObservabilityProtocol } from "./contracts.js";
import {
  systemPlaneCoreProtocol,
  type CoreDocument,
} from "./core-contracts.js";
import {
  ManagedServiceRegistry,
  type ManagedServiceRegistryRecord,
  type ManagedServiceRegistryStore,
} from "./registry.js";
import {
  CoreRuntimeObservabilityTargetResolver,
  type SystemPlaneCoreSource,
} from "./target-resolver.js";
import { SystemPlaneClientError } from "./transport.js";

const now = 1_900_000_000_000;
const schemaDigest = `sha256:${"b".repeat(64)}`;
const target: ManagedServiceTarget = {
  baseUrl: "https://support.internal/",
  capability: {
    contractId: runtimeObservabilityProtocol,
    endpoint: "/system-plane/v1/runtime-observability",
    featureIds: ["queue-summary", "recovery-feed"],
    schemaDigest: `sha256:${"a".repeat(64)}`,
  },
  serviceId: "support",
  servicePrincipal: "service:support",
  serviceRevision: "release:one",
};

const document: CoreDocument = {
  capabilities: [
    {
      contractId: runtimeObservabilityProtocol,
      endpoint: "/system-plane/v1/runtime-observability",
      featureIds: ["queue-summary", "recovery-feed"],
      majorVersion: 1,
      schemaDigest,
    },
  ],
  protocol: systemPlaneCoreProtocol,
  serviceId: "support",
  servicePrincipal: "service:support",
  serviceRevision: "release:two",
};

describe("CoreRuntimeObservabilityTargetResolver", () => {
  it("persists fresh Core discovery and returns the negotiated target", async () => {
    const store = new MemoryRegistryStore(activeRecord());
    const source = new CoreSource(document);
    const resolver = createResolver(store, source);

    await expect(resolver.refresh(target, now + 5000)).resolves.toMatchObject({
      capability: { schemaDigest },
      serviceRevision: "release:two",
    });
    expect(source.calls).toBe(1);
    expect(store.record).toMatchObject({
      connectionState: "ready",
      coreDocument: document,
      version: 2,
    });
  });

  it("records incompatible when required feature negotiation fails", async () => {
    const store = new MemoryRegistryStore(activeRecord());
    const source = new CoreSource({
      ...document,
      capabilities: [
        { ...document.capabilities[0]!, featureIds: ["queue-summary"] },
      ],
    });
    const resolver = createResolver(store, source);

    await expect(resolver.refresh(target, now + 5000)).rejects.toMatchObject({
      kind: "configuration",
      serviceCode: "runtime_observability_features_missing",
    });
    expect(store.record).toMatchObject({
      connectionState: "incompatible",
      lastErrorCode: "runtime_observability_features_missing",
    });
  });

  it("records one Core transport failure as unavailable", async () => {
    const store = new MemoryRegistryStore(activeRecord());
    const source = new CoreSource(
      new SystemPlaneClientError("transport", "offline")
    );
    const resolver = createResolver(store, source);

    await expect(resolver.refresh(target, now + 5000)).rejects.toMatchObject({
      kind: "transport",
    });
    expect(store.record).toMatchObject({
      connectionState: "unavailable",
      lastErrorCode: "system_plane_transport",
    });
  });

  it("rejects expired enrollment before contacting the managed Service", async () => {
    const store = new MemoryRegistryStore({
      ...activeRecord(),
      enrollmentExpiresAtUnixMs: now,
    });
    const source = new CoreSource(document);
    const resolver = createResolver(store, source);

    await expect(resolver.refresh(target, now + 5000)).rejects.toMatchObject({
      kind: "configuration",
      serviceCode: "managed_service_enrollment_expired",
    });
    expect(source.calls).toBe(0);
  });
});

function activeRecord(): ManagedServiceRegistryRecord {
  return {
    authorizationEpoch: 3,
    baseUrl: "https://support.internal/",
    connectionState: "never_observed",
    enrollmentExpiresAtUnixMs: now + 60_000,
    enrollmentGrantRevision: 2,
    enrollmentReceiptDigest: `sha256:${"c".repeat(64)}`,
    enrollmentState: "active",
    serviceId: "support",
    servicePrincipal: "service:support",
    version: 1,
  };
}

function createResolver(
  store: MemoryRegistryStore,
  core: SystemPlaneCoreSource
): CoreRuntimeObservabilityTargetResolver {
  return new CoreRuntimeObservabilityTargetResolver({
    core,
    registry: new ManagedServiceRegistry({
      consoleServiceId: "lenso-console",
      consoleServicePrincipal: "service:lenso-console",
      now: () => now,
      store,
    }),
  });
}

class CoreSource implements SystemPlaneCoreSource {
  readonly #result: CoreDocument | SystemPlaneClientError;
  calls = 0;

  constructor(result: CoreDocument | SystemPlaneClientError) {
    this.#result = result;
  }

  discover(): Promise<CoreDocument> {
    this.calls += 1;
    return this.#result instanceof SystemPlaneClientError
      ? Promise.reject(this.#result)
      : Promise.resolve(this.#result);
  }
}

class MemoryRegistryStore implements ManagedServiceRegistryStore {
  record: ManagedServiceRegistryRecord;

  constructor(record: ManagedServiceRegistryRecord) {
    this.record = record;
  }

  get(serviceId: string): Promise<ManagedServiceRegistryRecord | undefined> {
    return Promise.resolve(
      serviceId === this.record.serviceId ? this.record : undefined
    );
  }

  insert(): Promise<ManagedServiceRegistryRecord> {
    throw new Error("not used");
  }

  recordCore(
    expectedVersion: number,
    _serviceId: string,
    coreDocument: CoreDocument,
    coreObservedAt: string,
    connectionState: "ready" | "incompatible",
    lastErrorCode?: string
  ): Promise<ManagedServiceRegistryRecord> {
    this.expectVersion(expectedVersion);
    this.record = {
      ...this.record,
      connectionState,
      coreDocument,
      coreObservedAt,
      ...(lastErrorCode === undefined ? {} : { lastErrorCode }),
      version: this.record.version + 1,
    };
    return Promise.resolve(this.record);
  }

  recordFailure(
    expectedVersion: number,
    _serviceId: string,
    connectionState: "unavailable" | "incompatible",
    lastErrorCode: string
  ): Promise<ManagedServiceRegistryRecord> {
    this.expectVersion(expectedVersion);
    this.record = {
      ...this.record,
      connectionState,
      lastErrorCode,
      version: this.record.version + 1,
    };
    return Promise.resolve(this.record);
  }

  private expectVersion(expectedVersion: number): void {
    if (expectedVersion !== this.record.version) {
      throw new Error("concurrent registry change");
    }
  }
}
