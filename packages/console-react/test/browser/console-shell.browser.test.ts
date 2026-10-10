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

// The existing shell test has no plugin-owned surfaces. A real browser is needed
// to prove focus, input identity, inert retirement and viewport hit geometry.
test("projects a plugin Dock with staged focus, preserved drafts, selection restoration and revoked controllers", async () => {
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
  const entry = page.getByRole("button", { name: "Test Agent", exact: true });
  const composer = page.getByRole("textbox", { name: "Plugin draft" });
  const conversation = page.getByRole("region", {
    name: "Plugin conversation",
  });
  const back = page.getByRole("button", {
    name: "Back to navigation",
    exact: true,
  });
  const waitForComposerFocus = () =>
    page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Plugin draft"
    );
  try {
    await page.goto(
      `${server.resolvedUrls!.local[0]}test/browser/index.html?dock`
    );
    await entry.waitFor();
    const initialState = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    const pageMounts = initialState.mounts;
    await page.getByLabel("Persistent draft").fill("Page state");
    await page.evaluate(() => window.shellFixture.beginGeometrySamples());
    await entry.click();
    await waitForComposerFocus();
    await conversation.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-dashboard-dock]")?.dataset
          .geometryReady === "true"
    );
    const morph = await page.evaluate(() =>
      window.shellFixture.endGeometrySamples()
    );
    expect(morph.sameSurface).toBe(true);
    expect(morph.distinctSizes).toBeGreaterThan(2);
    expect(
      await conversation.getByText("Plugin context preserved").isVisible()
    ).toBe(true);
    await composer.fill("Plugin state");
    await composer.evaluate((element) => {
      element.dataset.identity = "original";
    });
    const enteredState = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    const composerMountCount = enteredState.composerMounts;
    // An unconsumed Escape collapses before exiting, without replacing the input.
    await composer.press("Escape");
    await conversation.waitFor({ state: "hidden" });
    expect(await composer.getAttribute("data-identity")).toBe("original");
    // Retarget an in-flight pointer-mode expansion without remounting the input.
    await composer.click();
    await page.evaluate(async () => {
      window.shellFixture.tray(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      window.shellFixture.tray(false);
    });
    await conversation.waitFor({ state: "hidden" });
    expect(await composer.getAttribute("data-identity")).toBe("original");
    expect(await composer.inputValue()).toBe("Plugin state");
    await composer.press("Escape");
    await entry.waitFor();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Test Agent"
    );
    await entry.press("Enter");
    await waitForComposerFocus();
    await conversation.waitFor();
    expect(await composer.inputValue()).toBe("Plugin state");
    const reenteredState = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    expect(reenteredState.composerMounts).toBe(composerMountCount);
    // Moving focus to the page must not close the conversation or clear selection.
    await page
      .getByRole("button", { name: "Select record", exact: true })
      .click();
    expect(await conversation.isVisible()).toBe(true);
    await back.click();
    const archive = page.getByRole("button", {
      name: "Archive selected record",
      exact: true,
    });
    await archive.waitFor();
    await page
      .getByRole("button", { name: "Toggle selection execution" })
      .click();
    expect(await entry.isDisabled()).toBe(true);
    await page
      .getByRole("button", { name: "Toggle selection execution" })
      .click();
    await entry.click();
    await waitForComposerFocus();
    // IME Escape and an inner handler consuming Escape cannot dismiss the tray.
    await composer.evaluate((element) => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          isComposing: true,
        })
      );
      element.addEventListener(
        "keydown",
        (event) => {
          if (event instanceof KeyboardEvent && event.key === "Escape") {
            event.preventDefault();
          }
        },
        { once: true }
      );
    });
    expect(await conversation.isVisible()).toBe(true);
    await composer.press("Escape");
    expect(await conversation.isVisible()).toBe(true);
    await page
      .getByRole("button", { name: "Open plugin dialog", exact: true })
      .click();
    const pluginDialog = page.getByRole("dialog", { name: "Plugin details" });
    await pluginDialog.waitFor();
    await pluginDialog.press("Escape");
    await pluginDialog.waitFor({ state: "hidden" });
    expect(await conversation.isVisible()).toBe(true);
    await page.getByRole("button", { name: "Conversation action" }).focus();
    await page
      .getByRole("button", { name: "Collapse Test Agent", exact: true })
      .click();
    await waitForComposerFocus();
    await conversation.waitFor({ state: "hidden" });
    // An asynchronous exit cannot keep a revoked surface alive or exit its replacement.
    await page.evaluate(() => window.shellFixture.guardExit(true));
    await back.click();
    await page.evaluate(() => window.shellFixture.allowDock(false));
    await composer.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      window.shellFixture.snapshot().dockAborted.some(Boolean)
    );
    expect(await page.evaluate(() => window.shellFixture.staleExpand())).toBe(
      false
    );
    await page.evaluate(() => {
      window.shellFixture.allowDock(true);
      window.shellFixture.guardExit(false);
    });
    await entry.click();
    await waitForComposerFocus();
    await page.evaluate(() => window.shellFixture.resolveExit(true));
    expect(await composer.isVisible()).toBe(true);
    // Route transitions close presentation but retain the plugin's same-session draft.
    await composer.fill("Across route");
    await page.evaluate(() => window.shellFixture.navigate("/console/history"));
    await composer.waitFor({ state: "hidden" });
    await entry.click();
    await waitForComposerFocus();
    expect(await composer.inputValue()).toBe("Across route");
    await page.evaluate(() => window.shellFixture.scope("new-subject"));
    await composer.waitFor({ state: "hidden" });
    await entry.click();
    await waitForComposerFocus();
    expect(await composer.inputValue()).toBe("");
    await back.click();
    // One focused geometry proof across position, theme and narrow viewport.
    for (const position of ["bottom", "top", "left", "right"]) {
      await page
        .getByRole("button", { name: "Expand Dock", exact: true })
        .click();
      await page.getByLabel("Dock position").selectOption(position);
      await page
        .getByRole("button", { name: "Close navigation", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.setViewportSize({ width: 390, height: 700 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      await entry.focus();
      await entry.press("Enter");
      await waitForComposerFocus();
      await conversation.waitFor();
      for (const surface of [composer, conversation, back]) {
        const bounds = (await surface.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(700);
      }
      expect(
        await back.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          );
          return hit === element || element.contains(hit);
        })
      ).toBe(true);
      await back.click();
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page
      .getByRole("button", { name: "Expand Dock", exact: true })
      .click();
    await page.getByLabel("Navigation mode").selectOption("sidebar");
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await entry.click();
    await waitForComposerFocus();
    await conversation.waitFor();
    expect(
      await page
        .getByRole("navigation", { name: "Console navigation", exact: true })
        .isVisible()
    ).toBe(true);
    await back.click();
    await page.waitForFunction(
      () =>
        document.activeElement instanceof HTMLElement &&
        document.activeElement.dataset.consoleDockEntry !== undefined &&
        document.activeElement?.textContent === "Test Agent"
    );
    await page.setViewportSize({ width: 390, height: 700 });
    await entry.click();
    await waitForComposerFocus();
    await conversation.waitFor();
    expect(
      await page
        .getByRole("navigation", { name: "Pinned navigation", exact: true })
        .count()
    ).toBe(0);
    await back.click();
    await entry.waitFor();
    // History is the current page.
    expect(await page.getByLabel("Persistent draft").count()).toBe(0);
    const finalState = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    expect(finalState.mounts).toBe(pageMounts);
    expect(errors).toEqual([]);
    // A retained inactive renderer failure must not tear down the active page.
    const failedLease = finalState.dockAborted.length - 1;
    await page.evaluate(() => window.shellFixture.crashDock());
    await page.waitForFunction(
      (index) => window.shellFixture.snapshot().dockAborted[index],
      failedLease
    );
    await page.getByRole("heading", { name: "History page" }).waitFor();
    await entry.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "This Dock view could not be displayed." })
      .waitFor();
    await back.click();
    await entry.waitFor();
    expect(
      await page.getByRole("heading", { name: "History page" }).isVisible()
    ).toBe(true);
  } finally {
    await browser.close();
    await server.close();
  }
}, 60_000);
