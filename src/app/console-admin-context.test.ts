import { describe, expect, test } from "vitest";

import {
  consoleAdminActorLabel,
  consoleCapabilitiesForManagedService,
} from "./console-admin-context";

describe("console admin context", () => {
  test("formats admin actor labels", () => {
    expect(
      consoleAdminActorLabel({
        kind: "service",
        service_id: "admin",
      })
    ).toBe("service:admin");
    expect(
      consoleAdminActorLabel({
        kind: "user",
        user_id: "usr_admin",
      })
    ).toBe("user:usr_admin");
    expect(consoleAdminActorLabel({ kind: "system" })).toBe("system");
  });

  test("keeps grant-only authority partitioned by exact Managed Service", () => {
    const context = {
      actor: { kind: "user" as const, user_id: "usr_operator" },
      capabilities: [],
      managed_service_capabilities: {
        "billing-service": ["console.module.business.write"],
        "support-service": ["console.module.business.read"],
      },
      scopes: [],
    };

    expect(
      consoleCapabilitiesForManagedService(context, "support-service")
    ).toEqual(["console.module.business.read"]);
    expect(
      consoleCapabilitiesForManagedService(context, "billing-service")
    ).toEqual(["console.module.business.write"]);
    expect(
      consoleCapabilitiesForManagedService(context, "other-service")
    ).toEqual([]);
  });
});
