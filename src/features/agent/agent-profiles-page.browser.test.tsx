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
import type { EditableProfile } from "./agent-profile-model";
import {
  AgentProfileDetailPage,
  AgentProfilesPage,
} from "./agent-profiles-page";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let client: QueryClient | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  client?.clear();
  vi.unstubAllGlobals();
});

test("Profiles routes guard unsaved navigation and activate only from the list", async () => {
  const profiles: EditableProfile[] = [
    {
      name: "default",
      revision: "r0",
      readOnly: true,
      document: {
        agent: "lenso.agent.loop/agent",
        description: "Default Profile",
        instructions: "",
        model: null,
        include_enabled: true,
        instances: [],
        excluded_instances: [],
        allowed_tools: null,
      },
    },
  ];
  const activations: unknown[] = [];
  let activeProfile: string | null = null;
  let activeRevision: string | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/agents")) {
        return Response.json({
          agents: [
            {
              id: "app",
              role: "app",
              label: "Lenso Agent",
              capabilities: ["lenso.agent.plugin-configuration@1"],
            },
          ],
        });
      }
      if (url.endsWith("control/profiles")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          const saved = {
            name: body.name,
            document: body.document,
            revision: "r1",
            readOnly: false,
          };
          profiles.push(saved);
          return Response.json(saved);
        }
        return Response.json({ profiles, activeProfile, activeRevision });
      }
      if (url.endsWith("control/profile")) {
        const body = JSON.parse(String(init?.body));
        activations.push(body);
        activeProfile = body.profile;
        activeRevision = body.expectedRevision;
        return Response.json({ profile: activeProfile });
      }
      if (url.endsWith("tool-policy")) {
        return Response.json({
          schema: "lenso.agent.tool-policy.v1",
          revision: 0,
          allowed: [],
          available: [],
        });
      }
      return Response.json(
        { detail: "No provider inventory in this fixture" },
        { status: 404 }
      );
    })
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client = queryClient;
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ThemeScope>
          <AgentIdentityProvider>
            <Outlet />
          </AgentIdentityProvider>
        </ThemeScope>
      </QueryClientProvider>
    ),
  });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings/profiles",
    component: AgentProfilesPage,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings/profiles/$agentId/$profileName",
    validateSearch: (search: Record<string, unknown>) => ({
      copy: search.copy === true,
    }),
    component: () => {
      const { agentId, profileName } = detailRoute.useParams();
      const { copy } = detailRoute.useSearch();
      return (
        <AgentProfileDetailPage
          key={`${agentId}/${profileName}/${copy}`}
          agentId={agentId}
          profileName={profileName}
          copy={copy}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/settings/profiles"] }),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root?.render(<RouterProvider router={router} />));
  await page.getByText("New Profile", { exact: true }).click();
  await expect
    .element(page.getByRole("textbox", { name: "Profile instructions" }))
    .toBeVisible();
  await page.getByRole("textbox", { name: "Profile name" }).fill("review");
  await page
    .getByRole("textbox", { name: "Profile instructions" })
    .fill("Review before editing.");
  await page.getByRole("link", { name: "Profiles", exact: true }).click();
  await expect
    .element(
      page.getByText("Discard unsaved changes and leave this Profile?", {
        exact: true,
      })
    )
    .toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect
    .element(page.getByRole("textbox", { name: "Profile instructions" }))
    .toHaveValue("Review before editing.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect
    .poll(() => router.state.location.pathname)
    .toBe("/settings/profiles/app/review");
  expect(activations).toHaveLength(0);
  await expect
    .element(page.getByRole("button", { name: "Apply Profile" }))
    .not.toBeInTheDocument();
  await page.getByRole("link", { name: "Profiles", exact: true }).click();
  await page.getByRole("button", { name: "Use review", exact: true }).click();
  await expect.poll(() => activations.length).toBe(1);
  expect(activations[0]).toEqual({ profile: "review", expectedRevision: "r1" });
  await expect
    .element(page.getByRole("button", { name: "Use review", exact: true }))
    .toBeDisabled();
});
