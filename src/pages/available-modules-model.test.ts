import { describe, expect, test } from "vitest";

import {
  type AvailableModuleInstallState,
  type AvailableModulesResponse,
  type AvailableModulesCatalog,
  type ServiceModuleLifecycleResponse,
  type ServiceModuleLifecycleModuleStatus,
  availableModuleDoctorChecks,
  availableModuleHandoffState,
  availableModuleInstallSteps,
  availableModuleRowsFromResponse,
  availableModuleRows,
} from "./available-modules-model";

const catalog: AvailableModulesCatalog = {
  modules: [
    {
      baseUrl: "https://example.com/lenso/module/v1",
      capabilities: ["billing.read", "billing.write"],
      consoleUiArtifacts: [
        {
          exportName: "billingConsoleModule",
          packageName: "@vendor/lenso-billing-console",
          route: "/data/billing",
        },
      ],
      manifestReference: "https://example.com/lenso/module/v1/manifest",
      name: "billing",
      source: "service",
      summary: "Billing workspace and operations",
      version: "0.1.0",
    },
  ],
  version: 1,
};

const installCommands = [
  {
    command:
      "lenso module marketplace install https://example.com/lenso/module/v1/manifest",
    key: "add",
    label: "install",
  },
  {
    command:
      "lenso module install https://example.com/lenso/module/v1/manifest",
    key: "apply-plan",
    label: "extension",
  },
  {
    command: "reload Lenso Console",
    key: "install-packages",
    label: "reload",
  },
];

const baseInstallState: AvailableModuleInstallState = {
  moduleRegistered: false,
  serviceSource: {
    configured: false,
    desiredBaseUrl: null,
    envFile: ".env",
    error: null,
    restartPending: false,
    restartReason: null,
    runningBaseUrl: null,
  },
};

function remoteInstallState(
  overrides: Partial<NonNullable<AvailableModuleInstallState["serviceSource"]>>
): NonNullable<AvailableModuleInstallState["serviceSource"]> {
  return {
    configured: false,
    desiredBaseUrl: null,
    envFile: ".env",
    error: null,
    restartPending: false,
    restartReason: null,
    runningBaseUrl: null,
    ...overrides,
  };
}

function serviceLifecycle(
  status: ServiceModuleLifecycleModuleStatus,
  fixes: string[] = []
): ServiceModuleLifecycleResponse {
  return {
    modules: [
      {
        baseUrl: "https://example.com/lenso/module/v1",
        configured: true,
        fixes,
        installed: true,
        loaded: status === "ready",
        manifestStatus:
          status === "manifest_unreachable" ? "unreachable" : "reachable",
        manifestUrl: "https://example.com/lenso/module/v1/manifest",
        moduleName: "billing",
        restartPending: status === "restart_pending",
        compatibility: {
          declared: {
            consoleBridge: "1",
          },
          fix: null,
          host: {
            consoleBridge: "1",
            lensoVersion: "0.1.0",
          },
          issue: null,
          overrideAllowed: false,
          state: "compatible",
        },
        serviceStatus: {
          checked: true,
          checks: [{ name: "service", status: "ok" }],
          error: null,
          state: "ready",
        },
        statusUrl: "https://example.com/lenso/module/v1/status",
        services: [
          {
            autoStart: true,
            lockFile: ".lenso/services/billing.lock",
            name: "billing-api",
            pidFile: ".lenso/services/billing.pid",
            ready: status !== "service_not_ready",
            readyUrl: "https://example.com/lenso/module/v1/ready",
          },
        ],
        status,
      },
    ],
    status: status === "ready" ? "ready" : "needs_attention",
    version: 1,
  };
}

describe("available modules model", () => {
  test("builds rows from available module catalog entries", () => {
    expect(availableModuleRows(catalog)).toEqual([
      {
        baseUrl: "https://example.com/lenso/module/v1",
        capabilityCount: 2,
        consoleUiArtifactHintCount: 1,
        key: "billing:0.1.0:https://example.com/lenso/module/v1/manifest",
        manifestReference: "https://example.com/lenso/module/v1/manifest",
        name: "billing",
        preflightLabel: "unknown",
        preflightReason:
          "manifest will be read from the manifest URL during install",
        preflightStatus: "unknown",
        source: "service",
        summary: "Billing workspace and operations",
        version: "0.1.0",
      },
    ]);
  });

  test("marks entries ready when the manifest snapshot matches", () => {
    expect(
      availableModuleRows(catalog, {
        billing: {
          consoleUiArtifacts: [
            {
              exportName: "billingConsoleModule",
              packageName: "@vendor/lenso-billing-console",
            },
          ],
          name: "billing",
          source: "service",
          version: "0.1.0",
        },
      })[0]
    ).toMatchObject({
      preflightLabel: "ready",
      preflightReason: "module manifest is available",
      preflightStatus: "ready",
    });
  });

  test("builds low-friction handoff state from local install status", () => {
    const [row] = availableModuleRows(catalog);
    expect(row).toBeDefined();

    expect(
      availableModuleHandoffState({
        installCommand:
          "lenso module marketplace install https://example.com/lenso/module/v1/manifest",
        row: row!,
      })
    ).toEqual({
      action: "install",
      command:
        "lenso module marketplace install https://example.com/lenso/module/v1/manifest",
      detail: "manifest will be read from the manifest URL during install",
      kind: "available",
      label: "available",
      moduleName: "billing",
    });

    expect(
      availableModuleHandoffState({
        installed: {
          moduleName: "billing",
          packageInstallNeeded: true,
          restartPending: false,
        },
        installCommand:
          "lenso module marketplace install https://example.com/lenso/module/v1/manifest",
        row: row!,
      })
    ).toEqual({
      action: "install_package",
      detail: "reload Lenso Console after extension install",
      kind: "package_install_needed",
      label: "extension reload needed",
      moduleName: "billing",
      path: "/modules?module=billing",
    });

    expect(
      availableModuleHandoffState({
        installed: {
          moduleName: "billing",
          packageInstallNeeded: false,
          restartPending: false,
        },
        installCommand:
          "lenso module marketplace install https://example.com/lenso/module/v1/manifest",
        row: row!,
      })
    ).toEqual({
      action: "open",
      detail: "open installed module",
      kind: "installed",
      label: "installed",
      moduleName: "billing",
      path: "/modules?module=billing",
    });

    expect(
      availableModuleHandoffState({
        installed: {
          moduleName: "billing",
          packageInstallNeeded: true,
          restartPending: true,
        },
        installCommand:
          "lenso module marketplace install https://example.com/lenso/module/v1/manifest",
        row: row!,
      })
    ).toEqual({
      action: "restart",
      detail: "restart API and worker",
      kind: "restart_pending",
      label: "restart pending",
      moduleName: "billing",
      path: "/modules?module=billing",
    });
  });

  test("uses backend install state to advance local install handoff", () => {
    const [baseRow] = availableModuleRows(catalog);
    expect(baseRow).toBeDefined();
    const row = {
      ...baseRow!,
      installState: {
        ...baseInstallState,
        serviceSource: remoteInstallState({
          configured: true,
          desiredBaseUrl: "grpc://example.com:50051",
          restartPending: true,
          restartReason:
            "service provider source configured in .env but not loaded",
        }),
      },
    };

    const handoff = availableModuleHandoffState({
      installCommand: installCommands[0]!.command,
      row,
    });
    expect(handoff).toMatchObject({
      detail: "service provider source configured in .env but not loaded",
      kind: "restart_pending",
    });
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          catalogSource: ".lenso/module-catalog.json",
          installState: row.installState,
        },
        handoff,
        row,
      })[1]
    ).toMatchObject({
      evidence: "1 Console UI artifact hint in catalog",
      status: "done",
    });
  });

  test("uses backend remote source evidence for restart pending state", () => {
    const [baseRow] = availableModuleRows(catalog);
    expect(baseRow).toBeDefined();
    const row = {
      ...baseRow!,
      installState: {
        ...baseInstallState,
        serviceSource: remoteInstallState({
          configured: true,
          desiredBaseUrl: "grpc://example.com:50051",
          restartPending: true,
          restartReason:
            "service provider source configured in .env but not loaded",
        }),
      },
    };
    const handoff = availableModuleHandoffState({
      installCommand: installCommands[0]!.command,
      row,
    });

    expect(handoff).toMatchObject({
      detail: "service provider source configured in .env but not loaded",
      kind: "restart_pending",
    });
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          installState: row.installState,
        },
        handoff,
        row,
      })[3]
    ).toMatchObject({
      evidence: "service provider source configured in .env but not loaded",
      status: "current",
    });
  });

  test("builds doctor checks for pending service module install work", () => {
    const [baseRow] = availableModuleRows(catalog);
    expect(baseRow).toBeDefined();
    const row = {
      ...baseRow!,
      installState: {
        ...baseInstallState,
        serviceSource: remoteInstallState({
          configured: true,
          desiredBaseUrl: "grpc://example.com:50051",
          restartPending: true,
          restartReason:
            "service provider source configured in .env but not loaded",
        }),
      },
    };

    expect(
      availableModuleDoctorChecks({
        commands: installCommands,
        missingConsoleUiArtifactCount: 1,
        restartPending: true,
        row,
      }).map((check) => [check.key, check.status, check.command ?? null])
    ).toEqual([
      ["source", "ok", null],
      [
        "plan",
        "fix",
        "lenso module marketplace install https://example.com/lenso/module/v1/manifest",
      ],
      ["package", "fix", "reload Lenso Console"],
      ["runtime", "fix", null],
      ["restart", "fix", null],
      ["doctor", "ok", "lenso module doctor"],
    ]);
    expect(
      availableModuleDoctorChecks({
        commands: installCommands,
        row,
      })[0]?.detail
    ).toBe("LENSO_SERVICES -> grpc://example.com:50051 (grpc)");
  });

  test("builds clean doctor checks for installed service modules", () => {
    const [baseRow] = availableModuleRows(catalog);
    expect(baseRow).toBeDefined();
    const row = {
      ...baseRow!,
      installState: {
        ...baseInstallState,
        moduleRegistered: true,
        serviceSource: remoteInstallState({
          configured: true,
          desiredBaseUrl: "https://example.com/lenso/module/v1",
          runningBaseUrl: "https://example.com/lenso/module/v1",
        }),
      },
    };

    expect(
      availableModuleDoctorChecks({
        commands: installCommands,
        moduleRegistered: true,
        row,
      }).map((check) => [check.key, check.status, check.command ?? null])
    ).toEqual([
      ["source", "ok", null],
      ["plan", "ok", null],
      ["package", "ok", null],
      ["runtime", "ok", null],
      ["restart", "ok", null],
      ["doctor", "ok", "lenso module doctor"],
    ]);
  });

  test("adds service lifecycle doctor checks when Host exposes lifecycle state", () => {
    const [baseRow] = availableModuleRows(catalog);
    expect(baseRow).toBeDefined();
    const row = {
      ...baseRow!,
      installState: {
        ...baseInstallState,
        moduleRegistered: true,
        serviceSource: remoteInstallState({
          configured: true,
          desiredBaseUrl: "https://example.com/lenso/module/v1",
          runningBaseUrl: "https://example.com/lenso/module/v1",
        }),
      },
    };

    expect(
      availableModuleDoctorChecks({
        commands: installCommands,
        moduleRegistered: true,
        row,
        serviceLifecycle: serviceLifecycle("ready"),
      }).map((check) => [check.key, check.status, check.detail])
    ).toContainEqual(["service", "ok", "service is ready"]);

    expect(
      availableModuleDoctorChecks({
        commands: installCommands,
        moduleRegistered: true,
        row,
        serviceLifecycle: serviceLifecycle("restart_pending", [
          "restart API and worker",
        ]),
      }).map((check) => [check.key, check.status, check.detail])
    ).toContainEqual(["service", "fix", "restart API and worker"]);

    expect(
      availableModuleDoctorChecks({
        commands: installCommands,
        moduleRegistered: true,
        row,
        serviceLifecycle: serviceLifecycle("manifest_unreachable", [
          "start the support-ticket service",
        ]),
      }).map((check) => [check.key, check.status, check.detail])
    ).toContainEqual(["service", "fix", "start the support-ticket service"]);

    expect(
      availableModuleDoctorChecks({
        commands: installCommands,
        moduleRegistered: true,
        row,
        serviceLifecycle: serviceLifecycle("stale_state", [
          "remove stale lock file .lenso/services/billing.lock",
        ]),
      }).map((check) => [check.key, check.status, check.detail])
    ).toContainEqual([
      "service",
      "fix",
      "remove stale lock file .lenso/services/billing.lock",
    ]);

    const unreachable = serviceLifecycle("ready");
    unreachable.modules[0]!.serviceStatus = {
      checked: true,
      checks: [],
      error: "status endpoint returned HTTP 503",
      state: "unreachable",
    };
    expect(
      availableModuleDoctorChecks({
        commands: installCommands,
        moduleRegistered: true,
        row,
        serviceLifecycle: unreachable,
      }).map((check) => [check.key, check.status, check.detail])
    ).toContainEqual(["service", "fix", "status endpoint returned HTTP 503"]);
  });

  test("builds install wizard steps from handoff states", () => {
    const [row] = availableModuleRows(catalog);
    expect(row).toBeDefined();
    const available = availableModuleHandoffState({
      installCommand: installCommands[0]!.command,
      row: row!,
    });

    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          catalogSource: ".lenso/module-catalog.json",
          moduleRegistered: false,
        },
        handoff: available,
        row: row!,
      }).map((step) => [step.key, step.status, step.command ?? null])
    ).toEqual([
      ["add", "current", installCommands[0]!.command],
      ["apply-plan", "pending", null],
      ["install-packages", "pending", null],
      ["restart", "pending", null],
      ["open", "pending", null],
    ]);
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          catalogSource: ".lenso/module-catalog.json",
          moduleRegistered: false,
        },
        handoff: available,
        row: row!,
      })[0]
    ).toMatchObject({
      detail: "manifest will be read from the manifest URL during install",
      evidence: "catalog source: .lenso/module-catalog.json",
    });

    const packageInstall = availableModuleHandoffState({
      installed: {
        moduleName: "billing",
        packageInstallNeeded: true,
        restartPending: false,
      },
      installCommand: installCommands[0]!.command,
      row: row!,
    });
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          consoleInstallPlanCount: 1,
          missingConsoleUiArtifactCount: 1,
          moduleRegistered: true,
        },
        handoff: packageInstall,
        row: row!,
      }).map((step) => [step.key, step.status, step.command ?? null])
    ).toEqual([
      ["add", "done", null],
      ["apply-plan", "current", null],
      ["install-packages", "pending", null],
      ["restart", "pending", null],
      ["open", "pending", null],
    ]);
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          consoleInstallPlanCount: 1,
          missingConsoleUiArtifactCount: 1,
          moduleRegistered: true,
        },
        handoff: packageInstall,
        row: row!,
      })[1]
    ).toMatchObject({
      evidence:
        "1 missing Console UI artifact; 1 artifact entry derived from backend metadata",
    });

    const restart = availableModuleHandoffState({
      installed: {
        moduleName: "billing",
        packageInstallNeeded: false,
        restartPending: true,
      },
      installCommand: installCommands[0]!.command,
      row: row!,
    });
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          desiredEnabled: true,
          moduleRegistered: true,
          restartPending: true,
          runningEnabled: false,
        },
        handoff: restart,
        row: row!,
      }).map((step) => [step.key, step.status, step.path ?? null])
    ).toEqual([
      ["add", "done", null],
      ["apply-plan", "done", null],
      ["install-packages", "done", null],
      ["restart", "current", "/modules?module=billing"],
      ["open", "pending", null],
    ]);
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          desiredEnabled: true,
          moduleRegistered: true,
          restartPending: true,
          runningEnabled: false,
        },
        handoff: restart,
        row: row!,
      })[3]
    ).toMatchObject({
      evidence: "runtime config desired=true running=false",
    });

    const installed = availableModuleHandoffState({
      installed: {
        moduleName: "billing",
        packageInstallNeeded: false,
        restartPending: false,
      },
      installCommand: installCommands[0]!.command,
      row: row!,
    });
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        handoff: installed,
        row: row!,
      }).map((step) => [step.key, step.status, step.path ?? null])
    ).toEqual([
      ["add", "done", null],
      ["apply-plan", "done", null],
      ["install-packages", "done", null],
      ["restart", "done", null],
      ["open", "current", "/modules?module=billing"],
    ]);
  });

  test("flags missing base url for local manifest references", () => {
    expect(
      availableModuleRows({
        modules: [
          {
            manifestReference: "./lenso.module.json",
            name: "billing",
            source: "service",
            version: "0.1.0",
          },
        ],
        version: 1,
      })[0]
    ).toMatchObject({
      preflightLabel: "needs base URL",
      preflightStatus: "needs_base_url",
    });
  });

  test("blocks install wizard steps for unresolved catalog entries", () => {
    const [row] = availableModuleRows({
      modules: [
        {
          manifestReference: "./lenso.module.json",
          name: "billing",
          source: "service",
          version: "0.1.0",
        },
      ],
      version: 1,
    });
    expect(row).toBeDefined();

    const handoff = availableModuleHandoffState({
      installCommand: "lenso module marketplace install ./lenso.module.json",
      row: row!,
    });
    expect(handoff).toMatchObject({
      action: "resolve",
      kind: "blocked",
      label: "needs base URL",
    });
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        handoff,
        row: row!,
      }).map((step) => [step.key, step.status, step.command ?? null])
    ).toEqual([
      ["add", "blocked", null],
      ["apply-plan", "pending", null],
      ["install-packages", "skipped", null],
      ["restart", "pending", null],
      ["open", "pending", null],
    ]);
  });

  test("flags incompatible catalog entries before manifest checks", () => {
    expect(
      availableModuleRows({
        modules: [
          {
            baseUrl: "https://example.com/lenso/module/v1",
            compatibility: {
              lenso: {
                minVersion: "0.2.0",
              },
            },
            manifestReference: "https://example.com/lenso/module/v1/manifest",
            name: "billing",
            source: "service",
            version: "0.1.0",
          },
        ],
        version: 1,
      })[0]
    ).toMatchObject({
      preflightLabel: "incompatible",
      preflightReason: "billing requires Lenso >= 0.2.0; host is 0.1.0",
      preflightStatus: "compatibility_blocked",
    });
  });

  test("flags manifest identity mismatches", () => {
    expect(
      availableModuleRows(catalog, {
        billing: {
          name: "billing-pro",
          source: "service",
          version: "0.2.0",
        },
      })[0]
    ).toMatchObject({
      preflightLabel: "manifest mismatch",
      preflightStatus: "manifest_mismatch",
    });
  });

  test("flags Console UI artifact hint mismatches", () => {
    expect(
      availableModuleRows(catalog, {
        billing: {
          consoleUiArtifacts: [
            {
              exportName: "crmConsoleModule",
              packageName: "@vendor/lenso-crm-console",
            },
          ],
          name: "billing",
          source: "service",
          version: "0.1.0",
        },
      })[0]
    ).toMatchObject({
      preflightLabel: "package hint mismatch",
      preflightStatus: "package_hint_mismatch",
    });
  });

  test("builds rows from available module responses", () => {
    const response: AvailableModulesResponse = {
      catalog: {
        modules: 2,
        registryFile: ".lenso/module-catalog.json",
        version: 1,
      },
      issues: [
        {
          fix: "add baseUrl or use a manifest URL ending with /manifest",
          group: "Catalog",
          message: "local-crm baseUrl is missing",
        },
        {
          fix: "upgrade Lenso to 0.2.0 or install a compatible billing catalog entry",
          group: "Compatibility",
          message: "billing requires Lenso >= 0.2.0; host is 0.1.0",
        },
      ],
      modules: [
        {
          baseUrl: "https://example.com/lenso/module/v1",
          capabilities: ["billing.read", "billing.write"],
          catalogVersion: "0.1.0",
          consoleUiArtifactHints: 1,
          compatibility: {
            lenso: {
              minVersion: "0.2.0",
            },
          },
          hostCompatibility: {
            consoleBridge: "1",
            lensoVersion: "0.1.0",
          },
          manifestName: "billing",
          manifestReference: "https://example.com/lenso/module/v1/manifest",
          manifestStatus: "ok",
          manifestVersion: "0.1.0",
          moduleRelease: {
            manifestReference: "../support/lenso.module-release.json",
            name: "billing",
            providerName: "support-suite-provider",
            servicePackage: "../support/lenso.service-package.json",
            version: "0.1.0",
          },
          name: "billing",
          providedBy: "support-suite-provider",
          serviceManifest: "http://127.0.0.1:4110/lenso/service/v1/manifest",
          source: "service",
          status: "needs_attention",
          summary: "Billing workspace and operations",
        },
        {
          baseUrl: null,
          catalogVersion: "0.1.0",
          consoleUiArtifactHints: 0,
          manifestName: "local-crm",
          manifestReference: "./lenso.module.json",
          manifestStatus: "ok",
          manifestVersion: "0.1.0",
          name: "local-crm",
          source: "service",
          status: "needs_attention",
        },
      ],
      status: "failed",
      version: 1,
    };

    expect(availableModuleRowsFromResponse(response)).toEqual([
      {
        baseUrl: "https://example.com/lenso/module/v1",
        capabilityCount: 2,
        consoleUiArtifactHintCount: 1,
        key: "billing:0.1.0:https://example.com/lenso/module/v1/manifest",
        manifestReference: "https://example.com/lenso/module/v1/manifest",
        name: "billing",
        preflightFix:
          "upgrade Lenso to 0.2.0 or install a compatible billing catalog entry",
        preflightLabel: "incompatible",
        preflightReason: "billing requires Lenso >= 0.2.0; host is 0.1.0",
        preflightStatus: "compatibility_blocked",
        providerName: "support-suite-provider",
        serviceManifest: "http://127.0.0.1:4110/lenso/service/v1/manifest",
        moduleRelease: {
          manifestReference: "../support/lenso.module-release.json",
          name: "billing",
          providerName: "support-suite-provider",
          servicePackage: "../support/lenso.service-package.json",
          version: "0.1.0",
        },
        source: "service",
        summary: "Billing workspace and operations",
        version: "0.1.0",
      },
      {
        baseUrl: "-",
        capabilityCount: 0,
        consoleUiArtifactHintCount: 0,
        key: "local-crm:0.1.0:./lenso.module.json",
        manifestReference: "./lenso.module.json",
        name: "local-crm",
        preflightLabel: "needs base URL",
        preflightFix: "add baseUrl or use a manifest URL ending with /manifest",
        preflightReason: "local-crm baseUrl is missing",
        preflightStatus: "needs_base_url",
        providerName: null,
        serviceManifest: null,
        source: "service",
        summary: "-",
        version: "0.1.0",
      },
    ]);
  });

  test("marks archived available modules without restore handoff", () => {
    const response: AvailableModulesResponse = {
      catalog: {
        modules: 1,
        registryFile: ".lenso/module-catalog.json",
        version: 1,
      },
      issues: [],
      modules: [
        {
          archivedAt: "2026-06-07T12:00:00.000Z",
          archiveReason: "replaced by billing-v2",
          baseUrl: "https://example.com/lenso/module/v1",
          catalogVersion: "0.1.0",
          consoleUiArtifactHints: 1,
          manifestName: null,
          manifestReference: "https://example.com/lenso/module/v1/manifest",
          manifestStatus: "archived",
          manifestVersion: null,
          name: "billing",
          source: "service",
          status: "archived",
        },
      ],
      status: "passed",
      version: 1,
    };

    expect(availableModuleRowsFromResponse(response)[0]).toMatchObject({
      preflightLabel: "archived",
      preflightReason: "catalog entry archived: replaced by billing-v2",
      preflightStatus: "archived",
    });
  });
});
