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
    userInteraction: boolean;
  };
  mode: string;
  profile: string;
  trajectory: "lenso.agent.trajectory@1";
  tools: {
    allowed: string[];
    available: AgentToolSummary[];
  };
};

export type AgentInteractionOption = {
  description: string;
  label: string;
  optionId: string;
  preview?: string;
};

export type AgentInteractionQuestion = {
  header: string;
  multiSelect: boolean;
  options: AgentInteractionOption[];
  prompt: string;
  questionId: string;
};

export type AgentPendingInteraction = {
  interactionId: string;
  questions: AgentInteractionQuestion[];
};

export type AgentInteractionAnswer = {
  other?: string;
  questionId: string;
  selectedOptionIds: string[];
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
  | "context_compaction_committed"
  | "context_compaction_failed"
  | "context_compaction_started"
  | "memory_commit_failed"
  | "memory_committed"
  | "memory_recall_failed"
  | "memory_recalled"
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

export type AgentToolCall = {
  argumentsJson?: string;
  callId: string;
  error?: string;
  metadataJson?: string;
  name: string;
  status: "completed" | "failed" | "not_run" | "running";
};

export type AgentTurn = {
  answer: string;
  error?: string;
  id: string;
  status: AgentTurnStatus;
  thought: string;
  tools?: AgentToolCall[];
  user: string;
  work?: {
    durationMs?: number;
  };
};

export type AgentTrajectoryStatus =
  | "cancelled"
  | "completed"
  | "failed"
  | "idle"
  | "running";

export type AgentTrajectoryKind =
  | "compaction"
  | "memory"
  | "model"
  | "system"
  | "tool"
  | "user";

export type AgentTrajectoryRecord = {
  completedAt?: string;
  detail: {
    input?: string;
    metadataJson?: string;
    model?: string;
    output?: string;
    summary: string;
    systemInstructionDigest?: string;
    toolCallId?: string;
    toolName?: string;
  };
  durationMs?: number;
  id: string;
  inputTokens?: number;
  kind: AgentTrajectoryKind;
  label: string;
  outputTokens?: number;
  preview: string;
  sourceEventIds: string[];
  startedAt: string;
  status: AgentTrajectoryStatus;
  step?: number;
  timeToFirstTokenMs?: number;
  turn: number;
};

export type AgentTrajectory = {
  records: AgentTrajectoryRecord[];
  revision: number;
  schema: "lenso.agent.trajectory@1";
  sessionId: string;
  summary: {
    durationMs?: number;
    failedOperations: number;
    inputTokens: number;
    modelCalls: number;
    outputTokens: number;
    startedAt?: string;
    status: AgentTrajectoryStatus;
    toolCalls: number;
    turns: number;
    updatedAt?: string;
  };
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

export async function readPendingAgentInteractions(
  requestId: string,
  signal?: AbortSignal
): Promise<AgentPendingInteraction[]> {
  const response = await fetch(
    agentApiUrl(
      `api/console/v1/agent/turns/${encodeURIComponent(requestId)}/interactions`
    ),
    {
      headers: agentHeaders("application/json", false),
      ...(signal ? { signal } : {}),
    }
  );
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const object = requiredObject(
    await response.json(),
    "Agent pending interactions"
  );
  if (!Array.isArray(object.interactions)) {
    throw new TypeError("Agent pending interactions are malformed");
  }
  return object.interactions.map(agentPendingInteraction);
}

export async function answerAgentInteraction({
  answers,
  interactionId,
  requestId,
}: {
  answers: AgentInteractionAnswer[];
  interactionId: string;
  requestId: string;
}): Promise<void> {
  const response = await fetch(
    agentApiUrl(
      `api/console/v1/agent/turns/${encodeURIComponent(requestId)}/interactions/${encodeURIComponent(interactionId)}/answer`
    ),
    {
      body: JSON.stringify({ answers }),
      headers: agentHeaders("application/json", true),
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
  const response = await fetch("/api/console/v1/agent/control/tool-policy", {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
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
  const response = await fetch("/api/console/v1/agent/control/tool-policy", {
    body: JSON.stringify({ allowed, expectedRevision }),
    headers: agentHeaders("application/json", true),
    method: "PUT",
  });
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

export async function readAgentTrajectory(
  sessionId: string,
  signal?: AbortSignal
): Promise<AgentTrajectory> {
  const response = await fetch(
    agentApiUrl(
      `api/console/v1/agent/sessions/${encodeURIComponent(sessionId)}/trajectory`
    ),
    {
      headers: agentHeaders("application/json", false),
      ...(signal ? { signal } : {}),
    }
  );
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return agentTrajectory(await response.json());
}

export function projectAgentSession(session: AgentSession): {
  turns: AgentTurn[];
} {
  const turns = new Map<string, AgentTurn>();
  const turnStartedAt = new Map<string, number>();
  for (const event of session.events) {
    const payload = jsonObject(event.payloadJson);
    const { turnId } = event;
    if (event.kind === "turn_started" && turnId) {
      const input = stringValue(payload.input);
      turnStartedAt.set(turnId, Date.parse(event.occurredAt));
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
    } else if (
      (event.kind === "tool_requested" || event.kind === "tool_result") &&
      turnId
    ) {
      const turn = turns.get(turnId);
      if (turn) {
        turn.work ??= {};
        projectToolEvent(turn, event, payload);
      }
    } else if (event.kind === "turn_completed" && turnId) {
      const turn = turns.get(turnId);
      if (turn) {
        turn.answer = stringValue(payload.output) || turn.answer;
        turn.status = "completed";
        assignWorkDuration(turn, turnStartedAt.get(turnId), event.occurredAt);
      }
    } else if (
      (event.kind === "turn_failed" || event.kind === "turn_cancelled") &&
      turnId
    ) {
      const turn = turns.get(turnId);
      if (turn) {
        turn.status = event.kind === "turn_cancelled" ? "cancelled" : "failed";
        assignWorkDuration(turn, turnStartedAt.get(turnId), event.occurredAt);
        if (event.kind === "turn_failed") {
          turn.error = stringValue(payload.error);
        }
      }
    }
  }
  for (const turn of turns.values()) {
    if (!turn.tools?.length) {
      const attempt = unexecutedToolAttempt(turn.answer, turn.id);
      if (attempt) {
        turn.answer = "";
        turn.tools = [attempt];
      }
    }
  }
  return { turns: [...turns.values()] };
}

function projectToolEvent(
  turn: AgentTurn,
  event: AgentSessionEvent,
  payload: Record<string, unknown>
) {
  const callId = stringValue(payload.call_id) || event.eventId;
  const tools = (turn.tools ??= []);
  const existing = tools.find((tool) => tool.callId === callId);
  if (event.kind === "tool_requested") {
    const requested: AgentToolCall = {
      callId,
      name: stringValue(payload.name) || "Tool",
      status: "running",
      ...(stringValue(payload.arguments_json)
        ? { argumentsJson: stringValue(payload.arguments_json) }
        : {}),
    };
    if (existing) {
      Object.assign(existing, requested);
    } else {
      tools.push(requested);
    }
    return;
  }
  const completed = existing ?? {
    callId,
    name: stringValue(payload.name) || "Tool",
    status: "running" as const,
  };
  completed.name = stringValue(payload.name) || completed.name;
  completed.status = "completed";
  const metadataJson = stringValue(payload.metadata_json);
  if (metadataJson) {
    completed.metadataJson = metadataJson;
  }
  if (!existing) {
    tools.push(completed);
  }
}

function unexecutedToolAttempt(
  answer: string,
  turnId: string
): AgentToolCall | undefined {
  const match = /^\s*to=([A-Za-z0-9_.-]+)\s+\([^\n)]*\)\s+code:\s*/.exec(
    answer
  );
  if (!match) {
    const skillClaim = /^\s*已调用\s+`([^`]+)`\s+技能[。.]?\s*$/.exec(answer);
    if (!skillClaim) {
      return undefined;
    }
    return {
      argumentsJson: JSON.stringify({ name: skillClaim[1] }),
      callId: `unexecuted:${turnId}`,
      error: "No Tool event was recorded for this request.",
      name: "skill",
      status: "not_run",
    };
  }
  const argumentsJson = leadingJsonObject(answer.slice(match[0].length));
  return {
    ...(argumentsJson ? { argumentsJson } : {}),
    callId: `unexecuted:${turnId}`,
    error: "No Tool event was recorded for this request.",
    name: match[1] ?? "Tool",
    status: "not_run",
  };
}

function leadingJsonObject(value: string) {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }
  let depth = 0;
  let escaped = false;
  let quoted = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(0, index + 1);
      }
    }
  }
  return undefined;
}

function assignWorkDuration(
  turn: AgentTurn,
  startedAt: number | undefined,
  endedAt: string
) {
  if (!turn.work || startedAt === undefined) {
    return;
  }
  const durationMs = Date.parse(endedAt) - startedAt;
  if (Number.isFinite(durationMs) && durationMs >= 0) {
    turn.work.durationMs = durationMs;
  }
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
  return `/${path.replace(/^\/+/, "")}`;
}

function agentHeaders(accept: string, json: boolean) {
  const headers = new Headers({ Accept: accept });
  if (json) {
    headers.set("Content-Type", "application/json");
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
    typeof capabilities.sessionRead !== "boolean" ||
    typeof capabilities.userInteraction !== "boolean"
  ) {
    throw new TypeError("Agent bootstrap capabilities are malformed");
  }
  const tools = requiredObject(object.tools, "Agent bootstrap tools");
  if (
    typeof object.mode !== "string" ||
    typeof object.profile !== "string" ||
    object.trajectory !== "lenso.agent.trajectory@1" ||
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
      userInteraction: capabilities.userInteraction,
    },
    mode: object.mode,
    profile: object.profile,
    trajectory: object.trajectory,
    tools: {
      allowed: tools.allowed,
      available: tools.available.map(agentToolSummary),
    },
  };
}

function agentPendingInteraction(value: unknown): AgentPendingInteraction {
  const object = requiredObject(value, "Agent pending interaction");
  if (
    typeof object.interactionId !== "string" ||
    !Array.isArray(object.questions)
  ) {
    throw new TypeError("Agent pending interaction is malformed");
  }
  return {
    interactionId: object.interactionId,
    questions: object.questions.map(agentInteractionQuestion),
  };
}

function agentInteractionQuestion(value: unknown): AgentInteractionQuestion {
  const object = requiredObject(value, "Agent interaction question");
  if (
    typeof object.header !== "string" ||
    typeof object.multiSelect !== "boolean" ||
    !Array.isArray(object.options) ||
    typeof object.prompt !== "string" ||
    typeof object.questionId !== "string"
  ) {
    throw new TypeError("Agent interaction question is malformed");
  }
  return {
    header: object.header,
    multiSelect: object.multiSelect,
    options: object.options.map(agentInteractionOption),
    prompt: object.prompt,
    questionId: object.questionId,
  };
}

function agentInteractionOption(value: unknown): AgentInteractionOption {
  const object = requiredObject(value, "Agent interaction option");
  if (
    typeof object.description !== "string" ||
    typeof object.label !== "string" ||
    typeof object.optionId !== "string" ||
    !(object.preview === null || typeof object.preview === "string")
  ) {
    throw new TypeError("Agent interaction option is malformed");
  }
  return {
    description: object.description,
    label: object.label,
    optionId: object.optionId,
    ...(typeof object.preview === "string" ? { preview: object.preview } : {}),
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
  "context_compaction_committed",
  "context_compaction_failed",
  "context_compaction_started",
  "memory_commit_failed",
  "memory_committed",
  "memory_recall_failed",
  "memory_recalled",
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

const trajectoryStatuses = new Set<AgentTrajectoryStatus>([
  "cancelled",
  "completed",
  "failed",
  "idle",
  "running",
]);

const trajectoryKinds = new Set<AgentTrajectoryKind>([
  "compaction",
  "memory",
  "model",
  "system",
  "tool",
  "user",
]);

function agentTrajectory(value: unknown): AgentTrajectory {
  const object = requiredObject(value, "Agent Trajectory");
  const summary = requiredObject(object.summary, "Agent Trajectory summary");
  if (
    object.schema !== "lenso.agent.trajectory@1" ||
    typeof object.sessionId !== "string" ||
    !validMetric(object.revision) ||
    !Array.isArray(object.records) ||
    !trajectoryStatuses.has(summary.status as AgentTrajectoryStatus) ||
    !validMetric(summary.turns) ||
    !validMetric(summary.modelCalls) ||
    !validMetric(summary.toolCalls) ||
    !validMetric(summary.failedOperations) ||
    !validMetric(summary.inputTokens) ||
    !validMetric(summary.outputTokens) ||
    !validOptionalMetric(summary.durationMs) ||
    !validOptionalString(summary.startedAt) ||
    !validOptionalString(summary.updatedAt)
  ) {
    throw new TypeError("Agent Trajectory is malformed");
  }
  return {
    records: object.records.map(agentTrajectoryRecord),
    revision: object.revision,
    schema: object.schema,
    sessionId: object.sessionId,
    summary: {
      failedOperations: summary.failedOperations,
      inputTokens: summary.inputTokens,
      modelCalls: summary.modelCalls,
      outputTokens: summary.outputTokens,
      status: summary.status as AgentTrajectoryStatus,
      toolCalls: summary.toolCalls,
      turns: summary.turns,
      ...(validMetric(summary.durationMs)
        ? { durationMs: summary.durationMs }
        : {}),
      ...(typeof summary.startedAt === "string"
        ? { startedAt: summary.startedAt }
        : {}),
      ...(typeof summary.updatedAt === "string"
        ? { updatedAt: summary.updatedAt }
        : {}),
    },
  };
}

function agentTrajectoryRecord(value: unknown): AgentTrajectoryRecord {
  const object = requiredObject(value, "Agent Trajectory record");
  const detail = requiredObject(object.detail, "Agent Trajectory detail");
  if (
    typeof object.id !== "string" ||
    !validMetric(object.turn) ||
    !trajectoryKinds.has(object.kind as AgentTrajectoryKind) ||
    !trajectoryStatuses.has(object.status as AgentTrajectoryStatus) ||
    typeof object.label !== "string" ||
    typeof object.preview !== "string" ||
    typeof object.startedAt !== "string" ||
    typeof detail.summary !== "string" ||
    !Array.isArray(object.sourceEventIds) ||
    !object.sourceEventIds.every((id) => typeof id === "string") ||
    ![
      object.completedAt,
      detail.input,
      detail.metadataJson,
      detail.model,
      detail.output,
      detail.systemInstructionDigest,
      detail.toolCallId,
      detail.toolName,
    ].every(validOptionalString) ||
    ![
      object.durationMs,
      object.inputTokens,
      object.outputTokens,
      object.step,
      object.timeToFirstTokenMs,
    ].every(validOptionalMetric)
  ) {
    throw new TypeError("Agent Trajectory record is malformed");
  }
  return {
    detail: {
      summary: detail.summary,
      ...optionalString("input", detail.input),
      ...optionalString("metadataJson", detail.metadataJson),
      ...optionalString("model", detail.model),
      ...optionalString("output", detail.output),
      ...optionalString(
        "systemInstructionDigest",
        detail.systemInstructionDigest
      ),
      ...optionalString("toolCallId", detail.toolCallId),
      ...optionalString("toolName", detail.toolName),
    },
    id: object.id,
    kind: object.kind as AgentTrajectoryKind,
    label: object.label,
    preview: object.preview,
    sourceEventIds: object.sourceEventIds,
    startedAt: object.startedAt,
    status: object.status as AgentTrajectoryStatus,
    turn: object.turn,
    ...optionalString("completedAt", object.completedAt),
    ...optionalMetric("durationMs", object.durationMs),
    ...optionalMetric("inputTokens", object.inputTokens),
    ...optionalMetric("outputTokens", object.outputTokens),
    ...optionalMetric("step", object.step),
    ...optionalMetric("timeToFirstTokenMs", object.timeToFirstTokenMs),
  };
}

function validMetric(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validOptionalMetric(value: unknown) {
  return value === undefined || validMetric(value);
}

function validOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function optionalMetric<K extends string>(key: K, value: unknown) {
  return validMetric(value) ? ({ [key]: value } as Record<K, number>) : {};
}

function optionalString<K extends string>(key: K, value: unknown) {
  return typeof value === "string"
    ? ({ [key]: value } as Record<K, string>)
    : {};
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

function assignOptionalString<
  T extends Record<string, unknown>,
  K extends keyof T,
>(target: T, key: K, value: unknown, allowed?: ReadonlySet<string>) {
  if (typeof value === "string" && (!allowed || allowed.has(value))) {
    target[key] = value as T[K];
  }
}
