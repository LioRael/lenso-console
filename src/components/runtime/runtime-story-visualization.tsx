import * as stylex from "@stylexjs/stylex";

import type { RuntimeStory, ExecutionNode } from "../../data/mock-runtime";
import { useStoryHeatmap } from "../../hooks/use-runtime-queries";
import { FlameView } from "./flame-view";
import { FlowView } from "./flow-view";
import { HeatmapView } from "./heatmap-view";
import { RuntimeStoryView } from "./runtime-story-view";
import type { StoryViewMode } from "./story-tabs";
import { StoryTabs } from "./story-tabs";
import { StoryTimelineView } from "./story-timeline-view";
import { WaterfallView } from "./waterfall-view";

const localStyles = stylex.create({
  utilityIsolate: {
    isolation: "isolate",
  },
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
  utilityGridRows38pxMinmax01fr: {
    gridTemplateRows: "38px minmax(0,1fr)",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityBgBgSurface: {
    backgroundColor: "var(--bg-surface)",
  },
});

export function RuntimeStoryVisualization({
  mode,
  selectedNodeId,
  setMode,
  story,
  onRetryNode,
  onSelectNode,
}: {
  story: RuntimeStory;
  mode: StoryViewMode;
  selectedNodeId: string | null;
  setMode: (mode: StoryViewMode) => void;
  onSelectNode: (node: ExecutionNode) => void;
  onRetryNode: (node: ExecutionNode) => void;
}) {
  const heatmapQuery = useStoryHeatmap(story);

  return (
    <section
      {...stylex.props([
        localStyles.utilityIsolate,
        localStyles.utilityGrid,
        localStyles.utilityHFull,
        localStyles.utilityMinH0,
        localStyles.utilityMinW0,
        localStyles.utilityGridRows38pxMinmax01fr,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBgSurface,
      ])}
    >
      <StoryTabs mode={mode} onChange={setMode} />
      <div
        aria-labelledby={`story-tab-${mode}`}
        {...stylex.props([
          localStyles.utilityMinH0,
          localStyles.utilityMinW0,
          localStyles.utilityOverflowHidden,
        ])}
        id="story-view-panel"
        role="tabpanel"
      >
        {mode === "story" ? (
          <RuntimeStoryView
            onRetryNode={(node) => onRetryNode(node.node)}
            onSelectNode={onSelectNode}
            selectedNodeId={selectedNodeId}
            story={story}
          />
        ) : null}
        {mode === "graph" ? (
          <FlowView
            onSelectNode={onSelectNode}
            selectedNodeId={selectedNodeId}
            story={story}
          />
        ) : null}
        {mode === "timeline" ? (
          <StoryTimelineView
            onSelectNode={onSelectNode}
            selectedNodeId={selectedNodeId}
            story={story}
          />
        ) : null}
        {mode === "waterfall" ? (
          <WaterfallView
            onSelectNode={onSelectNode}
            selectedNodeId={selectedNodeId}
            story={story}
          />
        ) : null}
        {mode === "flame" ? (
          <FlameView
            onSelectNode={onSelectNode}
            selectedNodeId={selectedNodeId}
            story={story}
          />
        ) : null}
        {mode === "heatmap" ? (
          <HeatmapView
            heatmap={heatmapQuery.data}
            loading={heatmapQuery.isLoading}
            onSelectNode={onSelectNode}
            queryError={heatmapQuery.error}
            selectedNodeId={selectedNodeId}
            story={story}
          />
        ) : null}
      </div>
    </section>
  );
}
