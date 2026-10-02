import { describe, expect, it } from "vitest";

import {
  disconnectedAgentExecutionPresentation,
  disconnectedTerminalExecutionPresentation,
} from "./agent-execution-state";

describe("Agent execution presentation", () => {
  it("keeps a browser disconnect separate from an Agent that is still running", () => {
    expect(
      disconnectedAgentExecutionPresentation({
        activity: {
          detail: null,
          requestId: "request-1",
          running: true,
          sessionId: "session-1",
          terminalOutcome: null,
        },
        durableEffectMayHaveOccurred: true,
      })
    ).toMatchObject({
      description: expect.stringContaining("Agent still running"),
      label: "UI disconnected · Agent still running",
      tone: "info",
    });
  });

  it("reports a terminal Agent failure without claiming that no effect occurred", () => {
    expect(
      disconnectedAgentExecutionPresentation({
        activity: {
          detail: "The approved Tool was interrupted",
          requestId: "request-1",
          running: false,
          sessionId: "session-1",
          terminalOutcome: "failed",
        },
        durableEffectMayHaveOccurred: true,
      })
    ).toMatchObject({
      description: expect.stringContaining("Result uncertain"),
      label: "UI disconnected · Agent failed",
      tone: "error",
    });
  });

  it("uses explicit terminal evidence before a relay reader has finished", () => {
    expect(
      disconnectedAgentExecutionPresentation({
        activity: {
          detail: "Agent rejected the request",
          requestId: "request-1",
          running: true,
          sessionId: "session-1",
          terminalOutcome: "failed",
        },
        durableEffectMayHaveOccurred: true,
      })
    ).toMatchObject({
      label: "UI disconnected · Agent failed",
      tone: "error",
    });
  });

  it("does not reinterpret free-form relay detail as an Agent failure", () => {
    expect(
      disconnectedAgentExecutionPresentation({
        activity: {
          detail: "done",
          requestId: "request-1",
          running: false,
          sessionId: "session-1",
          terminalOutcome: null,
        },
        durableEffectMayHaveOccurred: true,
      })
    ).toMatchObject({
      description: expect.stringContaining("Agent state unknown"),
      label: "UI disconnected · Agent state unknown",
      tone: "warning",
    });
  });

  it("marks a detached terminal command result as uncertain", () => {
    expect(disconnectedTerminalExecutionPresentation()).toEqual({
      description:
        "UI disconnected before a terminal command outcome was observed. Result uncertain: a durable side effect may have happened; do not assume that nothing happened.",
      label: "Result uncertain",
      tone: "warning",
    });
  });
});
