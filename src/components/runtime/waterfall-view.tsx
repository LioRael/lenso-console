import * as stylex from "@stylexjs/stylex";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import {
  formatRuntimeDuration,
  serviceColor,
  statusColor,
} from "../../lib/runtime-style";
import { runtimeWaterfallTableHeaderProps } from "./runtime-table-header";
import { RuntimeViewHeader } from "./runtime-view-header";
import {
  buildWaterfallRows,
  findExecutionNodeForWaterfallRow,
  waterfallSegmentLayout,
  waterfallTimelineEnd,
  type WaterfallRow,
  type WaterfallTimelineMarker,
} from "./waterfall-model";

const localStyles = stylex.create({
  utilityIsolate: {
    isolation: "isolate",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityHFull: {
    height: "100%",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityBgBackground: {
    backgroundColor: "var(--background)",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText9px: {
    fontSize: "9px",
  },
  utilityFontNormal: {
    fontWeight: "400",
  },
  utilityNormalCase: {
    textTransform: "none",
  },
  utilityAbsolute: {
    position: "absolute",
  },
  utilityTop75px: {
    top: "7.5px",
  },
  utilityLeft344px: {
    left: "344px",
  },
  utilityW332px: {
    width: "332px",
  },
  utilityTranslateXFull: {
    transform: "translateX(calc(100% * -1))",
  },
  utilityTextRight: {
    textAlign: "right",
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityFlex1: {
    flex: "1",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderBorderSubtle: {
    borderColor: "var(--border-subtle)",
  },
  utilityP4: {
    padding: "calc(0.25rem * 4)",
  },
  utilityTextXs: {
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "var(--text-xs--line-height, 1rem)",
  },
  utilityTextMuted: {
    color: "var(--muted)",
  },
  utilityBorderY: {
    borderBlockStyle: "solid",
    borderBlockWidth: "1px",
  },
  utilityBgSidebar: {
    backgroundColor: "var(--sidebar)",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPy15: {
    paddingBlock: "calc(0.25rem * 1.5)",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityUppercase: {
    textTransform: "uppercase",
  },
  utilityTracking008em: {
    letterSpacing: "0.08em",
  },
  utilityHPx: {
    height: "1px",
  },
  utilityBgLineSubtle: {
    backgroundColor: "var(--line-subtle)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityH49px: {
    height: "49px",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityGridCols332px232px: {
    gridTemplateColumns: "332px 232px",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilityTransitionColors: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityHoverBgBgRowHover: {
    ":hover": {
      backgroundColor: "var(--bg-row-hover)",
    },
  },
  utilityDisabledCursorDefault: {
    ":disabled": {
      cursor: "default",
    },
  },
  utilityBgBgRowSelected: {
    backgroundColor: "var(--bg-row-selected)",
  },
  utilityOpacity82: {
    opacity: "82%",
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilityW48px: {
    width: "48px",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityW80px: {
    width: "80px",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityRelative: {
    position: "relative",
  },
  utilityH32px: {
    height: "32px",
  },
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityH48px: {
    height: "48px",
  },
  utilityBorderT: {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
  },
  utilityBorderLineSubtle: {
    borderColor: "var(--line-subtle)",
  },
  utilityBgBgSurfaceMuted: {
    backgroundColor: "var(--bg-surface-muted)",
  },
  utilityPy7px: {
    paddingBlock: "7px",
  },
  utilityText95px: {
    fontSize: "9.5px",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityText13px: {
    fontSize: "13px",
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
  utilityH37px: {
    height: "37px",
  },
  utilityGap14px: {
    gap: "14px",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityWhitespaceNowrap: {
    whiteSpace: "nowrap",
  },
  utilityInlineFlex: {
    display: "inline-flex",
  },
});

const styles = stylex.create({
  branchLine: (left: number) => ({
    backgroundColor: "var(--bg-canvas)",
    height: 1,
    left,
    position: "absolute",
    top: 24,
    width: 12,
  }),
  depth: (width: number) => ({
    flexShrink: 0,
    height: 49,
    position: "relative",
    width,
  }),
  depthLine: (left: number) => ({
    backgroundColor: "var(--bg-canvas)",
    height: "100%",
    left,
    position: "absolute",
    top: 0,
    width: 1,
  }),
  dot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "1px",
    flexShrink: 0,
    height: 7,
    width: 7,
  }),
  legendSwatch: (color: string, marker: boolean) => ({
    backgroundColor: color,
    height: marker ? 4 : 7,
    width: marker ? 4 : 7,
  }),
  marker: (props: {
    backgroundColor: string;
    left: string;
    opacity: number;
    width: string;
  }) => ({
    backgroundColor: props.backgroundColor,
    borderRadius: "2px",
    height: 4,
    left: props.left,
    opacity: props.opacity,
    position: "absolute",
    top: 5,
    width: props.width,
  }),
  markerLabel: (color: string, left: string) => ({
    color,
    fontFamily: "var(--font-code)",
    fontSize: 9,
    left,
    position: "absolute",
    top: 22,
    whiteSpace: "nowrap",
  }),
  segment: (props: {
    backgroundColor: string;
    left: string;
    opacity: number;
    selected: boolean;
    width: string;
  }) => ({
    backgroundColor: props.backgroundColor,
    borderRadius: "2px",
    height: props.selected ? 12 : 8,
    left: props.left,
    minWidth: "3px",
    opacity: props.opacity,
    position: "absolute",
    top: props.selected ? 10 : 12,
    transitionProperty: "all",
    width: props.width,
  }),
  service: (color: string) => ({
    color,
    flexShrink: 0,
    fontFamily: "var(--font-code)",
    fontSize: 9,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: 58,
  }),
  timelineGridline: (left: number) => ({
    backgroundColor: "var(--line-subtle)",
    height: "100%",
    left,
    opacity: 0.65,
    position: "absolute",
    top: 0,
    width: 1,
  }),
});

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
      {...stylex.props([
        localStyles.utilityIsolate,
        localStyles.utilityFlex,
        localStyles.utilityHFull,
        localStyles.utilityMinW0,
        localStyles.utilityFlexCol,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBackground,
      ])}
    >
      <RuntimeViewHeader
        meta={`total ${formatRuntimeDuration(timelineEnd)}`}
        summary={`${rows.length} execution rows · ${unlinkedCount} unlinked`}
        title="Waterfall"
      />
      <div {...runtimeWaterfallTableHeaderProps}>
        <span>Node</span>
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityMinW0,
            localStyles.utilityItemsCenter,
            localStyles.utilityJustifyBetween,
            localStyles.utilityOverflowHidden,
          ])}
        >
          {[0, 25, 50, 75, 100].map((tick) => (
            <span
              {...stylex.props([
                localStyles.utilityFontMono,
                localStyles.utilityText9px,
                localStyles.utilityFontNormal,
                localStyles.utilityNormalCase,
              ])}
              key={tick}
            >
              {formatRuntimeDuration((timelineEnd * tick) / 100)}
            </span>
          ))}
        </div>
        <span
          {...stylex.props([
            localStyles.utilityAbsolute,
            localStyles.utilityTop75px,
            localStyles.utilityLeft344px,
            localStyles.utilityW332px,
            localStyles.utilityTranslateXFull,
            localStyles.utilityTextRight,
          ])}
        >
          Duration
        </span>
      </div>
      <div
        {...stylex.props([
          localStyles.utilityMinH0,
          localStyles.utilityFlex1,
          localStyles.utilityOverflowAuto,
        ])}
      >
        {rows.length === 0 ? (
          <div
            {...stylex.props([
              localStyles.utilityBorderB,
              localStyles.utilityBorderBorderSubtle,
              localStyles.utilityP4,
              localStyles.utilityFontMono,
              localStyles.utilityTextXs,
              localStyles.utilityTextMuted,
            ])}
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
                  {...stylex.props([
                    localStyles.utilityBorderY,
                    localStyles.utilityBorderBorderSubtle,
                    localStyles.utilityBgSidebar,
                    localStyles.utilityPx3,
                    localStyles.utilityPy15,
                    localStyles.utilityFontMono,
                    localStyles.utilityText10px,
                    localStyles.utilityFontSemibold,
                    localStyles.utilityUppercase,
                    localStyles.utilityTracking008em,
                    localStyles.utilityTextMuted,
                  ])}
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
              <div
                {...stylex.props([
                  localStyles.utilityHPx,
                  localStyles.utilityBgLineSubtle,
                ])}
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
  const dotColor =
    row.status === "failed" || row.status === "dead"
      ? statusColor(row.status)
      : color;

  return (
    <button
      aria-label={`Select row ${row.name}`}
      aria-pressed={selected}
      {...stylex.props(
        [
          localStyles.utilityGrid,
          localStyles.utilityH49px,
          localStyles.utilityWFull,
          localStyles.utilityMinW0,
          localStyles.utilityGridCols332px232px,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap3,
          localStyles.utilityPx3,
          localStyles.utilityTextLeft,
          localStyles.utilityTransitionColors,
          localStyles.utilityHoverBgBgRowHover,
          localStyles.utilityDisabledCursorDefault,
        ],
        selected && [localStyles.utilityBgBgRowSelected],
        row.group === "unlinked" && [localStyles.utilityOpacity82]
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
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap15,
          localStyles.utilityOverflowHidden,
        ])}
      >
        <span {...stylex.props(styles.depth(row.depth * 14 + 4))}>
          <span
            {...stylex.props(
              styles.depthLine(row.depth > 0 ? row.depth * 14 : 1)
            )}
          />
          {row.depth > 0 ? (
            <span
              {...stylex.props(styles.branchLine((row.depth - 1) * 14 + 3))}
            />
          ) : null}
        </span>
        <span {...stylex.props(styles.dot(dotColor))} />
        <span {...stylex.props(styles.service(color))}>{row.service}</span>
        <span
          {...stylex.props([
            localStyles.utilityW48px,
            localStyles.utilityShrink0,
            localStyles.utilityTruncate,
            localStyles.utilityFontMono,
            localStyles.utilityText9px,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          {row.kind}
        </span>
        <span
          {...stylex.props(
            [
              localStyles.utilityW80px,
              localStyles.utilityShrink0,
              localStyles.utilityTruncate,
              localStyles.utilityFontMono,
              localStyles.utilityText10px,
            ],
            selected
              ? [localStyles.utilityTextFgPrimary]
              : [localStyles.utilityTextFgSecondary]
          )}
        >
          {row.name}
        </span>
        <span
          {...stylex.props([
            localStyles.utilityMinW0,
            localStyles.utilityFlex1,
            localStyles.utilityTextRight,
            localStyles.utilityFontMono,
            localStyles.utilityText9px,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          {formatRuntimeDuration(row.durationMs)}
        </span>
      </span>
      <span
        {...stylex.props([
          localStyles.utilityRelative,
          localStyles.utilityIsolate,
          localStyles.utilityH32px,
          localStyles.utilityMinW0,
          localStyles.utilityOverflowHidden,
          localStyles.utilityBgBgCanvas,
        ])}
      >
        {[58, 116, 174].map((left) => (
          <span {...stylex.props(styles.timelineGridline(left))} key={left} />
        ))}
        <span
          {...stylex.props(
            styles.segment({
              backgroundColor:
                row.status === "failed" || row.status === "dead"
                  ? "var(--error)"
                  : color,
              left: `${segment.left}%`,
              opacity: selected ? 1 : 0.82,
              selected,
              width: `${segment.width}%`,
            })
          )}
        />
        {row.fanoutGroupSize ? (
          <span
            {...stylex.props(styles.markerLabel(color, `${segment.left}%`))}
          >
            fan-out {row.fanoutGroupSize}
          </span>
        ) : null}
        {row.group === "linked" && row.depth === 0 ? (
          <span
            {...stylex.props(styles.markerLabel(color, `${segment.left}%`))}
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
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH48px,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap3,
          localStyles.utilityBorderT,
          localStyles.utilityBorderLineSubtle,
          localStyles.utilityBgBgSurfaceMuted,
          localStyles.utilityPx3,
          localStyles.utilityPy7px,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityMinW0,
            localStyles.utilityFlex1,
          ])}
        >
          <div
            {...stylex.props([
              localStyles.utilityText95px,
              localStyles.utilityFontMedium,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            Critical path
          </div>
          <div
            {...stylex.props([
              localStyles.utilityTruncate,
              localStyles.utilityFontMono,
              localStyles.utilityText11px,
              localStyles.utilityTextFgPrimary,
            ])}
          >
            {path.map((node) => node.name).join("  →  ") || "—"}
          </div>
        </div>
        <div
          {...stylex.props([
            localStyles.utilityShrink0,
            localStyles.utilityTextRight,
          ])}
        >
          <div
            {...stylex.props([
              localStyles.utilityFontMono,
              localStyles.utilityText13px,
              localStyles.utilityTextFgPrimary,
            ])}
          >
            {formatRuntimeDuration(duration)}
          </div>
          <div
            {...stylex.props([
              localStyles.utilityFontSans,
              localStyles.utilityText95px,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            {percentage}% of execution
          </div>
        </div>
      </div>
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH37px,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap14px,
          localStyles.utilityPx3,
          localStyles.utilityFontMono,
          localStyles.utilityText95px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        <Legend swatch="var(--tone-info-fg)" text="service identity" />
        <Legend swatch="var(--fg-primary)" text="selected node" />
        <Legend marker swatch="var(--fg-primary)" text="timeline marker" />
        <span
          {...stylex.props([
            localStyles.utilityMlAuto,
            localStyles.utilityWhitespaceNowrap,
            localStyles.utilityText9px,
          ])}
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
      {...stylex.props([
        localStyles.utilityInlineFlex,
        localStyles.utilityItemsCenter,
        localStyles.utilityGap15,
        localStyles.utilityWhitespaceNowrap,
      ])}
    >
      <span {...stylex.props(styles.legendSwatch(swatch, marker))} />
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
        {...stylex.props(
          styles.marker({
            backgroundColor: errored ? "var(--error)" : "var(--foreground)",
            left: `${segment.left}%`,
            opacity: errored ? 0.9 : 0.5,
            width: `${segment.width}%`,
          })
        )}
        title={`${marker.kind}: ${marker.name} · ${formatRuntimeDuration(marker.durationMs)}`}
      />
      {showLabel ? (
        <span
          {...stylex.props(styles.markerLabel(labelColor, `${segment.left}%`))}
        >
          stable effect
        </span>
      ) : null}
    </>
  );
}
