import type { AgentActivity } from "./agent-runtime";

export type AgentExecutionPresentation = {
  description: string;
  label: string;
  tone: "error" | "info" | "warning";
};

/**
 * Presents a browser-stream loss without converting it into an Agent outcome.
 * The optional activity snapshot is only a relay observation; durable Session
 * and App-side facts remain with their respective owners.
 */
export function disconnectedAgentExecutionPresentation({
  activity,
  durableEffectMayHaveOccurred,
}: {
  activity: AgentActivity | undefined;
  durableEffectMayHaveOccurred: boolean;
}): AgentExecutionPresentation {
  if (activity?.terminalOutcome === "failed") {
    return {
      description: [
        "UI disconnected. Agent failed according to a terminal Agent event.",
        durableEffectMayHaveOccurred
          ? "Result uncertain: a durable side effect may have happened before that failure."
          : "Refresh the durable Session before interpreting the final result.",
        activity.detail,
      ]
        .filter((part): part is string => part !== null && part !== undefined)
        .join(" "),
      label: "UI disconnected · Agent failed",
      tone: "error",
    };
  }
  if (activity?.terminalOutcome === "completed") {
    return {
      description:
        "UI disconnected. Agent completed according to a terminal Agent event. Refresh the durable Session for the canonical result.",
      label: "UI disconnected · Agent completed",
      tone: "info",
    };
  }
  if (activity?.terminalOutcome === "cancelled") {
    return {
      description:
        "UI disconnected. Agent cancelled according to a terminal Agent event. Refresh the durable Session for the canonical result.",
      label: "UI disconnected · Agent cancelled",
      tone: "warning",
    };
  }
  if (activity?.running) {
    return {
      description:
        "UI disconnected. Agent still running according to the transient Agent activity snapshot. Refresh the durable Session before interpreting the final result.",
      label: "UI disconnected · Agent still running",
      tone: "info",
    };
  }
  return {
    description: durableEffectMayHaveOccurred
      ? "UI disconnected before a terminal Agent outcome was observed. Agent state unknown. Result uncertain: a durable side effect may have happened; do not assume that nothing happened."
      : "UI disconnected before a terminal Agent outcome was observed. Agent state unknown. Refresh the durable Session before interpreting the result.",
    label: "UI disconnected · Agent state unknown",
    tone: "warning",
  };
}

export function disconnectedTerminalExecutionPresentation(): AgentExecutionPresentation {
  return {
    description:
      "UI disconnected before a terminal command outcome was observed. Result uncertain: a durable side effect may have happened; do not assume that nothing happened.",
    label: "Result uncertain",
    tone: "warning",
  };
}
