import { defineConsoleModule } from "@lenso/console-ui-internal";

import { RuntimeStoriesPage } from "./page";

export const storyConsoleModule = defineConsoleModule({
  id: "lenso/platform-story",
  surfaces: [
    {
      area: "runtime",
      component: RuntimeStoriesPage,
      icon: "workflow",
      label: "Stories",
      path: "/stories",
    },
  ],
});

export { RuntimeStoriesPage, runtimeStoriesDefaultViewMode } from "./page";
export { shouldCloseInspectorOnEscape } from "./keyboard";
export {
  resizeExecutionInspectorLayout,
  resizeExecutionInspectorWidth,
  resizeServicesPanelHeight,
  resizeServicesPanelLayout,
  resizeStoryListWidth,
  runtimeStoriesLayoutDefaults,
} from "./layout";
export { resolveSelectedRuntimeStory } from "./selection";
export {
  pushRuntimeStoriesUrl,
  readExecutionInspectorTab,
  readRuntimeStoriesParam,
  readStoryViewMode,
  replaceRuntimeStoriesUrl,
  runtimeStoriesPath,
  storyUrlId,
} from "./url-model";
