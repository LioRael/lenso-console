import { expect, test } from "bun:test";

import type { Locator } from "playwright";

import { openFixture } from "./server";

async function expectPointerTarget(control: Locator) {
  expect(
    await control.evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      const target = document.elementFromPoint(x + width / 2, y + height / 2);
      return target === element || element.contains(target);
    })
  ).toBe(true);
}

test("keeps the shared edge fixed and click-through while foreground context changes activation", async () => {
  const fixture = await openFixture("layout", 1280);
  const { page } = fixture;
  try {
    const initial = await page.evaluate(() =>
      window.consoleLayoutFixture.snapshot("first")
    );
    expect(initial.layoutCount).toBe(0);
    expect(initial.mountWrites).toBeGreaterThan(0);
    const edge = page.locator('[aria-hidden="true"]').first();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-hidden="true"]')!.getBoundingClientRect()
          .height > 0
    );
    const initialEdge = (await edge.boundingBox())!;
    expect(initialEdge.y).toBe(0);
    expect(initialEdge.width).toBe(1280);
    expect(initialEdge.height).toBeGreaterThan(0);

    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForFunction(() => window.scrollY === 200);
    expect(await edge.boundingBox()).toEqual(initialEdge);
    const content = page.getByRole("button", { name: "Content clicks: 0" });
    expect((await content.boundingBox())!.y).toBeLessThan(initialEdge.height);
    await expectPointerTarget(content);
    await content.click();
    expect(
      await page.getByRole("button", { name: "Content clicks: 1" }).isVisible()
    ).toBe(true);

    const foreground = page.getByRole("button", {
      name: "Foreground count: 0",
    });
    await expectPointerTarget(foreground);
    await foreground.click();
    expect(await page.getByLabel("Page count").textContent()).toBe("1");
    expect(
      await page.evaluate(() => window.consoleLayoutFixture.snapshot("first"))
    ).toMatchObject({
      context: { count: 1 },
      layoutCount: 1,
    });
    const keyboardControl = page.getByRole("button", {
      name: "Foreground count: 1",
    });
    await keyboardControl.focus();
    expect(
      await keyboardControl.evaluate(
        (element) => document.activeElement === element
      )
    ).toBe(true);
    await keyboardControl.press("Enter");
    expect(await page.getByLabel("Page count").textContent()).toBe("2");

    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.consoleLayoutFixture.render(true, "successor");
    });
    const stale = await page.evaluate(() =>
      window.consoleLayoutFixture.staleHandle("first")
    );
    expect(stale.calls).toBe(0);
    expect(stale.error).toMatch(/scope is closed/);
    expect(
      await page.evaluate(() =>
        window.consoleLayoutFixture.snapshot("successor")
      )
    ).toMatchObject({
      context: { count: 2 },
      layoutCount: 2,
    });
    await page.getByRole("button", { name: "Foreground count: 2" }).click();
    expect(await page.getByLabel("Page count").textContent()).toBe("3");
    expect(
      await page.evaluate(
        () => window.consoleLayoutFixture.snapshot("successor").context
      )
    ).toEqual({ count: 3 });

    const main = page.getByRole("main", { name: "Page content" });
    await main.evaluate((element) => {
      element.scrollTop = 200;
    });
    await page.waitForFunction(
      () => document.querySelector("main")!.scrollTop === 200
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await edge.boundingBox()).toEqual(initialEdge);
    const innerContent = page.getByRole("button", {
      name: "Content clicks: 1",
    });
    expect((await innerContent.boundingBox())!.y).toBeLessThan(
      initialEdge.height
    );
    await expectPointerTarget(innerContent);
    await innerContent.click();
    expect(
      await page.getByRole("button", { name: "Content clicks: 2" }).isVisible()
    ).toBe(true);
    const lower = page.getByRole("region", { name: "Lower nested scroller" });
    expect((await lower.boundingBox())!.y).toBeGreaterThan(initialEdge.height);
    await lower.evaluate((element) => {
      element.scrollTop = 150;
    });
    expect(await lower.evaluate((element) => element.scrollTop)).toBe(150);
    expect(await main.evaluate((element) => element.scrollTop)).toBe(200);
    expect(await edge.boundingBox()).toEqual(initialEdge);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      window.consoleLayoutFixture.render(true, "successor", true);
    });
    const darkForeground = page.getByRole("button", {
      name: "Foreground count: 3",
    });
    await expectPointerTarget(darkForeground);
    await darkForeground.click();
    expect(await page.getByLabel("Page count").textContent()).toBe("4");
    const unmounted = await page.evaluate(() => {
      window.consoleLayoutFixture.unmount();
      return window.consoleLayoutFixture.staleHandle("successor");
    });
    expect(unmounted.calls).toBe(0);
    expect(unmounted.error).toMatch(/scope is closed/);
    expect(fixture.errors).toEqual([]);
  } finally {
    await fixture.close();
  }
}, 60_000);
