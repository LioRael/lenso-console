import { expect, test } from "bun:test";

import { createConsoleWorkspaceCredentials } from "../../src/credentials";

// Status-only errors discarded the reconciliation ID after a credential was
// committed but could not be delivered. Never surface a provider's body text.
test("protected credential errors preserve only a valid unknown-outcome reference", async () => {
  const id = "a441ecfa-b499-4aa4-88f8-d5c1fe106ecc";
  for (const [header, status, expected] of [
    [id, 503, id],
    ["private-provider-message", 503, undefined],
    [id, 403, undefined],
  ] as const) {
    const credentials = createConsoleWorkspaceCredentials({
      paths: { issuePath: "/credentials/issue" },
      fetch: async () =>
        new Response("sensitive provider data", {
          status,
          headers: { "x-lenso-audit-intent": header },
        }),
    });
    try {
      await credentials.issue({
        requestedScopes: ["users.read"],
        expiresAt: 1000,
        requestId: "fixture",
      });
      throw new Error("Credential failure was not rejected");
    } catch (error) {
      expect(error).toMatchObject({
        intentId: expected,
        code: expected
          ? "OUTCOME_UNKNOWN"
          : status === 403
            ? "FORBIDDEN"
            : "SERVICE_UNAVAILABLE",
      });
      expect(String(error)).not.toContain("sensitive provider data");
      expect(String(error)).not.toContain("private-provider-message");
    }
  }
});
