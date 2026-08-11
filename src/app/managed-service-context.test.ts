import { describe, expect, test } from "vitest";

import { mockManagedServices } from "../data/mock-services";
import {
  createManagedServiceContext,
  managedServiceContextKey,
  sameManagedServiceContext,
} from "./managed-service-context";

describe("Managed Service Context", () => {
  test("binds the selected Service, actor, Module, and delegated capabilities", () => {
    const service = mockManagedServices[0]!;
    const context = createManagedServiceContext({
      actor: { kind: "user", user_id: "operator-1" },
      callerModuleId: "acme/support-console",
      capabilities: ["support.endpoint.write", "support.endpoint.read"],
      service,
      systemId: "system-1",
    });

    expect(context).toMatchObject({
      systemId: "system-1",
      serviceId: service.serviceId,
      callerModuleId: "acme/support-console",
      delegatedActorSubject: "operator-1",
      capabilities: ["support.endpoint.read", "support.endpoint.write"],
    });
  });

  test("binds the exact connected System when one Service belongs to multiple Systems", () => {
    const service = {
      ...mockManagedServices[0]!,
      coreDocument: { systemId: "provider-owned-system" },
    };
    const createForSystem = (systemId: string) =>
      createManagedServiceContext({
        actor: { kind: "user", user_id: "operator-1" },
        callerModuleId: "acme/support-console",
        capabilities: ["support.endpoint.read"],
        service,
        systemId,
      });

    const supportDesk = createForSystem("support-desk/production");
    const supportSandbox = createForSystem("support-sandbox/acceptance");

    expect(supportDesk.systemId).toBe("support-desk/production");
    expect(supportSandbox.systemId).toBe("support-sandbox/acceptance");
    expect(managedServiceContextKey(supportDesk)).not.toBe(
      managedServiceContextKey(supportSandbox)
    );
  });

  test("treats Service environment and delegated authority changes as a new context", () => {
    const service = mockManagedServices[0]!;
    const context = createManagedServiceContext({
      actor: { kind: "user", user_id: "operator-1" },
      callerModuleId: "acme/support-console",
      capabilities: ["support.endpoint.read"],
      service,
      systemId: "system-1",
    });
    const changed = {
      ...context,
      environmentId: `${context.environmentId}-next`,
    };

    expect(managedServiceContextKey(context)).not.toBe(
      managedServiceContextKey(changed)
    );
    expect(sameManagedServiceContext(context, changed)).toBe(false);

    const changedAuthority = {
      ...context,
      delegatedAuthorityDigest: `sha256:${"e".repeat(64)}` as const,
    };
    expect(managedServiceContextKey(context)).not.toBe(
      managedServiceContextKey(changedAuthority)
    );
  });
});
