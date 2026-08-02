import { describe, expect, test } from "vitest";

import {
  consoleCapabilityProvider,
  parseDevAuthTokenScopes,
} from "./console-capabilities";
import {
  consoleSuperadminScope,
  hasConsoleCapability,
} from "./console-capability-matching";

describe("console capabilities", () => {
  test("treats superadmin as a wildcard for Console surfaces", () => {
    expect(
      hasConsoleCapability(
        new Set([consoleSuperadminScope]),
        "runtime.stories.read"
      )
    ).toBe(true);
  });

  test("parses scopes from development service tokens", () => {
    expect(
      parseDevAuthTokenScopes(
        "dev-service:admin:runtime.stories.read,auth.users.read,identity.users.read"
      )
    ).toEqual([
      "runtime.stories.read",
      "auth.users.read",
      "identity.users.read",
    ]);
    expect(
      parseDevAuthTokenScopes("Bearer dev-service:admin:runtime.stories.read")
    ).toEqual(["runtime.stories.read"]);
  });

  test("keeps colons inside capability scope names", () => {
    expect(
      parseDevAuthTokenScopes(
        "dev-service:admin:runtime.stories.read,hello-action:greetings:write"
      )
    ).toEqual(["runtime.stories.read", "hello-action:greetings:write"]);
  });

  test("uses token scopes in API mode", () => {
    expect(
      consoleCapabilityProvider({
        apiMode: true,
        authToken:
          "dev-service:admin:runtime.stories.read,auth.users.read,identity.users.read",
      })
    ).toEqual([
      "runtime.stories.read",
      "auth.users.read",
      "identity.users.read",
    ]);
  });

  test("uses baseline capabilities for opaque API tokens", () => {
    expect(
      consoleCapabilityProvider({
        apiMode: true,
        authToken: "oidc_access_123",
      })
    ).toEqual([
      "runtime.stories.read",
      "auth.users.read",
      "identity.users.read",
    ]);
  });

  test("uses admin context capabilities before token fallbacks", () => {
    expect(
      consoleCapabilityProvider({
        adminContext: {
          actor: {
            kind: "user",
            user_id: "usr_admin",
          },
          capabilities: ["console.admin"],
          scopes: ["console.admin"],
        },
        apiMode: true,
        authToken: "oidc_access_123",
      })
    ).toEqual(["console.admin"]);
  });

  test("has no API-mode capabilities when no auth token is configured", () => {
    expect(
      consoleCapabilityProvider({
        apiMode: true,
        authToken: undefined,
      })
    ).toEqual([]);
  });

  test("keeps local fallback capabilities outside API mode", () => {
    expect(
      consoleCapabilityProvider({
        apiMode: false,
        authToken: "dev-service:admin",
      })
    ).toEqual([
      "runtime.stories.read",
      "auth.users.read",
      "identity.users.read",
      "remote_crm.contacts.read",
      "remote_crm.contacts.sync",
      "console.system-registry.read",
    ]);
  });
});
