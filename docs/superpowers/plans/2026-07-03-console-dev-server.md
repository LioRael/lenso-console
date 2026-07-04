# Console Dev Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `next dev`-style Runtime Console package development loop that loads local console bundles in the real shell, defaults to mock host data, and can proxy a real Lenso host with `--host`.

**Architecture:** Runtime Console owns the dev runner, temporary bundle registry, mock host API, and browser diagnostics. The CLI exposes thin `lenso console dev` and `lenso module dev --console` facades that delegate to the Runtime Console runner instead of reimplementing frontend behavior in Rust.

**Tech Stack:** Vite 8, React 19, TanStack Router/Query, Vitest, Node ESM scripts, Rust `clap` CLI in `lenso-cli`.

---

## Repository Roots

- Runtime Console: `/Users/leosouthey/Projects/framework/lenso-runtime-console`
- CLI: `/Users/leosouthey/Projects/framework/lenso-cli`

## File Structure

Runtime Console files:

- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-config.ts`: browser-side parsing of dev env flags and registry URL.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-config.test.ts`: unit tests for dev config parsing.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/mock-console-host-api.ts`: mock implementation for package-facing `runtimeConsoleHostApi` hooks.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/mock-console-host-api.test.tsx`: hook-level tests for fixture fallback behavior.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-overlay.tsx`: dev-only browser overlay for package, mode, and diagnostics.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/discovery.mjs`: package/module-root discovery.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/discovery.test.mjs`: discovery tests.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/registry.mjs`: transient runtime bundle registry generation.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/registry.test.mjs`: registry generation tests.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-vite-plugin.ts`: Vite middleware for dev registry, dev bundles, and real-host proxy.
- Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-package-dev.mjs`: runnable dev command implementation.
- Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/main.tsx`: read dev registry URL and render dev overlay.
- Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/app/console-host-api.ts`: switch package-facing host API to mock implementation in dev mock mode.
- Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/app/runtime-console-bundles.ts`: allow loading a configured registry URL and expose diagnostics-friendly errors.
- Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/vite.config.ts`: install dev middleware when dev env vars are present.
- Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/package.json`: add dev script and include new tests in `test:local`.
- Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/README.md`: document `pnpm console-package:dev`.

CLI files:

- Create `/Users/leosouthey/Projects/framework/lenso-cli/src/console_dev.rs`: thin process launcher for Runtime Console dev runner.
- Modify `/Users/leosouthey/Projects/framework/lenso-cli/src/main.rs`: add args, dispatch, and conversions for `lenso console dev` and `lenso module dev --console`.
- Modify `/Users/leosouthey/Projects/framework/lenso-cli/README.md`: document public commands.

---

### Task 1: Add Browser Dev Config And Registry URL Selection

**Files:**

- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-config.ts`
- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-config.test.ts`
- Modify: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/main.tsx`

- [ ] **Step 1: Write failing config tests**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-config.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  consoleDevConfigFromEnv,
  defaultConsoleBundleRegistryUrl,
} from "./console-dev-config";

describe("console dev config", () => {
  test("is disabled by default and uses the production registry", () => {
    expect(consoleDevConfigFromEnv({})).toEqual({
      diagnosticsUrl: null,
      enabled: false,
      mode: "production",
      registryUrl: defaultConsoleBundleRegistryUrl,
      targetLabel: null,
    });
  });

  test("enables mock console package development", () => {
    expect(
      consoleDevConfigFromEnv({
        VITE_CONSOLE_DEV_DIAGNOSTICS_URL: "/console/dev/diagnostics.json",
        VITE_CONSOLE_DEV_MODE: "mock",
        VITE_CONSOLE_DEV_REGISTRY_URL: "/console/dev/registry.json",
        VITE_CONSOLE_DEV_TARGET_LABEL: "@lenso/auth-console",
      })
    ).toEqual({
      diagnosticsUrl: "/console/dev/diagnostics.json",
      enabled: true,
      mode: "mock",
      registryUrl: "/console/dev/registry.json",
      targetLabel: "@lenso/auth-console",
    });
  });

  test("enables real host console package development", () => {
    expect(
      consoleDevConfigFromEnv({
        VITE_CONSOLE_DEV_MODE: "host",
        VITE_CONSOLE_DEV_REGISTRY_URL: "/console/dev/registry.json",
      })
    ).toMatchObject({
      enabled: true,
      mode: "host",
      registryUrl: "/console/dev/registry.json",
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run src/dev/console-dev-config.test.ts
```

Expected: FAIL with an import error for `./console-dev-config`.

- [ ] **Step 3: Implement dev config parsing**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-config.ts`:

```ts
import { DEFAULT_CONSOLE_BUNDLE_REGISTRY_URL } from "../app/runtime-console-bundles";

export const defaultConsoleBundleRegistryUrl =
  DEFAULT_CONSOLE_BUNDLE_REGISTRY_URL;

export type ConsoleDevMode = "production" | "mock" | "host";

export type ConsoleDevConfig = {
  diagnosticsUrl: string | null;
  enabled: boolean;
  mode: ConsoleDevMode;
  registryUrl: string;
  targetLabel: string | null;
};

export type ConsoleDevEnv = Partial<
  Record<
    | "VITE_CONSOLE_DEV_DIAGNOSTICS_URL"
    | "VITE_CONSOLE_DEV_MODE"
    | "VITE_CONSOLE_DEV_REGISTRY_URL"
    | "VITE_CONSOLE_DEV_TARGET_LABEL",
    string
  >
>;

export function consoleDevConfigFromEnv(env: ConsoleDevEnv): ConsoleDevConfig {
  const mode = consoleDevMode(env.VITE_CONSOLE_DEV_MODE);
  const registryUrl =
    cleanString(env.VITE_CONSOLE_DEV_REGISTRY_URL) ??
    defaultConsoleBundleRegistryUrl;

  return {
    diagnosticsUrl: cleanString(env.VITE_CONSOLE_DEV_DIAGNOSTICS_URL) ?? null,
    enabled: mode !== "production",
    mode,
    registryUrl,
    targetLabel: cleanString(env.VITE_CONSOLE_DEV_TARGET_LABEL) ?? null,
  };
}

export const consoleDevConfig = consoleDevConfigFromEnv(import.meta.env);

function consoleDevMode(value: string | undefined): ConsoleDevMode {
  if (value === "mock" || value === "host") {
    return value;
  }
  return "production";
}

function cleanString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
```

- [ ] **Step 4: Use the configured registry in the app entrypoint**

Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/main.tsx`:

```ts
import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";

import { registerRuntimeConsoleModuleMetadata } from "./app/console-module-metadata";
import { consoleModules } from "./app/console-modules";
import { Providers } from "./app/providers";
import { createRuntimeConsoleRouter } from "./app/router";
import { loadRuntimeConsoleBundlePackages } from "./app/runtime-console-bundles";
import { registerRuntimeConsolePackages } from "./console-package-installs";
import { consoleDevConfig } from "./dev/console-dev-config";

import "./styles.css";

void startRuntimeConsole();

async function startRuntimeConsole() {
  const runtimePackages = await loadRuntimeConsoleBundlePackages(
    consoleDevConfig.registryUrl
  ).catch((error: unknown) => {
    console.warn("Runtime console bundle loading failed", error);
    return [];
  });
  registerRuntimeConsolePackages(runtimePackages);
  registerRuntimeConsoleModuleMetadata(runtimePackages);
  const router = createRuntimeConsoleRouter([
    ...consoleModules,
    ...runtimePackages.map((item) => item.module),
  ]);

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </React.StrictMode>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm exec vitest run src/dev/console-dev-config.test.ts src/app/runtime-console-bundles.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/dev/console-dev-config.ts src/dev/console-dev-config.test.ts src/main.tsx
git commit -m "feat: configure console dev registry"
```

---

### Task 2: Add Mock Host API For Package Development

**Files:**

- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/mock-console-host-api.ts`
- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/mock-console-host-api.test.tsx`
- Modify: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/app/console-host-api.ts`

- [ ] **Step 1: Write failing mock host API tests**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/mock-console-host-api.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import {
  mockAdminRecords,
  mockAvailableCapabilities,
  mockSlotContributions,
} from "./mock-console-host-api";

describe("mock console host api", () => {
  test("returns empty admin records when no fixture exists", () => {
    expect(
      mockAdminRecords(
        {},
        {
          entityName: "users",
          moduleName: "auth",
        }
      )
    ).toEqual({
      data: [],
      page: {
        limit: 50,
        next_cursor: null,
      },
    });
  });

  test("returns fixture-backed admin records", () => {
    const fixtures = {
      adminData: {
        auth: {
          users: [{ id: "usr_1", status: "active" }],
        },
      },
      capabilities: ["auth.users.read"],
    };

    expect(
      mockAdminRecords(fixtures, {
        entityName: "users",
        moduleName: "auth",
      }).data
    ).toEqual([{ id: "usr_1", status: "active" }]);
    expect(mockAvailableCapabilities(fixtures)).toEqual(["auth.users.read"]);
  });

  test("returns slot contributions from fixtures", () => {
    const fixtures = {
      contributions: {
        "auth.users.detail.actions": [
          {
            actionName: "reset_password",
            input: { user_id: "usr_1" },
            key: "auth.reset_password",
            kind: "admin_action",
            label: "Reset password",
            moduleName: "auth-password",
            requiredCapabilities: ["auth.users.write"],
          },
        ],
      },
    };

    expect(
      mockSlotContributions(fixtures, "auth.users.detail.actions", {
        selected_user: { id: "usr_1" },
      })
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run src/dev/mock-console-host-api.test.tsx
```

Expected: FAIL with an import error for `./mock-console-host-api`.

- [ ] **Step 3: Implement the mock host API**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/mock-console-host-api.ts`:

```ts
import type { RuntimeConsoleHostApi } from "../app/console-host-api";
import type { ConsoleAdminRecord } from "../app/console-module-api";

export const emptyAdminListResponse = {
  data: [],
  page: {
    limit: 50,
    next_cursor: null,
  },
};

export type MockConsoleFixtures = {
  adminData?: Record<string, Record<string, ConsoleAdminRecord[]>>;
  capabilities?: readonly string[];
  configValues?: unknown[];
  contributions?: Record<
    string,
    RuntimeConsoleHostApi["contributions"] extends {
      useSlot: (...args: never[]) => infer Result;
    }
      ? Result
      : never
  >;
};

export function mockAdminRecords(
  fixtures: MockConsoleFixtures,
  {
    entityName,
    limit = 50,
    moduleName,
  }: {
    entityName: string;
    limit?: number;
    moduleName: string;
  }
) {
  const rows = fixtures.adminData?.[moduleName]?.[entityName] ?? [];
  return {
    data: rows,
    page: {
      limit,
      next_cursor: null,
    },
  };
}

export function mockAvailableCapabilities(fixtures: MockConsoleFixtures) {
  return fixtures.capabilities ?? ["*"];
}

export function mockSlotContributions(
  fixtures: MockConsoleFixtures,
  slotId: string,
  _context: Record<string, unknown>
) {
  return fixtures.contributions?.[slotId] ?? [];
}

export function createMockConsoleHostApi(
  baseHostApi: RuntimeConsoleHostApi,
  fixtures: MockConsoleFixtures = {}
): RuntimeConsoleHostApi {
  return {
    adminData: {
      useInvokeAction: baseHostApi.adminData.useInvokeAction,
      useRecords: ({ entityName, limit = 50, moduleName }) => {
        return {
          data: mockAdminRecords(fixtures, { entityName, limit, moduleName }),
          error: null,
          isError: false,
          isLoading: false,
          isPending: false,
        };
      },
    },
    capabilities: {
      useAvailable: () => mockAvailableCapabilities(fixtures),
    },
    config: {
      useValues: () => ({
        data: { data: fixtures.configValues ?? [] },
        error: null,
        isError: false,
        isLoading: false,
        isPending: false,
      }),
      useWriteValue: baseHostApi.config.useWriteValue,
    },
    contributions: {
      useSlot: (slotId, context) =>
        mockSlotContributions(fixtures, slotId, context),
    },
    context: baseHostApi.context,
    data: baseHostApi.data,
    hooks: baseHostApi.hooks,
    modules: {
      useMetadata: () => ({
        data: { modules: [] },
        error: null,
        isError: false,
        isLoading: false,
        isPending: false,
      }),
    },
    queries: baseHostApi.queries,
    routing: baseHostApi.routing,
    story: baseHostApi.story,
    ui: baseHostApi.ui,
  };
}
```

- [ ] **Step 4: Refactor host API export to switch in dev mock mode**

Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/app/console-host-api.ts` so the existing object is exported as `productionRuntimeConsoleHostApi`, and the public export switches in dev mock mode:

```ts
import { consoleDevConfig } from "../dev/console-dev-config";
import { createMockConsoleHostApi } from "../dev/mock-console-host-api";

export const productionRuntimeConsoleHostApi = {
  adminData: {
    useInvokeAction: useConsoleAdminAction,
    useRecords: useConsoleAdminRecords,
  },
  capabilities: {
    useAvailable: useConsoleCapabilities,
  },
  contributions: {
    useSlot: useConsoleSlotContributions,
  },
  config: {
    useValues: useConsoleConfigValues,
    useWriteValue: useWriteConsoleConfigValue,
  },
  modules: {
    useMetadata: useConsoleModulesMetadata,
  },
  context: {
    useRuntimeConsole,
  },
  data: {
    retryTargetForNode,
    runtimeStories,
  },
  hooks: {
    useBrowserUrlPopState,
    useListKeyboard,
    usePersistedLayout,
    writeBrowserUrl,
  },
  queries: {
    useRuntimeStories,
    useRuntimeStoryDetail,
  },
  routing: {
    buildPath: operationsPath,
  },
  story: {
    executionInspectorTabs,
    findStoryByCorrelation,
  },
  ui: {
    common: {
      EmptyState,
    },
    runtime: {
      ExecutionInspector,
      ResizeHandle,
      RuntimeStoryVisualization,
      ServiceSummaryStrip,
      StoryHeader,
      StoryList,
      defaultExecutionInspectorTab,
    },
  },
};

export const runtimeConsoleHostApi =
  consoleDevConfig.mode === "mock"
    ? createMockConsoleHostApi(productionRuntimeConsoleHostApi)
    : productionRuntimeConsoleHostApi;
```

Keep the existing type exports at the bottom of the file.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm exec vitest run src/dev/mock-console-host-api.test.tsx src/app/console-host-api.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/dev/mock-console-host-api.ts src/dev/mock-console-host-api.test.tsx src/app/console-host-api.ts
git commit -m "feat: add console dev mock host api"
```

---

### Task 3: Add Console Package Discovery

**Files:**

- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/discovery.mjs`
- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/discovery.test.mjs`

- [ ] **Step 1: Write failing discovery tests**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/discovery.test.mjs`:

```js
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { discoverConsoleDevTargets } from "./discovery.mjs";

async function tempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "lenso-console-dev-"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("console dev discovery", () => {
  test("discovers a console package directory", async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, "package.json"), {
      name: "@lenso/auth-console",
      lenso: {
        console: {
          bundle: "./dist/auth-console.js",
          hostApi: "1",
          styles: ["./dist/auth-console.css"],
          surface: "./console-surface.json",
        },
      },
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
      name: "@lenso/auth-console",
      lenso: { console: { surface: "./console-surface.json" } },
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
      name: "@lenso/auth-provider-console",
      lenso: { console: { surface: "./console-surface.json" } },
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

  test("returns a diagnostic when no console package exists", async () => {
    const root = await tempRoot();
    await writeJson(path.join(root, "package.json"), { name: "plain-package" });

    await expect(discoverConsoleDevTargets({ cwd: root })).rejects.toThrow(
      "No Runtime Console package found"
    );
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run scripts/console-dev/discovery.test.mjs
```

Expected: FAIL with an import error for `./discovery.mjs`.

- [ ] **Step 3: Implement discovery**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/discovery.mjs`:

```js
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function discoverConsoleDevTargets({ cwd, packagePath } = {}) {
  const root = path.resolve(packagePath ?? cwd ?? process.cwd());
  const direct = await maybeConsolePackage(root);
  if (direct) {
    return [direct];
  }

  const packageDirs = await candidatePackageDirs(root);
  const targets = [];
  for (const dir of packageDirs) {
    const target = await maybeConsolePackage(dir);
    if (target) {
      targets.push(target);
    }
  }
  targets.sort((a, b) => a.packageName.localeCompare(b.packageName));

  if (targets.length === 0) {
    throw new Error(`No Runtime Console package found under ${root}`);
  }
  return targets;
}

async function maybeConsolePackage(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = await readJson(packageJsonPath).catch(() => null);
  if (!packageJson) {
    return null;
  }

  const consoleConfig = packageJson.lenso?.console ?? {};
  const surfacePath = path.resolve(
    packageRoot,
    consoleConfig.surface ?? "console-surface.json"
  );
  const surface = await readJson(surfacePath).catch(() => null);
  if (!surface) {
    return null;
  }

  const firstSurface = Array.isArray(surface.surfaces)
    ? surface.surfaces[0]
    : surface;
  const packageName = surface.packageName ?? packageJson.name;
  const exportName = surface.exportName;
  if (!(packageName && exportName)) {
    throw new Error(
      `Console package ${packageRoot} must declare packageName and exportName`
    );
  }

  return {
    bundle: consoleConfig.bundle ?? surface.bundle?.path ?? null,
    exportName,
    hostApi: consoleConfig.hostApi ?? surface.bundle?.hostApi ?? "1",
    moduleName: surface.id ?? firstSurface?.surfaceName ?? packageJson.name,
    packageName,
    packageRoot,
    requiredCapabilities: firstSurface?.requiredCapabilities ?? [],
    route: firstSurface?.route ?? surface.route ?? "/",
    styles: consoleConfig.styles ?? surface.bundle?.styles ?? [],
    surfacePath,
  };
}

async function candidatePackageDirs(root) {
  const packagesRoot = path.join(root, "packages");
  const entries = await readdir(packagesRoot).catch(() => []);
  const dirs = [];
  for (const entry of entries) {
    const dir = path.join(packagesRoot, entry);
    const info = await stat(dir).catch(() => null);
    if (info?.isDirectory()) {
      dirs.push(dir);
    }
  }
  return dirs;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm exec vitest run scripts/console-dev/discovery.test.mjs
```

Expected: PASS.

Commit:

```bash
git add scripts/console-dev/discovery.mjs scripts/console-dev/discovery.test.mjs
git commit -m "feat: discover console dev packages"
```

---

### Task 4: Add Transient Dev Registry Generation

**Files:**

- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/registry.mjs`
- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/registry.test.mjs`

- [ ] **Step 1: Write failing registry tests**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/registry.test.mjs`:

```js
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
    await expect(readFile(registryPath, "utf8")).resolves.toContain(
      '"packageName": "@lenso/auth-console"'
    );
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run scripts/console-dev/registry.test.mjs
```

Expected: FAIL with an import error for `./registry.mjs`.

- [ ] **Step 3: Implement registry writer**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-dev/registry.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeConsoleDevRegistry({ registryPath, targets }) {
  const registry = {
    bundles: targets.map((target) => ({
      entry: `/console/extensions/dev/${bundleBaseName(target)}.js`,
      exportName: target.exportName,
      hostApi: target.hostApi ?? "1",
      moduleName: target.moduleName,
      packageName: target.packageName,
      requiredCapabilities: target.requiredCapabilities ?? [],
      styles: [`/console/extensions/dev/${bundleBaseName(target)}.css`],
    })),
    version: 1,
  };
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

export function bundleBaseName(target) {
  return target.packageName
    .split("/")
    .at(-1)
    .replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm exec vitest run scripts/console-dev/registry.test.mjs
```

Expected: PASS.

Commit:

```bash
git add scripts/console-dev/registry.mjs scripts/console-dev/registry.test.mjs
git commit -m "feat: write console dev registry"
```

---

### Task 5: Add Vite Dev Middleware For Registry, Bundles, And Host Proxy

**Files:**

- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-vite-plugin.ts`
- Modify: `/Users/leosouthey/Projects/framework/lenso-runtime-console/vite.config.ts`

- [ ] **Step 1: Write the middleware implementation**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-vite-plugin.ts`:

```ts
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PluginOption } from "vite";

export function consoleDevPlugin({
  diagnosticsFile,
  extensionsDir,
  hostUrl,
  registryFile,
}: {
  diagnosticsFile?: string;
  extensionsDir?: string;
  hostUrl?: string;
  registryFile?: string;
} = {}): PluginOption {
  return {
    name: "lenso-console-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }
        if (req.url === "/console/dev/registry.json" && registryFile) {
          sendFile(res, registryFile, "application/json");
          return;
        }
        if (req.url === "/console/dev/diagnostics.json" && diagnosticsFile) {
          sendFile(res, diagnosticsFile, "application/json");
          return;
        }
        if (req.url.startsWith("/console/extensions/dev/") && extensionsDir) {
          const assetName = req.url.replace("/console/extensions/dev/", "");
          sendFile(
            res,
            path.join(extensionsDir, assetName),
            assetName.endsWith(".css") ? "text/css" : "text/javascript"
          );
          return;
        }
        if (hostUrl && shouldProxyToHost(req.url)) {
          await proxyToHost({ hostUrl, req, res });
          return;
        }
        next();
      });
    },
  };
}

function shouldProxyToHost(url: string) {
  return (
    url.startsWith("/admin/") ||
    url.startsWith("/v1/") ||
    url.startsWith("/console/extensions/registry.json")
  );
}

function sendFile(res: ServerResponse, filePath: string, contentType: string) {
  if (!existsSync(filePath)) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  res.setHeader("content-type", contentType);
  createReadStream(filePath).pipe(res);
}

async function proxyToHost({
  hostUrl,
  req,
  res,
}: {
  hostUrl: string;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  const target = new URL(req.url, hostUrl);
  const body = await requestBody(req);
  const response = await fetch(target, {
    body,
    headers: {
      accept: req.headers.accept ?? "*/*",
      authorization: req.headers.authorization ?? "",
    },
    method: req.method,
  });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function requestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}
```

- [ ] **Step 2: Wire the plugin into Vite config**

Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/vite.config.ts`:

```ts
import { consoleDevPlugin } from "./src/dev/console-dev-vite-plugin";

const consoleDevMiddleware = consoleDevPlugin({
  diagnosticsFile: process.env.LENSO_CONSOLE_DEV_DIAGNOSTICS_FILE,
  extensionsDir: process.env.LENSO_CONSOLE_DEV_EXTENSIONS_DIR,
  hostUrl: process.env.LENSO_CONSOLE_DEV_HOST,
  registryFile: process.env.LENSO_CONSOLE_DEV_REGISTRY_FILE,
});
```

Then include the plugin after Tailwind:

```ts
plugins: [react(), tailwindcss(), consoleDevMiddleware],
```

- [ ] **Step 3: Verify and commit**

Run:

```bash
pnpm typecheck:local
```

Expected: PASS.

Commit:

```bash
git add vite.config.ts src/dev/console-dev-vite-plugin.ts
git commit -m "feat: serve console dev assets"
```

---

### Task 6: Add Runtime Console Dev Runner Script

**Files:**

- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-package-dev.mjs`
- Modify: `/Users/leosouthey/Projects/framework/lenso-runtime-console/package.json`

- [ ] **Step 1: Add the runner script**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/scripts/console-package-dev.mjs`:

```js
#!/usr/bin/env node
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { discoverConsoleDevTargets } from "./console-dev/discovery.mjs";
import {
  bundleBaseName,
  writeConsoleDevRegistry,
} from "./console-dev/registry.mjs";

const args = parseArgs(process.argv.slice(2));
const runtimeConsoleRoot = path.resolve(import.meta.dirname, "..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lenso-console-dev-"));
const extensionsDir = path.join(tempRoot, "extensions");
await mkdir(extensionsDir, { recursive: true });

const targets = await discoverConsoleDevTargets({
  cwd: args.cwd ?? process.cwd(),
  packagePath: args.package,
});
const registryFile = path.join(tempRoot, "registry.json");
await writeConsoleDevRegistry({ registryPath: registryFile, targets });

const children = [];
for (const target of targets) {
  children.push(spawnPackageWatcher({ extensionsDir, target }));
}
children.push(
  spawnRuntimeConsole({
    args,
    extensionsDir,
    registryFile,
    runtimeConsoleRoot,
    targets,
  })
);

process.on("SIGINT", () => {
  for (const child of children) {
    child.kill("SIGINT");
  }
});

function spawnPackageWatcher({ extensionsDir, target }) {
  const baseName = bundleBaseName(target);
  const child = spawn(
    "pnpm",
    [
      "exec",
      "vite",
      "build",
      "--watch",
      "--emptyOutDir=false",
      "--outDir",
      extensionsDir,
    ],
    {
      cwd: target.packageRoot,
      env: {
        ...process.env,
        LENSO_CONSOLE_DEV_BUNDLE_BASENAME: baseName,
      },
      stdio: "inherit",
    }
  );
  return child;
}

function spawnRuntimeConsole({
  args,
  extensionsDir,
  registryFile,
  runtimeConsoleRoot,
  targets,
}) {
  const mode = args.host ? "host" : "mock";
  console.error("Lenso Console Dev");
  console.error(`Mode: ${mode}`);
  console.error(
    `Targets: ${targets.map((target) => target.packageName).join(", ")}`
  );
  console.error(`Console: http://localhost:${args.port}/console/launchpad`);

  return spawn(
    "pnpm",
    ["exec", "vite", "--host", "0.0.0.0", "--port", String(args.port)],
    {
      cwd: runtimeConsoleRoot,
      env: {
        ...process.env,
        LENSO_CONSOLE_DEV_EXTENSIONS_DIR: extensionsDir,
        LENSO_CONSOLE_DEV_HOST: args.host ?? "",
        LENSO_CONSOLE_DEV_REGISTRY_FILE: registryFile,
        LENSO_CONSOLE_BASE: "/console/",
        VITE_CONSOLE_DEV_MODE: mode,
        VITE_CONSOLE_DEV_REGISTRY_URL: "/console/dev/registry.json",
        VITE_CONSOLE_DEV_TARGET_LABEL: targets
          .map((target) => target.packageName)
          .join(", "),
        VITE_RUNTIME_CONSOLE_MODE: args.host ? "api" : "mock",
        VITE_API_BASE_URL: args.host ? "/" : "",
        VITE_API_AUTH_TOKEN: process.env.LENSO_CONSOLE_DEV_AUTH_TOKEN ?? "",
      },
      stdio: "inherit",
    }
  );
}

function parseArgs(rawArgs) {
  const parsed = {
    cwd: null,
    host: null,
    package: null,
    port: 5174,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--cwd") {
      parsed.cwd = path.resolve(requiredValue(rawArgs, index, arg));
      index += 1;
    } else if (arg === "--host") {
      parsed.host = requiredValue(rawArgs, index, arg);
      index += 1;
    } else if (arg === "--package") {
      parsed.package = path.resolve(requiredValue(rawArgs, index, arg));
      index += 1;
    } else if (arg === "--port") {
      parsed.port = Number(requiredValue(rawArgs, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown console dev argument: ${arg}`);
    }
  }
  return parsed;
}

function requiredValue(rawArgs, index, flag) {
  const value = rawArgs[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
```

- [ ] **Step 2: Add package scripts and tests to package.json**

Modify `/Users/leosouthey/Projects/framework/lenso-runtime-console/package.json` scripts:

```json
{
  "console-package:dev": "node scripts/console-package-dev.mjs",
  "test:local": "pnpm --filter @lenso/remote-module-kit build && pnpm --filter @lenso/service-kit build && vitest run src packages/story-console/src packages/identity-console/src packages/remote-crm-console/src packages/console-package-api/src packages/remote-module-kit/src packages/service-kit/src scripts/console-dev"
}
```

Keep the existing script entries and only add/replace these keys.

- [ ] **Step 3: Verify runner help failure and tests**

Run:

```bash
node scripts/console-package-dev.mjs --unknown
```

Expected: FAIL with `Unknown console dev argument: --unknown`.

Run:

```bash
pnpm exec vitest run scripts/console-dev/discovery.test.mjs scripts/console-dev/registry.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/console-package-dev.mjs
git commit -m "feat: add console package dev runner"
```

---

### Task 7: Add Browser Dev Overlay

**Files:**

- Create: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-overlay.tsx`
- Modify: `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/main.tsx`

- [ ] **Step 1: Implement the overlay**

Create `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/dev/console-dev-overlay.tsx`:

```tsx
import type { ConsoleDevConfig } from "./console-dev-config";

export function ConsoleDevOverlay({ config }: { config: ConsoleDevConfig }) {
  if (!config.enabled) {
    return null;
  }

  return (
    <aside className="fixed right-3 bottom-3 z-50 rounded-[var(--radius-panel)] border border-(--line) bg-(--bg-panel) px-3 py-2 text-xs text-(--fg-secondary) shadow-(--elevation-panel)">
      <div className="font-semibold text-(--fg-primary)">Console Dev</div>
      <div>Mode: {config.mode}</div>
      {config.targetLabel ? <div>Target: {config.targetLabel}</div> : null}
    </aside>
  );
}
```

- [ ] **Step 2: Render the overlay in main.tsx**

Modify the render block in `/Users/leosouthey/Projects/framework/lenso-runtime-console/src/main.tsx`:

```tsx
import { ConsoleDevOverlay } from "./dev/console-dev-overlay";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
      <ConsoleDevOverlay config={consoleDevConfig} />
    </Providers>
  </React.StrictMode>
);
```

- [ ] **Step 3: Verify and commit**

Run:

```bash
pnpm exec vitest run src/dev/console-dev-config.test.ts
pnpm typecheck:local
```

Expected: PASS.

Commit:

```bash
git add src/dev/console-dev-overlay.tsx src/main.tsx
git commit -m "feat: show console dev overlay"
```

---

### Task 8: Add CLI Facade For Console Dev

**Files:**

- Create: `/Users/leosouthey/Projects/framework/lenso-cli/src/console_dev.rs`
- Modify: `/Users/leosouthey/Projects/framework/lenso-cli/src/main.rs`

- [ ] **Step 1: Add the Rust launcher module**

Create `/Users/leosouthey/Projects/framework/lenso-cli/src/console_dev.rs`:

```rust
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result, bail};

#[derive(Debug, Clone)]
pub struct ConsoleDevOptions {
    pub cwd: Option<PathBuf>,
    pub host: Option<String>,
    pub open: bool,
    pub package: Option<PathBuf>,
    pub port: u16,
    pub runtime_console_root: Option<PathBuf>,
}

pub fn run_console_dev(options: ConsoleDevOptions) -> Result<()> {
    let runtime_console_root = resolve_runtime_console_root(options.runtime_console_root.as_deref())?;
    let script = runtime_console_root.join("scripts/console-package-dev.mjs");
    if !script.exists() {
        bail!("Runtime Console dev runner not found: {}", script.display());
    }

    let mut command = Command::new("node");
    command.arg(script);
    if let Some(cwd) = options.cwd {
        command.arg("--cwd").arg(cwd);
    }
    if let Some(host) = options.host {
        command.arg("--host").arg(host);
    }
    if let Some(package) = options.package {
        command.arg("--package").arg(package);
    }
    command.arg("--port").arg(options.port.to_string());
    if options.open {
        command.env("LENSO_CONSOLE_DEV_OPEN", "1");
    }

    let status = command
        .status()
        .with_context(|| format!("run Runtime Console dev runner in {}", runtime_console_root.display()))?;
    if !status.success() {
        bail!("Runtime Console dev runner exited with {status}");
    }
    Ok(())
}

fn resolve_runtime_console_root(explicit: Option<&Path>) -> Result<PathBuf> {
    if let Some(root) = explicit {
        return Ok(root.to_path_buf());
    }
    if let Ok(root) = std::env::var("LENSO_RUNTIME_CONSOLE_ROOT") {
        return Ok(PathBuf::from(root));
    }
    let sibling = std::env::current_dir()
        .context("read current directory")?
        .join("../lenso-runtime-console")
        .canonicalize()
        .context("resolve sibling lenso-runtime-console; set LENSO_RUNTIME_CONSOLE_ROOT if it is elsewhere")?;
    Ok(sibling)
}
```

- [ ] **Step 2: Add CLI args and dispatch**

Modify `/Users/leosouthey/Projects/framework/lenso-cli/src/main.rs`:

Add the module near the top:

```rust
mod console_dev;
```

Add a `Dev` variant to `ConsoleCommand`:

```rust
    /// Start a Runtime Console package development shell.
    Dev(ConsoleDevArgs),
```

Add a `Dev` variant to `ModuleCommand`:

```rust
    /// Start module-local development helpers.
    Dev(ModuleDevArgs),
```

Add args structs near `ConsoleUpdateArgs`:

```rust
#[derive(Debug, Args, Clone)]
struct ConsoleDevArgs {
    /// Console package directory. Defaults to the current directory.
    #[arg(long = "package")]
    package: Option<std::path::PathBuf>,

    /// Real Lenso host URL to proxy. Omit for standalone mock mode.
    #[arg(long)]
    host: Option<String>,

    /// Runtime Console dev server port.
    #[arg(long, default_value_t = 5174)]
    port: u16,

    /// Open browser after startup.
    #[arg(long)]
    open: bool,

    /// Runtime Console repository root.
    #[arg(long = "runtime-console-root")]
    runtime_console_root: Option<std::path::PathBuf>,
}

#[derive(Debug, Args, Clone)]
struct ModuleDevArgs {
    /// Start the Runtime Console package dev shell for this module repository.
    #[arg(long)]
    console: bool,

    /// Module repository root. Defaults to the current directory.
    #[arg(long)]
    repo_root: Option<std::path::PathBuf>,

    /// Real Lenso host URL to proxy. Omit for standalone mock mode.
    #[arg(long)]
    host: Option<String>,

    /// Runtime Console dev server port.
    #[arg(long, default_value_t = 5174)]
    port: u16,

    /// Open browser after startup.
    #[arg(long)]
    open: bool,

    /// Runtime Console repository root.
    #[arg(long = "runtime-console-root")]
    runtime_console_root: Option<std::path::PathBuf>,
}
```

Dispatch under `Command::Console`:

```rust
            ConsoleCommand::Dev(args) => {
                console_dev::run_console_dev(console_dev::ConsoleDevOptions {
                    cwd: None,
                    host: args.host,
                    open: args.open,
                    package: args.package,
                    port: args.port,
                    runtime_console_root: args.runtime_console_root,
                })?;
            }
```

Dispatch under `Command::Module`:

```rust
            ModuleCommand::Dev(args) => {
                if !args.console {
                    anyhow::bail!("`lenso module dev` currently requires --console");
                }
                console_dev::run_console_dev(console_dev::ConsoleDevOptions {
                    cwd: args.repo_root,
                    host: args.host,
                    open: args.open,
                    package: None,
                    port: args.port,
                    runtime_console_root: args.runtime_console_root,
                })?;
            }
```

- [ ] **Step 3: Verify CLI parsing**

Run:

```bash
cargo test --locked
cargo run -- console dev --help
cargo run -- module dev --help
```

Expected: tests PASS; help output includes `--host`, `--port`, `--open`, and `--runtime-console-root`.

- [ ] **Step 4: Commit**

```bash
git add src/console_dev.rs src/main.rs
git commit -m "feat: add console dev cli commands"
```

---

### Task 9: Document The Author Workflow

**Files:**

- Modify: `/Users/leosouthey/Projects/framework/lenso-runtime-console/README.md`
- Modify: `/Users/leosouthey/Projects/framework/lenso-cli/README.md`

- [ ] **Step 1: Update Runtime Console README**

In `/Users/leosouthey/Projects/framework/lenso-runtime-console/README.md`, add this section after the console package creation section:

````md
### Console Package Dev Server

Use the local dev shell to preview a package inside Runtime Console while
editing it:

```bash
pnpm console-package:dev --package ../lenso-auth-module/packages/auth-console
```
````

The default mode is standalone mock mode. It starts the Runtime Console shell,
loads the package through a temporary `/console/dev/registry.json`, and serves
the package bundle from a temporary `/console/extensions/dev/*` path.

Proxy a real Lenso host when the package needs real admin data or capabilities:

```bash
pnpm console-package:dev \
  --package ../lenso-auth-module/packages/auth-console \
  --host http://localhost:3000
```

Dev mode does not write `.lenso/console/extensions` and does not install
packages into the host. Production installs still use the normal service/module
install path.

````

- [ ] **Step 2: Update CLI README**

In `/Users/leosouthey/Projects/framework/lenso-cli/README.md`, add this Runtime Console authoring section near the existing console package docs:

```md
### Runtime Console package development

Preview a console package while editing it:

```bash
lenso console dev --package packages/auth-console
````

From a module repository root, discover every local console package:

```bash
lenso module dev --console
```

Both commands default to standalone mock mode. Add `--host` to proxy real Lenso
host APIs while still loading the local package bundle:

```bash
lenso module dev --console --host http://localhost:3000
```

Set `LENSO_RUNTIME_CONSOLE_ROOT=/path/to/lenso-runtime-console` when the Runtime
Console checkout is not a sibling of the current repository.

````

- [ ] **Step 3: Commit docs**

```bash
git add README.md
git commit -m "docs: document console dev workflow"
````

Then in `/Users/leosouthey/Projects/framework/lenso-cli`:

```bash
git add README.md
git commit -m "docs: document console dev commands"
```

---

### Task 10: Final Verification

**Files:**

- Verify all files changed by Tasks 1-9.

- [ ] **Step 1: Runtime Console checks**

Run in `/Users/leosouthey/Projects/framework/lenso-runtime-console`:

```bash
pnpm check:console-packages
pnpm exec vitest run src scripts/console-dev
pnpm typecheck:local
pnpm build:local
```

Expected: all commands PASS.

- [ ] **Step 2: CLI checks**

Run in `/Users/leosouthey/Projects/framework/lenso-cli`:

```bash
cargo test --locked
cargo run -- console dev --help
cargo run -- module dev --help
```

Expected: tests PASS; help commands exit 0.

- [ ] **Step 3: Manual smoke in mock mode**

Run in `/Users/leosouthey/Projects/framework/lenso-runtime-console`:

```bash
pnpm console-package:dev --package ../lenso-auth-module/packages/auth-console --port 5174
```

Expected:

- Terminal prints `Lenso Console Dev`.
- Browser URL `http://localhost:5174/console/launchpad` loads Runtime Console.
- Dev overlay shows `Mode: mock`.
- Auth package route appears in navigation.

Stop the dev server with `Ctrl-C`.

- [ ] **Step 4: Manual smoke through CLI**

Run in `/Users/leosouthey/Projects/framework/lenso-auth-module`:

```bash
LENSO_RUNTIME_CONSOLE_ROOT=../lenso-runtime-console \
  cargo run --manifest-path ../lenso-cli/Cargo.toml -- module dev --console --port 5174
```

Expected:

- Terminal prints `Lenso Console Dev`.
- It discovers local `packages/*-console` packages.
- Runtime Console opens with dev overlay in mock mode.

Stop the dev server with `Ctrl-C`.

- [ ] **Step 5: Final status**

Run:

```bash
git -C /Users/leosouthey/Projects/framework/lenso-runtime-console status --short --branch
git -C /Users/leosouthey/Projects/framework/lenso-cli status --short --branch
```

Expected: both repos contain only intentional committed changes or are clean after final commits.
