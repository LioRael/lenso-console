import * as stylex from "@stylexjs/stylex";
import { Cloud, Mail, Route, ServerCog, Workflow } from "lucide-react";
import type { ComponentType } from "react";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import {
  formatRuntimeDuration,
  serviceColor,
  statusColor,
  timelineSegmentLayout,
} from "../../lib/runtime-style";
import {
  buildExecutionTimelineRows,
  executionTimelineEnd,
  findExecutionNodeForRow,
  type ExecutionTimelineRow,
} from "./execution-timeline-model";
import { buildTimelineParallelMarkers } from "./parallel-execution-model";
import { runtimeTimelineTableHeaderProps } from "./runtime-table-header";
import { RuntimeViewHeader } from "./runtime-view-header";

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
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityGridCols5: {
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityNormalCase: {
    textTransform: "none",
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
  utilityP4: {
    padding: "calc(0.25rem * 4)",
  },
  utilityMxAuto: {
    marginInline: "auto",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityMaxW5xl: {
    maxWidth: "var(--container-5xl, 64rem)",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgPanel: {
    backgroundColor: "var(--bg-panel)",
  },
  utilityTextXs: {
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "var(--text-xs--line-height, 1rem)",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityMinH69px: {
    minHeight: "69px",
  },
  utilityGridColsMinmax180px260pxMinmax01fr: {
    gridTemplateColumns: "minmax(180px,260px) minmax(0,1fr)",
  },
  utilityGap4: {
    gap: "calc(0.25rem * 4)",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilityTransition: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityMaxMdGridCols1: {
    "@media (max-width: 767px)": {
      gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    },
  },
  utilityScale1004: {
    scale: "1.004",
  },
  utilityCursorDefault: {
    cursor: "default",
  },
  utilityTop35: {
    top: "calc(0.25rem * -3.5)",
  },
  utilityAbsolute: {
    position: "absolute",
  },
  utilityLeft6: {
    left: "calc(0.25rem * 6)",
  },
  utilityH35: {
    height: "calc(0.25rem * 3.5)",
  },
  utilityWPx: {
    width: "1px",
  },
  utilityBgLine: {
    backgroundColor: "var(--line)",
  },
  utilityItemsStart: {
    alignItems: "flex-start",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  utilityTracking006em: {
    letterSpacing: "0.06em",
  },
  utilityMt1: {
    marginTop: "calc(0.25rem * 1)",
  },
  utilityBlock: {
    display: "block",
  },
  utilityText13px: {
    fontSize: "13px",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilityMax1100pxHidden: {
    "@media (max-width: 1100px)": {
      display: "none",
    },
  },
  utilityMr15: {
    marginRight: "0.375rem",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityMt2: {
    marginTop: "calc(0.25rem * 2)",
  },
  utilityBorderL2: {
    borderLeftStyle: "solid",
    borderLeftWidth: "2px",
  },
  utilityBorderVarError: {
    borderColor: "var(--error)",
  },
  utilityPl2: {
    paddingLeft: "calc(0.25rem * 2)",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityTextVarToneErrorFg: {
    color: "var(--tone-error-fg)",
  },
  utilityMaxMdHidden: {
    "@media (max-width: 767px)": {
      display: "none",
    },
  },
  utilityRelative: {
    position: "relative",
  },
  utilityH9: {
    height: "calc(0.25rem * 9)",
  },
  utilityBgLinearGradient90degTransparent0Transparent248VarLine25Transparent252Transparent498VarLine50Transparent502Transparent748VarLine75Transparent752:
    {
      backgroundImage:
        "linear-gradient(90deg,transparent 0%,transparent 24.8%,var(--line) 25%,transparent 25.2%,transparent 49.8%,var(--line) 50%,transparent 50.2%,transparent 74.8%,var(--line) 75%,transparent 75.2%)",
    },
});

const styles = stylex.create({
  statusDot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "9999px",
    flexShrink: 0,
    height: 6,
    width: 6,
  }),
  timelineCard: (props: {
    borderColor: string;
    color: string;
    selected: boolean;
  }) => ({
    backgroundColor: props.selected ? "var(--bg-row-hover)" : "var(--bg-panel)",
    borderColor: props.selected ? "var(--line-strong)" : props.borderColor,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "var(--elevation-raised)",
    color: props.color,
    minHeight: 69,
    minWidth: 0,
    overflow: "hidden",
    paddingBlock: 8,
    paddingInline: 12,
    position: "relative",
    transitionProperty: "border-color, background-color",
    ":hover": { borderColor: "var(--line)" },
  }),
  timelineIcon: (props: {
    backgroundColor: string;
    borderColor: string;
    color: string;
  }) => ({
    alignItems: "center",
    backgroundColor: props.backgroundColor,
    borderColor: props.borderColor,
    borderStyle: "solid",
    borderWidth: 1,
    color: props.color,
    display: "grid",
    flexShrink: 0,
    height: 32,
    placeItems: "center",
    width: 32,
  }),
  parallelLabel: {
    backgroundColor: "var(--tone-info-bg)",
    color: "var(--tone-info-fg)",
    fontFamily: "var(--font-code)",
    fontSize: 11,
    paddingBlock: 6,
    paddingInline: 12,
  },
  parallelLine: {
    backgroundColor: "var(--tone-info-bg)",
    height: 1,
  },
  timelineSegment: (props: {
    backgroundColor: string;
    left: string;
    opacity: number;
    width: string;
  }) => ({
    backgroundColor: props.backgroundColor,
    height: 20,
    left: props.left,
    minWidth: 4,
    opacity: props.opacity,
    position: "absolute",
    top: 8,
    transitionProperty: "all",
    width: props.width,
  }),
  timelineSegmentSelected: { transform: "scaleY(1.22)" },
});

export function StoryTimelineView({
  selectedNodeId,
  story,
  onSelectNode,
}: {
  story: RuntimeStory;
  selectedNodeId: string | null;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  const rows = buildExecutionTimelineRows(story);
  const parallelMarkers = buildTimelineParallelMarkers(story);
  const parallelMarkerByFirstNode = new Map(
    parallelMarkers.map((marker) => [marker.firstNodeId, marker])
  );
  const timelineEnd = executionTimelineEnd(story);
  const rowSource =
    story.timelineItems === undefined ? "execution nodes" : "backend timeline";

  return (
    <div
      {...stylex.props([
        localStyles.utilityIsolate,
        localStyles.utilityFlex,
        localStyles.utilityHFull,
        localStyles.utilityMinW0,
        localStyles.utilityFlexCol,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBgCanvas,
      ])}
    >
      <RuntimeViewHeader
        meta={`total ${formatRuntimeDuration(timelineEnd)}`}
        summary={`${rows.length} rows from ${rowSource}`}
        title="Business Timeline"
      />

      <div {...runtimeTimelineTableHeaderProps}>
        <span>Story Flow</span>
        <div
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilityMinW0,
            localStyles.utilityGridCols5,
            localStyles.utilityOverflowHidden,
            localStyles.utilityFontMono,
          ])}
        >
          {[0, 25, 50, 75, 100].map((tick) => (
            <span {...stylex.props([localStyles.utilityNormalCase])} key={tick}>
              {formatRuntimeDuration((timelineEnd * tick) / 100)}
            </span>
          ))}
        </div>
      </div>

      <div
        {...stylex.props([
          localStyles.utilityMinH0,
          localStyles.utilityFlex1,
          localStyles.utilityOverflowAuto,
          localStyles.utilityP4,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityMxAuto,
            localStyles.utilityWFull,
            localStyles.utilityMaxW5xl,
          ])}
        >
          {rows.length === 0 ? (
            <div
              {...stylex.props([
                localStyles.utilityBorder,
                localStyles.utilityBorderLine,
                localStyles.utilityBgBgPanel,
                localStyles.utilityP4,
                localStyles.utilityFontMono,
                localStyles.utilityTextXs,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              No timeline items were returned for this story.
            </div>
          ) : (
            <div
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityGap3,
              ])}
            >
              {rows.map((row, index) => {
                const node = findExecutionNodeForRow(story, row);
                const marker = node
                  ? parallelMarkerByFirstNode.get(node.id)
                  : undefined;

                return (
                  <div
                    {...stylex.props([
                      localStyles.utilityGrid,
                      localStyles.utilityGap2,
                    ])}
                    key={row.id}
                  >
                    {marker ? (
                      <ParallelStartMarker label={marker.label} />
                    ) : null}
                    <TimelineRow
                      index={index}
                      onSelectNode={onSelectNode}
                      row={row}
                      selected={selectedNodeId === row.node?.id}
                      story={story}
                      timelineEnd={timelineEnd}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  index,
  row,
  selected,
  story,
  timelineEnd,
  onSelectNode,
}: {
  index: number;
  row: ExecutionTimelineRow;
  selected: boolean;
  story: RuntimeStory;
  timelineEnd: number;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  const node = findExecutionNodeForRow(story, row);
  const Icon = rowIcon(row.kind);
  const tone = rowTone(row.kind);
  const segment = timelineSegmentLayout({
    durationMs: row.durationMs,
    minWidthPercent: 1.5,
    startMs: row.startMs,
    timelineEnd,
  });
  const errored = row.status === "failed" || row.status === "dead";

  return (
    <button
      aria-label={`Open ${row.kind} ${row.name}`}
      aria-pressed={selected}
      {...stylex.props(
        [
          localStyles.utilityGrid,
          localStyles.utilityMinH69px,
          localStyles.utilityMinW0,
          localStyles.utilityGridColsMinmax180px260pxMinmax01fr,
          localStyles.utilityGap4,
          localStyles.utilityTextLeft,
          localStyles.utilityTransition,
          localStyles.utilityMaxMdGridCols1,
        ],
        selected && [localStyles.utilityScale1004],
        !node && [localStyles.utilityCursorDefault]
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
        {...stylex.props(
          styles.timelineCard({
            borderColor: tone.borderColor,
            color: tone.color,
            selected,
          })
        )}
      >
        {index > 0 ? (
          <span
            {...stylex.props([
              localStyles.utilityTop35,
              localStyles.utilityAbsolute,
              localStyles.utilityLeft6,
              localStyles.utilityH35,
              localStyles.utilityWPx,
              localStyles.utilityBgLine,
            ])}
          />
        ) : null}
        <span
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityMinW0,
            localStyles.utilityItemsStart,
            localStyles.utilityGap2,
          ])}
        >
          <span
            {...stylex.props(
              styles.timelineIcon({
                backgroundColor: tone.backgroundColor,
                borderColor: tone.borderColor,
                color: tone.color,
              })
            )}
          >
            <Icon size={15} strokeWidth={1.8} />
          </span>
          <span
            {...stylex.props([
              localStyles.utilityMinW0,
              localStyles.utilityFlex1,
            ])}
          >
            <span
              {...stylex.props([
                localStyles.utilityFlex,
                localStyles.utilityMinW0,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap2,
              ])}
            >
              <span
                {...stylex.props([
                  localStyles.utilityTruncate,
                  localStyles.utilityFontMono,
                  localStyles.utilityText10px,
                  localStyles.utilityFontSemibold,
                  localStyles.utilityUppercase,
                  localStyles.utilityTracking006em,
                ])}
              >
                {rowKindLabel(row.kind)}
              </span>
              <span
                {...stylex.props(styles.statusDot(statusColor(row.status)))}
              />
            </span>
            <span
              {...stylex.props([
                localStyles.utilityMt1,
                localStyles.utilityBlock,
                localStyles.utilityTruncate,
                localStyles.utilityText13px,
                localStyles.utilityFontSemibold,
                localStyles.utilityTextFgPrimary,
              ])}
            >
              {row.name}
            </span>
            <span
              {...stylex.props([
                localStyles.utilityMt1,
                localStyles.utilityFlex,
                localStyles.utilityMinW0,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap15,
                localStyles.utilityOverflowHidden,
                localStyles.utilityFontMono,
                localStyles.utilityText10px,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              {row.metaParts.map((part, partIndex) => (
                <span
                  {...stylex.props(
                    [localStyles.utilityMinW0, localStyles.utilityTruncate],
                    partIndex > 2 && [localStyles.utilityMax1100pxHidden]
                  )}
                  key={`${row.id}:${partIndex}:${part}`}
                >
                  {partIndex > 0 ? (
                    <span
                      aria-hidden="true"
                      {...stylex.props([localStyles.utilityMr15])}
                    >
                      /
                    </span>
                  ) : null}
                  {part}
                </span>
              ))}
              <span
                {...stylex.props([
                  localStyles.utilityMlAuto,
                  localStyles.utilityShrink0,
                ])}
              >
                {formatRuntimeDuration(row.durationMs)}
              </span>
            </span>
          </span>
        </span>
        {row.error ? (
          <span
            {...stylex.props([
              localStyles.utilityMt2,
              localStyles.utilityBlock,
              localStyles.utilityTruncate,
              localStyles.utilityBorderL2,
              localStyles.utilityBorderVarError,
              localStyles.utilityPl2,
              localStyles.utilityFontMono,
              localStyles.utilityText11px,
              localStyles.utilityTextVarToneErrorFg,
            ])}
          >
            {row.error}
          </span>
        ) : null}
      </span>

      <span
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityMinH69px,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityMaxMdHidden,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityRelative,
            localStyles.utilityH9,
            localStyles.utilityMinW0,
            localStyles.utilityOverflowHidden,
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityBgLinearGradient90degTransparent0Transparent248VarLine25Transparent252Transparent498VarLine50Transparent502Transparent748VarLine75Transparent752,
          ])}
        >
          <span
            {...stylex.props(
              styles.timelineSegment({
                backgroundColor: errored
                  ? "var(--error)"
                  : serviceColor(row.service),
                left: `${segment.left}%`,
                opacity: selected ? 1 : errored ? 0.9 : 0.82,
                width: `${segment.width}%`,
              }),
              selected && styles.timelineSegmentSelected
            )}
          />
        </span>
      </span>
    </button>
  );
}

function ParallelStartMarker({ label }: { label: string }) {
  return (
    <div
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilityMinW0,
        localStyles.utilityGridColsMinmax180px260pxMinmax01fr,
        localStyles.utilityGap4,
        localStyles.utilityMaxMdGridCols1,
      ])}
    >
      <div {...stylex.props(styles.parallelLabel)}>{label}</div>
      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityMaxMdHidden,
        ])}
      >
        <div {...stylex.props(styles.parallelLine)} />
      </div>
    </div>
  );
}

const rowToneByKind = {
  event: {
    backgroundColor: "var(--tone-info-bg)",
    borderColor: "var(--tone-info-border)",
    color: "var(--tone-info-fg)",
  },
  external: {
    backgroundColor: "var(--tone-error-bg)",
    borderColor: "var(--tone-error-border)",
    color: "var(--tone-error-fg)",
  },
  function: {
    backgroundColor: "var(--tone-success-bg)",
    borderColor: "var(--tone-success-border)",
    color: "var(--tone-success-fg)",
  },
  request: {
    backgroundColor: "var(--tone-info-bg)",
    borderColor: "var(--tone-info-border)",
    color: "var(--tone-info-fg)",
  },
  worker: {
    backgroundColor: "var(--tone-warning-bg)",
    borderColor: "var(--tone-warning-border)",
    color: "var(--tone-warning-fg)",
  },
} satisfies Record<
  string,
  { backgroundColor: string; borderColor: string; color: string }
>;

function rowTone(kind: ExecutionTimelineRow["kind"]) {
  if (kind === "outbox_event" || kind === "event") {
    return rowToneByKind.event;
  }
  if (kind === "function_run" || kind === "function" || kind === "command") {
    return rowToneByKind.function;
  }
  if (kind === "http_request" || kind === "http") {
    return rowToneByKind.request;
  }
  if (
    kind === "external_provider_call" ||
    kind === "remote_proxy_call" ||
    kind === "external"
  ) {
    return rowToneByKind.external;
  }
  return rowToneByKind.worker;
}

function rowIcon(
  kind: ExecutionTimelineRow["kind"]
): ComponentType<{ size?: number; strokeWidth?: number }> {
  if (kind === "outbox_event" || kind === "event") {
    return Mail;
  }
  if (kind === "function_run" || kind === "function" || kind === "command") {
    return Workflow;
  }
  if (kind === "http_request" || kind === "http") {
    return Route;
  }
  if (
    kind === "external_provider_call" ||
    kind === "remote_proxy_call" ||
    kind === "external"
  ) {
    return Cloud;
  }
  return ServerCog;
}

function rowKindLabel(kind: ExecutionTimelineRow["kind"]) {
  if (kind === "outbox_event" || kind === "event") {
    return "Outbox";
  }
  if (kind === "function_run" || kind === "function" || kind === "command") {
    return "Function";
  }
  if (kind === "http_request" || kind === "http") {
    return "Request";
  }
  if (kind === "remote_proxy_call") {
    return "Remote Call";
  }
  if (kind === "external_provider_call" || kind === "external") {
    return "External";
  }
  return "Worker";
}
