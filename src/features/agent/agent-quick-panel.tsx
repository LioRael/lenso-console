import "@fontsource-variable/inter/wght.css";
import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import { IconButton } from "@lenso/ui/icon-button";
import { Surface } from "@lenso/ui/surface";
import {
  ArrowUp,
  Box,
  ChevronDown,
  Minus,
  MoreHorizontal,
  MoveDiagonal2,
  MousePointer2,
  Paperclip,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  AgentMessageActions,
  EditingMessageBar,
} from "./agent-message-controls";
import agentPointerGradient from "./agent-pointer-gradient.svg";

import styles from "./agent-quick-panel.module.css";

const suggestions = [
  { icon: Box, label: "Create a new App" },
  { icon: Search, label: "Research a topic" },
  { icon: UsersRound, label: "Set up new team" },
] as const;

type QuickMessage = {
  content: string;
  id: number;
  role: "assistant" | "user";
};

function chatTitleFor(prompt: string) {
  const normalizedPrompt = (prompt.split(/[.!?]/u)[0] || prompt).replace(
    /\bthe word\s+/iu,
    ""
  );
  const words = normalizedPrompt
    .replace(/[.!?]+$/u, "")
    .trim()
    .split(/\s+/u)
    .slice(0, 4);
  return words.join(" ") || "New chat";
}

function mockReplyFor(prompt: string) {
  if (/\bhello\b/iu.test(prompt)) {
    return "hello";
  }
  return "I’m ready to help with that. Agent execution will appear here once it is connected.";
}

function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

export function AgentQuickPanel({
  onOpenFullPage,
}: {
  onOpenFullPage: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [title, setTitle] = useState("New chat");
  const [createdAt, setCreatedAt] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const replyDraft = useRef("");
  const conversationRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextMessageId = useRef(0);
  const timers = useRef<number[]>([]);

  const hasConversation = messages.length > 0 || thinking;
  const isEditing = editingMessageId !== null;
  const showWelcome = !hasConversation && !draft.trim();

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    const lineHeight = 20.796_875;
    const verticalPadding = 4;
    const lineCount = Math.max(
      1,
      Math.round((textarea.scrollHeight - verticalPadding) / lineHeight)
    );
    textarea.style.height = `${Math.min(lineCount * lineHeight + verticalPadding, 124)}px`;
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [draft, resizeTextarea]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    []
  );

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }
  }, [messages, thinking]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || thinking) {
      return;
    }
    if (editingMessageId !== null) {
      const editedMessageIndex = messages.findIndex(
        (message) => message.id === editingMessageId
      );
      if (editedMessageIndex === -1) {
        return;
      }
      const retainedMessages = messages.slice(0, editedMessageIndex);
      const editedMessage = messages[editedMessageIndex];
      if (!editedMessage) {
        return;
      }
      setMessages([...retainedMessages, { ...editedMessage, content: prompt }]);
      setEditingMessageId(null);
      setDraft(replyDraft.current);
      setThinking(true);
      timers.current.push(
        window.setTimeout(() => {
          const assistantMessageId = nextMessageId.current;
          nextMessageId.current += 1;
          setMessages((current) => [
            ...current,
            {
              content: mockReplyFor(prompt),
              id: assistantMessageId,
              role: "assistant",
            },
          ]);
          setThinking(false);
        }, 1100)
      );
      return;
    }
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
    }).format(new Date());
    setCreatedAt((current) => current || `Today ${time}`);
    const userMessageId = nextMessageId.current;
    nextMessageId.current += 1;
    setMessages((current) => [
      ...current,
      { content: prompt, id: userMessageId, role: "user" },
    ]);
    setDraft("");
    setThinking(true);
    window.requestAnimationFrame(() => textareaRef.current?.focus());

    if (messages.length === 0) {
      timers.current.push(
        window.setTimeout(() => setTitle(chatTitleFor(prompt)), 300)
      );
    }
    timers.current.push(
      window.setTimeout(() => {
        const assistantMessageId = nextMessageId.current;
        nextMessageId.current += 1;
        setMessages((current) => [
          ...current,
          {
            content: mockReplyFor(prompt),
            id: assistantMessageId,
            role: "assistant",
          },
        ]);
        setThinking(false);
      }, 1100)
    );
  };

  const beginEditing = (message: QuickMessage) => {
    replyDraft.current = draft;
    setEditingMessageId(message.id);
    setDraft(message.content);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setDraft(replyDraft.current);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <>
      {hasConversation ? (
        <Button
          aria-label={title}
          className={styles.chatChip}
          onClick={() => setOpen(true)}
          size="compact"
          variant="secondary"
        >
          {title}
        </Button>
      ) : null}
      <Dialog.Root modal={false} onOpenChange={setOpen} open={open}>
        <Dialog.Trigger
          render={
            <Button
              aria-label="Agent"
              className={styles.trigger}
              data-agent-action="open"
              data-open={open || undefined}
              size="compact"
              variant="ghost"
            />
          }
        >
          <MousePointer2 aria-hidden="true" size={14} strokeWidth={1.6} />
          Agent
        </Dialog.Trigger>

        <Dialog.Portal className={styles.portal}>
          <Dialog.Popup className={styles.panel}>
            <header className={styles.header}>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              {hasConversation ? (
                <IconButton
                  aria-label="Chat options"
                  className={styles.chatOptions}
                  size="default"
                  variant="ghost"
                >
                  <MoreHorizontal aria-hidden="true" size={14} />
                </IconButton>
              ) : null}
              <div className={styles.headerActions}>
                <IconButton
                  aria-label="Minimize chat"
                  onClick={() => setOpen(false)}
                  size="default"
                  variant="ghost"
                >
                  <Minus aria-hidden="true" size={14} strokeWidth={1.7} />
                </IconButton>
                <IconButton
                  aria-label="Open full page"
                  onClick={() => {
                    setOpen(false);
                    onOpenFullPage();
                  }}
                  size="default"
                  variant="ghost"
                >
                  <MoveDiagonal2
                    aria-hidden="true"
                    size={14}
                    strokeWidth={1.7}
                  />
                </IconButton>
                <IconButton
                  aria-label="Close chat"
                  onClick={() => {
                    if (!hasConversation) {
                      setDraft("");
                    }
                    setOpen(false);
                  }}
                  size="default"
                  variant="ghost"
                >
                  <X aria-hidden="true" size={14} strokeWidth={1.7} />
                </IconButton>
              </div>
            </header>

            <div
              className={styles.body}
              data-conversation={!showWelcome || undefined}
            >
              {showWelcome ? (
                <>
                  <div className={styles.welcome}>
                    <img
                      alt=""
                      aria-hidden="true"
                      className={styles.welcomeIcon}
                      height={14}
                      src={agentPointerGradient}
                      width={14}
                    />
                    <strong>Welcome to Lenso</strong>
                    <span>Ask anything or tell Lenso what you need</span>
                  </div>

                  <div
                    aria-label="Agent suggestions"
                    className={styles.suggestions}
                  >
                    {suggestions.map((suggestion) => {
                      const Icon = suggestion.icon;
                      return (
                        <Button
                          className={styles.suggestion}
                          key={suggestion.label}
                          onClick={() => setDraft(suggestion.label)}
                          size="compact"
                          variant="secondary"
                        >
                          <Icon
                            aria-hidden="true"
                            size={14}
                            strokeWidth={1.6}
                          />
                          <span className={styles.suggestionLabel}>
                            {suggestion.label}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </>
              ) : isEditing ? null : (
                <section
                  aria-label="Agent conversation"
                  className={styles.conversation}
                  ref={conversationRef}
                >
                  {createdAt ? (
                    <time className={styles.conversationTime}>{createdAt}</time>
                  ) : null}
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <div className={styles.userTurn} key={message.id}>
                        <div className={styles.userMessage}>
                          {message.content}
                        </div>
                        <div className={styles.messageActions}>
                          <AgentMessageActions
                            content={message.content}
                            onEdit={() => beginEditing(message)}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className={styles.assistantTurn} key={message.id}>
                        <p>{message.content}</p>
                        <div className={styles.assistantCopy}>
                          <AgentMessageActions content={message.content} />
                        </div>
                      </div>
                    )
                  )}
                  {thinking ? (
                    <div className={styles.thinking}>Thinking…</div>
                  ) : null}
                </section>
              )}

              <div className={styles.composerDock}>
                <div
                  className={styles.inputWrapper}
                  data-editing={isEditing || undefined}
                >
                  <div
                    aria-hidden={!isEditing}
                    className={styles.editingSlot}
                    data-open={isEditing || undefined}
                  >
                    <div className={styles.editingSlotContent}>
                      <EditingMessageBar compact onCancel={cancelEditing} />
                    </div>
                  </div>
                  <Surface
                    className={styles.composer}
                    level="panel"
                    render={<form onSubmit={submit} />}
                  >
                    <textarea
                      aria-label="Send a message to Lenso Agent"
                      autoFocus
                      className={styles.textarea}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder={
                        hasConversation
                          ? "Reply…"
                          : "@ to mention any App, Plugin, or workspace"
                      }
                      ref={textareaRef}
                      rows={1}
                      value={draft}
                    />
                    <div className={styles.composerFooter}>
                      <Button
                        aria-label="Skills"
                        className={styles.skills}
                        size="compact"
                        variant="ghost"
                      >
                        <Box aria-hidden="true" size={14} strokeWidth={1.6} />
                        Skills
                        <ChevronDown
                          aria-hidden="true"
                          size={8}
                          strokeWidth={2}
                        />
                      </Button>
                      <IconButton
                        aria-label="Attach images, files, or videos"
                        className={styles.attach}
                        size="compact"
                        variant="ghost"
                      >
                        <Paperclip
                          aria-hidden="true"
                          size={14}
                          strokeWidth={1.7}
                        />
                      </IconButton>
                      <IconButton
                        aria-label="Submit comment"
                        className={styles.submit}
                        data-active={Boolean(draft.trim()) || undefined}
                        size="compact"
                        type="submit"
                        variant="secondary"
                      >
                        <ArrowUp
                          aria-hidden="true"
                          size={16}
                          strokeWidth={1.7}
                        />
                      </IconButton>
                    </div>
                  </Surface>
                </div>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
