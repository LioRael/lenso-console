import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { AgentChanges } from "./agent-changes";
import { AgentIdentityProvider } from "./agent-identity-context";
import { AgentPage } from "./agent-page";
import { AgentProjectContext } from "./agent-project-context";
import type { AgentTurn } from "./agent-runtime";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let client: QueryClient | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  client?.clear();
  vi.unstubAllGlobals();
});

function render(content: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client = queryClient;
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <AgentIdentityProvider>
          <ThemeScope>
            <Outlet />
          </ThemeScope>
        </AgentIdentityProvider>
      </QueryClientProvider>
    ),
  });
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/agent/$agentId/$chatId",
    component: () => content,
  });
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ["/agent/support/new-task"],
    }),
    routeTree: rootRoute.addChildren([projectRoute]),
  });
  flushSync(() => root?.render(<RouterProvider router={router} />));
}

test("project entry keeps new and resumed tasks scoped to the owning Agent", async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return Response.json(
        url.endsWith("/agents")
          ? {
              agents: [
                {
                  id: "console",
                  label: "Console",
                  role: "console",
                  capabilities: [],
                },
                {
                  id: "support",
                  label: "Support",
                  role: "app",
                  capabilities: [],
                },
              ],
            }
          : { sessions: [] }
      );
    })
  );
  render(
    <AgentProjectContext agentId="support" path="/projects/customer support" />
  );
  await expect
    .element(page.getByText("/projects/customer support", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "New task" }))
    .toHaveAttribute("href", "/agent/support/new-task");
  await page.getByRole("button", { name: "Resume task" }).click();
  await expect
    .poll(() => urls.some((url) => url.endsWith("/agents/support/sessions")))
    .toBe(true);
  expect(urls.some((url) => url.endsWith("/agent/sessions"))).toBe(false);
});

test("review shows successful captured diffs as text and keeps a fresh review explicit", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ agents: [] }))
  );
  const requestReview = vi.fn();
  const turns: AgentTurn[] = [
    {
      id: "turn-1",
      user: "Fix the page",
      answer: "Done",
      thought: "",
      status: "completed",
      tools: [
        {
          callId: "read",
          name: "read",
          status: "completed",
          resultContent: "not a diff",
        },
        {
          callId: "diff",
          name: "git_diff",
          status: "completed",
          resultContent:
            "--- a/page.tsx\n+++ b/page.tsx\n@@ -1 +1 @@\n-old\n+<img src=x onerror=alert(1)>",
          resultTruncated: true,
        },
        {
          callId: "failed",
          name: "git_diff",
          status: "failed",
          resultContent: "untrusted failed output",
        },
      ],
    },
  ];
  render(<AgentChanges turns={turns} onRequestReview={requestReview} />);
  await expect
    .element(page.getByRole("region", { name: "Task changes" }))
    .toHaveTextContent("+<img src=x onerror=alert(1)>");
  expect(container?.querySelector("img")).toBeNull();
  await expect
    .element(page.getByText("This recorded diff was truncated."))
    .toBeVisible();
  expect(container?.textContent).not.toContain("untrusted failed output");
  await page.getByRole("button", { name: "Ask for a fresh diff" }).click();
  expect(requestReview).toHaveBeenCalledTimes(1);
});

test("a project task exposes its streamed diff in the existing conversation page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/agents")) {
        return Response.json({
          agents: [
            { id: "support", label: "Support", role: "app", capabilities: [] },
          ],
        });
      }
      if (url.endsWith("/bootstrap")) {
        return Response.json({
          workspace: { path: "/projects/customer-support" },
          mode: "console",
          profile: "code",
          trajectory: "lenso.agent.trajectory@1",
          capabilities: {
            cancel: true,
            edit: true,
            sessionList: true,
            sessionRead: true,
            userInteraction: false,
            profileSelection: true,
          },
          tools: {
            allowed: ["git_diff"],
            available: [{ name: "git_diff", description: "Review changes" }],
          },
        });
      }
      if (url.endsWith("/turns") && init?.method === "POST") {
        const frames = [
          {
            type: "turn_message",
            message: {
              kind: "tool_started",
              sequence: "1",
              session_id: "project-task",
              text: "",
              tool_call_id: "diff",
              tool_name: "git_diff",
              arguments_json: "{}",
            },
          },
          {
            type: "turn_message",
            message: {
              kind: "tool_completed",
              sequence: "2",
              session_id: "project-task",
              text: "",
              tool_call_id: "diff",
              tool_name: "git_diff",
              content:
                "diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-export const ready = false;\n+export const ready = true;",
            },
          },
          {
            type: "turn_message",
            message: {
              kind: "text_delta",
              sequence: "3",
              session_id: "project-task",
              text: "Reviewed the change.",
            },
          },
          { type: "turn_completed", session_id: "project-task" },
        ];
        return new Response(
          frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""),
          { headers: { "content-type": "text/event-stream" } }
        );
      }
      return Response.json(
        { detail: "Fixture endpoint unavailable" },
        { status: 503 }
      );
    })
  );
  render(
    <div style={{ height: "100vh" }}>
      <AgentPage agentId="support" />
    </div>
  );
  await expect
    .element(page.getByText("/projects/customer-support", { exact: true }))
    .toBeVisible();
  await page
    .getByRole("textbox", { name: "Send a message to Lenso Agent" })
    .fill("Review the change");
  await page.getByRole("button", { name: "Submit comment" }).click();
  await page.getByRole("tab", { name: "Changes", exact: true }).click();
  await expect
    .element(page.getByRole("region", { name: "Task changes" }))
    .toHaveTextContent("+export const ready = true;");
  const heading = page.getByRole("heading", { name: "Changes", exact: true });
  await page.viewport(390, 844);
  await expect.element(heading).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Agent view" }).element();
  await expect
    .poll(() => tabs.getBoundingClientRect().right)
    .toBeLessThanOrEqual(window.innerWidth);
  await expect
    .poll(
      () =>
        page
          .getByRole("tab", { name: "Trajectory", exact: true })
          .element()
          .getBoundingClientRect().right
    )
    .toBeLessThanOrEqual(window.innerWidth)
    .catch((error: unknown) => {
      const elements = [
        tabs,
        tabs.parentElement,
        ...tabs.querySelectorAll('[role="tab"]'),
      ];
      throw new Error(
        JSON.stringify(
          elements.map((element) => {
            if (!element) {
              return null;
            }
            const css = getComputedStyle(element);
            return {
              text: element.textContent,
              rect: element.getBoundingClientRect().toJSON(),
              font: css.font,
              width: css.width,
              minWidth: css.minWidth,
              flex: css.flex,
              padding: css.padding,
              boxSizing: css.boxSizing,
              className: element.className,
            };
          })
        ),
        { cause: error }
      );
    });
  await page.viewport(1280, 800);
});
