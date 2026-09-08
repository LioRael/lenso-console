import type { AgentModel, AgentTrajectory } from "./agent-runtime";

export function contextUsage(
  model: Pick<AgentModel, "contextWindow"> | undefined,
  trajectory: Pick<AgentTrajectory, "records"> | undefined,
  draft: string
) {
  const last = trajectory?.records.findLast(
    (item) => item.inputTokens !== undefined && item.kind === "model"
  );
  const compactedAfter =
    last &&
    trajectory?.records
      .slice(trajectory.records.indexOf(last) + 1)
      .some(
        (item) => item.kind === "compaction" && item.status === "completed"
      );
  const measured = compactedAfter ? undefined : last?.inputTokens;
  const limit = model?.contextWindow;
  const draftTokens = Math.ceil(new TextEncoder().encode(draft).length / 4);
  const used = measured === undefined ? undefined : measured + draftTokens;
  return {
    limit,
    measured,
    draftTokens,
    used,
    percent:
      used !== undefined && limit
        ? Math.min(100, Math.round((used / limit) * 100))
        : undefined,
  };
}
