import { describe, expect, test } from "vitest";

import { consoleHostApi } from "./console-host-api";

describe("console host api", () => {
  test("exposes stable host capabilities consumed by console modules", () => {
    expect(consoleHostApi.version).toBe("1");
    expect(consoleHostApi.queries.useRuntimeStories).toBeTypeOf("function");
    expect(consoleHostApi.queries.useRuntimeStoryDetail).toBeTypeOf("function");
    expect(consoleHostApi.adminData.useRecords).toBeTypeOf("function");
    expect(consoleHostApi.adminData.useInvokeAction).toBeTypeOf("function");
    expect(consoleHostApi.config.useValues).toBeTypeOf("function");
    expect(consoleHostApi.config.useWriteValue).toBeTypeOf("function");
    expect(consoleHostApi.contributions.useSlot).toBeTypeOf("function");
    expect(consoleHostApi.modules.useMetadata).toBeTypeOf("function");
    expect(consoleHostApi.context.useConsole).toBeTypeOf("function");
    expect(consoleHostApi.context.useRuntimeConsole).toBeTypeOf("function");
    expect(consoleHostApi.hooks.useBrowserUrlPopState).toBeTypeOf("function");
    expect(consoleHostApi.hooks.useListKeyboard).toBeTypeOf("function");
    expect(consoleHostApi.hooks.usePersistedLayout).toBeTypeOf("function");
    expect(consoleHostApi.hooks.writeBrowserUrl).toBeTypeOf("function");
    expect(consoleHostApi.data.retryTargetForNode).toBeTypeOf("function");
    expect(consoleHostApi.story.findStoryByCorrelation).toBeTypeOf("function");
    expect(
      consoleHostApi.story.executionInspectorTabs.map((tab) => tab.id)
    ).toEqual(["overview", "payload", "logs", "events", "operations"]);
    expect(consoleHostApi.ui.runtime.ExecutionInspector).toBeTypeOf("function");
    expect(consoleHostApi.ui.runtime.ResizeHandle).toBeTypeOf("function");
    expect(consoleHostApi.ui.runtime.StoryList).toBeTypeOf("function");
    expect(consoleHostApi.ui.common.EmptyState).toBeTypeOf("function");
    expect(consoleHostApi.ui.Button).toBeTypeOf("function");
    expect(consoleHostApi.ui.KeyValueList.Row).toBeTypeOf("function");
    expect(consoleHostApi.ui.Section.Header).toBeTypeOf("function");
    expect(consoleHostApi.ui.SplitView.Inspector).toBeTypeOf("function");
    expect(consoleHostApi.ui.StateView).toBeTypeOf("function");
    expect(consoleHostApi.ui.SummaryStrip.Item).toBeTypeOf("function");
    expect(consoleHostApi.ui.Tabs.Tab).toBeTypeOf("function");
    expect(consoleHostApi.systemRegistry.useServices).toBeTypeOf("function");
    expect(
      consoleHostApi.routing.buildPath("/runtime/stories", {
        story: "corr_1",
      })
    ).toBe("/runtime/stories?story=corr_1");
  });
});
