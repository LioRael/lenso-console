import { describe, expect, test } from "vitest";

import {
  consoleCapabilityProvider,
  parseDevAuthTokenScopes,
} from "./console-capabilities";

describe("console capabilities", () => {
  test("parses scopes from development service tokens", () => {
    expect(
      parseDevAuthTokenScopes(
        "dev-service:admin:runtime.stories.read,identity.users.read"
      )
    ).toEqual(["runtime.stories.read", "identity.users.read"]);
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
        authToken: "dev-service:admin:runtime.stories.read,identity.users.read",
      })
    ).toEqual(["runtime.stories.read", "identity.users.read"]);
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
    ).toEqual(["runtime.stories.read", "identity.users.read"]);
  });
});
