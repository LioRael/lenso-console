import { Button } from "@lenso/ui/button";
import { Modal as Dialog } from "@lenso/ui/modal";
import * as stylex from "@stylexjs/stylex";
import { useSearch } from "@tanstack/react-router";
import { History, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { AgentHistoryMenu } from "./agent-history-menu";
import { useAgentIdentity } from "./agent-identity-context";
import { AgentQuickConversation } from "./agent-quick-conversation";
import { useAgentQuickPanel } from "./agent-quick-panel-context";
import {
  agentQuickPanelStyles as styles,
  chipGroup,
} from "./agent-quick-panel.stylex";

type Entry = {
  id: number;
  agentId: string;
  projectId?: string;
  resumeSessionId?: string;
  sessionId?: string;
  title: string;
  hasConversation: boolean;
  running: boolean;
  dismissed?: boolean;
  initialDraft?: string;
};

export function AgentQuickPanel({
  onOpenFullPage,
  suspended = false,
}: {
  suspended?: boolean;
  onOpenFullPage: (
    agentId: string,
    sessionId?: string,
    projectId?: string
  ) => void;
}) {
  const t = useConsoleTranslation();
  const { selectedAgent } = useAgentIdentity();
  const search = useSearch({ strict: false });
  const projectId = selectedAgent.id === "app" ? search.project : undefined;
  const { draftRequest, pageContext, notifyTurnCompleted } =
    useAgentQuickPanel();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<number>();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const nextId = useRef(0);
  const appliedRequest = useRef(0);
  const runningEntries = useRef(new Set<number>());
  const create = useCallback(
    (agentId: string, initialDraft?: string) => {
      nextId.current += 1;
      const id = nextId.current;
      setEntries((current) => [
        ...current,
        {
          id,
          agentId,
          ...(projectId && agentId === "app" ? { projectId } : {}),
          title: "New chat",
          hasConversation: false,
          running: false,
          ...(initialDraft ? { initialDraft } : {}),
        },
      ]);
      setActiveId(id);
      setOpen(true);
    },
    [projectId]
  );
  const openAssistant = useCallback(() => {
    const draft = entries.find(
      (entry) =>
        entry.agentId === selectedAgent.id &&
        entry.projectId === projectId &&
        !entry.hasConversation &&
        !entry.dismissed
    );
    if (draft) {
      setActiveId(draft.id);
      setOpen(true);
    } else {
      create(
        selectedAgent.id,
        pageContext
          ? `Current page: ${pageContext.label}\n${pageContext.text}\n\n`
          : undefined
      );
    }
  }, [create, entries, pageContext, projectId, selectedAgent.id]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !suspended &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing &&
        event.key.toLowerCase() === "j"
      ) {
        event.preventDefault();
        if (open) {
          setOpen(false);
        } else {
          const active = entries.find(
            (entry) =>
              entry.id === activeId &&
              !entry.dismissed &&
              entry.agentId === selectedAgent.id &&
              entry.projectId === projectId
          );
          if (active) {
            setOpen(true);
          } else {
            openAssistant();
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeId,
    entries,
    open,
    openAssistant,
    projectId,
    selectedAgent.id,
    suspended,
  ]);
  useEffect(() => {
    if (draftRequest && draftRequest.id !== appliedRequest.current) {
      appliedRequest.current = draftRequest.id;
      create(draftRequest.agentId, draftRequest.draft);
    }
  }, [create, draftRequest]);
  const openHistory = useCallback(
    (sessionId?: string) => {
      if (!sessionId) {
        openAssistant();
        return;
      }
      const retained = entries.find(
        (entry) =>
          entry.agentId === selectedAgent.id &&
          entry.projectId === projectId &&
          entry.sessionId === sessionId &&
          !entry.dismissed
      );
      if (retained) {
        setActiveId(retained.id);
        setOpen(true);
        return;
      }
      nextId.current += 1;
      const id = nextId.current;
      setEntries((current) => [
        ...current,
        {
          id,
          agentId: selectedAgent.id,
          ...(projectId ? { projectId } : {}),
          resumeSessionId: sessionId,
          sessionId,
          title: "Chat",
          hasConversation: true,
          running: false,
        },
      ]);
      setActiveId(id);
      setOpen(true);
    },
    [entries, openAssistant, projectId, selectedAgent.id]
  );
  const update = useCallback(
    (
      id: number,
      title: string,
      hasConversation: boolean,
      running: boolean,
      sessionId?: string
    ) => {
      if (running) {
        runningEntries.current.add(id);
      } else if (runningEntries.current.delete(id)) {
        notifyTurnCompleted();
      }
      setEntries((current) => {
        const entry = current.find((item) => item.id === id);
        if (!entry) {
          return current;
        }
        if (entry.dismissed && !running) {
          return current.filter((item) => item.id !== id);
        }
        if (
          entry.title === title &&
          entry.hasConversation === hasConversation &&
          entry.running === running &&
          entry.sessionId === sessionId
        ) {
          return current;
        }
        return current.map((item) =>
          item.id === id
            ? {
                ...item,
                title,
                hasConversation,
                running,
                ...(sessionId ? { sessionId } : {}),
              }
            : item
        );
      });
    },
    [notifyTurnCompleted]
  );
  const close = (id: number) => {
    setEntries((current) =>
      current.flatMap((entry) =>
        entry.id === id
          ? entry.running
            ? [{ ...entry, dismissed: true }]
            : []
          : [entry]
      )
    );
    if (activeId === id) {
      setOpen(false);
      setActiveId(undefined);
    }
  };
  const retainedEntries = entries.filter(
    (entry) => entry.hasConversation && !entry.dismissed
  );
  return (
    <Dialog.Root
      modal={false}
      open={open && !suspended}
      onOpenChange={(nextOpen, details) => {
        if (suspended) {
          return;
        }
        const target =
          details.event instanceof FocusEvent
            ? details.event.relatedTarget
            : details.event.target;
        if (
          !nextOpen &&
          target instanceof Element &&
          target.closest("[data-agent-tray], [data-agent-composer-overlay]")
        ) {
          details.cancel();
          return;
        }
        setOpen(nextOpen);
      }}
    >
      <div hidden={suspended} inert={suspended}>
        <div
          {...stylex.props(
            styles.tray,
            open && retainedEntries.length > 0 && styles.trayOpen
          )}
        >
          {retainedEntries.map((entry) => (
            <div
              key={entry.id}
              data-agent-tray=""
              {...stylex.props(chipGroup, styles.chipGroup)}
            >
              <Button
                aria-label={entry.title}
                aria-expanded={open && activeId === entry.id}
                onClick={() => {
                  setActiveId(entry.id);
                  setOpen(true);
                }}
                size="sm"
                variant="secondary"
                xstyle={styles.chatChip}
              >
                {entry.title}
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                type="button"
                aria-label={`Close ${entry.title}`}
                onClick={() => close(entry.id)}
                xstyle={styles.chipClose}
              >
                <X aria-hidden="true" size={12} />
              </Button>
            </div>
          ))}
        </div>
        <Button
          aria-label={t("Assistant")}
          data-agent-action="open"
          data-agent-tray=""
          data-open={open || undefined}
          aria-keyshortcuts="Control+j Meta+j"
          onClick={openAssistant}
          size="sm"
          variant="secondary"
          xstyle={styles.trigger}
        >
          <Sparkles
            aria-hidden="true"
            size={14}
            strokeWidth={1.6}
            {...stylex.props(styles.triggerIcon)}
          />
          <span {...stylex.props(styles.triggerLabel)}>{t("Assistant")}</span>
        </Button>
        <AgentHistoryMenu
          agentId={selectedAgent.id}
          projectId={projectId}
          showNewChat={false}
          onSelect={openHistory}
        >
          <Button
            isIconOnly
            aria-label="Assistant history"
            size="sm"
            variant="secondary"
            xstyle={styles.historyTrigger}
          >
            <History aria-hidden="true" size={16} />
          </Button>
        </AgentHistoryMenu>
      </div>
      <Dialog.Portal className={stylex.props(styles.portal).className}>
        <Dialog.Popup
          xstyle={[
            styles.panel,
            retainedEntries.length > 0 && styles.panelWithTray,
          ]}
        >
          <div ref={setHost} {...stylex.props(styles.panelContent)} />
        </Dialog.Popup>
      </Dialog.Portal>
      {entries.map((entry) => (
        <Conversation
          key={entry.id}
          entry={entry}
          active={open && !suspended && entry.id === activeId}
          host={host}
          onMetadata={update}
          onClose={() => close(entry.id)}
          onMinimize={() => setOpen(false)}
          onOpenFullPage={onOpenFullPage}
        />
      ))}
    </Dialog.Root>
  );
}

function Conversation({
  entry,
  onMetadata,
  onOpenFullPage,
  ...props
}: {
  entry: Entry;
  onMetadata: (
    id: number,
    title: string,
    hasConversation: boolean,
    running: boolean,
    sessionId?: string
  ) => void;
} & Omit<
  Parameters<typeof AgentQuickConversation>[0],
  "agentId" | "initialDraft" | "onMetadata"
>) {
  const targetId = useMemo(
    () =>
      entry.projectId
        ? { agentId: entry.agentId, projectId: entry.projectId }
        : entry.agentId,
    [entry.agentId, entry.projectId]
  );
  const openFullPage = useCallback(
    (agentId: string, sessionId?: string) =>
      entry.projectId
        ? onOpenFullPage(agentId, sessionId, entry.projectId)
        : onOpenFullPage(agentId, sessionId),
    [entry.projectId, onOpenFullPage]
  );
  const report = useCallback(
    (
      title: string,
      hasConversation: boolean,
      running: boolean,
      sessionId?: string
    ) => onMetadata(entry.id, title, hasConversation, running, sessionId),
    [entry.id, onMetadata]
  );
  return (
    <AgentQuickConversation
      {...props}
      agentId={entry.agentId}
      targetId={targetId}
      initialSessionId={entry.resumeSessionId}
      onOpenFullPage={openFullPage}
      initialDraft={entry.initialDraft}
      onMetadata={report}
    />
  );
}
