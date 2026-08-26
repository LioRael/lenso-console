import { afterEach, describe, expect, test, vi } from "vitest";

import {
  demoPluginWorkbenchProjection,
  pluginWorkbenchProjectionFromEvent,
  shortPluginDigest,
} from "./plugin-workbench-model";
import {
  decodeSseFrames,
  observePluginWorkbench,
} from "./plugin-workbench-stream";

afterEach(() => vi.unstubAllGlobals());

describe("Plugin Workbench stream", () => {
  test("decodes complete SSE frames and retains an incomplete tail", () => {
    const decoded = decodeSseFrames(
      'id: 18\r\nevent: workbench.snapshot\r\ndata: {"projection":{}}\r\n\r\nid: 19\ndata:'
    );

    expect(decoded.frames).toEqual([{ data: '{"projection":{}}', id: "18" }]);
    expect(decoded.pending).toBe("id: 19\ndata:");
  });

  test("accepts only the versioned workbench projection envelope", () => {
    expect(
      pluginWorkbenchProjectionFromEvent({
        projection: demoPluginWorkbenchProjection,
        type: "workbench.snapshot",
      })
    ).toEqual(demoPluginWorkbenchProjection);
    expect(
      pluginWorkbenchProjectionFromEvent({ projection: { schema: "future" } })
    ).toBeUndefined();
  });

  test("keeps receipt evidence compact without losing its digest prefix", () => {
    expect(shortPluginDigest("sha256:76b5dbe181ac0042")).toBe("76b5dbe181ac…");
  });

  test("streams an authorized projection incrementally and resumes from its cursor", async () => {
    const controller = new AbortController();
    const event = JSON.stringify({
      projection: demoPluginWorkbenchProjection,
      type: "workbench.snapshot",
    });
    const wire = `id: 18\nevent: workbench.snapshot\ndata: ${event}\n\n`;
    const midpoint = Math.floor(wire.length / 2);
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        const encoder = new TextEncoder();
        stream.enqueue(encoder.encode(wire.slice(0, midpoint)));
        stream.enqueue(encoder.encode(wire.slice(midpoint)));
        stream.close();
      },
    });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(body, { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const projections: unknown[] = [];
    const states: string[] = [];

    await observePluginWorkbench({
      cursor: "17",
      onProjection(projection) {
        projections.push(projection);
        controller.abort();
      },
      onState: (state) => states.push(state),
      path: "/api/console/v1/plugin-workbench/events",
      signal: controller.signal,
    });

    expect(projections).toEqual([demoPluginWorkbenchProjection]);
    expect(states).toEqual(["connecting", "live", "stopped"]);
    const [request] = fetchMock.mock.calls;
    const headers = new Headers(request?.[1]?.headers);
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("last-event-id")).toBe("17");
    expect(headers.get("authorization")).toMatch(/^Bearer /u);
  });
});
