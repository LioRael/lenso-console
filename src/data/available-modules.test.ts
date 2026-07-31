import { describe, expect, test } from "vitest";

import type { ServiceModuleLifecycleResponse } from "../pages/available-modules-model";
import {
  availableModulesPanelState,
  availableModulesQueryKey,
  availableModulesRows,
  fetchAvailableModules,
  fetchLaunchpad,
  fetchLaunchpadChangePlan,
  fetchLaunchpadDoctor,
  fetchLaunchpadProof,
  fetchServiceModuleLifecycle,
  fetchServiceSystem,
  fetchServiceSystemDrift,
  fetchServiceSystemRunbooks,
  fetchServiceSystemReleaseTrain,
  installAvailableModule,
  launchpadQueryKey,
  launchpadChangePlanQueryKey,
  moduleRefreshInvalidationQueryKeys,
  launchpadDoctorQueryKey,
  launchpadProofQueryKey,
  sampleAvailableModulesResponse,
  sampleLaunchpadChangePlanResponse,
  sampleLaunchpadDoctorResponse,
  sampleLaunchpadProofResponse,
  sampleLaunchpadResponse,
  sampleServiceModuleLifecycleResponse,
  sampleServiceSystemDriftResponse,
  sampleServiceSystemRunbooksResponse,
  sampleServiceSystemReleaseTrainResponse,
  sampleServiceSystemResponse,
  serviceModuleLifecycleQueryKey,
  serviceSystemDriftQueryKey,
  serviceSystemRunbooksQueryKey,
  serviceSystemReleaseTrainQueryKey,
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
      launchpadQueryKey,
      launchpadDoctorQueryKey,
      launchpadProofQueryKey,
      launchpadChangePlanQueryKey,
      serviceModuleLifecycleQueryKey,
      serviceSystemQueryKey,
      serviceSystemDriftQueryKey,
      serviceSystemReleaseTrainQueryKey,
      serviceSystemRunbooksQueryKey,
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

  test("fetches service system release train state", async () => {
    await expect(fetchServiceSystemReleaseTrain()).resolves.toBe(
      sampleServiceSystemReleaseTrainResponse
    );
    expect(serviceSystemReleaseTrainQueryKey).toEqual([
      "modules",
      "service-system-release-train",
    ]);
  });

  test("fetches service system runbooks state", async () => {
    await expect(fetchServiceSystemRunbooks()).resolves.toBe(
      sampleServiceSystemRunbooksResponse
    );
    expect(serviceSystemRunbooksQueryKey).toEqual([
      "modules",
      "service-system-runbooks",
    ]);
  });

  test("fetches Launchpad state", async () => {
    await expect(fetchLaunchpad()).resolves.toBe(sampleLaunchpadResponse);
    expect(launchpadQueryKey).toEqual(["launchpad"]);

    const getCalls: string[] = [];
    const response = {
      ...sampleLaunchpadResponse,
      status: "empty",
    };
    const client = {
      get(path: string) {
        getCalls.push(path);
        return {
          json: async () => response,
        };
      },
    };

    await expect(fetchLaunchpad({ apiMode: true, client })).resolves.toBe(
      response
    );
    expect(getCalls).toEqual(["admin/data/launchpad"]);
  });

  test("fetches Launchpad doctor state", async () => {
    await expect(fetchLaunchpadDoctor()).resolves.toBe(
      sampleLaunchpadDoctorResponse
    );
    expect(launchpadDoctorQueryKey).toEqual(["launchpad", "doctor"]);

    const getCalls: string[] = [];
    const response = {
      ...sampleLaunchpadDoctorResponse,
      status: "ready",
    };
    const client = {
      get(path: string) {
        getCalls.push(path);
        return {
          json: async () => response,
        };
      },
    };

    await expect(fetchLaunchpadDoctor({ apiMode: true, client })).resolves.toBe(
      response
    );
    expect(getCalls).toEqual(["admin/data/launchpad/doctor"]);
  });

  test("fetches Launchpad App Proof state", async () => {
    await expect(fetchLaunchpadProof()).resolves.toBe(
      sampleLaunchpadProofResponse
    );
    expect(launchpadProofQueryKey).toEqual(["launchpad", "proof"]);

    const getCalls: string[] = [];
    const response = {
      ...sampleLaunchpadProofResponse,
      status: "drifted",
    };
    const client = {
      get(path: string) {
        getCalls.push(path);
        return {
          json: async () => response,
        };
      },
    };

    await expect(fetchLaunchpadProof({ apiMode: true, client })).resolves.toBe(
      response
    );
    expect(getCalls).toEqual(["admin/data/launchpad/proof"]);
  });

  test("fetches Launchpad app change plan state", async () => {
    await expect(fetchLaunchpadChangePlan()).resolves.toBe(
      sampleLaunchpadChangePlanResponse
    );
    expect(launchpadChangePlanQueryKey).toEqual(["launchpad", "change-plan"]);

    const getCalls: string[] = [];
    const response = {
      ...sampleLaunchpadChangePlanResponse,
      status: "ready",
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
      fetchLaunchpadChangePlan({ apiMode: true, client })
    ).resolves.toBe(response);
    expect(getCalls).toEqual(["admin/data/launchpad/change-plan"]);
  });

  test("installs an available module through the API", async () => {
    const postCalls: Array<{
      path: string;
      options: { json: unknown } | undefined;
    }> = [];
    const plan = { approval_boundaries: [], plan_id: "plan-1" };
    const ready = { operation_id: "op-1", revision: 0, state: "ready" };
    const succeeded = {
      operation_id: "op-1",
      revision: 1,
      state: "succeeded",
    };
    const client = {
      post(path: string, options?: { json: unknown }) {
        postCalls.push({ path, options });
        const response =
          path === "admin/modules/plans/preview"
            ? plan
            : path === "admin/modules/operations"
              ? ready
              : succeeded;
        return {
          json: async () => response,
        };
      },
    };

    await expect(
      installAvailableModule({ client, moduleName: "billing" })
    ).resolves.toBe(succeeded);
    expect(postCalls.map(({ path }) => path)).toEqual([
      "admin/modules/plans/preview",
      "admin/modules/operations",
      "admin/modules/operations/op-1/apply",
    ]);
    expect(postCalls[0]?.options).toEqual({
      json: {
        kind: "install",
        selection: {
          module_id: "billing",
          optional_requirements: [],
          version_requirement: "*",
        },
      },
    });
    expect(postCalls[1]?.options).toEqual({
      json: { idempotency_key: expect.any(String), plan },
    });
  });

  test("approves and applies an available module uninstall", async () => {
    const postCalls: Array<{
      path: string;
      options: { json: unknown } | undefined;
    }> = [];
    const plan = {
      approval_boundaries: [{ boundary_id: "destructive-change" }],
      plan_id: "plan-2",
    };
    const awaitingApproval = {
      operation_id: "op-2",
      revision: 0,
      state: "awaiting_approval",
    };
    const ready = { operation_id: "op-2", revision: 1, state: "ready" };
    const succeeded = {
      operation_id: "op-2",
      revision: 2,
      state: "succeeded",
    };
    const client = {
      post(path: string, options?: { json: unknown }) {
        postCalls.push({ path, options });
        const response =
          path === "admin/modules/plans/preview"
            ? plan
            : path === "admin/modules/operations"
              ? awaitingApproval
              : path.endsWith("/approvals")
                ? ready
                : succeeded;
        return {
          json: async () => response,
        };
      },
    };

    await expect(
      uninstallAvailableModule({ client, moduleName: "billing" })
    ).resolves.toBe(succeeded);
    expect(postCalls.map(({ path }) => path)).toEqual([
      "admin/modules/plans/preview",
      "admin/modules/operations",
      "admin/modules/operations/op-2/approvals",
      "admin/modules/operations/op-2/apply",
    ]);
    expect(postCalls[0]?.options).toEqual({
      json: { kind: "uninstall", module_id: "billing" },
    });
    expect(postCalls[2]?.options).toEqual({
      json: {
        boundary_id: "destructive-change",
        expected_revision: 0,
        nonce: expect.any(String),
        reason: "Approved in Runtime Console",
      },
    });
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
      actionCommand: "Use Marketplace to install a module",
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
      actionCommand: "Use Marketplace to install a module",
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
      actionCommand: "Use Marketplace to install a module",
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
      actionCommand: "Use Marketplace to install a module",
      detail: "add baseUrl or use a manifest URL ending with /manifest",
      moduleCount: 2,
      kind: "ready",
      label: "2 modules",
      message: "Catalog: .lenso/module-catalog.json",
      source: ".lenso/module-catalog.json",
    });
  });
});
