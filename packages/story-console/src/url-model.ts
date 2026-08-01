import {
  consoleHostApi,
  type ExecutionInspectorTab,
  type RuntimeStory,
  type StoryViewMode,
} from "@lenso/console-package-api";

const defaultStoryViewMode = "waterfall" satisfies StoryViewMode;

export function runtimeStoriesPath(
  filters: {
    inspectorTab?: ExecutionInspectorTab;
    nodeId?: string | null;
    query?: string;
    storyId?: string | null;
    viewMode?: StoryViewMode;
  } = {}
) {
  return consoleHostApi.routing.buildPath("/stories", {
    node: filters.nodeId,
    q: filters.query,
    story: filters.storyId,
    tab:
      filters.inspectorTab === undefined || filters.inspectorTab === "overview"
        ? undefined
        : filters.inspectorTab,
    view:
      filters.viewMode === undefined ||
      filters.viewMode === defaultStoryViewMode
        ? undefined
        : filters.viewMode,
  });
}

export function readRuntimeStoriesParam(name: string) {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function replaceRuntimeStoriesUrl(path: string) {
  consoleHostApi.hooks.writeBrowserUrl(path, "replace");
}

export function pushRuntimeStoriesUrl(path: string) {
  consoleHostApi.hooks.writeBrowserUrl(path, "push");
}

export function readStoryViewMode(value: string): StoryViewMode {
  return isStoryViewMode(value) ? value : defaultStoryViewMode;
}

export function readExecutionInspectorTab(
  value: string
): ExecutionInspectorTab {
  return isExecutionInspectorTab(value) ? value : "overview";
}

export function storyUrlId(story: RuntimeStory | null | undefined) {
  return story?.correlationId ?? story?.id ?? null;
}

function isStoryViewMode(value: string): value is StoryViewMode {
  return (
    value === "story" ||
    value === "graph" ||
    value === "timeline" ||
    value === "waterfall" ||
    value === "flame" ||
    value === "heatmap"
  );
}

function isExecutionInspectorTab(
  value: string
): value is ExecutionInspectorTab {
  return consoleHostApi.story.executionInspectorTabs.some(
    (tab) => tab.id === value
  );
}
