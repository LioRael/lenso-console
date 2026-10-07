import type { AgentToolCall } from "./agent-runtime";

function object(content?: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(content ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Only compare a recorded pre-read at the mutation's exact expected revision. */
export function businessToolChanges(
  tool: AgentToolCall,
  tools: AgentToolCall[]
) {
  if (
    !tool.name.endsWith("projects_update_issue") ||
    tool.status !== "completed" ||
    tool.resultTruncated
  ) {
    return [];
  }
  const args = object(tool.argumentsJson);
  const after = object(tool.resultContent);
  if (
    typeof args.expected_revision !== "string" ||
    !/^\d+$/u.test(args.expected_revision) ||
    typeof after.revision !== "string" ||
    !/^\d+$/u.test(after.revision) ||
    BigInt(after.revision) !== BigInt(args.expected_revision) + 1n
  ) {
    return [];
  }
  const earlier = tools.slice(
    0,
    tools.findIndex((item) => item.callId === tool.callId)
  );
  const before = earlier
    .map((item) =>
      item.status === "completed" && !item.resultTruncated
        ? object(item.resultContent)
        : {}
    )
    .findLast(
      (item) =>
        item.issue_id === after.issue_id &&
        item.organization_id === after.organization_id &&
        item.revision === args.expected_revision
    );
  if (!before || !after.issue_id || !after.organization_id) {
    return [];
  }
  return Object.entries({
    title: "Title",
    description: "Description",
    priority: "Priority",
    workflow_state_id: "Status",
    cycle_id: "Cycle",
    milestone_id: "Milestone",
    label_ids: "Labels",
  }).flatMap(([field, label]) => {
    if (
      !(field in before) ||
      !(field in after) ||
      JSON.stringify(before[field]) === JSON.stringify(after[field])
    ) {
      return [];
    }
    return [
      { label, before: format(before[field]), after: format(after[field]) },
    ];
  });
}

const format = (value: unknown) =>
  value === null
    ? "—"
    : typeof value === "string"
      ? value
      : (JSON.stringify(value) ?? "—");
