import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";
import * as stylex from "@stylexjs/stylex";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { Providers } from "../../app/providers";
import { agentContextNavigationStyles } from "../../features/agent/agent-context-navigation.stylex";
import { queryClient } from "../../lib/query-client";
import { ConsoleSearch } from "./console-search";
import { ConsoleShell } from "./console-shell";
import { shellStyles } from "./console-shell.stylex";
import {
  ContextNavigationContent,
  ContextNavigationItem,
  ContextNavigationSearch,
} from "./context-navigation";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  flushSync(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("Context navigation", () => {
  test("releases the mobile drawer and page inertness on desktop resize", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        Response.json(
          String(input).endsWith("/agents")
            ? {
                agents: [
                  {
                    id: "console",
                    label: "Console Agent",
                    role: "console",
                    capabilities: [],
                  },
                ],
              }
            : { sessions: [], apps: [] }
        )
      )
    );
    const rootRoute = createRootRoute({
      component: () => (
        <Providers>
          <ConsoleShell>
            <Outlet />
          </ConsoleShell>
        </Providers>
      ),
    });
    const agentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/agent/$agentId/$chatId",
      component: () => <div>Conversation</div>,
    });
    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ["/agent/console/new-task"],
      }),
      routeTree: rootRoute.addChildren([agentRoute]),
    });
    root = createRoot(container);
    await page.viewport(375, 800);
    try {
      flushSync(() => root?.render(<RouterProvider router={router} />));
      await page
        .getByRole("button", { name: "Open workspace navigation" })
        .click();
      const main = container.querySelector<HTMLElement>("main");
      const header = container.querySelector<HTMLElement>("header");
      if (!(main && header)) {
        throw new Error("Console shell was not rendered");
      }
      expect(main.inert).toBe(true);
      expect(header.inert).toBe(true);

      await page.viewport(1280, 800);
      await expect.poll(() => main.inert).toBe(false);
      expect(header.inert).toBe(false);
      await expect
        .element(page.getByRole("button", { name: "Search Console" }))
        .toBeVisible();
    } finally {
      await page.viewport(1280, 800);
    }
  });

  test("opens global search with the keyboard and restores focus on dismissal", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ThemeScope>
          <ConsoleSearch
            items={[
              {
                id: "projects",
                group: "Workspace",
                label: "Projects",
                onSelect: () => undefined,
              },
            ]}
          />
        </ThemeScope>
      );
    });
    const trigger = page.getByRole("button", { name: "Search Console" });
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Search Console"]')
      ?.focus();
    await userEvent.keyboard("{Control>}k{/Control}");
    await expect.element(page.getByRole("dialog")).toBeVisible();
    await expect
      .element(page.getByRole("combobox", { name: "Search Console" }))
      .toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(trigger).toHaveFocus();
  });

  test("keeps the context sidebar beside the content under the header", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ThemeScope>
          <div {...stylex.props(shellStyles.shell)}>
            <header
              aria-label="Workspace header"
              {...stylex.props(shellStyles.header)}
            />
            <div {...stylex.props(shellStyles.navigationRegion)}>
              <Sidebar.Root defaultOpen xstyle={shellStyles.contextSidebarRoot}>
                <Sidebar.Panel aria-label="Context navigation" />
              </Sidebar.Root>
            </div>
            <main
              aria-label="Page content"
              {...stylex.props(shellStyles.main)}
            />
          </div>
        </ThemeScope>
      );
    });
    await nextFrame();

    const header = container.querySelector<HTMLElement>("header");
    const sidebar = container.querySelector<HTMLElement>(
      '[aria-label="Context navigation"]'
    );
    const main = container.querySelector<HTMLElement>("main");
    if (!(header && sidebar && main)) {
      throw new Error("Workspace shell was not rendered");
    }
    expect(sidebar.getBoundingClientRect().width).toBe(218);
    expect(main.getBoundingClientRect().left).toBe(
      sidebar.getBoundingClientRect().right
    );
    expect(main.getBoundingClientRect().top).toBe(
      header.getBoundingClientRect().bottom
    );
  });

  test("shows hover feedback on a header tab", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ThemeScope>
          <button type="button" {...stylex.props(shellStyles.tab)}>
            Settings
          </button>
        </ThemeScope>
      );
    });
    await nextFrame();

    const button = page.getByRole("button", { name: "Settings" });
    const buttonElement = container.querySelector<HTMLButtonElement>("button");
    if (!buttonElement) {
      throw new Error("Icon button was not rendered");
    }
    const restingBackground = getComputedStyle(buttonElement).backgroundColor;
    await userEvent.hover(button);
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(getComputedStyle(buttonElement).backgroundColor).not.toBe(
      restingBackground
    );
  });

  test("shows hover feedback on an unselected sidebar item", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ThemeScope>
          <Sidebar.Root defaultOpen>
            <Sidebar.Panel>
              <Sidebar.Content>
                <Sidebar.Menu>
                  <Sidebar.MenuItem>
                    <ContextNavigationItem>Plugins</ContextNavigationItem>
                  </Sidebar.MenuItem>
                </Sidebar.Menu>
              </Sidebar.Content>
            </Sidebar.Panel>
          </Sidebar.Root>
        </ThemeScope>
      );
    });
    await nextFrame();

    const item = page.getByRole("button", { name: "Plugins" });
    const itemElement = container.querySelector<HTMLButtonElement>("button");
    if (!itemElement) {
      throw new Error("Sidebar item was not rendered");
    }
    const restingBackground = getComputedStyle(itemElement).backgroundColor;
    await userEvent.hover(item);
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(getComputedStyle(itemElement).backgroundColor).not.toBe(
      restingBackground
    );
  });

  test("scrolls overflowing context navigation without moving its header", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ThemeScope>
          <div {...stylex.props(shellStyles.shell)}>
            <div {...stylex.props(shellStyles.navigationRegion)}>
              <Sidebar.Root defaultOpen xstyle={shellStyles.contextSidebarRoot}>
                <Sidebar.Panel xstyle={shellStyles.contextSidebarPanel}>
                  <Sidebar.Header>Agent</Sidebar.Header>
                  <ContextNavigationContent aria-label="Scrollable navigation">
                    <div
                      data-testid="sticky-agent-actions"
                      {...stylex.props(
                        agentContextNavigationStyles.stickyActions
                      )}
                    >
                      <ContextNavigationSearch
                        aria-label="Search chats"
                        placeholder="Search chats…"
                      />
                      <Sidebar.Menu aria-label="Agent actions">
                        <Sidebar.MenuItem>
                          <ContextNavigationItem>
                            New chat
                          </ContextNavigationItem>
                        </Sidebar.MenuItem>
                      </Sidebar.Menu>
                    </div>
                    <Sidebar.Menu>
                      {Array.from({ length: 60 }, (_, index) => (
                        <Sidebar.MenuItem key={index}>
                          <ContextNavigationItem>
                            Session {index + 1}
                          </ContextNavigationItem>
                        </Sidebar.MenuItem>
                      ))}
                    </Sidebar.Menu>
                  </ContextNavigationContent>
                </Sidebar.Panel>
              </Sidebar.Root>
            </div>
          </div>
        </ThemeScope>
      );
    });
    await nextFrame();

    const content = container.querySelector<HTMLElement>(
      '[aria-label="Scrollable navigation"]'
    );
    const header = container.querySelector<HTMLElement>(
      '[data-slot="sidebar-header"]'
    );
    const stickyActions = container.querySelector<HTMLElement>(
      '[data-testid="sticky-agent-actions"]'
    );
    const firstSession = Array.from(
      content?.querySelectorAll<HTMLButtonElement>(
        'button[data-slot="sidebar-item"]'
      ) ?? []
    ).find((item) => item.textContent === "Session 1");
    if (!(content && header && stickyActions && firstSession)) {
      throw new Error("Scrollable sidebar was not rendered");
    }
    const headerTop = header.getBoundingClientRect().top;
    const stickyActionsTop = stickyActions.getBoundingClientRect().top;
    const firstSessionTop = firstSession.getBoundingClientRect().top;
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    expect(getComputedStyle(content).overflowY).toBe("auto");
    content.scrollTop = 100;
    await nextFrame();

    expect(content.scrollTop).toBeGreaterThan(0);
    expect(header.getBoundingClientRect().top).toBe(headerTop);
    expect(stickyActions.getBoundingClientRect().top).toBe(stickyActionsTop);
    expect(firstSession.getBoundingClientRect().top).toBeLessThan(
      firstSessionTop
    );
  });
});

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 100));
}
