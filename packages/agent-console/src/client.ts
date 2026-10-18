import { z } from "zod";

// lenso-agent HTTP contract, verified at b1e7a3712872ab07d441130900d6abe8548a9d0e.
// The private Agent package is installed by the application, not bundled here.
const id = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/u);
export const sessionSchema = z.object({
  id,
  profile: z.string(),
  createdAt: z.number(),
});
export const runSchema = z.object({
  id,
  sessionId: id,
  status: z.enum([
    "running",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  createdAt: z.number(),
  cancelRequestedAt: z.number().optional(),
  error: z.string().optional(),
});
export const actionSchema = z.object({
  id,
  callId: id,
  sessionId: id,
  runId: id,
  digest: z.string().min(1).max(1024),
  createdAt: z.number(),
  expiresAt: z.number(),
  status: z.enum([
    "pending",
    "executing",
    "completed",
    "cancelled",
    "expired",
    "rejected",
    "outcome_unknown",
  ]),
  prepared: z.object({
    input: z.unknown(),
    precondition: z.string().nullable(),
    definition: z.object({
      name: z.string(),
      description: z.string(),
      target: z.object({
        application: z.string(),
        instance: z.string(),
        plugin: z.string(),
        operation: z.string(),
      }),
      effect: z.enum(["read", "write", "unknown"]),
      confirmation: z.boolean(),
    }),
  }),
});
// Outcome records use a derived ID; they are never interpolated into routes.
const messageSchema = z
  .object({
    id: id.or(
      z
        .string()
        .max(271)
        .regex(/^action-outcome:[A-Za-z0-9_-]+$/u)
    ),
    sessionId: id,
    runId: id,
    createdAt: z.number(),
    value: z.unknown(),
    source: z
      .object({ kind: z.literal("action-outcome"), actionId: id, callId: id })
      .optional(),
  })
  .refine(
    (message) =>
      message.source
        ? message.id === `action-outcome:${message.source.actionId}`
        : !message.id.startsWith("action-outcome:"),
    "Invalid action outcome message identity"
  );
export const snapshotSchema = z.object({
  session: sessionSchema,
  messages: z.array(messageSchema).max(2000),
  runs: z.array(runSchema).max(2000),
  actions: z.array(actionSchema).max(1000),
  calls: z.array(z.unknown()).max(2000),
});
const eventSchema = z.object({
  id,
  sequence: z.number().int().nonnegative(),
  timestamp: z.number(),
  sessionId: id,
  runId: id,
  kind: z.enum([
    "run_started",
    "text_delta",
    "tool_prepared",
    "tool_executing",
    "tool_result",
    "pending_action",
    "safe_error",
    "run_completed",
    "run_failed",
    "run_cancelled",
    "run_interrupted",
  ]),
  data: z.unknown().optional(),
});
const watchSnapshotSchema = z.object({
  snapshot: snapshotSchema,
  run: runSchema,
  sequence: z.number().int().nonnegative(),
});
export type AgentSession = z.infer<typeof sessionSchema>;
export type AgentRun = z.infer<typeof runSchema>;
export type AgentAction = z.infer<typeof actionSchema>;
export type AgentSnapshot = z.infer<typeof snapshotSchema>;
export type AgentWatchFrame =
  | ({ kind: "snapshot" } & z.infer<typeof watchSnapshotSchema>)
  | { kind: "event"; event: z.infer<typeof eventSchema> }
  | { kind: "resnapshot-required" };

export interface AgentConsoleClient {
  createSession(signal: AbortSignal): Promise<AgentSession>;
  readSession(sessionId: string, signal: AbortSignal): Promise<AgentSnapshot>;
  startRun(
    sessionId: string,
    text: string,
    requestId: string,
    signal: AbortSignal
  ): Promise<AgentRun>;
  watchRun(runId: string, signal: AbortSignal): AsyncIterable<AgentWatchFrame>;
  cancelRun(runId: string, signal: AbortSignal): Promise<AgentRun>;
  confirmAction(
    actionId: string,
    digest: string,
    signal: AbortSignal
  ): Promise<AgentAction>;
  cancelAction(actionId: string, signal: AbortSignal): Promise<AgentAction>;
}

export class AgentConsoleError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  constructor(code: string, status?: number) {
    super(
      status === 401 || status === 403
        ? "The Agent connection is not authorized. Reconnect through the application."
        : status === 409
          ? "The Agent session is busy or has changed. Refresh before continuing."
          : "The Agent request could not be completed."
    );
    this.name = "AgentConsoleError";
    this.code = code;
    this.status = status;
  }
}
const maxResponseBytes = 2 * 1024 * 1024;
async function json(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new AgentConsoleError("invalid-response");
  }
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) {
        break;
      }
      bytes += part.value.byteLength;
      if (bytes > maxResponseBytes) {
        throw new AgentConsoleError("response-budget");
      }
      parts.push(part.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(joined));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** The application supplies its existing authenticated, CSRF-aware transport.
 * Identity, tool authorization and provider/model selection stay with that host. */
export function createAgentConsoleClient(options: {
  basePath: string;
  profile: string;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
}): AgentConsoleClient {
  if (
    !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/u.test(options.basePath) ||
    !options.profile.trim()
  ) {
    throw new TypeError(
      "An exact local Agent prefix and host-selected profile are required"
    );
  }
  const request = async (
    path: string,
    signal: AbortSignal,
    input?: unknown,
    requestId?: string
  ) => {
    signal.throwIfAborted();
    const response = await options.fetch(options.basePath + path, {
      method: input === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
      headers: {
        accept: path.endsWith("/watch")
          ? "text/event-stream"
          : "application/json",
        ...(input === undefined ? {} : { "content-type": "application/json" }),
        ...(requestId ? { "idempotency-key": requestId } : {}),
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    signal.throwIfAborted();
    if (!response.ok) {
      // The transport exposes only the safe error code, never provider causes.
      let code = "request-failed";
      try {
        const problem = z
          .object({ error: z.string().max(100) })
          .parse(await json(response));
        code = problem.error;
      } catch {
        signal.throwIfAborted();
      }
      throw new AgentConsoleError(code, response.status);
    }
    return response;
  };
  const read = async <T>(
    schema: z.ZodType<T>,
    path: string,
    signal: AbortSignal,
    input?: unknown,
    requestId?: string
  ) => {
    const data = await json(await request(path, signal, input, requestId));
    signal.throwIfAborted();
    return schema.parse(data);
  };
  return {
    createSession: (signal) =>
      read(sessionSchema, "/sessions", signal, { profile: options.profile }),
    async readSession(sessionId, signal) {
      id.parse(sessionId);
      const snapshot = await read(
        snapshotSchema,
        `/sessions/${sessionId}`,
        signal
      );
      if (
        snapshot.session.id !== sessionId ||
        [...snapshot.runs, ...snapshot.messages, ...snapshot.actions].some(
          (item) => item.sessionId !== sessionId
        )
      ) {
        throw new AgentConsoleError("session-mismatch");
      }
      return snapshot;
    },
    async startRun(sessionId, text, requestId, signal) {
      id.parse(sessionId);
      id.parse(requestId);
      if (
        !text.trim() ||
        new TextEncoder().encode(JSON.stringify({ text })).byteLength >
          64 * 1024
      ) {
        throw new AgentConsoleError("input-budget");
      }
      const run = await read(
        runSchema,
        `/sessions/${sessionId}/runs`,
        signal,
        { text },
        requestId
      );
      if (run.sessionId !== sessionId) {
        throw new AgentConsoleError("session-mismatch");
      }
      return run;
    },
    async *watchRun(runId, signal) {
      id.parse(runId);
      const response = await request(`/runs/${runId}/watch`, signal);
      if (
        !response.headers
          .get("content-type")
          ?.startsWith("text/event-stream") ||
        !response.body
      ) {
        throw new AgentConsoleError("invalid-stream");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "",
        sequence = -1,
        sessionId: string | undefined;
      try {
        while (true) {
          const part = await reader.read();
          signal.throwIfAborted();
          if (part.done) {
            throw new AgentConsoleError("stream-interrupted");
          }
          buffer = (
            buffer + decoder.decode(part.value, { stream: true })
          ).replaceAll("\r\n", "\n");
          if (buffer.length > 256 * 1024) {
            throw new AgentConsoleError("event-budget");
          }
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const packet = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            let name = "message";
            const data: string[] = [];
            for (const line of packet.split("\n")) {
              if (line.startsWith("event:")) {
                name = line.slice(6).trim();
              }
              if (line.startsWith("data:")) {
                data.push(line.slice(5).trimStart());
              }
            }
            if (!data.length) {
              continue;
            }
            const value: unknown = JSON.parse(data.join("\n"));
            if (name === "resnapshot_required") {
              yield { kind: "resnapshot-required" };
              return;
            }
            if (name === "snapshot") {
              const snapshot = watchSnapshotSchema.parse(value);
              if (
                sequence !== -1 ||
                snapshot.run.id !== runId ||
                snapshot.snapshot.session.id !== snapshot.run.sessionId ||
                [
                  ...snapshot.snapshot.runs,
                  ...snapshot.snapshot.messages,
                  ...snapshot.snapshot.actions,
                ].some((item) => item.sessionId !== snapshot.run.sessionId)
              ) {
                throw new AgentConsoleError("invalid-snapshot");
              }
              ({ sessionId } = snapshot.run);
              ({ sequence } = snapshot);
              yield { kind: "snapshot", ...snapshot };
              if (snapshot.run.status !== "running") {
                return;
              }
            } else {
              const event = eventSchema.parse(value);
              if (
                sequence === -1 ||
                event.runId !== runId ||
                event.sessionId !== sessionId ||
                event.kind !== name
              ) {
                throw new AgentConsoleError("invalid-event");
              }
              if (event.sequence <= sequence) {
                continue;
              }
              ({ sequence } = event);
              yield { kind: "event", event };
              if (
                [
                  "run_completed",
                  "run_failed",
                  "run_cancelled",
                  "run_interrupted",
                ].includes(event.kind)
              ) {
                return;
              }
            }
          }
        }
      } finally {
        // Detach is not cancellation. Only cancelRun dispatches the stop intent.
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
    async cancelRun(runId, signal) {
      id.parse(runId);
      const run = await read(runSchema, `/runs/${runId}/cancel`, signal, {});
      if (run.id !== runId) {
        throw new AgentConsoleError("run-mismatch");
      }
      return run;
    },
    async confirmAction(actionId, digest, signal) {
      id.parse(actionId);
      const action = await read(
        actionSchema,
        `/actions/${actionId}/confirm`,
        signal,
        { digest }
      );
      if (action.id !== actionId) {
        throw new AgentConsoleError("action-mismatch");
      }
      return action;
    },
    async cancelAction(actionId, signal) {
      id.parse(actionId);
      const action = await read(
        actionSchema,
        `/actions/${actionId}/cancel`,
        signal,
        {}
      );
      if (action.id !== actionId) {
        throw new AgentConsoleError("action-mismatch");
      }
      return action;
    },
  };
}

/** Render only public text message parts. Tool input remains in the review UI. */
export function agentMessageText(
  value: unknown
): { role: "user" | "assistant"; text: string } | undefined {
  const message = z
    .object({
      role: z.enum(["user", "assistant"]),
      content: z.union([z.string(), z.array(z.unknown())]),
    })
    .safeParse(value);
  if (!message.success) {
    return;
  }
  const text =
    typeof message.data.content === "string"
      ? message.data.content
      : message.data.content
          .flatMap((part) => {
            const parsed = z
              .object({ type: z.literal("text"), text: z.string() })
              .safeParse(part);
            return parsed.success ? [parsed.data.text] : [];
          })
          .join("");
  return { role: message.data.role, text };
}
