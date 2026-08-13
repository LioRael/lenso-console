import { describe, expect, test } from "vitest";

import type { RuntimeStory } from "../../data/mock-runtime";
import { buildRuntimeSearchResults } from "./runtime-search-model";

const stories = [
  {
    correlationId: "corr_backend",
    durationMs: 10,
    id: "corr_backend",
    name: "Backend Story",
    nodes: [
      {
        attributes: {},
        context: {},
        durationMs: 10,
        events: [],
        id: "fn_backend",
        kind: "function",
        logs: [],
        name: "SendBackendEmail",
        service: "notifications",
        startMs: 0,
        status: "completed",
      },
      {
        attributes: {},
        context: {},
        durationMs: 0,
        events: [],
        id: "evt_backend",
        kind: "event",
        logs: [],
        name: "identity.user_registered",
        service: "identity",
        startMs: 10,
        status: "completed",
      },
    ],
    service: "notifications",
    source: "runtime-story",
    status: "completed",
    timestamp: "2026-06-01T00:00:00.000Z",
  },
] satisfies RuntimeStory[];

describe("runtime search model", () => {
  test("searches query-backed stories by summary fields", () => {
    const results = buildRuntimeSearchResults({
      query: "corr_backend",
      stories,
    });

    expect(results[0]).toMatchObject({
      kind: "story",
      correlationId: "corr_backend",
      storyId: "corr_backend",
      title: "Backend Story",
    });
  });

  test("searches query-backed stories by execution node names", () => {
    const results = buildRuntimeSearchResults({
      query: "SendBackendEmail",
      stories,
    });

    expect(results[0]).toMatchObject({
      kind: "story",
      id: "fn_backend",
      nodeId: "fn_backend",
      title: "SendBackendEmail",
    });
  });

  test.each([
    ["SendBackendEmail", "fn_backend"],
    ["identity.user_registered", "evt_backend"],
  ])("discovers %s through its story execution", (query, nodeId) => {
    const results = buildRuntimeSearchResults({ query, stories });

    expect(results.map((result) => result.kind)).toEqual(["story"]);
    expect(results[0]).toMatchObject({
      correlationId: "corr_backend",
      id: nodeId,
      nodeId,
      storyId: "corr_backend",
    });
  });

  test("includes correlations observed through Runtime Stories", () => {
    const results = buildRuntimeSearchResults({
      query: "corr_",
      stories,
    });

    expect(results.filter((result) => result.kind === "correlation")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ correlationId: "corr_backend" }),
      ])
    );
  });
});
