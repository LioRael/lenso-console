import { describe, expect, test } from "vitest";

import {
  type AvailableModuleInstallState,
  type AvailableModulesResponse,
  type AvailableModulesCatalog,
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
      consolePackages: [
        {
          exportName: "billingConsoleModule",
          packageName: "@vendor/lenso-billing-console",
          route: "/data/billing",
        },
      ],
      manifestReference: "https://example.com/lenso/module/v1/manifest",
      name: "billing",
      source: "remote",
      summary: "Billing workspace and operations",
      version: "0.1.0",
    },
  ],
  version: 1,
};

const installCommands = [
  {
    command: "lenso module add https://example.com/lenso/module/v1/manifest",
    key: "add",
    label: "install",
  },
  {
    command: "lenso console-package apply-plan",
    key: "apply-plan",
    label: "console",
  },
  {
    command: "pnpm --dir apps/runtime-console install",
    key: "install-packages",
    label: "packages",
  },
];

const baseInstallState: AvailableModuleInstallState = {
  consolePlan: {
    error: null,
    exists: false,
    moduleEntryPresent: false,
    packageCount: 0,
    packages: [],
    planFile: ".lenso/console-package-install-plan.json",
    readable: false,
    restartRequired: null,
  },
  moduleRegistered: false,
  remoteSource: {
    configured: false,
    desiredBaseUrl: null,
    envFile: ".env",
    error: null,
    restartPending: false,
    restartReason: null,
    runningBaseUrl: null,
  },
};

describe("available modules model", () => {
  test("builds rows from available module catalog entries", () => {
    expect(availableModuleRows(catalog)).toEqual([
      {
        baseUrl: "https://example.com/lenso/module/v1",
        capabilityCount: 2,
        consolePackageHintCount: 1,
        key: "billing:0.1.0:https://example.com/lenso/module/v1/manifest",
        manifestReference: "https://example.com/lenso/module/v1/manifest",
        name: "billing",
        preflightLabel: "unknown",
        preflightReason:
          "manifest will be read from the manifest URL during install",
        preflightStatus: "unknown",
        source: "remote",
        summary: "Billing workspace and operations",
        version: "0.1.0",
      },
    ]);
  });

  test("marks entries ready when the manifest snapshot matches", () => {
    expect(
      availableModuleRows(catalog, {
        billing: {
          consolePackages: [
            {
              exportName: "billingConsoleModule",
              packageName: "@vendor/lenso-billing-console",
            },
          ],
          name: "billing",
          source: "remote",
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
          "lenso module add https://example.com/lenso/module/v1/manifest",
        row: row!,
      })
    ).toEqual({
      action: "install",
      command: "lenso module add https://example.com/lenso/module/v1/manifest",
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
          "lenso module add https://example.com/lenso/module/v1/manifest",
        row: row!,
      })
    ).toEqual({
      action: "install_package",
      detail: "install console package and restart",
      kind: "package_install_needed",
      label: "package install needed",
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
          "lenso module add https://example.com/lenso/module/v1/manifest",
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
          "lenso module add https://example.com/lenso/module/v1/manifest",
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
        consolePlan: {
          ...baseInstallState.consolePlan,
          exists: true,
          moduleEntryPresent: true,
          packageCount: 1,
          packages: [
            {
              command: "pnpm add @vendor/lenso-billing-console",
              exportName: "billingConsoleModule",
              key: "@vendor/lenso-billing-console#billingConsoleModule",
              packageName: "@vendor/lenso-billing-console",
              route: "/data/billing",
              status: "requires_manual_install",
            },
          ],
          readable: true,
          restartRequired: true,
        },
        remoteSource: {
          ...baseInstallState.remoteSource,
          configured: true,
          desiredBaseUrl: "https://example.com/lenso/module/v1",
          restartPending: true,
          restartReason: "remote source configured in .env but not loaded",
        },
      },
    };

    const handoff = availableModuleHandoffState({
      installCommand: installCommands[0]!.command,
      row,
    });
    expect(handoff).toMatchObject({
      detail: "apply console package plan and install packages",
      kind: "package_install_needed",
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
      command: "lenso console-package apply-plan",
      evidence:
        "1 package plan item in .lenso/console-package-install-plan.json",
      status: "current",
    });
  });

  test("uses backend remote source evidence for restart pending state", () => {
    const [baseRow] = availableModuleRows(catalog);
    expect(baseRow).toBeDefined();
    const row = {
      ...baseRow!,
      installState: {
        ...baseInstallState,
        remoteSource: {
          ...baseInstallState.remoteSource,
          configured: true,
          desiredBaseUrl: "https://example.com/lenso/module/v1",
          restartPending: true,
          restartReason: "remote source configured in .env but not loaded",
        },
      },
    };
    const handoff = availableModuleHandoffState({
      installCommand: installCommands[0]!.command,
      row,
    });

    expect(handoff).toMatchObject({
      detail: "remote source configured in .env but not loaded",
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
      evidence: "remote source configured in .env but not loaded",
      status: "current",
    });
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
          missingConsolePackageCount: 1,
          moduleRegistered: true,
        },
        handoff: packageInstall,
        row: row!,
      }).map((step) => [step.key, step.status, step.command ?? null])
    ).toEqual([
      ["add", "done", null],
      ["apply-plan", "current", installCommands[1]!.command],
      ["install-packages", "pending", installCommands[2]!.command],
      ["restart", "pending", null],
      ["open", "pending", null],
    ]);
    expect(
      availableModuleInstallSteps({
        commands: installCommands,
        evidence: {
          consoleInstallPlanCount: 1,
          missingConsolePackageCount: 1,
          moduleRegistered: true,
        },
        handoff: packageInstall,
        row: row!,
      })[1]
    ).toMatchObject({
      evidence:
        "1 missing console package; 1 plan item derived from backend metadata",
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
            source: "remote",
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
          source: "remote",
          version: "0.1.0",
        },
      ],
      version: 1,
    });
    expect(row).toBeDefined();

    const handoff = availableModuleHandoffState({
      installCommand: "lenso module add ./lenso.module.json",
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
            source: "remote",
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
          source: "remote",
          version: "0.2.0",
        },
      })[0]
    ).toMatchObject({
      preflightLabel: "manifest mismatch",
      preflightStatus: "manifest_mismatch",
    });
  });

  test("flags console package hint mismatches", () => {
    expect(
      availableModuleRows(catalog, {
        billing: {
          consolePackages: [
            {
              exportName: "crmConsoleModule",
              packageName: "@vendor/lenso-crm-console",
            },
          ],
          name: "billing",
          source: "remote",
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
          consolePackageHints: 1,
          compatibility: {
            lenso: {
              minVersion: "0.2.0",
            },
          },
          hostCompatibility: {
            consolePackageApi: "1",
            lensoVersion: "0.1.0",
          },
          manifestName: "billing",
          manifestReference: "https://example.com/lenso/module/v1/manifest",
          manifestStatus: "ok",
          manifestVersion: "0.1.0",
          name: "billing",
          source: "remote",
          status: "needs_attention",
          summary: "Billing workspace and operations",
        },
        {
          baseUrl: null,
          catalogVersion: "0.1.0",
          consolePackageHints: 0,
          manifestName: "local-crm",
          manifestReference: "./lenso.module.json",
          manifestStatus: "ok",
          manifestVersion: "0.1.0",
          name: "local-crm",
          source: "remote",
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
        consolePackageHintCount: 1,
        key: "billing:0.1.0:https://example.com/lenso/module/v1/manifest",
        manifestReference: "https://example.com/lenso/module/v1/manifest",
        name: "billing",
        preflightFix:
          "upgrade Lenso to 0.2.0 or install a compatible billing catalog entry",
        preflightLabel: "incompatible",
        preflightReason: "billing requires Lenso >= 0.2.0; host is 0.1.0",
        preflightStatus: "compatibility_blocked",
        source: "remote",
        summary: "Billing workspace and operations",
        version: "0.1.0",
      },
      {
        baseUrl: "-",
        capabilityCount: 0,
        consolePackageHintCount: 0,
        key: "local-crm:0.1.0:./lenso.module.json",
        manifestReference: "./lenso.module.json",
        name: "local-crm",
        preflightLabel: "needs base URL",
        preflightFix: "add baseUrl or use a manifest URL ending with /manifest",
        preflightReason: "local-crm baseUrl is missing",
        preflightStatus: "needs_base_url",
        source: "remote",
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
          consolePackageHints: 1,
          manifestName: null,
          manifestReference: "https://example.com/lenso/module/v1/manifest",
          manifestStatus: "archived",
          manifestVersion: null,
          name: "billing",
          source: "remote",
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
