import type { LaunchpadResponse } from "./available-modules-model";

export type LaunchpadSummary = {
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
};

export function launchpadSummary(
  response: LaunchpadResponse | undefined
): LaunchpadSummary {
  const firstIssue = response?.issues[0];
  const fallbackCommand =
    "lenso app create support-desk --blueprint support-desk";
  return {
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
  };
}

export function launchpadStatusLabel(status: string) {
  if (status === "ready") {
    return "ready";
  }
  if (status === "needs_attention") {
    return "needs attention";
  }
  if (status === "empty") {
    return "not configured";
  }
  return status.replaceAll("_", " ");
}
