import { Dialog } from "@lenso/ui/dialog";
import { IconButton } from "@lenso/ui/icon-button";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowUp,
  Minus,
  MoveDiagonal2,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { useConsoleTranslation } from "../../app/console-i18n";

import "@fontsource-variable/inter/wght.css";
import { PromptComposer } from "../../components/lenso/recipes/prompt-composer";
import { AgentAskUser } from "./agent-ask-user";
import {
  AgentAttachmentProvider,
  AttachmentButton,
  AttachmentDropZone,
  DraftAttachments,
  MessageAttachments,
} from "./agent-attachments";
import { RunConfigurationMenu } from "./agent-composer-controls";
import { AgentComposerInput } from "./agent-composer-input";
import {
  agentModeOptions,
  approvalModeOptions,
} from "./agent-composer-options";
import { AgentContextUsage } from "./agent-context-usage";
import type { DraftEditorHandle } from "./agent-draft-editor";
import { AgentMarkdown } from "./agent-markdown";
import {
  AgentMessageActions,
  EditingMessageBar,
} from "./agent-message-controls";
import { agentQuickPanelStyles as styles } from "./agent-quick-panel.stylex";
import { modelsForSelector } from "./agent-runtime";
import type { AgentTurn } from "./agent-runtime";
import { AgentShimmerText } from "./agent-shimmer-text";
import { speedMenu } from "./agent-speed";
import { AgentTurnActivity } from "./agent-turn-activity";
import { useAgentConversation } from "./use-agent-conversation";

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

export function AgentQuickConversation({
  agentId,
  active,
  host,
  initialDraft,
  onClose,
  onMinimize,
  onMetadata,
  onOpenFullPage,
}: {
  agentId: string;
  active: boolean;
  host: HTMLDivElement | null;
  initialDraft?: string | undefined;
  onClose: () => void;
  onMinimize: () => void;
  onMetadata: (
    title: string,
    hasConversation: boolean,
    running: boolean
  ) => void;
  onOpenFullPage: (agentId: string, sessionId?: string) => void;
}) {
  const t = useConsoleTranslation();

  const selectedAgent = { id: agentId };
  const {
    attachments,
    answerInteraction,
    beginEditing: beginEditingTurn,
    canCancel,
    canEdit,
    cancelEditing: cancelEditingTurn,
    cancelRunningTurn,
    contextCatalog,
    contextReferences,
    setContextReferences,
    compactSession,
    profile,
    runtime,
    modelCatalog,
    selectedModel,
    setSelectedModel,
    selectedReasoningEffort,
    setSelectedReasoningEffort,
    selectedServiceTier,
    setSelectedServiceTier,
    selectedApprovalMode,
    setSelectedApprovalMode,
    changeProfile,
    isConfiguring,
    trajectory,
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
  const models = modelsForSelector(modelCatalog, selectedModel);
  const modelId = selectedModel ?? modelCatalog?.selectedModel ?? models[0]?.id;
  const model = models.find((item) => item.id === modelId);
  const speed = speedMenu(model, selectedServiceTier);
  const conversationRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<DraftEditorHandle>(null);
  const appliedDraftRequest = useRef(false);

  const hasConversation = turns.length > 0 || isRunning;
  const isEditing = Boolean(editingTurnId);
  const showWelcome =
    !hasConversation && !draft.trim() && !attachments.items.length;
  const title = turns[0]?.user ? chatTitleFor(turns[0].user) : "New chat";

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }
  }, [active, host, isRunning, visibleTurns]);

  useEffect(() => {
    onMetadata(title, hasConversation, isRunning);
  }, [title, hasConversation, isRunning, onMetadata]);

  useEffect(() => {
    if (!appliedDraftRequest.current && initialDraft) {
      appliedDraftRequest.current = true;
      setDraft(initialDraft);
    }
  }, [initialDraft, setDraft]);

  useEffect(() => {
    if (active && host) {
      const frame = requestAnimationFrame(() => textareaRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [active, host]);

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

  if (!active || !host) {
    return null;
  }
  return createPortal(
    <AgentAttachmentProvider value={attachments}>
      <header {...stylex.props(styles.header)}>
        <Dialog.Title xstyle={styles.title}>
          <Sparkles
            aria-hidden="true"
            size={15}
            {...stylex.props(styles.drawerAccent)}
          />
          {t("Assistant")}
        </Dialog.Title>
        <div {...stylex.props(styles.headerActions)}>
          <IconButton
            aria-label="Minimize chat"
            onClick={onMinimize}
            size="default"
            variant="ghost"
            xstyle={styles.headerAction}
          >
            <Minus aria-hidden="true" size={14} strokeWidth={1.7} />
          </IconButton>
          <IconButton
            aria-label="Open full page"
            onClick={() => {
              onMinimize();
              onOpenFullPage(selectedAgent.id, sessionId);
            }}
            size="default"
            variant="ghost"
            xstyle={styles.headerAction}
          >
            <MoveDiagonal2 aria-hidden="true" size={14} strokeWidth={1.7} />
          </IconButton>
          <IconButton
            aria-label="Close chat"
            onClick={onClose}
            size="default"
            variant="ghost"
            xstyle={styles.headerAction}
          >
            <X aria-hidden="true" size={14} strokeWidth={1.7} />
          </IconButton>
        </div>
      </header>

      <div
        {...stylex.props(styles.body)}
        data-conversation={!showWelcome || undefined}
      >
        {showWelcome ? (
          <p {...stylex.props(styles.welcome)}>
            {t("Ask a question or describe a task.")}
          </p>
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
                  <MessageAttachments items={turn.attachments} />
                  <div {...stylex.props(styles.userMessage)}>{turn.user}</div>
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
                  <AgentTurnActivity turn={turn} />
                  {turn.answer ? (
                    <AgentMarkdown streaming={turn.status === "running"}>
                      {turn.answer}
                    </AgentMarkdown>
                  ) : null}
                  {turn.status === "running" ? (
                    <p>
                      <AgentShimmerText active>
                        {t("Working…")}
                      </AgentShimmerText>
                    </p>
                  ) : null}
                  {turn.error ? <p>{turn.error}</p> : null}
                  {turn.answer ? (
                    <div {...stylex.props(styles.assistantCopy)}>
                      <AgentMessageActions
                        content={turn.answer}
                        {...(sessionId && turn.status === "completed"
                          ? {
                              fork: {
                                sessionId,
                                turnId: turn.id,
                                targetId: selectedAgent.id,
                                onFork: (id: string) =>
                                  onOpenFullPage(selectedAgent.id, id),
                              },
                            }
                          : {})}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {runtimeError ? (
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
              <AttachmentDropZone>
                <PromptComposer.Root
                  xstyle={styles.composer}
                  maxRows={6}
                  onSubmit={onSubmit}
                  onValueChange={setDraft}
                  submitShortcut="enter"
                  surfaceXstyle={styles.composerSurface}
                  value={draft}
                >
                  <DraftAttachments />
                  <AgentComposerInput
                    ref={textareaRef}
                    compact
                    draft={draft}
                    onChange={setDraft}
                    contextCatalog={contextCatalog}
                    references={contextReferences}
                    onReferencesChange={setContextReferences}
                    placeholder={
                      hasConversation
                        ? "Reply…"
                        : "/ for commands · @ for context"
                    }
                    actions={[
                      {
                        id: "open",
                        label: "Open full page",
                        description: "More room for this conversation",
                        run: () => {
                          onMinimize();
                          onOpenFullPage(agentId, sessionId);
                        },
                      },
                      ...(sessionId
                        ? [
                            {
                              id: "compact",
                              label: "Compact context",
                              description: "Summarize this conversation",
                              run: compactSession,
                            },
                          ]
                        : []),
                      ...agentModeOptions.map((item) => ({
                        id: item.value || "normal",
                        label: `${item.label} mode`,
                        description: "Change Profile",
                        run: () => changeProfile(item.value || undefined),
                      })),
                      ...models.map((item) => ({
                        id: `model:${item.id}`,
                        label: item.displayName,
                        description: "Select model",
                        group: "Models",
                        run: () => setSelectedModel(item.id),
                      })),
                    ]}
                  />
                  <PromptComposer.Toolbar xstyle={styles.composerFooter}>
                    <div {...stylex.props(styles.composerLeading)}>
                      <AttachmentButton />
                      <RunConfigurationMenu
                        compact
                        disabled={isRunning || isConfiguring}
                        profileSelection={
                          runtime?.capabilities.profileSelection
                            ? {
                                value: profile ?? "",
                                onValueChange: (value) =>
                                  changeProfile(value || undefined),
                                options: agentModeOptions,
                              }
                            : undefined
                        }
                        approvalSelection={
                          runtime
                            ? {
                                value: selectedApprovalMode ?? "",
                                onValueChange: (value) =>
                                  setSelectedApprovalMode(value || undefined),
                                options: approvalModeOptions,
                              }
                            : undefined
                        }
                        modelOptions={models.map((item) => ({
                          label: item.displayName,
                          value: item.id,
                        }))}
                        modelValue={modelId ?? ""}
                        onModelChange={(value) => {
                          setSelectedModel(value);
                          setSelectedReasoningEffort(undefined);
                          setSelectedServiceTier(undefined);
                        }}
                        reasoningEffortOptions={(
                          model?.reasoningEfforts ?? []
                        ).map((value) => ({ label: value, value }))}
                        reasoningEffortValue={
                          selectedReasoningEffort ??
                          modelCatalog?.selectedReasoningEffort ??
                          ""
                        }
                        onReasoningEffortChange={(value) =>
                          setSelectedReasoningEffort(value || undefined)
                        }
                        serviceTierOptions={speed.options}
                        serviceTierValue={speed.value}
                        onServiceTierChange={(value) =>
                          setSelectedServiceTier(value || undefined)
                        }
                      />
                    </div>
                    <PromptComposer.Actions xstyle={styles.composerActions}>
                      <AgentContextUsage
                        model={model}
                        trajectory={trajectory}
                        draft={draft}
                      />
                      <IconButton
                        aria-label={
                          isRunning ? "Stop generating" : "Submit comment"
                        }
                        data-active={
                          (isRunning
                            ? canCancel
                            : Boolean(
                                draft.trim() || attachments.items.length
                              )) || undefined
                        }
                        disabled={
                          attachments.busy ||
                          attachments.items.some((file) => !file.data_base64) ||
                          (isRunning
                            ? !canCancel
                            : !(draft.trim() || attachments.items.length))
                        }
                        onClick={isRunning ? cancelRunningTurn : undefined}
                        size="compact"
                        type={isRunning ? "button" : "submit"}
                        variant="secondary"
                        xstyle={[
                          styles.submit,
                          (isRunning
                            ? canCancel
                            : Boolean(
                                draft.trim() || attachments.items.length
                              )) && styles.submitActive,
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
              </AttachmentDropZone>
            </div>
          )}
        </div>
      </div>
    </AgentAttachmentProvider>,
    host
  );
}
