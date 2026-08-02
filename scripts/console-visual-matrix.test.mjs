import { describe, expect, test } from "vitest";

import {
  buildVisualMatrix,
  matrixSummary,
  storyInspectorTabs,
  storyViewModes,
  visualThemes,
  visualViewports,
} from "./console-visual-matrix.mjs";

describe("console visual matrix", () => {
  test("covers every static route at the approved themes and viewports", () => {
    const cases = buildVisualMatrix();
    const routeCases = cases.filter((item) => item.kind === "route");

    expect(routeCases.length).toBe(
      19 * visualThemes.length * visualViewports.length
    );
    expect(new Set(routeCases.map((item) => item.route))).toEqual(
      new Set([
        "auth",
        "auth-credentials",
        "auth-github",
        "auth-google",
        "auth-oidc",
        "auth-providers",
        "auth-sessions",
        "auth-users",
        "changes",
        "crm-companies",
        "crm-contacts",
        "delivery",
        "home",
        "identity",
        "managed-services",
        "modules",
        "runtime",
        "settings",
        "system",
      ])
    );
  });

  test("covers story view, inspector, theme, and viewport combinations", () => {
    const storyCases = buildVisualMatrix().filter(
      (item) => item.kind === "story"
    );
    expect(storyCases.length).toBe(
      storyViewModes.length *
        (storyInspectorTabs.length + 1) *
        visualThemes.length *
        visualViewports.length
    );
    expect(new Set(storyCases.map((item) => item.inspector))).toEqual(
      new Set(["closed", ...storyInspectorTabs])
    );
    expect(storyCases.every((item) => item.url.includes("story="))).toBe(true);
  });

  test("reports a stable matrix summary", () => {
    expect(matrixSummary()).toEqual({
      cases: 330,
      inspectorStates: 6,
      routes: 55,
      themes: 2,
      viewports: 3,
    });
  });
});
