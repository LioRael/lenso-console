import { describe, expect, test } from "vitest";

import {
  consolePathFromLocation,
  isRetiredConsolePath,
  legacyConsoleTargetForPath,
} from "./app/console-router-config";
import {
  consoleBasePathFromBaseUrl,
  getRouter,
  rootRedirectPath,
} from "./router";

describe("Console router", () => {
  test("uses Home as the root entrypoint", () => {
    expect(rootRedirectPath).toBe("/");
  });

  test("mounts routes under the built console base path", () => {
    expect(consoleBasePathFromBaseUrl("/console/")).toBe("/console");
    expect(getRouter().options).toMatchObject({ basepath: "/" });
  });

  test("uses Start lifecycle defaults for route transitions", () => {
    expect(getRouter().options).toMatchObject({
      defaultPendingMinMs: 500,
      defaultPendingMs: 1000,
      defaultPreload: "intent",
      defaultPreloadDelay: 100,
      notFoundMode: "root",
    });
  });

  test("keeps legacy paths at the file-route catch-all seam", () => {
    expect(legacyConsoleTargetForPath("/console/overview", "/console")).toBe(
      "/runtime"
    );
    expect(
      legacyConsoleTargetForPath(
        "/console/operations/admin-actions",
        "/console"
      )
    ).toBeUndefined();
    expect(
      legacyConsoleTargetForPath("/console/data", "/console")
    ).toBeUndefined();
    expect(legacyConsoleTargetForPath("/console/unknown", "/console")).toBe(
      undefined
    );
  });

  test("hard-rejects retired administration paths", () => {
    expect(isRetiredConsolePath("/console/data", "/console")).toBe(true);
    expect(isRetiredConsolePath("/console/data/identity", "/console")).toBe(
      true
    );
    expect(
      isRetiredConsolePath("/console/operations/admin-actions", "/console")
    ).toBe(true);
    expect(isRetiredConsolePath("/console/modules", "/console")).toBe(false);
  });

  test("normalizes the console base path once for module surfaces", () => {
    expect(consolePathFromLocation("/console/modules", "/console")).toBe(
      "/modules"
    );
    expect(consolePathFromLocation("/modules", "/")).toBe("/modules");
  });
});
