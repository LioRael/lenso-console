import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";
import * as stylex from "@stylexjs/stylex";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { Settings } from "lucide-react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { agentContextNavigationStyles } from "../../features/agent/agent-context-navigation.stylex";
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
});

describe("Context navigation", () => {
  test("keeps the 48px primary rail outside the context sidebar hit area", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ThemeScope>
          <div style={{ display: "flex", width: 244 }}>
            <Sidebar.Root defaultOpen xstyle={shellStyles.primaryRailRoot}>
              <Sidebar.Panel
                aria-label="Global navigation"
                render={<nav />}
                xstyle={shellStyles.primaryRail}
              >
                <IconButton
                  aria-label="Preferences"
                  variant="ghost"
                  xstyle={shellStyles.railButton}
                >
                  <Settings aria-hidden="true" size={14} />
                </IconButton>
              </Sidebar.Panel>
            </Sidebar.Root>
            <Sidebar.Root defaultOpen xstyle={shellStyles.contextSidebarRoot}>
              <Sidebar.Panel aria-label="Context navigation" />
            </Sidebar.Root>
          </div>
        </ThemeScope>
      );
    });
    await nextFrame();

    const button = page.getByRole("button", { name: "Preferences" });
    const railElement = container.querySelector<HTMLElement>(
      'nav[aria-label="Global navigation"]'
    );
    const buttonElement = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Preferences"]'
    );
    if (!(buttonElement && railElement)) {
      throw new Error("Primary rail was not rendered");
    }

    expect(railElement.getBoundingClientRect().width).toBe(48);
    const restingBackground = getComputedStyle(buttonElement).backgroundColor;
    await userEvent.hover(button);
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(getComputedStyle(buttonElement).backgroundColor).not.toBe(
      restingBackground
    );
  });

  test("shows hover feedback on a ghost icon button", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ThemeScope>
          <IconButton
            aria-label="Settings"
            variant="ghost"
            xstyle={[shellStyles.railButton, shellStyles.activeRailButton]}
          >
            <Settings aria-hidden="true" size={14} />
          </IconButton>
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
    const itemRadius = Number(
      getComputedStyle(itemElement).borderTopLeftRadius.replace("px", "")
    );

    expect(itemRadius).toBeGreaterThanOrEqual(999);
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
    const softFade = getComputedStyle(stickyActions, "::before");
    const strongFade = getComputedStyle(stickyActions, "::after");

    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    expect(getComputedStyle(content).overflowY).toBe("auto");
    const stickyStyle = getComputedStyle(stickyActions);
    expect(stickyStyle.borderBottomLeftRadius).toBe("14px");
    expect(stickyStyle.borderBottomRightRadius).toBe("14px");
    expect(stickyStyle.paddingBottom).toBe("0px");
    expect(softFade.backdropFilter).toContain("blur(1px)");
    expect(softFade.borderTopLeftRadius).toBe("14px");
    expect(softFade.borderTopRightRadius).toBe("14px");
    expect(softFade.maskImage).toContain("linear-gradient");
    expect(strongFade.backdropFilter).toContain("blur(3px)");
    expect(strongFade.borderTopLeftRadius).toBe("14px");
    expect(strongFade.borderTopRightRadius).toBe("14px");
    expect(strongFade.maskImage).toContain("linear-gradient");
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
