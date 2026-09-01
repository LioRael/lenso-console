import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { Check, ChevronLeft, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { agentAskUserStyles as styles } from "./agent-ask-user.stylex";
import type {
  AgentInteractionAnswer,
  AgentPendingInteraction,
} from "./agent-runtime";

type AnswerDraft = {
  other: string;
  selectedOptionIds: string[];
};

export function AgentAskUser({
  canCancel,
  compact = false,
  interaction,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  canCancel: boolean;
  compact?: boolean;
  interaction: AgentPendingInteraction;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (answers: AgentInteractionAnswer[]) => void;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});

  useEffect(() => {
    setQuestionIndex(0);
    setDrafts({});
  }, [interaction.interactionId]);

  const question = interaction.questions[questionIndex];
  const draft = question
    ? (drafts[question.questionId] ?? { other: "", selectedOptionIds: [] })
    : undefined;
  const isLastQuestion = questionIndex === interaction.questions.length - 1;
  const canContinue = Boolean(
    draft && (draft.selectedOptionIds.length > 0 || draft.other.trim())
  );
  const answeredCount = useMemo(
    () =>
      interaction.questions.filter((item) => {
        const answer = drafts[item.questionId];
        return Boolean(
          answer && (answer.selectedOptionIds.length > 0 || answer.other.trim())
        );
      }).length,
    [drafts, interaction.questions]
  );

  if (!(question && draft)) {
    return null;
  }

  const updateDraft = (next: AnswerDraft) => {
    setDrafts((current) => ({ ...current, [question.questionId]: next }));
  };

  const selectOption = (optionId: string) => {
    const selectedOptionIds = question.multiSelect
      ? draft.selectedOptionIds.includes(optionId)
        ? draft.selectedOptionIds.filter((id) => id !== optionId)
        : [...draft.selectedOptionIds, optionId]
      : [optionId];
    updateDraft({ other: "", selectedOptionIds });
  };

  const continueOrSubmit = () => {
    if (!canContinue) {
      return;
    }
    if (!isLastQuestion) {
      setQuestionIndex((current) => current + 1);
      return;
    }
    onSubmit(
      interaction.questions.map((item) => {
        const answer = drafts[item.questionId] ?? {
          other: "",
          selectedOptionIds: [],
        };
        return {
          ...(answer.other.trim() ? { other: answer.other.trim() } : {}),
          questionId: item.questionId,
          selectedOptionIds: answer.selectedOptionIds,
        };
      })
    );
  };

  return (
    <section
      aria-labelledby={`agent-question-${question.questionId}`}
      {...stylex.props(styles.card, compact && styles.cardCompact)}
      data-compact={compact || undefined}
    >
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerCopy)}>
          <span {...stylex.props(styles.eyebrow)}>{question.header}</span>
          <h2
            {...stylex.props(styles.prompt)}
            id={`agent-question-${question.questionId}`}
          >
            {question.prompt}
          </h2>
        </div>
        {interaction.questions.length > 1 ? (
          <span {...stylex.props(styles.progress)}>
            {questionIndex + 1}/{interaction.questions.length}
          </span>
        ) : null}
      </header>

      <div
        aria-label={question.prompt}
        {...stylex.props(styles.options, compact && styles.optionsCompact)}
        role={question.multiSelect ? "group" : "radiogroup"}
      >
        {question.options.map((option) => {
          const selected = draft.selectedOptionIds.includes(option.optionId);
          return (
            <button
              aria-checked={selected}
              {...stylex.props(
                styles.option,
                selected && styles.optionSelected
              )}
              data-selected={selected || undefined}
              key={option.optionId}
              onClick={() => selectOption(option.optionId)}
              role={question.multiSelect ? "checkbox" : "radio"}
              type="button"
            >
              <span
                {...stylex.props(
                  styles.indicator,
                  question.multiSelect && styles.indicatorMultiple,
                  selected && styles.indicatorSelected
                )}
                data-multiple={question.multiSelect || undefined}
              >
                {selected ? (
                  <Check aria-hidden="true" size={11} strokeWidth={2.2} />
                ) : null}
              </span>
              <span {...stylex.props(styles.copy)}>
                <strong {...stylex.props(styles.copyTitle)}>
                  {option.label}
                </strong>
                {option.description ? (
                  <span {...stylex.props(styles.copyDescription)}>
                    {option.description}
                  </span>
                ) : null}
                {selected && option.preview ? (
                  <code {...stylex.props(styles.preview)}>
                    {option.preview}
                  </code>
                ) : null}
              </span>
            </button>
          );
        })}
        <label
          {...stylex.props(
            styles.option,
            styles.other,
            Boolean(draft.other) && styles.optionSelected
          )}
          data-active={Boolean(draft.other) || undefined}
        >
          <span {...stylex.props(styles.indicator)} />
          <input
            {...stylex.props(styles.otherInput)}
            aria-label={`Other answer for ${question.header}`}
            onChange={(event) =>
              updateDraft({ other: event.target.value, selectedOptionIds: [] })
            }
            placeholder="Other…"
            value={draft.other}
          />
        </label>
      </div>

      <footer {...stylex.props(styles.footer)}>
        {questionIndex > 0 ? (
          <Button
            aria-label="Previous question"
            onClick={() => setQuestionIndex((current) => current - 1)}
            size="compact"
            type="button"
            variant="ghost"
            xstyle={styles.actionSecondary}
          >
            <ChevronLeft aria-hidden="true" size={13} />
            Back
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            onClick={onCancel}
            size="compact"
            type="button"
            variant="ghost"
            xstyle={styles.actionSecondary}
          >
            <Square
              aria-hidden="true"
              fill="currentColor"
              size={7}
              strokeWidth={0}
            />
            Stop
          </Button>
        ) : null}
        <Button
          disabled={
            !canContinue || isSubmitting || answeredCount < questionIndex
          }
          onClick={continueOrSubmit}
          size="compact"
          type="button"
          variant="secondary"
          xstyle={styles.continue}
        >
          {isSubmitting
            ? "Submitting…"
            : isLastQuestion
              ? "Submit"
              : "Continue"}
        </Button>
      </footer>
    </section>
  );
}
