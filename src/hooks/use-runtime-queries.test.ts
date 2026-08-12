import { describe, expect, it } from "vitest";

import {
  runtimeQueryKeys,
  runtimeStoryExecutionEvidencePath,
} from "./use-runtime-queries";

describe("runtime Story execution evidence requests", () => {
  it.each([
    ["payload", "payload"],
    ["logs", "logs"],
    ["technical operations", "technical-operations"],
  ] as const)("builds the canonical %s path", (_label, evidence) => {
    expect(
      runtimeStoryExecutionEvidencePath(
        "corr/story 42",
        "function:send/message",
        evidence
      )
    ).toBe(
      `api/console/v1/stories/corr%2Fstory%2042/executions/function%3Asend%2Fmessage/${evidence}`
    );
  });

  it("scopes execution evidence query keys by Story correlation and node", () => {
    expect(runtimeQueryKeys.executionPayload("corr-a", "node-1")).toEqual([
      "runtime",
      "stories",
      "corr-a",
      "executions",
      "node-1",
      "payload",
    ]);
    expect(runtimeQueryKeys.executionLogs("corr-b", "node-1")).toEqual([
      "runtime",
      "stories",
      "corr-b",
      "executions",
      "node-1",
      "logs",
    ]);
    expect(
      runtimeQueryKeys.technicalOperationsForExecution("corr-a", "node-2")
    ).toEqual([
      "runtime",
      "stories",
      "corr-a",
      "executions",
      "node-2",
      "technical-operations",
    ]);
  });
});
