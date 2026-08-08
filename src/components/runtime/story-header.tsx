import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import {
  formatRuntimeDuration,
  serviceColor,
  statusColor,
} from "../../lib/runtime-style";
import { buildRuntimeStory } from "../../lib/story";
import { HorizontalScrollArea } from "./horizontal-tab-scroll";
import { buildParallelExecutionGroups } from "./parallel-execution-model";

const localStyles = stylex.create({
  utilityFlex: {
    display: "flex",
  },
  utilityH112px: {
    height: "112px",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityBgBgSurface: {
    backgroundColor: "var(--bg-surface)",
  },
  utilityPx35: {
    paddingInline: "calc(0.25rem * 3.5)",
  },
  utilityPt25: {
    paddingTop: "calc(0.25rem * 2.5)",
  },
  utilityPb2: {
    paddingBottom: "calc(0.25rem * 2)",
  },
  utilityH22px: {
    height: "22px",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityText16px: {
    fontSize: "16px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityLeading22px: {
    lineHeight: "22px",
  },
  utilityTextForeground: {
    color: "var(--foreground)",
  },
  utilityInlineFlex: {
    display: "inline-flex",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityFlex1: {
    flex: "1",
  },
  utilityGrid: {
    display: "grid",
  },
  utilitySize13px: {
    width: "13px",
    height: "13px",
  },
  utilityPlaceItemsCenter: {
    placeItems: "center",
  },
  utilityRoundedXs: {
    borderRadius: "var(--radius-xs, 0.125rem)",
  },
  utilityTextMuted: {
    color: "var(--muted)",
  },
  utilityTransition: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityHoverBgHover: {
    ":hover": {
      backgroundColor: "var(--hover)",
    },
  },
  utilityHoverTextForeground: {
    ":hover": {
      color: "var(--foreground)",
    },
  },
  utilityH14px: {
    height: "14px",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityH20px: {
    height: "20px",
  },
  utilityH5: {
    height: "calc(0.25rem * 5)",
  },
  utilityHFull: {
    height: "100%",
  },
  utilityWMax: {
    width: "max-content",
  },
  utilityMinWFull: {
    minWidth: "100%",
  },
  utilityH4: {
    height: "calc(0.25rem * 4)",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityText9px: {
    fontSize: "9px",
  },
  utilityGapX2: {
    columnGap: "calc(0.25rem * 2)",
  },
  utilityTextMutedDeep: {
    color: "var(--muted-deep)",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilityTextToneErrorFg: {
    color: "var(--tone-error-fg)",
  },
  utilityHoverTextError: {
    ":hover": {
      color: "var(--error)",
    },
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
});

const styles = stylex.create({
  metricTone: (color: string) => ({ color }),
  service: (color: string) => ({
    color,
    flexShrink: 0,
    fontFamily: "var(--font-code)",
    fontSize: 8.5,
  }),
  statusDot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "9999px",
    height: 6,
    width: 6,
  }),
});

export function StoryHeader({
  onClose,
  onSelectNode,
  story,
}: {
  onClose: () => void;
  story: RuntimeStory;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  const storySummary = buildRuntimeStory(story);
  const [strongestParallelGroup] = buildParallelExecutionGroups(story).sort(
    (left, right) =>
      right.branchCount - left.branchCount || left.startMs - right.startMs
  );
  const isError =
    storySummary.status === "failed" || storySummary.status === "dead";

  return (
    <header
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH112px,
        localStyles.utilityMinW0,
        localStyles.utilityFlexCol,
        localStyles.utilityGap1,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBgSurface,
        localStyles.utilityPx35,
        localStyles.utilityPt25,
        localStyles.utilityPb2,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH22px,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap2,
          localStyles.utilityOverflowHidden,
        ])}
      >
        <h1
          {...stylex.props([
            localStyles.utilityMinW0,
            localStyles.utilityTruncate,
            localStyles.utilityText16px,
            localStyles.utilityFontSemibold,
            localStyles.utilityLeading22px,
            localStyles.utilityTextForeground,
          ])}
        >
          {storySummary.title}
        </h1>
        <span
          {...stylex.props([
            localStyles.utilityInlineFlex,
            localStyles.utilityShrink0,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap15,
            localStyles.utilityFontSans,
            localStyles.utilityText10px,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          <span
            {...stylex.props(
              styles.statusDot(statusColor(storySummary.status))
            )}
          />
          {storySummary.status}
        </span>
        <span
          {...stylex.props([
            localStyles.utilityMinW0,
            localStyles.utilityFlex1,
          ])}
        />
        <button
          aria-label="Close story detail"
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilitySize13px,
            localStyles.utilityShrink0,
            localStyles.utilityPlaceItemsCenter,
            localStyles.utilityRoundedXs,
            localStyles.utilityTextMuted,
            localStyles.utilityTransition,
            localStyles.utilityHoverBgHover,
            localStyles.utilityHoverTextForeground,
          ])}
          onClick={onClose}
          type="button"
        >
          <X size={13} />
        </button>
      </div>

      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH14px,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap3,
          localStyles.utilityOverflowHidden,
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
          localStyles.utilityTextFgSecondary,
        ])}
      >
        <Metric tone="muted">
          {formatRuntimeDuration(storySummary.duration)}
        </Metric>
        <Metric>{storySummary.nodeCount} nodes</Metric>
        <Metric tone={storySummary.errorCount > 0 ? "error" : "muted"}>
          {storySummary.errorCount} errors
        </Metric>
        <Metric>{storySummary.services.length} services</Metric>
        {strongestParallelGroup ? (
          <Metric tone="accent">
            fan-out {strongestParallelGroup.branchCount}
          </Metric>
        ) : null}
      </div>

      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH20px,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap15,
          localStyles.utilityOverflowHidden,
        ])}
      >
        <HorizontalScrollArea
          stylex={[
            localStyles.utilityH5,
            localStyles.utilityMinW0,
            localStyles.utilityFlex1,
          ]}
          viewportStylex={localStyles.utilityHFull}
        >
          <div
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityHFull,
              localStyles.utilityWMax,
              localStyles.utilityMinWFull,
              localStyles.utilityItemsCenter,
              localStyles.utilityGap15,
            ])}
          >
            {storySummary.services.map((service) => (
              <span
                {...stylex.props(styles.service(serviceColor(service)))}
                key={service}
              >
                {service}
              </span>
            ))}
          </div>
        </HorizontalScrollArea>
      </div>

      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH4,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityGap3,
          localStyles.utilityOverflowHidden,
          localStyles.utilityFontMono,
          localStyles.utilityText9px,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityMinW0,
            localStyles.utilityFlex1,
            localStyles.utilityItemsCenter,
            localStyles.utilityGapX2,
            localStyles.utilityOverflowHidden,
          ])}
        >
          <span
            {...stylex.props([
              localStyles.utilityMinW0,
              localStyles.utilityTruncate,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            {storySummary.patternLabel || "No execution pattern"}
          </span>
          {storySummary.rootError ? (
            <>
              <span {...stylex.props([localStyles.utilityTextMutedDeep])}>
                ·
              </span>
              <button
                {...stylex.props(
                  [
                    localStyles.utilityMinW0,
                    localStyles.utilityTruncate,
                    localStyles.utilityTextLeft,
                    localStyles.utilityTextToneErrorFg,
                    localStyles.utilityTransition,
                    localStyles.utilityHoverTextError,
                  ],
                  isError && [localStyles.utilityFontSemibold]
                )}
                onClick={() => {
                  const errorNode = lastErrorNode(storySummary.nodes);
                  if (errorNode) {
                    onSelectNode(errorNode.node);
                  }
                }}
                type="button"
              >
                {storySummary.rootError}
              </button>
            </>
          ) : null}
        </div>
        <span
          {...stylex.props([
            localStyles.utilityShrink0,
            localStyles.utilityTruncate,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          {storySummary.correlationId}
        </span>
      </div>
    </header>
  );
}

function lastErrorNode(nodes: ReturnType<typeof buildRuntimeStory>["nodes"]) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node?.error) {
      return node;
    }
  }

  return null;
}

function Metric({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "accent" | "error" | "muted";
}) {
  const toneColor = {
    accent: "var(--accent)",
    error: "var(--tone-error-fg)",
    muted: "var(--secondary)",
  }[tone];

  return (
    <span
      {...stylex.props(
        localStyles.utilityInlineFlex,
        localStyles.utilityShrink0,
        localStyles.utilityItemsCenter,
        styles.metricTone(toneColor)
      )}
    >
      {children}
    </span>
  );
}
