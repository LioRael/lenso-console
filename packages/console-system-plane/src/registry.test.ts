import { describe, expect, it } from "vitest";

import {
  ManagedServiceRegistry,
  ManagedServiceRegistryError,
  type ManagedServiceRegistration,
  type ManagedServiceRegistryRecord,
  type ManagedServiceRegistryStore,
} from "./registry.js";

const now = 1_900_000_000_000;
const registration: ManagedServiceRegistration = {
  authorizationEpoch: 3,
  baseUrl: "https://support.internal",
  enrollmentExpiresAtUnixMs: now + 60_000,
  enrollmentGrantRevision: 2,
  enrollmentReceiptDigest: `sha256:${"a".repeat(64)}`,
  serviceId: "support",
  servicePrincipal: "service:support",
};

describe("ManagedServiceRegistry", () => {
  it("persists a normalized independently enrolled Service Reference", async () => {
    const store = new MemoryRegistryStore();
    const registry = createRegistry(store);

    await expect(registry.register(registration)).resolves.toMatchObject({
      baseUrl: "https://support.internal/",
      connectionState: "never_observed",
      enrollmentState: "active",
      serviceId: "support",
      version: 1,
    });
  });

  it("prevents the Console Service from registering itself", async () => {
    const registry = createRegistry(new MemoryRegistryStore());

    await expect(
      registry.register({
        ...registration,
        serviceId: "lenso-console",
        servicePrincipal: "service:lenso-console",
      })
    ).rejects.toMatchObject({ code: "console_service_self_registration" });
  });

  it("rejects revoked and expired enrollments before discovery", async () => {
    const store = new MemoryRegistryStore();
    const registry = createRegistry(store);
    await registry.register(registration);
    const current = store.records.get("support");
    if (current === undefined) {
      throw new Error("missing registry fixture");
    }
    store.records.set("support", { ...current, enrollmentState: "revoked" });
    await expect(registry.active("support")).rejects.toBeInstanceOf(
      ManagedServiceRegistryError
    );
    store.records.set("support", {
      ...current,
      enrollmentExpiresAtUnixMs: now,
    });
    await expect(registry.active("support")).rejects.toMatchObject({
      code: "managed_service_enrollment_expired",
    });
  });
});

function createRegistry(
  store: ManagedServiceRegistryStore
): ManagedServiceRegistry {
  return new ManagedServiceRegistry({
    consoleServiceId: "lenso-console",
    consoleServicePrincipal: "service:lenso-console",
    now: () => now,
    store,
  });
}

class MemoryRegistryStore implements ManagedServiceRegistryStore {
  readonly records = new Map<string, ManagedServiceRegistryRecord>();

  get(serviceId: string): Promise<ManagedServiceRegistryRecord | undefined> {
    return Promise.resolve(this.records.get(serviceId));
  }

  insert(
    value: ManagedServiceRegistration
  ): Promise<ManagedServiceRegistryRecord> {
    const record: ManagedServiceRegistryRecord = {
      ...value,
      connectionState: "never_observed",
      enrollmentState: "active",
      version: 1,
    };
    this.records.set(value.serviceId, record);
    return Promise.resolve(record);
  }

  recordCore(): Promise<ManagedServiceRegistryRecord> {
    throw new Error("not used");
  }

  recordFailure(): Promise<ManagedServiceRegistryRecord> {
    throw new Error("not used");
  }
}
