import { SettingsRow } from "@lenso/ui/settings-row";
import { ThemeScope } from "@lenso/ui/theme-scope";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { SettingsSection } from "../../components/lenso/recipes/settings-section";
import { settingsPageStyles as styles } from "./settings-page.stylex";

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

describe("Settings page rows", () => {
  test("keeps row hover transparent and removes the final separator", async () => {
    if (!container) {
      throw new Error("Browser test container is missing");
    }
    root = createRoot(container);
    flushSync(() => {
      root?.render(
        <ThemeScope>
          <SettingsSection.Group xstyle={styles.group}>
            <SettingsRow.Root xstyle={styles.row}>
              <SettingsRow.Title>First setting</SettingsRow.Title>
            </SettingsRow.Root>
            <SettingsRow.Root xstyle={styles.row}>
              <SettingsRow.Title>Last setting</SettingsRow.Title>
            </SettingsRow.Root>
          </SettingsSection.Group>
        </ThemeScope>
      );
    });
    await nextFrame();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const rows = container.querySelectorAll<HTMLElement>(
      '[data-slot="settings-row"]'
    );
    const [firstRow, lastRow] = rows;
    if (rows.length !== 2 || !firstRow || !lastRow) {
      throw new Error("Settings rows were not rendered");
    }

    expect(getComputedStyle(firstRow).borderBottomWidth).not.toBe("0px");
    await expect
      .poll(() => getComputedStyle(lastRow).borderBottomWidth)
      .toBe("0px");

    const restingBackground = getComputedStyle(firstRow).backgroundColor;
    await userEvent.hover(page.getByText("First setting"));
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(getComputedStyle(firstRow).backgroundColor).toBe(restingBackground);
  });
});

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
