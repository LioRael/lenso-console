import * as stylex from "@stylexjs/stylex";
import {
  AlertTriangle,
  Check,
  Cloud,
  Mail,
  Play,
  RefreshCcw,
  Route,
  ServerCog,
  Workflow,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import { retryTargetForNode } from "../../data/mock-runtime";
import { formatRuntimeDuration } from "../../lib/runtime-style";
import {
  buildRuntimeStory,
  runtimeStatusIntent,
  type RuntimeNode,
  type RuntimeNodeType,
} from "../../lib/story";
import { Button } from "../ui/button";
import { RuntimeViewHeader } from "./runtime-view-header";

const localStyles = stylex.create({
  utilityGrid: {
    display: "grid",
  },
  utilityHFull: {
    height: "100%",
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityGridRowsAutoMinmax01fr: {
    gridTemplateRows: "auto minmax(0,1fr)",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPy3: {
    paddingBlock: "calc(0.25rem * 3)",
  },
  utilityMxAuto: {
    marginInline: "auto",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityMaxW530px: {
    maxWidth: "530px",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
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
  utilityP4: {
    padding: "calc(0.25rem * 4)",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityTextXs: {
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "var(--text-xs--line-height, 1rem)",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityGridCols40pxMinmax01fr: {
    gridTemplateColumns: "40px minmax(0,1fr)",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityRelative: {
    position: "relative",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityJustifyCenter: {
    justifyContent: "center",
  },
  utilityAbsolute: {
    position: "absolute",
  },
  utilityTop11: {
    top: "calc(0.25rem * 11)",
  },
  utilityBottom05rem: {
    bottom: "-0.5rem",
  },
  utilityWPx: {
    width: "1px",
  },
  utilityBgLine: {
    backgroundColor: "var(--line)",
  },
  utilityInset0: {
    inset: "calc(0.25rem * 0)",
  },
  utilityZ0: {
    zIndex: "0",
  },
  utilityCursorPointer: {
    cursor: "pointer",
  },
  utilityFocusVisibleOutline2: {
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "2px",
    },
  },
  utilityFocusVisibleOutlineOffset2: {
    ":focus-visible": {
      outlineOffset: "2px",
    },
  },
  utilityFocusVisibleOutlineFocusRing: {
    ":focus-visible": {
      outlineColor: "var(--focus-ring)",
    },
  },
  utilityItemsStart: {
    alignItems: "flex-start",
  },
  utilityFlex1: {
    flex: "1",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityMt15: {
    marginTop: "calc(0.25rem * 1.5)",
  },
  utilityBlock: {
    display: "block",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityText14px: {
    fontSize: "14px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityMt1: {
    marginTop: "calc(0.25rem * 1)",
  },
  utilityTextFgQuaternary: {
    color: "var(--fg-quaternary)",
  },
  utilityMt2: {
    marginTop: "calc(0.25rem * 2)",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityTextVarToneErrorFg: {
    color: "var(--tone-error-fg)",
  },
  utilityZ10: {
    zIndex: "10",
  },
});

const styles = stylex.create({
  card: (props: {
    borderColor: string;
    showError: boolean;
    selected: boolean;
  }) => ({
    backgroundColor: props.selected ? "var(--bg-row-hover)" : "var(--bg-panel)",
    borderColor: props.selected ? "var(--line-strong)" : props.borderColor,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: props.showError
      ? "inset 0 0 0 1px color-mix(in srgb,var(--error) 20%,transparent),var(--elevation-raised)"
      : "var(--elevation-raised)",
    minHeight: 66,
    minWidth: 0,
    overflow: "hidden",
    paddingBlock: 8,
    paddingInline: 12,
    position: "relative",
    textAlign: "left",
    transitionProperty: "border-color, background-color",
    ":hover": {
      backgroundColor: "var(--bg-control)",
      borderColor: "var(--line)",
    },
  }),
  icon: (props: {
    borderColor: string;
    borderStyle: "solid" | "dashed" | "double";
    color: string;
  }) => ({
    backgroundColor: "var(--bg-panel)",
    borderColor: props.borderColor,
    borderStyle: props.borderStyle,
    borderWidth: 1,
    color: props.color,
    display: "grid",
    height: 36,
    marginTop: 4,
    placeItems: "center",
    position: "relative",
    width: 36,
    zIndex: 10,
  }),
  iconSelected: { boxShadow: "0 0 0 1px var(--line-strong)" },
  statusBadge: (props: { backgroundColor: string }) => ({
    alignItems: "center",
    backgroundColor: props.backgroundColor,
    borderColor: "var(--bg-canvas)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    bottom: -4,
    display: "grid",
    height: 16,
    placeItems: "center",
    position: "absolute",
    right: -4,
    width: 16,
  }),
  statusText: (color: string) => ({
    color,
    fontFamily: "var(--font-code)",
    fontSize: 10,
  }),
  typeLabel: (props: {
    backgroundColor: string;
    borderColor: string;
    color: string;
  }) => ({
    backgroundColor: props.backgroundColor,
    borderColor: props.borderColor,
    borderRadius: "2px",
    borderStyle: "solid",
    borderWidth: 1,
    color: props.color,
    fontFamily: "var(--font-code)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.06em",
    paddingBlock: 2,
    paddingInline: 6,
    textTransform: "uppercase",
  }),
});

export function RuntimeStoryView({
  selectedNodeId,
  story,
  onRetryNode,
  onSelectNode,
}: {
  story: RuntimeStory;
  selectedNodeId: string | null;
  onSelectNode: (node: ExecutionNode) => void;
  onRetryNode: (node: RuntimeNode) => void;
}) {
  const storySummary = buildRuntimeStory(story);

  return (
    <div
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilityHFull,
        localStyles.utilityMinH0,
        localStyles.utilityMinW0,
        localStyles.utilityGridRowsAutoMinmax01fr,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBgCanvas,
      ])}
    >
      <RuntimeViewHeader
        meta={`${storySummary.nodeCount} nodes · ${formatRuntimeDuration(storySummary.duration)}`}
        summary={storySummary.patternLabel || "No execution pattern"}
        title="Runtime Story"
      />

      <div
        {...stylex.props([
          localStyles.utilityMinH0,
          localStyles.utilityOverflowAuto,
          localStyles.utilityPx3,
          localStyles.utilityPy3,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityMxAuto,
            localStyles.utilityGrid,
            localStyles.utilityWFull,
            localStyles.utilityMaxW530px,
            localStyles.utilityGap2,
          ])}
        >
          {storySummary.nodes.length === 0 ? (
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
              No runtime story nodes were derived for this story.
            </div>
          ) : null}

          {storySummary.nodes.map((node, index) => (
            <GraphNode
              key={node.id}
              node={node}
              onRetry={() => onRetryNode(node)}
              onSelect={() => onSelectNode(node.node)}
              selected={selectedNodeId === node.node.id}
              showConnector={index < storySummary.nodes.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GraphNode({
  node,
  selected,
  showConnector,
  onRetry,
  onSelect,
}: {
  node: RuntimeNode;
  selected: boolean;
  showConnector: boolean;
  onSelect: () => void;
  onRetry: () => void;
}) {
  const type = nodeStyle[node.type];
  const status = statusStyle[runtimeStatusIntent(node.status)];
  const Icon = type.icon;
  const StatusIcon = status.icon;
  const retryable = retryTargetForNode(node.node) !== null;

  return (
    <div
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilityMinW0,
        localStyles.utilityGridCols40pxMinmax01fr,
        localStyles.utilityGap3,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityRelative,
          localStyles.utilityFlex,
          localStyles.utilityJustifyCenter,
        ])}
      >
        <span
          {...stylex.props(
            styles.icon({
              borderColor: type.borderColor,
              borderStyle: type.iconBorderStyle,
              color: type.color,
            }),
            selected && styles.iconSelected
          )}
        >
          <Icon size={16} strokeWidth={1.8} />
          <span
            {...stylex.props(
              styles.statusBadge({ backgroundColor: status.badgeColor })
            )}
            title={status.label}
          >
            <StatusIcon size={10} strokeWidth={2.2} />
          </span>
        </span>
        {showConnector ? (
          <span
            {...stylex.props([
              localStyles.utilityAbsolute,
              localStyles.utilityTop11,
              localStyles.utilityBottom05rem,
              localStyles.utilityWPx,
              localStyles.utilityBgLine,
            ])}
          />
        ) : null}
      </div>

      <div
        {...stylex.props(
          styles.card({
            borderColor: type.borderColor,
            selected,
            showError: node.status === "failed" || node.status === "dead",
          })
        )}
      >
        <button
          aria-label={`Select ${node.typeLabel} ${node.name}`}
          aria-pressed={selected}
          {...stylex.props([
            localStyles.utilityAbsolute,
            localStyles.utilityInset0,
            localStyles.utilityZ0,
            localStyles.utilityCursorPointer,
            localStyles.utilityFocusVisibleOutline2,
            localStyles.utilityFocusVisibleOutlineOffset2,
            localStyles.utilityFocusVisibleOutlineFocusRing,
          ])}
          onClick={onSelect}
          type="button"
        />
        <span
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityMinW0,
            localStyles.utilityItemsStart,
            localStyles.utilityGap3,
          ])}
        >
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
                {...stylex.props(
                  styles.typeLabel({
                    backgroundColor: type.backgroundColor,
                    borderColor: type.borderColor,
                    color: type.color,
                  })
                )}
              >
                {node.typeLabel}
              </span>
              <span {...stylex.props(styles.statusText(status.textColor))}>
                {status.label}
              </span>
              <span
                {...stylex.props([
                  localStyles.utilityMlAuto,
                  localStyles.utilityShrink0,
                  localStyles.utilityFontMono,
                  localStyles.utilityText10px,
                  localStyles.utilityTextFgTertiary,
                ])}
              >
                {formatRuntimeDuration(node.duration)}
              </span>
            </span>
            <span
              {...stylex.props([
                localStyles.utilityMt15,
                localStyles.utilityBlock,
                localStyles.utilityTruncate,
                localStyles.utilityText14px,
                localStyles.utilityFontSemibold,
                localStyles.utilityTextFgPrimary,
              ])}
            >
              {node.name}
            </span>
            <span
              {...stylex.props([
                localStyles.utilityMt1,
                localStyles.utilityFlex,
                localStyles.utilityMinW0,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap2,
                localStyles.utilityFontMono,
                localStyles.utilityText10px,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              <span {...stylex.props([localStyles.utilityTruncate])}>
                {node.service}
              </span>
              <span {...stylex.props([localStyles.utilityTextFgQuaternary])}>
                ·
              </span>
              <span
                {...stylex.props([localStyles.utilityShrink0])}
                title={node.id}
              >
                {shortId(node.id)}
              </span>
            </span>
            {node.error ? (
              <span
                {...stylex.props([
                  localStyles.utilityMt2,
                  localStyles.utilityBlock,
                  localStyles.utilityTruncate,
                  localStyles.utilityFontMono,
                  localStyles.utilityText11px,
                  localStyles.utilityTextVarToneErrorFg,
                ])}
              >
                {node.error}
              </span>
            ) : null}
          </span>

          {retryable ? (
            <span
              {...stylex.props([
                localStyles.utilityRelative,
                localStyles.utilityZ10,
                localStyles.utilityShrink0,
              ])}
            >
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  onRetry();
                }}
                variant="danger"
              >
                <RefreshCcw size={13} />
                Retry
              </Button>
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function shortId(id: string) {
  const tail = id.split("-").at(-1) ?? id;
  return tail.length > 12 ? `…${tail.slice(-12)}` : `…${tail}`;
}

const nodeStyle: Record<
  RuntimeNodeType,
  {
    backgroundColor: string;
    borderColor: string;
    color: string;
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    iconBorderStyle: "solid" | "dashed" | "double";
  }
> = {
  event: {
    backgroundColor: "var(--tone-info-bg)",
    borderColor: "var(--tone-info-border)",
    color: "var(--tone-info-fg)",
    icon: Mail,
    iconBorderStyle: "dashed",
  },
  external: {
    backgroundColor: "var(--tone-error-bg)",
    borderColor: "var(--tone-error-border)",
    color: "var(--tone-error-fg)",
    icon: Cloud,
    iconBorderStyle: "solid",
  },
  function: {
    backgroundColor: "var(--tone-success-bg)",
    borderColor: "var(--tone-success-border)",
    color: "var(--tone-success-fg)",
    icon: Workflow,
    iconBorderStyle: "solid",
  },
  request: {
    backgroundColor: "var(--tone-info-bg)",
    borderColor: "var(--tone-info-border)",
    color: "var(--tone-info-fg)",
    icon: Route,
    iconBorderStyle: "solid",
  },
  worker: {
    backgroundColor: "var(--tone-warning-bg)",
    borderColor: "var(--tone-warning-border)",
    color: "var(--tone-warning-fg)",
    icon: ServerCog,
    iconBorderStyle: "double",
  },
};

const statusStyle: Record<
  ReturnType<typeof runtimeStatusIntent>,
  {
    badgeColor: string;
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    label: string;
    textColor: string;
  }
> = {
  dead: {
    badgeColor: "var(--error)",
    icon: XCircle,
    label: "dead",
    textColor: "var(--tone-error-fg)",
  },
  failed: {
    badgeColor: "var(--warning)",
    icon: AlertTriangle,
    label: "failed",
    textColor: "var(--tone-warning-fg)",
  },
  retrying: {
    badgeColor: "var(--info)",
    icon: RefreshCcw,
    label: "retrying",
    textColor: "var(--tone-info-fg)",
  },
  running: {
    badgeColor: "var(--info)",
    icon: Play,
    label: "running",
    textColor: "var(--tone-info-fg)",
  },
  success: {
    badgeColor: "var(--success)",
    icon: Check,
    label: "success",
    textColor: "var(--tone-success-fg)",
  },
};
