import { describe, expect, test } from "vitest";

import {
  consoleBasePathFromBaseUrl,
  createRuntimeConsoleRouter,
  rootRedirectPath,
} from "./router";

describe("runtime console router", () => {
  test("uses a host route as the root entrypoint", () => {
    expect(rootRedirectPath).toBe("/overview");
  });

  test("mounts routes under the built console base path", () => {
    expect(consoleBasePathFromBaseUrl("/console/")).toBe("/console");
    expect(
      createRuntimeConsoleRouter([], { basepath: "/console" }).options
    ).toMatchObject({ basepath: "/console" });
  });
});
