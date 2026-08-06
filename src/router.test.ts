import { describe, expect, test } from "vitest";

import {
  consolePathFromLocation,
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
    expect(legacyConsoleTargetForPath("/console/unknown", "/console")).toBe(
      undefined
    );
  });

  test("normalizes the console base path once for module surfaces", () => {
    expect(consolePathFromLocation("/console/modules", "/console")).toBe(
      "/modules"
    );
    expect(consolePathFromLocation("/modules", "/")).toBe("/modules");
  });
});
