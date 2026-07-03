import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { writeConsoleDevRegistry } from "./registry.mjs";

describe("console dev registry", () => {
  test("writes a runtime bundle registry for local dev targets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lenso-console-dev-"));
    const registryPath = path.join(root, "registry.json");

    const registry = await writeConsoleDevRegistry({
      registryPath,
      targets: [
        {
          exportName: "authConsoleModule",
          hostApi: "1",
          moduleName: "auth",
          packageName: "@lenso/auth-console",
          requiredCapabilities: ["auth.users.read"],
          styles: ["dist/auth-console.css"],
        },
      ],
    });

    expect(registry).toEqual({
      bundles: [
        {
          entry: "/console/extensions/dev/auth-console.js",
          exportName: "authConsoleModule",
          hostApi: "1",
          moduleName: "auth",
          packageName: "@lenso/auth-console",
          requiredCapabilities: ["auth.users.read"],
          styles: ["/console/extensions/dev/auth-console.css"],
        },
      ],
      version: 1,
    });
    await expect(readFile(registryPath, "utf-8")).resolves.toContain(
      '"packageName": "@lenso/auth-console"'
    );
  });
});
