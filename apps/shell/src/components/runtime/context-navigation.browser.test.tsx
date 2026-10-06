import { ThemeScope } from "@lenso/ui";
import * as stylex from "@stylexjs/stylex";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";

import "@lenso/tokens/styles.css";
import "../../styles.css";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { Providers } from "../../app/providers";
import { agentContextNavigationStyles } from "../../features/agent/agent-context-navigation.stylex";
import { queryClient } from "../../lib/query-client";
import { Sidebar } from "../lenso/recipes/console-navigation";
import { ConsoleFrame } from "./console-frame";
import { ConsoleSearch } from "./console-search";
import { ConsoleShell } from "./console-shell";
import { shellStyles } from "./console-shell.stylex";
import {
  ContextNavigationContent,
  ContextNavigationItem,
  ContextNavigationSearch,
} from "./context-navigation";
import { useConsoleNavigation } from "./use-console-navigation";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function FrameFixture() {
  const navigation = useConsoleNavigation("/settings");
  return (
    <ThemeScope>
      <ConsoleFrame
        navigation={navigation}
        toolbar={
          <header
            aria-label="Workspace header"
            {...stylex.props(shellStyles.header)}
          >
            <button
              ref={navigation.triggerRef}
              type="button"
              onClick={() => navigation.toggle()}
            >
              Toggle sidebar
            </button>
          </header>
        }
        rail={
          <nav
            aria-label="Primary navigation"
            {...stylex.props(shellStyles.rail)}
          />
        }
        sidebarHeader={<Sidebar.Header>Settings</Sidebar.Header>}
        sidebar={
          <ContextNavigationContent>Preferences</ContextNavigationContent>
        }
      >
        Page content
      </ConsoleFrame>
    </ThemeScope>
  );
}

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
  test("preserves the active Agent link and releases drawer inertness on desktop resize", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    const nativeFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        // API fixtures must not replace the dev stylesheet with JSON.
        if (String(input).startsWith("/virtual:stylex.css")) {
          return nativeFetch(input);
        }
        return Response.json(
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
        );
      })
    );
    const stylesheet = await fetch("/virtual:stylex.css?fixture-preserve=1");
    expect(stylesheet.headers.get("content-type")).toContain("text/css");
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
        initialEntries: ["/agent/console/saved-conversation?project=retained"],
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
      const activeAgentLink = page
        .getByRole("navigation", { name: "Console areas" })
        .getByRole("link", { name: "Console Agent", exact: true });
      await expect
        .element(activeAgentLink)
        .toHaveAttribute(
          "href",
          "/agent/console/saved-conversation?project=retained"
        );
      await page
        .getByRole("button", { name: "Workspace: Console Agent" })
        .click();
      await expect
        .element(page.getByRole("menu", { name: "Workspace: Console Agent" }))
        .toBeVisible();
      await userEvent.keyboard("{ArrowDown}");
      await expect
        .poll(() => document.activeElement?.getAttribute("role"))
        .toBe("menuitem");
      await userEvent.keyboard("{Escape}");
      await expect
        .element(page.getByRole("menu", { name: "Workspace: Console Agent" }))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Workspace: Console Agent" }))
        .toHaveFocus();
      expect(main.inert).toBe(true);

      await page.viewport(1280, 800);
      await expect.poll(() => main.inert).toBe(false);
      expect(header.inert).toBe(false);
      await expect
        .element(page.getByRole("button", { name: "Search Console" }))
        .toBeVisible();
      const toolbarSearch = page
        .getByRole("button", { name: "Search Console" })
        .element()
        .getBoundingClientRect();
      const toolbarBounds = header.getBoundingClientRect();
      expect(toolbarSearch.width).toBe(272);
      expect(toolbarSearch.left + toolbarSearch.width / 2).toBe(
        toolbarBounds.left + toolbarBounds.width / 2 + 32
      );
      expect(
        page
          .getByRole("button", { name: "Back", exact: true })
          .element()
          .getBoundingClientRect().height
      ).toBe(40);
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

  test("keeps both navigation levels aligned and expands content when the sidebar collapses", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(<FrameFixture />);
    });
    await nextFrame();

    const header = container.querySelector<HTMLElement>("header");
    const sidebar = container.querySelector<HTMLElement>(
      '[aria-label="Console context navigation"]'
    );
    const main = container.querySelector<HTMLElement>("main");
    if (!(header && sidebar && main)) {
      throw new Error("Workspace shell was not rendered");
    }
    const rail = page.getByRole("navigation", { name: "Primary navigation" });
    expect(rail.element().getBoundingClientRect().width).toBe(56);
    expect(sidebar.getBoundingClientRect().width).toBe(248);
    expect(main.getBoundingClientRect().left).toBe(
      sidebar.getBoundingClientRect().right
    );
    expect(main.getBoundingClientRect().top).toBe(
      header.getBoundingClientRect().bottom
    );
    expect(header.getBoundingClientRect().height).toBe(48);
    expect(
      main.getBoundingClientRect().bottom -
        sidebar.getBoundingClientRect().bottom
    ).toBe(16);
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    await expect
      .poll(() => main.getBoundingClientRect().left)
      .toBe(rail.element().getBoundingClientRect().right);
    await expect.element(rail).toBeVisible();
    await expect
      .element(page.getByText("Preferences", { exact: true }))
      .not.toBeVisible();
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    await expect
      .element(page.getByText("Preferences", { exact: true }))
      .toBeVisible();
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
    await userEvent.unhover(item);
    await nextFrame();
    await Promise.all(
      itemElement.getAnimations().map((animation) => animation.finished)
    );
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
