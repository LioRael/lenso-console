import type { ConsoleDockViewProps } from "@lenso/console-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AgentConsoleError,
  type AgentConsoleClient,
  type AgentRun,
  type AgentSnapshot,
  type AgentAction,
} from "./client";

export interface AgentConsoleServices {
  client?: AgentConsoleClient;
  /** A projection supplied by the trusted application, never chat text or credentials. */
  connection?: {
    state:
      | "ready"
      | "disconnected"
      | "model-required"
      | "reauthorize"
      | "revoked"
      | "disabled"
      | "unknown";
    provider?: string;
    account?: string;
    model?: string;
    scope?: string;
    testedAt?: number;
    usage?: { label: string; open(): void };
  };
  configure?: { label: string; open(): void };
  /** The host's existing readiness store; snapshots must be stable until changed.
   * Updating it keeps this binding/client within the same trusted session. */
  connectionSource?: {
    getSnapshot(): AgentConsoleServices["connection"];
    subscribe(listener: () => void): () => void;
  };
  /** Visible only in an explicitly labelled application-owned protocol fixture. */
  notice?: string;
}
export function agentConnectionState(services: AgentConsoleServices) {
  const state =
    services.connection?.state ??
    (services.client ? "unknown" : "disconnected");
  if (state !== "ready") {
    return state;
  }
  if (!services.client) {
    return "disconnected";
  }
  return services.connection?.model?.trim() ? "ready" : "model-required";
}
type Attempt = { text: string; key: string };
const message = (error: unknown) =>
  error instanceof AgentConsoleError
    ? error.message
    : "The Agent connection is unavailable. Check the connection and try again.";

export function useAgentConversation({
  services,
  activation,
  signal,
  dock,
}: ConsoleDockViewProps<AgentConsoleServices>) {
  const { client } = services;
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const sessionRef = useRef<string | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<AgentSnapshot>();
  const [run, setRun] = useState<AgentRun>();
  const [delta, setDelta] = useState("");
  const [pending, setPending] = useState<Attempt>();
  const attempt = useRef<Attempt | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [posting, setPosting] = useState(false);
  const [actionBusy, setActionBusy] = useState<string>();
  const [reconnect, setReconnect] = useState(false);
  const [watchAttempt, setWatchAttempt] = useState(0);
  const writeLock = useRef(false);
  const readVersion = useRef(0);
  const current = useCallback(
    () => !signal.aborted && activation.isCurrent(),
    [signal, activation]
  );
  const visible = dock.state !== "inactive";
  const runId = run?.id;
  const refresh = useCallback(
    async (selectedSession: string, requestSignal = signal) => {
      if (!client) {
        return;
      }
      readVersion.current += 1;
      const version = readVersion.current;
      const data = await client.readSession(selectedSession, requestSignal);
      requestSignal.throwIfAborted();
      if (
        current() &&
        version === readVersion.current &&
        sessionRef.current === selectedSession
      ) {
        setSnapshot(data);
        const [latest] = [...data.runs].sort(
          (left, right) => right.createdAt - left.createdAt
        );
        if (latest) {
          setRun(latest);
        }
      }
      return data;
    },
    [client, current, signal]
  );

  useEffect(() => {
    if (!client || !visible || !sessionId || !runId) {
      return;
    }
    const controller = new AbortController();
    const lifetime = AbortSignal.any([controller.signal, signal]);
    const live = () => current() && !lifetime.aborted;
    setReconnect(false);
    setDelta("");
    const follow = async () => {
      try {
        for await (const frame of client.watchRun(runId, lifetime)) {
          if (!live()) {
            return;
          }
          if (frame.kind === "snapshot") {
            if (frame.snapshot.session.id !== sessionId) {
              throw new AgentConsoleError("session-mismatch");
            }
            readVersion.current += 1;
            setSnapshot(frame.snapshot);
            setRun(frame.run);
            setDelta("");
            if (frame.run.status !== "running") {
              return;
            }
          } else if (frame.kind === "resnapshot-required") {
            const data = await refresh(sessionId, lifetime);
            if (!live()) {
              return;
            }
            setDelta("");
            const latest = data?.runs.find((item) => item.id === runId);
            if (latest?.status === "running") {
              setReconnect(true);
              setFeedback(
                "Updates were interrupted. The latest saved state is shown; reconnect to follow this run."
              );
            }
            return;
          } else if (frame.event.kind === "text_delta") {
            const { data } = frame.event;
            if (
              !data ||
              typeof data !== "object" ||
              !("text" in data) ||
              typeof data.text !== "string"
            ) {
              throw new AgentConsoleError("invalid-text-event");
            }
            const { text } = data;
            setDelta((previous) => (previous + text).slice(0, 256 * 1024));
          } else if (
            ["pending_action", "tool_result"].includes(frame.event.kind)
          ) {
            await refresh(sessionId, lifetime);
          } else if (frame.event.kind === "safe_error") {
            setFeedback(
              "The Agent reported a run error. Refreshing the saved result."
            );
          } else if (
            [
              "run_completed",
              "run_failed",
              "run_cancelled",
              "run_interrupted",
            ].includes(frame.event.kind)
          ) {
            await refresh(sessionId, lifetime);
            if (live()) {
              setDelta("");
            }
            return;
          }
        }
      } catch (error) {
        if (!live()) {
          return;
        }
        try {
          const data = await refresh(sessionId, lifetime);
          if (!live()) {
            return;
          }
          setDelta("");
          if (
            data?.runs.find((item) => item.id === runId)?.status !== "running"
          ) {
            return;
          }
        } catch {
          if (!live()) {
            return;
          }
        }
        setReconnect(true);
        setErrorMessage(message(error));
      }
    };
    void follow();
    // Closing the Dock detaches this watcher. It never calls the cancel endpoint.
    return () => controller.abort();
  }, [
    client,
    current,
    refresh,
    runId,
    sessionId,
    signal,
    visible,
    watchAttempt,
  ]);

  async function send(retry = false) {
    if (
      !client ||
      agentConnectionState(services) !== "ready" ||
      !current() ||
      !visible ||
      writeLock.current ||
      run?.status === "running"
    ) {
      return;
    }
    const selected = retry
      ? attempt.current
      : { text: draft.trim(), key: crypto.randomUUID() };
    if (!selected?.text || (!retry && attempt.current)) {
      return;
    }
    writeLock.current = true;
    let dispatched = false;
    attempt.current = selected;
    setPending(selected);
    setPosting(true);
    setErrorMessage("");
    setFeedback("");
    dock.expand();
    try {
      let selectedSession = sessionRef.current;
      if (!selectedSession) {
        const created = await client.createSession(signal);
        if (!current()) {
          return;
        }
        selectedSession = created.id;
        sessionRef.current = created.id;
        setSessionId(created.id);
      }
      dispatched = true;
      const accepted = await client.startRun(
        selectedSession,
        selected.text,
        selected.key,
        signal
      );
      if (!current()) {
        return;
      }
      setRun(accepted);
      setDraft("");
      setDelta("");
      setReconnect(false);
      attempt.current = undefined;
      setPending(undefined);
    } catch (error) {
      if (!current()) {
        return;
      }
      if (
        !dispatched ||
        (error instanceof AgentConsoleError &&
          (error.code === "input-budget" ||
            (error.status && error.status < 500)))
      ) {
        attempt.current = undefined;
        setPending(undefined);
        setErrorMessage(message(error));
      } else {
        setErrorMessage(
          "The submission outcome is unknown. Retry the same message with its original request key; do not submit a second copy."
        );
      }
    } finally {
      writeLock.current = false;
      if (current()) {
        setPosting(false);
      }
    }
  }
  async function stop() {
    if (
      !client ||
      !run ||
      run.status !== "running" ||
      !current() ||
      !visible ||
      writeLock.current
    ) {
      return;
    }
    writeLock.current = true;
    setActionBusy("stop");
    setErrorMessage("");
    try {
      const next = await client.cancelRun(run.id, signal);
      if (!current()) {
        return;
      }
      setRun(next);
      setFeedback(
        next.status === "running"
          ? "Stop requested. Waiting for the Agent to finish cancellation."
          : "The run has stopped."
      );
      if (next.status !== "running" && sessionRef.current) {
        await refresh(sessionRef.current);
      }
    } catch (error) {
      if (current()) {
        setErrorMessage(message(error));
      }
    } finally {
      writeLock.current = false;
      if (current()) {
        setActionBusy(undefined);
      }
    }
  }
  async function decide(action: AgentAction, confirm: boolean) {
    if (
      !client ||
      agentConnectionState(services) !== "ready" ||
      !current() ||
      !visible ||
      writeLock.current ||
      action.status !== "pending" ||
      action.expiresAt <= Date.now() ||
      run?.status === "running"
    ) {
      return;
    }
    writeLock.current = true;
    setActionBusy(action.id);
    setErrorMessage("");
    setFeedback("");
    try {
      if (confirm) {
        await client.confirmAction(action.id, action.digest, signal);
      } else {
        await client.cancelAction(action.id, signal);
      }
      if (!current()) {
        return;
      }
      if (sessionRef.current) {
        await refresh(sessionRef.current);
      }
      if (current()) {
        setFeedback(
          confirm
            ? "Approval processed. Action status updated; send a new message if you want the Agent to continue."
            : "Action cancellation processed."
        );
      }
    } catch (error) {
      if (current()) {
        setErrorMessage(message(error));
      }
      // An ambiguous tool outcome is never automatically retried.
      if (current() && sessionRef.current) {
        await refresh(sessionRef.current).catch(() => undefined);
      }
    } finally {
      writeLock.current = false;
      if (current()) {
        setActionBusy(undefined);
      }
    }
  }
  const resume = () => {
    setErrorMessage("");
    setFeedback("");
    setWatchAttempt((value) => value + 1);
  };
  return {
    draft,
    setDraft,
    snapshot,
    run,
    delta,
    pending,
    error: errorMessage,
    feedback,
    posting,
    actionBusy,
    reconnect,
    send,
    stop,
    decide,
    resume,
  };
}
