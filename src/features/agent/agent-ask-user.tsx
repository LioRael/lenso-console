import { Button } from "@lenso/ui/button";
import { Check, ChevronLeft, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  AgentInteractionAnswer,
  AgentPendingInteraction,
} from "./agent-runtime";

import styles from "./agent-ask-user.module.css";

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
      className={styles.card}
      data-compact={compact || undefined}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{question.header}</span>
          <h2
            className={styles.prompt}
            id={`agent-question-${question.questionId}`}
          >
            {question.prompt}
          </h2>
        </div>
        {interaction.questions.length > 1 ? (
          <span className={styles.progress}>
            {questionIndex + 1}/{interaction.questions.length}
          </span>
        ) : null}
      </header>

      <div
        aria-label={question.prompt}
        className={styles.options}
        role={question.multiSelect ? "group" : "radiogroup"}
      >
        {question.options.map((option) => {
          const selected = draft.selectedOptionIds.includes(option.optionId);
          return (
            <button
              aria-checked={selected}
              className={styles.option}
              data-selected={selected || undefined}
              key={option.optionId}
              onClick={() => selectOption(option.optionId)}
              role={question.multiSelect ? "checkbox" : "radio"}
              type="button"
            >
              <span
                className={styles.indicator}
                data-multiple={question.multiSelect || undefined}
              >
                {selected ? (
                  <Check aria-hidden="true" size={11} strokeWidth={2.2} />
                ) : null}
              </span>
              <span className={styles.optionCopy}>
                <strong>{option.label}</strong>
                {option.description ? <span>{option.description}</span> : null}
                {selected && option.preview ? (
                  <code className={styles.preview}>{option.preview}</code>
                ) : null}
              </span>
            </button>
          );
        })}
        <label
          className={styles.other}
          data-active={Boolean(draft.other) || undefined}
        >
          <span className={styles.otherIndicator} />
          <input
            aria-label={`Other answer for ${question.header}`}
            onChange={(event) =>
              updateDraft({ other: event.target.value, selectedOptionIds: [] })
            }
            placeholder="Other…"
            value={draft.other}
          />
        </label>
      </div>

      <footer className={styles.footer}>
        {questionIndex > 0 ? (
          <Button
            aria-label="Previous question"
            className={styles.back}
            onClick={() => setQuestionIndex((current) => current - 1)}
            size="compact"
            type="button"
            variant="ghost"
          >
            <ChevronLeft aria-hidden="true" size={13} />
            Back
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            className={styles.cancel}
            onClick={onCancel}
            size="compact"
            type="button"
            variant="ghost"
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
          className={styles.continue}
          disabled={
            !canContinue || isSubmitting || answeredCount < questionIndex
          }
          onClick={continueOrSubmit}
          size="compact"
          type="button"
          variant="secondary"
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
