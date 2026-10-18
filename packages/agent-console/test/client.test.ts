import { afterEach, expect, test } from "bun:test";

import { createAgentReplay } from "../../../examples/composed-console/agent-replay";
import {
  AgentConsoleError,
  agentMessageText,
  createAgentConsoleClient,
} from "../src/client";
import { agentConnectionState } from "../src/conversation";

const fixtures = new Set<ReturnType<typeof createAgentReplay>>();
afterEach(() => {
  for (const fixture of fixtures) {
    fixture.close();
  }
  fixtures.clear();
});
function setup() {
  const fixture = createAgentReplay();
  fixtures.add(fixture);
  const client = createAgentConsoleClient({
    basePath: "/agent-replay",
    profile: "protocol-replay",
    fetch: (input, init) =>
      fixture.fetch(new Request(`http://fixture.local${input}`, init)),
  });
  return { fixture, client, signal: new AbortController().signal };
}

test("host readiness fails closed without a selected model and retains revocation states", () => {
  const { client } = setup();
  expect(agentConnectionState({})).toBe("disconnected");
  expect(agentConnectionState({ client })).toBe("unknown");
  expect(
    agentConnectionState({ connection: { state: "ready", model: "model" } })
  ).toBe("disconnected");
  expect(agentConnectionState({ client, connection: { state: "ready" } })).toBe(
    "model-required"
  );
  expect(
    agentConnectionState({
      client,
      connection: { state: "ready", model: "model" },
    })
  ).toBe("ready");
  for (const state of [
    "reauthorize",
    "revoked",
    "disabled",
    "unknown",
    "disconnected",
    "model-required",
  ] as const) {
    expect(
      agentConnectionState({ client, connection: { state, model: "model" } })
    ).toBe(state);
  }
});

test("oversized input is rejected before any model-run request is dispatched", async () => {
  const { fixture, client, signal } = setup();
  const session = await client.createSession(signal);
  await expect(
    client.startRun(session.id, "文".repeat(24000), "bounded-input", signal)
  ).rejects.toMatchObject({ code: "input-budget" });
  expect(
    fixture.requests.filter((request) => request.path.endsWith("/runs"))
  ).toHaveLength(0);
});

test("a lost submission retries the identical text and key without creating another run", async () => {
  const { fixture, client, signal } = setup();
  fixture.setScenario("lost-submit");
  const session = await client.createSession(signal);
  await expect(
    client.startRun(session.id, "same synthetic text", "same-key", signal)
  ).rejects.toThrow();
  const admitted = await client.startRun(
    session.id,
    "same synthetic text",
    "same-key",
    signal
  );
  expect(admitted.id).toBe("replay-run-1");
  expect(fixture.snapshot?.runs).toHaveLength(1);
  const submissions = fixture.requests.filter((request) =>
    request.path.endsWith("/runs")
  );
  expect(submissions.map((request) => request.key)).toEqual([
    "same-key",
    "same-key",
  ]);
  expect(submissions.map((request) => request.body)).toEqual([
    { text: "same synthetic text" },
    { text: "same synthetic text" },
  ]);
  await expect(
    client.startRun(session.id, "changed text", "same-key", signal)
  ).rejects.toBeInstanceOf(AgentConsoleError);
  expect(fixture.snapshot?.runs).toHaveLength(1);
});

test("watch starts with an authoritative snapshot and detaching never cancels", async () => {
  const { fixture, client, signal } = setup();
  fixture.setScenario("slow");
  const session = await client.createSession(signal);
  const run = await client.startRun(session.id, "hello", "watch-key", signal);
  const watch = client.watchRun(run.id, signal)[Symbol.asyncIterator]();
  const first = await watch.next();
  expect(first.value).toMatchObject({
    kind: "snapshot",
    run: { id: run.id, status: "running" },
  });
  await watch.return?.();
  expect(
    fixture.requests.some((request) => request.path.endsWith("/cancel"))
  ).toBe(false);
  const resumed = client.watchRun(run.id, signal)[Symbol.asyncIterator]();
  await resumed.next();
  const next = resumed.next();
  fixture.finish();
  const event = await next;
  expect(event.value).toMatchObject({
    kind: "event",
    event: { kind: "run_completed", runId: run.id },
  });
  await resumed.return?.();
  const saved = await client.readSession(session.id, signal);
  expect(agentMessageText(saved.messages.at(-1)!.value)?.text).toContain(
    "No provider"
  );
});

test("split UTF-8 SSE frames retain text_delta.data.text and reject a foreign run", async () => {
  const { client, signal } = setup();
  const session = await client.createSession(signal);
  const snapshot = await client.readSession(session.id, signal);
  const run = {
    id: "split-run",
    sessionId: session.id,
    status: "running",
    createdAt: Date.now(),
  };
  let foreign = false;
  const streamed = createAgentConsoleClient({
    basePath: "/agent",
    profile: "profile",
    fetch: async () => {
      const event = {
        id: "event-1",
        sequence: 1,
        timestamp: Date.now(),
        sessionId: session.id,
        runId: foreign ? "wrong-run" : run.id,
        kind: "text_delta",
        data: { text: "你好 👋" },
      };
      const terminal = {
        ...event,
        id: "event-2",
        sequence: 2,
        runId: run.id,
        kind: "run_completed",
      };
      const bytes = new TextEncoder().encode(
        `event: snapshot\r\ndata: ${JSON.stringify({ snapshot, run, sequence: 0 })}\r\n\r\nevent: text_delta\r\ndata: ${JSON.stringify(event)}\r\n\r\nevent: run_completed\r\ndata: ${JSON.stringify(terminal)}\r\n\r\n`
      );
      return new Response(
        new ReadableStream({
          start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 7) {
              controller.enqueue(bytes.slice(offset, offset + 7));
            }
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } }
      );
    },
  });
  const frames = [];
  for await (const frame of streamed.watchRun(run.id, signal)) {
    frames.push(frame);
  }
  expect(frames[1]).toMatchObject({
    kind: "event",
    event: { data: { text: "你好 👋" } },
  });
  foreign = true;
  const rejected = async () => {
    for await (const frame of streamed.watchRun(run.id, signal)) {
      void frame;
    }
  };
  await expect(rejected()).rejects.toMatchObject({ code: "invalid-event" });
});

test("resnapshot_required refreshes through the normal snapshot endpoint rather than replaying event IDs", async () => {
  const { fixture, client, signal } = setup();
  fixture.setScenario("resnapshot");
  const session = await client.createSession(signal);
  const run = await client.startRun(
    session.id,
    "hello",
    "resnapshot-key",
    signal
  );
  const frames = [];
  for await (const frame of client.watchRun(run.id, signal)) {
    frames.push(frame.kind);
  }
  expect(frames).toEqual(["snapshot", "resnapshot-required"]);
  const saved = await client.readSession(session.id, signal);
  expect(saved.runs[0]?.status).toBe("running");
});

test("cancel is an intent until the authoritative run becomes terminal", async () => {
  const { fixture, client, signal } = setup();
  fixture.setScenario("slow");
  const session = await client.createSession(signal);
  const run = await client.startRun(session.id, "hello", "cancel-key", signal);
  const intent = await client.cancelRun(run.id, signal);
  expect(intent.status).toBe("running");
  expect(intent.cancelRequestedAt).toBeNumber();
  const frames = [];
  for await (const frame of client.watchRun(run.id, signal)) {
    frames.push(frame);
  }
  expect(frames.at(-1)).toMatchObject({
    kind: "event",
    event: { kind: "run_cancelled" },
  });
  const saved = await client.readSession(session.id, signal);
  expect(saved.runs[0]?.status).toBe("cancelled");
});

test("completed runs can retain pending actions; confirming refreshes independently and starts no model turn", async () => {
  const { fixture, client, signal } = setup();
  fixture.setScenario("pending-action");
  const session = await client.createSession(signal);
  const run = await client.startRun(session.id, "review", "action-key", signal);
  fixture.finish();
  const snapshot = await client.readSession(session.id, signal);
  expect(snapshot.runs[0]?.status).toBe("completed");
  const action = snapshot.actions[0]!;
  expect(action.status).toBe("pending");
  expect(action.prepared.definition.target.operation).toBe("preview");
  await expect(
    client.confirmAction(action.id, "wrong-digest", signal)
  ).rejects.toBeInstanceOf(AgentConsoleError);
  const confirmed = await client.confirmAction(
    action.id,
    action.digest,
    signal
  );
  const saved = await client.readSession(session.id, signal);
  expect(confirmed.status).toBe("completed");
  expect(saved.actions[0]?.status).toBe("completed");
  expect(fixture.snapshot?.runs).toHaveLength(1);
  expect(run.id).toBe("replay-run-1");
});

test("the adapter rejects foreign snapshot identity and non-local prefixes", async () => {
  expect(() =>
    createAgentConsoleClient({
      basePath: "https://foreign.example/agent",
      profile: "profile",
      fetch,
    })
  ).toThrow();
  const { fixture, client, signal } = setup();
  const session = await client.createSession(signal);
  const snapshot = await client.readSession(session.id, signal);
  const foreign = createAgentConsoleClient({
    basePath: "/agent",
    profile: "profile",
    fetch: async () =>
      Response.json({
        ...snapshot,
        session: { ...snapshot.session, id: "another-session" },
      }),
  });
  await expect(foreign.readSession(session.id, signal)).rejects.toMatchObject({
    code: "session-mismatch",
  });
  expect(
    fixture.requests.every((request) => request.path.startsWith("/"))
  ).toBe(true);
  expect(
    agentMessageText({ role: "toolResult", content: "private tool envelope" })
  ).toBeUndefined();
});
