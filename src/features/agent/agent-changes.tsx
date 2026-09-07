import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { FileDiff } from "lucide-react";

import type { AgentTurn } from "./agent-runtime";

function recordedDiffs(turns: AgentTurn[]) {
  return turns.flatMap((turn) =>
    (turn.tools ?? []).flatMap((tool) => {
      if (
        tool.status !== "completed" ||
        (tool.name !== "git_diff" && tool.name !== "checkpoint_review") ||
        tool.resultContent === undefined
      ) {
        return [];
      }
      return [
        {
          id: `${turn.id}:${tool.callId}`,
          content: tool.resultContent,
          truncated: tool.resultTruncated === true,
          source: tool.name === "git_diff" ? "Git diff" : "Checkpoint review",
        },
      ];
    })
  );
}

export function AgentChanges({
  turns,
  onRequestReview,
}: {
  turns: AgentTurn[];
  onRequestReview?: (() => void) | undefined;
}) {
  const diffs = recordedDiffs(turns);
  const latest = diffs.at(-1);
  return (
    <section aria-label="Task changes" {...stylex.props(styles.changes)}>
      <div {...stylex.props(styles.changesHeading)}>
        <FileDiff aria-hidden="true" size={18} />
        <h2 {...stylex.props(styles.title)}>Changes</h2>
        {onRequestReview ? (
          <Button onClick={onRequestReview} size="compact" variant="ghost">
            Ask for a fresh diff
          </Button>
        ) : null}
      </div>
      <p {...stylex.props(styles.caption)}>
        {latest
          ? `${latest.source} captured in this task. The working tree may have changed since.`
          : "No diff captured yet. Ask the Agent to review its changes."}
      </p>
      {latest ? (
        <DiffSnapshot content={latest.content} truncated={latest.truncated} />
      ) : null}
      {diffs.length > 1 ? (
        <details {...stylex.props(styles.previous)}>
          <summary>Earlier snapshots ({diffs.length - 1})</summary>
          {diffs
            .slice(0, -1)
            .toReversed()
            .map((diff) => (
              <details key={diff.id} {...stylex.props(styles.previous)}>
                <summary>{diff.source}</summary>
                <DiffSnapshot
                  content={diff.content}
                  truncated={diff.truncated}
                />
              </details>
            ))}
        </details>
      ) : null}
    </section>
  );
}

function DiffSnapshot({
  content,
  truncated,
}: {
  content: string;
  truncated: boolean;
}) {
  return (
    <>
      {truncated ? (
        <output {...stylex.props(styles.caption)}>
          This recorded diff was truncated.
        </output>
      ) : null}
      {content.trim() ? (
        <pre aria-label="Recorded diff" {...stylex.props(styles.diff)}>
          {content.split("\n").map((line, index) => (
            <span
              // Diff line positions are stable within this immutable snapshot.
              key={`${index}:${line}`}
              {...stylex.props(
                styles.diffLine,
                line.startsWith("+") &&
                  !line.startsWith("+++") &&
                  styles.addition,
                line.startsWith("-") &&
                  !line.startsWith("---") &&
                  styles.deletion,
                line.startsWith("@@") && styles.hunk
              )}
            >
              {line || " "}
              {"\n"}
            </span>
          ))}
        </pre>
      ) : (
        <p {...stylex.props(styles.caption)}>No changes in this snapshot.</p>
      )}
    </>
  );
}

const styles = stylex.create({
  changes: { minHeight: 0, overflowY: "auto", padding: "24px 24px 200px" },
  changesHeading: { alignItems: "center", display: "flex", gap: "10px" },
  title: {
    color: "var(--color-content-primary)",
    fontSize: "15px",
    fontWeight: 500,
    margin: 0,
  },
  caption: {
    color: "var(--color-content-secondary)",
    fontSize: "12px",
    lineHeight: "18px",
  },
  diff: {
    backgroundColor: "var(--color-surface-panel)",
    borderColor: "var(--color-border-secondary)",
    borderStyle: "solid",
    borderWidth: "1px",
    borderRadius: "6px",
    fontFamily: '"Roboto Mono Variable", monospace',
    fontSize: "12px",
    lineHeight: "20px",
    overflowX: "auto",
    padding: "12px 0",
  },
  diffLine: {
    display: "block",
    minWidth: "max-content",
    paddingInline: "12px",
    whiteSpace: "pre",
  },
  addition: {
    backgroundColor:
      "color-mix(in srgb, var(--color-status-success-content) 10%, transparent)",
    color: "var(--color-status-success-content)",
  },
  deletion: {
    backgroundColor:
      "color-mix(in srgb, var(--color-status-error-content) 10%, transparent)",
    color: "var(--color-status-error-content)",
  },
  hunk: { color: "var(--color-content-tertiary)" },
  previous: {
    color: "var(--color-content-secondary)",
    fontSize: "12px",
    marginTop: "16px",
  },
});
