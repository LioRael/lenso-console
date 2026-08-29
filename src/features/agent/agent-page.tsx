import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { PageHeader } from "@lenso/ui/page-header";
import { Surface } from "@lenso/ui/surface";
import { Tabs } from "@lenso/ui/tabs";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileText,
  ImageIcon,
  List,
  Search,
  Square,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { AgentAskUser } from "./agent-ask-user";
import { AgentHistoryMenu } from "./agent-history-menu";
import { AgentMarkdown } from "./agent-markdown";
import {
  AgentMessageActions,
  EditingMessageBar,
} from "./agent-message-controls";
import type { AgentToolCall, AgentTurn } from "./agent-runtime";
import { AgentShimmerText } from "./agent-shimmer-text";
import { AgentTrajectory } from "./agent-trajectory";
import { useAgentConversation } from "./use-agent-conversation";

import styles from "./agent-page.module.css";

type AgentPageProps = {
  conversationId?: string;
};

type AgentView = "conversation" | "trajectory";

const suggestions = [
  {
    description: "Turn an outcome into a concrete sequence of actions",
    icon: FileText,
    prompt: "Help me turn an idea into an actionable plan",
    title: "Plan next steps",
  },
  {
    description: "Gather current information and summarize the evidence",
    icon: Search,
    prompt: "Research a topic and summarize what matters",
    title: "Research a topic",
  },
  {
    description: "Examine a technical choice and identify its tradeoffs",
    icon: Wrench,
    prompt: "Review a technical decision and challenge its assumptions",
    title: "Review a decision",
  },
] as const;

export function AgentPage({ conversationId }: AgentPageProps) {
  const navigate = useNavigate();
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const [view, setView] = useState<AgentView>("conversation");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const onSessionResolved = useCallback(
    (resolvedSessionId: string) => {
      navigate({
        params: { chatId: resolvedSessionId },
        to: "/agent/$chatId",
      });
    },
    [navigate]
  );
  const {
    answerInteraction,
    beginEditing: beginEditingTurn,
    canCancel,
    canEdit,
    cancelEditing: cancelEditingTurn,
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
    visibleTurns,
  } = useAgentConversation({
    initialSessionId:
      conversationId && conversationId !== "new-task"
        ? conversationId
        : undefined,
    onSessionResolved,
  });
  const conversation = Boolean(conversationId || turns.length > 0);
  const displayedConversationId = conversation
    ? (sessionId ?? conversationId ?? "new-task")
    : undefined;
  const conversationTitle = conversation
    ? (turns[0]?.user ?? "New chat")
    : null;

  const beginEditing = (turn: AgentTurn) => {
    beginEditingTurn(turn);
    requestAnimationFrame(() => textarea.current?.focus());
  };

  const cancelEditing = () => {
    cancelEditingTurn();
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
          <AgentTrajectory trajectory={trajectory} />
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
          {pendingInteraction ? (
            <AgentAskUser
              canCancel={canCancel}
              interaction={pendingInteraction}
              isSubmitting={isAnsweringInteraction}
              onCancel={cancelRunningTurn}
              onSubmit={answerInteraction}
            />
          ) : (
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
          )}
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
        <AgentHistoryMenu
          currentSessionId={conversationId}
          placement="header"
          showNewChat={Boolean(conversationId)}
        >
          <Button
            className={styles.chatSwitcher}
            size="compact"
            variant="ghost"
          >
            <span>{conversationTitle ?? "New chat"}</span>
            <ChevronDown aria-hidden="true" size={12} />
          </Button>
        </AgentHistoryMenu>
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
            {turn.work ? (
              <details className={styles.worked}>
                <summary>
                  <AgentShimmerText
                    active={
                      turn.status === "running" && !turnHasRunningTool(turn)
                    }
                  >
                    {turnStatusLabel(turn)}
                  </AgentShimmerText>
                  <span aria-hidden="true" className={styles.workedChevron}>
                    <ChevronRight size={14} />
                  </span>
                </summary>
                <div className={styles.workedBody}>
                  <AgentMarkdown streaming={turn.status === "running"}>
                    {turn.thought || "Open Trajectory to inspect this work."}
                  </AgentMarkdown>
                </div>
              </details>
            ) : null}
            {turn.tools?.length ? <AgentToolCalls tools={turn.tools} /> : null}
            <div className={styles.assistantMessage}>
              {turn.answer ? (
                <AgentMarkdown streaming={turn.status === "running"}>
                  {turn.answer}
                </AgentMarkdown>
              ) : null}
              {turn.status === "running" && !turn.work ? (
                <p>
                  <AgentShimmerText active>Working…</AgentShimmerText>
                </p>
              ) : null}
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

function AgentToolCalls({ tools }: { tools: AgentToolCall[] }) {
  return (
    <div aria-label="Tool activity" className={styles.toolCalls}>
      {tools.map((tool) => {
        const Icon = toolIcon(tool.name);
        const label = toolActivityLabel(tool);
        const rows = toolActivityRows(tool);
        return (
          <details
            className={styles.toolCall}
            data-status={tool.status}
            key={tool.callId}
          >
            <summary>
              <Icon aria-hidden="true" size={15} strokeWidth={1.65} />
              <AgentShimmerText
                active={tool.status === "running"}
                className={styles.toolName}
              >
                {label}
              </AgentShimmerText>
              <span aria-hidden="true" className={styles.toolChevron}>
                <ChevronRight size={14} />
              </span>
            </summary>
            <div className={styles.toolDetails}>
              {rows.map((row) => {
                const RowIcon = row.icon;
                return (
                  <div className={styles.toolDetailRow} key={row.label}>
                    <RowIcon aria-hidden="true" size={14} strokeWidth={1.55} />
                    <span title={row.title}>{row.label}</span>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

type ToolActivityRow = {
  icon: typeof Wrench;
  label: string;
  title?: string;
};

function toolActivityLabel(tool: AgentToolCall) {
  const target = toolTarget(tool);
  if (tool.status === "not_run") {
    return target ? `Did not run ${target}` : `Did not run ${tool.name}`;
  }
  if (tool.status === "failed") {
    return target ? `Could not run ${target}` : `Could not run ${tool.name}`;
  }
  if (tool.name === "skill") {
    return tool.status === "running" ? "Loading skill" : "Loaded skill";
  }
  if (tool.name === "skill_list") {
    return tool.status === "running" ? "Listing skills" : "Listed skills";
  }
  return `${tool.status === "running" ? "Running" : "Ran"} ${tool.name}`;
}

function turnHasRunningTool(turn: AgentTurn) {
  return turn.tools?.some((tool) => tool.status === "running") ?? false;
}

function toolActivityRows(tool: AgentToolCall): ToolActivityRow[] {
  const input = toolPayload(tool.argumentsJson);
  const result = toolPayload(tool.metadataJson);
  const target = toolTarget(tool);
  const rows: ToolActivityRow[] = [];
  if (tool.name === "skill" && target) {
    rows.push({
      icon: Wrench,
      label: `${tool.status === "completed" ? "Read" : "Requested"} ${target} skill`,
    });
  } else if (tool.name === "skill_list") {
    rows.push({ icon: List, label: "Read the available skill catalog" });
  } else if (tool.argumentsJson) {
    rows.push({
      icon: toolIcon(tool.name),
      label: toolInputLabel(tool.name, input),
      title: tool.argumentsJson,
    });
  }
  const version = stringField(result, "version");
  if (version) {
    rows.push({
      icon: Search,
      label: `Resolved version ${version.slice(0, 12)}`,
      title: version,
    });
  }
  if (tool.error) {
    rows.push({ icon: CircleAlert, label: tool.error, title: tool.error });
  }
  if (rows.length === 0) {
    rows.push({
      icon: toolIcon(tool.name),
      label:
        tool.status === "running" ? "Waiting for result" : "Tool completed",
    });
  }
  return rows;
}

function toolIcon(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("search")) {
    return Search;
  }
  if (normalized.includes("image")) {
    return ImageIcon;
  }
  if (
    normalized.includes("terminal") ||
    normalized.includes("shell") ||
    normalized.includes("exec")
  ) {
    return Terminal;
  }
  if (normalized.includes("file") || normalized.includes("read")) {
    return FileText;
  }
  if (normalized.includes("list")) {
    return List;
  }
  return Wrench;
}

function toolInputLabel(name: string, input: Record<string, unknown>) {
  const value =
    stringField(input, "path") ||
    stringField(input, "query") ||
    stringField(input, "command") ||
    stringField(input, "name");
  return value ? `${name} ${value}` : `Called ${name}`;
}

function toolTarget(tool: AgentToolCall) {
  return stringField(toolPayload(tool.argumentsJson), "name");
}

function stringField(value: Record<string, unknown>, field: string) {
  return typeof value[field] === "string" ? value[field] : undefined;
}

function toolPayload(value?: string): Record<string, unknown> {
  if (!value) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
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

function turnStatusLabel(turn: AgentTurn) {
  switch (turn.status) {
    case "running": {
      return "Working…";
    }
    case "completed": {
      return turn.work?.durationMs === undefined
        ? "Completed"
        : `Worked for ${formatWorkDuration(turn.work.durationMs)}`;
    }
    case "failed": {
      return "Failed";
    }
    case "cancelled": {
      return "Cancelled";
    }
    default: {
      return turn.status;
    }
  }
}

function formatWorkDuration(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
