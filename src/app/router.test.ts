import { describe, expect, test } from "vitest";

import {
  basePathFromViteBase,
  createConsoleRouter,
  rootRedirectPath,
} from "./router";

describe("Console router", () => {
  test("uses the capability-neutral shell as the root entrypoint", () => {
    expect(rootRedirectPath).toBe("/");
  });

  test("mounts routes under the built Console base path", () => {
    expect(basePathFromViteBase("/console/")).toBe("/console");
    expect(createConsoleRouter({ basepath: "/console" }).options).toMatchObject(
      {
        basepath: "/console",
      }
    );
  });
});
