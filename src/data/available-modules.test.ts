import { describe, expect, test } from "vitest";

import type { ServiceModuleLifecycleResponse } from "../pages/available-modules-model";
import {
  availableModulesPanelState,
  availableModulesQueryKey,
  availableModulesRows,
  fetchServiceModuleLifecycle,
  installAvailableModule,
  moduleRefreshInvalidationQueryKeys,
  fetchAvailableModules,
  sampleAvailableModulesResponse,
  sampleServiceModuleLifecycleResponse,
  serviceModuleLifecycleQueryKey,
  uninstallAvailableModule,
} from "./available-modules";

describe("available modules provider", () => {
  test("provides read-only rows derived from available module data", () => {
    expect(sampleAvailableModulesResponse.version).toBe(1);
    expect(sampleAvailableModulesResponse.catalog.registryFile).toBe(
      ".lenso/module-catalog.json"
    );

    expect(availableModulesRows()).toEqual([
      expect.objectContaining({
        name: "billing",
        preflightStatus: "ready",
        source: "remote",
      }),
      expect.objectContaining({
        name: "local-crm",
        preflightReason: "local-crm baseUrl is missing",
        preflightStatus: "needs_base_url",
      }),
    ]);
  });

  test("defines a stable async fetch boundary for available modules", async () => {
    await expect(fetchAvailableModules()).resolves.toBe(
      sampleAvailableModulesResponse
    );
    expect(availableModulesQueryKey).toEqual(["modules", "available-modules"]);
  });

  test("includes available modules in module refresh invalidation keys", () => {
    expect(moduleRefreshInvalidationQueryKeys()).toEqual([
      ["modules", "registry"],
      availableModulesQueryKey,
      serviceModuleLifecycleQueryKey,
    ]);
  });

  test("fetches the current available modules endpoint in API mode", async () => {
    const getCalls: string[] = [];
    const response = {
      ...sampleAvailableModulesResponse,
      status: "passed",
    };
    const client = {
      get(path: string) {
        getCalls.push(path);
        return {
          json: async () => response,
        };
      },
    };

    await expect(
      fetchAvailableModules({ apiMode: true, client })
    ).resolves.toBe(response);
    expect(getCalls).toEqual(["admin/data/available-modules"]);
  });

  test("fetches service module lifecycle state", async () => {
    await expect(fetchServiceModuleLifecycle()).resolves.toBe(
      sampleServiceModuleLifecycleResponse
    );
    expect(serviceModuleLifecycleQueryKey).toEqual([
      "modules",
      "service-module-lifecycle",
    ]);

    const getCalls: string[] = [];
    const response: ServiceModuleLifecycleResponse = {
      modules: [],
      status: "empty",
      version: 1,
    };
    const client = {
      get(path: string) {
        getCalls.push(path);
        return {
          json: async () => response,
        };
      },
    };

    await expect(
      fetchServiceModuleLifecycle({ apiMode: true, client })
    ).resolves.toBe(response);
    expect(getCalls).toEqual(["admin/data/service-modules"]);
  });

  test("installs an available module through the API", async () => {
    const postCalls: string[] = [];
    const response = {
      consolePlan: {
        error: null,
        exists: true,
        moduleEntryPresent: true,
        packageCount: 1,
        packages: [],
        planFile: ".lenso/console/extensions/registry.json",
        readable: true,
        restartRequired: true,
      },
      manifestReference: "https://example.com/lenso/module/v1/manifest",
      moduleName: "billing",
      linkedSource: null,
      remoteSource: {
        configured: true,
        desiredBaseUrl: "https://example.com/lenso/module/v1",
        envFile: ".env",
        error: null,
        restartPending: true,
        restartReason:
          "service provider source configured in .env but not loaded",
        runningBaseUrl: null,
      },
      restartRequired: true,
    };
    const client = {
      post(path: string, options: unknown) {
        postCalls.push(`${path}:${JSON.stringify(options)}`);
        return {
          json: async () => response,
        };
      },
    };

    await expect(
      installAvailableModule({ client, moduleName: "billing" })
    ).resolves.toBe(response);
    expect(postCalls).toEqual([
      'admin/data/available-modules/billing/install:{"json":{}}',
    ]);
  });

  test("uninstalls an available module through the API", async () => {
    const deleteCalls: string[] = [];
    const response = {
      consolePlan: {
        error: null,
        exists: true,
        moduleEntryPresent: false,
        packageCount: 0,
        packages: [],
        planFile: ".lenso/console/extensions/registry.json",
        readable: true,
        restartRequired: true,
      },
      manifestReference: "https://example.com/lenso/module/v1/manifest",
      moduleName: "billing",
      linkedSource: null,
      remoteSource: {
        configured: false,
        desiredBaseUrl: null,
        envFile: ".env",
        error: null,
        restartPending: false,
        restartReason: null,
        runningBaseUrl: null,
      },
      restartRequired: true,
    };
    const client = {
      delete(path: string) {
        deleteCalls.push(path);
        return {
          json: async () => response,
        };
      },
    };

    await expect(
      uninstallAvailableModule({ client, moduleName: "billing" })
    ).resolves.toBe(response);
    expect(deleteCalls).toEqual([
      "admin/data/available-modules/billing/install",
    ]);
  });

  test("summarizes available modules panel states", () => {
    expect(
      availableModulesPanelState({
        isError: false,
        isLoading: true,
        response: null,
        rows: [],
      })
    ).toEqual({
      actionCommand: "lenso module marketplace install <manifest-url>",
      detail: ".lenso/module-catalog.json",
      moduleCount: 0,
      kind: "loading",
      label: "loading",
      message: "Loading available modules.",
      source: ".lenso/module-catalog.json",
    });

    expect(
      availableModulesPanelState({
        isError: true,
        isLoading: false,
        response: null,
        rows: [],
      })
    ).toMatchObject({
      actionCommand: "lenso module marketplace install <manifest-url>",
      detail: "check the API and local catalog file",
      kind: "error",
      label: "unavailable",
      source: ".lenso/module-catalog.json",
    });

    expect(
      availableModulesPanelState({
        isError: false,
        isLoading: false,
        response: {
          ...sampleAvailableModulesResponse,
          catalog: {
            modules: 0,
            registryFile: ".lenso/module-catalog.json",
            version: 1,
          },
          modules: [],
        },
        rows: [],
      })
    ).toMatchObject({
      actionCommand: "lenso module marketplace install <manifest-url>",
      detail: "install a manifest URL to show modules here",
      kind: "empty",
      label: "no service modules",
      message: "No modules in .lenso/module-catalog.json.",
    });

    expect(
      availableModulesPanelState({
        isError: false,
        isLoading: false,
        response: sampleAvailableModulesResponse,
        rows: availableModulesRows(),
      })
    ).toMatchObject({
      actionCommand: "lenso module marketplace install <manifest-url>",
      detail: "add baseUrl or use a manifest URL ending with /manifest",
      moduleCount: 2,
      kind: "ready",
      label: "2 modules",
      message: "Catalog: .lenso/module-catalog.json",
      source: ".lenso/module-catalog.json",
    });
  });
});
