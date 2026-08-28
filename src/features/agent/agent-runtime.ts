import { consoleApiAuthToken, consoleApiPrefix } from "../../lib/http-client";

export type AgentMessageKind =
  | "reasoning_completed"
  | "reasoning_delta"
  | "text_delta"
  | "tool_completed"
  | "tool_failed"
  | "tool_progress"
  | "tool_started";

export type AgentStreamMessage = {
  argumentsJson?: string;
  content?: string;
  durationMs?: string;
  error?: string;
  kind?: AgentMessageKind;
  metadataJson?: string;
  reasoningId?: string;
  sequence: string;
  sessionId?: string;
  text: string;
  toolCallId?: string;
  toolName?: string;
};

export type AgentStreamEvent =
  | { message: AgentStreamMessage; type: "turn_message" }
  | { sessionId?: string; type: "turn_cancelled" }
  | { sessionId?: string; type: "turn_completed" }
  | { detail: string; type: "turn_failed" };

export type AgentBootstrap = {
  capabilities: {
    cancel: boolean;
    edit: boolean;
    sessionList: boolean;
    sessionRead: boolean;
  };
  mode: string;
  profile: string;
  tools: {
    allowed: string[];
    available: AgentToolSummary[];
  };
};

export type AgentToolSummary = {
  description: string;
  name: string;
};

export type AgentToolPolicy = {
  allowed: string[];
  available: AgentToolSummary[];
  revision: number;
  schema: "lenso.agent.tool-policy.v1";
};

export type AgentSessionSummary = {
  revision: string;
  sessionId: string;
  title: string;
  updatedAt: string;
};

export type AgentSessionEventKind =
  | "model_output"
  | "model_requested"
  | "session_created"
  | "system_instruction_installed"
  | "tool_requested"
  | "tool_result"
  | "turn_cancelled"
  | "turn_completed"
  | "turn_failed"
  | "turn_started";

export type AgentSessionEvent = {
  eventId: string;
  kind: AgentSessionEventKind;
  occurredAt: string;
  payloadJson: string;
  revision: string;
  turnId?: string;
};

export type AgentSession = {
  events: AgentSessionEvent[];
  revision: string;
  sessionId: string;
};

export type AgentTurnStatus = "cancelled" | "completed" | "failed" | "running";

export type AgentTurn = {
  answer: string;
  error?: string;
  id: string;
  status: AgentTurnStatus;
  thought: string;
  user: string;
};

export type AgentTraceKind =
  | "assistant"
  | "context"
  | "system"
  | "tool"
  | "user";

export type AgentTraceRecord = {
  detail: {
    input?: string;
    output?: string;
    summary: string;
  };
  id: string;
  kind: AgentTraceKind;
  label: string;
  preview: string;
  time: string;
  turn: number;
};

export async function streamAgentTurn({
  editTurnId,
  input,
  onEvent,
  requestId,
  sessionId,
  signal,
}: {
  editTurnId?: string;
  input: string;
  onEvent: (event: AgentStreamEvent) => void;
  requestId: string;
  sessionId?: string;
  signal: AbortSignal;
}): Promise<void> {
  const response = await fetch(agentApiUrl("api/console/v1/agent/turns"), {
    body: JSON.stringify({
      ...(editTurnId ? { edit_turn_id: editTurnId } : {}),
      input,
      request_id: requestId,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
    headers: agentHeaders("text/event-stream", true),
    method: "POST",
    signal,
  });
  if (!(response.ok && response.body)) {
    throw new Error(await responseError(response));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const { frames, pending: nextPending } = decodeAgentSseFrames(pending);
    pending = nextPending;
    for (const frame of frames) {
      const event = decodeAgentStreamEvent(frame.data);
      onEvent(event);
      if (event.type === "turn_failed") {
        throw new Error(event.detail);
      }
      completed ||=
        event.type === "turn_completed" || event.type === "turn_cancelled";
    }
    if (done) {
      break;
    }
  }
  if (!(signal.aborted || completed)) {
    throw new Error("Agent stream ended before the Turn completed");
  }
}

export async function cancelAgentTurn(requestId: string): Promise<void> {
  const response = await fetch(
    agentApiUrl(
      `api/console/v1/agent/turns/${encodeURIComponent(requestId)}/cancel`
    ),
    {
      headers: agentHeaders("application/json", false),
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
}

export async function readAgentBootstrap(
  signal?: AbortSignal
): Promise<AgentBootstrap> {
  const response = await fetch(agentApiUrl("api/console/v1/agent/bootstrap"), {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return agentBootstrap(await response.json());
}

export async function readAgentToolPolicy(
  signal?: AbortSignal
): Promise<AgentToolPolicy> {
  const response = await fetch(
    agentApiUrl("api/console/v1/agent/control/tool-policy"),
    {
      headers: agentHeaders("application/json", false),
      ...(signal ? { signal } : {}),
    }
  );
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return agentToolPolicy(await response.json());
}

export async function updateAgentToolPolicy({
  allowed,
  expectedRevision,
}: {
  allowed: string[];
  expectedRevision: number;
}): Promise<AgentToolPolicy> {
  const response = await fetch(
    agentApiUrl("api/console/v1/agent/control/tool-policy"),
    {
      body: JSON.stringify({ allowed, expectedRevision }),
      headers: agentHeaders("application/json", true),
      method: "PUT",
    }
  );
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return agentToolPolicy(await response.json());
}

export async function listAgentSessions(
  signal?: AbortSignal
): Promise<AgentSessionSummary[]> {
  const response = await fetch(agentApiUrl("api/console/v1/agent/sessions"), {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const object = requiredObject(await response.json(), "Agent Session list");
  if (!Array.isArray(object.sessions)) {
    throw new TypeError("Agent Session list is missing sessions");
  }
  return object.sessions.map(agentSessionSummary);
}

export async function readAgentSession(
  sessionId: string,
  signal?: AbortSignal
): Promise<AgentSession> {
  const response = await fetch(
    agentApiUrl(
      `api/console/v1/agent/sessions/${encodeURIComponent(sessionId)}`
    ),
    {
      headers: agentHeaders("application/json", false),
      ...(signal ? { signal } : {}),
    }
  );
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return agentSession(await response.json());
}

export function projectAgentSession(session: AgentSession): {
  traces: AgentTraceRecord[];
  turns: AgentTurn[];
} {
  const turns = new Map<string, AgentTurn>();
  const turnNumbers = new Map<string, number>();
  const traces: AgentTraceRecord[] = [];
  for (const event of session.events) {
    const payload = jsonObject(event.payloadJson);
    const { turnId } = event;
    if (turnId && !turnNumbers.has(turnId)) {
      turnNumbers.set(turnId, turnNumbers.size + 1);
    }
    const turnNumber = turnId ? (turnNumbers.get(turnId) ?? 1) : 1;
    if (event.kind === "turn_started" && turnId) {
      const input = stringValue(payload.input);
      turns.set(turnId, {
        answer: "",
        id: turnId,
        status: "running",
        thought: "",
        user: input,
      });
    } else if (event.kind === "model_output" && turnId) {
      const turn = turns.get(turnId);
      if (turn) {
        turn.answer += stringValue(payload.text);
      }
    } else if (event.kind === "turn_completed" && turnId) {
      const turn = turns.get(turnId);
      if (turn) {
        turn.answer = stringValue(payload.output) || turn.answer;
        turn.status = "completed";
      }
    } else if (
      (event.kind === "turn_failed" || event.kind === "turn_cancelled") &&
      turnId
    ) {
      const turn = turns.get(turnId);
      if (turn) {
        turn.status = event.kind === "turn_cancelled" ? "cancelled" : "failed";
        if (event.kind === "turn_failed") {
          turn.error = stringValue(payload.error);
        }
      }
    }
    const trace = sessionEventTrace(event, payload, turnNumber);
    if (trace) {
      traces.push(trace);
    }
  }
  return { traces, turns: [...turns.values()] };
}

export function decodeAgentSseFrames(input: string): {
  frames: { data: string; event?: string; id?: string }[];
  pending: string;
} {
  const chunks = input.replaceAll("\r\n", "\n").split("\n\n");
  const pending = chunks.pop() ?? "";
  const frames = chunks.flatMap((chunk) => {
    const data: string[] = [];
    let event: string | undefined;
    let id: string | undefined;
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      } else if (line.startsWith("event:")) {
        event = line.slice(6).trimStart();
      } else if (line.startsWith("id:")) {
        id = line.slice(3).trimStart();
      }
    }
    return data.length > 0
      ? [
          {
            data: data.join("\n"),
            ...(event ? { event } : {}),
            ...(id ? { id } : {}),
          },
        ]
      : [];
  });
  return { frames, pending };
}

export function decodeAgentStreamEvent(data: string): AgentStreamEvent {
  return agentStreamEvent(JSON.parse(data));
}

function agentApiUrl(path: string) {
  const prefix = consoleApiPrefix();
  if (!prefix || prefix === "/") {
    return `/${path.replace(/^\/+/, "")}`;
  }
  return `${prefix}/${path.replace(/^\/+/, "")}`;
}

function agentHeaders(accept: string, json: boolean) {
  const headers = new Headers({ Accept: accept });
  if (json) {
    headers.set("Content-Type", "application/json");
  }
  const token = consoleApiAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function responseError(response: Response) {
  const fallback = `Agent API returned ${response.status}`;
  const body: unknown = await response.json().catch(() => undefined);
  return isObject(body) && typeof body.detail === "string"
    ? body.detail
    : fallback;
}

function agentStreamEvent(value: unknown): AgentStreamEvent {
  const object = requiredObject(value, "Agent stream event");
  if (object.type === "turn_message") {
    return {
      message: agentStreamMessage(object.message),
      type: "turn_message",
    };
  }
  if (object.type === "turn_completed" || object.type === "turn_cancelled") {
    return {
      ...(typeof object.session_id === "string"
        ? { sessionId: object.session_id }
        : {}),
      type: object.type,
    };
  }
  if (object.type === "turn_failed" && typeof object.detail === "string") {
    return { detail: object.detail, type: "turn_failed" };
  }
  throw new TypeError("Agent stream event has an unsupported shape");
}

function agentBootstrap(value: unknown): AgentBootstrap {
  const object = requiredObject(value, "Agent bootstrap");
  const capabilities = requiredObject(
    object.capabilities,
    "Agent bootstrap capabilities"
  );
  if (
    typeof capabilities.cancel !== "boolean" ||
    typeof capabilities.edit !== "boolean" ||
    typeof capabilities.sessionList !== "boolean" ||
    typeof capabilities.sessionRead !== "boolean"
  ) {
    throw new TypeError("Agent bootstrap capabilities are malformed");
  }
  const tools = requiredObject(object.tools, "Agent bootstrap tools");
  if (
    typeof object.mode !== "string" ||
    typeof object.profile !== "string" ||
    !Array.isArray(tools.allowed) ||
    !tools.allowed.every((tool) => typeof tool === "string") ||
    !Array.isArray(tools.available)
  ) {
    throw new TypeError("Agent bootstrap runtime policy is malformed");
  }
  return {
    capabilities: {
      cancel: capabilities.cancel,
      edit: capabilities.edit,
      sessionList: capabilities.sessionList,
      sessionRead: capabilities.sessionRead,
    },
    mode: object.mode,
    profile: object.profile,
    tools: {
      allowed: tools.allowed,
      available: tools.available.map(agentToolSummary),
    },
  };
}

function agentToolSummary(value: unknown): AgentToolSummary {
  const object = requiredObject(value, "Agent Tool summary");
  if (
    typeof object.description !== "string" ||
    typeof object.name !== "string"
  ) {
    throw new TypeError("Agent Tool summary is malformed");
  }
  return { description: object.description, name: object.name };
}

function agentToolPolicy(value: unknown): AgentToolPolicy {
  const object = requiredObject(value, "Agent Tool policy");
  if (
    object.schema !== "lenso.agent.tool-policy.v1" ||
    typeof object.revision !== "number" ||
    !Number.isSafeInteger(object.revision) ||
    object.revision < 0 ||
    !Array.isArray(object.allowed) ||
    !object.allowed.every((tool) => typeof tool === "string") ||
    !Array.isArray(object.available)
  ) {
    throw new TypeError("Agent Tool policy is malformed");
  }
  return {
    allowed: object.allowed,
    available: object.available.map(agentToolSummary),
    revision: object.revision,
    schema: object.schema,
  };
}

function agentSessionSummary(value: unknown): AgentSessionSummary {
  const object = requiredObject(value, "Agent Session summary");
  if (
    typeof object.revision !== "string" ||
    typeof object.sessionId !== "string" ||
    typeof object.title !== "string" ||
    typeof object.updatedAt !== "string"
  ) {
    throw new TypeError("Agent Session summary is malformed");
  }
  return {
    revision: object.revision,
    sessionId: object.sessionId,
    title: object.title,
    updatedAt: object.updatedAt,
  };
}

function agentStreamMessage(value: unknown): AgentStreamMessage {
  const object = requiredObject(value, "Agent stream message");
  if (typeof object.sequence !== "string" || typeof object.text !== "string") {
    throw new TypeError("Agent stream message is missing sequence or text");
  }
  const message: AgentStreamMessage = {
    sequence: object.sequence,
    text: object.text,
  };
  assignOptionalString(message, "kind", object.kind, agentMessageKinds);
  assignOptionalString(message, "sessionId", object.session_id);
  assignOptionalString(message, "reasoningId", object.reasoning_id);
  assignOptionalString(message, "toolCallId", object.tool_call_id);
  assignOptionalString(message, "toolName", object.tool_name);
  assignOptionalString(message, "argumentsJson", object.arguments_json);
  assignOptionalString(message, "content", object.content);
  assignOptionalString(message, "metadataJson", object.metadata_json);
  assignOptionalString(message, "durationMs", object.duration_ms);
  assignOptionalString(message, "error", object.error);
  return message;
}

const agentMessageKinds = new Set<AgentMessageKind>([
  "reasoning_completed",
  "reasoning_delta",
  "text_delta",
  "tool_completed",
  "tool_failed",
  "tool_progress",
  "tool_started",
]);

function agentSession(value: unknown): AgentSession {
  const object = requiredObject(value, "Agent Session");
  if (
    typeof object.session_id !== "string" ||
    typeof object.revision !== "string" ||
    !Array.isArray(object.events)
  ) {
    throw new TypeError(
      "Agent Session is missing identity, revision, or events"
    );
  }
  return {
    events: object.events.map(agentSessionEvent),
    revision: object.revision,
    sessionId: object.session_id,
  };
}

function agentSessionEvent(value: unknown): AgentSessionEvent {
  const object = requiredObject(value, "Agent Session event");
  if (
    typeof object.event_id !== "string" ||
    !sessionEventKinds.has(object.kind as AgentSessionEventKind) ||
    typeof object.occurred_at !== "string" ||
    typeof object.payload_json !== "string" ||
    typeof object.revision !== "string"
  ) {
    throw new TypeError("Agent Session event is malformed");
  }
  return {
    eventId: object.event_id,
    kind: object.kind as AgentSessionEventKind,
    occurredAt: object.occurred_at,
    payloadJson: object.payload_json,
    revision: object.revision,
    ...(typeof object.turn_id === "string" ? { turnId: object.turn_id } : {}),
  };
}

const sessionEventKinds = new Set<AgentSessionEventKind>([
  "model_output",
  "model_requested",
  "session_created",
  "system_instruction_installed",
  "tool_requested",
  "tool_result",
  "turn_cancelled",
  "turn_completed",
  "turn_failed",
  "turn_started",
]);

function sessionEventTrace(
  event: AgentSessionEvent,
  payload: Record<string, unknown>,
  turn: number
): AgentTraceRecord | undefined {
  const base = {
    id: event.eventId,
    time: event.occurredAt,
    turn,
  };
  switch (event.kind) {
    case "system_instruction_installed": {
      return {
        ...base,
        detail: { summary: "The resolved system instruction was installed." },
        kind: "system",
        label: "System instruction",
        preview: "Installed for this Session",
      };
    }
    case "turn_started": {
      const input = stringValue(payload.input);
      return {
        ...base,
        detail: { input, summary: "The operator submitted a message." },
        kind: "user",
        label: input,
        preview: input,
      };
    }
    case "model_requested": {
      return {
        ...base,
        detail: { summary: "The Agent requested the next model step." },
        kind: "context",
        label: "Model request",
        preview: `Step ${numberValue(payload.step) ?? 1}`,
      };
    }
    case "model_output": {
      const output = stringValue(payload.text);
      return {
        ...base,
        detail: { output, summary: "The model produced an output." },
        kind: "assistant",
        label: "Model output",
        preview: output,
      };
    }
    case "tool_requested": {
      const name = stringValue(payload.name) || "Tool";
      return {
        ...base,
        detail: {
          input: stringValue(payload.arguments_json),
          summary: "The Agent requested a Tool call.",
        },
        kind: "tool",
        label: name,
        preview: "Requested",
      };
    }
    case "tool_result": {
      const name = stringValue(payload.name) || "Tool";
      return {
        ...base,
        detail: {
          output: stringValue(payload.metadata_json),
          summary: "The Tool provider returned a result.",
        },
        kind: "tool",
        label: name,
        preview: "Completed",
      };
    }
    case "turn_completed": {
      return {
        ...base,
        detail: {
          output: stringValue(payload.output),
          summary: "The Agent Turn completed.",
        },
        kind: "assistant",
        label: "Turn completed",
        preview: stringValue(payload.output),
      };
    }
    case "turn_failed":
    case "turn_cancelled": {
      return {
        ...base,
        detail: { summary: stringValue(payload.error) || "The Turn stopped." },
        kind: "assistant",
        label: event.kind === "turn_failed" ? "Turn failed" : "Turn cancelled",
        preview: stringValue(payload.error),
      };
    }
    case "session_created": {
      return undefined;
    }
    default: {
      return undefined;
    }
  }
}

function jsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  return requiredObject(parsed, "Session event payload");
}

function requiredObject(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (!isObject(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function assignOptionalString<
  T extends Record<string, unknown>,
  K extends keyof T,
>(target: T, key: K, value: unknown, allowed?: ReadonlySet<string>) {
  if (typeof value === "string" && (!allowed || allowed.has(value))) {
    target[key] = value as T[K];
  }
}
