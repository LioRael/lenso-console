import { describe, expect, test } from "vitest";

import type { AgentTurn } from "./agent-runtime";
import { createAgentStreamEventBuffer } from "./agent-stream-buffer";

describe("Agent stream event buffer", () => {
  test("preserves long-stream content and ordering with bounded state commits", () => {
    let turns: AgentTurn[] = [runningTurn()];
    let commits = 0;
    const snapshots: AgentTurn[] = [];
    const scheduled = new Set<() => void>();
    const buffer = createAgentStreamEventBuffer({
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- The injected frame scheduler is intentionally callback-based.
      scheduleFrame(callback) {
        scheduled.add(callback);
        return () => scheduled.delete(callback);
      },
      setTurns(update) {
        commits += 1;
        turns = typeof update === "function" ? update(turns) : update;
        snapshots.push(structuredClone(turns[0] as AgentTurn));
      },
      turnId: "pending-1",
    });

    for (let index = 0; index < 1000; index += 1) {
      buffer.handle(message("text_delta", "a", String(index)));
    }
    for (let index = 0; index < 500; index += 1) {
      buffer.handle(message("reasoning_delta", "r", `r-${index}`));
    }
    expect(commits).toBe(0);
    expect(scheduled.size).toBe(1);

    buffer.handle({
      message: {
        kind: "tool_started",
        sequence: "tool-1",
        text: "",
        toolCallId: "call-1",
        toolName: "read",
      },
      type: "turn_message",
    });
    buffer.handle(message("text_delta", "done", "after-tool"));
    buffer.handle({ sessionId: "session-1", type: "turn_cancelled" });

    expect(commits).toBe(4);
    expect(scheduled.size).toBe(0);
    expect(snapshots[0]).toMatchObject({
      answer: "a".repeat(1000),
      thought: "r".repeat(500),
    });
    expect(snapshots[1]?.tools).toEqual([
      { callId: "call-1", name: "read", status: "running" },
    ]);
    expect(snapshots[2]?.answer).toBe(`${"a".repeat(1000)}done`);
    expect(turns[0]).toMatchObject({
      answer: `${"a".repeat(1000)}done`,
      status: "cancelled",
      thought: "r".repeat(500),
    });
  });

  test("stops after synchronously committing tail deltas queued before the frame", () => {
    let turns: AgentTurn[] = [runningTurn()];
    let commits = 0;
    let scheduled: (() => void) | undefined;
    const buffer = createAgentStreamEventBuffer({
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- The injected frame scheduler is intentionally callback-based.
      scheduleFrame(callback) {
        scheduled = callback;
        return () => {
          scheduled = undefined;
        };
      },
      setTurns(update) {
        commits += 1;
        turns = typeof update === "function" ? update(turns) : update;
      },
      turnId: "pending-1",
    });

    buffer.handle(message("text_delta", "answer tail", "1"));
    buffer.handle(message("reasoning_delta", "reasoning tail", "2"));
    buffer.stop();
    scheduled?.();

    expect(commits).toBe(1);
    expect(scheduled).toBeUndefined();
    expect(turns[0]).toMatchObject({
      answer: "answer tail",
      thought: "reasoning tail",
    });
    buffer.handle(message("text_delta", "ignored", "3"));
    expect(commits).toBe(1);
  });

  test("only explicit turn deletion discards queued deltas", () => {
    let commits = 0;
    let scheduled: (() => void) | undefined;
    const buffer = createAgentStreamEventBuffer({
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- The injected frame scheduler is intentionally callback-based.
      scheduleFrame(callback) {
        scheduled = callback;
        return () => {
          scheduled = undefined;
        };
      },
      setTurns() {
        commits += 1;
      },
      turnId: "pending-1",
    });

    buffer.handle(message("text_delta", "deleted", "1"));
    buffer.discardForTurnDeletion();
    scheduled?.();

    expect(commits).toBe(0);
    expect(scheduled).toBeUndefined();
  });
});

function message(
  kind: "reasoning_delta" | "text_delta",
  text: string,
  sequence: string
) {
  return {
    message: { kind, sequence, text },
    type: "turn_message" as const,
  };
}

function runningTurn(): AgentTurn {
  return {
    answer: "",
    id: "pending-1",
    status: "running",
    thought: "",
    user: "Run",
  };
}
