import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  cancelAgentTurn,
  projectAgentSession,
  readAgentBootstrap,
  readAgentSession,
  streamAgentTurn,
  type AgentStreamMessage,
  type AgentStreamEvent,
  type AgentToolCall,
  type AgentTraceRecord,
  type AgentTurn,
} from "./agent-runtime";

type ActiveTurn = {
  controller: AbortController;
  requestId: string;
};

export function useAgentConversation({
  initialSessionId,
  onSessionResolved,
}: {
  initialSessionId?: string | undefined;
  onSessionResolved?: ((sessionId: string) => void) | undefined;
} = {}) {
  const [draft, setDraft] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [editingTurnId, setEditingTurnId] = useState<string>();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [traces, setTraces] = useState<AgentTraceRecord[]>([]);
  const [runtimeError, setRuntimeError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const activeTurn = useRef<ActiveTurn | undefined>(undefined);
  const sessionIdRef = useRef(initialSessionId);
  const onSessionResolvedRef = useRef(onSessionResolved);

  useEffect(() => {
    onSessionResolvedRef.current = onSessionResolved;
  }, [onSessionResolved]);

  useEffect(() => {
    const controller = new AbortController();
    const loadBootstrap = async () => {
      try {
        const bootstrap = await readAgentBootstrap(controller.signal);
        setCanCancel(bootstrap.capabilities.cancel);
        setCanEdit(bootstrap.capabilities.edit);
      } catch {
        if (!controller.signal.aborted) {
          setCanCancel(false);
          setCanEdit(false);
        }
      }
    };
    void loadBootstrap();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    activeTurn.current?.controller.abort();
    activeTurn.current = undefined;
    setIsRunning(false);
    sessionIdRef.current = initialSessionId;
    setSessionId(initialSessionId);
    setDraft("");
    setEditingTurnId(undefined);
    setTurns([]);
    setTraces([]);
    setRuntimeError(undefined);
    if (!initialSessionId) {
      return;
    }
    const controller = new AbortController();
    const loadSession = async () => {
      try {
        const session = await readAgentSession(
          initialSessionId,
          controller.signal
        );
        const projection = projectAgentSession(session);
        setTurns(projection.turns);
        setTraces(projection.traces);
      } catch (error) {
        if (!controller.signal.aborted) {
          setRuntimeError(errorMessage(error));
        }
      }
    };
    void loadSession();
    return () => controller.abort();
  }, [initialSessionId]);

  useEffect(
    () => () => {
      activeTurn.current?.controller.abort();
    },
    []
  );

  const resolveSession = useCallback((resolvedSessionId: string) => {
    sessionIdRef.current = resolvedSessionId;
    setSessionId(resolvedSessionId);
  }, []);

  const submit = useCallback(() => {
    const prompt = draft.trim();
    if (!prompt || activeTurn.current) {
      return;
    }
    const pendingTurnId = `pending-${Date.now()}`;
    const editedTurnId = editingTurnId;
    const editedTurnIndex = editedTurnId
      ? turns.findIndex((turn) => turn.id === editedTurnId)
      : -1;
    if (editedTurnId && (!sessionIdRef.current || editedTurnIndex < 0)) {
      return;
    }
    const controller = new AbortController();
    const requestId = crypto.randomUUID();
    activeTurn.current = { controller, requestId };
    setIsRunning(true);
    setRuntimeError(undefined);
    setDraft("");
    setEditingTurnId(undefined);
    setTurns((current) => [
      ...(editedTurnIndex >= 0 ? current.slice(0, editedTurnIndex) : current),
      {
        answer: "",
        id: pendingTurnId,
        status: "running",
        thought: "",
        user: prompt,
      },
    ]);

    const runSubmittedTurn = async () => {
      try {
        await streamAgentTurn({
          ...(editedTurnId ? { editTurnId: editedTurnId } : {}),
          input: prompt,
          onEvent: (event) => {
            handleStreamEvent(event, pendingTurnId, setTurns);
            const resolvedSessionId = streamSessionId(event);
            if (resolvedSessionId) {
              resolveSession(resolvedSessionId);
            }
          },
          requestId,
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
          signal: controller.signal,
        });
        const completedSessionId = sessionIdRef.current;
        if (completedSessionId) {
          try {
            const session = await readAgentSession(
              completedSessionId,
              controller.signal
            );
            const projection = projectAgentSession(session);
            setTurns(projection.turns);
            setTraces(projection.traces);
          } catch {
            // The streamed Turn remains usable if the canonical refresh is unavailable.
          }
          onSessionResolvedRef.current?.(completedSessionId);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const detail = errorMessage(error);
        setRuntimeError(detail);
        setTurns((current) =>
          current.map((turn) =>
            turn.id === pendingTurnId
              ? { ...turn, error: detail, status: "failed" }
              : turn
          )
        );
      } finally {
        if (activeTurn.current?.controller === controller) {
          activeTurn.current = undefined;
          setIsRunning(false);
        }
      }
    };
    void runSubmittedTurn();
  }, [draft, editingTurnId, resolveSession, turns]);

  const cancelRunningTurn = useCallback(() => {
    const active = activeTurn.current;
    if (!(active && canCancel)) {
      return;
    }
    const requestCancel = async () => {
      try {
        await cancelAgentTurn(active.requestId);
      } catch (error) {
        setRuntimeError(errorMessage(error));
      }
    };
    void requestCancel();
  }, [canCancel]);

  const beginEditing = useCallback(
    (turn: AgentTurn) => {
      if (!(canEdit && turn.status === "completed" && !activeTurn.current)) {
        return;
      }
      setEditingTurnId(turn.id);
      setDraft(turn.user);
    },
    [canEdit]
  );

  const cancelEditing = useCallback(() => {
    setEditingTurnId(undefined);
    setDraft("");
  }, []);

  const editingTurnIndex = editingTurnId
    ? turns.findIndex((turn) => turn.id === editingTurnId)
    : -1;

  return {
    beginEditing,
    canCancel,
    canEdit,
    cancelEditing,
    cancelRunningTurn,
    draft,
    editingTurnId,
    isRunning,
    runtimeError,
    sessionId,
    setDraft,
    submit,
    traces,
    turns,
    visibleTurns:
      editingTurnIndex >= 0 ? turns.slice(0, editingTurnIndex) : turns,
  };
}

function handleStreamEvent(
  event: AgentStreamEvent,
  turnId: string,
  setTurns: Dispatch<SetStateAction<AgentTurn[]>>
) {
  setTurns((current) =>
    current.map((turn) => {
      if (turn.id !== turnId) {
        return turn;
      }
      if (event.type === "turn_completed") {
        return { ...turn, status: "completed" };
      }
      if (event.type === "turn_cancelled") {
        return { ...turn, status: "cancelled" };
      }
      if (event.type === "turn_failed") {
        return { ...turn, error: event.detail, status: "failed" };
      }
      const { kind, text } = event.message;
      if (!kind || kind === "text_delta") {
        return { ...turn, answer: turn.answer + text };
      }
      if (kind === "reasoning_delta") {
        return { ...turn, thought: turn.thought + text, work: turn.work ?? {} };
      }
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
    })
  );
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
    ...(error ? { error } : {}),
  };
  if (index === -1) {
    tools.push(next);
  } else {
    tools[index] = next;
  }
  return tools;
}

function streamSessionId(event: AgentStreamEvent) {
  if (event.type === "turn_message") {
    return event.message.sessionId;
  }
  if (event.type === "turn_completed" || event.type === "turn_cancelled") {
    return event.sessionId;
  }
  return undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Agent request failed";
}
