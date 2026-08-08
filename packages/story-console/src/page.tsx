import { useGSAP } from "@gsap/react";
import {
  consoleHostApi,
  type ExecutionInspectorTab,
  type ExecutionNode,
  type RuntimeStory,
  type StoryViewMode,
} from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import gsap from "gsap";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { FederatedStoryEvidencePanel } from "./federated-evidence";
import { shouldCloseInspectorOnEscape } from "./keyboard";
import {
  resizeServicesPanelLayout,
  resizeExecutionInspectorLayout,
  resizeStoryListWidth,
  runtimeStoriesLayoutDefaults,
} from "./layout";
import { resolveSelectedRuntimeStory } from "./selection";
import {
  readExecutionInspectorTab,
  readRuntimeStoriesParam,
  readStoryViewMode,
  pushRuntimeStoriesUrl,
  replaceRuntimeStoriesUrl,
  runtimeStoriesPath,
  storyUrlId,
} from "./url-model";

const localStyles = stylex.create({
  utilityGrid: {
    display: "grid",
  },
  utilityHFull: {
    height: "100%",
  },
  utilityGridCols260px8pxMinmax01fr: {
    gridTemplateColumns: "260px 8px minmax(0,1fr)",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityBgBackground: {
    backgroundColor: "var(--background)",
  },
  utilityBgBorderSubtle: {
    backgroundColor: "var(--border-subtle)",
  },
  utilityTextForeground: {
    color: "var(--foreground)",
  },
  utilityHPx: {
    height: "1px",
  },
  utilityBgLineSubtle: {
    backgroundColor: "var(--line-subtle)",
  },
  utilityRelative: {
    position: "relative",
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityGridRowsAutoAutoAutoMinmax01fr: {
    gridTemplateRows: "auto auto auto minmax(0,1fr)",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderBorderSubtle: {
    borderColor: "var(--border-subtle)",
  },
  utilityBgSurface: {
    backgroundColor: "var(--surface)",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPy2: {
    paddingBlock: "calc(0.25rem * 2)",
  },
  utilityH4: {
    height: "calc(0.25rem * 4)",
  },
  utilityW20: {
    width: "calc(0.25rem * 20)",
  },
  utilityBgElevated: {
    backgroundColor: "var(--elevated)",
  },
  utilityMt1: {
    marginTop: "calc(0.25rem * 1)",
  },
  utilityH3: {
    height: "calc(0.25rem * 3)",
  },
  utilityW28: {
    width: "calc(0.25rem * 28)",
  },
  utilityH8: {
    height: "calc(0.25rem * 8)",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityH6: {
    height: "calc(0.25rem * 6)",
  },
  utilityH2: {
    height: "calc(0.25rem * 2)",
  },
  utilityW24: {
    width: "calc(0.25rem * 24)",
  },
  utilityContentStart: {
    alignContent: "flex-start",
  },
  utilityGap0: {
    gap: "calc(0.25rem * 0)",
  },
  utilityP3: {
    padding: "calc(0.25rem * 3)",
  },
  utilityW34: {
    width: "calc(3 / 4 * 100%)",
  },
  utilityMt2: {
    marginTop: "calc(0.25rem * 2)",
  },
  utilityW56: {
    width: "calc(5 / 6 * 100%)",
  },
  utilityMt3: {
    marginTop: "calc(0.25rem * 3)",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilityW12: {
    width: "calc(0.25rem * 12)",
  },
  utilityW14: {
    width: "calc(0.25rem * 14)",
  },
  utilityW10: {
    width: "calc(0.25rem * 10)",
  },
});

gsap.registerPlugin(useGSAP);

const styles = stylex.create({
  emptyState: {
    backgroundColor: "var(--surface)",
    height: "100%",
  },
  inspector: (open: boolean) => ({
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    pointerEvents: open ? "auto" : "none",
    position: "relative",
    zIndex: 0,
  }),
  main: (gridTemplateRows: string) => ({
    display: "grid",
    gridTemplateRows,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  }),
  resizeList: { width: 1 },
  resizeInspector: { width: 1 },
  resizeServices: {
    height: 1,
    insetInline: 0,
    position: "absolute",
    top: 0,
  },
  workbench: {
    display: "grid",
    height: "100%",
    minWidth: 0,
    overflow: "hidden",
  },
});

const emptyStories: RuntimeStory[] = [];
const selectedStoryStorageKey = "lenso-console:selected-story-correlation-id";
export const runtimeStoriesDefaultViewMode =
  "waterfall" satisfies StoryViewMode;

export function runtimeStoriesWorkbenchStyle(
  gridTemplateColumns: string,
  inspectorOpenProgress: number
) {
  return {
    "--story-inspector-open": inspectorOpenProgress,
    gridTemplateColumns,
  } as CSSProperties;
}

export type StoryModuleMetadata = {
  module_name?: string;
  status?: "loaded" | "error";
};

export function storyModuleIsUnavailable(
  module: StoryModuleMetadata | undefined
) {
  return module !== undefined && module.status !== "loaded";
}

export function RuntimeStoriesPage() {
  const {
    context: { useConsole },
    data: { retryTargetForNode },
    hooks: { useBrowserUrlPopState, useListKeyboard, usePersistedLayout },
    modules: { useMetadata: useConsoleModulesMetadata },
    queries: { useRuntimeStories, useRuntimeStoryDetail },
    story: { findStoryByCorrelation },
    ui: {
      common: { EmptyState },
      runtime: {
        ExecutionInspector,
        ResizeHandle,
        RuntimeStoryVisualization,
        ServiceSummaryStrip,
        StoryHeader,
        StoryList,
        defaultExecutionInspectorTab,
      },
    },
  } = consoleHostApi;
  const { activeStoryTarget, clearStoryTarget, openRetry } = useConsole();
  const modulesQuery = useConsoleModulesMetadata();
  const storyModule = modulesQuery.data?.modules.find(
    (module) => module.module_name === "lenso/platform-story"
  );
  const storyModuleUnavailable = storyModuleIsUnavailable(storyModule);
  const storiesQuery = useRuntimeStories({ enabled: !storyModuleUnavailable });
  const stories = storiesQuery.data ?? emptyStories;
  const [query, setQuery] = useState(() => readRuntimeStoriesParam("q"));
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(
    () =>
      readRuntimeStoriesParam("story") ||
      (typeof window === "undefined"
        ? null
        : window.localStorage.getItem(selectedStoryStorageKey))
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => readRuntimeStoriesParam("node") || null
  );
  const [displayedNode, setDisplayedNode] = useState<ExecutionNode | null>(
    null
  );
  const [inspectorDismissed, setInspectorDismissed] = useState(false);
  const [storyDetailClosed, setStoryDetailClosed] = useState(false);
  const [servicesExpanded, setServicesExpanded] = useState(true);
  const [mode, setMode] = useState<StoryViewMode>(() =>
    readStoryViewMode(readRuntimeStoriesParam("view"))
  );
  const [inspectorTab, setInspectorTab] = useState<ExecutionInspectorTab>(() =>
    readExecutionInspectorTab(readRuntimeStoriesParam("tab"))
  );
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const inspectorPanelRef = useRef<HTMLDivElement | null>(null);
  const previousInspectorOpenRef = useRef(false);
  const skipNextInspectorOpenAnimationRef = useRef(true);
  const [layout, setLayout, resetLayout] = usePersistedLayout(
    "lenso-console:stories-layout",
    runtimeStoriesLayoutDefaults
  );
  const storiesLayout = { ...runtimeStoriesLayoutDefaults, ...layout };
  const inspectorWidthRef = useRef(storiesLayout.inspectorWidth);
  const servicesExpandedRef = useRef(servicesExpanded);
  const servicesHeightRef = useRef(storiesLayout.servicesHeight);

  useEffect(() => {
    inspectorWidthRef.current = storiesLayout.inspectorWidth;
  }, [storiesLayout.inspectorWidth]);

  useEffect(() => {
    servicesExpandedRef.current = servicesExpanded;
  }, [servicesExpanded]);

  useEffect(() => {
    servicesHeightRef.current = storiesLayout.servicesHeight;
  }, [storiesLayout.servicesHeight]);

  const visibleStories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return stories.filter((story) => {
      if (!normalized) {
        return true;
      }
      return [
        story.id,
        story.name,
        story.service,
        story.source,
        story.correlationId,
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [query, stories]);

  const targetStoryId = activeStoryTarget?.storyId ?? selectedStoryId;
  const targetStory = targetStoryId
    ? findStoryByCorrelation(stories, targetStoryId)
    : null;
  const selectedStorySummary =
    targetStory ??
    resolveSelectedRuntimeStory(
      visibleStories,
      selectedStoryId,
      storyDetailClosed
    );
  const selectedStoryCorrelationId =
    selectedStorySummary?.correlationId ??
    (storyDetailClosed ? null : targetStoryId);
  const storyDetailQuery = useRuntimeStoryDetail(selectedStoryCorrelationId, {
    enabled: !storyModuleUnavailable && Boolean(selectedStoryCorrelationId),
  });
  const selectedStory = storyDetailQuery.data ?? null;
  const selectedStoryForUrl = selectedStory ?? selectedStorySummary;
  const selectedNode =
    selectedStory?.nodes.find((node) => {
      const targetNodeId = activeStoryTarget?.nodeId ?? selectedNodeId;
      return targetNodeId ? node.id === targetNodeId : false;
    }) ?? null;
  const selectedStoryIndex = Math.max(
    0,
    visibleStories.findIndex((story) => story.id === selectedStorySummary?.id)
  );
  const inspectorOpen = selectedNode !== null;
  const hasInspector = displayedNode !== null;
  const listColumn = `clamp(220px,24vw,${storiesLayout.listWidth}px)`;
  const inspectorColumn = `clamp(280px,30vw,${storiesLayout.inspectorWidth}px)`;
  const gridTemplateColumns = hasInspector
    ? `${listColumn} 1px minmax(0,1fr) calc(1px * var(--story-inspector-open)) minmax(0,calc(${inspectorColumn} * var(--story-inspector-open)))`
    : `${listColumn} 1px minmax(0,1fr)`;
  const showServicesPanel = mode === "waterfall" || mode === "flame";
  const storyDetailLoading =
    Boolean(selectedStoryCorrelationId) && storyDetailQuery.isPending;
  const mainGridTemplateRows = selectedStory
    ? [
        "auto",
        "1px",
        ...(selectedStory.federation ? ["auto"] : []),
        "minmax(0,1fr)",
        ...(showServicesPanel ? ["auto"] : []),
      ].join(" ")
    : "minmax(0,1fr)";

  useBrowserUrlPopState((search) => {
    clearStoryTarget();
    setQuery(search.get("q") ?? "");
    setSelectedStoryId(search.get("story") || null);
    setSelectedNodeId(search.get("node") || null);
    setMode(readStoryViewMode(search.get("view") ?? ""));
    setInspectorTab(readExecutionInspectorTab(search.get("tab") ?? ""));
    setInspectorDismissed(false);
    setStoryDetailClosed(false);
    skipNextInspectorOpenAnimationRef.current = true;
  });

  const storyUrl = (
    overrides: Partial<{
      inspectorTab: ExecutionInspectorTab;
      nodeId: string | null;
      query: string;
      storyId: string | null;
      viewMode: StoryViewMode;
    }> = {}
  ) =>
    runtimeStoriesPath({
      inspectorTab: overrides.inspectorTab ?? inspectorTab,
      nodeId: Object.hasOwn(overrides, "nodeId")
        ? (overrides.nodeId ?? null)
        : (selectedNode?.id ?? null),
      query: overrides.query ?? query,
      storyId: Object.hasOwn(overrides, "storyId")
        ? (overrides.storyId ?? null)
        : storyUrlId(selectedStoryForUrl),
      viewMode: overrides.viewMode ?? mode,
    });

  const pushStoryUrl = (overrides: Parameters<typeof storyUrl>[0] = {}) =>
    pushRuntimeStoriesUrl(storyUrl(overrides));

  useEffect(() => {
    if (storiesQuery.isLoading) {
      return;
    }
    replaceRuntimeStoriesUrl(
      runtimeStoriesPath({
        inspectorTab: selectedNode ? inspectorTab : "overview",
        nodeId: selectedNode?.id ?? null,
        query,
        storyId: storyUrlId(selectedStoryForUrl),
        viewMode: mode,
      })
    );
  }, [
    inspectorTab,
    mode,
    query,
    selectedNode,
    selectedStoryForUrl,
    storiesQuery.isLoading,
  ]);

  useEffect(() => {
    if (selectedNode) {
      setDisplayedNode(selectedNode);
    }
  }, [selectedNode]);

  useEffect(() => {
    if (selectedNodeId || inspectorDismissed) {
      return;
    }
    const [defaultNode] = selectedStory?.nodes ?? [];
    if (!defaultNode) {
      return;
    }
    setSelectedNodeId(defaultNode.id);
    setInspectorTab(defaultExecutionInspectorTab(defaultNode));
  }, [
    defaultExecutionInspectorTab,
    inspectorDismissed,
    selectedNodeId,
    selectedStory,
  ]);

  useEffect(() => {
    if (!inspectorOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldCloseInspectorOnEscape(event)) {
        return;
      }

      event.preventDefault();
      clearStoryTarget();
      setSelectedNodeId(null);
      setInspectorDismissed(true);
      setInspectorTab("overview");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearStoryTarget, inspectorOpen]);

  useGSAP(
    () => {
      const workbench = workbenchRef.current;
      const inspectorPanel = inspectorPanelRef.current;

      if (!workbench || (!displayedNode && !previousInspectorOpenRef.current)) {
        return;
      }

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const nextOpen = inspectorOpen ? 1 : 0;
      const skipOpenAnimation =
        inspectorOpen &&
        !previousInspectorOpenRef.current &&
        skipNextInspectorOpenAnimationRef.current;
      const hasOpenStateChanged =
        previousInspectorOpenRef.current !== inspectorOpen;
      if (skipOpenAnimation) {
        skipNextInspectorOpenAnimationRef.current = false;
      }
      previousInspectorOpenRef.current = inspectorOpen;
      gsap.killTweensOf(workbench);
      gsap.killTweensOf(inspectorPanel);

      if (!hasOpenStateChanged || skipOpenAnimation) {
        gsap.set(workbench, {
          "--story-inspector-open": nextOpen,
        });
        gsap.set(inspectorPanel, {
          autoAlpha: nextOpen,
          x: inspectorOpen ? 0 : 18,
        });
        return;
      }

      if (reduceMotion) {
        gsap.set(workbench, {
          "--story-inspector-open": nextOpen,
        });
        gsap.set(inspectorPanel, {
          autoAlpha: nextOpen,
          x: 0,
        });
        if (!inspectorOpen) {
          setDisplayedNode(null);
        }
        return;
      }

      gsap.to(workbench, {
        "--story-inspector-open": nextOpen,
        duration: inspectorOpen ? 0.32 : 0.24,
        ease: inspectorOpen ? "power3.out" : "power2.inOut",
        onComplete: () => {
          if (!inspectorOpen) {
            setDisplayedNode(null);
          }
        },
      });
      gsap.fromTo(
        inspectorPanel,
        {
          autoAlpha: inspectorOpen ? 0 : 1,
          x: inspectorOpen ? 24 : 0,
        },
        {
          autoAlpha: inspectorOpen ? 1 : 0,
          duration: inspectorOpen ? 0.24 : 0.16,
          ease: inspectorOpen ? "power2.out" : "power2.in",
          x: inspectorOpen ? 0 : 18,
        }
      );
    },
    {
      dependencies: [
        displayedNode?.id ?? null,
        inspectorOpen,
        storiesLayout.inspectorWidth,
        storiesLayout.servicesHeight,
      ],
      scope: workbenchRef,
    }
  );

  const selectStory = (story: RuntimeStory) => {
    setStoryDetailClosed(false);
    skipNextInspectorOpenAnimationRef.current = true;
    clearStoryTarget();
    pushStoryUrl({
      inspectorTab: "overview",
      nodeId: null,
      storyId: storyUrlId(story),
    });
    setSelectedStoryId(story.correlationId);
    window.localStorage.setItem(selectedStoryStorageKey, story.correlationId);
    setSelectedNodeId(null);
    setInspectorDismissed(false);
    setInspectorTab("overview");
  };

  const closeStoryDetail = () => {
    setStoryDetailClosed(true);
    clearStoryTarget();
    pushStoryUrl({ inspectorTab: "overview", nodeId: null, storyId: null });
    setSelectedStoryId(null);
    window.localStorage.removeItem(selectedStoryStorageKey);
    setSelectedNodeId(null);
    setDisplayedNode(null);
    setInspectorDismissed(false);
    setInspectorTab("overview");
  };

  const resizeStoryList = (deltaX: number) => {
    setLayout((current) => ({
      ...current,
      listWidth: resizeStoryListWidth(current.listWidth, deltaX),
    }));
  };

  const resizeInspector = (deltaX: number) => {
    const next = resizeExecutionInspectorLayout({
      currentWidth: inspectorWidthRef.current,
      deltaX,
    });
    inspectorWidthRef.current = next.width;
    setLayout((current) => ({
      ...current,
      inspectorWidth: next.width,
    }));
    if (!next.open) {
      clearStoryTarget();
      setSelectedNodeId(null);
      setInspectorDismissed(true);
      setInspectorTab("overview");
    }
  };

  const resizeServices = (deltaY: number) => {
    const next = resizeServicesPanelLayout({
      currentHeight: servicesHeightRef.current,
      deltaY,
      expanded: servicesExpandedRef.current,
    });
    servicesExpandedRef.current = next.expanded;
    servicesHeightRef.current = next.height;
    setServicesExpanded(next.expanded);
    setLayout((current) => ({
      ...current,
      servicesHeight: next.height,
    }));
  };

  const selectNode = (node: ExecutionNode) => {
    setStoryDetailClosed(false);
    if (!inspectorOpen) {
      skipNextInspectorOpenAnimationRef.current = false;
    }
    const nextStoryId =
      selectedStory?.correlationId ??
      selectedStoryCorrelationId ??
      selectedStoryId ??
      null;
    setSelectedStoryId(nextStoryId);
    if (nextStoryId) {
      window.localStorage.setItem(selectedStoryStorageKey, nextStoryId);
    }
    clearStoryTarget();
    setInspectorDismissed(false);
    pushStoryUrl({
      inspectorTab: defaultExecutionInspectorTab(node),
      nodeId: node.id,
      storyId: nextStoryId,
    });
    setSelectedNodeId(node.id);
    setInspectorTab(defaultExecutionInspectorTab(node));
  };

  const setModeFromUi = (nextMode: StoryViewMode) => {
    pushStoryUrl({ viewMode: nextMode });
    setMode(nextMode);
  };

  const setInspectorTabFromUi = (nextTab: ExecutionInspectorTab) => {
    pushStoryUrl({ inspectorTab: nextTab });
    setInspectorTab(nextTab);
  };

  const retryNode = (node: ExecutionNode) => {
    selectNode(node);
    const retryTarget = retryTargetForNode(node);
    if (retryTarget) {
      openRetry(retryTarget);
    }
  };

  useListKeyboard({
    items: visibleStories,
    onOpen: selectStory,
    // ponytail: list rows are summaries; retry from detail after real node ids load.
    selectedIndex: selectedStoryIndex,
    setSelectedIndex: (index) => {
      const story = visibleStories[index];
      if (story) {
        selectStory(story);
      }
    },
  });

  if (modulesQuery.isLoading || storiesQuery.isLoading) {
    return (
      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityHFull,
          localStyles.utilityGridCols260px8pxMinmax01fr,
          localStyles.utilityOverflowHidden,
          localStyles.utilityBgBackground,
        ])}
        data-runtime-page="true"
      >
        <StoryListSkeleton />
        <div {...stylex.props([localStyles.utilityBgBorderSubtle])} />
        <EmptyState stylex={styles.emptyState}>
          <EmptyState.Title>Loading stories</EmptyState.Title>
          <EmptyState.Description>
            Runtime executions are being loaded from the selected data source.
          </EmptyState.Description>
        </EmptyState>
      </div>
    );
  }

  if (storyModuleUnavailable) {
    return (
      <EmptyState stylex={styles.emptyState}>
        <EmptyState.Title>Story module disabled</EmptyState.Title>
        <EmptyState.Description>
          Enable lenso/platform-story in Modules, then restart the API to use
          Runtime Stories.
        </EmptyState.Description>
      </EmptyState>
    );
  }

  if (storiesQuery.isError) {
    return (
      <EmptyState stylex={styles.emptyState}>
        <EmptyState.Title>Story Explorer unavailable</EmptyState.Title>
        <EmptyState.Description>
          {storiesQuery.error instanceof Error
            ? storiesQuery.error.message
            : "Runtime story data could not be loaded."}
        </EmptyState.Description>
      </EmptyState>
    );
  }

  return (
    <div
      {...stylex.props([
        localStyles.utilityHFull,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBackground,
        localStyles.utilityTextForeground,
      ])}
      data-runtime-page="true"
      id="story-workbench"
    >
      <div
        ref={workbenchRef}
        {...stylex.props(styles.workbench)}
        data-runtime-slot="workbench"
        style={runtimeStoriesWorkbenchStyle(
          gridTemplateColumns,
          previousInspectorOpenRef.current ||
            (inspectorOpen && skipNextInspectorOpenAnimationRef.current)
            ? 1
            : 0
        )}
      >
        <StoryList
          onSelect={selectStory}
          query={query}
          selectedStoryId={selectedStoryForUrl?.id ?? null}
          setQuery={setQuery}
          stories={visibleStories}
        />

        <ResizeHandle
          ariaLabel="Resize story list panel"
          onReset={resetLayout}
          onResize={resizeStoryList}
          slot="list-resize"
          stylex={styles.resizeList}
        />

        <main
          {...stylex.props(styles.main(mainGridTemplateRows))}
          data-runtime-slot="main"
        >
          {selectedStory ? (
            <>
              <StoryHeader
                onClose={closeStoryDetail}
                onSelectNode={selectNode}
                story={selectedStory}
              />

              <div
                aria-hidden="true"
                {...stylex.props([
                  localStyles.utilityHPx,
                  localStyles.utilityBgLineSubtle,
                ])}
              />

              <FederatedStoryEvidencePanel
                onSelectNode={selectNode}
                story={selectedStory}
              />

              <RuntimeStoryVisualization
                mode={mode}
                onRetryNode={retryNode}
                onSelectNode={selectNode}
                selectedNodeId={selectedNode?.id ?? null}
                setMode={setModeFromUi}
                story={selectedStory}
              />

              {showServicesPanel ? (
                <div
                  {...stylex.props([
                    localStyles.utilityRelative,
                    localStyles.utilityMinH0,
                    localStyles.utilityMinW0,
                  ])}
                >
                  <ResizeHandle
                    ariaLabel="Resize services panel"
                    axis="vertical"
                    onReset={resetLayout}
                    onResize={resizeServices}
                    slot="services-resize"
                    stylex={styles.resizeServices}
                  />

                  <ServiceSummaryStrip
                    expanded={servicesExpanded}
                    height={storiesLayout.servicesHeight}
                    onExpandedChange={setServicesExpanded}
                    story={selectedStory}
                  />
                </div>
              ) : null}
            </>
          ) : storyDetailLoading ? (
            <EmptyState stylex={styles.emptyState}>
              <EmptyState.Title>Loading story detail</EmptyState.Title>
              <EmptyState.Description>
                The selected runtime story is being loaded.
              </EmptyState.Description>
            </EmptyState>
          ) : storyDetailQuery.isError ? (
            <EmptyState stylex={styles.emptyState}>
              <EmptyState.Title>Story detail unavailable</EmptyState.Title>
              <EmptyState.Description>
                {storyDetailQuery.error instanceof Error
                  ? storyDetailQuery.error.message
                  : "Runtime story detail could not be loaded."}
              </EmptyState.Description>
            </EmptyState>
          ) : (
            <EmptyState stylex={styles.emptyState}>
              <EmptyState.Title>
                {stories.length === 0
                  ? "No runtime stories"
                  : query
                    ? "No matching stories"
                    : "No story selected"}
              </EmptyState.Title>
              <EmptyState.Description>
                {stories.length === 0
                  ? "The backend returned an empty runtime story list."
                  : query
                    ? "Try a different story, service, outbox, function, or correlation filter."
                    : "Select a story from the explorer to inspect its execution."}
              </EmptyState.Description>
            </EmptyState>
          )}
        </main>

        {selectedStory && displayedNode ? (
          <>
            <ResizeHandle
              ariaLabel="Resize story inspector panel"
              onReset={resetLayout}
              onResize={resizeInspector}
              slot="inspector-resize"
              stylex={styles.resizeInspector}
            />

            <div
              ref={inspectorPanelRef}
              {...stylex.props(styles.inspector(inspectorOpen))}
              data-runtime-slot="inspector"
            >
              <ExecutionInspector
                activeTab={inspectorTab}
                onClearSelection={() => {
                  pushStoryUrl({ inspectorTab: "overview", nodeId: null });
                  setSelectedStoryId(storyUrlId(selectedStory));
                  clearStoryTarget();
                  setSelectedNodeId(null);
                  setInspectorDismissed(true);
                  setInspectorTab("overview");
                }}
                selectedNode={displayedNode}
                setActiveTab={setInspectorTabFromUi}
                story={selectedStory}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StoryListSkeleton() {
  return (
    <aside
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilityHFull,
        localStyles.utilityMinH0,
        localStyles.utilityMinW0,
        localStyles.utilityGridRowsAutoAutoAutoMinmax01fr,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBgBackground,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityBorderB,
          localStyles.utilityBorderBorderSubtle,
          localStyles.utilityBgSurface,
          localStyles.utilityPx3,
          localStyles.utilityPy2,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityH4,
            localStyles.utilityW20,
            localStyles.utilityBgElevated,
          ])}
        />
        <div
          {...stylex.props([
            localStyles.utilityMt1,
            localStyles.utilityH3,
            localStyles.utilityW28,
            localStyles.utilityBgElevated,
          ])}
        />
      </div>
      <div
        {...stylex.props([
          localStyles.utilityH8,
          localStyles.utilityBorderB,
          localStyles.utilityBorderBorderSubtle,
          localStyles.utilityPx3,
          localStyles.utilityPy2,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityH3,
            localStyles.utilityWFull,
            localStyles.utilityBgElevated,
          ])}
        />
      </div>
      <div
        {...stylex.props([
          localStyles.utilityH6,
          localStyles.utilityBorderB,
          localStyles.utilityBorderBorderSubtle,
          localStyles.utilityPx3,
          localStyles.utilityPy2,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityH2,
            localStyles.utilityW24,
            localStyles.utilityBgElevated,
          ])}
        />
      </div>
      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityContentStart,
          localStyles.utilityGap0,
        ])}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            {...stylex.props([
              localStyles.utilityBorderB,
              localStyles.utilityBorderBorderSubtle,
              localStyles.utilityP3,
            ])}
            key={index}
          >
            <div
              {...stylex.props([
                localStyles.utilityH3,
                localStyles.utilityW34,
                localStyles.utilityBgElevated,
              ])}
            />
            <div
              {...stylex.props([
                localStyles.utilityMt2,
                localStyles.utilityH2,
                localStyles.utilityW56,
                localStyles.utilityBgElevated,
              ])}
            />
            <div
              {...stylex.props([
                localStyles.utilityMt3,
                localStyles.utilityFlex,
                localStyles.utilityGap15,
              ])}
            >
              <span
                {...stylex.props([
                  localStyles.utilityH3,
                  localStyles.utilityW12,
                  localStyles.utilityBgElevated,
                ])}
              />
              <span
                {...stylex.props([
                  localStyles.utilityH3,
                  localStyles.utilityW14,
                  localStyles.utilityBgElevated,
                ])}
              />
              <span
                {...stylex.props([
                  localStyles.utilityH3,
                  localStyles.utilityW10,
                  localStyles.utilityBgElevated,
                ])}
              />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
