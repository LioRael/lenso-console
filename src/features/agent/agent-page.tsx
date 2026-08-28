import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { Menu } from "@lenso/ui/menu";
import { PageHeader } from "@lenso/ui/page-header";
import { Surface } from "@lenso/ui/surface";
import { Tabs } from "@lenso/ui/tabs";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  Box,
  ChevronDown,
  Copy,
  MoreHorizontal,
  Package,
  Paperclip,
  Plus,
  Search,
  Square,
  Star,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from "react";

import { AgentHistoryItems } from "./agent-history-menu";
import {
  AgentMessageActions,
  EditingMessageBar,
} from "./agent-message-controls";
import {
  cancelAgentTurn,
  projectAgentSession,
  readAgentBootstrap,
  readAgentSession,
  streamAgentTurn,
  type AgentStreamEvent,
  type AgentTraceRecord,
  type AgentTurn,
} from "./agent-runtime";
import { AgentTrajectory } from "./agent-trajectory";

import styles from "./agent-page.module.css";

type AgentPageProps = {
  conversationId?: string;
};

type AgentView = "conversation" | "trajectory";

const suggestions = [
  {
    description: "Turn an outcome into a focused App workspace",
    icon: Package,
    prompt: "Create a customer support workspace",
    title: "Create a new App",
  },
  {
    description: "Research the Plugins available in this App",
    icon: Search,
    prompt: "Research the Plugins in this App",
    title: "Research a topic",
  },
  {
    description: "Configure a team around a shared workflow",
    icon: Wrench,
    prompt: "Set up a new support team",
    title: "Set up a new team",
  },
] as const;

export function AgentPage({ conversationId }: AgentPageProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [editingTurnId, setEditingTurnId] = useState<string>();
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const [view, setView] = useState<AgentView>("conversation");
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [traces, setTraces] = useState<AgentTraceRecord[]>([]);
  const [runtimeError, setRuntimeError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const activeTurn = useRef<
    { controller: AbortController; requestId: string } | undefined
  >(undefined);
  const sessionId = useRef(
    conversationId && conversationId !== "new-task" ? conversationId : undefined
  );
  const conversation = Boolean(conversationId || turns.length > 0);
  const displayedConversationId = conversation
    ? (conversationId ?? "new-task")
    : undefined;
  const conversationTitle = conversation
    ? (turns[0]?.user ?? "New chat")
    : null;
  const editingTurnIndex = editingTurnId
    ? turns.findIndex((turn) => turn.id === editingTurnId)
    : -1;
  const visibleTurns =
    editingTurnIndex >= 0 ? turns.slice(0, editingTurnIndex) : turns;

  useEffect(() => {
    const controller = new AbortController();
    const loadBootstrap = async () => {
      try {
        const bootstrap = await readAgentBootstrap(controller.signal);
        setCanCancel(bootstrap.capabilities.cancel);
        setCanEdit(bootstrap.capabilities.edit);
      } catch {
        setCanCancel(false);
        setCanEdit(false);
      }
    };
    void loadBootstrap();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!(conversationId && conversationId !== "new-task")) {
      return;
    }
    const controller = new AbortController();
    sessionId.current = conversationId;
    setRuntimeError(undefined);
    const loadSession = async () => {
      try {
        const session = await readAgentSession(
          conversationId,
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
  }, [conversationId]);

  useEffect(
    () => () => {
      activeTurn.current?.controller.abort();
    },
    []
  );

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
    if (editedTurnId && (!sessionId.current || editedTurnIndex < 0)) {
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
            if (event.type === "turn_message" && event.message.sessionId) {
              sessionId.current = event.message.sessionId;
            }
            if (
              (event.type === "turn_completed" ||
                event.type === "turn_cancelled") &&
              event.sessionId
            ) {
              sessionId.current = event.sessionId;
            }
          },
          requestId,
          ...(sessionId.current ? { sessionId: sessionId.current } : {}),
          signal: controller.signal,
        });
        const completedSessionId = sessionId.current;
        if (completedSessionId) {
          navigate({
            params: { chatId: completedSessionId },
            to: "/agent/$chatId",
          });
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
  }, [draft, editingTurnId, navigate, turns]);

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

  const beginEditing = (turn: AgentTurn) => {
    if (!(canEdit && turn.status === "completed" && !activeTurn.current)) {
      return;
    }
    setEditingTurnId(turn.id);
    setDraft(turn.user);
    requestAnimationFrame(() => textarea.current?.focus());
  };

  const cancelEditing = () => {
    setEditingTurnId(undefined);
    setDraft("");
    requestAnimationFrame(() => textarea.current?.focus());
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={`${styles.page} ${conversation ? styles.conversationPage : styles.emptyPage}`}
      data-view={conversation ? view : undefined}
    >
      <AgentHeader
        conversationId={displayedConversationId}
        conversationTitle={conversationTitle}
        onViewChange={setView}
        view={view}
      />
      {conversation ? (
        view === "trajectory" ? (
          <AgentTrajectory records={traces} />
        ) : (
          <AgentConversation
            canEdit={canEdit}
            onEdit={beginEditing}
            runtimeError={runtimeError}
            turns={visibleTurns}
          />
        )
      ) : (
        <div className={styles.emptyCanvas}>
          <section className={styles.emptyCenter}>
            <AgentComposer
              canCancel={canCancel}
              draft={draft}
              isRunning={isRunning}
              onChange={setDraft}
              onCancel={cancelRunningTurn}
              onKeyDown={onComposerKeyDown}
              onSubmit={onSubmit}
              ref={textarea}
            />
            {suggestionsVisible ? (
              <div className={styles.suggestions}>
                <div className={styles.suggestionsHeader}>
                  <span>Get started with some examples</span>
                  <IconButton
                    aria-label="Dismiss examples"
                    onClick={() => setSuggestionsVisible(false)}
                    size="compact"
                    variant="ghost"
                  >
                    <X size={13} />
                  </IconButton>
                </div>
                <div className={styles.suggestionGrid}>
                  {suggestions.map((suggestion) => (
                    <button
                      aria-label={suggestion.title}
                      className={styles.suggestion}
                      key={suggestion.title}
                      onClick={() => {
                        setDraft(suggestion.prompt);
                        textarea.current?.focus();
                      }}
                      type="button"
                    >
                      <suggestion.icon
                        aria-hidden="true"
                        size={15}
                        strokeWidth={1.6}
                      />
                      <span className={styles.suggestionCopy}>
                        <strong>{suggestion.title}</strong>
                        <span>{suggestion.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
      {conversation && view === "trajectory" ? (
        <div aria-hidden="true" className={styles.trajectoryComposerBackdrop} />
      ) : null}
      {conversation ? (
        <div
          className={styles.composerDock}
          data-editing={Boolean(editingTurnId) || undefined}
          data-view={view}
        >
          <div
            aria-hidden={!editingTurnId}
            className={styles.editingMessageReveal}
            data-open={Boolean(editingTurnId) || undefined}
          >
            <div className={styles.editingMessageClip}>
              <EditingMessageBar onCancel={cancelEditing} />
            </div>
          </div>
          <AgentComposer
            canCancel={canCancel}
            draft={draft}
            isRunning={isRunning}
            onChange={setDraft}
            onCancel={cancelRunningTurn}
            onKeyDown={onComposerKeyDown}
            onSubmit={onSubmit}
            placeholder="Reply…"
            ref={textarea}
          />
        </div>
      ) : null}
    </div>
  );
}

function AgentHeader({
  conversationId,
  conversationTitle,
  onViewChange,
  view,
}: {
  conversationId: string | undefined;
  conversationTitle: string | null;
  onViewChange: (view: AgentView) => void;
  view: AgentView;
}) {
  return (
    <PageHeader.Root
      aria-label="Agent chat navigation"
      className={styles.header}
    >
      <PageHeader.Row>
        <Menu.Root>
          <Menu.Trigger
            render={
              <Button
                className={styles.chatSwitcher}
                size="compact"
                variant="ghost"
              />
            }
          >
            <span>{conversationTitle ?? "New chat"}</span>
            <ChevronDown aria-hidden="true" size={12} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              align="start"
              alignOffset={8.5}
              side="bottom"
              sideOffset={3.5}
            >
              <Menu.Popup aria-label="Chat history" className={styles.chatMenu}>
                <AgentHistoryItems
                  classes={{
                    item: styles.chatHistoryItem,
                    meta: styles.chatItemMeta,
                    newChat: styles.newChatItem,
                    section: styles.chatSectionLabel,
                  }}
                  currentSessionId={conversationId}
                />
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        {conversationId ? (
          <Tabs.Root
            className={styles.viewTabs}
            onValueChange={(value) => onViewChange(value as AgentView)}
            value={view}
          >
            <Tabs.List aria-label="Agent view">
              <Tabs.Tab value="conversation">Conversation</Tabs.Tab>
              <Tabs.Tab value="trajectory">Trajectory</Tabs.Tab>
            </Tabs.List>
          </Tabs.Root>
        ) : null}
        {conversationId ? (
          <div className={styles.headerActions}>
            <IconButton
              aria-label="Add to favorites"
              size="compact"
              variant="ghost"
            >
              <Star size={14} strokeWidth={1.7} />
            </IconButton>
            <Menu.Root>
              <Menu.Trigger
                render={
                  <IconButton
                    aria-label="Chat options"
                    size="compact"
                    variant="ghost"
                  >
                    <MoreHorizontal size={15} />
                  </IconButton>
                }
              />
              <Menu.Portal>
                <Menu.Positioner align="end" side="bottom" sideOffset={6}>
                  <Menu.Popup aria-label="Chat options">
                    <Menu.Item>
                      <Menu.Leading>
                        <Copy size={15} />
                      </Menu.Leading>
                      <Menu.Label>Copy as markdown</Menu.Label>
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item tone="danger">
                      <Menu.Leading>
                        <Trash2 size={15} />
                      </Menu.Leading>
                      <Menu.Label>Delete</Menu.Label>
                      <Menu.Trailing>
                        <Menu.Shortcut>⌘ ⌫</Menu.Shortcut>
                      </Menu.Trailing>
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        ) : null}
      </PageHeader.Row>
    </PageHeader.Root>
  );
}

function AgentConversation({
  canEdit,
  onEdit,
  runtimeError,
  turns,
}: {
  canEdit: boolean;
  onEdit: (turn: AgentTurn) => void;
  runtimeError: string | undefined;
  turns: AgentTurn[];
}) {
  const conversationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = conversationRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [turns]);

  return (
    <section
      aria-label="Agent conversation"
      className={styles.conversation}
      ref={conversationRef}
    >
      <div className={styles.conversationContent}>
        <time className={styles.conversationTime}>Today</time>
        {turns.map((turn) => (
          <div className={styles.turn} key={turn.id}>
            <div className={styles.userMessageGroup}>
              <div className={styles.userMessage}>{turn.user}</div>
              <div className={styles.userMessageActions}>
                <AgentMessageActions
                  content={turn.user}
                  {...(canEdit ? { onEdit: () => onEdit(turn) } : {})}
                />
              </div>
            </div>
            <details className={styles.worked}>
              <summary>{turnStatusLabel(turn.status)}</summary>
              <p>{turn.thought || "No reasoning summary was provided."}</p>
            </details>
            <div className={styles.assistantMessage}>
              {turn.answer ? <p>{turn.answer}</p> : null}
              {turn.status === "running" ? <p>Working…</p> : null}
              {turn.error ? <p>{turn.error}</p> : null}
            </div>
            {turn.answer ? (
              <div className={styles.copyMessage}>
                <AgentMessageActions content={turn.answer} />
              </div>
            ) : null}
          </div>
        ))}
        {turns.length === 0 && runtimeError ? (
          <div className={styles.assistantMessage}>
            <p>{runtimeError}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AgentComposer({
  canCancel,
  draft,
  isRunning,
  onChange,
  onCancel,
  onKeyDown,
  onSubmit,
  placeholder = "Ask Lenso…",
  ref,
}: {
  canCancel: boolean;
  draft: string;
  isRunning: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder?: string;
  ref: React.Ref<HTMLTextAreaElement>;
}) {
  return (
    <Surface
      className={styles.composer}
      level="panel"
      render={<form onSubmit={onSubmit} />}
    >
      <textarea
        aria-label="Send a message to Lenso Agent"
        className={styles.textarea}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        ref={ref}
        rows={2}
        value={draft}
      />
      <div className={styles.composerFooter}>
        <SkillsMenu>
          <Button
            aria-label="Skills"
            className={styles.skillsButton}
            size="compact"
            variant="ghost"
          >
            <Box aria-hidden="true" size={13} strokeWidth={1.7} />
            Skills
            <ChevronDown aria-hidden="true" size={12} />
          </Button>
        </SkillsMenu>
        <IconButton
          aria-label="Attach images, files, or videos"
          className={styles.attachButton}
          size="compact"
          variant="ghost"
        >
          <Paperclip size={14} strokeWidth={1.7} />
        </IconButton>
        <IconButton
          aria-label={isRunning ? "Stop generating" : "Submit comment"}
          className={styles.sendButton}
          data-active={
            (isRunning ? canCancel : Boolean(draft.trim())) || undefined
          }
          disabled={isRunning ? !canCancel : !draft.trim()}
          onClick={isRunning ? onCancel : undefined}
          size="compact"
          type={isRunning ? "button" : "submit"}
          variant="secondary"
        >
          {isRunning ? (
            <Square fill="currentColor" size={9} strokeWidth={0} />
          ) : (
            <ArrowUp size={14} strokeWidth={1.9} />
          )}
        </IconButton>
      </div>
    </Surface>
  );
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
        return { ...turn, thought: turn.thought + text };
      }
      return turn;
    })
  );
}

function turnStatusLabel(status: AgentTurn["status"]) {
  switch (status) {
    case "running": {
      return "Working…";
    }
    case "completed": {
      return "Completed";
    }
    case "failed": {
      return "Failed";
    }
    case "cancelled": {
      return "Cancelled";
    }
    default: {
      return status;
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Agent request failed";
}

function SkillsMenu({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <Menu.Root>
      <Menu.Trigger render={children as ReactElement} />
      <Menu.Portal>
        <Menu.Positioner align="start" side="bottom" sideOffset={6}>
          <Menu.Popup aria-label="Skills">
            <Menu.Item
              onClick={() => navigate({ to: "/settings/agent/skills/new" })}
            >
              <Menu.Leading>
                <Plus size={15} />
              </Menu.Leading>
              <Menu.Label>Create skill</Menu.Label>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
