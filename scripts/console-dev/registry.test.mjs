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
    const registryJson = await readFile(registryPath, "utf-8");
    expect(registryJson.endsWith("\n")).toBe(true);
    expect(JSON.parse(registryJson)).toEqual(registry);
  });

  test("defaults optional bundle fields and sanitizes package names", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lenso-console-dev-"));
    const registryPath = path.join(root, "registry.json");

    const registry = await writeConsoleDevRegistry({
      registryPath,
      targets: [
        {
          exportName: "authConsoleModule",
          moduleName: "auth",
          packageName: "@scope/auth.console+dev",
        },
      ],
    });

    expect(registry).toEqual({
      bundles: [
        {
          entry: "/console/extensions/dev/auth-console-dev.js",
          exportName: "authConsoleModule",
          hostApi: "1",
          moduleName: "auth",
          packageName: "@scope/auth.console+dev",
          requiredCapabilities: [],
          styles: ["/console/extensions/dev/auth-console-dev.css"],
        },
      ],
      version: 1,
    });
  });
});
