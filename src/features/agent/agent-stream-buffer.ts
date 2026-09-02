import type { Dispatch, SetStateAction } from "react";

import {
  boundedToolResult,
  type AgentStreamEvent,
  type AgentStreamMessage,
  type AgentToolCall,
  type AgentTurn,
} from "./agent-runtime";

type ScheduleFrame = (callback: () => void) => () => void;

export type AgentStreamEventBuffer = {
  /** Stops future events after synchronously committing queued deltas. */
  stop(): void;
  /** Stops future events and drops queued deltas for an explicit Turn deletion. */
  discardForTurnDeletion(): void;
  flush(): void;
  handle(event: AgentStreamEvent): void;
};

export function createAgentStreamEventBuffer({
  scheduleFrame = scheduleBrowserFrame,
  setTurns,
  turnId,
}: {
  scheduleFrame?: ScheduleFrame;
  setTurns: Dispatch<SetStateAction<AgentTurn[]>>;
  turnId: string;
}): AgentStreamEventBuffer {
  let answerDelta = "";
  let reasoningDelta = "";
  let cancelScheduledFlush: (() => void) | undefined;
  let finished = false;

  const flushPendingDeltas = () => {
    if (!(answerDelta || reasoningDelta)) {
      return;
    }
    const answer = answerDelta;
    const thought = reasoningDelta;
    answerDelta = "";
    reasoningDelta = "";
    updateTurn(setTurns, turnId, (turn) => ({
      ...turn,
      answer: turn.answer + answer,
      thought: turn.thought + thought,
      ...(thought ? { work: turn.work ?? {} } : {}),
    }));
  };

  const flush = () => {
    cancelScheduledFlush?.();
    cancelScheduledFlush = undefined;
    flushPendingDeltas();
  };

  const discardForTurnDeletion = () => {
    finished = true;
    cancelScheduledFlush?.();
    cancelScheduledFlush = undefined;
    answerDelta = "";
    reasoningDelta = "";
  };

  const scheduleFlush = () => {
    if (cancelScheduledFlush) {
      return;
    }
    cancelScheduledFlush = scheduleFrame(() => {
      cancelScheduledFlush = undefined;
      flushPendingDeltas();
    });
  };

  return {
    discardForTurnDeletion,
    stop() {
      flush();
      finished = true;
    },
    flush,
    handle(event) {
      if (finished) {
        return;
      }
      if (isDeltaEvent(event)) {
        if (!event.message.kind || event.message.kind === "text_delta") {
          answerDelta += event.message.text;
        } else {
          reasoningDelta += event.message.text;
        }
        scheduleFlush();
        return;
      }

      flush();
      updateTurn(setTurns, turnId, (turn) => applyImmediateEvent(turn, event));
      finished = isTerminalEvent(event);
    },
  };
}

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- Animation frames and timers require a callback scheduler.
function scheduleBrowserFrame(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    const frame = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(frame);
  }
  const timeout = setTimeout(callback, 16);
  return () => clearTimeout(timeout);
}

function isDeltaEvent(
  event: AgentStreamEvent
): event is Extract<AgentStreamEvent, { type: "turn_message" }> {
  return (
    event.type === "turn_message" &&
    (!event.message.kind ||
      event.message.kind === "text_delta" ||
      event.message.kind === "reasoning_delta")
  );
}

function isTerminalEvent(event: AgentStreamEvent) {
  return (
    event.type === "turn_completed" ||
    event.type === "turn_cancelled" ||
    event.type === "turn_failed"
  );
}

function updateTurn(
  setTurns: Dispatch<SetStateAction<AgentTurn[]>>,
  turnId: string,
  update: (turn: AgentTurn) => AgentTurn
) {
  setTurns((current) => {
    const index = current.findIndex((turn) => turn.id === turnId);
    if (index === -1) {
      return current;
    }
    const next = [...current];
    next[index] = update(current[index] as AgentTurn);
    return next;
  });
}

function applyImmediateEvent(turn: AgentTurn, event: AgentStreamEvent) {
  if (event.type === "turn_completed") {
    return { ...turn, status: "completed" as const };
  }
  if (event.type === "turn_cancelled") {
    return { ...turn, status: "cancelled" as const };
  }
  if (event.type === "turn_failed") {
    return { ...turn, error: event.detail, status: "failed" as const };
  }
  const { kind } = event.message;
  if (
    kind === "tool_started" ||
    kind === "tool_progress" ||
    kind === "tool_completed" ||
    kind === "tool_failed"
  ) {
    return {
      ...turn,
      tools: projectStreamTool(turn.tools, event.message),
      work: turn.work ?? {},
    };
  }
  if (kind === "reasoning_completed") {
    return { ...turn, work: turn.work ?? {} };
  }
  return turn;
}

function projectStreamTool(
  current: AgentToolCall[] | undefined,
  message: AgentStreamMessage
) {
  const tools = current ? [...current] : [];
  const callId = message.toolCallId ?? `stream:${message.sequence}`;
  const index = tools.findIndex((tool) => tool.callId === callId);
  const existing = index === -1 ? undefined : tools[index];
  const argumentsJson = message.argumentsJson || existing?.argumentsJson;
  const metadataJson = message.metadataJson || existing?.metadataJson;
  const result = boundedToolResult(
    message.content || existing?.resultContent || "",
    existing?.resultTruncated
  );
  const error = message.error || existing?.error;
  const status =
    message.kind === "tool_completed"
      ? "completed"
      : message.kind === "tool_failed"
        ? "failed"
        : "running";
  const next: AgentToolCall = {
    callId,
    name: message.toolName || existing?.name || "Tool",
    status,
    ...(argumentsJson ? { argumentsJson } : {}),
    ...(metadataJson ? { metadataJson } : {}),
    ...(result.content ? { resultContent: result.content } : {}),
    ...(result.truncated ? { resultTruncated: true } : {}),
    ...(error ? { error } : {}),
  };
  if (index === -1) {
    tools.push(next);
  } else {
    tools[index] = next;
  }
  return tools;
}
