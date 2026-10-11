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
    // The original two-row fixture never changed the number of count digits.
    // A standalone Dock must resize 9 -> 10 without retiring the same pane.
    await page.setViewportSize({ width: 1280, height: 800 });
    for (let index = 0; index < 9; index += 1) {
      await page.getByRole("checkbox").nth(index).check();
    }
    await page.waitForFunction(() => {
      const element = document.querySelector('[role="toolbar"]');
      return (
        element?.textContent?.includes("9 selected") &&
        !element.closest("[inert]")
      );
    });
    const samples = toolbar.evaluate(async (element) => {
      const pane = element.parentElement!;
      const dock = element.closest<HTMLElement>("[data-dashboard-dock]")!;
      const frames = [];
      const started = performance.now();
      while (performance.now() - started < 350) {
        await new Promise(requestAnimationFrame);
        frames.push({
          same: element.isConnected,
          opacity: Number(getComputedStyle(pane).opacity),
          inert: !!element.closest("[inert]"),
          x: dock.getBoundingClientRect().x,
        });
      }
      return frames;
    });
    await page.getByRole("checkbox").nth(9).check();
    const frames = await samples;
    expect(frames.length).toBeGreaterThan(5);
    expect(
      new Set(frames.map((frame) => Math.round(frame.x * 100))).size
    ).toBeGreaterThan(2);
    expect(
      frames.every((frame) => frame.same && frame.opacity === 1 && !frame.inert)
    ).toBe(true);
    expect(await toolbar.textContent()).toContain("10 selected");
    expect(fixture.errors).toEqual([]);
  } finally {
    await fixture.close();
  }
}, 60_000);
