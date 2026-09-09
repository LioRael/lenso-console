import { createElement } from "react";
import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import * as observeModule from "../../../service/crates/lenso-console-observe-workspace-plugin/workspace.mjs";
import type { PageMount } from "./page-contribution-catalog";
import type { WorkspaceServices } from "./workspace-service-client";

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
      descriptor_version: "1.0.0",
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
              attributes: [],
              ended_at_unix_nano: "1025000000",
              kind: "server",
              name: "GET /orders/:id",
              parent_span_id: null,
              span_id: "0202020202020202",
              started_at_unix_nano: "1000000000",
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
  const navigation = { go: vi.fn(), href: vi.fn(() => "#") };
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
  flushSync(() =>
    root.render(
      <Workspace
        location={{
          hash: "",
          search: "",
          segments: ["traces", "01010101010101010101010101010101"],
        }}
        mount={mount}
        navigation={{ go: vi.fn(), href: vi.fn(() => "#") }}
        signal={signal.signal}
      />
    )
  );
  await expect
    .element(page.getByRole("heading", { name: "Waterfall" }))
    .toBeVisible();
  await expect.element(page.getByText("order loaded")).toBeVisible();
  await expect
    .element(page.getByText("Runtime state unavailable").first())
    .toBeVisible();
  signal.abort();
  root.unmount();
  container.remove();
});
