import { expect, test } from "vitest";

import { projectAgentSession, type AgentSessionEvent } from "./agent-runtime";

test("replay preserves process order, failure details and branch provenance", () => {
  const event = (
    kind: AgentSessionEvent["kind"],
    payload: object,
    index: number
  ): AgentSessionEvent => ({
    kind,
    payloadJson: JSON.stringify(payload),
    eventId: String(index),
    occurredAt: `2026-09-09T00:00:0${index}Z`,
    revision: String(index),
    turnId: "turn",
  });
  const projected = projectAgentSession({
    sessionId: "branch",
    revision: "6",
    events: [
      event(
        "session_created",
        { fork_source: { session_id: "source", turn_id: "turn" } },
        0
      ),
      event("turn_started", { input: "Inspect" }, 1),
      event("model_output", { text: "Checking the file" }, 2),
      event(
        "tool_requested",
        {
          call_id: "call",
          name: "read_file",
          arguments_json: '{"path":"missing"}',
        },
        3
      ),
      event(
        "tool_result",
        {
          call_id: "call",
          status: "failed",
          error: "File missing",
          duration_ms: 20,
        },
        4
      ),
      event("model_output", { text: "The file does not exist" }, 5),
      event("turn_completed", { output: "The file does not exist" }, 6),
    ],
  });
  expect(projected.turns[0]).toMatchObject({
    answer: "The file does not exist",
    forkSource: { sessionId: "source", turnId: "turn" },
    activity: [
      { kind: "text", text: "Checking the file" },
      { kind: "tool", callId: "call" },
    ],
    tools: [
      {
        callId: "call",
        status: "failed",
        error: "File missing",
        durationMs: 20,
      },
    ],
  });
});
