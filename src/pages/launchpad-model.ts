import type {
  LaunchpadDoctorResponse,
  LaunchpadProofResponse,
  LaunchpadResponse,
} from "./available-modules-model";

export type LaunchpadSummary = {
  addonCount: number;
  addons: Array<{
    label: string;
    modules: string[];
    name: string;
    services: string[];
    status: string;
  }>;
  blueprint: string;
  checklist: Array<{
    id: string;
    label: string;
    status: string;
    nextCommand: string | null;
  }>;
  commands: string[];
  issues: string[];
  moduleCount: number;
  nextCommand: string;
  projectName: string;
  serviceCount: number;
  status: string;
  summary: string;
  supportedAddons: string[];
};

export type LaunchpadDoctorSummary = {
  attentionChecks: Array<{
    id: string;
    label: string;
    message: string;
    status: string;
    command: string | null;
  }>;
  checkedAtUnixMs: number | null;
  checks: number;
  doctorFile: string;
  live: boolean;
  nextCommand: string;
  status: string;
};

export type LaunchpadProofSummary = {
  addons: string[];
  attentionChecks: Array<{
    id: string;
    label: string;
    message: string;
    status: string;
    command: string | null;
  }>;
  blueprint: string;
  checkedAtUnixMs: number | null;
  checks: number;
  driftCount: number;
  drifts: Array<{
    resource: string;
    name: string;
    message: string;
    command: string | null;
  }>;
  nextCommand: string;
  projectName: string;
  proofFile: string;
  status: string;
};

export function launchpadSummary(
  response: LaunchpadResponse | undefined
): LaunchpadSummary {
  const firstIssue = response?.issues[0];
  const fallbackCommand =
    "lenso app create support-desk --blueprint support-desk";
  return {
    addonCount: response?.addons?.length ?? 0,
    addons:
      response?.addons?.map((addon) => ({
        label: addon.label,
        modules: addon.modules,
        name: addon.name,
        services: addon.services,
        status: addon.status,
      })) ?? [],
    blueprint: response?.blueprint ?? "not configured",
    checklist:
      response?.checklist.map((item) => ({
        id: item.id,
        label: item.label,
        nextCommand: item.nextCommand ?? null,
        status: item.status,
      })) ?? [],
    commands: response?.commands ?? [fallbackCommand],
    issues: response?.issues.map((issue) => issue.message) ?? [],
    moduleCount: response?.modules.length ?? 0,
    nextCommand:
      response?.nextCommand ??
      firstIssue?.command ??
      response?.commands[0] ??
      fallbackCommand,
    projectName: response?.projectName ?? "Launchpad app",
    serviceCount: response?.services.length ?? 0,
    status: response?.status ?? "empty",
    summary:
      response?.summary ??
      "Create a support-desk app to see the generated service system.",
    supportedAddons: response?.supportedAddons ?? [],
  };
}

export function launchpadDoctorSummary(
  response: LaunchpadDoctorResponse | undefined
): LaunchpadDoctorSummary {
  const attentionChecks =
    response?.checks
      .filter((check) =>
        ["failed", "needs_attention", "missing"].includes(check.status)
      )
      .map((check) => ({
        command: check.command ?? null,
        id: check.id,
        label: check.label,
        message: check.message,
        status: check.status,
      })) ?? [];
  return {
    attentionChecks,
    checkedAtUnixMs: response?.checkedAtUnixMs ?? null,
    checks: response?.checks.length ?? 0,
    doctorFile: response?.doctorFile ?? ".lenso/dev-doctor.json",
    live: response?.live ?? false,
    nextCommand:
      response?.nextCommand ??
      attentionChecks.find((check) => check.command)?.command ??
      "lenso dev doctor --write-state",
    status: response?.status ?? "empty",
  };
}

export function launchpadProofSummary(
  response: LaunchpadProofResponse | undefined
): LaunchpadProofSummary {
  const attentionChecks =
    response?.checks
      .filter((check) =>
        ["failed", "needs_attention", "missing"].includes(check.status)
      )
      .map((check) => ({
        command: check.command ?? null,
        id: check.id,
        label: check.label,
        message: check.message,
        status: check.status,
      })) ?? [];
  const drifts =
    response?.drifts.map((drift) => ({
      command: drift.command ?? null,
      message: drift.message,
      name: drift.name,
      resource: drift.resource,
    })) ?? [];
  const fallbackCommand = "lenso app verify --write-proof";

  return {
    addons: response?.addons ?? [],
    attentionChecks,
    blueprint: response?.blueprint ?? "not configured",
    checkedAtUnixMs: response?.checkedAtUnixMs ?? null,
    checks: response?.checks.length ?? 0,
    driftCount: drifts.length,
    drifts,
    nextCommand:
      response?.nextCommand ??
      drifts.find((drift) => drift.command)?.command ??
      attentionChecks.find((check) => check.command)?.command ??
      fallbackCommand,
    projectName: response?.projectName ?? "Launchpad app",
    proofFile: response?.proofFile ?? ".lenso/app-proof.json",
    status: response?.status ?? "empty",
  };
}

export function launchpadStatusLabel(status: string) {
  if (status === "ready") {
    return "ready";
  }
  if (status === "drifted") {
    return "drifted";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "needs_attention") {
    return "needs attention";
  }
  if (status === "empty") {
    return "not configured";
  }
  return status.replaceAll("_", " ");
}
