import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeAgentSseFrames,
  decodeAgentStreamEvent,
  cancelAgentTurn,
  listAgentSessions,
  projectAgentSession,
  readAgentBootstrap,
  readAgentSession,
  readAgentToolPolicy,
  streamAgentTurn,
  updateAgentToolPolicy,
  type AgentSession,
} from "./agent-runtime";

describe("Agent runtime projection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("decodes fragmented SSE frames", () => {
    const decoded = decodeAgentSseFrames(
      'id: 1\nevent: turn.message\ndata: {"type":"turn_message"}\n\nevent: turn'
    );

    expect(decoded.frames).toEqual([
      {
        data: '{"type":"turn_message"}',
        event: "turn.message",
        id: "1",
      },
    ]);
    expect(decoded.pending).toBe("event: turn");
  });

  it("decodes the strict Web stream event envelope", () => {
    expect(
      decodeAgentStreamEvent(
        '{"type":"turn_message","message":{"sequence":"1","text":"Hi","kind":"text_delta","session_id":"session-1"}}'
      )
    ).toEqual({
      message: {
        kind: "text_delta",
        sequence: "1",
        sessionId: "session-1",
        text: "Hi",
      },
      type: "turn_message",
    });
  });

  it("reconstructs complete conversation Turns from durable Session events", () => {
    const session: AgentSession = {
      events: [
        event("1", "turn_started", { input: "Hello" }, "turn-1"),
        event("2", "model_requested", { step: 1 }, "turn-1"),
        event("3", "model_output", { text: "Hi" }, "turn-1"),
        event("4", "turn_completed", { output: "Hi there" }, "turn-1"),
      ],
      revision: "4",
      sessionId: "session-1",
    };

    const projected = projectAgentSession(session);

    expect(projected.turns).toEqual([
      {
        answer: "Hi there",
        id: "turn-1",
        status: "completed",
        thought: "",
        user: "Hello",
      },
    ]);
    expect(projected.turns[0]).not.toHaveProperty("work");
    expect(projected.traces.map((trace) => trace.label)).toEqual([
      "Hello",
      "Model request",
      "Model output",
      "Turn completed",
    ]);
  });

  it("marks only Turns with visible Agent work", () => {
    const session: AgentSession = {
      events: [
        event(
          "1",
          "turn_started",
          { input: "Use a skill" },
          "turn-1",
          "2026-08-29T00:00:00Z"
        ),
        event(
          "2",
          "tool_requested",
          {
            arguments_json: '{"name":"ask-matt"}',
            call_id: "call-1",
            name: "skill",
          },
          "turn-1",
          "2026-08-29T00:00:02Z"
        ),
        event(
          "3",
          "tool_result",
          {
            call_id: "call-1",
            metadata_json: '{"name":"ask-matt"}',
            name: "skill",
          },
          "turn-1",
          "2026-08-29T00:00:03Z"
        ),
        event(
          "4",
          "turn_completed",
          { output: "Done" },
          "turn-1",
          "2026-08-29T00:00:07Z"
        ),
      ],
      revision: "4",
      sessionId: "session-1",
    };

    expect(projectAgentSession(session).turns[0]).toMatchObject({
      status: "completed",
      tools: [
        {
          argumentsJson: '{"name":"ask-matt"}',
          callId: "call-1",
          metadataJson: '{"name":"ask-matt"}',
          name: "skill",
          status: "completed",
        },
      ],
      work: { durationMs: 7000 },
    });
  });

  it("does not expose an unexecuted internal Tool attempt as assistant text", () => {
    const leaked =
      ' to=skill  (Lenso Agent Harness)  code:\n{"name":"ask-matt"}已调用 `ask-matt` 技能。';
    const projected = projectAgentSession({
      events: [
        event("1", "turn_started", { input: "Call a tool" }, "turn-1"),
        event("2", "model_output", { text: leaked }, "turn-1"),
        event("3", "turn_completed", { output: leaked }, "turn-1"),
      ],
      revision: "3",
      sessionId: "session-1",
    });

    expect(projected.turns[0]).toMatchObject({
      answer: "",
      tools: [
        {
          argumentsJson: '{"name":"ask-matt"}',
          error: "No Tool event was recorded for this request.",
          name: "skill",
          status: "not_run",
        },
      ],
    });
  });

  it("does not treat a bare Tool success claim as execution evidence", () => {
    const claim = "已调用 `ask-matt` 技能。";
    const projected = projectAgentSession({
      events: [
        event("1", "turn_started", { input: "Call a tool" }, "turn-1"),
        event("2", "model_output", { text: claim }, "turn-1"),
        event("3", "turn_completed", { output: claim }, "turn-1"),
      ],
      revision: "3",
      sessionId: "session-1",
    });

    expect(projected.turns[0]).toMatchObject({
      answer: "",
      tools: [
        {
          argumentsJson: '{"name":"ask-matt"}',
          name: "skill",
          status: "not_run",
        },
      ],
    });
  });

  it("projects cancellation as a terminal status rather than an error message", () => {
    const projected = projectAgentSession({
      events: [
        event("1", "turn_started", { input: "Long task" }, "turn-1"),
        event("2", "turn_cancelled", { error: "cancelled" }, "turn-1"),
      ],
      revision: "2",
      sessionId: "session-1",
    });

    expect(projected.turns[0]).toMatchObject({ status: "cancelled" });
    expect(projected.turns[0]).not.toHaveProperty("error");
  });

  it("accepts durable compaction and memory events from the current Session contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          events: [
            {
              event_id: "event-1",
              kind: "context_compaction_committed",
              occurred_at: "2026-08-29T00:00:00Z",
              payload_json: JSON.stringify({ summary: "Compacted" }),
              revision: "1",
              turn_id: "turn-1",
            },
            {
              event_id: "event-2",
              kind: "memory_recalled",
              occurred_at: "2026-08-29T00:00:01Z",
              payload_json: JSON.stringify({ items: [] }),
              revision: "2",
              turn_id: "turn-1",
            },
          ],
          revision: "2",
          session_id: "session-1",
        })
      )
    );

    await expect(readAgentSession("session-1")).resolves.toMatchObject({
      events: [
        { kind: "context_compaction_committed" },
        { kind: "memory_recalled" },
      ],
    });
  });

  it("strictly decodes Session summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          sessions: [
            {
              revision: "4",
              sessionId: "session-1",
              title: "Hello",
              updatedAt: "2026-08-29T00:00:00Z",
            },
          ],
        })
      )
    );

    await expect(listAgentSessions()).resolves.toEqual([
      {
        revision: "4",
        sessionId: "session-1",
        title: "Hello",
        updatedAt: "2026-08-29T00:00:00Z",
      },
    ]);
  });

  it("decodes the effective immutable Tool policy from bootstrap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          capabilities: {
            cancel: true,
            edit: true,
            sessionList: true,
            sessionRead: true,
          },
          mode: "console",
          profile: "default",
          tools: {
            allowed: ["read"],
            available: [
              {
                description: "Read one workspace file.",
                name: "read",
              },
            ],
          },
          trajectory: "summary",
        })
      )
    );

    await expect(readAgentBootstrap()).resolves.toMatchObject({
      mode: "console",
      profile: "default",
      tools: {
        allowed: ["read"],
        available: [
          {
            description: "Read one workspace file.",
            name: "read",
          },
        ],
      },
    });
  });

  it("reads and revision-fences Agent Tool policy updates", async () => {
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) =>
      Response.json({
        allowed: init?.method === "PUT" ? ["read"] : [],
        available: [
          {
            description: "Read one workspace file.",
            name: "read",
          },
        ],
        revision: init?.method === "PUT" ? 1 : 0,
        schema: "lenso.agent.tool-policy.v1",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(readAgentToolPolicy()).resolves.toMatchObject({ revision: 0 });
    await expect(
      updateAgentToolPolicy({ allowed: ["read"], expectedRevision: 0 })
    ).resolves.toMatchObject({ allowed: ["read"], revision: 1 });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ allowed: ["read"], expectedRevision: 0 }),
      method: "PUT",
    });
  });

  it("sends edit intent as a branch request", async () => {
    let body = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        body = String(init?.body);
        return new Response(
          'event: turn.completed\ndata: {"type":"turn_completed","session_id":"branch-1"}\n\n',
          { headers: { "content-type": "text/event-stream" } }
        );
      })
    );

    await streamAgentTurn({
      editTurnId: "turn-1",
      input: "Edited",
      onEvent: () => undefined,
      requestId: "request-edit",
      sessionId: "session-1",
      signal: new AbortController().signal,
    });

    expect(JSON.parse(body)).toEqual({
      edit_turn_id: "turn-1",
      input: "Edited",
      request_id: "request-edit",
      session_id: "session-1",
    });
  });

  it("cancels an active Turn by its request identity", async () => {
    let url = "";
    let method = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        url = String(input);
        method = init?.method ?? "GET";
        return new Response(undefined, { status: 202 });
      })
    );

    await cancelAgentTurn("request-1");

    expect(url).toContain("/agent/turns/request-1/cancel");
    expect(method).toBe("POST");
  });
});

function event(
  revision: string,
  kind: AgentSession["events"][number]["kind"],
  payload: unknown,
  turnId: string,
  occurredAt = "2026-08-29T00:00:00Z"
): AgentSession["events"][number] {
  return {
    eventId: `event-${revision}`,
    kind,
    occurredAt,
    payloadJson: JSON.stringify(payload),
    revision,
    turnId,
  };
}
