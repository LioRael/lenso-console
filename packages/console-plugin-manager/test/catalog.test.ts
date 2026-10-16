import { describe, expect, test } from "bun:test";

import {
  consolePluginDescriptorSchema,
  type ConsolePluginDescriptor,
  type ConsoleTargetDescriptor,
  type ConsoleOperationDescriptor,
} from "@lenso/console-sdk/protocol";

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
