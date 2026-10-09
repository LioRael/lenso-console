import { expect, test } from "bun:test";

import { createLimits, createMemoryLimitStore } from "@lenso/limits";

import {
  createConsoleLimitsBinding,
  createConsoleLimitsPreAuthGuard,
  withConsoleLimitsLease,
} from "../src/integrations/limits";
import type { ConsoleIdentity, ConsoleResource } from "../src/types";

const identity = {
  actor: { subjectId: "alice" },
  readScope: "scope",
} as ConsoleIdentity;
const resource: ConsoleResource = {
  action: "invoke",
  targetId: "reports",
  tenantId: "north",
  pluginId: "reports",
  operation: "run",
};
const operation = { effect: "read" } as never;
const policy = {
  scope: { instance: "console", tenant: "north", key: "alice:reports:run" },
  capacity: 1,
  quantity: 1,
  periodMs: 60_000,
};

test("binding consumes for verified identity only and delegates the original binding", async () => {
  let now = 60_000;
  const limits = createLimits({
    store: createMemoryLimitStore({ now: () => now }),
    config: { failurePolicy: "throw" },
  });
  let bound = 0;
  const wrapped = createConsoleLimitsBinding({
    limits,
    policy: () => policy,
    binding: () => {
      bound += 1;
      return { context: { preserved: true } } as never;
    },
    onAdmit: ({ identity: verified }) => {
      if (verified !== identity) {
        throw new Error("unauthorized");
      }
    },
  });
  try {
    await expect(
      wrapped(
        operation,
        {},
        new Request("https://console.test"),
        identity,
        resource
      )
    ).resolves.toMatchObject({ context: { preserved: true } });
    await expect(
      wrapped(
        operation,
        {},
        new Request("https://console.test"),
        identity,
        resource
      )
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(
      wrapped(
        operation,
        {},
        new Request("https://console.test"),
        {} as ConsoleIdentity,
        resource
      )
    ).rejects.toThrow("unauthorized");
    now += 60_000;
    await expect(
      wrapped(
        operation,
        {},
        new Request("https://console.test"),
        identity,
        resource
      )
    ).resolves.toBeDefined();
    expect(bound).toBe(2);
  } finally {
    await limits.close();
  }
});

test("pre-auth is opt-in and concurrency wraps service execution with a lease", async () => {
  const limits = createLimits({
    store: createMemoryLimitStore(),
    config: { failurePolicy: "throw" },
  });
  let executions = 0;
  try {
    const guard = createConsoleLimitsPreAuthGuard(limits, () => undefined);
    await guard(new Request("https://console.test/selected"));
    await withConsoleLimitsLease(
      limits,
      { scope: policy.scope, capacity: 1, quantity: 1, ttlMs: 30_000 },
      new Request("https://console.test/selected"),
      async ({ signal }) => {
        expect(signal.aborted).toBe(false);
        executions += 1;
      }
    );
    expect(executions).toBe(1);
  } finally {
    await limits.close();
  }
});
