import { describe, expect, it } from "vitest";

import { demoApps, parseAppCatalog } from "./app-management-context";

describe("Console App management catalog", () => {
  it("admits non-Agent Apps and keeps the Console authority separate", () => {
    const apps = parseAppCatalog({ apps: demoApps });
    expect(apps.find((app) => app.id === "support")?.agentId).toBeNull();
    expect(
      apps
        .filter((app) => app.scope === "management-agent")
        .map((app) => app.id)
    ).toEqual(["console"]);
    expect(
      apps.find((app) => app.scope === "console-extensions")
        ?.pluginConfiguration
    ).toBe(false);
  });
  it("rejects duplicate identities and malformed target relationships", () => {
    expect(() =>
      parseAppCatalog({ apps: [demoApps[0], demoApps[0]] })
    ).toThrow();
    expect(() =>
      parseAppCatalog({ apps: [{ ...demoApps[0], agentId: "console" }] })
    ).toThrow();
    expect(() =>
      parseAppCatalog({ apps: [{ ...demoApps[0], scope: "everything" }] })
    ).toThrow();
    expect(() =>
      parseAppCatalog({
        apps: [{ ...demoApps[0], pluginConfiguration: "yes" }],
      })
    ).toThrow();
  });
});
