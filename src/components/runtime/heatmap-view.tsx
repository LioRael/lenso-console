import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

import type { ExecutionNode, RuntimeStory } from "../../data/mock-runtime";
import type { RuntimeHeatmap } from "../../hooks/use-runtime-queries";
import { formatRuntimeDuration, statusColor } from "../../lib/runtime-style";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { heatmapCellKey, resolveHeatmapCellNodes } from "./heatmap-model";
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
  utilityGridColsRepeat20Minmax01fr: {
    gridTemplateColumns: "repeat(20,minmax(0,1fr))",
  },
  utilityGap05: {
    gap: "calc(0.25rem * 0.5)",
  },
  utilityP3: {
    padding: "calc(0.25rem * 3)",
  },
  utilityH6: {
    height: "calc(0.25rem * 6)",
  },
  utilityMinH6: {
    minHeight: "calc(0.25rem * 6)",
  },
  utilityRounded1px: {
    borderRadius: "1px",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgControl: {
    backgroundColor: "var(--bg-control)",
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityFlex1: {
    flex: "1",
  },
  utilityGridColsMinmax01frMinmax0280px: {
    gridTemplateColumns: "minmax(0,1fr) minmax(0,280px)",
  },
  utilityMaxXlGridCols1: {
    "@media (max-width: 1279px)": {
      gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    },
  },
  utilityGridCols1: {
    gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityAbsolute: {
    position: "absolute",
  },
  utilityRight05: {
    right: "calc(0.25rem * 0.5)",
  },
  utilityBottom05: {
    bottom: "calc(0.25rem * 0.5)",
  },
  utilityBgBgCanvas80: {
    backgroundColor: "color-mix(in oklab, var(--bg-canvas) 80%, transparent)",
  },
  utilityPx1: {
    paddingInline: "calc(0.25rem * 1)",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText9px: {
    fontSize: "9px",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityInset1: {
    inset: "calc(0.25rem * 1)",
  },
  utilityBorderBgCanvas: {
    borderColor: "var(--bg-canvas)",
  },
  utilityBorderL: {
    borderLeftStyle: "solid",
    borderLeftWidth: "1px",
  },
  utilityBgBgPanel: {
    backgroundColor: "var(--bg-panel)",
  },
  utilityItemsStart: {
    alignItems: "flex-start",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPy2: {
    paddingBlock: "calc(0.25rem * 2)",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityMt05: {
    marginTop: "calc(0.25rem * 0.5)",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
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
  utilityHoverBgBgRowHover: {
    ":hover": {
      backgroundColor: "var(--bg-row-hover)",
    },
  },
  utilityBgAccentSoft: {
    backgroundColor: "var(--accent-soft)",
  },
  utilityShadowInset2px00VarAccent: {
    boxShadow: "inset 2px 0 0 var(--accent)",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityText12px: {
    fontSize: "12px",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
});

const styles = stylex.create({
  emptyState: {
    backgroundColor: "var(--bg-panel)",
    height: "100%",
  },
  iconButton: {
    padding: 0,
  },
  heatmapCell: (props: {
    backgroundColor: string;
    cursor: "default" | "pointer";
    opacity: number;
    selected: boolean;
  }) => ({
    backgroundColor: props.backgroundColor,
    borderColor: props.selected ? "var(--line-strong)" : "var(--line)",
    borderRadius: "1px",
    borderStyle: "solid",
    borderWidth: 1,
    cursor: props.cursor,
    height: 24,
    minHeight: 24,
    opacity: props.opacity,
    position: "relative",
    transitionProperty: "all",
    width: "100%",
    ":focus-visible": {
      outlineColor: "var(--accent)",
      outlineOffset: 1,
      outlineStyle: "solid",
      outlineWidth: 2,
      zIndex: 1,
    },
    ":hover": {
      borderColor: "var(--fg-secondary)",
      zIndex: 1,
    },
  }),
  statusDot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "9999px",
    flexShrink: 0,
    height: 6,
    width: 6,
  }),
});

export function HeatmapView({
  heatmap,
  loading,
  selectedNodeId,
  story,
  queryError,
  onSelectNode,
}: {
  heatmap: RuntimeHeatmap | undefined;
  loading: boolean;
  selectedNodeId?: string | null;
  story?: RuntimeStory;
  queryError: Error | null;
  onSelectNode?: (node: ExecutionNode) => void;
}) {
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const drilldownEnabled = Boolean(story && onSelectNode);
  const selectedCell = useMemo(() => {
    if (!(heatmap && story && selectedCellKey)) {
      return null;
    }

    const index = heatmap.cells.findIndex(
      (cell, cellIndex) => heatmapCellKey(cell, cellIndex) === selectedCellKey
    );
    const cell = heatmap.cells[index];
    if (!cell) {
      return null;
    }

    return {
      cell,
      key: selectedCellKey,
      nodes: resolveHeatmapCellNodes({ cell, story }),
    };
  }, [heatmap, selectedCellKey, story]);

  if (loading) {
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
          meta="loading"
          summary="Backend runtime heatmap"
          title="Heatmap"
        />
        <div
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilityGridColsRepeat20Minmax01fr,
            localStyles.utilityGap05,
            localStyles.utilityP3,
          ])}
        >
          {Array.from({ length: 120 }, (_, index) => (
            <div
              {...stylex.props([
                localStyles.utilityH6,
                localStyles.utilityMinH6,
                localStyles.utilityRounded1px,
                localStyles.utilityBorder,
                localStyles.utilityBorderLine,
                localStyles.utilityBgBgControl,
              ])}
              key={index}
            />
          ))}
        </div>
      </div>
    );
  }

  if (queryError) {
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
          meta="error"
          summary="Backend runtime heatmap"
          title="Heatmap"
        />
        <EmptyState stylex={styles.emptyState}>
          <EmptyState.Title>Heatmap unavailable</EmptyState.Title>
          <EmptyState.Description>{queryError.message}</EmptyState.Description>
        </EmptyState>
      </div>
    );
  }

  if (!heatmap || heatmap.cells.length === 0) {
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
          meta={heatmap ? `${heatmap.bucketSeconds}s buckets` : "no data"}
          summary="Backend runtime heatmap"
          title="Heatmap"
        />
        <EmptyState stylex={styles.emptyState}>
          <EmptyState.Title>No runtime heatmap data</EmptyState.Title>
          <EmptyState.Description>
            The backend returned an empty heatmap for the current runtime
            window.
          </EmptyState.Description>
        </EmptyState>
      </div>
    );
  }

  const maxCount = Math.max(1, ...heatmap.cells.map((cell) => cell.totalCount));

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
        meta={`${heatmap.bucketSeconds}s buckets`}
        summary={`${heatmap.cells.length} backend cells`}
        title="Heatmap"
      />
      <div
        {...stylex.props(
          [
            localStyles.utilityGrid,
            localStyles.utilityMinH0,
            localStyles.utilityFlex1,
            localStyles.utilityOverflowHidden,
          ],
          drilldownEnabled && selectedCell
            ? [
                localStyles.utilityGridColsMinmax01frMinmax0280px,
                localStyles.utilityMaxXlGridCols1,
              ]
            : [localStyles.utilityGridCols1]
        )}
      >
        <div
          {...stylex.props([
            localStyles.utilityMinH0,
            localStyles.utilityOverflowAuto,
            localStyles.utilityBgBgCanvas,
            localStyles.utilityP3,
          ])}
        >
          <div
            {...stylex.props([
              localStyles.utilityGrid,
              localStyles.utilityGridColsRepeat20Minmax01fr,
              localStyles.utilityGap05,
            ])}
          >
            {heatmap.cells.map((cell, index) => {
              const key = heatmapCellKey(cell, index);
              const nodeTypeLabel = heatmapNodeTypeLabel(cell.nodeType);
              const nodes =
                story === undefined
                  ? []
                  : resolveHeatmapCellNodes({ cell, story });
              const selected = key === selectedCellKey;
              const directlySelectable = drilldownEnabled && nodes.length === 1;
              const aggregateSelectable = drilldownEnabled && nodes.length > 1;

              return (
                <button
                  aria-label={`${cell.service} ${nodeTypeLabel} heatmap cell with ${cell.totalCount} executions`}
                  {...stylex.props(
                    styles.heatmapCell({
                      backgroundColor: heatmapCellBackground(cell),
                      cursor: drilldownEnabled ? "pointer" : "default",
                      opacity: Math.max(0.28, cell.totalCount / maxCount),
                      selected,
                    })
                  )}
                  disabled={!drilldownEnabled}
                  key={key}
                  aria-pressed={selected}
                  onClick={() => {
                    if (!drilldownEnabled) {
                      return;
                    }
                    if (nodes.length === 1 && nodes[0]) {
                      onSelectNode?.(nodes[0]);
                      setSelectedCellKey(null);
                      return;
                    }
                    setSelectedCellKey(selected ? null : key);
                  }}
                  title={`${cell.service} · ${nodeTypeLabel} · ${cell.totalCount} executions`}
                  type="button"
                >
                  {aggregateSelectable ? (
                    <span
                      {...stylex.props([
                        localStyles.utilityAbsolute,
                        localStyles.utilityRight05,
                        localStyles.utilityBottom05,
                        localStyles.utilityRounded1px,
                        localStyles.utilityBgBgCanvas80,
                        localStyles.utilityPx1,
                        localStyles.utilityFontMono,
                        localStyles.utilityText9px,
                        localStyles.utilityTextFgPrimary,
                      ])}
                    >
                      {nodes.length}
                    </span>
                  ) : null}
                  {directlySelectable &&
                  selectedNodeId &&
                  selectedNodeId === nodes[0]?.id ? (
                    <span
                      {...stylex.props([
                        localStyles.utilityAbsolute,
                        localStyles.utilityInset1,
                        localStyles.utilityBorder,
                        localStyles.utilityBorderBgCanvas,
                      ])}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        {drilldownEnabled && selectedCell ? (
          <HeatmapCellInspector
            selected={selectedCell}
            selectedNodeId={selectedNodeId ?? null}
            onClear={() => setSelectedCellKey(null)}
            onSelectNode={(node) => onSelectNode?.(node)}
          />
        ) : null}
      </div>
    </div>
  );
}

function HeatmapCellInspector({
  selected,
  selectedNodeId,
  onClear,
  onSelectNode,
}: {
  selected: {
    cell: RuntimeHeatmap["cells"][number];
    key: string;
    nodes: ExecutionNode[];
  };
  selectedNodeId: string | null;
  onClear: () => void;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  return (
    <aside
      {...stylex.props([
        localStyles.utilityMinH0,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBorderL,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgPanel,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityMinW0,
          localStyles.utilityItemsStart,
          localStyles.utilityGap2,
          localStyles.utilityBorderB,
          localStyles.utilityBorderLine,
          localStyles.utilityPx3,
          localStyles.utilityPy2,
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
              localStyles.utilityTruncate,
              localStyles.utilityFontMono,
              localStyles.utilityText11px,
              localStyles.utilityFontSemibold,
              localStyles.utilityTextFgPrimary,
            ])}
          >
            {selected.cell.service} ·{" "}
            {heatmapNodeTypeLabel(selected.cell.nodeType)}
          </div>
          <div
            {...stylex.props([
              localStyles.utilityMt05,
              localStyles.utilityTruncate,
              localStyles.utilityFontMono,
              localStyles.utilityText10px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {selected.cell.totalCount} total · {selected.cell.errorCount} errors
          </div>
        </div>
        <Button
          aria-label="Clear heatmap cell selection"
          stylex={styles.iconButton}
          onClick={onClear}
          variant="ghost"
        >
          <X size={13} />
        </Button>
      </div>
      <div
        {...stylex.props([
          localStyles.utilityMinH0,
          localStyles.utilityOverflowAuto,
        ])}
      >
        {selected.nodes.length === 0 ? (
          <div
            {...stylex.props([
              localStyles.utilityP3,
              localStyles.utilityFontMono,
              localStyles.utilityText11px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            No matching story nodes were found for this cell.
          </div>
        ) : (
          selected.nodes.map((node) => (
            <button
              aria-label={`Open heatmap node ${node.name}`}
              {...stylex.props(
                [
                  localStyles.utilityGrid,
                  localStyles.utilityWFull,
                  localStyles.utilityMinW0,
                  localStyles.utilityGap1,
                  localStyles.utilityBorderB,
                  localStyles.utilityBorderLine,
                  localStyles.utilityPx3,
                  localStyles.utilityPy2,
                  localStyles.utilityTextLeft,
                  localStyles.utilityTransition,
                  localStyles.utilityHoverBgBgRowHover,
                ],
                selectedNodeId === node.id && [
                  localStyles.utilityBgAccentSoft,
                  localStyles.utilityShadowInset2px00VarAccent,
                ]
              )}
              key={node.id}
              onClick={() => onSelectNode(node)}
              type="button"
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
                  {...stylex.props(styles.statusDot(statusColor(node.status)))}
                />
                <span
                  {...stylex.props([
                    localStyles.utilityTruncate,
                    localStyles.utilityText12px,
                    localStyles.utilityFontSemibold,
                    localStyles.utilityTextFgPrimary,
                  ])}
                >
                  {node.name}
                </span>
              </span>
              <span
                {...stylex.props([
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
                <span
                  {...stylex.props([
                    localStyles.utilityMlAuto,
                    localStyles.utilityShrink0,
                  ])}
                >
                  {formatRuntimeDuration(node.durationMs)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function heatmapNodeTypeLabel(
  nodeType: RuntimeHeatmap["cells"][number]["nodeType"]
) {
  return nodeType === "provider_call" ? "provider call" : nodeType;
}

function heatmapCellBackground(cell: RuntimeHeatmap["cells"][number]) {
  if (cell.errorCount > 0 || cell.deadCount > 0) {
    return "var(--error)";
  }
  if (cell.avgDurationMs && cell.avgDurationMs > 1000) {
    return "var(--data-accent)";
  }
  if (cell.avgDurationMs && cell.avgDurationMs > 200) {
    return "var(--data-success)";
  }
  return "var(--data-info)";
}
