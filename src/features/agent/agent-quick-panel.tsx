import "@fontsource-variable/inter/wght.css";
import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import { IconButton } from "@lenso/ui/icon-button";
import * as stylex from "@stylexjs/stylex";
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
import { useAgentIdentity } from "./agent-identity-context";
import { AgentMarkdown } from "./agent-markdown";
import {
  AgentMessageActions,
  EditingMessageBar,
} from "./agent-message-controls";
import agentPointerGradient from "./agent-pointer-gradient.svg";
import { agentQuickPanelStyles as styles } from "./agent-quick-panel.stylex";
import type { AgentTurn } from "./agent-runtime";
import { AgentShimmerText } from "./agent-shimmer-text";
import { useAgentConversation } from "./use-agent-conversation";

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
  onOpenFullPage: (agentId: string, sessionId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { selectedAgent } = useAgentIdentity();
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
  } = useAgentConversation({ targetId: selectedAgent.id });
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
          onClick={() => setOpen(true)}
          size="compact"
          variant="secondary"
          xstyle={styles.chatChip}
        >
          {title}
        </Button>
      ) : null}
      <Dialog.Root modal={false} onOpenChange={setOpen} open={open}>
        <Dialog.Trigger
          render={
            <Button
              aria-label="Agent"
              data-agent-action="open"
              data-open={open || undefined}
              size="compact"
              variant="ghost"
              xstyle={[styles.trigger, open && styles.triggerOpen]}
            />
          }
        >
          <MousePointer2 aria-hidden="true" size={14} strokeWidth={1.6} />
          Agent
        </Dialog.Trigger>

        <Dialog.Portal className={stylex.props(styles.portal).className}>
          <Dialog.Popup xstyle={styles.panel}>
            <header {...stylex.props(styles.header)}>
              <Dialog.Title xstyle={styles.title}>{title}</Dialog.Title>
              {hasConversation ? (
                <IconButton
                  aria-label="Chat options"
                  size="default"
                  variant="ghost"
                  xstyle={styles.chatOptions}
                >
                  <MoreHorizontal aria-hidden="true" size={14} />
                </IconButton>
              ) : null}
              <div {...stylex.props(styles.headerActions)}>
                <IconButton
                  aria-label="Minimize chat"
                  onClick={() => setOpen(false)}
                  size="default"
                  variant="ghost"
                  xstyle={styles.headerAction}
                >
                  <Minus aria-hidden="true" size={14} strokeWidth={1.7} />
                </IconButton>
                <IconButton
                  aria-label="Open full page"
                  onClick={() => {
                    setOpen(false);
                    onOpenFullPage(selectedAgent.id, sessionId);
                  }}
                  size="default"
                  variant="ghost"
                  xstyle={styles.headerAction}
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
                  xstyle={styles.headerAction}
                >
                  <X aria-hidden="true" size={14} strokeWidth={1.7} />
                </IconButton>
              </div>
            </header>

            <div
              {...stylex.props(styles.body, showWelcome && styles.bodyEmpty)}
              data-conversation={!showWelcome || undefined}
            >
              {showWelcome ? (
                <>
                  <div {...stylex.props(styles.welcome)}>
                    <img
                      alt=""
                      aria-hidden="true"
                      className={stylex.props(styles.welcomeIcon).className}
                      height={14}
                      src={agentPointerGradient}
                      width={14}
                    />
                    <strong {...stylex.props(styles.welcomeTitle)}>
                      Welcome to Lenso
                    </strong>
                    <span {...stylex.props(styles.welcomeSubtitle)}>
                      Ask anything or tell Lenso what you need
                    </span>
                  </div>

                  <div
                    aria-label="Agent suggestions"
                    {...stylex.props(styles.suggestions)}
                  >
                    {suggestions.map((suggestion) => {
                      const Icon = suggestion.icon;
                      return (
                        <Button
                          key={suggestion.label}
                          onClick={() => setDraft(suggestion.label)}
                          size="compact"
                          variant="secondary"
                          xstyle={styles.suggestion}
                        >
                          <Icon
                            aria-hidden="true"
                            size={14}
                            strokeWidth={1.6}
                          />
                          <span {...stylex.props(styles.suggestionLabel)}>
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
                  {...stylex.props(styles.conversation)}
                  ref={conversationRef}
                >
                  <time {...stylex.props(styles.conversationTime)}>Today</time>
                  {visibleTurns.map((turn) => (
                    <div {...stylex.props(styles.quickTurn)} key={turn.id}>
                      <div {...stylex.props(styles.userTurn)}>
                        <div {...stylex.props(styles.userMessage)}>
                          {turn.user}
                        </div>
                        <div {...stylex.props(styles.messageActions)}>
                          <AgentMessageActions
                            content={turn.user}
                            {...(canEdit && turn.status === "completed"
                              ? { onEdit: () => beginEditing(turn) }
                              : {})}
                          />
                        </div>
                      </div>
                      <div {...stylex.props(styles.assistantTurn)}>
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
                          <div {...stylex.props(styles.assistantCopy)}>
                            <AgentMessageActions content={turn.answer} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {visibleTurns.length === 0 && runtimeError ? (
                    <div {...stylex.props(styles.assistantTurn)}>
                      <p>{runtimeError}</p>
                    </div>
                  ) : null}
                </section>
              )}

              <div {...stylex.props(styles.composerDock)}>
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
                    {...stylex.props(
                      styles.inputWrapper,
                      isEditing && styles.inputWrapperEditing
                    )}
                    data-editing={isEditing || undefined}
                  >
                    <div
                      aria-hidden={!isEditing}
                      {...stylex.props(
                        styles.editingSlot,
                        isEditing && styles.editingSlotOpen
                      )}
                      data-open={isEditing || undefined}
                    >
                      <div {...stylex.props(styles.editingSlotContent)}>
                        <EditingMessageBar compact onCancel={cancelEditing} />
                      </div>
                    </div>
                    <PromptComposer.Root
                      xstyle={styles.composer}
                      maxRows={6}
                      onSubmit={onSubmit}
                      onValueChange={setDraft}
                      submitShortcut="enter"
                      surfaceXstyle={styles.composerSurface}
                      value={draft}
                    >
                      <PromptComposer.Input
                        aria-label="Send a message to Lenso Agent"
                        autoFocus
                        xstyle={styles.textarea}
                        placeholder={
                          hasConversation
                            ? "Reply…"
                            : "@ to mention any App, Plugin, or workspace"
                        }
                        ref={textareaRef}
                        rows={1}
                      />
                      <PromptComposer.Toolbar xstyle={styles.composerFooter}>
                        <Button
                          aria-label="Skills"
                          size="compact"
                          variant="ghost"
                          xstyle={styles.skills}
                        >
                          <Box aria-hidden="true" size={14} strokeWidth={1.6} />
                          Skills
                          <ChevronDown
                            aria-hidden="true"
                            size={8}
                            strokeWidth={2}
                          />
                        </Button>
                        <PromptComposer.Actions xstyle={styles.composerActions}>
                          <IconButton
                            aria-label="Attach images, files, or videos"
                            size="compact"
                            variant="ghost"
                            xstyle={styles.attach}
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
                            data-active={
                              (isRunning ? canCancel : Boolean(draft.trim())) ||
                              undefined
                            }
                            disabled={isRunning ? !canCancel : !draft.trim()}
                            onClick={isRunning ? cancelRunningTurn : undefined}
                            size="compact"
                            type={isRunning ? "button" : "submit"}
                            variant="secondary"
                            xstyle={[
                              styles.submit,
                              (isRunning ? canCancel : Boolean(draft.trim())) &&
                                styles.submitActive,
                            ]}
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
