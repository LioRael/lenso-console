import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { useConsoleSession } from "../../app/console-session";
import type { AgentTarget } from "./agent-runtime";

// UI draft text only; Session authorization and history remain with the Host.
// A resolved session shares one input across the drawer and full-page surface.
const drafts = new Map<string, string>();
const listeners = new Set<() => void>();

export function agentDraftKey(
  subject: string,
  target: AgentTarget,
  sessionId: string
) {
  return JSON.stringify([
    subject,
    typeof target === "string" ? target : target.agentId,
    typeof target === "string" ? null : target.projectId,
    sessionId,
  ]);
}

function updateDraft(key: string, value: string) {
  if (value) {
    drafts.delete(key);
    drafts.set(key, value);
    if (drafts.size > 128) {
      const oldest = drafts.keys().next().value;
      if (oldest) {
        drafts.delete(oldest);
      }
    }
  } else {
    drafts.delete(key);
  }
  for (const listener of listeners) {
    listener();
  }
}

export function useAgentDraft(
  target: AgentTarget,
  sessionId: string | undefined
) {
  const { subject } = useConsoleSession();
  const [localDraft, setLocalDraft] = useState("");
  const key = sessionId ? agentDraftKey(subject, target, sessionId) : undefined;
  const keyRef = useRef(key);
  keyRef.current = key;
  const shared = useSyncExternalStore(
    useCallback((listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }, []),
    () => (key ? (drafts.get(key) ?? "") : ""),
    () => ""
  );
  const setDraft = useCallback((value: string) => {
    if (keyRef.current) {
      updateDraft(keyRef.current, value);
    } else {
      setLocalDraft(value);
    }
  }, []);
  return [key ? shared : localDraft, setDraft] as const;
}
