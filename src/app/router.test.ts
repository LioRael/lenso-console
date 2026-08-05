import { describe, expect, test } from "vitest";

import {
  consoleBasePathFromBaseUrl,
  createConsoleRouter,
  rootRedirectPath,
} from "./router";

describe("Console router", () => {
  test("uses Home as the root entrypoint", () => {
    expect(rootRedirectPath).toBe("/");
  });

  test("mounts routes under the built console base path", () => {
    expect(consoleBasePathFromBaseUrl("/console/")).toBe("/console");
    expect(
      createConsoleRouter([], { basepath: "/console" }).options
    ).toMatchObject({ basepath: "/console" });
  });
});
