import { consoleApiPrefix } from "../../lib/http-client";

export type AgentId = string;
export const AGENT_PLUGIN_CONFIGURATION_CAPABILITY =
  "lenso.agent.plugin-configuration@1";

export type AgentIdentity = {
  capabilities: string[];
  id: AgentId;
  label: string;
  role: "app" | "console";
};

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
    contextSources: boolean;
    edit: boolean;
    profileSelection: boolean;
    sessionCompact: boolean;
    sessionList: boolean;
    sessionRead: boolean;
    sessionRename: boolean;
    taskSnapshot: boolean;
    terminalCommands: boolean;
    turnModelSelection: boolean;
    turnToolSelection: boolean;
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

export type AgentContextPrompt = {
  argumentsSchemaJson: string;
  description: string;
  name: string;
  source: string;
};

export type AgentContextResource = {
  description: string;
  mimeType: string;
  name: string;
  source: string;
  uri: string;
};

export type AgentContextCatalog = {
  prompts: AgentContextPrompt[];
  resources: AgentContextResource[];
};

export type AgentTerminalParameter = {
  description: string;
  id: string;
  kind: "flag" | "option" | "positional";
  multiple: boolean;
  required: boolean;
};

export type AgentTerminalCommand = {
  description: string;
  id: string;
  outputFormats: Array<"json" | "text">;
  parameters: AgentTerminalParameter[];
  path: string[];
  summary: string;
};

export type AgentTerminalCatalog = {
  commands: AgentTerminalCommand[];
};

export type AgentTerminalMessage = {
  content: string;
  contentType: "json" | "text";
  kind: "progress" | "result" | "stderr" | "stdout";
};

export type AgentTerminalEvent =
  | { type: "terminal_cancelled" }
  | { type: "terminal_completed" }
  | { detail: string; type: "terminal_failed" }
  | { message: AgentTerminalMessage; type: "terminal_message" };

export type AgentTerminalRun = {
  commandLine: string;
  error?: string;
  id: string;
  messages: AgentTerminalMessage[];
  status: "cancelled" | "completed" | "failed" | "running";
};

export type AgentModel = {
  displayName: string;
  hidden: boolean;
  id: string;
  reasoningEfforts: string[];
  selected: boolean;
  serviceTiers: string[];
};

export type AgentModelCatalog = {
  models: AgentModel[];
  selectedModel?: string;
  selectedReasoningEffort?: string;
  selectedServiceTier?: string;
};

export function modelsForSelector(
  catalog: AgentModelCatalog | undefined,
  selectedModel: string | undefined
) {
  if (!catalog) {
    return [];
  }
  const selectedId = selectedModel ?? catalog.selectedModel;
  return catalog.models.filter(
    (model) => !model.hidden || model.id === selectedId
  );
}

export type AgentTask = {
  agent: string;
  progress?: string;
  status: string;
  taskId: string;
  workspace: string;
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
  titleRevision?: string;
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
  resultContent?: string;
  resultTruncated?: boolean;
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
  allowedTools,
  editTurnId,
  input,
  model,
  onEvent,
  requestId,
  reasoningEffort,
  sessionId,
  signal,
  serviceTier,
  targetId = "console",
}: {
  allowedTools?: string[];
  editTurnId?: string;
  input: string;
  model?: string;
  onEvent: (event: AgentStreamEvent) => void;
  requestId: string;
  reasoningEffort?: string;
  sessionId?: string;
  signal: AbortSignal;
  serviceTier?: string;
  targetId?: AgentId;
}): Promise<void> {
  const response = await fetch(agentApiUrl(targetId, "turns"), {
    body: JSON.stringify({
      ...(allowedTools ? { allowed_tools: allowedTools } : {}),
      ...(editTurnId ? { edit_turn_id: editTurnId } : {}),
      input,
      ...(model ? { model } : {}),
      request_id: requestId,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(serviceTier ? { service_tier: serviceTier } : {}),
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

export async function cancelAgentTurn(
  requestId: string,
  targetId: AgentId = "console"
): Promise<void> {
  const response = await fetch(
    agentApiUrl(targetId, `turns/${encodeURIComponent(requestId)}/cancel`),
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
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentPendingInteraction[]> {
  const response = await fetch(
    agentApiUrl(
      targetId,
      `turns/${encodeURIComponent(requestId)}/interactions`
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
  targetId = "console",
}: {
  answers: AgentInteractionAnswer[];
  interactionId: string;
  requestId: string;
  targetId?: AgentId;
}): Promise<void> {
  const response = await fetch(
    agentApiUrl(
      targetId,
      `turns/${encodeURIComponent(requestId)}/interactions/${encodeURIComponent(interactionId)}/answer`
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
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentBootstrap> {
  const response = await fetch(agentApiUrl(targetId, "bootstrap"), {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return agentBootstrap(await response.json());
}

export async function readAgentModels(
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentModelCatalog> {
  const response = await fetch(agentApiUrl(targetId, "models"), {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return agentModelCatalog(await response.json());
}

export async function readAgentContextSources(
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentContextCatalog> {
  const response = await fetch(agentApiUrl(targetId, "context-sources"), {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const object = requiredObject(await response.json(), "Agent Context catalog");
  if (!(Array.isArray(object.prompts) && Array.isArray(object.resources))) {
    throw new TypeError("Agent Context catalog is malformed");
  }
  return {
    prompts: object.prompts.map(agentContextPrompt),
    resources: object.resources.map(agentContextResource),
  };
}

export async function readAgentTerminalCatalog(
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentTerminalCatalog> {
  const response = await fetch(agentApiUrl(targetId, "terminal/commands"), {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const object = requiredObject(
    await response.json(),
    "Agent Terminal catalog"
  );
  if (!Array.isArray(object.commands)) {
    throw new TypeError("Agent Terminal catalog is malformed");
  }
  return { commands: object.commands.map(agentTerminalCommand) };
}

export async function streamAgentTerminal({
  commandLine,
  onEvent,
  requestId,
  signal,
  targetId = "console",
}: {
  commandLine: string;
  onEvent: (event: AgentTerminalEvent) => void;
  requestId: string;
  signal: AbortSignal;
  targetId?: AgentId;
}): Promise<void> {
  const response = await fetch(agentApiUrl(targetId, "terminal/executions"), {
    body: JSON.stringify({ commandLine, requestId }),
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
      const event = agentTerminalEvent(JSON.parse(frame.data));
      onEvent(event);
      if (event.type === "terminal_failed") {
        throw new Error(event.detail);
      }
      completed ||=
        event.type === "terminal_completed" ||
        event.type === "terminal_cancelled";
    }
    if (done) {
      break;
    }
  }
  if (!(signal.aborted || completed)) {
    throw new Error("Terminal stream ended before the command completed");
  }
}

export async function cancelAgentTerminal(
  requestId: string,
  targetId: AgentId = "console"
): Promise<void> {
  const response = await fetch(
    agentApiUrl(
      targetId,
      `terminal/executions/${encodeURIComponent(requestId)}/cancel`
    ),
    { headers: agentHeaders("application/json", false), method: "POST" }
  );
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
}

export async function readAgentTasks(
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentTask[]> {
  const response = await fetch(agentApiUrl(targetId, "tasks"), {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const object = requiredObject(await response.json(), "Agent task snapshot");
  if (!Array.isArray(object.tasks)) {
    throw new TypeError("Agent task snapshot is missing tasks");
  }
  return object.tasks.map(agentTask);
}

export async function compactAgentSession(
  sessionId: string,
  targetId: AgentId = "console"
): Promise<void> {
  const response = await fetch(
    agentApiUrl(targetId, `sessions/${encodeURIComponent(sessionId)}/compact`),
    { headers: agentHeaders("application/json", false), method: "POST" }
  );
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
}

export async function renameAgentSession({
  expectedTitleRevision,
  sessionId,
  targetId = "console",
  title,
}: {
  expectedTitleRevision: string;
  sessionId: string;
  targetId?: AgentId;
  title: string;
}): Promise<{ title: string; titleRevision: string }> {
  const response = await fetch(
    agentApiUrl(targetId, `sessions/${encodeURIComponent(sessionId)}`),
    {
      body: JSON.stringify({ expectedTitleRevision, title }),
      headers: agentHeaders("application/json", true),
      method: "PATCH",
    }
  );
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const object = requiredObject(await response.json(), "Agent Session rename");
  if (
    typeof object.title !== "string" ||
    typeof object.titleRevision !== "string"
  ) {
    throw new TypeError("Agent Session rename response is malformed");
  }
  return { title: object.title, titleRevision: object.titleRevision };
}

export async function selectAgentProfile(
  profile: string | undefined,
  targetId: AgentId = "console"
): Promise<string | undefined> {
  const response = await fetch(agentApiUrl(targetId, "control/profile"), {
    body: JSON.stringify({ profile: profile ?? null }),
    headers: agentHeaders("application/json", true),
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const object = requiredObject(
    await response.json(),
    "Agent Profile selection"
  );
  if (!(object.profile === null || typeof object.profile === "string")) {
    throw new TypeError("Agent Profile selection response is malformed");
  }
  return typeof object.profile === "string" ? object.profile : undefined;
}

export async function readAgentToolPolicy(
  signal?: AbortSignal
): Promise<AgentToolPolicy> {
  const response = await fetch(agentApiUrl("console", "control/tool-policy"), {
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
  const response = await fetch(agentApiUrl("console", "control/tool-policy"), {
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
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentSessionSummary[]> {
  const response = await fetch(agentApiUrl(targetId, "sessions"), {
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
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentSession> {
  const response = await fetch(
    agentApiUrl(targetId, `sessions/${encodeURIComponent(sessionId)}`),
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
  signal?: AbortSignal,
  targetId: AgentId = "console"
): Promise<AgentTrajectory> {
  const response = await fetch(
    agentApiUrl(
      targetId,
      `sessions/${encodeURIComponent(sessionId)}/trajectory`
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
  const result = boundedToolResult(
    stringValue(payload.content),
    payload.content_truncated === true
  );
  if (result.content) {
    completed.resultContent = result.content;
  }
  if (result.truncated) {
    completed.resultTruncated = true;
  }
  if (!existing) {
    tools.push(completed);
  }
}

export const MAX_TOOL_RESULT_CONTENT_CHARS = 32_768;

export function boundedToolResult(content: string, alreadyTruncated = false) {
  const truncated =
    alreadyTruncated || content.length > MAX_TOOL_RESULT_CONTENT_CHARS;
  return {
    content: content.slice(0, MAX_TOOL_RESULT_CONTENT_CHARS),
    truncated,
  };
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

export async function listAgents(
  signal?: AbortSignal
): Promise<AgentIdentity[]> {
  const response = await fetch(consoleApiUrl("api/console/v1/agents"), {
    headers: agentHeaders("application/json", false),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const object = requiredObject(await response.json(), "Agent catalog");
  if (!Array.isArray(object.agents)) {
    throw new TypeError("Agent catalog is missing agents");
  }
  return object.agents.map(agentIdentity);
}

function agentApiUrl(agentId: AgentId, path: string) {
  const targetPath =
    agentId === "console"
      ? "api/console/v1/agent"
      : `api/console/v1/agents/${encodeURIComponent(agentId)}`;
  return consoleApiUrl(`${targetPath}/${path.replace(/^\/+/, "")}`);
}

function consoleApiUrl(path: string) {
  const prefix = consoleApiPrefix();
  if (!prefix || prefix === "/") {
    return `/${path.replace(/^\/+/, "")}`;
  }
  return `${prefix}/${path.replace(/^\/+/, "")}`;
}

function agentIdentity(value: unknown): AgentIdentity {
  const object = requiredObject(value, "Agent identity");
  const { capabilities, id, label, role } = object;
  if (
    !Array.isArray(capabilities) ||
    capabilities.some(
      (capability) => typeof capability !== "string" || !capability
    ) ||
    typeof id !== "string" ||
    !/^[a-z][a-z0-9._-]{0,63}$/u.test(id) ||
    (role !== "app" && role !== "console") ||
    (role === "console" && id !== "console") ||
    typeof label !== "string" ||
    label.trim().length === 0
  ) {
    throw new TypeError("Agent identity is malformed");
  }
  return { capabilities, id, label, role };
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
      contextSources: capabilities.contextSources === true,
      edit: capabilities.edit,
      profileSelection: capabilities.profileSelection === true,
      sessionCompact: capabilities.sessionCompact === true,
      sessionList: capabilities.sessionList,
      sessionRead: capabilities.sessionRead,
      sessionRename: capabilities.sessionRename === true,
      taskSnapshot: capabilities.taskSnapshot === true,
      terminalCommands: capabilities.terminalCommands === true,
      turnModelSelection: capabilities.turnModelSelection === true,
      turnToolSelection: capabilities.turnToolSelection === true,
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

function agentContextPrompt(value: unknown): AgentContextPrompt {
  const object = requiredObject(value, "Agent Context Prompt");
  if (
    typeof object.arguments_schema_json !== "string" ||
    typeof object.description !== "string" ||
    typeof object.name !== "string" ||
    typeof object.source !== "string"
  ) {
    throw new TypeError("Agent Context Prompt is malformed");
  }
  return {
    argumentsSchemaJson: object.arguments_schema_json,
    description: object.description,
    name: object.name,
    source: object.source,
  };
}

function agentContextResource(value: unknown): AgentContextResource {
  const object = requiredObject(value, "Agent Context Resource");
  if (
    typeof object.description !== "string" ||
    typeof object.mime_type !== "string" ||
    typeof object.name !== "string" ||
    typeof object.source !== "string" ||
    typeof object.uri !== "string"
  ) {
    throw new TypeError("Agent Context Resource is malformed");
  }
  return {
    description: object.description,
    mimeType: object.mime_type,
    name: object.name,
    source: object.source,
    uri: object.uri,
  };
}

function agentTerminalCommand(value: unknown): AgentTerminalCommand {
  const object = requiredObject(value, "Agent Terminal command");
  if (
    typeof object.description !== "string" ||
    typeof object.id !== "string" ||
    !Array.isArray(object.output_formats) ||
    !object.output_formats.every(
      (format) => format === "json" || format === "text"
    ) ||
    !Array.isArray(object.parameters) ||
    !Array.isArray(object.path) ||
    !object.path.every((segment) => typeof segment === "string") ||
    typeof object.summary !== "string"
  ) {
    throw new TypeError("Agent Terminal command is malformed");
  }
  return {
    description: object.description,
    id: object.id,
    outputFormats: object.output_formats,
    parameters: object.parameters.map(agentTerminalParameter),
    path: object.path,
    summary: object.summary,
  };
}

function agentTerminalParameter(value: unknown): AgentTerminalParameter {
  const object = requiredObject(value, "Agent Terminal parameter");
  if (
    typeof object.description !== "string" ||
    typeof object.id !== "string" ||
    (object.kind !== "flag" &&
      object.kind !== "option" &&
      object.kind !== "positional") ||
    typeof object.multiple !== "boolean" ||
    typeof object.required !== "boolean"
  ) {
    throw new TypeError("Agent Terminal parameter is malformed");
  }
  return {
    description: object.description,
    id: object.id,
    kind: object.kind,
    multiple: object.multiple,
    required: object.required,
  };
}

function agentTerminalEvent(value: unknown): AgentTerminalEvent {
  const object = requiredObject(value, "Agent Terminal event");
  if (
    object.type === "terminal_completed" ||
    object.type === "terminal_cancelled"
  ) {
    return { type: object.type };
  }
  if (object.type === "terminal_failed" && typeof object.detail === "string") {
    return { detail: object.detail, type: "terminal_failed" };
  }
  if (object.type === "terminal_message") {
    return {
      message: agentTerminalMessage(object.message),
      type: "terminal_message",
    };
  }
  throw new TypeError("Agent Terminal event has an unsupported shape");
}

function agentTerminalMessage(value: unknown): AgentTerminalMessage {
  const object = requiredObject(value, "Agent Terminal message");
  if (
    typeof object.content !== "string" ||
    (object.content_type !== "json" && object.content_type !== "text") ||
    (object.kind !== "progress" &&
      object.kind !== "result" &&
      object.kind !== "stderr" &&
      object.kind !== "stdout")
  ) {
    throw new TypeError("Agent Terminal message is malformed");
  }
  return {
    content: object.content,
    contentType: object.content_type,
    kind: object.kind,
  };
}

function agentModelCatalog(value: unknown): AgentModelCatalog {
  const object = requiredObject(value, "Agent Model catalog");
  const resolved = object.resolved_turn_profile;
  if (!Array.isArray(object.providers)) {
    throw new TypeError("Agent Model catalog is missing providers");
  }
  const profile =
    resolved === null || resolved === undefined
      ? undefined
      : requiredObject(resolved, "Agent resolved Turn profile");
  const providers = profile
    ? object.providers.filter((providerValue) => {
        const provider = requiredObject(providerValue, "Agent Model provider");
        return provider.selected_instance === profile.provider_instance;
      })
    : object.providers;
  const models = providers.flatMap((providerValue) => {
    const provider = requiredObject(providerValue, "Agent Model provider");
    if (!Array.isArray(provider.models)) {
      throw new TypeError("Agent Model provider is missing models");
    }
    return provider.models.map(agentModel);
  });
  if (!profile) {
    return { models };
  }
  return {
    models,
    ...(typeof profile.model === "string"
      ? { selectedModel: profile.model }
      : {}),
    ...(typeof profile.reasoning_effort === "string"
      ? { selectedReasoningEffort: profile.reasoning_effort }
      : {}),
    ...(typeof profile.service_tier === "string"
      ? { selectedServiceTier: profile.service_tier }
      : {}),
  };
}

function agentModel(value: unknown): AgentModel {
  const object = requiredObject(value, "Agent Model");
  const capabilities = requiredObject(
    object.capabilities,
    "Agent Model capabilities"
  );
  if (
    typeof object.id !== "string" ||
    typeof object.hidden !== "boolean" ||
    typeof object.selected !== "boolean"
  ) {
    throw new TypeError("Agent Model is malformed");
  }
  return {
    displayName:
      typeof object.display_name === "string" && object.display_name
        ? object.display_name
        : object.id,
    hidden: object.hidden,
    id: object.id,
    reasoningEfforts: selectableValues(capabilities.reasoning, "efforts"),
    selected: object.selected,
    serviceTiers: selectableValues(capabilities.service_tiers, "tiers"),
  };
}

function selectableValues(value: unknown, field: "efforts" | "tiers") {
  const object = requiredObject(value, `Agent Model ${field}`);
  return object.kind === "selectable" && Array.isArray(object[field])
    ? object[field].filter((item): item is string => typeof item === "string")
    : [];
}

function agentTask(value: unknown): AgentTask {
  const object = requiredObject(value, "Agent task");
  const { progress } = object;
  if (
    typeof object.agent !== "string" ||
    typeof object.status !== "string" ||
    typeof object.task_id !== "string" ||
    typeof object.workspace !== "string"
  ) {
    throw new TypeError("Agent task is malformed");
  }
  return {
    agent: object.agent,
    ...(isObject(progress) && typeof progress.content === "string"
      ? { progress: progress.content }
      : {}),
    status: object.status,
    taskId: object.task_id,
    workspace: object.workspace,
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
    ...(typeof object.titleRevision === "string"
      ? { titleRevision: object.titleRevision }
      : {}),
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
