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
import type { PageMount } from "../../features/extensions/page-contribution-catalog";
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
  ContextNavigationSection,
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
        title="Research workspace"
        toolbar={
          <header
            aria-label="Workspace header"
            {...stylex.props(shellStyles.header)}
          >
            <Sidebar.Trigger
              targetId="console-sidebar"
              ref={navigation.triggerRef}
            >
              Toggle sidebar
            </Sidebar.Trigger>
          </header>
        }
        rail={
          <nav
            aria-label="Primary navigation"
            {...stylex.props(shellStyles.rail)}
          />
        }
        sidebar={
          <ContextNavigationContent>
            <ContextNavigationSection label="Sections">
              <ContextNavigationItem>Preferences</ContextNavigationItem>
            </ContextNavigationSection>
          </ContextNavigationContent>
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
    const workspaceRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/research",
      component: () => <div>Workspace content</div>,
    });
    const settingsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/settings",
      component: () => <div>Settings content</div>,
    });
    const pluginsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/plugins",
      component: () => <div>Plugins content</div>,
    });
    queryClient.setQueryData<readonly PageMount[]>(
      ["console-page-catalog"],
      [
        {
          apiMajor: 1,
          id: "research",
          title: "Research lab",
          module: "",
          navigation: {
            label: "Research lab",
            items: [{ label: "Overview", path: [] }],
          },
          owner: {
            instance: "test.research",
            source: "development-filesystem",
            trusted: false,
          },
          requirements: [],
          revision: "test",
          styles: [],
          subject: { kind: "console" },
        },
      ]
    );
    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ["/agent/console/saved-conversation?project=retained"],
      }),
      routeTree: rootRoute.addChildren([
        agentRoute,
        workspaceRoute,
        settingsRoute,
        pluginsRoute,
      ]),
    });
    root = createRoot(container);
    await page.viewport(375, 800);
    try {
      flushSync(() => root?.render(<RouterProvider router={router} />));
      await expect
        .element(page.getByRole("button", { name: "Search Console" }))
        .toBeVisible();
      expect(
        page
          .getByRole("banner", { name: "Console toolbar" })
          .element()
          .getBoundingClientRect().height
      ).toBe(52);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375);
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
      await expect
        .element(activeAgentLink)
        .toHaveAttribute("aria-current", "page");
      activeAgentLink.element().focus();
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      expect(
        page
          .getByRole("dialog", { name: "Console navigation" })
          .element()
          .contains(document.activeElement)
      ).toBe(true);
      await userEvent.keyboard("{Tab}");
      await expect.element(activeAgentLink).toHaveFocus();
      await page.getByRole("button", { name: "Color mode" }).click();
      await expect
        .element(page.getByRole("menu", { name: "Color mode" }))
        .toBeVisible();
      await userEvent.keyboard("{ArrowDown}");
      await expect
        .poll(() => document.activeElement?.getAttribute("role"))
        .toBe("menuitem");
      await userEvent.keyboard("{Escape}");
      await expect
        .element(page.getByRole("menu", { name: "Color mode" }))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Color mode" }))
        .toHaveFocus();
      expect(main.inert).toBe(true);

      await page
        .getByRole("dialog", { name: "Console navigation" })
        .getByRole("button", {
          name: "Close workspace navigation",
          exact: true,
        })
        .click();
      await expect.poll(() => main.inert).toBe(false);
      await expect
        .element(
          page.getByRole("button", { name: "Open workspace navigation" })
        )
        .toHaveFocus();
      await page
        .getByRole("button", { name: "Open workspace navigation" })
        .click();
      await expect.poll(() => main.inert).toBe(true);
      activeAgentLink.element().focus();
      await userEvent.keyboard("{Escape}");
      await expect.poll(() => main.inert).toBe(false);
      await expect
        .element(
          page.getByRole("button", { name: "Open workspace navigation" })
        )
        .toHaveFocus();
      await page
        .getByRole("button", { name: "Open workspace navigation" })
        .click();
      page
        .getByRole("dialog", { name: "Console navigation" })
        .getByRole("button", {
          name: "Close workspace navigation",
          exact: true,
        })
        .element()
        .focus();
      await userEvent.keyboard("{Escape}");
      await expect.poll(() => main.inert).toBe(false);
      await expect
        .element(
          page.getByRole("button", { name: "Open workspace navigation" })
        )
        .toHaveFocus();
      await page
        .getByRole("button", { name: "Open workspace navigation" })
        .click();

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
      expect(toolbarSearch.width).toBe(400);
      expect(toolbarSearch.left + toolbarSearch.width / 2).toBe(
        toolbarBounds.left + toolbarBounds.width / 2
      );
      await expect
        .element(page.getByRole("button", { name: "Back", exact: true }))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Forward", exact: true }))
        .not.toBeInTheDocument();
      router.history.push("/research");
      await router.load();
      await expect
        .element(
          page.getByRole("heading", { name: "Research lab", exact: true })
        )
        .toBeVisible();
      await router.navigate({ to: "/settings" });
      await expect
        .element(page.getByRole("heading", { name: "Settings", exact: true }))
        .toBeVisible();
      await router.navigate({ to: "/plugins" });
      await expect
        .element(page.getByRole("heading", { name: "Plugins", exact: true }))
        .toBeVisible();
    } finally {
      await page.viewport(1280, 800);
    }
  });

  test("opens global search with the keyboard and restores focus on dismissal", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    const onSelect = vi.fn();
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
                onSelect,
              },
              ...Array.from({ length: 40 }, (_, index) => ({
                id: `command-${index}`,
                group: "Workspace",
                label: `Command ${index}`,
                onSelect: () => undefined,
              })),
            ]}
          />
        </ThemeScope>
      );
    });
    const trigger = page.getByRole("button", { name: "Search Console" });
    const restingShadow = getComputedStyle(trigger.element()).boxShadow;
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
    const focusedStyle = getComputedStyle(trigger.element());
    expect(
      focusedStyle.outlineStyle !== "none" ||
        focusedStyle.boxShadow !== restingShadow
    ).toBe(true);
    await trigger.click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect.element(trigger).toHaveFocus();
    await userEvent.keyboard("{Control>}k{/Control}");
    const input = page.getByRole("combobox", { name: "Search Console" });
    await input.fill("missing destination");
    await expect
      .element(page.getByText("No matching destinations."))
      .toBeVisible();
    await input.fill("Projects");
    await expect
      .element(page.getByRole("option", { name: "Projects Workspace" }))
      .toBeVisible();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    await page.viewport(1024, 400);
    try {
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect.element(dialog).toBeVisible();
      const last = page.getByRole("option", { name: "Command 39 Workspace" });
      last.element().scrollIntoView({ block: "end" });
      await expect
        .poll(() => {
          const popupBounds = dialog.element().getBoundingClientRect();
          const lastBounds = last.element().getBoundingClientRect();
          return lastBounds.bottom <= popupBounds.bottom;
        })
        .toBe(true);
      const popupBounds = dialog.element().getBoundingClientRect();
      expect(popupBounds.top).toBeGreaterThanOrEqual(0);
      expect(popupBounds.bottom).toBeLessThanOrEqual(400);
      await userEvent.keyboard("{Escape}");
    } finally {
      await page.viewport(1280, 800);
    }
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
    expect(header.getBoundingClientRect().height).toBe(56);
    expect(
      page
        .getByRole("heading", { name: "Research workspace" })
        .element()
        .getBoundingClientRect().left
    ).toBe(
      page
        .getByText("Sections", { exact: true })
        .element()
        .getBoundingClientRect().left
    );
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
          <Sidebar.Root defaultOpen={false}>
            <Sidebar.Trigger>Show context navigation</Sidebar.Trigger>
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
    await expect
      .element(
        page.getByRole("button", { name: "Plugins", includeHidden: true })
      )
      .not.toBeVisible();
    await page.getByRole("button", { name: "Show context navigation" }).click();
    await expect.element(item).toBeVisible();
    const itemElement = item.element();
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
