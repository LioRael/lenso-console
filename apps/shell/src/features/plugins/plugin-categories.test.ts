import { describe, expect, it } from "vitest";

import { categoriesForPlugin, matchesPluginFilters } from "./plugin-categories";
import {
  demoPluginInventory,
  demoPluginManagement,
  pluginWorkbenchItems,
} from "./plugin-workbench-model";

const [base] = pluginWorkbenchItems(demoPluginInventory, demoPluginManagement);
if (!base?.active) {
  throw new Error("Missing Plugin fixture");
}
const tool = {
  ...base,
  active: {
    ...base.active,
    providedCapabilities: ["lenso.agent.tool-provider@2"],
  },
  desired: null,
};

describe("Plugin presentation categories", () => {
  it("uses provided roles without guessing from package names or consumed roles", () => {
    expect(categoriesForPlugin(base)).toEqual(["uncategorized"]);
    expect(categoriesForPlugin(tool)).toEqual(["tools"]);
    expect(
      categoriesForPlugin({
        ...base,
        packageId: "lenso.agent.model",
        active: null,
        desired: null,
      })
    ).toEqual(["uncategorized"]);
  });
  it("includes each provided role and prefers the desired selection", () => {
    expect(
      categoriesForPlugin({
        ...tool,
        desired: {
          ...tool.active,
          providedCapabilities: [
            "lenso.agent.model@4",
            "lenso.agent.context-source@1",
          ],
        },
      })
    ).toEqual(["models", "context"]);
  });
  it("combines category, search and selection without hiding unmanaged items from All", () => {
    expect(matchesPluginFilters(tool, "tools", " LOOP ", "enabled")).toBe(true);
    expect(matchesPluginFilters(tool, "models", "", "all")).toBe(false);
    expect(matchesPluginFilters(tool, "tools", "", "disabled")).toBe(false);
    expect(
      matchesPluginFilters({ ...tool, management: null }, "all", "", "all")
    ).toBe(true);
  });
});
