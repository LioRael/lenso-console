import { describe, expect, test } from "vitest";

import { consoleCapabilitiesForManagedService } from "./console-admin-context";
import { createConsoleModuleClient } from "./console-module-client";

const digest =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("console module client", () => {
  test("exposes wildcard Console authority through the public capability API", () => {
    const client = createConsoleModuleClient({
      capabilities: ["*"],
      managedServiceContext: {
        capabilities: ["*"],
        callerModuleId: "support/tickets",
        delegatedActorSubject: "usr_operator",
        delegatedAuthorityDigest: digest,
        environmentId: "support-desk",
        serviceId: "support-ticket",
        systemId: "support-desk",
        targetServicePrincipal: "svc.support-ticket",
      },
      moduleId: "support/tickets",
      moduleReleaseDigest: digest,
      navigate: () => undefined,
      requiredCapabilities: ["console.module.business.read"],
      uiArtifactDigest: digest,
    });

    expect(client.capabilities.has("console.module.business.read")).toBe(true);
  });

  test("exposes grant-only authority for the exact selected Service", () => {
    const capabilities = consoleCapabilitiesForManagedService(
      {
        actor: { kind: "user", user_id: "usr_operator" },
        capabilities: [],
        managed_service_capabilities: {
          "billing-service": ["console.module.business.write"],
          "support-service": ["console.module.business.read"],
        },
        scopes: [],
      },
      "support-service"
    );
    const managedServiceContext = {
      capabilities,
      callerModuleId: "support/tickets",
      delegatedActorSubject: "usr_operator",
      delegatedAuthorityDigest: digest,
      environmentId: "acceptance",
      serviceId: "support-service",
      systemId: "support-desk",
      targetServicePrincipal: "svc.support-service",
    };
    const client = createConsoleModuleClient({
      capabilities,
      managedServiceContext,
      moduleId: "support/tickets",
      moduleReleaseDigest: digest,
      navigate: () => undefined,
      requiredCapabilities: ["console.module.business.read"],
      uiArtifactDigest: digest,
    });

    expect(client.capabilities.list()).toEqual([
      "console.module.business.read",
    ]);
    expect(client.capabilities.has("console.module.business.read")).toBe(true);
    expect(client.capabilities.has("console.module.business.write")).toBe(
      false
    );
  });
});
