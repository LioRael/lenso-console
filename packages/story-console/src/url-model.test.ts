import { describe, expect, test } from "vitest";

import {
  readExecutionInspectorTab,
  readStoryViewMode,
  runtimeStoriesPath,
  storyUrlId,
} from "./url-model";
import "./test-host-api";

describe("runtime stories url model", () => {
  test("builds compact story deep links", () => {
    expect(runtimeStoriesPath()).toBe("/stories");
    expect(
      runtimeStoriesPath({
        inspectorTab: "operations",
        nodeId: "remoteproxy_rproxy_1",
        query: "crm",
        storyId: "corr_1",
        viewMode: "timeline",
      })
    ).toBe(
      "/stories?node=remoteproxy_rproxy_1&q=crm&story=corr_1&tab=operations&view=timeline"
    );
  });

  test("omits default view and overview inspector tab", () => {
    expect(
      runtimeStoriesPath({
        inspectorTab: "overview",
        storyId: "corr_1",
        viewMode: "waterfall",
      })
    ).toBe("/stories?story=corr_1");
  });

  test("falls back when url enum values are invalid", () => {
    expect(readStoryViewMode("unknown")).toBe("waterfall");
    expect(readStoryViewMode("waterfall")).toBe("waterfall");
    expect(readExecutionInspectorTab("unknown")).toBe("overview");
    expect(readExecutionInspectorTab("related")).toBe("operations");
    expect(readExecutionInspectorTab("technical")).toBe("operations");
  });

  test("maps legacy inspector urls into the final information architecture", () => {
    expect(readExecutionInspectorTab("input")).toBe("payload");
    expect(readExecutionInspectorTab("output")).toBe("payload");
    expect(readExecutionInspectorTab("payload")).toBe("payload");
    expect(readExecutionInspectorTab("activity")).toBe("events");
    expect(readExecutionInspectorTab("errors")).toBe("events");
    expect(readExecutionInspectorTab("failures")).toBe("events");
    expect(readExecutionInspectorTab("context")).toBe("operations");
  });

  test("prefers correlation ids for story urls", () => {
    expect(
      storyUrlId({
        correlationId: "corr_story",
        id: "story_id",
      } as Parameters<typeof storyUrlId>[0])
    ).toBe("corr_story");
  });
});
