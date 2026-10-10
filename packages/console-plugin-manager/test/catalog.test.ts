import { describe, expect, test } from "bun:test";

import {
  consolePluginDescriptorSchema,
  type ConsolePluginDescriptor,
  type ConsoleTargetDescriptor,
  type ConsoleOperationDescriptor,
} from "@lenso/console-sdk/protocol";

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
  test("projects target, plugin, and admitted operation metadata", () => {
    const result = projectCatalog([target], [plugin], [operation]);
    expect(result.targets[0]?.id).toBe("app-a");
    expect(result.plugins[0]?.configuration.fields[0]?.sensitive).toBe(true);
    expect(result.operations[0]?.method).toBe("list");
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
