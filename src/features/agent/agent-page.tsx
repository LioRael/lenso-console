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
  Check,
  ChevronDown,
  Copy,
  MoreHorizontal,
  Package,
  Paperclip,
  Plus,
  Search,
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
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  AgentMessageActions,
  EditingMessageBar,
} from "./agent-message-controls";
import { agentConversations, demoAgentConversation } from "./agent-model";
import { AgentTrajectory } from "./agent-trajectory";

import styles from "./agent-page.module.css";

type AgentPageProps = {
  conversationId?: string;
};

type AgentView = "conversation" | "trajectory";

type AgentTurn = {
  answer: readonly string[];
  duration: string;
  result: boolean;
  thought: string;
  user: string;
};

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
  const [editingTurnIndex, setEditingTurnIndex] = useState<number | null>(null);
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const [view, setView] = useState<AgentView>("conversation");
  const [turns, setTurns] = useState<AgentTurn[]>(() =>
    demoAgentConversation.turns.map((turn) => ({ ...turn }))
  );
  const textarea = useRef<HTMLTextAreaElement>(null);
  const conversation = conversationId ? demoAgentConversation : null;
  const conversationTitle = conversationId
    ? (agentConversations.find((item) => item.id === conversationId)?.title ??
      demoAgentConversation.title)
    : null;
  const isEditing = editingTurnIndex !== null;

  const submit = useCallback(() => {
    const prompt = draft.trim();
    if (!prompt) {
      return;
    }
    if (editingTurnIndex !== null) {
      setTurns((current) =>
        current.map((turn, index) =>
          index === editingTurnIndex ? { ...turn, user: prompt } : turn
        )
      );
      setEditingTurnIndex(null);
      setDraft("");
      return;
    }
    setDraft("");
    navigate({ params: { chatId: "new-task" }, to: "/agent/$chatId" });
  }, [draft, editingTurnIndex, navigate]);

  const beginEditing = (index: number) => {
    setEditingTurnIndex(index);
    setDraft(turns[index]?.user ?? "");
    window.requestAnimationFrame(() => textarea.current?.focus());
  };

  const cancelEditing = () => {
    setEditingTurnIndex(null);
    setDraft("");
    window.requestAnimationFrame(() => textarea.current?.focus());
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
        conversationId={conversationId}
        conversationTitle={conversationTitle}
        onViewChange={setView}
        view={view}
      />
      {conversation ? (
        view === "trajectory" ? (
          <AgentTrajectory />
        ) : (
          <AgentConversation
            editingTurnIndex={editingTurnIndex}
            onEdit={beginEditing}
            turns={turns}
          />
        )
      ) : (
        <div className={styles.emptyCanvas}>
          <section className={styles.emptyCenter}>
            <AgentComposer
              draft={draft}
              onChange={setDraft}
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
          data-editing={isEditing || undefined}
          data-view={view}
        >
          <div
            aria-hidden={!isEditing}
            className={styles.editingMessageReveal}
            data-open={isEditing || undefined}
          >
            <div className={styles.editingMessageClip}>
              <EditingMessageBar onCancel={cancelEditing} />
            </div>
          </div>
          <AgentComposer
            draft={draft}
            onChange={setDraft}
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
  const navigate = useNavigate();
  const [historyQuery, setHistoryQuery] = useState("");
  const normalizedQuery = historyQuery.trim().toLocaleLowerCase();
  const visibleConversations = agentConversations.filter((item) =>
    item.title.toLocaleLowerCase().includes(normalizedQuery)
  );
  const sections = ["Today", "2 weeks ago"] as const;

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
                <form
                  className={styles.chatSearch}
                  onSubmit={(event) => event.preventDefault()}
                >
                  <input
                    aria-label="Chat history"
                    autoFocus
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") {
                        event.stopPropagation();
                      }
                    }}
                    placeholder="Chat history"
                    type="search"
                    value={historyQuery}
                  />
                </form>
                {conversationId ? (
                  <Menu.Item
                    className={styles.newChatItem}
                    onClick={() => navigate({ to: "/" })}
                  >
                    <Menu.Leading>
                      <Plus aria-hidden="true" size={14} strokeWidth={1.7} />
                    </Menu.Leading>
                    <Menu.Label>New chat</Menu.Label>
                  </Menu.Item>
                ) : null}
                {conversationId ? <Menu.Separator /> : null}
                {sections.map((section, sectionIndex) => {
                  const items = visibleConversations.filter(
                    (item) => item.section === section
                  );
                  if (items.length === 0) {
                    return null;
                  }
                  return (
                    <div className={styles.chatSection} key={section}>
                      {sectionIndex > 0 ? <Menu.Separator /> : null}
                      <div className={styles.chatSectionLabel}>{section}</div>
                      {items.map((item) => (
                        <Menu.Item
                          className={styles.chatHistoryItem}
                          data-current={item.id === conversationId || undefined}
                          key={item.id}
                          onClick={() =>
                            navigate({
                              params: { chatId: item.id },
                              to: "/agent/$chatId",
                            })
                          }
                        >
                          <Menu.Label>{item.title}</Menu.Label>
                          <Menu.Trailing>
                            <span className={styles.chatItemMeta}>
                              {item.id === conversationId ? (
                                <span>Current</span>
                              ) : null}
                              <span>{item.age}</span>
                            </span>
                          </Menu.Trailing>
                        </Menu.Item>
                      ))}
                    </div>
                  );
                })}
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
  editingTurnIndex,
  onEdit,
  turns,
}: {
  editingTurnIndex: number | null;
  onEdit: (index: number) => void;
  turns: AgentTurn[];
}) {
  const conversationRef = useRef<HTMLElement>(null);
  const visibleTurns =
    editingTurnIndex === null ? turns : turns.slice(0, editingTurnIndex);

  useEffect(() => {
    const element = conversationRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  return (
    <section
      aria-label="Agent conversation"
      className={styles.conversation}
      ref={conversationRef}
    >
      <div className={styles.conversationContent}>
        <time className={styles.conversationTime}>
          {demoAgentConversation.createdAt}
        </time>
        {visibleTurns.map((turn, index) => (
          <div className={styles.turn} key={turn.user}>
            <div className={styles.userMessageGroup}>
              <div className={styles.userMessage}>{turn.user}</div>
              <div className={styles.userMessageActions}>
                <AgentMessageActions
                  content={turn.user}
                  onEdit={() => onEdit(index)}
                />
              </div>
            </div>
            <details className={styles.worked}>
              <summary>{turn.duration}</summary>
              <p>{turn.thought}</p>
              {turn.result ? (
                <span className={styles.toolResult}>
                  <Check size={13} /> Created App
                </span>
              ) : null}
            </details>
            <div className={styles.assistantMessage}>
              {turn.answer.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {turn.result ? <AppResultCard /> : null}
            <div className={styles.copyMessage}>
              <AgentMessageActions content={turn.answer.join("\n\n")} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AppResultCard() {
  return (
    <article className={styles.resultCard}>
      <div className={styles.resultTitle}>
        <Box size={15} /> Support Desk
      </div>
      <div className={styles.resultMeta}>
        <span>
          <span className={styles.statusRing} /> Ready
        </span>
        <span>
          <Package size={13} /> 3 Plugins
        </span>
        <span>Local workspace</span>
      </div>
    </article>
  );
}

function AgentComposer({
  draft,
  onChange,
  onKeyDown,
  onSubmit,
  placeholder = "Ask Lenso…",
  ref,
}: {
  draft: string;
  onChange: (value: string) => void;
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
          aria-label="Submit comment"
          className={styles.sendButton}
          data-active={Boolean(draft.trim()) || undefined}
          disabled={!draft.trim()}
          size="compact"
          type="submit"
          variant="secondary"
        >
          <ArrowUp size={14} strokeWidth={1.9} />
        </IconButton>
      </div>
    </Surface>
  );
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
