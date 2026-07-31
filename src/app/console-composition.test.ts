import { describe, expect, test } from "vitest";

import {
  compositionRecoveryIssues,
  consoleCompositionSchema,
  decodeConsoleServiceComposition,
  type ConsoleServiceComposition,
} from "./console-composition";

function readyComposition(): ConsoleServiceComposition {
  return {
    issues: [],
    modules: [
      { kind: "shell", moduleId: "lenso/console-shell" },
      { kind: "mandatory", moduleId: "auth", role: "identity" },
      { kind: "optional", moduleId: "auth-password" },
      {
        kind: "mandatory",
        moduleId: "lenso/system-registry",
        role: "system_registry",
      },
    ],
    schema: consoleCompositionSchema,
    serviceId: "lenso-console",
    status: "ready",
    workloadMode: "normal",
  };
}

describe("Console Service composition", () => {
  test("decodes the exact composition wire contract", () => {
    expect(decodeConsoleServiceComposition(readyComposition())).toEqual(
      readyComposition()
    );
  });

  test("rejects malformed composition diagnostics", () => {
    expect(() =>
      decodeConsoleServiceComposition({
        ...readyComposition(),
        modules: [{ kind: "mandatory", moduleId: "auth", role: "owner" }],
      })
    ).toThrow("composition.modules[0].role is not supported");
  });

  test("accepts one binding for every mandatory role", () => {
    expect(compositionRecoveryIssues(readyComposition())).toEqual([]);
  });

  test("blocks management while the restore workload is active", () => {
    const composition = readyComposition();
    composition.workloadMode = "restore";

    expect(compositionRecoveryIssues(composition)).toContainEqual({
      code: "restore_workload_active",
      message:
        "The Console Service is running the fenced restore workload without background processing.",
      moduleIds: [],
      nextAction:
        "Run `lenso console recovery reconcile`, review its evidence, and use the separately approved activation command before resuming management.",
    });
  });

  test("fails closed when a mandatory role is missing", () => {
    const composition = readyComposition();
    composition.modules = composition.modules.filter(
      (module) => module.role !== "system_registry"
    );

    expect(compositionRecoveryIssues(composition)).toContainEqual(
      expect.objectContaining({
        code: "mandatory_console_role_missing",
        role: "system_registry",
      })
    );
  });

  test("fails closed when a mandatory role is ambiguous", () => {
    const composition = readyComposition();
    composition.modules.push({
      kind: "mandatory",
      moduleId: "custom/auth",
      role: "identity",
    });

    expect(compositionRecoveryIssues(composition)).toContainEqual(
      expect.objectContaining({
        code: "mandatory_console_role_ambiguous",
        moduleIds: ["auth", "custom/auth"],
        role: "identity",
      })
    );
  });

  test("does not trust a ready status with incompatible identity", () => {
    const composition = readyComposition();
    composition.schema = "lenso.console-service-composition.v3";
    composition.serviceId = "business-service";

    expect(
      compositionRecoveryIssues(composition).map((issue) => issue.code)
    ).toEqual([
      "composition_schema_incompatible",
      "composition_service_identity_mismatch",
    ]);
  });

  test("rejects an unknown workload mode", () => {
    expect(() =>
      decodeConsoleServiceComposition({
        ...readyComposition(),
        workloadMode: "maintenance",
      })
    ).toThrow("composition.workloadMode is not supported");
  });

  test("deduplicates authoritative and locally derived role issues", () => {
    const composition = readyComposition();
    composition.modules = composition.modules.filter(
      (module) => module.role !== "identity"
    );
    composition.issues = [
      {
        code: "mandatory_console_role_missing",
        message: "Mandatory Console Role has no Module binding",
        moduleIds: [],
        nextAction: "repair",
        role: "identity",
      },
    ];

    expect(compositionRecoveryIssues(composition)).toHaveLength(1);
  });
});
