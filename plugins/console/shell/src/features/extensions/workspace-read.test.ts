import { expect, test } from "vitest";

import { snapshotReadValue } from "../../../../../../packages/console-authoring/src/read";
import { resolveReadRefreshPolicy } from "../../../../../../packages/console-authoring/src/read-refresh";
import { ConsoleQueryClient } from "../../lib/console-query-client";
import { createWorkspaceReads } from "./workspace-read-client";

test("read parameters are copied independently of mutable page drafts", () => {
  const input = { cursor: "first", filters: { status: "active" } };
  const snapshot = snapshotReadValue(input);
  input.filters.status = "disabled";
  expect(snapshot.filters.status).toBe("active");
  expect(Object.isFrozen(snapshot.filters)).toBe(true);
});

test("new cache/remount fields inherit independently and preserve the legacy 49 policy", () => {
  expect(
    resolveReadRefreshPolicy(
      { focus: "never", staleTimeMs: 10_000 },
      { gcTimeMs: 300_000, remount: "stale" },
      { focus: "always", gcTimeMs: 0 }
    )
  ).toEqual({
    refetchOnWindowFocus: "always",
    staleTime: 10_000,
    gcTime: 0,
    refetchOnMount: true,
  });
  for (const gcTimeMs of [-1, Number.NaN, Number.NEGATIVE_INFINITY]) {
    expect(() => resolveReadRefreshPolicy({ gcTimeMs })).toThrow(TypeError);
  }
});

test("an admitted subject named local cannot substitute for missing realm metadata", () => {
  const client = new ConsoleQueryClient();
  const reads = createWorkspaceReads(client, {
    scopeKey: JSON.stringify(["local"]),
    signal: new AbortController().signal,
    policy: {},
  });
  const attempt = reads.useRead;
  expect(() =>
    attempt({
      key: "private.read",
      params: null,
      read: async () => "not admitted",
    })
  ).toThrow("Scoped reads require admitted Console session metadata");
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
