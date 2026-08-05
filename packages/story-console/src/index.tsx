import { defineConsoleManifest } from "@lenso/console-module-api";
import type { ConsoleModuleManifest } from "@lenso/console-module-api";
import { defineConsoleModule, defineConsoleUiModule } from "@lenso/console-ui";

import manifestDefinition from "../console-module.json";
import { RuntimeStoriesPage } from "./page";

export const storyConsoleModule = defineConsoleModule({
  id: "lenso/platform-story",
  surfaces: [
    {
      area: "runtime",
      component: RuntimeStoriesPage,
      icon: "workflow",
      label: "Stories",
      navigation: {
        order: 60,
        workspace: {
          icon: "settings",
          id: "system",
          label: "System",
          localizedLabels: { "zh-CN": "系统" },
        },
      },
      path: "/stories",
    },
  ],
});

export const storyConsoleUiModule = defineConsoleUiModule({
  manifest: defineConsoleManifest(manifestDefinition as ConsoleModuleManifest),
  surfaces: { "runtime-stories": RuntimeStoriesPage },
});

export default storyConsoleUiModule;

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
