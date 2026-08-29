import { describe, expect, it } from "vitest";

import {
  decodePluginManagement,
  demoPluginInventory,
  demoPluginManagement,
  pluginWorkbenchItems,
} from "./plugin-workbench-model";

describe("Plugin workbench management model", () => {
  it("decodes the Host-authorized management contract", () => {
    expect(decodePluginManagement(demoPluginManagement)).toEqual(
      demoPluginManagement
    );
  });

  it("joins desired Plugin Root state to active technical inventory", () => {
    const [plugin] = pluginWorkbenchItems(
      demoPluginInventory,
      demoPluginManagement
    );

    expect(plugin).toMatchObject({
      active: { executionClass: "lenso.native-rust@1" },
      instanceKey: "agent",
      packageId: "lenso.agent.loop",
      selection: "enabled",
    });
  });

  it("rejects malformed management state instead of inventing placeholders", () => {
    expect(() =>
      decodePluginManagement({
        plugins: [{ packageId: "example.invalid" }],
        schema: "lenso.agent.plugin-management.v1",
      })
    ).toThrow("invalid managed Plugin entries");
  });
});
