import { describe, expect, test } from "vitest";

import "./test-host-api";
import {
  resizeStoryListWidth,
  RuntimeStoriesPage,
  resolveSelectedRuntimeStory,
  runtimeStoriesPath,
  shouldCloseInspectorOnEscape,
  storyConsoleModule,
} from ".";

describe("story console module", () => {
  test("exports the Stories route as a first-party console module", () => {
    expect(storyConsoleModule).toMatchObject({
      id: "lenso/platform-story",
      surfaces: [
        {
          area: "runtime",
          icon: "workflow",
          label: "Stories",
          path: "/stories",
        },
      ],
    });
    expect(storyConsoleModule.surfaces[0]?.component).toBeTypeOf("function");
    expect(storyConsoleModule.surfaces[0]?.component).toBe(RuntimeStoriesPage);
  });

  test("exports story model helpers from the module boundary", () => {
    expect(runtimeStoriesPath()).toBe("/stories");
    expect(resizeStoryListWidth(300, 20)).toBe(320);
    expect(resolveSelectedRuntimeStory([], null, true)).toBeNull();
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
});
