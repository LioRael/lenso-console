import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { discoverConsoleDevTargets } from "./discovery.mjs";

const tempRoot = () => mkdtemp(path.join(os.tmpdir(), "lenso-console-dev-"));

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const writeText = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
};

describe("console dev discovery", () => {
  test("discovers a console package directory", async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, "package.json"), {
      lenso: {
        console: {
          bundle: "./dist/auth-console.js",
          hostApi: "1",
          styles: ["./dist/auth-console.css"],
          surface: "./console-surface.json",
        },
      },
      name: "@lenso/auth-console",
    });
    await writeJson(path.join(root, "console-surface.json"), {
      exportName: "authConsoleModule",
      id: "auth",
      packageName: "@lenso/auth-console",
      requiredCapabilities: ["auth.users.read"],
      route: "/data/auth/users",
      source: "runtime_bundle",
      surfaceName: "users",
      version: "workspace",
    });

    await expect(discoverConsoleDevTargets({ cwd: root })).resolves.toEqual([
      expect.objectContaining({
        exportName: "authConsoleModule",
        moduleName: "auth",
        packageName: "@lenso/auth-console",
        packageRoot: root,
        route: "/data/auth/users",
      }),
    ]);
  });

  test("discovers multiple packages from a module repository root", async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, "package.json"), {
      name: "lenso-auth-module",
      workspaces: ["packages/*"],
    });
    await writeJson(path.join(root, "packages/auth-console/package.json"), {
      lenso: { console: { surface: "./console-surface.json" } },
      name: "@lenso/auth-console",
    });
    await writeJson(
      path.join(root, "packages/auth-console/console-surface.json"),
      {
        exportName: "authConsoleModule",
        id: "auth",
        packageName: "@lenso/auth-console",
        route: "/data/auth",
        source: "runtime_bundle",
        surfaceName: "auth",
        version: "workspace",
      }
    );
    await writeJson(path.join(root, "packages/provider-console/package.json"), {
      lenso: { console: { surface: "./console-surface.json" } },
      name: "@lenso/auth-provider-console",
    });
    await writeJson(
      path.join(root, "packages/provider-console/console-surface.json"),
      {
        exportName: "authProviderConsoleModule",
        id: "auth-provider",
        packageName: "@lenso/auth-provider-console",
        route: "/data/auth/providers",
        source: "runtime_bundle",
        surfaceName: "providers",
        version: "workspace",
      }
    );

    const targets = await discoverConsoleDevTargets({ cwd: root });

    expect(targets.map((target) => target.packageName)).toEqual([
      "@lenso/auth-console",
      "@lenso/auth-provider-console",
    ]);
  });

  test("resolves relative package paths from the supplied cwd", async () => {
    const root = await tempRoot();
    const packageRoot = path.join(root, "packages/auth-console");
    await writeJson(path.join(packageRoot, "package.json"), {
      lenso: { console: { surface: "./console-surface.json" } },
      name: "@lenso/auth-console",
    });
    await writeJson(path.join(packageRoot, "console-surface.json"), {
      exportName: "authConsoleModule",
      id: "auth",
      packageName: "@lenso/auth-console",
      route: "/data/auth",
      source: "runtime_bundle",
      surfaceName: "auth",
      version: "workspace",
    });

    await expect(
      discoverConsoleDevTargets({
        cwd: root,
        packagePath: "packages/auth-console",
      })
    ).resolves.toEqual([
      expect.objectContaining({
        packageName: "@lenso/auth-console",
        packageRoot,
      }),
    ]);
  });

  test("reports invalid declared console surface JSON", async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, "package.json"), {
      lenso: { console: { surface: "./console-surface.json" } },
      name: "@lenso/auth-console",
    });
    await writeText(path.join(root, "console-surface.json"), "{");

    await expect(discoverConsoleDevTargets({ cwd: root })).rejects.toThrow(
      /Unable to read console surface manifest .*console-surface\.json/u
    );
  });

  test("reports invalid package JSON", async () => {
    const root = await tempRoot();
    await writeText(path.join(root, "package.json"), "{");

    await expect(discoverConsoleDevTargets({ cwd: root })).rejects.toThrow(
      /Unable to read package\.json .*package\.json/u
    );
  });

  test("uses the first entry from a multi-surface manifest", async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, "package.json"), {
      name: "@lenso/auth-console",
    });
    await writeJson(path.join(root, "console-surface.json"), {
      exportName: "authConsoleModule",
      packageName: "@lenso/auth-console",
      surfaces: [
        {
          requiredCapabilities: ["auth.users.read"],
          route: "/data/auth/users",
          surfaceName: "users",
        },
        {
          requiredCapabilities: ["auth.roles.read"],
          route: "/data/auth/roles",
          surfaceName: "roles",
        },
      ],
    });

    await expect(discoverConsoleDevTargets({ cwd: root })).resolves.toEqual([
      expect.objectContaining({
        moduleName: "users",
        requiredCapabilities: ["auth.users.read"],
        route: "/data/auth/users",
      }),
    ]);
  });

  test("rejects empty multi-surface manifests clearly", async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, "package.json"), {
      name: "@lenso/auth-console",
    });
    await writeJson(path.join(root, "console-surface.json"), {
      exportName: "authConsoleModule",
      packageName: "@lenso/auth-console",
      surfaces: [],
    });

    await expect(discoverConsoleDevTargets({ cwd: root })).rejects.toThrow(
      /must declare at least one surface/u
    );
  });

  test("returns a diagnostic when no console package exists", async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, "package.json"), { name: "plain-package" });

    await expect(discoverConsoleDevTargets({ cwd: root })).rejects.toThrow(
      "No Runtime Console package found"
    );
  });
});
