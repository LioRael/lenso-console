import { describe, expect, test } from "bun:test";

import {
  consolePluginDescriptorSchema,
  type ConsolePluginDescriptor,
  type ConsoleTargetDescriptor,
  type ConsoleOperationDescriptor,
} from "@lenso/console-sdk/protocol";

import { loadCatalog } from "../src/catalog-loader";
import { findCatalogPlugin } from "../src/plugin-manager";
import { isCurrentCatalogRequest, projectCatalog } from "../src/react";

const target: ConsoleTargetDescriptor = { id: "app-a", label: "Application A" };
const plugin: ConsolePluginDescriptor = {
  id: "orders",
  targetId: "app-a",
  configuration: {
    state: "resolved",
    writable: false,
    fields: [{ path: ["token"], sourceIds: ["secret-store"], sensitive: true }],
    sources: [{ id: "secret-store", kind: "secret" }],
  },
};
const operation: ConsoleOperationDescriptor = {
  key: "orders.list",
  targetId: "app-a",
  pluginId: "orders",
  method: "list",
  description: "List visible orders",
  effect: "read",
  schemaAvailability: "available",
  confirmation: false,
  approval: false,
  available: true,
};

describe("catalog projection", () => {
  test("detail lookup keeps duplicate plugin IDs and operations target-qualified", () => {
    const otherTarget = { id: "app/b", label: "Application B" };
    const otherPlugin = {
      ...plugin,
      targetId: otherTarget.id,
      configuration: { ...plugin.configuration, state: "unavailable" as const },
    };
    const otherOperation = {
      ...operation,
      targetId: otherTarget.id,
      description: "List Application B orders",
    };
    const snapshot = projectCatalog(
      [target, otherTarget],
      [plugin, otherPlugin],
      [operation, otherOperation]
    );
    const selected = findCatalogPlugin(snapshot, "app/b", "orders");
    expect(selected?.target).toBe(otherTarget);
    expect(selected?.plugin).toBe(otherPlugin);
    expect(selected?.operations).toEqual([otherOperation]);
    expect(findCatalogPlugin(snapshot, "app-a", "orders")?.operations).toEqual([
      operation,
    ]);
    expect(findCatalogPlugin(snapshot, "missing", "orders")).toBeUndefined();
    expect(findCatalogPlugin(snapshot, "app-a", "missing")).toBeUndefined();
  });

  test("rejects configuration values outside the redacted protocol DTO", () => {
    expect(
      consolePluginDescriptorSchema.safeParse({
        ...plugin,
        configuration: { ...plugin.configuration, value: "secret" },
      }).success
    ).toBe(false);
  });

  test("discards results from aborted or stale activations", () => {
    const controller = new AbortController();
    const activation = { isCurrent: () => false };
    expect(isCurrentCatalogRequest(true, activation, controller.signal)).toBe(
      false
    );
    expect(
      isCurrentCatalogRequest(
        false,
        { isCurrent: () => true },
        controller.signal
      )
    ).toBe(false);
    controller.abort();
    expect(
      isCurrentCatalogRequest(
        true,
        { isCurrent: () => true },
        controller.signal
      )
    ).toBe(false);
  });
});

type CatalogClient = Parameters<typeof loadCatalog>[0];

function deferred() {
  let complete!: () => void;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: complete };
}

function client(overrides: Partial<CatalogClient> = {}): CatalogClient {
  return {
    targets: async () => ({ schemaVersion: 1, targets: [target] }),
    plugins: async () => ({ schemaVersion: 1, plugins: [plugin] }),
    catalog: async () => ({
      schemaVersion: 1,
      revision: "test",
      operations: [operation],
    }),
    ...overrides,
  };
}

describe("catalog loading", () => {
  test("a malformed target list cannot become an empty successful catalog", async () => {
    const malformed = {} as unknown as ConsoleTargetDescriptor[];
    await expect(
      loadCatalog(
        client({
          targets: async () => ({ schemaVersion: 1, targets: malformed }),
        }),
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(TypeError);
  });

  test("starts catalog before plugins finish and preserves target order", async () => {
    const pending = deferred();
    const catalogStarted = deferred();
    const otherTarget = { id: "app-b", label: "Application B" };
    const loading = loadCatalog(
      client({
        targets: async () => ({
          schemaVersion: 1,
          targets: [target, otherTarget],
        }),
        plugins: async ({ targetId }) => {
          if (targetId === target.id) {
            await pending.promise;
          }
          return {
            schemaVersion: 1,
            plugins: [{ ...plugin, targetId }],
          };
        },
        catalog: async ({ targetId }) => {
          catalogStarted.resolve();
          return {
            schemaVersion: 1,
            revision: "test",
            operations: [{ ...operation, targetId: targetId! }],
          };
        },
      }),
      new AbortController().signal
    );
    await catalogStarted.promise;
    pending.resolve();
    const snapshot = await loading;
    expect(snapshot.targets).toEqual([target, otherTarget]);
    expect(snapshot.plugins.map((item) => item.targetId)).toEqual([
      target.id,
      otherTarget.id,
    ]);
    expect(snapshot.operations.map((item) => item.targetId)).toEqual([
      target.id,
      otherTarget.id,
    ]);
  });

  test("bounds fan-out and does not start queued targets after cancellation", async () => {
    const pending = deferred();
    const full = deferred();
    const signals: AbortSignal[] = [];
    const started: string[] = [];
    let active = 0;
    let peak = 0;
    const read = async (id: string, signal: AbortSignal) => {
      started.push(id);
      signals.push(signal);
      active += 1;
      peak = Math.max(peak, active);
      if (active === 8) {
        full.resolve();
      }
      await pending.promise;
      active -= 1;
    };
    const controller = new AbortController();
    const loading = loadCatalog(
      client({
        targets: async () => ({
          schemaVersion: 1,
          targets: Array.from({ length: 9 }, (_, i) => ({
            id: `app-${i}`,
            label: `Application ${i}`,
          })),
        }),
        plugins: async ({ targetId }, options) => {
          await read(targetId, options!.signal!);
          return { schemaVersion: 1, plugins: [] };
        },
        catalog: async ({ targetId }, options) => {
          await read(targetId!, options!.signal!);
          return { schemaVersion: 1, revision: "test", operations: [] };
        },
      }),
      controller.signal
    );
    await full.promise;
    const reason = new Error("retired page");
    controller.abort(reason);
    pending.resolve();
    await expect(loading).rejects.toBe(reason);
    expect(peak).toBe(8);
    expect(started).toHaveLength(8);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  test("a synchronous read failure cancels its sibling without hiding the page error", async () => {
    const siblingAborted = deferred();
    const failure = new Error("plugin read failed");
    const scope = new AbortController();
    const loading = loadCatalog(
      client({
        plugins: () => {
          throw failure;
        },
        catalog: async (_, options) => {
          const signal = options!.signal!;
          return new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                siblingAborted.resolve();
                reject(signal.reason);
              },
              { once: true }
            );
          });
        },
      }),
      scope.signal
    );
    await expect(loading).rejects.toBe(failure);
    await siblingAborted.promise;
    expect(scope.signal.aborted).toBe(false);
    expect(
      isCurrentCatalogRequest(true, { isCurrent: () => true }, scope.signal)
    ).toBe(true);
  });
});
