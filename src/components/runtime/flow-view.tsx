import * as stylex from "@stylexjs/stylex";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { PointerEvent, WheelEvent } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import { formatRuntimeDuration, serviceColor } from "../../lib/runtime-style";
import { runtimeNodeType, runtimeNodeTypeLabel } from "../../lib/story";
import {
  clampFlowZoom,
  flowViewDefaults,
  getFitToFrameZoom,
  getFrameScrollPosition,
  getNodeBounds,
  getWorkspaceLayout,
  getZoomAroundPoint,
} from "./flow-view-layout";
import { buildParallelExecutionGroups } from "./parallel-execution-model";
import {
  buildRuntimeGraphLayout,
  buildRuntimeGraphModel,
} from "./runtime-graph-model";
import { RuntimeViewHeader } from "./runtime-view-header";

const localStyles = stylex.create({
  utilityIsolate: {
    isolation: "isolate",
  },
  utilityRelative: {
    position: "relative",
  },
  utilityHFull: {
    height: "100%",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityAbsolute: {
    position: "absolute",
  },
  utilityTop0: {
    top: "calc(0.25rem * 0)",
  },
  utilityRight0: {
    right: "calc(0.25rem * 0)",
  },
  utilityLeft0: {
    left: "calc(0.25rem * 0)",
  },
  utilityZ2: {
    zIndex: "2",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilityTransition: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityHoverTextFgPrimary: {
    ":hover": {
      color: "var(--fg-primary)",
    },
  },
  utilityInset0: {
    inset: "calc(0.25rem * 0)",
  },
  utilityZ3: {
    zIndex: "3",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityPlaceItemsCenter: {
    placeItems: "center",
  },
  utilityP4: {
    padding: "calc(0.25rem * 4)",
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
  utilityZ0: {
    zIndex: "0",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityCursorGrabbing: {
    cursor: "grabbing",
  },
  utilitySelectNone: {
    WebkitUserSelect: "none",
    userSelect: "none",
  },
  utilityCursorGrab: {
    cursor: "grab",
  },
  utilityPointerEventsNone: {
    pointerEvents: "none",
  },
  utilitySizeFull: {
    width: "100%",
    height: "100%",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityPx2: {
    paddingInline: "calc(0.25rem * 2)",
  },
  utilityPt15: {
    paddingTop: "calc(0.25rem * 1.5)",
  },
  utilityPb15: {
    paddingBottom: "calc(0.25rem * 1.5)",
  },
  utilityItemsStart: {
    alignItems: "flex-start",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityMaxW14: {
    maxWidth: "calc(0.25rem * 14)",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityRoundedXs: {
    borderRadius: "var(--radius-xs, 0.125rem)",
  },
  utilityPx1: {
    paddingInline: "calc(0.25rem * 1)",
  },
  utilityPy05: {
    paddingBlock: "calc(0.25rem * 0.5)",
  },
  utilityText9px: {
    fontSize: "9px",
  },
  utilityUppercase: {
    textTransform: "uppercase",
  },
  utilityTracking006em: {
    letterSpacing: "0.06em",
  },
  utilityBgColorMixInSrgbVarError10Transparent: {
    backgroundColor: "color-mix(in srgb,var(--error) 10%,transparent)",
  },
  utilityTextError: {
    color: "var(--error)",
  },
  utilityBgBgRowHover: {
    backgroundColor: "var(--bg-row-hover)",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityBlock: {
    display: "block",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityMt05: {
    marginTop: "calc(0.25rem * 0.5)",
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
  },
  utilityTop1: {
    top: "calc(0.25rem * -1)",
  },
  utilityRight1: {
    right: "calc(0.25rem * -1)",
  },
  utilitySize25: {
    width: "calc(0.25rem * 2.5)",
    height: "calc(0.25rem * 2.5)",
  },
  utilityRoundedFull: {
    borderRadius: "calc(infinity * 1px)",
  },
  utilityBorderBgControl: {
    borderColor: "var(--bg-control)",
  },
  utilityBgVarError: {
    backgroundColor: "var(--error)",
  },
  utilityBottom10: {
    bottom: "calc(0.25rem * 10)",
  },
  utilityLeft4: {
    left: "calc(0.25rem * 4)",
  },
  utilitySize7: {
    width: "calc(0.25rem * 7)",
    height: "calc(0.25rem * 7)",
  },
  utilityBgBgControl: {
    backgroundColor: "var(--bg-control)",
  },
  utilityHoverBorderFgQuaternary: {
    ":hover": {
      borderColor: "var(--fg-quaternary)",
    },
  },
  utilityRight4: {
    right: "calc(0.25rem * 4)",
  },
  utilityH25: {
    height: "calc(0.25rem * 25)",
  },
  utilityW35: {
    width: "calc(0.25rem * 35)",
  },
  utilityBgColorMixInSrgbVarBgCanvas90Transparent: {
    backgroundColor: "color-mix(in srgb,var(--bg-canvas) 90%,transparent)",
  },
  utilityBottom2: {
    bottom: "calc(0.25rem * 2)",
  },
  utilityLeft12: {
    left: "calc(1 / 2 * 100%)",
  },
  utilityTranslateX12: {
    transform: "translateX(calc(50% * -1))",
  },
  utilityGap4: {
    gap: "calc(0.25rem * 4)",
  },
  utilityBgColorMixInSrgbVarBgCanvas84Transparent: {
    backgroundColor: "color-mix(in srgb,var(--bg-canvas) 84%,transparent)",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPy15: {
    paddingBlock: "calc(0.25rem * 1.5)",
  },
});

const nodeWidth = 150;
const nodeHeight = 64;
const columnWidth = 190;
const rowHeight = 84;
const canvasPadding = 64;
const minimapWidth = 140;
const minimapHeight = 100;

const styles = stylex.create({
  canvas: (props: {
    height: number;
    left: number;
    top: number;
    transform: string;
    width: number;
  }) => ({
    height: props.height,
    left: props.left,
    position: "absolute",
    top: props.top,
    transform: props.transform,
    transformOrigin: "top left",
    width: props.width,
  }),
  graphNode: (props: { borderColor: string; left: number; top: number }) => ({
    backgroundColor: "var(--bg-control)",
    borderColor: props.borderColor,
    borderRadius: "2px",
    borderStyle: "solid",
    borderWidth: 1,
    cursor: "pointer",
    height: 64,
    left: props.left,
    position: "absolute",
    textAlign: "left",
    top: props.top,
    transitionProperty: "background-color",
    width: 150,
    ":hover": { backgroundColor: "var(--bg-row-hover)" },
  }),
  graphNodeSelected: { boxShadow: "0 0 0 1px var(--line-strong)" },
  minimapCanvas: (props: { height: number; scale: number; width: number }) => ({
    height: props.height,
    left: 8,
    position: "absolute",
    top: 8,
    transform: `scale(${props.scale})`,
    transformOrigin: "top left",
    width: props.width,
  }),
  minimapNode: (props: {
    color: string;
    left: number;
    opacity: number;
    top: number;
  }) => ({
    backgroundColor: props.color,
    borderRadius: "2px",
    height: 64,
    left: props.left,
    opacity: props.opacity,
    position: "absolute",
    top: props.top,
    width: 150,
  }),
  missingEdges: {
    backgroundColor: "color-mix(in srgb,var(--bg-canvas) 92%,transparent)",
    borderColor: "var(--tone-warning-border)",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--tone-warning-fg)",
    fontFamily: "var(--font-code)",
    fontSize: 11,
    left: "50%",
    padding: 12,
    position: "absolute",
    top: 48,
    transform: "translateX(-50%)",
    width: "min(520px, calc(100% - 32px))",
    zIndex: 3,
    boxShadow: "var(--elevation-overlay)",
  },
  parallelTag: {
    backgroundColor: "var(--tone-info-bg)",
    borderRadius: "2px",
    color: "var(--tone-info-fg)",
    fontSize: 9,
    paddingInline: 4,
  },
  serviceBadge: (color: string) => ({
    backgroundColor: `${color}18`,
    borderColor: `${color}30`,
    borderRadius: "2px",
    borderStyle: "solid",
    borderWidth: 1,
    color,
    fontFamily: "var(--font-code)",
    fontSize: 9,
    fontWeight: 700,
    maxWidth: 64,
    overflow: "hidden",
    paddingBlock: 2,
    paddingInline: 4,
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  }),
  serviceBar: (color: string) => ({
    backgroundColor: color,
    borderRadius: "2px 2px 0 0",
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  }),
  workspace: (height: number, width: number) => ({
    height,
    position: "relative",
    width,
  }),
});

export function FlowView({
  selectedNodeId,
  story,
  onSelectNode,
}: {
  story: RuntimeStory;
  selectedNodeId: string | null;
  onSelectNode: (node: ExecutionNode) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    scrollLeft: number;
    scrollTop: number;
    x: number;
    y: number;
  } | null>(null);
  const hasCenteredRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 });
  const [zoom, setZoom] = useState(1);

  const graphModel = useMemo(() => buildRuntimeGraphModel(story), [story]);
  const { edges } = graphModel;
  const graphLayout = useMemo(() => buildRuntimeGraphLayout(story), [story]);
  const parallelGroups = useMemo(
    () => buildParallelExecutionGroups(story),
    [story]
  );
  const parallelGroupByParent = useMemo(
    () => new Map(parallelGroups.map((group) => [group.parentId, group])),
    [parallelGroups]
  );
  const parallelGroupByChild = useMemo(
    () =>
      new Map(
        parallelGroups.flatMap((group) =>
          group.childIds.map((childId) => [childId, group] as const)
        )
      ),
    [parallelGroups]
  );
  const nodes = useMemo(
    () =>
      graphLayout.nodes.map((layoutNode) => ({
        fanoutGroup: parallelGroupByParent.get(layoutNode.node.id),
        node: layoutNode.node,
        parallelGroup: parallelGroupByChild.get(layoutNode.node.id),
        parentId: layoutNode.parentId,
        x: layoutNode.depth * columnWidth,
        y: layoutNode.row * rowHeight,
      })),
    [graphLayout.nodes, parallelGroupByChild, parallelGroupByParent]
  );
  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.node.id, node])),
    [nodes]
  );
  const nodeBounds = useMemo(
    () => getNodeBounds(nodes, nodeWidth, nodeHeight),
    [nodes]
  );
  const canvasWidth = Math.max(
    980,
    Math.max(0, ...nodes.map((node) => node.x + nodeWidth)) + canvasPadding * 2
  );
  const canvasHeight = Math.max(420, nodes.length * rowHeight);
  const workspaceLayout = getWorkspaceLayout({
    canvasHeight,
    canvasWidth,
    viewportHeight: viewportSize.height,
    viewportWidth: viewportSize.width,
    zoom,
  });
  const minimapScale = Math.min(
    (minimapWidth - 16) / canvasWidth,
    (minimapHeight - 16) / canvasHeight
  );

  const centerGraph = useCallback(
    (nextZoom: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const layout = getWorkspaceLayout({
        canvasHeight,
        canvasWidth,
        viewportHeight: viewport.clientHeight,
        viewportWidth: viewport.clientWidth,
        zoom: nextZoom,
      });
      const position = getFrameScrollPosition({
        bounds: nodeBounds,
        marginLeft: layout.marginLeft,
        marginTop: layout.marginTop,
        viewportHeight: viewport.clientHeight,
        viewportWidth: viewport.clientWidth,
        zoom: nextZoom,
      });
      requestAnimationFrame(() => {
        viewport.scrollTo({
          left: position.scrollLeft,
          top: position.scrollTop,
        });
      });
    },
    [canvasHeight, canvasWidth, nodeBounds]
  );

  const setViewportNode = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    viewportRef.current = node;
    if (!node) {
      return;
    }
    const updateViewportSize = () => {
      setViewportSize({
        height: node.clientHeight,
        width: node.clientWidth,
      });
    };
    const observer = new ResizeObserver(updateViewportSize);
    updateViewportSize();
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  useLayoutEffect(() => {
    if (
      hasCenteredRef.current ||
      viewportSize.height <= 0 ||
      viewportSize.width <= 0
    ) {
      return;
    }
    hasCenteredRef.current = true;
    centerGraph(zoom);
  }, [centerGraph, viewportSize.height, viewportSize.width, zoom]);

  const frameCanvas = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const nextZoom = getFitToFrameZoom({
      canvasHeight,
      canvasWidth,
      viewportHeight: viewport.clientHeight,
      viewportWidth: viewport.clientWidth,
    });
    setZoom(nextZoom);
    centerGraph(nextZoom);
  }, [canvasHeight, canvasWidth, centerGraph]);

  const zoomBy = useCallback((delta: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoom((current) => clampFlowZoom(current + delta));
      return;
    }
    setZoom((current) => {
      const result = getZoomAroundPoint({
        currentZoom: current,
        nextZoom: current + delta,
        pointerX: viewport.clientWidth / 2,
        pointerY: viewport.clientHeight / 2,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      });
      requestAnimationFrame(() => {
        viewport.scrollTo({
          left: result.scrollLeft,
          top: result.scrollTop,
        });
      });
      return result.zoom;
    });
  }, []);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    setZoom((current) => {
      const result = getZoomAroundPoint({
        currentZoom: current,
        nextZoom: current + (event.deltaY > 0 ? -0.08 : 0.08),
        pointerX: event.clientX - rect.left,
        pointerY: event.clientY - rect.top,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      });
      requestAnimationFrame(() => {
        viewport.scrollTo({
          left: result.scrollLeft,
          top: result.scrollTop,
        });
      });
      return result.zoom;
    });
  };

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    panRef.current = {
      pointerId: event.pointerId,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      x: event.clientX,
      y: event.clientY,
    };
    viewport.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const panCanvas = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) {
      return;
    }
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  };

  const stopPan = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const pan = panRef.current;
    if (viewport && pan?.pointerId === event.pointerId) {
      viewport.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
    setIsPanning(false);
  };

  return (
    <div
      {...stylex.props([
        localStyles.utilityIsolate,
        localStyles.utilityRelative,
        localStyles.utilityHFull,
        localStyles.utilityMinW0,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBgCanvas,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityAbsolute,
          localStyles.utilityTop0,
          localStyles.utilityRight0,
          localStyles.utilityLeft0,
          localStyles.utilityZ2,
        ])}
      >
        <RuntimeViewHeader
          summary={`${nodes.length} nodes · ${edges.length} ${graphModel.source === "backend" ? "backend" : "derived"} edges · ${Math.round(zoom * 100)}%`}
          title="Execution Graph"
        >
          <button
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityItemsCenter,
              localStyles.utilityGap15,
              localStyles.utilityTransition,
              localStyles.utilityHoverTextFgPrimary,
            ])}
            onClick={frameCanvas}
            type="button"
          >
            <Maximize2 size={12} />
            Frame
          </button>
        </RuntimeViewHeader>
      </div>

      {graphModel.state === "missing-edges" ? (
        <div {...stylex.props(styles.missingEdges)}>
          This story includes execution nodes, but the backend did not return
          graph edges.
        </div>
      ) : null}

      {graphModel.state === "empty-nodes" ? (
        <div
          {...stylex.props([
            localStyles.utilityAbsolute,
            localStyles.utilityInset0,
            localStyles.utilityZ3,
            localStyles.utilityGrid,
            localStyles.utilityPlaceItemsCenter,
            localStyles.utilityP4,
          ])}
        >
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
            This story does not include execution nodes yet.
          </div>
        </div>
      ) : null}

      <div
        {...stylex.props(
          [
            localStyles.utilityRelative,
            localStyles.utilityZ0,
            localStyles.utilityHFull,
            localStyles.utilityOverflowAuto,
          ],
          isPanning
            ? [localStyles.utilityCursorGrabbing, localStyles.utilitySelectNone]
            : [localStyles.utilityCursorGrab]
        )}
        onPointerCancel={stopPan}
        onPointerDown={startPan}
        onPointerMove={panCanvas}
        onPointerUp={stopPan}
        onWheel={handleWheel}
        ref={setViewportNode}
      >
        <div
          {...stylex.props(
            styles.workspace(
              workspaceLayout.workspaceHeight,
              workspaceLayout.workspaceWidth
            )
          )}
        >
          <div
            {...stylex.props(
              styles.canvas({
                height: canvasHeight,
                left: workspaceLayout.marginLeft,
                top: workspaceLayout.marginTop,
                transform: `scale(${zoom})`,
                width: canvasWidth,
              })
            )}
          >
            <svg
              aria-label="Story flow connectors"
              {...stylex.props([
                localStyles.utilityPointerEventsNone,
                localStyles.utilityAbsolute,
                localStyles.utilityInset0,
                localStyles.utilitySizeFull,
              ])}
            >
              <title>Story flow connectors</title>
              {edges.map((edge) => {
                const source = nodesById.get(edge.source);
                const target = nodesById.get(edge.target);
                if (!source || !target) {
                  return null;
                }
                const fromX = source.x + nodeWidth;
                const fromY = source.y + nodeHeight / 2;
                const toX = target.x;
                const toY = target.y + nodeHeight / 2;
                const midX = (fromX + toX) / 2;
                return (
                  <path
                    d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                    fill="none"
                    key={edge.id}
                    opacity="0.72"
                    stroke="var(--fg-quaternary)"
                    strokeDasharray={edge.type === "causation" ? "none" : "6 4"}
                    strokeWidth="1.5"
                  />
                );
              })}
            </svg>

            {nodes.map(({ fanoutGroup, node, parallelGroup, x, y }) => {
              const color = serviceColor(node.service);
              const isSelected = selectedNodeId === node.id;
              const isError =
                node.status === "failed" || node.status === "dead";
              return (
                <button
                  aria-label={`Select graph node ${node.name}`}
                  aria-pressed={isSelected}
                  {...stylex.props(
                    styles.graphNode({
                      borderColor: isSelected
                        ? "var(--line-strong)"
                        : isError
                          ? "color-mix(in srgb,var(--error) 45%,transparent)"
                          : "var(--line)",
                      left: x,
                      top: y,
                    }),
                    isSelected && styles.graphNodeSelected
                  )}
                  key={node.id}
                  onClick={() => onSelectNode(node)}
                  type="button"
                >
                  <span {...stylex.props(styles.serviceBar(color))} />
                  <span
                    {...stylex.props([
                      localStyles.utilityFlex,
                      localStyles.utilityHFull,
                      localStyles.utilityFlexCol,
                      localStyles.utilityJustifyBetween,
                      localStyles.utilityPx2,
                      localStyles.utilityPt15,
                      localStyles.utilityPb15,
                    ])}
                  >
                    <span
                      {...stylex.props([
                        localStyles.utilityFlex,
                        localStyles.utilityItemsStart,
                        localStyles.utilityJustifyBetween,
                        localStyles.utilityGap2,
                      ])}
                    >
                      <span {...stylex.props(styles.serviceBadge(color))}>
                        {node.service}
                      </span>
                      <span
                        {...stylex.props(
                          [
                            localStyles.utilityMaxW14,
                            localStyles.utilityTruncate,
                            localStyles.utilityRoundedXs,
                            localStyles.utilityPx1,
                            localStyles.utilityPy05,
                            localStyles.utilityFontMono,
                            localStyles.utilityText9px,
                            localStyles.utilityUppercase,
                            localStyles.utilityTracking006em,
                          ],
                          isError
                            ? [
                                localStyles.utilityBgColorMixInSrgbVarError10Transparent,
                                localStyles.utilityTextError,
                              ]
                            : [
                                localStyles.utilityBgBgRowHover,
                                localStyles.utilityTextFgSecondary,
                              ]
                        )}
                      >
                        {flowNodeKindLabel(node)}
                      </span>
                    </span>
                    <span {...stylex.props([localStyles.utilityMinW0])}>
                      <span
                        {...stylex.props([
                          localStyles.utilityBlock,
                          localStyles.utilityTruncate,
                          localStyles.utilityFontMono,
                          localStyles.utilityText11px,
                          localStyles.utilityTextFgPrimary,
                        ])}
                      >
                        {node.name}
                      </span>
                      <span
                        {...stylex.props([
                          localStyles.utilityMt05,
                          localStyles.utilityFlex,
                          localStyles.utilityMinW0,
                          localStyles.utilityItemsCenter,
                          localStyles.utilityGap1,
                          localStyles.utilityFontMono,
                          localStyles.utilityText9px,
                          localStyles.utilityTextFgTertiary,
                        ])}
                      >
                        <span>{formatRuntimeDuration(node.durationMs)}</span>
                        {fanoutGroup ? (
                          <span {...stylex.props(styles.parallelTag)}>
                            fan-out {fanoutGroup.branchCount}
                          </span>
                        ) : null}
                        {!fanoutGroup && parallelGroup ? (
                          <span {...stylex.props(styles.parallelTag)}>
                            parallel
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                  {isError ? (
                    <span
                      {...stylex.props([
                        localStyles.utilityAbsolute,
                        localStyles.utilityTop1,
                        localStyles.utilityRight1,
                        localStyles.utilitySize25,
                        localStyles.utilityRoundedFull,
                        localStyles.utilityBorder,
                        localStyles.utilityBorderBgControl,
                        localStyles.utilityBgVarError,
                      ])}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        {...stylex.props([
          localStyles.utilityAbsolute,
          localStyles.utilityBottom10,
          localStyles.utilityLeft4,
          localStyles.utilityZ2,
          localStyles.utilityFlex,
          localStyles.utilityFlexCol,
          localStyles.utilityGap1,
        ])}
      >
        <button
          aria-label="Zoom graph in"
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilitySize7,
            localStyles.utilityPlaceItemsCenter,
            localStyles.utilityRoundedXs,
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityBgBgControl,
            localStyles.utilityTextFgSecondary,
            localStyles.utilityTransition,
            localStyles.utilityHoverBorderFgQuaternary,
            localStyles.utilityHoverTextFgPrimary,
          ])}
          onClick={() => zoomBy(flowViewDefaults.zoomStep)}
          type="button"
        >
          <Plus size={14} />
        </button>
        <button
          aria-label="Zoom graph out"
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilitySize7,
            localStyles.utilityPlaceItemsCenter,
            localStyles.utilityRoundedXs,
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityBgBgControl,
            localStyles.utilityTextFgSecondary,
            localStyles.utilityTransition,
            localStyles.utilityHoverBorderFgQuaternary,
            localStyles.utilityHoverTextFgPrimary,
          ])}
          onClick={() => zoomBy(-flowViewDefaults.zoomStep)}
          type="button"
        >
          <Minus size={14} />
        </button>
        <button
          aria-label="Frame graph"
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilitySize7,
            localStyles.utilityPlaceItemsCenter,
            localStyles.utilityRoundedXs,
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityBgBgControl,
            localStyles.utilityTextFgSecondary,
            localStyles.utilityTransition,
            localStyles.utilityHoverBorderFgQuaternary,
            localStyles.utilityHoverTextFgPrimary,
          ])}
          onClick={frameCanvas}
          type="button"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <div
        {...stylex.props([
          localStyles.utilityAbsolute,
          localStyles.utilityRight4,
          localStyles.utilityBottom10,
          localStyles.utilityZ2,
          localStyles.utilityH25,
          localStyles.utilityW35,
          localStyles.utilityOverflowHidden,
          localStyles.utilityRoundedXs,
          localStyles.utilityBorder,
          localStyles.utilityBorderLine,
          localStyles.utilityBgColorMixInSrgbVarBgCanvas90Transparent,
        ])}
      >
        <div
          {...stylex.props(
            styles.minimapCanvas({
              height: canvasHeight,
              scale: minimapScale,
              width: canvasWidth,
            })
          )}
        >
          {nodes.map(({ node, x, y }) => (
            <div
              {...stylex.props(
                styles.minimapNode({
                  color: serviceColor(node.service),
                  left: x,
                  opacity: selectedNodeId === node.id ? 1 : 0.45,
                  top: y,
                })
              )}
              key={node.id}
            />
          ))}
        </div>
      </div>

      <div
        {...stylex.props([
          localStyles.utilityAbsolute,
          localStyles.utilityBottom2,
          localStyles.utilityLeft12,
          localStyles.utilityZ2,
          localStyles.utilityFlex,
          localStyles.utilityTranslateX12,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap4,
          localStyles.utilityRoundedXs,
          localStyles.utilityBorder,
          localStyles.utilityBorderLine,
          localStyles.utilityBgColorMixInSrgbVarBgCanvas84Transparent,
          localStyles.utilityPx3,
          localStyles.utilityPy15,
          localStyles.utilityFontMono,
          localStyles.utilityText11px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        <span>Select nodes</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span>Ctrl wheel zoom</span>
        <span>Drag canvas</span>
      </div>
    </div>
  );
}

function flowNodeKindLabel(node: ExecutionNode) {
  const type = runtimeNodeType(node);
  return type ? runtimeNodeTypeLabel(type) : "Node";
}
