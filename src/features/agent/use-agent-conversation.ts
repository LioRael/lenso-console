import { useCallback, useEffect, useRef, useState } from "react";

import { useAttachmentDraft, type AgentAttachment } from "./agent-attachments";
import {
  type AgentContextReference,
  activeAgentTools,
  readAgentActivity,
  answerAgentInteraction,
  cancelAgentTurn,
  cancelAgentTerminal,
  compactAgentSession,
  listAgentSessions,
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
  selectAgentProfile,
  streamAgentTurn,
  streamAgentTerminal,
  type AgentBootstrap,
  type AgentContextCatalog,
  type AgentModelCatalog,
  type AgentStreamEvent,
  type AgentTrajectory,
  type AgentTurn,
  type AgentInteractionAnswer,
  type AgentPendingInteraction,
  type AgentTarget,
  type AgentTask,
  type AgentTerminalCatalog,
  type AgentTerminalRun,
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

type ActiveTerminal = {
  controller: AbortController;
  requestId: string;
};

type QueuedPrompt = {
  attachments?: AgentAttachment[];
  id: string;
  prompt: string;
};

async function loadBootstrap(
  signal: AbortSignal,
  targetId: AgentTarget,
  apply: (
    bootstrap: Awaited<ReturnType<typeof readAgentBootstrap>> | undefined
  ) => void
) {
  try {
    const bootstrap = await readAgentBootstrap(signal, targetId);
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
  targetId: AgentTarget,
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
      readAgentSession(sessionId, signal, targetId),
      readAgentTrajectory(sessionId, signal, targetId),
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
  enableTerminal = false,
  initialSessionId,
  onSessionResolved,
  targetId = "console",
}: {
  enableTerminal?: boolean;
  initialSessionId?: string | undefined;
  onSessionResolved?: ((sessionId: string) => void) | undefined;
  targetId?: AgentTarget;
} = {}) {
  const [draft, setDraft] = useState("");
  const [runtime, setRuntime] = useState<AgentBootstrap>();
  const [contextCatalog, setContextCatalog] = useState<AgentContextCatalog>();
  const [modelCatalog, setModelCatalog] = useState<AgentModelCatalog>();
  const [terminalCatalog, setTerminalCatalog] =
    useState<AgentTerminalCatalog>();
  const [terminalRuns, setTerminalRuns] = useState<AgentTerminalRun[]>([]);
  const [contextReferences, setContextReferences] = useState<
    AgentContextReference[]
  >([]);
  const [selectedModel, setSelectedModel] = useState<string>();
  const [selectedReasoningEffort, setSelectedReasoningEffort] =
    useState<string>();
  const [selectedApprovalMode, setSelectedApprovalMode] = useState<string>();
  const approvalModeRef = useRef<string>(undefined);
  const changeApprovalMode = useCallback(
    (mode: string | undefined) => {
      approvalModeRef.current = mode;
      setSelectedApprovalMode(mode);
      const id = sessionIdRef.current;
      if (id) {
        try {
          sessionStorage.setItem(
            `agent-approval:${targetId}:${id}`,
            mode ?? ""
          );
        } catch {
          /* Storage is optional. */
        }
      }
    },
    [targetId]
  );
  const [selectedServiceTier, setSelectedServiceTier] = useState<string>();
  const [selectedTools, setSelectedTools] = useState<string[]>();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [profile, setProfile] = useState<string>();
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [canUserInteraction, setCanUserInteraction] = useState(false);
  const [editingTurnId, setEditingTurnId] = useState<string>();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [trajectory, setTrajectory] = useState<AgentTrajectory>();
  const [runtimeError, setRuntimeError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const configuration = useRef<AbortController | undefined>(undefined);
  const catalogRefresh = useRef<AbortController | undefined>(undefined);
  const [isAnsweringInteraction, setIsAnsweringInteraction] = useState(false);
  const [pendingInteraction, setPendingInteraction] =
    useState<AgentPendingInteraction>();
  const [sessionId, setSessionId] = useState(initialSessionId);
  const attachments = useAttachmentDraft(targetId, sessionId);
  const clearAttachments = attachments.clear;
  const activeTurn = useRef<ActiveTurn | undefined>(undefined);
  const backgroundTurn = useRef<{ requestId: string } | undefined>(undefined);
  const activeTerminal = useRef<ActiveTerminal | undefined>(undefined);
  const queuedPromptsRef = useRef<QueuedPrompt[]>([]);
  const startTurnRef = useRef<
    (prompt: string, editedTurnId?: string, files?: AgentAttachment[]) => void
  >(() => undefined);
  const sessionIdRef = useRef(initialSessionId);
  const onSessionResolvedRef = useRef(onSessionResolved);

  useEffect(() => {
    onSessionResolvedRef.current = onSessionResolved;
  }, [onSessionResolved]);

  useEffect(() => {
    const controller = new AbortController();
    configuration.current?.abort();
    catalogRefresh.current?.abort();
    configuration.current = undefined;
    catalogRefresh.current = controller;
    setIsConfiguring(false);
    setRuntime(undefined);
    setContextCatalog(undefined);
    setModelCatalog(undefined);
    setTerminalCatalog(undefined);
    setProfile(undefined);
    setSelectedModel(undefined);
    setSelectedReasoningEffort(undefined);
    setSelectedServiceTier(undefined);
    setSelectedTools(undefined);
    setCanCancel(false);
    setCanEdit(false);
    setCanUserInteraction(false);
    void loadBootstrap(controller.signal, targetId, (bootstrap) => {
      if (bootstrap) {
        setRuntime(bootstrap);
        setProfile(
          bootstrap.profile === "default" ? undefined : bootstrap.profile
        );
        setSelectedTools(activeAgentTools(bootstrap));
        setCanCancel(bootstrap.capabilities.cancel);
        setCanEdit(bootstrap.capabilities.edit);
        setCanUserInteraction(bootstrap.capabilities.userInteraction);
        if (bootstrap.capabilities.contextSources) {
          const loadContextSources = async () => {
            try {
              const catalog = await readAgentContextSources(
                controller.signal,
                targetId
              );
              if (!controller.signal.aborted) {
                setContextCatalog(catalog);
              }
            } catch {
              if (!controller.signal.aborted) {
                setContextCatalog(undefined);
              }
            }
          };
          void loadContextSources();
        }
        if (enableTerminal && bootstrap.capabilities.terminalCommands) {
          const loadTerminalCatalog = async () => {
            try {
              const catalog = await readAgentTerminalCatalog(
                controller.signal,
                targetId
              );
              if (!controller.signal.aborted) {
                setTerminalCatalog(catalog);
              }
            } catch {
              if (!controller.signal.aborted) {
                setTerminalCatalog(undefined);
              }
            }
          };
          void loadTerminalCatalog();
        }
        if (bootstrap.capabilities.turnModelSelection) {
          const loadModels = async () => {
            try {
              const catalog = await readAgentModels(
                controller.signal,
                targetId
              );
              if (!controller.signal.aborted) {
                setModelCatalog(catalog);
                setSelectedModel(catalog.selectedModel);
                setSelectedReasoningEffort(catalog.selectedReasoningEffort);
                setSelectedServiceTier(catalog.selectedServiceTier);
              }
            } catch {
              if (!controller.signal.aborted) {
                setModelCatalog(undefined);
              }
            }
          };
          void loadModels();
        }
        return;
      }
      setRuntime(undefined);
      setContextCatalog(undefined);
      setModelCatalog(undefined);
      setTerminalCatalog(undefined);
      setCanCancel(false);
      setCanEdit(false);
      setCanUserInteraction(false);
    });
    return () => {
      controller.abort();
      configuration.current?.abort();
      catalogRefresh.current?.abort();
    };
  }, [enableTerminal, targetId]);

  useEffect(() => {
    if (!runtime?.capabilities.taskSnapshot) {
      setTasks([]);
      return;
    }
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const snapshot = await readAgentTasks(controller.signal, targetId);
        if (!controller.signal.aborted) {
          setTasks(snapshot);
        }
      } catch {
        // A Task Supervisor may be unavailable in the selected Generation.
      }
    };
    refresh();
    const timer = window.setInterval(refresh, isRunning ? 800 : 2500);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [isRunning, runtime?.capabilities.taskSnapshot, targetId]);

  useEffect(() => {
    activeTurn.current?.stream.stop();
    activeTurn.current?.controller.abort();
    activeTurn.current = undefined;
    const terminal = activeTerminal.current;
    if (terminal) {
      void cancelTerminalBestEffort(terminal.requestId, targetId);
      terminal.controller.abort();
    }
    activeTerminal.current = undefined;
    setIsRunning(false);
    setIsAnsweringInteraction(false);
    setPendingInteraction(undefined);
    queuedPromptsRef.current = [];
    setQueuedPrompts([]);
    sessionIdRef.current = initialSessionId;
    setSessionId(initialSessionId);
    let approvalMode: string | undefined;
    try {
      const stored = initialSessionId
        ? sessionStorage.getItem(
            `agent-approval:${targetId}:${initialSessionId}`
          )
        : undefined;
      approvalMode =
        stored && ["request", "assisted", "full"].includes(stored)
          ? stored
          : undefined;
    } catch {
      /* Storage is optional. */
    }
    approvalModeRef.current = approvalMode;
    setSelectedApprovalMode(approvalMode);
    clearAttachments();
    setContextReferences([]);
    setDraft("");
    setEditingTurnId(undefined);
    setTurns([]);
    setTerminalRuns([]);
    setTrajectory(undefined);
    setRuntimeError(undefined);
    if (!initialSessionId) {
      return;
    }
    const controller = new AbortController();
    void loadSessionData(
      initialSessionId,
      controller.signal,
      targetId,
      (result) => {
        if (!(result instanceof Error)) {
          const projection = projectAgentSession(result.session);
          setTurns(projection.turns);
          setTrajectory(result.trajectory);
          return;
        }
        setRuntimeError(errorMessage(result));
      }
    );
    return () => controller.abort();
  }, [initialSessionId, targetId, clearAttachments]);

  useEffect(
    () => () => {
      const active = activeTurn.current;
      activeTurn.current = undefined;
      active?.stream.stop();
      active?.controller.abort();
      const terminal = activeTerminal.current;
      if (terminal) {
        void cancelTerminalBestEffort(terminal.requestId, targetId);
        terminal.controller.abort();
      }
      activeTerminal.current = undefined;
    },
    [targetId]
  );

  const resolveSession = useCallback(
    (resolvedSessionId: string) => {
      sessionIdRef.current = resolvedSessionId;
      setSessionId(resolvedSessionId);
      try {
        sessionStorage.setItem(
          `agent-approval:${targetId}:${resolvedSessionId}`,
          approvalModeRef.current ?? ""
        );
      } catch {
        /* Storage is optional. */
      }
    },
    [targetId]
  );

  const startTurn = useCallback(
    (prompt: string, editedTurnId?: string, files: AgentAttachment[] = []) => {
      if (
        (!prompt && !files.length) ||
        configuration.current ||
        activeTurn.current ||
        activeTerminal.current
      ) {
        return;
      }
      const pendingTurnId = `pending-${Date.now()}`;
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
          startedAt: new Date().toISOString(),
          status: "running",
          thought: "",
          user: prompt,
          attachments: files,
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
              targetId,
            })
          : Promise.resolve();
        try {
          await streamAgentTurn({
            contextReferences,
            ...(selectedApprovalMode
              ? { approvalMode: selectedApprovalMode }
              : {}),
            ...(runtime?.capabilities.turnToolSelection && selectedTools
              ? { allowedTools: selectedTools }
              : {}),
            ...(editedTurnId ? { editTurnId: editedTurnId } : {}),
            input: prompt,
            attachments: files,
            ...(runtime?.capabilities.turnModelSelection && selectedModel
              ? { model: selectedModel }
              : {}),
            onEvent: (event) => {
              stream.handle(event);
              const resolvedSessionId = streamSessionId(event);
              if (resolvedSessionId) {
                resolveSession(resolvedSessionId);
              }
            },
            requestId,
            ...(runtime?.capabilities.turnModelSelection &&
            selectedReasoningEffort
              ? { reasoningEffort: selectedReasoningEffort }
              : {}),
            ...(sessionIdRef.current
              ? { sessionId: sessionIdRef.current }
              : {}),
            signal: controller.signal,
            ...(runtime?.capabilities.turnModelSelection && selectedServiceTier
              ? { serviceTier: selectedServiceTier }
              : {}),
            targetId,
          });
          stream.flush();
          const completedSessionId = sessionIdRef.current;
          if (completedSessionId) {
            try {
              const [session, projectedTrajectory] = await Promise.all([
                readAgentSession(
                  completedSessionId,
                  controller.signal,
                  targetId
                ),
                readAgentTrajectory(
                  completedSessionId,
                  controller.signal,
                  targetId
                ),
              ]);
              const projection = projectAgentSession(session);
              setTurns(projection.turns);
              setTrajectory(projectedTrajectory);
            } catch {
              // The streamed Turn remains usable if the canonical refresh is unavailable.
            }
            if (queuedPromptsRef.current.length === 0) {
              onSessionResolvedRef.current?.(completedSessionId);
            }
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
            const [next, ...remaining] = queuedPromptsRef.current;
            if (next) {
              queuedPromptsRef.current = remaining;
              setQueuedPrompts(remaining);
              queueMicrotask(() =>
                startTurnRef.current(next.prompt, undefined, next.attachments)
              );
            }
          } else {
            stream.stop();
          }
        }
      };
      void runSubmittedTurn();
    },
    [
      canUserInteraction,
      resolveSession,
      runtime,
      selectedModel,
      selectedReasoningEffort,
      contextReferences,
      selectedApprovalMode,
      selectedServiceTier,
      selectedTools,
      targetId,
      turns,
    ]
  );
  useEffect(() => {
    startTurnRef.current = startTurn;
  }, [startTurn]);

  const startTerminal = useCallback(
    (commandLine: string) => {
      if (
        activeTurn.current ||
        activeTerminal.current ||
        !terminalCommandMatches(terminalCatalog, commandLine)
      ) {
        return;
      }
      const controller = new AbortController();
      const requestId = crypto.randomUUID();
      activeTerminal.current = { controller, requestId };
      setIsRunning(true);
      setRuntimeError(undefined);
      setDraft("");
      setEditingTurnId(undefined);
      setTerminalRuns((current) => [
        ...current.slice(-3),
        {
          commandLine,
          id: requestId,
          messages: [],
          status: "running",
        },
      ]);

      const execute = async () => {
        try {
          await streamAgentTerminal({
            commandLine,
            onEvent: (event) => {
              setTerminalRuns((current) =>
                current.map((run) => {
                  if (run.id !== requestId) {
                    return run;
                  }
                  if (event.type === "terminal_message") {
                    return {
                      ...run,
                      messages: [...run.messages, event.message],
                    };
                  }
                  if (event.type === "terminal_failed") {
                    return {
                      ...run,
                      error: event.detail,
                      status: "failed",
                    };
                  }
                  return {
                    ...run,
                    status:
                      event.type === "terminal_cancelled"
                        ? "cancelled"
                        : "completed",
                  };
                })
              );
            },
            requestId,
            signal: controller.signal,
            targetId,
          });
        } catch (error) {
          if (!controller.signal.aborted) {
            const detail = errorMessage(error);
            setRuntimeError(detail);
            setTerminalRuns((current) =>
              current.map((run) =>
                run.id === requestId
                  ? { ...run, error: detail, status: "failed" }
                  : run
              )
            );
          }
        } finally {
          if (activeTerminal.current?.controller === controller) {
            activeTerminal.current = undefined;
            setIsRunning(false);
            const [next, ...remaining] = queuedPromptsRef.current;
            if (next) {
              queuedPromptsRef.current = remaining;
              setQueuedPrompts(remaining);
              queueMicrotask(() =>
                startTurnRef.current(next.prompt, undefined, next.attachments)
              );
            }
          }
        }
      };
      void execute();
    },
    [targetId, terminalCatalog]
  );

  const submit = useCallback(() => {
    if (
      configuration.current ||
      attachments.busy ||
      attachments.items.some((file) => !file.data_base64)
    ) {
      return;
    }
    const model = modelCatalog?.models.find(
      (item) => item.id === (selectedModel ?? modelCatalog.selectedModel)
    );
    if (
      attachments.items.some((file) => file.media_type.startsWith("image/")) &&
      model &&
      !model.inputModalities?.includes("image")
    ) {
      setRuntimeError(
        "The selected model does not support image attachments. Choose a model with image input."
      );
      return;
    }
    const prompt = draft.trim();
    if (!prompt && !attachments.items.length) {
      return;
    }
    const terminalCommand =
      !attachments.items.length &&
      terminalCommandMatches(terminalCatalog, prompt);
    if (activeTurn.current || activeTerminal.current) {
      if (editingTurnId) {
        return;
      }
      if (terminalCommand) {
        return;
      }
      const queued = {
        id: crypto.randomUUID(),
        prompt,
        attachments: attachments.items,
      };
      attachments.clear();
      queuedPromptsRef.current = [...queuedPromptsRef.current, queued];
      setQueuedPrompts(queuedPromptsRef.current);
      setDraft("");
      return;
    }
    if (terminalCommand) {
      startTerminal(prompt);
    } else {
      startTurn(prompt, editingTurnId, attachments.items);
      attachments.clear();
    }
  }, [
    draft,
    editingTurnId,
    startTerminal,
    startTurn,
    terminalCatalog,
    attachments,
    modelCatalog,
    selectedModel,
  ]);

  const removeQueuedPrompt = useCallback((id: string) => {
    queuedPromptsRef.current = queuedPromptsRef.current.filter(
      (queued) => queued.id !== id
    );
    setQueuedPrompts(queuedPromptsRef.current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasRunning = false;
    const poll = async () => {
      try {
        if (!activeTurn.current && !activeTerminal.current) {
          const activity = await readAgentActivity(targetId, controller.signal);
          if (controller.signal.aborted || !activity) {
            return;
          }
          if (!activeTurn.current) {
            backgroundTurn.current =
              activity.running && activity.requestId
                ? { requestId: activity.requestId }
                : undefined;
            setIsRunning(activity.running);
            if (
              activity.running &&
              activity.sessionId &&
              !sessionIdRef.current
            ) {
              onSessionResolvedRef.current?.(activity.sessionId);
            }
            if (
              (activity.running || wasRunning) &&
              sessionIdRef.current === activity.sessionId &&
              activity.sessionId
            ) {
              await loadSessionData(
                activity.sessionId,
                controller.signal,
                targetId,
                (result) => {
                  if (!(result instanceof Error) && !activeTurn.current) {
                    setTurns(projectAgentSession(result.session).turns);
                    setTrajectory(result.trajectory);
                  }
                }
              );
            }
            if (activity.running && activity.requestId) {
              const interactions = await readPendingAgentInteractions(
                activity.requestId,
                controller.signal,
                targetId
              );
              if (!controller.signal.aborted) {
                setPendingInteraction(interactions[0]);
              }
            } else {
              setPendingInteraction(undefined);
              if (wasRunning && activity.detail) {
                setRuntimeError(activity.detail);
              }
            }
            wasRunning = activity.running;
          }
        }
      } catch {
        // A transient status failure must not clear a running task or cancel it.
      }
      if (!controller.signal.aborted) {
        timer = setTimeout(() => void poll(), 1500);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      backgroundTurn.current = undefined;
    };
  }, [targetId, initialSessionId]);

  const answerInteraction = useCallback(
    (answers: AgentInteractionAnswer[]) => {
      const active = activeTurn.current ?? backgroundTurn.current;
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
            targetId,
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
    [isAnsweringInteraction, pendingInteraction, targetId]
  );

  const cancelRunningTurn = useCallback(() => {
    const terminal = activeTerminal.current;
    if (terminal) {
      const requestCancel = async () => {
        try {
          await cancelAgentTerminal(terminal.requestId, targetId);
        } catch (error) {
          setRuntimeError(errorMessage(error));
        }
      };
      void requestCancel();
      return;
    }
    const active = activeTurn.current ?? backgroundTurn.current;
    if (!(active && canCancel)) {
      return;
    }
    const requestCancel = async () => {
      try {
        await cancelAgentTurn(active.requestId, targetId);
      } catch (error) {
        setRuntimeError(errorMessage(error));
      }
    };
    void requestCancel();
  }, [canCancel, targetId]);

  const beginEditing = useCallback(
    (turn: AgentTurn) => {
      if (!(canEdit && turn.status === "completed" && !activeTurn.current)) {
        return;
      }
      setEditingTurnId(turn.id);
      setDraft(turn.user);
      void attachments.restore(turn.attachments ?? []);
    },
    [canEdit, attachments]
  );

  const cancelEditing = useCallback(() => {
    clearAttachments();
    setEditingTurnId(undefined);
    setDraft("");
  }, [clearAttachments]);

  const compactSession = useCallback(() => {
    const currentSessionId = sessionIdRef.current;
    if (
      !(currentSessionId && runtime?.capabilities.sessionCompact && !isRunning)
    ) {
      return;
    }
    setRuntimeError(undefined);
    const compact = async () => {
      try {
        await compactAgentSession(currentSessionId, targetId);
      } catch (error) {
        setRuntimeError(errorMessage(error));
      }
    };
    void compact();
  }, [isRunning, runtime?.capabilities.sessionCompact, targetId]);

  const configureRuntime = useCallback(
    async (operation: () => Promise<unknown>) => {
      if (
        configuration.current ||
        activeTurn.current ||
        activeTerminal.current
      ) {
        throw new Error("Wait for the current operation to finish.");
      }
      catalogRefresh.current?.abort();
      const controller = new AbortController();
      catalogRefresh.current = controller;
      configuration.current = controller;
      setIsConfiguring(true);
      setRuntimeError(undefined);
      let confirmed = false;
      try {
        try {
          await operation();
        } finally {
          if (!controller.signal.aborted) {
            const bootstrap = await readAgentBootstrap(
              controller.signal,
              targetId
            );
            if (!controller.signal.aborted) {
              confirmed = true;
              setRuntime(bootstrap);
              setProfile(
                bootstrap.profile === "default" ? undefined : bootstrap.profile
              );
              setSelectedTools(activeAgentTools(bootstrap));
              setCanCancel(bootstrap.capabilities.cancel);
              setCanEdit(bootstrap.capabilities.edit);
              setCanUserInteraction(bootstrap.capabilities.userInteraction);
              setModelCatalog(undefined);
              setSelectedModel(undefined);
              setSelectedReasoningEffort(undefined);
              setSelectedServiceTier(undefined);
              setContextCatalog(undefined);
              setTerminalCatalog(undefined);
            }
            const refreshCatalogs = async () => {
              const [models, context, terminal] = await Promise.all([
                bootstrap.capabilities.turnModelSelection
                  ? readAgentModels(controller.signal, targetId).catch(
                      () => undefined
                    )
                  : undefined,
                bootstrap.capabilities.contextSources
                  ? readAgentContextSources(controller.signal, targetId).catch(
                      () => undefined
                    )
                  : undefined,
                enableTerminal && bootstrap.capabilities.terminalCommands
                  ? readAgentTerminalCatalog(controller.signal, targetId).catch(
                      () => undefined
                    )
                  : undefined,
              ]);
              if (!controller.signal.aborted) {
                setModelCatalog(models);
                setSelectedModel(models?.selectedModel);
                setSelectedReasoningEffort(models?.selectedReasoningEffort);
                setSelectedServiceTier(models?.selectedServiceTier);
                setContextCatalog(context);
                setTerminalCatalog(terminal);
              }
            };
            void refreshCatalogs();
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          if (!confirmed) {
            setProfile(
              runtime?.profile === "default" ? undefined : runtime?.profile
            );
          }
          setRuntimeError(errorMessage(error));
        }
        throw error;
      } finally {
        if (
          configuration.current === controller &&
          !controller.signal.aborted
        ) {
          configuration.current = undefined;
          setIsConfiguring(false);
        }
      }
    },
    [enableTerminal, runtime?.profile, targetId]
  );

  const changeProfile = useCallback(
    (nextProfile: string | undefined) => {
      if (
        !(runtime?.capabilities.profileSelection && !isRunning) ||
        configuration.current ||
        nextProfile === profile
      ) {
        return;
      }
      setProfile(nextProfile);
      const select = async () => {
        try {
          await configureRuntime(() =>
            selectAgentProfile(nextProfile, targetId)
          );
        } catch {
          /* Configuration errors are displayed next to the composer. */
        }
      };
      void select();
    },
    [
      configureRuntime,
      isRunning,
      profile,
      runtime?.capabilities.profileSelection,
      targetId,
    ]
  );

  const renameSession = useCallback(
    async (title: string) => {
      const currentSessionId = sessionIdRef.current;
      if (
        !(
          currentSessionId &&
          runtime?.capabilities.sessionRename &&
          !isRunning &&
          title.trim()
        )
      ) {
        return undefined;
      }
      setRuntimeError(undefined);
      try {
        const sessions = await listAgentSessions(undefined, targetId);
        const current = sessions.find(
          (session) => session.sessionId === currentSessionId
        );
        if (!current?.titleRevision) {
          throw new Error("Session title revision is unavailable");
        }
        const renamed = await renameAgentSession({
          expectedTitleRevision: current.titleRevision,
          sessionId: currentSessionId,
          targetId,
          title: title.trim(),
        });
        return renamed.title;
      } catch (error) {
        setRuntimeError(errorMessage(error));
        return undefined;
      }
    },
    [isRunning, runtime?.capabilities.sessionRename, targetId]
  );

  const editingTurnIndex = editingTurnId
    ? turns.findIndex((turn) => turn.id === editingTurnId)
    : -1;

  return {
    attachments,
    beginEditing,
    answerInteraction,
    canCancel: canCancel || Boolean(terminalCatalog),
    canEdit,
    cancelEditing,
    cancelRunningTurn,
    changeProfile,
    configureRuntime,
    isConfiguring,
    compactSession,
    contextCatalog,
    draft,
    editingTurnId,
    isRunning,
    isAnsweringInteraction,
    modelCatalog,
    pendingInteraction,
    runtimeError,
    profile,
    queuedPrompts,
    removeQueuedPrompt,
    renameSession,
    runtime,
    contextReferences,
    setContextReferences,
    selectedModel,
    selectedReasoningEffort,
    selectedApprovalMode,
    selectedServiceTier,
    selectedTools,
    sessionId,
    setDraft,
    setSelectedModel,
    setSelectedReasoningEffort,
    setSelectedApprovalMode: changeApprovalMode,
    setSelectedServiceTier,
    setSelectedTools,
    submit,
    trajectory,
    tasks,
    terminalCatalog,
    terminalRuns,
    turns,
    visibleTurns:
      editingTurnIndex >= 0 ? turns.slice(0, editingTurnIndex) : turns,
  };
}

function terminalCommandMatches(
  catalog: AgentTerminalCatalog | undefined,
  commandLine: string
) {
  if (!catalog) {
    return false;
  }
  const line = commandLine.trim().replace(/^\//u, "");
  const tokens = line.split(/\s+/u);
  return catalog.commands.some(
    (command) =>
      command.path.length <= tokens.length &&
      command.path.every((segment, index) => segment === tokens[index])
  );
}

async function cancelTerminalBestEffort(
  requestId: string,
  targetId: AgentTarget
) {
  try {
    await cancelAgentTerminal(requestId, targetId);
  } catch {
    // The stream may have already completed while the surface was closing.
  }
}

async function pollPendingInteraction({
  apply,
  isFinished,
  requestId,
  signal,
  targetId,
}: {
  apply: (interaction: AgentPendingInteraction) => void;
  isFinished: () => boolean;
  requestId: string;
  signal: AbortSignal;
  targetId: AgentTarget;
}) {
  while (!(signal.aborted || isFinished())) {
    try {
      const interactions = await readPendingAgentInteractions(
        requestId,
        signal,
        targetId
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
