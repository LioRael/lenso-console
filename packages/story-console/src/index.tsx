import { defineConsoleExtension } from "@lenso/console-package-api";

import { storyConsoleManifest } from "./manifest";
import { RuntimeStoriesPage } from "./page";

export const storyConsoleExtension = defineConsoleExtension({
  components: { stories: RuntimeStoriesPage },
  manifest: storyConsoleManifest,
});
export const storyConsoleModule = storyConsoleExtension.module;

export { storyConsoleManifest } from "./manifest";
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
