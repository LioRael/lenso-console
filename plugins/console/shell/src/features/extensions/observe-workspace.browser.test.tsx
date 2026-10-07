import "@lenso/tokens/styles.css";
import { ThemeScope } from "@lenso/ui";

import "../../../../../../plugins/observe/console/workspace.css";
import { createElement } from "react";
import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import * as observeModule from "../../../../../../plugins/observe/console/workspace.mjs";
import type {
  ListRequestsRequest,
  ListRequestsResponse,
} from "../../../../../../plugins/observe/crates/lenso-capability-observability-query/generated/bindings";
import type { PageMount } from "./page-contribution-catalog";
import {
  createWorkspaceServices,
  type WorkspaceServices,
} from "./workspace-service-client";

const mount: PageMount = {
  apiMajor: 1,
  id: "observe-sample-app",
  module: "/workspace.mjs",
  navigation: { items: [{ label: "Requests", path: [] }], label: "Observe" },
  owner: {
    instance: "lenso.console.workspace.observe/sample-app",
    source: "resolved-plan",
    trusted: true,
  },
  requirements: [
    {
      available: true,
      capability_id: "lenso.observability.query@1",
      descriptor_version: "1.1.0",
      operations: [
        "list_requests",
        "read_trace",
        "list_trace_logs",
        "watch_requests",
        "read_ingestion_health",
      ],
      required: true,
      service_id: "observe",
      source: "owner",
    },
  ],
  revision: "0.1.0",
  styles: [],
  subject: { appId: "sample-app", kind: "app" },
  title: "Observe · Sample App",
};

function services(onStreamAbort: () => void): WorkspaceServices {
  return {
    invoke: vi.fn(async (_service: string, operation: string) => {
      if (operation === "list_requests") {
        return {
          receiver_epoch: "00000000-0000-4000-8000-000000000001",
          next_cursor: null,
          requests: [
            {
              completeness: "complete",
              duration_nano: "25000000",
              has_error: false,
              method: "GET",
              route: "/orders/:id",
              service_name: "sample-web",
              started_at_unix_nano: "1000000000",
              status_code: 200,
              trace_id: "01010101010101010101010101010101",
            },
          ],
        };
      }
      if (operation === "read_ingestion_health") {
        return {
          accepted_spans: "2",
          accepted_logs: "1",
          rejected_records: "0",
        };
      }
      if (operation === "read_trace") {
        return {
          completeness: "complete",
          trace_id: "01010101010101010101010101010101",
          spans: [
            {
              attributes: [{ key: "http.route", value: "/orders/:id" }],
              ended_at_unix_nano: "1025000000",
              events: [
                {
                  attributes: [
                    { key: "exception.type", value: "ExampleError" },
                  ],
                  name: "exception",
                  timestamp_unix_nano: "1010000000",
                },
              ],
              kind: "server",
              links: [
                {
                  attributes: [],
                  span_id: "0505050505050505",
                  trace_id: "04040404040404040404040404040404",
                },
              ],
              name: "GET /orders/:id",
              parent_span_id: null,
              span_id: "0202020202020202",
              started_at_unix_nano: "1000000000",
              status: "ok",
            },
            {
              attributes: [{ key: "code.function.name", value: "load_order" }],
              ended_at_unix_nano: "1020000000",
              events: [],
              kind: "client",
              links: [],
              name: "SELECT order",
              parent_span_id: "0202020202020202",
              span_id: "0303030303030303",
              started_at_unix_nano: "1002000000",
              status: "ok",
            },
          ],
        };
      }
      if (operation === "list_trace_logs") {
        return {
          logs: [
            {
              attributes: [],
              body: "order loaded",
              severity: "INFO",
              span_id: "0202020202020202",
              timestamp_unix_nano: "1010000000",
            },
          ],
          next_cursor: null,
        };
      }
      throw new Error(`unexpected operation ${operation}`);
    }) as WorkspaceServices["invoke"],
    subscribe: ((_service, _operation, _request, options) => ({
      async *[Symbol.asyncIterator]() {
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener(
            "abort",
            () => {
              onStreamAbort();
              resolve();
            },
            { once: true }
          );
        });
        yield* [];
      },
    })) as WorkspaceServices["subscribe"],
  };
}

test("renders the Observe request journey and cancels its live feed", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const navigation = {
    go: vi.fn(),
    href: vi.fn(() => "#"),
    openWorkspace: vi.fn(),
  };
  const streamAborted = vi.fn();
  const Workspace = observeModule.createWorkspace({
    createElement,
    react: React,
    services: services(streamAborted),
  }).Page;
  const mountSignal = new AbortController();
  flushSync(() =>
    root.render(
      <Workspace
        location={{ hash: "", search: "", segments: [] }}
        mount={mount}
        navigation={navigation}
        signal={mountSignal.signal}
      />
    )
  );
  await expect
    .element(page.getByRole("heading", { name: "Recent requests" }))
    .toBeVisible();
  await expect.element(page.getByText("/orders/:id")).toBeVisible();
  await page.getByRole("button", { name: /GET.*orders/u }).click();
  expect(navigation.go).toHaveBeenCalledWith([
    "traces",
    "01010101010101010101010101010101",
  ]);
  root.unmount();
  await vi.waitFor(() => expect(streamAborted).toHaveBeenCalledOnce());
  container.remove();
});

test("deep links to a trace waterfall and correlated logs", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const Workspace = observeModule.createWorkspace({
    createElement,
    react: React,
    services: services(() => {}),
  }).Page;
  const signal = new AbortController();
  const openWorkspace = vi.fn();
  flushSync(() =>
    root.render(
      <Workspace
        location={{
          hash: "",
          search: "",
          segments: ["traces", "01010101010101010101010101010101"],
        }}
        mount={mount}
        navigation={{
          go: vi.fn(),
          href: vi.fn(() => "#"),
          openWorkspace,
        }}
        signal={signal.signal}
      />
    )
  );
  await expect
    .element(page.getByRole("heading", { name: "Waterfall" }))
    .toBeVisible();
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  expect(openWorkspace).toHaveBeenCalledWith({
    handoff: {
      kind: "lenso.observe.trace@1",
      payload: expect.objectContaining({
        kind: "lenso.observe.trace@1",
        source_id: "sample-app",
        trace_id: "01010101010101010101010101010101",
      }),
    },
    subject: { kind: "console" },
    workspaceId: "projects",
  });
  await expect.element(page.getByText("order loaded")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Selected span" }))
    .toBeVisible();
  await expect
    .element(page.getByText("exception", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("ExampleError")).toBeVisible();
  await expect
    .element(page.getByText("04040404 · 0505050505050505"))
    .toBeVisible();
  const childSpan = page.getByRole("button", { name: /SELECT order/u });
  await childSpan.click();
  await expect.element(childSpan).toHaveAttribute("aria-pressed", "true");
  await expect.element(page.getByText("0303030303030303")).toBeVisible();
  await expect.element(page.getByText("load_order")).toBeVisible();
  await expect
    .element(page.getByText("Runtime state unavailable").first())
    .toBeVisible();
  signal.abort();
  root.unmount();
  container.remove();
});

// Existing journey tests never cross the same-origin client or change list
// position. These cases prevent opaque-cursor loss, stale-source disclosure,
// false empty/loading states and a live feed skipping a page boundary.
afterEach(() => vi.unstubAllGlobals());

type ReadCall = { operation: string; input: Record<string, unknown> };
const nextCursor = "opaque-server-position:older";
const olderTrace = "11111111111111111111111111111111";

function requestPage(
  route: string,
  traceId: string,
  cursor: string | null
): ListRequestsResponse {
  return {
    next_cursor: cursor,
    receiver_epoch: "00000000-0000-4000-8000-000000000001",
    requests: [
      {
        completeness: "complete",
        duration_nano: "25000000",
        has_error: false,
        method: "GET",
        route,
        service_name: "sample-web",
        started_at_unix_nano: "1000000000",
        status_code: 200,
        trace_id: traceId,
      },
    ],
  };
}

function domainError(payload: string) {
  return Response.json(payload, {
    status: 422,
    headers: {
      "content-type": "application/json",
      "x-lenso-workspace-outcome": "domain_error",
    },
  });
}

async function httpFixture(
  handler: (call: ReadCall) => Promise<Response> | Response,
  initialSegments: string[] = []
) {
  const originalFetch = globalThis.fetch;
  const calls: ReadCall[] = [];
  const streams: {
    controller: ReadableStreamDefaultController<Uint8Array>;
    signal: AbortSignal;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (
        !path.startsWith(
          "/api/console/v1/pages/observe-sample-app/services/observe/"
        )
      ) {
        return originalFetch(input, init);
      }
      expect(init?.method).toBe("POST");
      const call = {
        input: JSON.parse(
          new TextDecoder().decode(init?.body as Uint8Array)
        ) as Record<string, unknown>,
        operation: path.split("/").at(-1) ?? "",
      };
      calls.push(call);
      if (call.operation === "watch_requests") {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const signal = init?.signal as AbortSignal;
            streams.push({ controller, signal });
            signal.addEventListener("abort", () => controller.close(), {
              once: true,
            });
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        });
      }
      if (call.operation === "read_ingestion_health") {
        return Response.json({
          accepted_logs: "1",
          accepted_spans: "2",
          decode_failures: "0",
          feed_lag: "0",
          queue_depth: 0,
          queue_saturation: "0",
          receiver_epoch: "00000000-0000-4000-8000-000000000001",
          redacted_attributes: "0",
          rejected_records: "0",
          retention_bytes: "536870912",
          retention_days: 7,
          retention_deletions: "0",
        });
      }
      if (
        call.operation === "read_trace" ||
        call.operation === "list_trace_logs"
      ) {
        const response = await handler(call);
        return response;
      }
      return handler(call);
    })
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const signal = new AbortController();
  const Widget = observeModule.createWorkspace({
    createElement,
    react: React,
    services: createWorkspaceServices(mount),
  }).Page;
  let segments = initialSegments;
  let currentMount = mount;
  const navigation = {
    go: vi.fn((next: readonly string[]) => {
      segments = [...next];
      render();
    }),
    href: vi.fn(() => "#"),
  };
  function render() {
    flushSync(() =>
      root.render(
        <ThemeScope>
          <Widget
            location={{ hash: "", search: "", segments }}
            mount={currentMount}
            navigation={navigation}
            signal={signal.signal}
          />
        </ThemeScope>
      )
    );
  }
  render();
  await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
  return {
    calls,
    container,
    navigation,
    streams,
    dispose() {
      signal.abort();
      flushSync(() => root.unmount());
      container.remove();
    },
    go(next: string[]) {
      segments = next;
      render();
    },
    source(appId: string) {
      currentMount = { ...mount, subject: { appId, kind: "app" } };
      render();
    },
  };
}

test("keeps server page boundaries, retries the current cursor and returns from a trace to its focused request", async () => {
  let failRefresh = false;
  const fallback = services(() => {});
  const fixture = await httpFixture(async ({ input, operation }) => {
    if (operation !== "list_requests") {
      return Response.json(await fallback.invoke("observe", operation, input));
    }
    const request = input as unknown as ListRequestsRequest;
    expect(request.limit).toBe(50);
    expect(request.source_id).toBe("sample-app");
    if (failRefresh && request.cursor === nextCursor) {
      return new Response("private diagnostic must not reach the UI", {
        status: 503,
      });
    }
    return Response.json(
      request.cursor === nextCursor
        ? requestPage("/older", olderTrace, null)
        : requestPage(
            "/orders/:id",
            "01010101010101010101010101010101",
            nextCursor
          )
    );
  });
  try {
    await expect.element(page.getByText("/orders/:id")).toBeVisible();
    await vi.waitFor(() => expect(fixture.streams).toHaveLength(1));
    const item = {
      kind: "lag",
      trace_id: null,
      method: null,
      route: null,
      status_code: null,
      started_at_unix_nano: null,
      duration_nano: null,
      service_name: null,
      completeness: null,
      has_error: null,
      dropped_count: "2",
    };
    const bodyBase64Url = btoa(JSON.stringify(item))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    fixture.streams[0]?.controller.enqueue(
      new TextEncoder().encode(
        `event: item\ndata: ${JSON.stringify({ bodyBase64Url, outcome: "item" })}\n\n`
      )
    );
    await expect
      .element(page.getByText(/Telemetry may be incomplete/u))
      .toBeVisible();
    await page
      .getByRole("button", { name: "Older requests", exact: true })
      .click();
    await expect.element(page.getByText("/older")).toBeVisible();
    expect(
      fixture.calls.findLast((call) => call.operation === "list_requests")
        ?.input.cursor
    ).toBe(nextCursor);
    failRefresh = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Observe could not load this data");
    await expect.element(page.getByText("/older")).toBeVisible();
    expect(fixture.container.textContent).not.toContain("private diagnostic");
    failRefresh = false;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    await page.getByRole("button", { name: /GET.*older/u }).click();
    expect(fixture.navigation.go).toHaveBeenLastCalledWith([
      "traces",
      olderTrace,
      "requests",
      nextCursor,
    ]);
    await expect
      .element(page.getByRole("heading", { name: "Waterfall" }))
      .toBeVisible();
    await page
      .getByRole("button", { name: "All requests", exact: true })
      .click();
    await expect.element(page.getByText("/older")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: /GET.*older/u }))
      .toHaveFocus();
    expect(fixture.navigation.go).toHaveBeenLastCalledWith([
      "requests",
      nextCursor,
    ]);
    fixture.go([]);
    await expect.element(page.getByText("/orders/:id")).toBeVisible();
    await expect
      .element(
        page.getByRole("button", { name: "Latest requests", exact: true })
      )
      .toBeDisabled();
  } finally {
    fixture.dispose();
  }
});

test("recovers an expired cursor once through the latest page instead of retrying it in a loop", async () => {
  const fixture = await httpFixture(
    ({ input }) =>
      input.cursor
        ? domainError("expired_cursor")
        : Response.json(requestPage("/latest", olderTrace, null)),
    ["requests", "expired-position"]
  );
  try {
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("position has expired");
    await expect
      .element(page.getByText("Loading requests…"))
      .not.toBeInTheDocument();
    await page.getByRole("button", { name: "Show latest requests" }).click();
    await expect.element(page.getByText("/latest")).toBeVisible();
    expect(
      fixture.calls.filter(
        (call) =>
          call.operation === "list_requests" &&
          call.input.cursor === "expired-position"
      )
    ).toHaveLength(1);
    expect(
      fixture.calls.findLast((call) => call.operation === "list_requests")
        ?.input
    ).not.toHaveProperty("cursor");
  } finally {
    fixture.dispose();
  }
});

test("hides old source data and stops the feed on denial, including late reads and access retry", async () => {
  let blocked = false;
  let delayOld = false;
  let releaseOld: ((value: Response) => void) | undefined;
  let releaseNew: ((value: Response) => void) | undefined;
  const fixture = await httpFixture(({ input }) => {
    if (input.source_id === "other-app") {
      if (!blocked) {
        return Response.json(
          { code: "workspace_service_denied" },
          { status: 403, headers: { "content-type": "application/json" } }
        );
      }
      return new Promise<Response>((resolve) => {
        releaseNew = resolve;
      });
    }
    if (delayOld) {
      return new Promise<Response>((resolve) => {
        releaseOld = resolve;
      });
    }
    return Response.json(requestPage("/private-source-a", olderTrace, null));
  });
  try {
    await expect.element(page.getByText("/private-source-a")).toBeVisible();
    await vi.waitFor(() => expect(fixture.streams).toHaveLength(1));
    delayOld = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await vi.waitFor(() =>
      expect(
        fixture.calls.filter((call) => call.operation === "list_requests")
      ).toHaveLength(2)
    );
    fixture.source("other-app");
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Access to this Observe source is unavailable");
    expect(fixture.container.textContent).not.toContain("/private-source-a");
    releaseOld?.(
      Response.json(requestPage("/late-source-a", olderTrace, null))
    );
    await vi.waitFor(() =>
      expect(fixture.streams.every((stream) => stream.signal.aborted)).toBe(
        true
      )
    );
    expect(fixture.container.textContent).not.toContain("/late-source-a");
    blocked = true;
    await page.getByRole("button", { name: "Retry access" }).click();
    await expect.element(page.getByText("Loading requests…")).toBeVisible();
    expect(fixture.container.textContent).not.toContain("/private-source-a");
    releaseNew?.(
      Response.json(requestPage("/authorized-source-b", olderTrace, null))
    );
    await expect.element(page.getByText("/authorized-source-b")).toBeVisible();
    expect(
      fixture.calls.findLast((call) => call.operation === "list_requests")
        ?.input.source_id
    ).toBe("other-app");
    blocked = false;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Access to this Observe source is unavailable");
    expect(fixture.container.textContent).not.toContain("/authorized-source-b");
    blocked = true;
    await page.getByRole("button", { name: "Retry access" }).click();
    await expect.element(page.getByText("Loading requests…")).toBeVisible();
    expect(fixture.container.textContent).not.toContain("/authorized-source-b");
    releaseNew?.(
      Response.json(requestPage("/reauthorized-source-b", olderTrace, null))
    );
    await expect
      .element(page.getByText("/reauthorized-source-b"))
      .toBeVisible();
  } finally {
    fixture.dispose();
  }
});

test("separates retained-trace absence and log failure from a successful trace read", async () => {
  let missing = true;
  let logFailure = true;
  const fallback = services(() => {});
  const fixture = await httpFixture(
    async ({ input, operation }) => {
      if (operation === "read_trace" && missing) {
        return domainError("not_found");
      }
      if (operation === "list_trace_logs" && logFailure) {
        return domainError("unavailable");
      }
      return Response.json(await fallback.invoke("observe", operation, input));
    },
    ["traces", olderTrace]
  );
  try {
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("trace is no longer available");
    await expect
      .element(page.getByText("Loading trace…"))
      .not.toBeInTheDocument();
    missing = false;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect
      .element(page.getByRole("heading", { name: "Waterfall" }))
      .toBeVisible();
    await expect
      .element(page.getByText("Log completeness is unknown."))
      .toBeVisible();
    logFailure = false;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect.element(page.getByText("order loaded")).toBeVisible();
    await expect
      .element(
        page.getByText("Correlated logs are unavailable. Refresh to retry.")
      )
      .not.toBeInTheDocument();
  } finally {
    fixture.dispose();
  }
});

test("keeps pagination and refresh reachable at desktop and narrow sizes in both themes", async () => {
  const fixture = await httpFixture(() =>
    Response.json(
      requestPage(
        "/orders/a-long-but-real-route-segment",
        olderTrace,
        nextCursor
      )
    )
  );
  const previousTheme = document.documentElement.dataset.theme;
  try {
    await expect
      .element(page.getByText("/orders/a-long-but-real-route-segment"))
      .toBeVisible();
    for (const theme of ["light", "dark"]) {
      document.documentElement.dataset.theme = theme;
      for (const width of [1440, 390]) {
        await page.viewport(width, width === 390 ? 844 : 900);
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          window.innerWidth
        );
        const refresh = page.getByRole("button", {
          name: "Refresh",
          exact: true,
        });
        await userEvent.tab();
        refresh.element().focus();
        await expect.element(refresh).toHaveFocus();
        expect(getComputedStyle(refresh.element()).outlineStyle).not.toBe(
          "none"
        );
        await page
          .getByRole("button", { name: "Older requests", exact: true })
          .hover();
        if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
          await page.screenshot({
            path: `__screenshots__/observe-requests-${theme}-${width}.png`,
          });
        }
      }
    }
  } finally {
    if (previousTheme === undefined) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = previousTheme;
    }
    await page.viewport(1280, 800);
    fixture.dispose();
  }
});
