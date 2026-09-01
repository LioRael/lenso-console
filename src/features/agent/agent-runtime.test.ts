import { afterEach, describe, expect, it, vi } from "vitest";

import {
  answerAgentInteraction,
  cancelAgentTerminal,
  decodeAgentSseFrames,
  decodeAgentStreamEvent,
  cancelAgentTurn,
  listAgentSessions,
  listAgents,
  modelsForSelector,
  projectAgentSession,
  readAgentBootstrap,
  readAgentContextSources,
  readAgentModels,
  readAgentSession,
  readAgentTasks,
  readAgentTerminalCatalog,
  readAgentTrajectory,
  readPendingAgentInteractions,
  renameAgentSession,
  readAgentToolPolicy,
  streamAgentTurn,
  streamAgentTerminal,
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
      ' to=skill  (Lenso Agent)  code:\n{"name":"ask-matt"}已调用 `ask-matt` 技能。';
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

  it("decodes the Harness-owned semantic Trajectory projection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          records: [
            {
              completedAt: "2026-08-29T00:00:03Z",
              detail: {
                model: "gpt-test",
                output: "Done",
                summary: "Model request and completion for one Agent step.",
              },
              durationMs: 2000,
              id: "event-2",
              inputTokens: 20,
              kind: "model",
              label: "Model call",
              outputTokens: 4,
              preview: "Done",
              sourceEventIds: ["event-2", "event-3"],
              startedAt: "2026-08-29T00:00:01Z",
              status: "completed",
              step: 1,
              timeToFirstTokenMs: 400,
              turn: 1,
            },
          ],
          revision: 4,
          schema: "lenso.agent.trajectory@1",
          sessionId: "session-1",
          summary: {
            durationMs: 3000,
            failedOperations: 0,
            inputTokens: 20,
            modelCalls: 1,
            outputTokens: 4,
            startedAt: "2026-08-29T00:00:00Z",
            status: "completed",
            toolCalls: 0,
            turns: 1,
            updatedAt: "2026-08-29T00:00:03Z",
          },
        })
      )
    );

    await expect(readAgentTrajectory("session-1")).resolves.toMatchObject({
      records: [
        {
          durationMs: 2000,
          inputTokens: 20,
          kind: "model",
          sourceEventIds: ["event-2", "event-3"],
          timeToFirstTokenMs: 400,
        },
      ],
      summary: { inputTokens: 20, modelCalls: 1, outputTokens: 4 },
    });
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
            userInteraction: true,
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
          trajectory: "lenso.agent.trajectory@1",
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

  it("discovers catalog Agents and routes one selected App Agent", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/api/console/v1/agents")) {
          return Response.json({
            agents: [
              {
                capabilities: ["lenso.agent.plugin-configuration@1"],
                id: "console",
                label: "Console Agent",
                role: "console",
              },
              {
                capabilities: ["lenso.agent.plugin-configuration@1"],
                id: "support-agent",
                label: "Support Agent",
                role: "app",
              },
            ],
          });
        }
        return Response.json({
          capabilities: {
            cancel: true,
            edit: true,
            sessionList: true,
            sessionRead: true,
            userInteraction: true,
          },
          mode: "console",
          profile: "coding",
          tools: { allowed: ["read"], available: [] },
          trajectory: "lenso.agent.trajectory@1",
        });
      })
    );

    await expect(listAgents()).resolves.toEqual([
      {
        capabilities: ["lenso.agent.plugin-configuration@1"],
        id: "console",
        label: "Console Agent",
        role: "console",
      },
      {
        capabilities: ["lenso.agent.plugin-configuration@1"],
        id: "support-agent",
        label: "Support Agent",
        role: "app",
      },
    ]);
    await expect(
      readAgentBootstrap(undefined, "support-agent")
    ).resolves.toMatchObject({ profile: "coding" });
    expect(urls[1]).toContain("/api/console/v1/agents/support-agent/bootstrap");
  });

  it("qualifies equal local Session identities by their owning Agent", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        urls.push(String(input));
        return Response.json({
          events: [],
          revision: "1",
          session_id: "same-session",
        });
      })
    );

    await readAgentSession("same-session", undefined, "console");
    await readAgentSession("same-session", undefined, "support-agent");

    expect(urls).toEqual([
      "/api/console/v1/agent/sessions/same-session",
      "/api/console/v1/agents/support-agent/sessions/same-session",
    ]);
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

  it("reads the Web-scoped Context Source catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          prompts: [
            {
              arguments_schema_json: '{"type":"object"}',
              description: "Use the project brief",
              name: "brief",
              source: "workspace",
            },
          ],
          resources: [
            {
              description: "Current architecture",
              mime_type: "text/markdown",
              name: "architecture",
              source: "workspace",
              uri: "file:///architecture.md",
            },
          ],
        })
      )
    );

    await expect(readAgentContextSources()).resolves.toEqual({
      prompts: [
        {
          argumentsSchemaJson: '{"type":"object"}',
          description: "Use the project brief",
          name: "brief",
          source: "workspace",
        },
      ],
      resources: [
        {
          description: "Current architecture",
          mimeType: "text/markdown",
          name: "architecture",
          source: "workspace",
          uri: "file:///architecture.md",
        },
      ],
    });
  });

  it("reads the Web Terminal command catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          commands: [
            {
              description: "List durable Sessions",
              id: "agent.sessions.list",
              output_formats: ["text", "json"],
              parameters: [],
              path: ["sessions", "list"],
              summary: "List Sessions",
            },
          ],
        })
      )
    );

    await expect(readAgentTerminalCatalog()).resolves.toEqual({
      commands: [
        {
          description: "List durable Sessions",
          id: "agent.sessions.list",
          outputFormats: ["text", "json"],
          parameters: [],
          path: ["sessions", "list"],
          summary: "List Sessions",
        },
      ],
    });
  });

  it("streams and cancels Web Terminal executions", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/cancel")) {
          return new Response(null, { status: 202 });
        }
        return new Response(
          'event: terminal.message\ndata: {"type":"terminal_message","message":{"content":"ok\\n","content_type":"text","kind":"stdout"}}\n\nevent: terminal.completed\ndata: {"type":"terminal_completed"}\n\n',
          { headers: { "content-type": "text/event-stream" } }
        );
      })
    );
    const events: string[] = [];

    await streamAgentTerminal({
      commandLine: "/sessions list",
      onEvent: (terminalEvent) => events.push(terminalEvent.type),
      requestId: "terminal-1",
      signal: new AbortController().signal,
    });
    await cancelAgentTerminal("terminal-1");

    expect(events).toEqual(["terminal_message", "terminal_completed"]);
    expect(urls[0]).toContain("/agent/terminal/executions");
    expect(urls[1]).toContain("/agent/terminal/executions/terminal-1/cancel");
  });

  it("renames a Session through its title revision fence", async () => {
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      requestInit = init;
      return Response.json({ title: "Focused work", titleRevision: "4" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      renameAgentSession({
        expectedTitleRevision: "3",
        sessionId: "session-1",
        title: "Focused work",
      })
    ).resolves.toEqual({ title: "Focused work", titleRevision: "4" });
    expect(requestInit).toMatchObject({
      body: JSON.stringify({
        expectedTitleRevision: "3",
        title: "Focused work",
      }),
      method: "PATCH",
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

  it("sends negotiated per-Turn model and Tool controls", async () => {
    let body = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        body = String(init?.body);
        return new Response(
          'event: turn.completed\ndata: {"type":"turn_completed","session_id":"session-1"}\n\n',
          { headers: { "content-type": "text/event-stream" } }
        );
      })
    );

    await streamAgentTurn({
      allowedTools: [],
      input: "Inspect only",
      model: "gpt-test",
      onEvent: () => undefined,
      reasoningEffort: "high",
      requestId: "request-controls",
      serviceTier: "priority",
      signal: new AbortController().signal,
    });

    expect(JSON.parse(body)).toMatchObject({
      allowed_tools: [],
      model: "gpt-test",
      reasoning_effort: "high",
      service_tier: "priority",
    });
  });

  it("projects model catalogs and task supervision snapshots", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) =>
        String(input).endsWith("/models")
          ? Response.json({
              providers: [
                {
                  models: [
                    {
                      capabilities: {
                        reasoning: {
                          efforts: ["low", "high"],
                          kind: "selectable",
                        },
                        service_tiers: { kind: "unsupported" },
                      },
                      display_name: "GPT Test",
                      hidden: false,
                      id: "gpt-test",
                      selected: true,
                    },
                    {
                      capabilities: {
                        reasoning: {
                          efforts: ["medium"],
                          kind: "selectable",
                        },
                        service_tiers: { kind: "unsupported" },
                      },
                      display_name: "Internal Review",
                      hidden: true,
                      id: "internal-review",
                      selected: false,
                    },
                  ],
                  selected_instance: "provider/model",
                },
              ],
              resolved_turn_profile: {
                model: "gpt-test",
                provider_instance: "provider/model",
                reasoning_effort: "high",
              },
            })
          : Response.json({
              tasks: [
                {
                  agent: "researcher",
                  progress: { content: "Reading sources" },
                  status: "running",
                  task_id: "task-1",
                  workspace: "/workspace",
                },
              ],
            })
      )
    );

    await expect(readAgentModels()).resolves.toMatchObject({
      models: [
        {
          displayName: "GPT Test",
          hidden: false,
          id: "gpt-test",
          reasoningEfforts: ["low", "high"],
        },
        {
          displayName: "Internal Review",
          hidden: true,
          id: "internal-review",
        },
      ],
      selectedModel: "gpt-test",
    });
    await expect(readAgentTasks()).resolves.toMatchObject([
      { progress: "Reading sources", status: "running", taskId: "task-1" },
    ]);
  });

  it("omits hidden models from ordinary selection but retains an explicit selection", () => {
    const catalog = {
      models: [
        {
          displayName: "GPT Visible",
          hidden: false,
          id: "gpt-visible",
          reasoningEfforts: [],
          selected: false,
          serviceTiers: [],
        },
        {
          displayName: "Internal Review",
          hidden: true,
          id: "internal-review",
          reasoningEfforts: ["medium"],
          selected: true,
          serviceTiers: [],
        },
      ],
      selectedModel: "internal-review",
    };

    expect(
      modelsForSelector(catalog, undefined).map((model) => model.id)
    ).toEqual(["gpt-visible", "internal-review"]);
    expect(
      modelsForSelector(catalog, "gpt-visible").map((model) => model.id)
    ).toEqual(["gpt-visible"]);
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

  it("reads and answers a pending Agent interaction", async () => {
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(undefined, { status: 204 });
      }
      return Response.json({
        interactions: [
          {
            interactionId: "interaction-1",
            questions: [
              {
                header: "Mode",
                multiSelect: false,
                options: [
                  {
                    description: "Prefer bounded changes.",
                    label: "Safe",
                    optionId: "safe",
                    preview: 'mode = "safe"',
                  },
                ],
                prompt: "Which mode should I use?",
                questionId: "mode",
              },
            ],
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readPendingAgentInteractions("request-1")
    ).resolves.toMatchObject([
      {
        interactionId: "interaction-1",
        questions: [{ questionId: "mode" }],
      },
    ]);
    await answerAgentInteraction({
      answers: [
        {
          questionId: "mode",
          selectedOptionIds: ["safe"],
        },
      ],
      interactionId: "interaction-1",
      requestId: "request-1",
    });

    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      "/agent/turns/request-1/interactions/interaction-1/answer"
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({
        answers: [
          {
            questionId: "mode",
            selectedOptionIds: ["safe"],
          },
        ],
      }),
      method: "POST",
    });
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
