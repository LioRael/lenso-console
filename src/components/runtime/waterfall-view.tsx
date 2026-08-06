import { stylexClassName } from "@lenso/console-ui";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import { cn } from "../../lib/cn";
import {
  formatRuntimeDuration,
  serviceColor,
  statusColor,
} from "../../lib/runtime-style";
import { runtimeWaterfallTableHeaderClassName } from "./runtime-table-header";
import { RuntimeViewHeader } from "./runtime-view-header";
import {
  buildWaterfallRows,
  findExecutionNodeForWaterfallRow,
  waterfallSegmentLayout,
  waterfallTimelineEnd,
  type WaterfallRow,
  type WaterfallTimelineMarker,
} from "./waterfall-model";

export function WaterfallView({
  selectedNodeId,
  story,
  onSelectNode,
}: {
  story: RuntimeStory;
  selectedNodeId: string | null;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  const rows = buildWaterfallRows(story);
  const timelineEnd = waterfallTimelineEnd(story);
  const unlinkedCount = rows.filter((row) => row.group === "unlinked").length;

  return (
    <div
      className={stylexClassName(
        "isolate flex h-full min-w-0 flex-col overflow-hidden bg-(--background)"
      )}
    >
      <RuntimeViewHeader
        meta={`total ${formatRuntimeDuration(timelineEnd)}`}
        summary={`${rows.length} execution rows · ${unlinkedCount} unlinked`}
        title="Waterfall"
      />
      <div className={runtimeWaterfallTableHeaderClassName}>
        <span>Node</span>
        <div
          className={stylexClassName(
            "flex min-w-0 items-center justify-between overflow-hidden"
          )}
        >
          {[0, 25, 50, 75, 100].map((tick) => (
            <span
              className={stylexClassName(
                "font-mono text-[9px] font-normal normal-case"
              )}
              key={tick}
            >
              {formatRuntimeDuration((timelineEnd * tick) / 100)}
            </span>
          ))}
        </div>
        <span
          className={stylexClassName(
            "absolute top-[7.5px] left-[344px] w-[332px] -translate-x-full text-right"
          )}
        >
          Duration
        </span>
      </div>
      <div className={stylexClassName("min-h-0 flex-1 overflow-auto")}>
        {rows.length === 0 ? (
          <div
            className={stylexClassName(
              "border-b border-(--border-subtle) p-4 font-mono text-xs text-(--muted)"
            )}
          >
            No waterfall rows were returned for this story.
          </div>
        ) : null}
        {rows.map((row, index) => {
          const previousRow = rows[index - 1];
          const showUnlinkedHeader =
            row.group === "unlinked" && previousRow?.group !== "unlinked";
          return (
            <div key={row.id}>
              {showUnlinkedHeader ? (
                <div
                  className={stylexClassName(
                    "border-y border-(--border-subtle) bg-(--sidebar) px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-(--muted)"
                  )}
                >
                  Unlinked
                </div>
              ) : null}
              <WaterfallRowButton
                onSelectNode={onSelectNode}
                row={row}
                selectedNodeId={selectedNodeId}
                timelineEnd={timelineEnd}
              />
              <div className={stylexClassName("h-px bg-(--line-subtle)")} />
            </div>
          );
        })}
        {rows.length > 0 ? <CriticalPathSummary story={story} /> : null}
      </div>
    </div>
  );
}

function WaterfallRowButton({
  row,
  selectedNodeId,
  timelineEnd,
  onSelectNode,
}: {
  row: WaterfallRow;
  selectedNodeId: string | null;
  timelineEnd: number;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  const node = findExecutionNodeForWaterfallRow(row);
  const segment = waterfallSegmentLayout({
    durationMs: row.durationMs,
    minWidthPercent: 0.8,
    startMs: row.startMs,
    timelineEnd,
  });
  const selected = selectedNodeId === node?.id;
  const color = serviceColor(row.service);
  const dotColor =
    row.status === "failed" || row.status === "dead"
      ? statusColor(row.status)
      : color;

  return (
    <button
      aria-label={`Select row ${row.name}`}
      aria-pressed={selected}
      className={cn(
        "grid h-[49px] w-full min-w-0 grid-cols-[332px_232px] items-center gap-3 px-3 text-left transition-colors hover:bg-(--bg-row-hover) disabled:cursor-default",
        selected && "bg-(--bg-row-selected) shadow-[inset_2px_0_0_#008545]",
        row.group === "unlinked" && "opacity-82"
      )}
      disabled={!node}
      onClick={() => {
        if (node) {
          onSelectNode(node);
        }
      }}
      type="button"
    >
      <span
        className={stylexClassName(
          "flex min-w-0 items-center gap-1.5 overflow-hidden"
        )}
      >
        <span
          className={stylexClassName("relative h-[49px] shrink-0")}
          style={{ width: row.depth * 14 + 4 }}
        >
          <span
            className={stylexClassName(
              "absolute top-0 h-full w-px bg-(--line-subtle)"
            )}
            style={{ left: row.depth > 0 ? row.depth * 14 : 1 }}
          />
          {row.depth > 0 ? (
            <span
              className={stylexClassName(
                "absolute top-6 h-px w-3 bg-(--line-subtle)"
              )}
              style={{ left: (row.depth - 1) * 14 + 3 }}
            />
          ) : null}
        </span>
        <span
          className={stylexClassName("size-[7px] shrink-0 rounded-[1px]")}
          style={{ backgroundColor: dotColor }}
        />
        <span
          className={stylexClassName(
            "w-[58px] shrink-0 truncate whitespace-nowrap font-mono text-[9px]"
          )}
          style={{ color }}
        >
          {row.service}
        </span>
        <span
          className={stylexClassName(
            "w-[48px] shrink-0 truncate font-mono text-[9px] text-(--fg-tertiary)"
          )}
        >
          {row.kind}
        </span>
        <span
          className={cn(
            "w-[80px] shrink-0 truncate font-mono text-[10px]",
            selected ? "text-(--fg-primary)" : "text-(--fg-secondary)"
          )}
        >
          {row.name}
        </span>
        <span
          className={stylexClassName(
            "min-w-0 flex-1 text-right font-mono text-[9px] text-(--fg-secondary)"
          )}
        >
          {formatRuntimeDuration(row.durationMs)}
        </span>
      </span>
      <span
        className={stylexClassName(
          "relative isolate h-[32px] min-w-0 overflow-hidden bg-(--bg-canvas)"
        )}
      >
        {[58, 116, 174].map((left) => (
          <span
            className={stylexClassName(
              "absolute top-0 h-full w-px bg-(--line-subtle) opacity-[0.65]"
            )}
            key={left}
            style={{ left }}
          />
        ))}
        <span
          className={cn(
            "absolute top-[12px] h-2 min-w-0.75 rounded-[2px] transition-all",
            selected && "top-[10px] h-3"
          )}
          style={{
            backgroundColor:
              row.status === "failed" || row.status === "dead"
                ? "var(--error)"
                : color,
            left: `${segment.left}%`,
            opacity: selected ? 1 : 0.82,
            width: `${segment.width}%`,
          }}
        />
        {row.fanoutGroupSize ? (
          <span
            className={stylexClassName(
              "absolute top-[22px] whitespace-nowrap font-mono text-[9px]"
            )}
            style={{ color, left: `${segment.left}%` }}
          >
            fan-out {row.fanoutGroupSize}
          </span>
        ) : null}
        {row.group === "linked" && row.depth === 0 ? (
          <span
            className={stylexClassName(
              "absolute top-[22px] whitespace-nowrap font-mono text-[9px]"
            )}
            style={{ color, left: `${segment.left}%` }}
          >
            root
          </span>
        ) : null}
        {visibleTimelineMarkers(row, timelineEnd)}
      </span>
    </button>
  );
}

function CriticalPathSummary({ story }: { story: RuntimeStory }) {
  const path = criticalPath(story);
  const duration = path.reduce((total, node) => total + node.durationMs, 0);
  const percentage = story.durationMs
    ? Math.round((duration / story.durationMs) * 100)
    : 0;
  return (
    <>
      <div
        className={stylexClassName(
          "flex h-[48px] items-center gap-3 border-t border-(--line-subtle) bg-(--bg-surface-muted) px-3 py-[7px]"
        )}
      >
        <div className={stylexClassName("min-w-0 flex-1")}>
          <div
            className={stylexClassName(
              "text-[9.5px] font-medium text-(--fg-tertiary)"
            )}
          >
            Critical path
          </div>
          <div
            className={stylexClassName(
              "truncate font-mono text-[11px] text-(--fg-primary)"
            )}
          >
            {path.map((node) => node.name).join("  →  ") || "—"}
          </div>
        </div>
        <div className={stylexClassName("shrink-0 text-right")}>
          <div
            className={stylexClassName(
              "font-mono text-[13px] text-(--fg-primary)"
            )}
          >
            {formatRuntimeDuration(duration)}
          </div>
          <div
            className={stylexClassName(
              "font-sans text-[9.5px] text-(--fg-secondary)"
            )}
          >
            {percentage}% of execution
          </div>
        </div>
      </div>
      <div
        className={stylexClassName(
          "flex h-[37px] items-center gap-[14px] px-3 font-mono text-[9.5px] text-(--fg-tertiary)"
        )}
      >
        <Legend swatch="var(--tone-info-fg)" text="service identity" />
        <Legend swatch="var(--fg-primary)" text="selected node" />
        <Legend marker swatch="var(--fg-primary)" text="timeline marker" />
        <span
          className={stylexClassName("ml-auto whitespace-nowrap text-[9px]")}
        >
          Select a row to inspect execution context
        </span>
      </div>
    </>
  );
}

function Legend({
  marker = false,
  swatch,
  text,
}: {
  marker?: boolean;
  swatch: string;
  text: string;
}) {
  return (
    <span
      className={stylexClassName(
        "inline-flex items-center gap-1.5 whitespace-nowrap"
      )}
    >
      <span
        className={marker ? "size-1" : "size-[7px]"}
        style={{ backgroundColor: swatch }}
      />
      {text}
    </span>
  );
}

function criticalPath(story: RuntimeStory) {
  const byId = new Map(story.nodes.map((node) => [node.id, node]));
  const [endNode] = [...story.nodes].sort(
    (left, right) =>
      right.startMs + right.durationMs - (left.startMs + left.durationMs)
  );
  const path: ExecutionNode[] = [];
  let current = endNode;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

function visibleTimelineMarkers(row: WaterfallRow, timelineEnd: number) {
  const markers = [];
  const labelColor = serviceColor(row.service) ?? "var(--fg-primary)";
  for (const marker of row.markers) {
    if (marker.matchesRowTiming) {
      continue;
    }
    markers.push(
      <TimelineMarker
        key={marker.id}
        labelColor={labelColor}
        marker={marker}
        timelineEnd={timelineEnd}
      />
    );
  }
  return markers;
}

function TimelineMarker({
  labelColor,
  marker,
  timelineEnd,
}: {
  labelColor: string;
  marker: WaterfallTimelineMarker;
  timelineEnd: number;
}) {
  const segment = waterfallSegmentLayout({
    durationMs: marker.durationMs,
    minWidthPercent: 0.6,
    startMs: marker.startMs,
    timelineEnd,
  });
  const errored = marker.status === "failed" || marker.status === "dead";
  const showLabel = marker.name.toLowerCase().includes("stable effect");

  return (
    <>
      <span
        className={cn(
          "absolute top-[5px] h-1 rounded-xs bg-(--foreground)",
          errored && "bg-(--error)"
        )}
        style={{
          left: `${segment.left}%`,
          opacity: errored ? 0.9 : 0.5,
          width: `${segment.width}%`,
        }}
        title={`${marker.kind}: ${marker.name} · ${formatRuntimeDuration(marker.durationMs)}`}
      />
      {showLabel ? (
        <span
          className={stylexClassName(
            "absolute top-[22px] whitespace-nowrap font-mono text-[9px]"
          )}
          style={{ color: labelColor, left: `${segment.left}%` }}
        >
          stable effect
        </span>
      ) : null}
    </>
  );
}
