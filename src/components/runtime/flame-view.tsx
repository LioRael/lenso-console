import * as stylex from "@stylexjs/stylex";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import {
  formatRuntimeDuration,
  serviceColor,
  runtimeTimelineEnd,
  timelineSegmentLayout,
} from "../../lib/runtime-style";
import { buildFlameLevels } from "./flame-model";
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
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityFlex1: {
    flex: "1",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityRelative: {
    position: "relative",
  },
  utilityH60px: {
    height: "60px",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderLineSubtle: {
    borderColor: "var(--line-subtle)",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const styles = stylex.create({
  segment: (props: {
    backgroundColor: string;
    borderColor: string;
    left: string;
    width: string;
  }) => ({
    backgroundColor: props.backgroundColor,
    borderColor: props.borderColor,
    borderRadius: 2,
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--fg-primary)",
    fontFamily: "var(--font-code)",
    fontSize: 10,
    height: 56,
    left: props.left,
    overflow: "hidden",
    paddingInline: 6,
    position: "absolute",
    textAlign: "left",
    top: 4,
    transitionProperty: "filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
    width: props.width,
    ":hover": { filter: "brightness(1.1)" },
  }),
  segmentSelected: { boxShadow: "0 0 0 1px var(--line-strong)" },
});

export function FlameView({
  selectedNodeId,
  story,
  onSelectNode,
}: {
  story: RuntimeStory;
  selectedNodeId: string | null;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  const levels = buildFlameLevels(story.nodes);
  const timelineEnd = runtimeTimelineEnd(story);
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
        meta={formatRuntimeDuration(timelineEnd)}
        summary="color by service and status"
        title="Flame"
      />
      <div
        {...stylex.props([
          localStyles.utilityMinH0,
          localStyles.utilityFlex1,
          localStyles.utilityOverflowAuto,
        ])}
      >
        {levels.map((level) => (
          <div
            {...stylex.props([
              localStyles.utilityRelative,
              localStyles.utilityIsolate,
              localStyles.utilityH60px,
              localStyles.utilityOverflowHidden,
              localStyles.utilityBorderB,
              localStyles.utilityBorderLineSubtle,
            ])}
            key={level.map((node) => node.id).join(":")}
          >
            {level.map((node) => {
              const segment = timelineSegmentLayout({
                durationMs: node.durationMs,
                minWidthPercent: 3,
                startMs: node.startMs,
                timelineEnd,
              });
              return (
                <button
                  aria-label={`Select flame node ${node.name}`}
                  aria-pressed={selectedNodeId === node.id}
                  {...stylex.props(
                    styles.segment({
                      backgroundColor:
                        node.status === "failed" || node.status === "dead"
                          ? "var(--error)"
                          : `${serviceColor(node.service)}cc`,
                      borderColor:
                        node.status === "failed" || node.status === "dead"
                          ? "var(--error)"
                          : `${serviceColor(node.service)}99`,
                      left: `${segment.left}%`,
                      width: `${segment.width}%`,
                    }),
                    selectedNodeId === node.id && styles.segmentSelected
                  )}
                  key={node.id}
                  onClick={() => onSelectNode(node)}
                  type="button"
                >
                  <span {...stylex.props([localStyles.utilityTruncate])}>
                    {node.name} · {formatRuntimeDuration(node.durationMs)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
