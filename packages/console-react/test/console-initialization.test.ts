import { expect, test } from "bun:test";

import { parseConsoleInitializationStatus } from "../src/console-initialization-model";

// A transport timeout or malformed callback must never become a new-instance
// claim, and even safe status callbacks must not carry arbitrary values into UI.
test("setup projection rejects uncertain states and strips callback extras", () => {
  const pending = {
    schemaVersion: 1,
    state: "awaiting_activation",
    revision: "revision-1",
    blockers: [{ code: "activation-failed", message: "SYNTHETIC_SECRET" }],
    nextAction: "activate",
    input: { password: "SYNTHETIC_SECRET" },
  };
  const result = parseConsoleInitializationStatus(pending);
  expect(result).toEqual({
    schemaVersion: 1,
    state: "awaiting_activation",
    revision: "revision-1",
    blockers: [{ code: "activation-failed" }],
    nextAction: "activate",
  });
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SECRET");
  for (const value of [
    undefined,
    {},
    { ...pending, schemaVersion: 2 },
    { ...pending, revision: null },
    { ...pending, state: "ready" },
    { ...pending, blockers: [{ code: "unknown" }] },
    { ...pending, state: "uninitialized", nextAction: "apply" },
  ]) {
    expect(() => parseConsoleInitializationStatus(value)).toThrow();
  }
});
