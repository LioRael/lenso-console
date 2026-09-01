import { IconButton } from "@lenso/ui/icon-button";
import { Sidebar } from "@lenso/ui/sidebar";
import { ThemeScope } from "@lenso/ui/theme-scope";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { Settings } from "lucide-react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { shellStyles } from "./console-shell.stylex";
import { ContextNavigationItem } from "./context-navigation";

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
});

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 100));
}
