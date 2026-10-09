import { describe, expect, test } from "vitest";

import { consolePathFromLocation } from "./app/console-router-config";
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

  test("normalizes the console base path once for module surfaces", () => {
    expect(consolePathFromLocation("/console/modules", "/console")).toBe(
      "/modules"
    );
    expect(consolePathFromLocation("/modules", "/")).toBe("/modules");
  });
});
