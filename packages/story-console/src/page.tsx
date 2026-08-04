import { useGSAP } from "@gsap/react";
import {
  consoleHostApi,
  type ExecutionInspectorTab,
  type ExecutionNode,
  type RuntimeStory,
  type StoryViewMode,
} from "@lenso/console-ui-internal";
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

gsap.registerPlugin(useGSAP);

const emptyStories: RuntimeStory[] = [];
const selectedStoryStorageKey = "lenso-console:selected-story-correlation-id";
export const runtimeStoriesDefaultViewMode =
  "waterfall" satisfies StoryViewMode;
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
    context: { useRuntimeConsole },
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
  const { activeStoryTarget, clearStoryTarget, openRetry } =
    useRuntimeConsole();
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
        ...(selectedStory.federation ? ["auto"] : []),
        "minmax(0,1fr)",
        ...(showServicesPanel ? ["auto", "auto"] : []),
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
      const hasOpenStateChanged =
        previousInspectorOpenRef.current !== inspectorOpen;
      previousInspectorOpenRef.current = inspectorOpen;
      gsap.killTweensOf(workbench);
      gsap.killTweensOf(inspectorPanel);

      if (!hasOpenStateChanged) {
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
      <div className="runtime-stories-page grid h-full grid-cols-[260px_8px_minmax(0,1fr)] overflow-hidden bg-(--background)">
        <StoryListSkeleton />
        <div className="bg-(--border-subtle)" />
        <EmptyState className="h-full bg-(--surface)">
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
      <EmptyState className="h-full bg-(--surface)">
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
      <EmptyState className="h-full bg-(--surface)">
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
      className="runtime-stories-page h-full overflow-hidden bg-(--background) text-(--foreground)"
      id="story-workbench"
    >
      <div
        ref={workbenchRef}
        className="runtime-stories-workbench grid h-full min-w-0 overflow-hidden"
        style={
          {
            "--story-inspector-open": previousInspectorOpenRef.current ? 1 : 0,
            gridTemplateColumns,
          } as CSSProperties
        }
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
          className="runtime-stories-list-resize w-px"
          onReset={resetLayout}
          onResize={resizeStoryList}
        />

        <main
          className="runtime-stories-main grid min-h-0 min-w-0 overflow-hidden"
          style={{
            gridTemplateRows: mainGridTemplateRows,
          }}
        >
          {selectedStory ? (
            <>
              <StoryHeader
                onClose={closeStoryDetail}
                onSelectNode={selectNode}
                story={selectedStory}
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
                <>
                  <ResizeHandle
                    ariaLabel="Resize services panel"
                    axis="vertical"
                    className="h-px"
                    onReset={resetLayout}
                    onResize={resizeServices}
                  />

                  <ServiceSummaryStrip
                    expanded={servicesExpanded}
                    height={storiesLayout.servicesHeight}
                    onExpandedChange={setServicesExpanded}
                    story={selectedStory}
                  />
                </>
              ) : null}
            </>
          ) : storyDetailLoading ? (
            <EmptyState className="h-full bg-(--surface)">
              <EmptyState.Title>Loading story detail</EmptyState.Title>
              <EmptyState.Description>
                The selected runtime story is being loaded.
              </EmptyState.Description>
            </EmptyState>
          ) : storyDetailQuery.isError ? (
            <EmptyState className="h-full bg-(--surface)">
              <EmptyState.Title>Story detail unavailable</EmptyState.Title>
              <EmptyState.Description>
                {storyDetailQuery.error instanceof Error
                  ? storyDetailQuery.error.message
                  : "Runtime story detail could not be loaded."}
              </EmptyState.Description>
            </EmptyState>
          ) : (
            <EmptyState className="h-full bg-(--surface)">
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
              className="runtime-stories-inspector-resize w-px"
              onReset={resetLayout}
              onResize={resizeInspector}
            />

            <div
              ref={inspectorPanelRef}
              className="relative z-0 min-h-0 min-w-0 overflow-hidden"
              style={{
                pointerEvents: inspectorOpen ? "auto" : "none",
              }}
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
    <aside className="grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden bg-(--background)">
      <div className="border-b border-(--border-subtle) bg-(--surface) px-3 py-2">
        <div className="h-4 w-20 bg-(--elevated)" />
        <div className="mt-1 h-3 w-28 bg-(--elevated)" />
      </div>
      <div className="h-8 border-b border-(--border-subtle) px-3 py-2">
        <div className="h-3 w-full bg-(--elevated)" />
      </div>
      <div className="h-6 border-b border-(--border-subtle) px-3 py-2">
        <div className="h-2 w-24 bg-(--elevated)" />
      </div>
      <div className="grid content-start gap-0">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="border-b border-(--border-subtle) p-3" key={index}>
            <div className="h-3 w-3/4 bg-(--elevated)" />
            <div className="mt-2 h-2 w-5/6 bg-(--elevated)" />
            <div className="mt-3 flex gap-1.5">
              <span className="h-3 w-12 bg-(--elevated)" />
              <span className="h-3 w-14 bg-(--elevated)" />
              <span className="h-3 w-10 bg-(--elevated)" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
