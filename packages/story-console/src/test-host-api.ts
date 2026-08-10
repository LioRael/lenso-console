import {
  configureConsoleHostApi,
  type ConsoleHostApi,
  type RuntimeStory,
} from "@lenso/console-ui";

const story = {
  correlationId: "corr_test",
  id: "story_test",
} as RuntimeStory;

configureConsoleHostApi({
  data: { retryTargetForNode: () => null, runtimeStories: [story] },
  routing: {
    buildPath: (path: string, query: Record<string, unknown> = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, String(value));
        }
      }
      const serialized = params.toString();
      return serialized ? `${path}?${serialized}` : path;
    },
  },
  story: {
    executionInspectorTabs: [
      { id: "overview", label: "Overview" },
      { id: "payload", label: "Payload" },
      { id: "logs", label: "Logs" },
      { id: "events", label: "Events" },
      { id: "operations", label: "Operations" },
    ],
    findStoryByCorrelation: () => null,
  },
  ui: {
    runtime: { StoryHeader: () => null },
  },
  version: "2",
} as unknown as ConsoleHostApi);
