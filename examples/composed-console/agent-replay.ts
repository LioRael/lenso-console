import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  AgentAction,
  AgentRun,
  AgentSnapshot,
} from "@lenso/agent-console/client";
import type { Plugin } from "vite";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

/** Explicit protocol fixture, never an Agent implementation or model provider. */
export function createAgentReplay() {
  type Scenario =
    | "normal"
    | "slow"
    | "lost-submit"
    | "resnapshot"
    | "error"
    | "pending-action"
    | "unknown-action";
  let scenario: Scenario = "normal";
  let session: AgentSnapshot | undefined;
  let sequence = 0;
  let dropped = false;
  let resnapshotSent = false;
  const admissions = new Map<string, { text: string; run: AgentRun }>();
  const listeners = new Map<
    string,
    Set<(kind: string, data: unknown) => void>
  >();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const requests: {
    path: string;
    method: string;
    key: string | null;
    body: unknown;
  }[] = [];
  const later = (work: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      work();
    }, ms);
    timers.add(timer);
  };
  const emit = (run: AgentRun, kind: string, data?: unknown) => {
    sequence += 1;
    const event = {
      id: `event-${sequence}`,
      sequence,
      timestamp: Date.now(),
      sessionId: run.sessionId,
      runId: run.id,
      kind,
      ...(data === undefined ? {} : { data }),
    };
    for (const listener of listeners.get(run.id) ?? []) {
      listener(kind, event);
    }
  };
  const finish = (run: AgentRun, cancelled = false) => {
    if (run.status !== "running") {
      return;
    }
    run.status = cancelled
      ? "cancelled"
      : scenario === "error"
        ? "failed"
        : "completed";
    if (!cancelled && scenario !== "error") {
      session!.messages.push({
        id: `assistant-${run.id}`,
        sessionId: run.sessionId,
        runId: run.id,
        createdAt: Date.now(),
        value: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Protocol replay only. No provider or business tool was contacted.",
            },
          ],
        },
      });
    }
    if (!cancelled && ["pending-action", "unknown-action"].includes(scenario)) {
      const action: AgentAction = {
        id: `action-${run.id}`,
        callId: `call-${run.id}`,
        sessionId: run.sessionId,
        runId: run.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        digest: "synthetic-review-digest",
        status: scenario === "unknown-action" ? "outcome_unknown" : "pending",
        prepared: {
          input: { invoice: "sample-42", preview: true },
          precondition: "sample-revision-1",
          definition: {
            name: "Preview invoice",
            description:
              "Synthetic review card; no real invoice operation is executed.",
            target: {
              application: "protocol-fixture",
              instance: "isolated",
              plugin: "invoices",
              operation: "preview",
            },
            effect: "write",
            confirmation: true,
          },
        },
      };
      session!.actions.push(action);
      emit(run, "pending_action", action);
    }
    if (run.status === "failed") {
      emit(run, "safe_error", { code: "synthetic-provider-failure" });
    }
    emit(run, `run_${run.status}`);
  };
  const fetch = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname.replace(/^\/agent-replay/u, "");
    const body: unknown =
      request.method === "POST" ? await request.json() : undefined;
    const key = request.headers.get("idempotency-key");
    requests.push({ path, method: request.method, key, body });
    if (path === "/sessions" && request.method === "POST") {
      if (
        !body ||
        typeof body !== "object" ||
        !("profile" in body) ||
        body.profile !== "protocol-replay"
      ) {
        return json({ error: "unknown-profile" }, 400);
      }
      const created = {
        id: "replay-session",
        profile: "protocol-replay",
        createdAt: Date.now(),
      };
      session = {
        session: created,
        runs: [],
        messages: [],
        actions: [],
        calls: [],
      };
      return json(created, 201);
    }
    if (!session) {
      return json({ error: "not-found" }, 404);
    }
    if (path === `/sessions/${session.session.id}`) {
      return json(session);
    }
    if (
      path === `/sessions/${session.session.id}/runs` &&
      request.method === "POST"
    ) {
      if (
        !key ||
        !body ||
        typeof body !== "object" ||
        !("text" in body) ||
        typeof body.text !== "string"
      ) {
        return json({ error: "invalid-input" }, 400);
      }
      const prior = admissions.get(key);
      if (prior) {
        return prior.text === body.text
          ? json(prior.run, 202)
          : json({ error: "idempotency-conflict" }, 409);
      }
      if (session.runs.some((run) => run.status === "running")) {
        return json({ error: "session-busy" }, 409);
      }
      const run: AgentRun = {
        id: `replay-run-${session.runs.length + 1}`,
        sessionId: session.session.id,
        status: "running",
        createdAt: Date.now(),
      };
      session.runs.push(run);
      admissions.set(key, { text: body.text, run });
      session.messages.push({
        id: `user-${run.id}`,
        sessionId: run.sessionId,
        runId: run.id,
        createdAt: Date.now(),
        value: { role: "user", content: body.text },
      });
      emit(run, "run_started");
      if (scenario !== "slow" && scenario !== "resnapshot") {
        const words =
          "Protocol replay only. No provider or business tool was contacted.".split(
            " "
          );
        words.forEach((word, index) =>
          later(
            () => {
              if (run.status === "running") {
                emit(run, "text_delta", { text: `${index ? " " : ""}${word}` });
              }
            },
            120 + index * 45
          )
        );
        later(() => finish(run), 180 + words.length * 45);
      }
      // Admission succeeded but its acknowledgement failed. An explicit 503
      // avoids browser-level retry of a reset pooled socket masking the UI path.
      if (scenario === "lost-submit" && !dropped) {
        dropped = true;
        return json({ error: "synthetic-acknowledgement-failure" }, 503);
      }
      return json(run, 202);
    }
    const run = session.runs.find((item) =>
      path.startsWith(`/runs/${item.id}/`)
    );
    if (run && path.endsWith("/cancel") && request.method === "POST") {
      if (run.status === "running") {
        run.cancelRequestedAt = Date.now();
        later(() => finish(run, true), 100);
      }
      return json(run, run.status === "running" ? 202 : 200);
    }
    if (run && path.endsWith("/watch")) {
      const encoder = new TextEncoder();
      let remove: (() => void) | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const packet = (kind: string, value: unknown) =>
            encoder.encode(
              `event: ${kind}\ndata: ${JSON.stringify(value)}\n\n`
            );
          controller.enqueue(
            packet("snapshot", { snapshot: session, run, sequence })
          );
          if (run.status !== "running") {
            controller.close();
            return;
          }
          if (scenario === "resnapshot" && !resnapshotSent) {
            resnapshotSent = true;
            controller.enqueue(
              packet("resnapshot_required", { code: "resnapshot-required" })
            );
            controller.close();
            return;
          }
          const subscriptions = listeners.get(run.id) ?? new Set();
          const close = () => {
            remove?.();
            try {
              controller.close();
            } catch {
              /* Already detached. */
            }
          };
          const listener = (kind: string, data: unknown) => {
            controller.enqueue(packet(kind, data));
            if (
              ["run_completed", "run_failed", "run_cancelled"].includes(kind)
            ) {
              close();
            }
          };
          subscriptions.add(listener);
          listeners.set(run.id, subscriptions);
          remove = () => {
            subscriptions.delete(listener);
            request.signal.removeEventListener("abort", close);
          };
          request.signal.addEventListener("abort", close, { once: true });
        },
        cancel() {
          remove?.();
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    const action = session.actions.find((item) =>
      path.startsWith(`/actions/${item.id}/`)
    );
    if (action && request.method === "POST") {
      if (action.status !== "pending") {
        return json({ error: "action-changed" }, 409);
      }
      if (path.endsWith("/confirm")) {
        if (
          !body ||
          typeof body !== "object" ||
          !("digest" in body) ||
          body.digest !== action.digest
        ) {
          return json({ error: "action-changed" }, 409);
        }
        action.status = "completed";
      } else if (path.endsWith("/cancel")) {
        action.status = "cancelled";
      } else {
        return json({ error: "not-found" }, 404);
      }
      session.messages.push({
        id: `action-outcome:${action.id}`,
        sessionId: action.sessionId,
        runId: action.runId,
        createdAt: Date.now(),
        source: {
          kind: "action-outcome",
          actionId: action.id,
          callId: action.callId,
        },
        value: {
          role: "user",
          content: JSON.stringify({
            source: "action-outcome",
            actionId: action.id,
            status: action.status,
          }),
        },
      });
      return json(action);
    }
    return json({ error: "not-found" }, 404);
  };
  return {
    fetch,
    requests,
    setScenario(value: Scenario) {
      scenario = value;
    },
    get snapshot() {
      return session;
    },
    finish() {
      const run = session?.runs.find((item) => item.status === "running");
      if (run) {
        finish(run);
      }
    },
    close() {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      listeners.clear();
    },
  };
}

export async function serveAgentReplay(
  fixture: ReturnType<typeof createAgentReplay>,
  req: IncomingMessage,
  res: ServerResponse
) {
  const controller = new AbortController();
  res.once("close", () => controller.abort());
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 64 * 1024) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
    }
    const response = await fixture.fetch(
      new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method ?? "GET",
        headers,
        signal: controller.signal,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      })
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    const reader = response.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done || controller.signal.aborted) {
            break;
          }
          res.write(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
    res.end();
  } catch {
    res.destroy();
  }
}

/** Only the explicitly labelled composed preview installs these fixture routes. */
export function agentReplayPlugin(fixture = createAgentReplay()): Plugin {
  return {
    name: "console-agent-protocol-replay",
    configureServer(server) {
      server.httpServer?.once("close", fixture.close);
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/agent-replay/")) {
          next();
          return;
        }
        void serveAgentReplay(fixture, req, res);
      });
    },
  };
}
