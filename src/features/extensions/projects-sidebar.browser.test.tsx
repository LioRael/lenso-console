import { createElement, useState } from "react";
import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import * as projectsModule from "../../../service/crates/lenso-console-projects-workspace-plugin/assets/workspace.js";
import {
  ContributionSidebar,
  WorkspaceSidebarProvider,
  WorkspaceSidebarSlot,
} from "./workspace-sidebar-slot";

test("Projects contributes one sidebar and scopes project and issue requests to the selected team", async () => {
  let active = 0;
  let peak = 0;
  const invoke = vi.fn(
    async (
      _service: string,
      operation: string,
      body: Record<string, unknown>
    ) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (operation === "connection_status") {
        return { connected: true, mode: "console", label: "Console" };
      }
      if (operation === "get_issue") {
        return {
          status: 200,
          body: {
            issue_id: "issue-1",
            organization_id: "org-1",
            identifier: "TEA-1",
            title: "Team issue",
            team_id: "team-1",
            priority: "medium",
            workflow_state_id: "open",
            revision: 1,
            updated_at: "2026-09-12T00:00:00Z",
          },
        };
      }
      const items =
        operation === "list_workspaces"
          ? [{ organization_id: "org-1", name: "Tea", slug: "tea" }]
          : operation === "list_teams"
            ? [{ team_id: "team-1", name: "Product" }]
            : operation === "list_project_statuses"
              ? []
              : operation === "list_team_issues"
                ? [
                    {
                      issue_id: "issue-1",
                      identifier: "TEA-1",
                      title: "Team issue",
                      team_id: body.team_id,
                    },
                  ]
                : [];
      return { status: 200, body: { items, next_cursor: null } };
    }
  );
  const module = projectsModule.createWorkspace({
    react: React,
    createElement,
    services: {
      invoke: invoke as Parameters<
        typeof projectsModule.createWorkspace
      >[0]["services"]["invoke"],
    },
  });
  const controller = new AbortController();
  function App() {
    const [context, setContext] = useState<{
      label: string;
      text: string;
    } | null>(null);
    const [segments, setSegments] = useState<readonly string[]>([
      "org",
      "org-1",
    ]);
    const navigation = React.useMemo(
      () => ({
        go: setSegments,
        href: (parts: readonly string[]) =>
          `/workspaces/projects/${parts.join("/")}`,
      }),
      []
    );
    return (
      <WorkspaceSidebarProvider>
        <aside aria-label="Host sidebar">
          <WorkspaceSidebarSlot>Fallback</WorkspaceSidebarSlot>
        </aside>
        <main>
          <output aria-label="Agent context">{context?.label}</output>
          <module.Page
            agent={{ completedTurns: 0, setPageContext: setContext }}
            chrome={{ Sidebar: ContributionSidebar }}
            environment={{ locale: "en", theme: "light" }}
            location={{ segments }}
            navigation={navigation}
            signal={controller.signal}
          />
        </main>
      </WorkspaceSidebarProvider>
    );
  }
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    flushSync(() => root.render(<App />));
    await expect
      .element(page.getByRole("button", { name: "Switch workspace" }))
      .toBeVisible();
    await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Product", exact: true }).click();
    await page.getByRole("button", { name: "Issues", exact: true }).click();
    await expect
      .element(page.getByRole("link", { name: /Team issue/ }))
      .toBeVisible();
    expect(
      invoke.mock.calls.some(
        ([, operation, body]) =>
          operation === "list_team_issues" &&
          body.organization_id === "org-1" &&
          body.team_id === "team-1"
      )
    ).toBe(true);
    await page.getByRole("link", { name: /Team issue/ }).click();
    await expect
      .element(page.getByRole("heading", { name: "Team issue", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("status", { name: "Agent context" }))
      .toHaveTextContent("TEA-1");
    expect(peak).toBe(1);
    const sidebar = node.querySelector("aside")!;
    expect(
      sidebar.querySelectorAll('[aria-label="Switch workspace"]').length
    ).toBe(1);
  } finally {
    controller.abort();
    root.unmount();
    node.remove();
  }
});
