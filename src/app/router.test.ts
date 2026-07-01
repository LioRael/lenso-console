import { describe, expect, test } from "vitest";

import {
  consoleBasePathFromBaseUrl,
  createRuntimeConsoleRouter,
  rootRedirectPath,
} from "./router";

describe("runtime console router", () => {
  test("uses Launchpad as the root entrypoint", () => {
    expect(rootRedirectPath).toBe("/launchpad");
  });

  test("mounts routes under the built console base path", () => {
    expect(consoleBasePathFromBaseUrl("/console/")).toBe("/console");
    expect(
      createRuntimeConsoleRouter([], { basepath: "/console" }).options
    ).toMatchObject({ basepath: "/console" });
  });
});
