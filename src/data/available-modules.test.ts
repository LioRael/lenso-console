import { describe, expect, test } from "vitest";

import type { ServiceModuleLifecycleResponse } from "../pages/available-modules-model";
import {
  applyAvailableModuleInstallResponse,
  availableModulesPanelState,
  availableModulesQueryKey,
  availableModulesRows,
  fetchServiceModuleLifecycle,
  fetchServiceSystem,
  fetchServiceSystemDrift,
  installAvailableModule,
  moduleRefreshInvalidationQueryKeys,
  fetchAvailableModules,
  sampleAvailableModulesResponse,
  sampleServiceModuleLifecycleResponse,
  sampleServiceSystemDriftResponse,
  sampleServiceSystemResponse,
  serviceModuleLifecycleQueryKey,
  serviceSystemDriftQueryKey,
  serviceSystemQueryKey,
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
        source: "service",
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
      serviceSystemQueryKey,
      serviceSystemDriftQueryKey,
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

  test("fetches service system state", async () => {
    await expect(fetchServiceSystem()).resolves.toBe(
      sampleServiceSystemResponse
    );
    expect(serviceSystemQueryKey).toEqual(["modules", "service-system"]);
  });

  test("fetches service system drift state", async () => {
    await expect(fetchServiceSystemDrift()).resolves.toBe(
      sampleServiceSystemDriftResponse
    );
    expect(serviceSystemDriftQueryKey).toEqual([
      "modules",
      "service-system-drift",
    ]);
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
      moduleRelease: {
        manifestReference:
          "dist/lenso-service/billing-provider/modules/billing/lenso.module-release.json",
        name: "billing",
        providerName: "billing-provider",
        serviceManifest: "https://example.com/lenso/service/v1/manifest",
        servicePackage: null,
        version: "0.1.0",
      },
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

  test("applies module release provenance from install responses", () => {
    const next = applyAvailableModuleInstallResponse(
      sampleAvailableModulesResponse,
      {
        consolePlan: {
          error: null,
          exists: true,
          moduleEntryPresent: true,
          packageCount: 0,
          packages: [],
          planFile: ".lenso/console/extensions/registry.json",
          readable: true,
          restartRequired: true,
        },
        manifestReference: "https://example.com/lenso/module/v1/manifest",
        moduleName: "billing",
        moduleRelease: {
          manifestReference:
            "dist/lenso-service/billing-provider/modules/billing/lenso.module-release.json",
          name: "billing",
          providerName: "billing-provider",
          serviceManifest: "https://example.com/lenso/service/v1/manifest",
          servicePackage: null,
          version: "0.1.0",
        },
        linkedSource: null,
        remoteSource: {
          configured: true,
          desiredBaseUrl: "https://example.com/lenso/service/v1",
          envFile: ".env",
          error: null,
          restartPending: true,
          restartReason:
            "service provider source configured in .env but not loaded",
          runningBaseUrl: null,
        },
        restartRequired: true,
      }
    );

    const billing = next?.modules.find((module) => module.name === "billing");
    expect(billing?.moduleRelease).toEqual({
      manifestReference:
        "dist/lenso-service/billing-provider/modules/billing/lenso.module-release.json",
      name: "billing",
      providerName: "billing-provider",
      serviceManifest: "https://example.com/lenso/service/v1/manifest",
      servicePackage: null,
      version: "0.1.0",
    });
    expect(billing?.installState?.remoteSource?.desiredBaseUrl).toBe(
      "https://example.com/lenso/service/v1"
    );
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
