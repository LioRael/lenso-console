import "@fontsource-variable/inter/wght.css";
import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import { IconButton } from "@lenso/ui/icon-button";
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
  Square,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { PromptComposer } from "../../components/lenso/recipes/prompt-composer";
import { AgentAskUser } from "./agent-ask-user";
import { AgentMarkdown } from "./agent-markdown";
import {
  AgentMessageActions,
  EditingMessageBar,
} from "./agent-message-controls";
import agentPointerGradient from "./agent-pointer-gradient.svg";
import type { AgentTurn } from "./agent-runtime";
import { AgentShimmerText } from "./agent-shimmer-text";
import { useAgentTarget } from "./agent-target-context";
import { useAgentConversation } from "./use-agent-conversation";

import styles from "./agent-quick-panel.module.css";

const suggestions = [
  { icon: Box, label: "Create a new App" },
  { icon: Search, label: "Research a topic" },
  { icon: UsersRound, label: "Set up new team" },
] as const;

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

export function AgentQuickPanel({
  onOpenFullPage,
}: {
  onOpenFullPage: (sessionId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { selectedTarget } = useAgentTarget();
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
    turns,
    visibleTurns,
  } = useAgentConversation({ targetId: selectedTarget.id });
  const conversationRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasConversation = turns.length > 0 || isRunning;
  const isEditing = Boolean(editingTurnId);
  const showWelcome = !hasConversation && !draft.trim();
  const title = turns[0]?.user ? chatTitleFor(turns[0].user) : "New chat";

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }
  }, [isRunning, visibleTurns]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const beginEditing = (turn: AgentTurn) => {
    beginEditingTurn(turn);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const cancelEditing = () => {
    cancelEditingTurn();
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
                    onOpenFullPage(sessionId);
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
                  <time className={styles.conversationTime}>Today</time>
                  {visibleTurns.map((turn) => (
                    <div className={styles.quickTurn} key={turn.id}>
                      <div className={styles.userTurn}>
                        <div className={styles.userMessage}>{turn.user}</div>
                        <div className={styles.messageActions}>
                          <AgentMessageActions
                            content={turn.user}
                            {...(canEdit && turn.status === "completed"
                              ? { onEdit: () => beginEditing(turn) }
                              : {})}
                          />
                        </div>
                      </div>
                      <div className={styles.assistantTurn}>
                        {turn.answer ? (
                          <AgentMarkdown
                            compact
                            streaming={turn.status === "running"}
                          >
                            {turn.answer}
                          </AgentMarkdown>
                        ) : null}
                        {turn.status === "running" ? (
                          <p>
                            <AgentShimmerText active>Working…</AgentShimmerText>
                          </p>
                        ) : null}
                        {turn.error ? <p>{turn.error}</p> : null}
                        {turn.answer ? (
                          <div className={styles.assistantCopy}>
                            <AgentMessageActions content={turn.answer} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {visibleTurns.length === 0 && runtimeError ? (
                    <div className={styles.assistantTurn}>
                      <p>{runtimeError}</p>
                    </div>
                  ) : null}
                </section>
              )}

              <div className={styles.composerDock}>
                {pendingInteraction ? (
                  <AgentAskUser
                    canCancel={canCancel}
                    compact
                    interaction={pendingInteraction}
                    isSubmitting={isAnsweringInteraction}
                    onCancel={cancelRunningTurn}
                    onSubmit={answerInteraction}
                  />
                ) : (
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
                    <PromptComposer.Root
                      className={styles.composer}
                      maxRows={6}
                      onSubmit={onSubmit}
                      onValueChange={setDraft}
                      submitShortcut="enter"
                      surfaceClassName={styles.composerSurface}
                      value={draft}
                    >
                      <PromptComposer.Input
                        aria-label="Send a message to Lenso Agent"
                        autoFocus
                        className={styles.textarea}
                        placeholder={
                          hasConversation
                            ? "Reply…"
                            : "@ to mention any App, Plugin, or workspace"
                        }
                        ref={textareaRef}
                        rows={1}
                      />
                      <PromptComposer.Toolbar className={styles.composerFooter}>
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
                        <PromptComposer.Actions
                          className={styles.composerActions}
                        >
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
                            aria-label={
                              isRunning ? "Stop generating" : "Submit comment"
                            }
                            className={styles.submit}
                            data-active={
                              (isRunning ? canCancel : Boolean(draft.trim())) ||
                              undefined
                            }
                            disabled={isRunning ? !canCancel : !draft.trim()}
                            onClick={isRunning ? cancelRunningTurn : undefined}
                            size="compact"
                            type={isRunning ? "button" : "submit"}
                            variant="secondary"
                          >
                            {isRunning ? (
                              <Square
                                aria-hidden="true"
                                fill="currentColor"
                                size={8}
                                strokeWidth={0}
                              />
                            ) : (
                              <ArrowUp
                                aria-hidden="true"
                                size={16}
                                strokeWidth={1.7}
                              />
                            )}
                          </IconButton>
                        </PromptComposer.Actions>
                      </PromptComposer.Toolbar>
                    </PromptComposer.Root>
                  </div>
                )}
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
