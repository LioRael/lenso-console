import { expect, test } from "vitest";

import { contextUsage } from "./agent-context-usage-model";
import type { AgentTrajectoryRecord } from "./agent-runtime";

const record = (
  kind: AgentTrajectoryRecord["kind"],
  inputTokens?: number
): AgentTrajectoryRecord => ({
  id: String(inputTokens),
  kind,
  ...(inputTokens === undefined ? {} : { inputTokens }),
  label: "",
  preview: "",
  sourceEventIds: [],
  startedAt: "",
  status: "completed",
  turn: 1,
  detail: { summary: "" },
});
test("context reports the last model window, not cumulative session usage", () => {
  const value = contextUsage(
    { contextWindow: 1000 },
    { records: [record("model", 400), record("model", 600)] },
    "1234"
  );
  expect(value.used).toBe(601);
  expect(value.percent).toBe(60);
});
test("compaction invalidates stale usage until the next model report", () => {
  expect(
    contextUsage(
      { contextWindow: 1000 },
      { records: [record("model", 600), record("compaction")] },
      ""
    ).used
  ).toBeUndefined();
  expect(contextUsage(undefined, undefined, "").percent).toBeUndefined();
  expect(
    contextUsage(
      { contextWindow: 1000 },
      { records: [record("model", 1200)] },
      ""
    ).percent
  ).toBe(100);
});
