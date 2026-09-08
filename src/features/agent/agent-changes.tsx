import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight, FileDiff } from "lucide-react";

import { fileDisclosure } from "./agent-changes.stylex";
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
  const files = latest
    ? diffSections(latest.content).filter((s) => s.file)
    : [];
  return (
    <section aria-label="Task changes" {...stylex.props(styles.changes)}>
      <div {...stylex.props(styles.changesHeading)}>
        <div {...stylex.props(styles.headingLabel)}>
          <FileDiff aria-hidden="true" size={12} />
          <h2 {...stylex.props(styles.title)}>Changes</h2>
          {latest ? (
            <span
              title={`${latest.source} recorded in this task. The working tree may have changed since.`}
              {...stylex.props(styles.snapshotLabel)}
            >
              {files.length} {files.length === 1 ? "file" : "files"} · Latest
              snapshot
            </span>
          ) : null}
        </div>
        {onRequestReview ? (
          <Button onClick={onRequestReview} size="compact" variant="ghost">
            Review changes
          </Button>
        ) : null}
      </div>
      <div {...stylex.props(styles.body)}>
        {latest ? (
          <>
            <DiffSnapshot
              content={latest.content}
              truncated={latest.truncated}
            />
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
      </div>
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
              {...stylex.props(styles.fileCard, fileDisclosure)}
            >
              <summary {...stylex.props(styles.fileHeading)}>
                <ChevronRight
                  aria-hidden="true"
                  size={12}
                  {...stylex.props(styles.fileChevron)}
                />
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
    display: "grid",
    gridTemplateRows: "34px minmax(0, 1fr)",
    gridRow: 2,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: "var(--color-surface-canvas)",
    borderTop: "0.5px solid var(--color-border-tertiary)",
  },
  body: {
    minHeight: 0,
    minWidth: 0,
    overflowY: "auto",
    paddingBottom: "200px",
  },
  headingLabel: {
    alignItems: "center",
    display: "flex",
    gap: "8px",
    minWidth: 0,
    whiteSpace: "nowrap",
  },
  snapshotLabel: {
    color: "var(--color-content-tertiary)",
    fontSize: "10px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  empty: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    textAlign: "center",
    padding: "40px 20px",
    color: "var(--color-content-tertiary)",
  },
  fileList: { display: "grid", minWidth: 0 },
  fileCard: {
    borderBottom: "0.5px solid var(--color-border-tertiary)",
    overflow: "hidden",
    minWidth: 0,
  },
  fileHeading: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    listStyle: "none",
    "::-webkit-details-marker": { display: "none" },
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "10px",
    lineHeight: "18px",
    backgroundColor: {
      default:
        "color-mix(in srgb, var(--color-surface-selected) 58%, var(--color-surface-canvas))",
      ":hover": "var(--color-surface-interactive-hover)",
    },
    color: "var(--color-content-secondary)",
    position: "relative",
    paddingInlineEnd: "96px",
  },
  fileName: {
    overflowWrap: "anywhere",
    fontFamily: '"Roboto Mono", monospace',
  },
  fileChevron: {
    flexShrink: 0,
    color: "var(--color-content-tertiary)",
    transform: {
      default: "rotate(0deg)",
      [stylex.when.ancestor("[open]", fileDisclosure)]: "rotate(90deg)",
    },
  },
  stats: {
    position: "absolute",
    right: "12px",
    top: "6px",
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
    minWidth: 0,
    padding: "0 8px 0 14px",
    borderBottom: "0.5px solid var(--color-border-tertiary)",
  },
  title: {
    color: "var(--color-content-primary)",
    fontSize: "10px",
    fontWeight: 500,
    margin: 0,
  },
  caption: {
    color: "var(--color-content-secondary)",
    fontSize: "11px",
    lineHeight: "17px",
    margin: 0,
  },
  diff: {
    backgroundColor: "var(--color-surface-canvas)",
    borderTop: "0.5px solid var(--color-border-tertiary)",
    margin: 0,
    fontFamily: '"Roboto Mono", monospace',
    fontSize: "11px",
    lineHeight: "18px",
    overflowX: "auto",
    padding: "8px 0",
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
    fontSize: "10px",
    padding: "10px 12px",
    borderTop: "0.5px solid var(--color-border-tertiary)",
  },
});
