import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { Menu } from "@lenso/ui/menu";
import { PageHeader } from "@lenso/ui/page-header";
import { Select } from "@lenso/ui/select";
import { Tabs } from "@lenso/ui/tabs";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  ArrowDown,
  Bot,
  Box,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileText,
  Gauge,
  ImageIcon,
  List,
  Minimize2,
  Package,
  Paperclip,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
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
  type ReactElement,
  type ReactNode,
} from "react";

import { PromptComposer } from "../../components/lenso/recipes/prompt-composer";
import { AgentAskUser } from "./agent-ask-user";
import { AgentHistoryMenu } from "./agent-history-menu";
import { AgentMarkdown } from "./agent-markdown";
import {
  AgentMessageActions,
  EditingMessageBar,
} from "./agent-message-controls";
import { agentPageStyles as styles } from "./agent-page.stylex";
import {
  modelsForSelector,
  type AgentBootstrap,
  type AgentContextCatalog,
  type AgentModelCatalog,
  type AgentTask,
  type AgentTerminalCatalog,
  type AgentTerminalRun,
  type AgentToolCall,
  type AgentTurn,
} from "./agent-runtime";
import { AgentShimmerText } from "./agent-shimmer-text";
import { useAgentTarget } from "./agent-target-context";
import { AgentTrajectory } from "./agent-trajectory";
import { useAgentConversation } from "./use-agent-conversation";

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

type ContextSuggestion = {
  description: string;
  icon: typeof FileText;
  insertText: string;
  label: string;
};

function matchingComposerSuggestions(
  contextCatalog: AgentContextCatalog | undefined,
  terminalCatalog: AgentTerminalCatalog | undefined,
  draft: string
): ContextSuggestion[] {
  const query = draft.trim().toLowerCase();
  if (!(query.startsWith("/") && !query.includes(" "))) {
    return [];
  }
  const matches: ContextSuggestion[] = [];
  for (const command of terminalCatalog?.commands ?? []) {
    const label = `/${command.path.join(" ")}`;
    if (label.toLowerCase().includes(query)) {
      matches.push({
        description: command.summary,
        icon: Terminal,
        insertText: `${label}${command.parameters.length > 0 ? " " : ""}`,
        label,
      });
    }
  }
  for (const prompt of contextCatalog?.prompts ?? []) {
    if (
      !promptAcceptsEmptyArguments(prompt.argumentsSchemaJson) ||
      !safeContextToken(prompt.source) ||
      !safeContextToken(prompt.name)
    ) {
      continue;
    }
    const label = `/prompt:${prompt.source}/${prompt.name}`;
    if (label.toLowerCase().includes(query)) {
      matches.push({
        description: prompt.description,
        icon: Package,
        insertText: `/mcp-prompt ${prompt.source}/${prompt.name} `,
        label,
      });
    }
  }
  for (const resource of contextCatalog?.resources ?? []) {
    if (!safeContextToken(resource.source) || /\s/u.test(resource.uri)) {
      continue;
    }
    const label = `/resource:${resource.source}/${resource.name}`;
    if (label.toLowerCase().includes(query)) {
      matches.push({
        description: resource.description,
        icon: FileText,
        insertText: `/mcp-resource ${resource.source}=${resource.uri} `,
        label,
      });
    }
  }
  return matches;
}

function safeContextToken(value: string) {
  return /^[\w.-]+$/u.test(value);
}

function promptAcceptsEmptyArguments(schemaJson: string) {
  try {
    const schema: unknown = JSON.parse(schemaJson);
    if (!(schema && typeof schema === "object" && "required" in schema)) {
      return true;
    }
    return !(Array.isArray(schema.required) && schema.required.length > 0);
  } catch {
    return false;
  }
}

export function AgentPage({ conversationId }: AgentPageProps) {
  const navigate = useNavigate();
  const { selectedTarget } = useAgentTarget();
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const [titleOverride, setTitleOverride] = useState<{
    sessionId: string;
    title: string;
  }>();
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
    changeProfile,
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
    selectedModel,
    selectedReasoningEffort,
    selectedServiceTier,
    selectedTools,
    sessionId,
    setDraft,
    setSelectedModel,
    setSelectedReasoningEffort,
    setSelectedServiceTier,
    setSelectedTools,
    submit,
    trajectory,
    tasks,
    terminalCatalog,
    terminalRuns,
    turns,
    visibleTurns,
  } = useAgentConversation({
    enableTerminal: true,
    initialSessionId:
      conversationId && conversationId !== "new-task"
        ? conversationId
        : undefined,
    onSessionResolved,
    targetId: selectedTarget.id,
  });
  const conversation = Boolean(conversationId || turns.length > 0);
  const displayedConversationId = conversation
    ? (sessionId ?? conversationId ?? "new-task")
    : undefined;
  const conversationTitle = conversation
    ? titleOverride && titleOverride.sessionId === displayedConversationId
      ? titleOverride.title
      : (turns[0]?.user ?? "New chat")
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

  return (
    <div
      {...stylex.props(
        styles.page,
        conversation ? styles.conversationPage : styles.emptyPage,
        conversation &&
          view === "trajectory" &&
          styles.conversationPageTrajectory
      )}
      data-view={conversation ? view : undefined}
    >
      <AgentHeader
        conversationId={displayedConversationId}
        conversationTitle={conversationTitle}
        onRename={
          sessionId && runtime?.capabilities.sessionRename && !isRunning
            ? async (title) => {
                const renamed = await renameSession(title);
                if (renamed) {
                  setTitleOverride({ sessionId, title: renamed });
                }
                return renamed;
              }
            : undefined
        }
        onViewChange={setView}
        view={view}
      />
      {conversation ? (
        view === "trajectory" ? (
          <AgentTrajectory trajectory={trajectory} />
        ) : (
          <AgentConversation
            canEdit={canEdit}
            key={displayedConversationId}
            onEdit={beginEditing}
            runtimeError={runtimeError}
            turns={visibleTurns}
          />
        )
      ) : (
        <div {...stylex.props(styles.emptyCanvas)}>
          <section {...stylex.props(styles.emptyCenter)}>
            <AgentComposer
              canCompact={Boolean(sessionId)}
              canCancel={canCancel}
              contextCatalog={contextCatalog}
              draft={draft}
              isRunning={isRunning}
              modelCatalog={modelCatalog}
              onChange={setDraft}
              onCancel={cancelRunningTurn}
              onCompact={compactSession}
              onModelChange={setSelectedModel}
              onProfileChange={changeProfile}
              onReasoningEffortChange={setSelectedReasoningEffort}
              onServiceTierChange={setSelectedServiceTier}
              onToolsChange={setSelectedTools}
              onSubmit={onSubmit}
              profile={profile}
              ref={textarea}
              runtime={runtime}
              selectedModel={selectedModel}
              selectedReasoningEffort={selectedReasoningEffort}
              selectedServiceTier={selectedServiceTier}
              selectedTools={selectedTools}
              terminalCatalog={terminalCatalog}
            />
            {terminalRuns.length > 0 ? (
              <AgentTerminalShelf runs={terminalRuns} />
            ) : null}
            {suggestionsVisible ? (
              <div {...stylex.props(styles.suggestions)}>
                <div {...stylex.props(styles.suggestionsHeader)}>
                  <span>Get started with some examples</span>
                  <IconButton
                    aria-label="Dismiss examples"
                    onClick={() => setSuggestionsVisible(false)}
                    size="compact"
                    variant="ghost"
                    xstyle={styles.suggestionsHeaderAction}
                  >
                    <X size={13} />
                  </IconButton>
                </div>
                <div {...stylex.props(styles.suggestionGrid)}>
                  {suggestions.map((suggestion) => (
                    <button
                      aria-label={suggestion.title}
                      {...stylex.props(styles.suggestion)}
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
                      <span {...stylex.props(styles.suggestionCopy)}>
                        <strong {...stylex.props(styles.suggestionTitle)}>
                          {suggestion.title}
                        </strong>
                        <span {...stylex.props(styles.suggestionDescription)}>
                          {suggestion.description}
                        </span>
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
        <div
          aria-hidden="true"
          {...stylex.props(styles.trajectoryComposerBackdrop)}
        />
      ) : null}
      {conversation ? (
        <div
          {...stylex.props(
            styles.composerDock,
            Boolean(editingTurnId) && styles.composerDockEditing,
            view === "trajectory" && styles.composerDockTrajectory
          )}
          data-editing={Boolean(editingTurnId) || undefined}
          data-view={view}
        >
          <div
            aria-hidden={!editingTurnId}
            {...stylex.props(
              styles.editingMessageReveal,
              Boolean(editingTurnId) && styles.editingMessageRevealOpen
            )}
            data-open={Boolean(editingTurnId) || undefined}
          >
            <div {...stylex.props(styles.editingMessageClip)}>
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
            <>
              {tasks.length > 0 ? <AgentTaskShelf tasks={tasks} /> : null}
              {terminalRuns.length > 0 ? (
                <AgentTerminalShelf runs={terminalRuns} />
              ) : null}
              {queuedPrompts.length > 0 ? (
                <AgentPromptQueue
                  onRemove={removeQueuedPrompt}
                  prompts={queuedPrompts}
                />
              ) : null}
              <AgentComposer
                canCompact={Boolean(sessionId)}
                canCancel={canCancel}
                contextCatalog={contextCatalog}
                draft={draft}
                isRunning={isRunning}
                modelCatalog={modelCatalog}
                onChange={setDraft}
                onCancel={cancelRunningTurn}
                onCompact={compactSession}
                onModelChange={setSelectedModel}
                onProfileChange={changeProfile}
                onReasoningEffortChange={setSelectedReasoningEffort}
                onServiceTierChange={setSelectedServiceTier}
                onToolsChange={setSelectedTools}
                onSubmit={onSubmit}
                placeholder="Reply…"
                profile={profile}
                ref={textarea}
                runtime={runtime}
                selectedModel={selectedModel}
                selectedReasoningEffort={selectedReasoningEffort}
                selectedServiceTier={selectedServiceTier}
                selectedTools={selectedTools}
                terminalCatalog={terminalCatalog}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AgentHeader({
  conversationId,
  conversationTitle,
  onRename,
  onViewChange,
  view,
}: {
  conversationId: string | undefined;
  conversationTitle: string | null;
  onRename?: ((title: string) => Promise<string | undefined>) | undefined;
  onViewChange: (view: AgentView) => void;
  view: AgentView;
}) {
  const navigate = useNavigate();
  const { selectTarget, selectedTarget, targets } = useAgentTarget();
  const [renaming, setRenaming] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const renameInput = useRef<HTMLInputElement>(null);

  const beginRenaming = () => {
    setTitleDraft(conversationTitle ?? "");
    setRenaming(true);
    requestAnimationFrame(() => renameInput.current?.select());
  };
  const saveRename = async () => {
    setSavingTitle(true);
    try {
      const renamed = await onRename?.(titleDraft);
      if (renamed) {
        setRenaming(false);
      }
    } finally {
      setSavingTitle(false);
    }
  };

  return (
    <PageHeader.Root aria-label="Agent chat navigation" xstyle={styles.header}>
      <PageHeader.Row>
        {renaming && onRename ? (
          <form
            {...stylex.props(styles.renameForm)}
            onSubmit={(event) => {
              event.preventDefault();
              void saveRename();
            }}
          >
            <input
              {...stylex.props(styles.renameInput)}
              aria-label="Conversation title"
              disabled={savingTitle}
              maxLength={200}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setRenaming(false);
                }
              }}
              ref={renameInput}
              value={titleDraft}
            />
            <Button
              disabled={savingTitle || !titleDraft.trim()}
              size="compact"
              type="submit"
            >
              Save
            </Button>
          </form>
        ) : (
          <AgentHistoryMenu
            currentSessionId={conversationId}
            placement="header"
            showNewChat={Boolean(conversationId)}
          >
            <Button size="compact" variant="ghost" xstyle={styles.chatSwitcher}>
              <span {...stylex.props(styles.chatSwitcherLabel)}>
                {conversationTitle ?? "New chat"}
              </span>
              <ChevronDown aria-hidden="true" size={12} />
            </Button>
          </AgentHistoryMenu>
        )}
        {conversationId ? (
          <Tabs.Root
            onValueChange={(value) => onViewChange(value as AgentView)}
            value={view}
            xstyle={styles.viewTabs}
          >
            <Tabs.List aria-label="Agent view">
              <Tabs.Tab value="conversation">Conversation</Tabs.Tab>
              <Tabs.Tab value="trajectory">Trajectory</Tabs.Tab>
            </Tabs.List>
          </Tabs.Root>
        ) : null}
        {targets.length > 1 || (onRename && !renaming) ? (
          <div {...stylex.props(styles.headerActions)}>
            {targets.length > 1 ? (
              <label {...stylex.props(styles.agentTarget)}>
                <Bot aria-hidden="true" size={13} strokeWidth={1.7} />
                <select
                  {...stylex.props(styles.agentTargetSelect)}
                  aria-label="Active Agent"
                  onChange={(event) => {
                    selectTarget(event.target.value as "connected" | "console");
                    navigate({ to: "/" });
                  }}
                  value={selectedTarget.id}
                >
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {onRename && !renaming ? (
              <IconButton
                aria-label="Rename conversation"
                onClick={beginRenaming}
                size="compact"
                variant="ghost"
              >
                <Pencil size={13} />
              </IconButton>
            ) : null}
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
  const [followTail, setFollowTail] = useState(true);

  useEffect(() => {
    const element = conversationRef.current;
    if (element && followTail) {
      element.scrollTop = element.scrollHeight;
    }
  }, [followTail, turns]);

  const jumpToLatest = () => {
    const element = conversationRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
      setFollowTail(true);
    }
  };

  return (
    <section
      aria-label="Agent conversation"
      {...stylex.props(styles.conversation)}
      onScroll={(event) => {
        const element = event.currentTarget;
        const distance =
          element.scrollHeight - element.scrollTop - element.clientHeight;
        setFollowTail(distance <= 48);
      }}
      ref={conversationRef}
    >
      <div {...stylex.props(styles.conversationContent)}>
        <time {...stylex.props(styles.conversationTime)}>Today</time>
        {turns.map((turn) => (
          <div {...stylex.props(styles.turn)} key={turn.id}>
            <div {...stylex.props(styles.userMessageGroup)}>
              <div {...stylex.props(styles.userMessage)}>{turn.user}</div>
              <div {...stylex.props(styles.userMessageActions)}>
                <AgentMessageActions
                  content={turn.user}
                  {...(canEdit ? { onEdit: () => onEdit(turn) } : {})}
                />
              </div>
            </div>
            {turn.work ? (
              <details {...stylex.props(styles.worked)}>
                <summary {...stylex.props(styles.workedSummary)}>
                  <AgentShimmerText
                    active={
                      turn.status === "running" && !turnHasRunningTool(turn)
                    }
                  >
                    {turnStatusLabel(turn)}
                  </AgentShimmerText>
                  <span
                    aria-hidden="true"
                    {...stylex.props(styles.workedChevron)}
                  >
                    <ChevronRight size={14} />
                  </span>
                </summary>
                <div {...stylex.props(styles.workedBody)}>
                  <AgentMarkdown streaming={turn.status === "running"}>
                    {turn.thought || "Open Trajectory to inspect this work."}
                  </AgentMarkdown>
                </div>
              </details>
            ) : null}
            {turn.tools?.length ? <AgentToolCalls tools={turn.tools} /> : null}
            <div {...stylex.props(styles.assistantMessage)}>
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
              <div {...stylex.props(styles.copyMessage)}>
                <AgentMessageActions content={turn.answer} />
              </div>
            ) : null}
          </div>
        ))}
        {turns.length === 0 && runtimeError ? (
          <div {...stylex.props(styles.assistantMessage)}>
            <p>{runtimeError}</p>
          </div>
        ) : null}
      </div>
      {!followTail && (
        <IconButton
          aria-label="Jump to latest"
          onClick={jumpToLatest}
          size="compact"
          variant="secondary"
          xstyle={styles.jumpToLatest}
        >
          <ArrowDown size={14} />
        </IconButton>
      )}
    </section>
  );
}

function AgentToolCalls({ tools }: { tools: AgentToolCall[] }) {
  return (
    <div aria-label="Tool activity" {...stylex.props(styles.toolCalls)}>
      {tools.map((tool) => {
        const Icon = toolIcon(tool.name);
        const label = toolActivityLabel(tool);
        const rows = toolActivityRows(tool);
        return (
          <details
            {...stylex.props(styles.toolCall)}
            data-status={tool.status}
            key={tool.callId}
          >
            <summary {...stylex.props(styles.toolSummary)}>
              <Icon aria-hidden="true" size={15} strokeWidth={1.65} />
              <AgentShimmerText
                active={tool.status === "running"}
                className={stylex.props(styles.toolName).className}
              >
                {label}
              </AgentShimmerText>
              <span aria-hidden="true" {...stylex.props(styles.toolChevron)}>
                <ChevronRight size={14} />
              </span>
            </summary>
            <div {...stylex.props(styles.toolDetails)}>
              {rows.map((row) => {
                const RowIcon = row.icon;
                return (
                  <div {...stylex.props(styles.toolDetailRow)} key={row.label}>
                    <RowIcon aria-hidden="true" size={14} strokeWidth={1.55} />
                    <span
                      {...stylex.props(styles.toolDetailLabel)}
                      title={row.title}
                    >
                      {row.label}
                    </span>
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
  canCompact,
  canCancel,
  contextCatalog,
  draft,
  isRunning,
  modelCatalog,
  onChange,
  onCancel,
  onCompact,
  onModelChange,
  onProfileChange,
  onReasoningEffortChange,
  onServiceTierChange,
  onToolsChange,
  onSubmit,
  placeholder = "Ask Lenso…",
  profile,
  ref,
  runtime,
  selectedModel,
  selectedReasoningEffort,
  selectedServiceTier,
  selectedTools,
  terminalCatalog,
}: {
  canCompact: boolean;
  canCancel: boolean;
  contextCatalog: AgentContextCatalog | undefined;
  draft: string;
  isRunning: boolean;
  modelCatalog: AgentModelCatalog | undefined;
  onChange: (value: string) => void;
  onCancel: () => void;
  onCompact: () => void;
  onModelChange: (value: string | undefined) => void;
  onProfileChange: (value: string | undefined) => void;
  onReasoningEffortChange: (value: string | undefined) => void;
  onServiceTierChange: (value: string | undefined) => void;
  onToolsChange: (value: string[]) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder?: string;
  profile: string | undefined;
  ref: React.Ref<HTMLTextAreaElement>;
  runtime: AgentBootstrap | undefined;
  selectedModel: string | undefined;
  selectedReasoningEffort: string | undefined;
  selectedServiceTier: string | undefined;
  selectedTools: string[] | undefined;
  terminalCatalog: AgentTerminalCatalog | undefined;
}) {
  const selectableModels = modelsForSelector(modelCatalog, selectedModel);
  const effectiveModel =
    selectedModel ?? modelCatalog?.selectedModel ?? selectableModels[0]?.id;
  const activeModel = modelCatalog?.models.find(
    (model) => model.id === effectiveModel
  );
  const allowedToolNames = new Set(runtime?.tools.allowed);
  const selectedToolNames = new Set(selectedTools);
  const availableTurnTools = [];
  for (const tool of runtime?.tools.available ?? []) {
    if (allowedToolNames.has(tool.name)) {
      availableTurnTools.push(tool);
    }
  }
  const contextSuggestions = matchingComposerSuggestions(
    contextCatalog,
    terminalCatalog,
    draft
  );
  return (
    <PromptComposer.Root
      xstyle={styles.composer}
      onSubmit={onSubmit}
      onValueChange={onChange}
      submitShortcut="enter"
      surfaceXstyle={styles.composerSurface}
      value={draft}
    >
      <PromptComposer.Input
        aria-label="Send a message to Lenso Agent"
        xstyle={styles.textarea}
        placeholder={placeholder}
        ref={ref}
        rows={2}
      />
      {contextSuggestions.length > 0 ? (
        <div
          aria-label="Context Source suggestions"
          {...stylex.props(styles.contextSuggestions)}
        >
          {contextSuggestions.map((suggestion) => (
            <button
              aria-label={`${suggestion.label}: ${suggestion.description}`}
              {...stylex.props(styles.contextSuggestion)}
              key={suggestion.insertText}
              onClick={() => onChange(suggestion.insertText)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <suggestion.icon
                aria-hidden="true"
                className={stylex.props(styles.contextSuggestionIcon).className}
                size={14}
              />
              <span>
                <strong {...stylex.props(styles.contextSuggestionTitle)}>
                  {suggestion.label}
                </strong>
                <small {...stylex.props(styles.contextSuggestionDescription)}>
                  {suggestion.description}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <PromptComposer.Toolbar xstyle={styles.composerFooter}>
        <SkillsMenu>
          <Button
            aria-label="Skills"
            size="compact"
            variant="ghost"
            xstyle={styles.skillsButton}
          >
            <Box aria-hidden="true" size={13} strokeWidth={1.7} />
            Skills
            <ChevronDown aria-hidden="true" size={12} />
          </Button>
        </SkillsMenu>
        {runtime?.capabilities.profileSelection ? (
          <TurnSelect
            aria-label="Agent mode"
            disabled={isRunning}
            icon={<Terminal aria-hidden="true" size={12} />}
            onValueChange={(value) => onProfileChange(value || undefined)}
            options={[
              { label: "Normal", value: "" },
              { label: "Plan", value: "plan" },
              { label: "Auto", value: "code" },
            ]}
            value={profile ?? ""}
          />
        ) : null}
        {selectableModels.length ? (
          <TurnSelect
            aria-label="Model"
            disabled={isRunning}
            icon={<Bot aria-hidden="true" size={12} />}
            onValueChange={(value) => {
              onModelChange(value);
              onReasoningEffortChange(undefined);
              onServiceTierChange(undefined);
            }}
            options={selectableModels.map((model) => ({
              label: model.hidden
                ? `${model.displayName} (hidden)`
                : model.displayName,
              value: model.id,
            }))}
            value={effectiveModel ?? ""}
          />
        ) : null}
        {activeModel?.reasoningEfforts.length ? (
          <TurnSelect
            aria-label="Reasoning effort"
            disabled={isRunning}
            icon={<Gauge aria-hidden="true" size={12} />}
            onValueChange={(value) =>
              onReasoningEffortChange(value || undefined)
            }
            options={[
              { label: "Default", value: "" },
              ...activeModel.reasoningEfforts.map((effort) => ({
                label: effort,
                value: effort,
              })),
            ]}
            value={selectedReasoningEffort ?? ""}
          />
        ) : null}
        {activeModel?.serviceTiers.length ? (
          <TurnSelect
            aria-label="Service tier"
            disabled={isRunning}
            icon={<Gauge aria-hidden="true" size={12} />}
            onValueChange={(value) => onServiceTierChange(value || undefined)}
            options={[
              { label: "Standard", value: "" },
              ...activeModel.serviceTiers.map((tier) => ({
                label: tier,
                value: tier,
              })),
            ]}
            value={selectedServiceTier ?? ""}
          />
        ) : null}
        {runtime?.capabilities.turnToolSelection && selectedTools ? (
          <Menu.Root>
            <Menu.Trigger
              render={
                <Button
                  disabled={isRunning}
                  size="compact"
                  variant="ghost"
                  xstyle={styles.turnControl}
                >
                  <ShieldCheck aria-hidden="true" size={12} />
                  {runtime.tools.allowed.length === 0
                    ? "No tools"
                    : selectedTools.length === runtime.tools.allowed.length
                      ? "Tools"
                      : `${selectedTools.length} tools`}
                  <ChevronDown aria-hidden="true" size={11} />
                </Button>
              }
            />
            <Menu.Portal>
              <Menu.Positioner align="start" side="top" sideOffset={6}>
                <Menu.Popup aria-label="Turn permissions">
                  {availableTurnTools.map((tool) => {
                    const enabled = selectedToolNames.has(tool.name);
                    return (
                      <Menu.Item
                        key={tool.name}
                        onClick={() =>
                          onToolsChange(
                            enabled
                              ? selectedTools.filter(
                                  (name) => name !== tool.name
                                )
                              : [...selectedTools, tool.name]
                          )
                        }
                      >
                        <Menu.Label>
                          {enabled ? "✓ " : ""}
                          {tool.name}
                        </Menu.Label>
                      </Menu.Item>
                    );
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : null}
        {runtime?.capabilities.sessionCompact && canCompact ? (
          <IconButton
            aria-label="Compact conversation context"
            disabled={isRunning}
            onClick={onCompact}
            size="compact"
            type="button"
            variant="ghost"
            xstyle={styles.compactButton}
          >
            <Minimize2 size={13} />
          </IconButton>
        ) : null}
        <PromptComposer.Actions xstyle={styles.composerActions}>
          <IconButton
            aria-label="Attach images, files, or videos"
            size="compact"
            variant="ghost"
            xstyle={styles.attachButton}
          >
            <Paperclip size={14} strokeWidth={1.7} />
          </IconButton>
          {isRunning && canCancel ? (
            <IconButton
              aria-label="Stop generating"
              onClick={onCancel}
              size="compact"
              type="button"
              variant="ghost"
              xstyle={styles.stopButton}
            >
              <Square fill="currentColor" size={9} strokeWidth={0} />
            </IconButton>
          ) : null}
          <IconButton
            aria-label={isRunning ? "Queue follow-up" : "Submit comment"}
            data-active={Boolean(draft.trim()) || undefined}
            disabled={!draft.trim()}
            size="compact"
            type="submit"
            variant="secondary"
            xstyle={[
              styles.sendButton,
              Boolean(draft.trim()) && styles.sendButtonActive,
            ]}
          >
            <ArrowUp size={14} strokeWidth={1.9} />
          </IconButton>
        </PromptComposer.Actions>
      </PromptComposer.Toolbar>
    </PromptComposer.Root>
  );
}

function TurnSelect({
  "aria-label": ariaLabel,
  disabled,
  icon,
  onValueChange,
  options,
  value,
}: {
  "aria-label": string;
  disabled: boolean;
  icon: ReactNode;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}) {
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];
  return (
    <Select.Root
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") {
          onValueChange(nextValue);
        }
      }}
      value={value}
    >
      <Select.Trigger aria-label={ariaLabel} xstyle={styles.turnControl}>
        {icon}
        <Select.Value>{selectedOption?.label ?? value}</Select.Value>
        <ChevronDown aria-hidden="true" size={11} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="start" position="popper" sideOffset={6}>
          <Select.Popup>
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function AgentPromptQueue({
  onRemove,
  prompts,
}: {
  onRemove: (id: string) => void;
  prompts: { id: string; prompt: string }[];
}) {
  return (
    <div aria-label="Queued prompts" {...stylex.props(styles.promptQueue)}>
      <span {...stylex.props(styles.queueLabel)}>Queued</span>
      <div {...stylex.props(styles.queueItems)}>
        {prompts.map((prompt) => (
          <div {...stylex.props(styles.queueItem)} key={prompt.id}>
            <span {...stylex.props(styles.queueItemLabel)}>
              {prompt.prompt}
            </span>
            <IconButton
              aria-label="Remove queued prompt"
              onClick={() => onRemove(prompt.id)}
              size="compact"
              variant="ghost"
            >
              <X size={11} />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentTerminalShelf({ runs }: { runs: AgentTerminalRun[] }) {
  return (
    <div
      aria-label="Terminal command output"
      {...stylex.props(styles.terminalShelf)}
    >
      {runs.map((run) => (
        <details
          {...stylex.props(styles.terminalRun)}
          data-status={run.status}
          key={run.id}
          open={run.status === "running"}
        >
          <summary {...stylex.props(styles.terminalSummary)}>
            <Terminal aria-hidden="true" size={13} />
            <code {...stylex.props(styles.terminalCode)}>
              {run.commandLine}
            </code>
            <span {...stylex.props(styles.terminalStatus)}>{run.status}</span>
          </summary>
          <pre {...stylex.props(styles.terminalOutput)}>
            {run.messages.map((message, index) => (
              <span
                {...stylex.props(
                  message.kind === "stderr" && styles.terminalStderr
                )}
                data-kind={message.kind}
                key={`${run.id}:${index}`}
              >
                {message.content}
              </span>
            ))}
            {run.error ? (
              <span {...stylex.props(styles.terminalStderr)} data-kind="stderr">
                {run.error}
              </span>
            ) : null}
          </pre>
        </details>
      ))}
    </div>
  );
}

function AgentTaskShelf({ tasks }: { tasks: AgentTask[] }) {
  return (
    <div aria-label="Agent tasks" {...stylex.props(styles.taskShelf)}>
      {tasks.map((task) => (
        <div
          {...stylex.props(styles.taskItem)}
          data-status={task.status}
          key={task.taskId}
        >
          <span
            {...stylex.props(
              styles.taskStatus,
              task.status === "running" && styles.taskStatusRunning
            )}
          />
          <span {...stylex.props(styles.taskAgent)}>{task.agent}</span>
          <span {...stylex.props(styles.taskProgress)}>
            {task.progress ?? task.status}
          </span>
        </div>
      ))}
    </div>
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
