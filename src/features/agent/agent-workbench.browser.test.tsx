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
  useParams,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

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
    validateSearch: (search: Record<string, unknown>) => ({
      project: typeof search.project === "string" ? search.project : undefined,
    }),
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

function RoutedAgentPage() {
  const { agentId } = useParams({ strict: false });
  return agentId ? <AgentPage agentId={agentId} /> : null;
}

test("project entry keeps resumed tasks scoped without a redundant new-task action", async () => {
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
  expect(
    container?.querySelector('a[href="/agent/support/new-task"]')
  ).toBeNull();
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
  await page.getByRole("button", { name: "Review changes" }).click();
  expect(requestReview).toHaveBeenCalledTimes(1);
});

test("a project task exposes its streamed diff in the existing conversation page", async () => {
  const savedTitles: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/agents")) {
        return Response.json({
          agents: [
            { id: "support", label: "Support", role: "app", capabilities: [] },
            {
              id: "console",
              label: "Console Agent",
              role: "console",
              capabilities: [],
            },
          ],
        });
      }
      if (url.endsWith("/sessions")) {
        return Response.json({
          sessions: [
            {
              sessionId: "project-task",
              revision: "1",
              titleRevision: "1",
              title: "Review the change",
              updatedAt: "2026-09-08T00:00:00Z",
            },
          ],
        });
      }
      if (init?.method === "PATCH") {
        const { title: nextTitle } = JSON.parse(String(init.body));
        savedTitles.push(nextTitle);
        return Response.json({ title: nextTitle, titleRevision: "2" });
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
            sessionRename: true,
            sessionCompact: true,
            turnToolSelection: true,
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
      <RoutedAgentPage />
    </div>
  );
  await expect
    .element(page.getByText("/projects/customer-support", { exact: true }))
    .toBeVisible();
  await page
    .getByRole("textbox", { name: "Send a message to Lenso Agent" })
    .fill("Review the change");
  await page.getByRole("button", { name: "Submit comment" }).click();
  expect(
    container?.querySelector('[aria-label="Turn permissions"]')
  ).toBeNull();
  expect(
    container?.querySelector('[aria-label="Compact conversation context"]')
  ).toBeNull();
  expect(container?.querySelector('select[aria-label="Agent"]')).toBeNull();
  const title = page.getByRole("button", { name: /^Rename conversation:/ });
  const before = title.element().getBoundingClientRect();
  await title.dblClick();
  await expect
    .element(page.getByRole("textbox", { name: "Conversation title" }))
    .toBeVisible();
  const input = page
    .getByRole("textbox", { name: "Conversation title" })
    .element() as HTMLInputElement;
  expect(input.getBoundingClientRect().width).toBeCloseTo(before.width, 0);
  expect(input.getBoundingClientRect().x).toBeCloseTo(before.x, 0);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  expect(
    page.getByRole("button", { name: "Save", exact: true }).elements()
  ).toHaveLength(0);
  await page
    .getByRole("textbox", { name: "Conversation title" })
    .fill("Renamed task");
  await userEvent.keyboard("{Escape}");
  await expect.element(title).toBeVisible();
  expect(savedTitles).toEqual([]);
  await title.dblClick();
  await page
    .getByRole("textbox", { name: "Conversation title" })
    .fill("Saved with Enter");
  await userEvent.keyboard("{Enter}");
  await expect.element(title).toHaveTextContent("Saved with Enter");
  await title.dblClick();
  await page
    .getByRole("textbox", { name: "Conversation title" })
    .fill("Saved on blur");
  await page.getByRole("tab", { name: "Changes", exact: true }).click();
  await expect.element(title).toHaveTextContent("Saved on blur");
  expect(savedTitles).toEqual(["Saved with Enter", "Saved on blur"]);

  await page.getByRole("tab", { name: "Changes", exact: true }).click();
  expect(
    getComputedStyle(
      page.getByRole("tab", { name: "Conversation", exact: true }).element()
    ).fontSize
  ).toBe("12px");
  expect(
    getComputedStyle(
      page.getByRole("tab", { name: "Conversation", exact: true }).element()
    ).paddingLeft
  ).toBe("10px");
  await expect
    .element(page.getByRole("region", { name: "Task changes" }))
    .toHaveTextContent("+export const ready = true;");
  const fileSummary = page.getByText("app.ts", { exact: true });
  await expect.element(page.getByLabelText("1 added, 1 removed")).toBeVisible();
  await fileSummary.click();
  await expect
    .element(page.getByLabelText("Recorded diff: app.ts"))
    .not.toBeVisible();
  await fileSummary.click();
  await expect
    .element(page.getByLabelText("Recorded diff: app.ts"))
    .toBeVisible();
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
    .toBeLessThanOrEqual(window.innerWidth);
  await page.viewport(1280, 800);
  await page.getByRole("combobox", { name: "Agent", exact: true }).click();
  await page
    .getByRole("option", { name: "Console Agent", exact: true })
    .click();
  await expect
    .poll(() =>
      container?.querySelector('[aria-label="Agent working directory"]')
    )
    .toBeNull();
});

test("project picker preserves project identity in navigation and resumed history", async () => {
  const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/agents")) {
        return Response.json({
          agents: [
            { id: "app", label: "Lenso Agent", role: "app", capabilities: [] },
          ],
        });
      }
      if (url.endsWith("/projects")) {
        return Response.json({
          defaultPath: "/work/default",
          projects: [{ id: projectId, path: "/work/second" }],
        });
      }
      if (url.includes("/directories?")) {
        return Response.json({
          path: "/work/default",
          parent: "/work",
          directories: ["/work/default/child"],
          truncated: false,
        });
      }
      if (url.endsWith(`/projects/${projectId}/sessions`)) {
        return Response.json({
          sessions: [
            {
              sessionId: "project-task",
              revision: "1",
              titleRevision: "1",
              title: "Second project task",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        });
      }
      return new Response("Not found", { status: 404 });
    })
  );
  render(<AgentProjectContext agentId="app" path="/work/default" />);
  await page
    .getByRole("button", { name: "Change project: /work/default" })
    .click();
  await expect
    .element(page.getByRole("dialog"))
    .toHaveTextContent("Tasks in other projects continue running.");
  await page.getByRole("button", { name: "/work/second", exact: true }).click();
  await page.getByRole("button", { name: "Resume task" }).click();
  await expect
    .element(page.getByRole("menuitem", { name: /Second project task/u }))
    .toBeVisible();
  expect(
    urls.some((url) => url.endsWith(`/projects/${projectId}/sessions`))
  ).toBe(true);
  expect(urls.some((url) => url.endsWith("/agents/app/sessions"))).toBe(false);
});
