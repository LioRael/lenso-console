import { consoleHostApi } from "@lenso/console-ui-internal";
import { describe, expect, test } from "vitest";

import { shouldCloseInspectorOnEscape } from "./keyboard";
import {
  runtimeStoriesDefaultViewMode,
  storyModuleIsUnavailable,
} from "./page";

describe("story workbench page contracts", () => {
  test("defaults to the runtime story visualization mode", () => {
    const defaultViewMode: "waterfall" = runtimeStoriesDefaultViewMode;

    expect(defaultViewMode).toBe("waterfall");
  });

  test("keeps story header props aligned with story data", () => {
    const story = consoleHostApi.data.runtimeStories[0]!;
    const storyHeaderProps: Parameters<
      typeof consoleHostApi.ui.runtime.StoryHeader
    >[0] = {
      onClose: () => undefined,
      onSelectNode: () => undefined,
      story,
    };

    expect(storyHeaderProps.story.id).toBe(story.id);
  });

  test("treats disabled story metadata as unavailable", () => {
    expect(storyModuleIsUnavailable(undefined)).toBe(false);
    expect(
      storyModuleIsUnavailable({
        module_name: "lenso/platform-story",
        status: "loaded",
      })
    ).toBe(false);
    expect(
      storyModuleIsUnavailable({
        module_name: "lenso/platform-story",
        status: "error",
      })
    ).toBe(true);
  });

  test("closes the inspector on plain Escape outside editable controls", () => {
    expect(
      shouldCloseInspectorOnEscape({
        altKey: false,
        ctrlKey: false,
        defaultPrevented: false,
        key: "Escape",
        metaKey: false,
        target: null,
      })
    ).toBe(true);
  });

  test("keeps inspector open when Escape belongs to an editable target", () => {
    expect(
      shouldCloseInspectorOnEscape({
        altKey: false,
        ctrlKey: false,
        defaultPrevented: false,
        key: "Escape",
        metaKey: false,
        target: { tagName: "INPUT" } as unknown as EventTarget,
      })
    ).toBe(false);

    expect(
      shouldCloseInspectorOnEscape({
        altKey: false,
        ctrlKey: false,
        defaultPrevented: true,
        key: "Escape",
        metaKey: false,
        target: null,
      })
    ).toBe(false);
  });
});
