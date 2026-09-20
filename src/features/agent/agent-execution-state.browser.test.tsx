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
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { AgentIdentityProvider } from "./agent-identity-context";
import { AgentPage } from "./agent-page";

let client: QueryClient | undefined;
let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  client?.clear();
  vi.unstubAllGlobals();
});

function renderAgentPage() {
  container = document.createElement("div");
  container.style.height = "800px";
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={client!}>
        <AgentIdentityProvider>
          <ThemeScope>
            <Outlet />
          </ThemeScope>
        </AgentIdentityProvider>
      </QueryClientProvider>
    ),
  });
  const pageRoute = createRoute({
    component: () => <AgentPage agentId="support" />,
    getParentRoute: () => rootRoute,
    path: "/agent/support/new-task",
  });
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ["/agent/support/new-task"],
    }),
    routeTree: rootRoute.addChildren([pageRoute]),
  });
  flushSync(() => root?.render(<RouterProvider router={router} />));
}

test("a dropped Agent stream is presented as an uncertain UI disconnect, not an Agent failure", async () => {
  let turnRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/agents")) {
        return Response.json({
          agents: [
            {
              capabilities: [],
              id: "support",
              label: "Support Agent",
              role: "app",
            },
          ],
        });
      }
      if (url.endsWith("/bootstrap")) {
        return Response.json({
          capabilities: {
            cancel: true,
            contextSources: false,
            edit: true,
            profileSelection: false,
            sessionCompact: false,
            sessionList: false,
            sessionRead: false,
            sessionRename: false,
            taskSnapshot: false,
            terminalCommands: false,
            turnModelSelection: false,
            turnToolSelection: false,
            userInteraction: false,
          },
          mode: "console",
          profile: "default",
          tools: { allowed: [], available: [] },
          trajectory: "lenso.agent.trajectory@1",
        });
      }
      if (url.endsWith("/activity")) {
        return new Response(null, { status: 404 });
      }
      if (url.endsWith("/turns") && init?.method === "POST") {
        turnRequests += 1;
        return new Response(
          'data: {"type":"turn_message","message":{"kind":"text_delta","sequence":"1","text":"Starting"}}\n\n',
          { headers: { "content-type": "text/event-stream" } }
        );
      }
      return new Response("Not found", { status: 404 });
    })
  );
  renderAgentPage();

  await page
    .getByRole("textbox", { name: "Send a message to Lenso Agent" })
    .fill("Apply the configuration");
  await page.getByRole("button", { name: "Submit comment" }).click();

  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("UI disconnected · Agent state unknown");
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("Result uncertain");
  await page
    .getByRole("textbox", { name: "Send a message to Lenso Agent" })
    .fill("Retry the request");
  await page.getByRole("button", { name: "Submit comment" }).click();
  await expect
    .element(
      page.getByText(
        "The previous Turn result is uncertain. Refresh its durable Session before starting another Turn."
      )
    )
    .toBeVisible();
  expect(turnRequests).toBe(1);
  expect(container?.textContent).not.toContain("Agent failed");
  expect(container?.textContent).not.toContain(
    "The UI stream disconnected before the Agent reported a terminal Turn outcome"
  );
});
