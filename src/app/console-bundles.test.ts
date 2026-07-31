import { describe, expect, test, vi } from "vitest";

import {
  CONSOLE_BUNDLE_HOST_API,
  loadConsoleBundlePackages,
  consoleBundlePackages,
  type ConsoleBundleManifest,
  type ConsoleBundleRegistry,
} from "./console-bundles";

function BundlePage() {
  return "CRM";
}

const crmModule = {
  id: "crm",
  surfaces: [
    {
      area: "data",
      component: BundlePage,
      label: "CRM",
      path: "/crm",
    },
  ],
} as const;

const crmBundle = {
  entry: "/console/extensions/crm/entry.js",
  exportName: "crmConsoleModule",
  hostApi: CONSOLE_BUNDLE_HOST_API,
  packageName: "@vendor/crm-console",
  styles: ["/console/extensions/crm/entry.css"],
  version: "1.0.0",
} satisfies ConsoleBundleManifest;

const registry = {
  bundles: [crmBundle],
  version: 1,
} satisfies ConsoleBundleRegistry;

describe("console bundles", () => {
  test("loads same-origin bundle exports as console packages", async () => {
    const calls: string[] = [];
    const importModule = vi.fn().mockImplementation(async () => {
      calls.push("import");
      return { crmConsoleModule: crmModule };
    });
    const loadStyle = vi.fn().mockImplementation(async (href: string) => {
      calls.push(`style:${href}`);
    });

    await expect(
      consoleBundlePackages(registry, {
        importModule,
        loadStyle,
        origin: "http://lenso.test",
      })
    ).resolves.toEqual([
      expect.objectContaining({
        exportName: "crmConsoleModule",
        module: crmModule,
        packageName: "@vendor/crm-console",
        source: "runtime_bundle",
        version: "1.0.0",
      }),
    ]);
    expect(importModule).toHaveBeenCalledWith(
      "/console/extensions/crm/entry.js"
    );
    expect(loadStyle).toHaveBeenCalledWith("/console/extensions/crm/entry.css");
    expect(calls).toEqual([
      "style:/console/extensions/crm/entry.css",
      "import",
    ]);
  });

  test("rejects cross-origin bundle entries", async () => {
    await expect(
      consoleBundlePackages(
        {
          bundles: [
            {
              ...crmBundle,
              entry: "https://cdn.example.com/crm/entry.js",
            },
          ],
          version: 1,
        },
        {
          importModule: vi.fn(),
          origin: "http://lenso.test",
        }
      )
    ).rejects.toThrow("Console bundle entry must be same-origin");
  });

  test("rejects cross-origin bundle styles", async () => {
    await expect(
      consoleBundlePackages(
        {
          bundles: [
            {
              ...crmBundle,
              styles: ["https://cdn.example.com/crm/entry.css"],
            },
          ],
          version: 1,
        },
        {
          importModule: vi.fn(),
          loadStyle: vi.fn(),
          origin: "http://lenso.test",
        }
      )
    ).rejects.toThrow("Console bundle style must be same-origin");
  });

  test("rejects unsupported host API versions", async () => {
    await expect(
      consoleBundlePackages(
        {
          bundles: [
            {
              ...crmBundle,
              hostApi: "99",
            },
          ],
          version: 1,
        },
        {
          importModule: vi.fn(),
          origin: "http://lenso.test",
        }
      )
    ).rejects.toThrow("requires console host API 99");
  });

  test("rejects exports that are not console modules", async () => {
    await expect(
      consoleBundlePackages(registry, {
        importModule: vi.fn().mockResolvedValue({ crmConsoleModule: {} }),
        origin: "http://lenso.test",
      })
    ).rejects.toThrow("Console bundle export is not a console module");
  });

  test("skips bundles missing required capabilities", async () => {
    await expect(
      consoleBundlePackages(
        {
          bundles: [
            {
              ...crmBundle,
              requiredCapabilities: ["crm.read"],
            },
          ],
          version: 1,
        },
        {
          availableCapabilities: ["other.read"],
          importModule: vi.fn(),
          origin: "http://lenso.test",
        }
      )
    ).resolves.toEqual([]);
  });

  test("treats wildcard capability as full bundle access", async () => {
    const importModule = vi.fn().mockResolvedValue({
      crmConsoleModule: crmModule,
    });

    await expect(
      consoleBundlePackages(
        {
          bundles: [
            {
              ...crmBundle,
              requiredCapabilities: ["crm.read"],
            },
          ],
          version: 1,
        },
        {
          availableCapabilities: ["*"],
          importModule,
          origin: "http://lenso.test",
        }
      )
    ).resolves.toEqual([
      expect.objectContaining({
        exportName: "crmConsoleModule",
        module: crmModule,
        packageName: "@vendor/crm-console",
      }),
    ]);
  });

  test("treats a missing registry as no runtime bundles", async () => {
    const fetchJson = vi.fn().mockResolvedValue(
      new Response("not found", {
        headers: { "content-type": "text/plain" },
        status: 404,
      })
    );

    await expect(
      loadConsoleBundlePackages("/console/extensions/registry.json", {
        fetchJson,
        origin: "http://lenso.test",
      })
    ).resolves.toEqual([]);
  });
});
