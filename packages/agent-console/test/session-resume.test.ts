import { expect, test } from "bun:test";

import {
  createAgentSessionResume,
  type AgentResumeScope,
} from "../src/session-resume";

function host() {
  let snapshot: AgentResumeScope = {
    projectId: "alpha",
    session: { state: "ready", scopeKey: "verified-alice-alpha" },
  };
  const data = new Map<string, string>();
  const listeners = new Set<() => void>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    scope,
    storage,
    data,
    change(next: AgentResumeScope) {
      snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
test("one scoped ID survives a fresh owner; logout/project/subject transitions clear it without an open Dock", async () => {
  const h = host();
  const { signal } = new AbortController();
  let resume = createAgentSessionResume({ key: "agent", ...h });
  const a = resume.getScope()!;
  await resume.save(a, "session-a", signal);
  expect(h.data.size).toBe(1);
  const raw = [...h.data.values()][0]!;
  expect(raw).not.toContain("alice");
  expect(raw).not.toContain("alpha");
  resume.dispose();
  resume = createAgentSessionResume({ key: "agent", ...h });
  expect(await resume.read(a, signal)).toBe("session-a");
  h.change({
    projectId: "beta",
    session: { state: "ready", scopeKey: "verified-alice-beta" },
  });
  expect(h.data.size).toBe(0);
  const b = resume.getScope()!;
  await resume.save(b, "session-b", signal);
  expect(() => resume.clear(a)).toThrow();
  expect(await resume.read(b, signal)).toBe("session-b");
  h.change({
    projectId: "beta",
    session: { state: "ready", scopeKey: "verified-bob-beta" },
  });
  expect(h.data.size).toBe(0);
  await resume.save(resume.getScope()!, "session-bob", signal);
  h.change({
    projectId: "beta",
    session: { state: "authentication-required", scopeKey: "signed-out" },
  });
  expect(h.data.size).toBe(0);
  expect(resume.getScope()).toBeUndefined();
  resume.dispose();
});
test("untrusted scopes, malformed records and late writes fail closed; initial auth loading cannot disclose an ID", async () => {
  const h = host();
  const { signal } = new AbortController();
  const resume = createAgentSessionResume({ key: "agent", ...h });
  const a = resume.getScope()!;
  const pending = resume.save(a, "old-session", signal);
  h.change({
    projectId: "beta",
    session: { state: "ready", scopeKey: "verified-beta" },
  });
  await expect(pending).rejects.toThrow();
  expect(h.data.size).toBe(0);
  const beta = resume.getScope()!;
  const aba = resume.save(beta, "late-beta-session", signal);
  h.change({
    projectId: "gamma",
    session: { state: "ready", scopeKey: "verified-gamma" },
  });
  h.change({
    projectId: "beta",
    session: { state: "ready", scopeKey: "verified-beta" },
  });
  await expect(aba).rejects.toThrow();
  expect(h.data.size).toBe(0);
  h.storage.setItem(
    "lenso.agent-session.v1:agent",
    JSON.stringify(["forged", "foreign-session"])
  );
  expect(await resume.read(resume.getScope()!, signal)).toBeUndefined();
  expect(h.data.size).toBe(0);
  h.change({ projectId: "", session: { state: "ready", scopeKey: "local" } });
  expect(resume.getScope()).toBeUndefined();
  await expect(resume.read(a, signal)).rejects.toThrow();
  resume.dispose();
});

test("initial authentication loading preserves the hint without permitting a read until verified", async () => {
  const h = host();
  const { signal } = new AbortController();
  let resume = createAgentSessionResume({ key: "agent", ...h });
  const scope = resume.getScope()!;
  await resume.save(scope, "saved-session", signal);
  resume.dispose();
  h.change({ projectId: "", session: { state: "loading", scopeKey: "" } });
  resume = createAgentSessionResume({ key: "agent", ...h });
  expect(h.data.size).toBe(1);
  expect(resume.getScope()).toBeUndefined();
  await expect(resume.read(scope, signal)).rejects.toThrow();
  h.change({
    projectId: "alpha",
    session: { state: "ready", scopeKey: "verified-alice-alpha" },
  });
  expect(await resume.read(scope, signal)).toBe("saved-session");
  resume.dispose();
});
