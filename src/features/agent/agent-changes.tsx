import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { FileDiff } from "lucide-react";

import { diffSections } from "./agent-diff";
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
        <div {...stylex.props(styles.headingLabel)}>
          <FileDiff aria-hidden="true" size={16} />
          <h2 {...stylex.props(styles.title)}>Changes</h2>
          {latest ? (
            <span {...stylex.props(styles.snapshotLabel)}>Latest snapshot</span>
          ) : null}
        </div>
        {onRequestReview ? (
          <Button onClick={onRequestReview} size="compact" variant="ghost">
            Review changes
          </Button>
        ) : null}
      </div>
      {latest ? (
        <>
          <p {...stylex.props(styles.caption)}>
            {latest.source} recorded in this task · The working tree may have
            changed since.
          </p>
          <DiffSnapshot content={latest.content} truncated={latest.truncated} />
        </>
      ) : (
        <div {...stylex.props(styles.empty)}>
          <FileDiff aria-hidden="true" size={28} />
          <h3 {...stylex.props(styles.title)}>No changes to review yet</h3>
          <p {...stylex.props(styles.caption)}>
            Ask the Agent to capture a diff. Changed files will appear here.
          </p>
        </div>
      )}
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
        <div {...stylex.props(styles.fileList)}>
          {diffSections(content).map((section, index) => (
            <details
              key={`${index}:${section.title}`}
              open
              {...stylex.props(styles.fileCard)}
            >
              <summary {...stylex.props(styles.fileHeading)}>
                <span {...stylex.props(styles.fileName)}>{section.title}</span>
                {section.file ? (
                  <span
                    aria-label={`${section.additions} added, ${section.deletions} removed`}
                    {...stylex.props(styles.stats)}
                  >
                    <span {...stylex.props(styles.addedCount)}>
                      +{section.additions}
                    </span>
                    <span {...stylex.props(styles.removedCount)}>
                      −{section.deletions}
                    </span>
                  </span>
                ) : null}
              </summary>
              <pre
                aria-label={`Recorded diff: ${section.title}`}
                {...stylex.props(styles.diff)}
              >
                {section.text.split("\n").map((line, lineIndex) => (
                  <span
                    key={`${lineIndex}:${line}`}
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
            </details>
          ))}
        </div>
      ) : (
        <div {...stylex.props(styles.empty)}>
          <FileDiff aria-hidden="true" size={28} />
          <p {...stylex.props(styles.caption)}>No changes in this snapshot.</p>
        </div>
      )}
    </>
  );
}

const styles = stylex.create({
  changes: {
    minHeight: 0,
    overflowY: "auto",
    padding: {
      default: "20px 24px 16px",
      "@media (max-width: 760px)": "16px 12px",
    },
  },
  headingLabel: {
    alignItems: "center",
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  snapshotLabel: { color: "var(--color-content-tertiary)", fontSize: "11px" },
  empty: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    textAlign: "center",
    padding: "56px 20px",
    marginTop: "16px",
    color: "var(--color-content-tertiary)",
    border: "1px dashed var(--color-border-secondary)",
    borderRadius: "8px",
  },
  fileList: { display: "grid", gap: "12px", minWidth: 0 },
  fileCard: {
    border: "1px solid var(--color-border-secondary)",
    borderRadius: "8px",
    overflow: "hidden",
    minWidth: 0,
  },
  fileHeading: {
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: "12px",
    lineHeight: "20px",
    backgroundColor: "var(--color-surface-panel)",
    color: "var(--color-content-secondary)",
    position: "relative",
    paddingInlineEnd: "112px",
  },
  fileName: {
    overflowWrap: "anywhere",
    fontFamily: '"Roboto Mono", monospace',
  },
  stats: {
    position: "absolute",
    right: "12px",
    top: "10px",
    display: "inline-flex",
    gap: "10px",
    fontVariantNumeric: "tabular-nums",
  },
  addedCount: {
    color:
      "color-mix(in srgb, var(--color-status-success-content) 65%, var(--color-content-primary))",
  },
  removedCount: {
    color:
      "color-mix(in srgb, var(--color-status-error-content) 65%, var(--color-content-primary))",
  },
  changesHeading: {
    alignItems: "center",
    display: "flex",
    gap: "10px",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
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
    borderTop: "1px solid var(--color-border-secondary)",
    margin: 0,
    fontFamily: '"Roboto Mono", monospace',
    fontSize: "12px",
    lineHeight: "20px",
    overflowX: "auto",
    padding: "8px 0",
    maxHeight: "560px",
    overflowY: "auto",
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
    color:
      "color-mix(in srgb, var(--color-status-success-content) 65%, var(--color-content-primary))",
  },
  deletion: {
    backgroundColor:
      "color-mix(in srgb, var(--color-status-error-content) 10%, transparent)",
    color:
      "color-mix(in srgb, var(--color-status-error-content) 65%, var(--color-content-primary))",
  },
  hunk: { color: "var(--color-content-tertiary)" },
  previous: {
    color: "var(--color-content-secondary)",
    fontSize: "12px",
    marginTop: "16px",
  },
});
