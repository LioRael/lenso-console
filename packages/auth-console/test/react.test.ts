import { expect, test } from "bun:test";

import type { AuthConsoleClient } from "../src/contracts";
import { authConsole } from "../src/react";

function createClient(subjectId: string): AuthConsoleClient {
  return {
    capabilities: {
      info: false,
      sessionList: true,
      sessionDetail: true,
      sessionRevoke: false,
      subjects: false,
    },
    async listSessions() {
      return [{ id: "s", subjectId, realmId: "r", createdAt: 1, expiresAt: 2 }];
    },
    async readSession() {
      return null;
    },
    async revokeSession() {
      throw new Error("must not be exposed");
    },
  };
}

// The server contract cannot prove that unsupported UI routes/navigation are omitted.
test("unsupported capabilities contribute no pages, routes or navigation", () => {
  const binding = authConsole({
    id: "target",
    client: {
      capabilities: {
        info: false,
        sessionList: false,
        sessionDetail: false,
        sessionRevoke: false,
        subjects: false,
      },
    },
    routes: {
      sessions: "/sessions",
      session: "/sessions/:id",
      subjects: "/subjects",
    },
  });
  expect(binding.definition.pages).toEqual({});
  expect(binding.routes).toEqual({});
  expect(binding.definition.navigation).toEqual([]);
});

// Prevents binding A from reusing binding B's target client and producing dead detail links.
test("bindings capture independent clients and hide detail links without a detail route", async () => {
  const a = authConsole({
    id: "a",
    client: createClient("a"),
    routes: { sessions: "/a/sessions" },
  });
  const b = authConsole({
    id: "b",
    client: createClient("b"),
    routes: { sessions: "/b/sessions", session: "/b/sessions/:id" },
  });
  const aSessions = await a.services.listSessions!();
  const bSessions = await b.services.listSessions!();
  expect(aSessions[0]!.subjectId).toBe("a");
  expect(bSessions[0]!.subjectId).toBe("b");
  expect(a.services.capabilities.sessionDetail).toBe(false);
  expect(b.services.capabilities.sessionDetail).toBe(true);
  expect(a.services.revokeSession).toBeUndefined();
  expect(a.definition.pages.subjects).toBeUndefined();
});

// Legacy array-client tests do not catch omitted domain pages or dropped cancellation/CAS options.
test("paginated bindings preserve labels, cursors, cancellation and captured revisions", async () => {
  const calls: unknown[] = [];
  const client: AuthConsoleClient = {
    capabilities: {
      info: false,
      sessionList: true,
      sessionDetail: true,
      sessionRevoke: true,
      subjects: false,
    },
    async listSessionPage(input, options) {
      calls.push({ input, options });
      return { sessions: [], nextCursor: null };
    },
    async readSession() {
      return null;
    },
    async revokeSession(id, options) {
      calls.push({ id, options });
      return { revoked: true, intentId: "intent" };
    },
  };
  const binding = authConsole({
    id: "customer-a",
    label: "Customer A",
    client,
    routes: { sessions: "/a/sessions", session: "/a/sessions/:id" },
  });
  expect(binding.definition.pages.sessions!.title).toBe("Customer A: Sessions");
  expect(binding.services.listSessions).toBeUndefined();
  const { signal } = new AbortController();
  await binding.services.listSessionPage!(
    { limit: 2, cursor: "next" },
    { signal }
  );
  await binding.services.revokeSession!("s", { signal, expectedRevision: 4 });
  expect(calls).toEqual([
    { input: { limit: 2, cursor: "next" }, options: { signal } },
    { id: "s", options: { signal, expectedRevision: 4 } },
  ]);
});
