import { useCallback, useEffect, useRef, useState } from "react";

import {
  answerAgentInteraction,
  cancelAgentTurn,
  projectAgentSession,
  readAgentBootstrap,
  readAgentSession,
  readAgentTrajectory,
  readPendingAgentInteractions,
  streamAgentTurn,
  type AgentStreamEvent,
  type AgentTrajectory,
  type AgentTurn,
  type AgentInteractionAnswer,
  type AgentPendingInteraction,
} from "./agent-runtime";
import {
  createAgentStreamEventBuffer,
  type AgentStreamEventBuffer,
} from "./agent-stream-buffer";

type ActiveTurn = {
  controller: AbortController;
  requestId: string;
  stream: AgentStreamEventBuffer;
};

async function loadBootstrap(
  signal: AbortSignal,
  apply: (
    bootstrap: Awaited<ReturnType<typeof readAgentBootstrap>> | undefined
  ) => void
) {
  try {
    const bootstrap = await readAgentBootstrap(signal);
    if (!signal.aborted) {
      apply(bootstrap);
    }
  } catch {
    if (!signal.aborted) {
      apply(undefined);
    }
  }
}

async function loadSessionData(
  sessionId: string,
  signal: AbortSignal,
  apply: (
    result:
      | {
          session: Awaited<ReturnType<typeof readAgentSession>>;
          trajectory: Awaited<ReturnType<typeof readAgentTrajectory>>;
        }
      | Error
  ) => void
) {
  try {
    const [session, trajectory] = await Promise.all([
      readAgentSession(sessionId, signal),
      readAgentTrajectory(sessionId, signal),
    ]);
    if (!signal.aborted) {
      apply({ session, trajectory });
    }
  } catch (error) {
    if (!signal.aborted) {
      apply(error instanceof Error ? error : new Error(errorMessage(error)));
    }
  }
}

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
  const [canUserInteraction, setCanUserInteraction] = useState(false);
  const [editingTurnId, setEditingTurnId] = useState<string>();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [trajectory, setTrajectory] = useState<AgentTrajectory>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);
  const [isAnsweringInteraction, setIsAnsweringInteraction] = useState(false);
  const [pendingInteraction, setPendingInteraction] =
    useState<AgentPendingInteraction>();
  const [sessionId, setSessionId] = useState(initialSessionId);
  const activeTurn = useRef<ActiveTurn | undefined>(undefined);
  const sessionIdRef = useRef(initialSessionId);
  const onSessionResolvedRef = useRef(onSessionResolved);

  useEffect(() => {
    onSessionResolvedRef.current = onSessionResolved;
  }, [onSessionResolved]);

  useEffect(() => {
    const controller = new AbortController();
    void loadBootstrap(controller.signal, (bootstrap) => {
      if (bootstrap) {
        setCanCancel(bootstrap.capabilities.cancel);
        setCanEdit(bootstrap.capabilities.edit);
        setCanUserInteraction(bootstrap.capabilities.userInteraction);
        return;
      }
      setCanCancel(false);
      setCanEdit(false);
      setCanUserInteraction(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    activeTurn.current?.stream.stop();
    activeTurn.current?.controller.abort();
    activeTurn.current = undefined;
    setIsRunning(false);
    setIsAnsweringInteraction(false);
    setPendingInteraction(undefined);
    sessionIdRef.current = initialSessionId;
    setSessionId(initialSessionId);
    setDraft("");
    setEditingTurnId(undefined);
    setTurns([]);
    setTrajectory(undefined);
    setRuntimeError(undefined);
    if (!initialSessionId) {
      return;
    }
    const controller = new AbortController();
    void loadSessionData(initialSessionId, controller.signal, (result) => {
      if (!(result instanceof Error)) {
        const projection = projectAgentSession(result.session);
        setTurns(projection.turns);
        setTrajectory(result.trajectory);
        return;
      }
      setRuntimeError(errorMessage(result));
    });
    return () => controller.abort();
  }, [initialSessionId]);

  useEffect(
    () => () => {
      const active = activeTurn.current;
      activeTurn.current = undefined;
      active?.stream.stop();
      active?.controller.abort();
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
    const stream = createAgentStreamEventBuffer({
      setTurns,
      turnId: pendingTurnId,
    });
    activeTurn.current = { controller, requestId, stream };
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
      let turnFinished = false;
      const interactionPolling = canUserInteraction
        ? pollPendingInteraction({
            apply: (interaction) => {
              if (activeTurn.current?.requestId === requestId) {
                setPendingInteraction(interaction);
              }
            },
            isFinished: () => turnFinished,
            requestId,
            signal: controller.signal,
          })
        : Promise.resolve();
      try {
        await streamAgentTurn({
          ...(editedTurnId ? { editTurnId: editedTurnId } : {}),
          input: prompt,
          onEvent: (event) => {
            stream.handle(event);
            const resolvedSessionId = streamSessionId(event);
            if (resolvedSessionId) {
              resolveSession(resolvedSessionId);
            }
          },
          requestId,
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
          signal: controller.signal,
        });
        stream.flush();
        const completedSessionId = sessionIdRef.current;
        if (completedSessionId) {
          try {
            const [session, projectedTrajectory] = await Promise.all([
              readAgentSession(completedSessionId, controller.signal),
              readAgentTrajectory(completedSessionId, controller.signal),
            ]);
            const projection = projectAgentSession(session);
            setTurns(projection.turns);
            setTrajectory(projectedTrajectory);
          } catch {
            // The streamed Turn remains usable if the canonical refresh is unavailable.
          }
          onSessionResolvedRef.current?.(completedSessionId);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        stream.flush();
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
        turnFinished = true;
        await interactionPolling;
        if (activeTurn.current?.controller === controller) {
          stream.stop();
          activeTurn.current = undefined;
          setIsRunning(false);
          setIsAnsweringInteraction(false);
          setPendingInteraction(undefined);
        } else {
          stream.stop();
        }
      }
    };
    void runSubmittedTurn();
  }, [canUserInteraction, draft, editingTurnId, resolveSession, turns]);

  const answerInteraction = useCallback(
    (answers: AgentInteractionAnswer[]) => {
      const active = activeTurn.current;
      if (!(active && pendingInteraction && !isAnsweringInteraction)) {
        return;
      }
      const submitAnswer = async () => {
        setIsAnsweringInteraction(true);
        setRuntimeError(undefined);
        try {
          await answerAgentInteraction({
            answers,
            interactionId: pendingInteraction.interactionId,
            requestId: active.requestId,
          });
          if (activeTurn.current?.requestId === active.requestId) {
            setPendingInteraction(undefined);
          }
        } catch (error) {
          setRuntimeError(errorMessage(error));
        } finally {
          setIsAnsweringInteraction(false);
        }
      };
      void submitAnswer();
    },
    [isAnsweringInteraction, pendingInteraction]
  );

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
    answerInteraction,
    canCancel,
    canEdit,
    cancelEditing,
    cancelRunningTurn,
    draft,
    editingTurnId,
    isRunning,
    isAnsweringInteraction,
    pendingInteraction,
    runtimeError,
    sessionId,
    setDraft,
    submit,
    trajectory,
    turns,
    visibleTurns:
      editingTurnIndex >= 0 ? turns.slice(0, editingTurnIndex) : turns,
  };
}

async function pollPendingInteraction({
  apply,
  isFinished,
  requestId,
  signal,
}: {
  apply: (interaction: AgentPendingInteraction) => void;
  isFinished: () => boolean;
  requestId: string;
  signal: AbortSignal;
}) {
  while (!(signal.aborted || isFinished())) {
    try {
      const interactions = await readPendingAgentInteractions(
        requestId,
        signal
      );
      const [interaction] = interactions;
      if (interaction) {
        apply(interaction);
      }
    } catch {
      if (signal.aborted) {
        return;
      }
      // The Turn may not have reached the active runtime actor yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 160));
  }
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
