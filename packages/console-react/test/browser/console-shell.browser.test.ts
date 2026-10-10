import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

// Existing Dock fixtures prove animation/pointer retirement. This proves the new
// published shell's routing, page lifetime, permission revocation and CAS behavior.
test("keeps pages mounted through presentation edits, restores overlay focus, retains CAS conflicts and revokes scope actions", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    optimizeDeps: {
      include: ["@lenso/ui/tooltip", "@lenso/ui/button", "@lenso/ui/modal"],
    },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const executablePath = process.env.LENSO_BROWSER_EXECUTABLE_PATH?.trim();
  const browser = await chromium.launch(
    executablePath ? { executablePath } : {}
  );
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${server.resolvedUrls!.local[0]}test/browser/index.html`);
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    const initial = await page.evaluate(() => window.shellFixture.snapshot());
    expect(
      await page
        .getByRole("button", { name: "Expand Dock", exact: true })
        .isVisible()
    ).toBe(true);
    await page.getByLabel("Persistent draft").fill("Keep this draft");
    const expand = page.getByRole("button", {
      name: "Expand Dock",
      exact: true,
    });
    await expand.focus();
    await expand.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("Dock position").selectOption("left");
    await page.getByLabel("Navigation mode").selectOption("sidebar");
    await page.getByLabel("Search navigation").fill("Records");
    expect(
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Records", exact: true })
        .count()
    ).toBe(1);
    await page.getByRole("dialog").press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    expect(await page.getByLabel("Persistent draft").inputValue()).toBe(
      "Keep this draft"
    );
    const afterPresentation = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    expect(afterPresentation.mounts).toBe(initial.mounts);
    // Sidebar removes the Dock trigger; the permanent navigation entry remains reachable.
    const nav = page.getByRole("button", {
      name: "Console navigation",
      exact: true,
    });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Console navigation"
    );
    await nav.click();
    await page
      .getByRole("button", { name: "Move History earlier", exact: true })
      .focus();
    await page
      .getByRole("button", { name: "Move History earlier", exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        window.shellFixture.snapshot().stored.value?.pinned[0]?.navigationId ===
        "history"
    );
    const pinnedRows = page.getByRole("dialog").locator("li[draggable]");
    await pinnedRows.first().dragTo(pinnedRows.last());
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        window.shellFixture.snapshot().stored.value?.pinned[0]?.navigationId ===
        "records"
    );
    await page
      .getByRole("button", { name: "Unpin Records", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Unpin History", exact: true })
      .click();
    await page.evaluate(() => window.shellFixture.conflict(true));
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    expect(
      await page
        .getByRole("button", { name: "Pin Records", exact: true })
        .count()
    ).toBe(1);
    await page.evaluate(() => window.shellFixture.conflict(false));
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page.waitForFunction(
      () => window.shellFixture.snapshot().stored.value?.pinned.length === 0
    );
    await page
      .getByRole("button", { name: "Reload preferences", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pin Records", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Reset navigation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Select record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Archive selected record", exact: true })
      .click();
    const afterArchive = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    expect(afterArchive.actions).toBe(1);
    const archive = page.getByRole("button", {
      name: "Archive selected record",
      exact: true,
    });
    const bounds = (await archive.boundingBox())!;
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
    await page.mouse.down();
    await page.evaluate(() => window.shellFixture.revise());
    await page.waitForFunction(() => window.shellFixture.snapshot().aborted[0]);
    await page.mouse.up();
    const afterPointerSwap = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    expect(afterPointerSwap.actions).toBe(1);
    await archive.click();
    const afterCurrentArchive = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    expect(afterCurrentArchive.actions).toBe(2);
    await page.evaluate(() => window.shellFixture.scope("second"));
    await page.waitForFunction(() => window.shellFixture.snapshot().aborted[1]);
    expect(
      await page
        .getByRole("button", { name: "Archive selected record", exact: true })
        .count()
    ).toBe(0);
    await page.evaluate(() =>
      window.shellFixture.navigate("/console/records/42")
    );
    await page.getByRole("heading", { name: "Detail page" }).waitFor();
    expect(
      await page
        .getByRole("link", { name: "Records tab" })
        .getAttribute("aria-current")
    ).toBe("page");
    expect(
      await page.getByRole("link", { name: "History tab" }).getAttribute("href")
    ).toBe("/console/history");
    await page.evaluate(() => window.shellFixture.allow(false));
    await page
      .getByText("You do not have access to this page.", { exact: true })
      .waitFor();
    await nav.click();
    expect(await page.getByRole("dialog").getByRole("link").count()).toBe(0);
    expect(
      await page
        .getByRole("button", { name: "Pin Records", exact: true })
        .count()
    ).toBe(0);
    await page.getByRole("dialog").press("Escape");
    await page.evaluate(() => {
      window.shellFixture.allow(true);
      document.documentElement.dataset.theme = "dark";
    });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await nav.click();
    await page.getByLabel("Dock position").selectOption("left");
    const popup = page.getByRole("dialog");
    const popupBounds = (await popup.boundingBox())!;
    expect(popupBounds.x).toBeGreaterThanOrEqual(0);
    expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(390);
    const close = page.getByRole("button", {
      name: "Close navigation",
      exact: true,
    });
    expect(
      await close.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2
        );
        return target === element || element.contains(target);
      })
    ).toBe(true);
    await close.click();
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
  }
}, 60_000);
