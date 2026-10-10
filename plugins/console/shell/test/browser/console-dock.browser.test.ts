import { expect, test } from "bun:test";

import type { Locator } from "playwright";

import { openFixture } from "./server";

async function assertNoInnerScroll(control: Locator) {
  const geometry = await control.evaluate((element) => {
    const dock = element.closest<HTMLElement>("[data-dashboard-dock]")!;
    const { left, right } = dock.getBoundingClientRect();
    return {
      scrollWidth: dock.scrollWidth,
      clientWidth: dock.clientWidth,
      left,
      right,
      viewport: window.innerWidth,
    };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
}

test("keeps narrow navigation reachable and safe while swapping action scopes", async () => {
  const fixture = await openFixture("dock", 320);
  const { page } = fixture;
  try {
    const navigation = page.getByRole("navigation", {
      name: "Pinned navigation",
    });
    await navigation.waitFor({ state: "visible" });
    await assertNoInnerScroll(navigation);
    await navigation
      .getByRole("button", { name: "Entries", exact: true })
      .click();

    const firstRecord = page.getByRole("checkbox").nth(0);
    await firstRecord.click();
    const toolbar = page.getByRole("toolbar", {
      name: "Entries selection actions",
      includeHidden: true,
    });
    await toolbar.waitFor({ state: "attached" });
    expect(
      await toolbar.evaluate((element) => !!element.closest("[inert]"))
    ).toBe(true);

    const secondRecord = page.getByRole("checkbox").nth(1);
    await secondRecord.focus();
    await secondRecord.press("Space");
    expect(await secondRecord.isChecked()).toBe(true);
    await page.waitForFunction(() => {
      const element = document.querySelector('[role="toolbar"]');
      return element && !element.closest("[inert]");
    });
    expect(await toolbar.isVisible()).toBe(true);
    await assertNoInnerScroll(toolbar);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    expect(
      await page.getByRole("status", { name: "Action result" }).textContent()
    ).toBe("Copy");

    await page.getByRole("button", { name: "Exit selection" }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector(
        'nav[aria-label="Pinned navigation"]'
      );
      return element && !element.closest("[inert]");
    });
    expect(await navigation.isVisible()).toBe(true);
    await assertNoInnerScroll(navigation);
    expect(
      await secondRecord.evaluate(
        (element) => document.activeElement === element
      )
    ).toBe(true);

    await firstRecord.click();
    await firstRecord.click();
    await page.waitForFunction(() => {
      const element = document.querySelector(
        'nav[aria-label="Pinned navigation"]'
      );
      return element && !element.closest("[inert]");
    });
    await assertNoInnerScroll(navigation);
    expect(fixture.errors).toEqual([]);
  } finally {
    await fixture.close();
  }
}, 60_000);
