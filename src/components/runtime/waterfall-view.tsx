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
    <div className="isolate flex h-full min-w-0 flex-col overflow-hidden bg-(--background)">
      <RuntimeViewHeader
        meta={`total ${formatRuntimeDuration(timelineEnd)}`}
        summary={`${rows.length} execution rows · ${unlinkedCount} unlinked`}
        title="Waterfall"
      />
      <div className={runtimeWaterfallTableHeaderClassName}>
        <span>Node</span>
        <div className="grid min-w-0 grid-cols-5 overflow-hidden">
          {[0, 25, 50, 75, 100].map((tick) => (
            <span
              className="font-mono text-[9px] font-normal normal-case"
              key={tick}
            >
              {formatRuntimeDuration((timelineEnd * tick) / 100)}
            </span>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="border-b border-(--border-subtle) p-4 font-mono text-xs text-(--muted)">
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
                <div className="border-y border-(--border-subtle) bg-(--sidebar) px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-(--muted)">
                  Unlinked
                </div>
              ) : null}
              <WaterfallRowButton
                onSelectNode={onSelectNode}
                row={row}
                selectedNodeId={selectedNodeId}
                timelineEnd={timelineEnd}
              />
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

  return (
    <button
      aria-label={`Select row ${row.name}`}
      aria-pressed={selected}
      className={cn(
        "grid h-[49px] w-full min-w-0 grid-cols-[minmax(260px,332px)_minmax(232px,1fr)] items-center gap-3 border-b border-(--line-subtle) px-3 text-left transition-colors hover:bg-(--bg-row-hover) disabled:cursor-default",
        selected &&
          "bg-(--bg-row-selected) shadow-[inset_3px_0_0_var(--accent)]",
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
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span
          className="grid h-[49px] shrink-0 grid-cols-[1px_minmax(0,1fr)]"
          style={{ marginLeft: row.depth * 16, width: row.depth > 0 ? 18 : 2 }}
        >
          <span className="h-full bg-(--border-subtle)" />
          {row.depth > 0 ? (
            <span className="mt-6 h-px bg-(--border-subtle)" />
          ) : null}
        </span>
        <span
          className="size-[7px] shrink-0 rounded-[1px]"
          style={{ backgroundColor: statusColor(row.status) }}
        />
        <span
          className="w-18 shrink-0 truncate whitespace-nowrap font-mono text-[9px]"
          style={{
            color: selected ? "var(--fg-on-accent)" : color,
          }}
        >
          {row.service}
        </span>
        <span
          className={cn(
            "w-14 shrink-0 truncate font-mono text-[9px] text-(--fg-tertiary)",
            selected && "text-(--fg-on-accent)/65"
          )}
        >
          {row.kind}
        </span>
        {row.fanoutGroupSize ? (
          <span className="shrink-0 font-mono text-[9px] text-(--tone-warning-fg)">
            fan-out {row.fanoutGroupSize}
          </span>
        ) : null}
        {!row.fanoutGroupSize && row.parallelGroupSize ? (
          <span className="shrink-0 font-mono text-[9px] text-(--tone-info-fg)">
            parallel group
          </span>
        ) : null}
        <span
          className={cn(
            "truncate font-mono text-[10px] text-(--fg-primary)",
            selected && "text-(--fg-on-accent)"
          )}
        >
          {row.name}
        </span>
        <span
          className={cn(
            "ml-auto font-mono text-[9px] text-(--fg-secondary)",
            selected && "text-(--fg-on-accent)/72"
          )}
        >
          {formatRuntimeDuration(row.durationMs)}
        </span>
      </span>
      <span
        className={cn(
          "relative isolate h-[48px] min-w-0 overflow-hidden bg-[linear-gradient(90deg,transparent_0%,transparent_24.8%,var(--line-subtle)_25%,transparent_25.2%,transparent_49.8%,var(--line-subtle)_50%,transparent_50.2%,transparent_74.8%,var(--line-subtle)_75%,transparent_75.2%)]",
          selected && "my-2 h-[32px] bg-(--bg-panel-muted)"
        )}
      >
        <span
          className={cn(
            "absolute top-[20px] h-2 min-w-0.75 rounded-[2px] transition-all",
            selected && "top-[11px] h-3"
          )}
          style={{
            backgroundColor:
              row.status === "failed" || row.status === "dead"
                ? "var(--error)"
                : color,
            left: `${segment.left}%`,
            opacity: selected ? 1 : 0.88,
            width: `${segment.width}%`,
          }}
        />
        {visibleTimelineMarkers(row, timelineEnd)}
      </span>
    </button>
  );
}

function CriticalPathSummary({ story }: { story: RuntimeStory }) {
  const path = criticalPath(story);
  const duration = path.reduce((total, node) => total + node.durationMs, 0);
  return (
    <>
      <div className="flex h-10 items-center gap-3 border-b border-(--line-subtle) bg-(--bg-panel-muted) px-3">
        <div className="min-w-0 flex-1">
          <div className="text-[9.5px] font-medium text-(--fg-tertiary)">
            Critical path
          </div>
          <div className="truncate font-mono text-[10px] text-(--fg-primary)">
            {path.map((node) => node.name).join("  →  ") || "—"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[12px] text-(--fg-primary)">
            {formatRuntimeDuration(duration)}
          </div>
          <div className="font-mono text-[8.5px] text-(--fg-tertiary)">
            execution duration
          </div>
        </div>
      </div>
      <div className="flex h-10 items-center gap-4 px-3 font-mono text-[8.5px] text-(--fg-tertiary)">
        <Legend swatch="var(--fg-secondary)" text="service identity" />
        <Legend swatch="var(--fg-primary)" text="selected node" />
        <Legend swatch="var(--fg-tertiary)" text="timeline marker" />
        <span className="ml-auto">
          Select a row to inspect execution context
        </span>
      </div>
    </>
  );
}

function Legend({ swatch, text }: { swatch: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-1.5" style={{ backgroundColor: swatch }} />
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
  for (const marker of row.markers) {
    if (marker.matchesRowTiming) {
      continue;
    }
    markers.push(
      <TimelineMarker
        key={marker.id}
        marker={marker}
        timelineEnd={timelineEnd}
      />
    );
  }
  return markers;
}

function TimelineMarker({
  marker,
  timelineEnd,
}: {
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

  return (
    <span
      className={cn(
        "absolute top-1 h-1.5 rounded-xs bg-(--foreground)",
        errored && "bg-(--error)"
      )}
      style={{
        left: `${segment.left}%`,
        opacity: errored ? 0.9 : 0.5,
        width: `${segment.width}%`,
      }}
      title={`${marker.kind}: ${marker.name} · ${formatRuntimeDuration(marker.durationMs)}`}
    />
  );
}
