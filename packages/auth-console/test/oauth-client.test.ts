import { expect, test } from "bun:test";

import { createOAuthConsoleClient } from "../src/oauth-client";

// A late consent response from a retired identity must not navigate the newly
// admitted identity, and a retained approval handler must not dispatch a write.
test("OAuth client fences retired identities before dispatch and after response", async () => {
  let calls = 0,
    current = true;
  const response = Promise.withResolvers<Response>();
  const client = createOAuthConsoleClient({
    basePath: "/oauth",
    isCurrent: () => current,
    async fetch() {
      calls += 1;
      return response.promise;
    },
  });
  const { signal } = new AbortController();
  const pending = client.consent("synthetic-request", signal);
  current = false;
  response.resolve(Response.json({ requestId: "synthetic-request" }));
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    client.decide("synthetic-request", true, signal)
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
});

test("OAuth callback rejects executable URLs and foreign API bases", async () => {
  expect(() =>
    createOAuthConsoleClient({
      basePath: "//foreign.invalid/oauth",
      isCurrent: () => true,
      fetch,
    })
  ).toThrow();
  const client = createOAuthConsoleClient({
    basePath: "/oauth",
    isCurrent: () => true,
    async fetch() {
      return Response.json({ redirect: ["javascript", "alert(1)"].join(":") });
    },
  });
  await expect(
    client.decide("synthetic-request", true, new AbortController().signal)
  ).rejects.toThrow("Invalid OAuth callback");
});
