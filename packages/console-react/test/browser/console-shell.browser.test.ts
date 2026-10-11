import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { chromium, type Locator } from "playwright";
import { createServer } from "vite";

// Unit tests cannot prove capture, delayed holds, focus restoration or occlusion.
// Extend the compiled-shell walkthrough rather than duplicate its browser fixture.
test("preserves pages, preset drafts, scoped CAS and selection safety through launcher interactions", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    optimizeDeps: {
      include: [
        "@lenso/ui/tooltip",
        "@lenso/ui/button",
        "@lenso/ui/popover",
        "@lenso/ui/hooks",
        "@lenso/ui/surface",
        "@lenso/ui/select",
        "liquid-gooey",
      ],
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
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const snapshot = () => page.evaluate(() => window.shellFixture.snapshot());
  const customize = async () => {
    await button("Customize navigation").click();
    await button("Save").waitFor();
  };
  const save = async () => {
    await button("Save").click();
    await button("Customize navigation").waitFor();
  };
  const add = async (name: string) => {
    await button("Add destinations").click();
    await button(`Add ${name} to preset`).click();
  };
  const presetAction = async (name: string) => {
    await button("Preset actions").click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const hitTest = async (name: string) => {
    expect(
      await button(name).evaluate((node) => {
        const r = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        );
      })
    ).toBe(true);
  };
  try {
    await page.goto(`${server.resolvedUrls!.local[0]}test/browser/index.html`);
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    // Route disappearance alone cannot prove a retained public projection is
    // inert. Exercise committed handles across scope replacement and unmount.
    await page.waitForFunction(
      () => window.pageLeaseProbe.snapshot().count === 1
    );
    await page.evaluate(() => window.pageLeaseProbe.invoke(0));
    expect(
      await page.evaluate(() => window.pageLeaseProbe.snapshot().invocations)
    ).toBe(2);
    await page.evaluate(() => window.pageLeaseProbe.change("second"));
    await page.waitForFunction(
      () => window.pageLeaseProbe.snapshot().count === 2
    );
    await page.evaluate(() => window.pageLeaseProbe.invoke(0));
    expect(
      await page.evaluate(() => window.pageLeaseProbe.snapshot().invocations)
    ).toBe(2);
    await page.evaluate(() => window.pageLeaseProbe.invoke(1));
    expect(
      await page.evaluate(() => window.pageLeaseProbe.snapshot().invocations)
    ).toBe(4);
    // A still-mounted publisher can be superseded by another page projection.
    // Its retained handles and later cleanup must not affect the new owner.
    await page.evaluate(() => window.pageLeaseProbe.replace());
    await page.waitForFunction(
      () => window.pageLeaseProbe.snapshot().count > 2
    );
    const replacementPage = await page.evaluate(
      () => window.pageLeaseProbe.snapshot().count - 1
    );
    await page.evaluate(() => window.pageLeaseProbe.invoke(1));
    expect(
      await page.evaluate(() => window.pageLeaseProbe.snapshot().invocations)
    ).toBe(4);
    await page.evaluate(() => window.pageLeaseProbe.unmount());
    await page.evaluate(
      (index) => window.pageLeaseProbe.invoke(index),
      replacementPage
    );
    expect(
      await page.evaluate(() => window.pageLeaseProbe.snapshot().invocations)
    ).toBe(6);
    // A mount can retire before React unmounts its last projection.
    await page.evaluate(() => window.pageLeaseProbe.abort());
    await page.evaluate(
      (index) => window.pageLeaseProbe.invoke(index),
      replacementPage
    );
    expect(
      await page.evaluate(() => window.pageLeaseProbe.snapshot().invocations)
    ).toBe(6);
    await page.evaluate(() => window.pageLeaseProbe.unmountAll());
    await page.waitForFunction(() => !window.pageLeaseProbe.snapshot().active);
    await page.evaluate(() => window.pageLeaseProbe.invoke(1));
    expect(
      await page.evaluate(() => window.pageLeaseProbe.snapshot().invocations)
    ).toBe(6);
    // Existing Launcher coverage misses Command stealing field focus, sharing
    // selection/preset eligibility, losing the previous query, or bypassing a
    // guarded router. This uses real browser focus, overlays and measured shape.
    const commandKey = (await page.evaluate(() =>
      /Mac|iPhone|iPad/.test(navigator.platform)
    ))
      ? "Meta+k"
      : "Control+k";
    const commands = page.getByRole("searchbox", { name: "Search commands" });
    await page.getByLabel("Persistent draft").fill("Keep this draft");
    await page.keyboard.press(commandKey);
    await commands.waitFor();
    expect(
      await commands.evaluate((node) => node === document.activeElement)
    ).toBe(true);
    expect(
      await page.evaluate(async () => {
        // oxlint-disable-next-line promise/avoid-new -- Observe the two browser frames needed to commit zero-duration layout, not an animation-length timer.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
        const content = document.querySelector(
          "[data-dashboard-dock-content]"
        )!;
        const popup = document.querySelector(
          '[data-console-dock-view="command"]'
        )!;
        const surface = document.querySelector(
          "[data-dashboard-dock-surface]"
        )!;
        return (
          getComputedStyle(content).opacity === "1" &&
          getComputedStyle(popup).opacity === "1" &&
          getComputedStyle(surface).transform === "none"
        );
      })
    ).toBe(true);
    expect(
      await commands.evaluate((node) => !!node.closest("[data-dashboard-dock]"))
    ).toBe(true);
    expect(
      await page
        .getByRole("region", { name: "Current page" })
        .getByRole("button", { name: "Clear record draft" })
        .count()
    ).toBe(1);
    expect(await button("Archive selected record").count()).toBe(0);
    await commands.fill("Records");
    await button("Close Command").focus();
    await page.keyboard.press(commandKey);
    expect(
      await commands.evaluate((node) => node === document.activeElement)
    ).toBe(true);
    expect(await commands.inputValue()).toBe("Records");
    await commands.press("Escape");
    await commands.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Persistent draft"
    );
    expect(await page.getByLabel("Persistent draft").inputValue()).toBe(
      "Keep this draft"
    );
    await page.keyboard.down(commandKey.split("+")[0]!);
    await page.evaluate(() => {
      document.activeElement?.addEventListener(
        "keydown",
        (event) => event.preventDefault(),
        { once: true }
      );
    });
    await page.keyboard.press("k");
    await page.keyboard.up(commandKey.split("+")[0]!);
    expect(await commands.count()).toBe(0);
    await page.getByLabel("Persistent draft").dispatchEvent("compositionstart");
    await page.keyboard.press(commandKey);
    expect(await commands.count()).toBe(0);
    await page.getByLabel("Persistent draft").dispatchEvent("compositionend");
    // Real non-modal popovers can retain outside focus. The layer, not the key
    // target, owns eligibility; rejected shortcuts must remain unconsumed.
    await page.evaluate(() => window.shellFixture.overlay(true));
    await page.getByRole("dialog", { name: "Record overlay" }).waitFor();
    await page.getByLabel("Persistent draft").focus();
    expect(
      await page.evaluate(() => {
        const mac = /Mac|iPhone|iPad/.test(navigator.platform);
        const event = new KeyboardEvent("keydown", {
          key: "k",
          metaKey: mac,
          ctrlKey: !mac,
          bubbles: true,
          cancelable: true,
        });
        document.activeElement!.dispatchEvent(event);
        return event.defaultPrevented;
      })
    ).toBe(false);
    expect(await commands.count()).toBe(0);
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Record overlay" })
      .waitFor({ state: "hidden" });
    await page.keyboard.press(commandKey);
    await commands.fill("Records");
    await page.evaluate(() => window.shellFixture.overlay(true));
    await page.getByRole("dialog", { name: "Record overlay" }).waitFor();
    await button("Overlay action").focus();
    await page.keyboard.press(commandKey);
    expect(
      await button("Overlay action").evaluate(
        (node) => node === document.activeElement
      )
    ).toBe(true);
    expect(await commands.inputValue()).toBe("Records");
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Record overlay" })
      .waitFor({ state: "hidden" });
    expect(await commands.isVisible()).toBe(true);
    await page.keyboard.press(commandKey);
    expect(
      await commands.evaluate((node) => node === document.activeElement)
    ).toBe(true);
    await commands.press("Escape");
    await commands.waitFor({ state: "hidden" });
    await button("Expand Dock").press("Enter");
    await page.getByLabel("Search navigation").fill("Hist");
    await page.keyboard.press(commandKey);
    await commands.fill("nothing-matches");
    await page.getByText("No matching commands.", { exact: true }).waitFor();
    await commands.press("Escape");
    expect(await page.getByLabel("Search navigation").inputValue()).toBe(
      "Hist"
    );
    expect(
      await page
        .getByLabel("Search navigation")
        .evaluate((node) => node === document.activeElement)
    ).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await button("Select record").click();
    const selectionBeforeCommand = await page
      .locator("[data-dashboard-dock-surface]")
      .boundingBox();
    await button("Archive selected record").focus();
    await page.keyboard.press(commandKey);
    await commands.fill("Clear record draft");
    await commands.press("Enter");
    await commands.waitFor({ state: "hidden" });
    expect(await page.getByLabel("Persistent draft").inputValue()).toBe("");
    expect(
      await page
        .getByRole("toolbar", { name: "Records selection actions" })
        .count()
    ).toBe(1);
    const selectionAfterCommand = await page
      .locator("[data-dashboard-dock-surface]")
      .boundingBox();
    expect(
      await button("Archive selected record").evaluate(
        (node) => node === document.activeElement
      )
    ).toBe(true);
    expect(
      Math.abs(selectionAfterCommand!.width - selectionBeforeCommand!.width)
    ).toBeLessThan(1);
    await page.keyboard.press(commandKey);
    await page.evaluate(() => window.shellFixture.selection(false));
    await commands.waitFor();
    await commands.press("Escape");
    expect(
      await page
        .getByRole("toolbar", { name: "Records selection actions" })
        .count()
    ).toBe(0);
    await page.getByRole("navigation", { name: "Pinned navigation" }).waitFor();
    await button("Select record").click();
    await page.evaluate(() => window.shellFixture.block(true));
    await page.keyboard.press(commandKey);
    await commands.fill("History");
    await commands.press("Enter");
    expect(
      await page.getByRole("heading", { name: "Records page" }).count()
    ).toBe(1);
    expect(
      await page
        .getByRole("toolbar", { name: "Records selection actions" })
        .count()
    ).toBe(1);
    await page.evaluate(() => window.shellFixture.block(false));
    await page.keyboard.press(commandKey);
    await commands.fill("History");
    await commands.press("Enter");
    await page.getByRole("heading", { name: "History page" }).waitFor();
    expect(
      await page
        .getByRole("toolbar", { name: "Records selection actions" })
        .count()
    ).toBe(0);
    await page.keyboard.press(commandKey);
    expect(
      await page.getByRole("region", { name: "Current page" }).count()
    ).toBe(0);
    await commands.fill("Records");
    await commands.press("Enter");
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    // Fallback pageGroups cannot catch explicit hiding/object replacement or a
    // return control remaining interactive during an interrupted split morph.
    await button("hidden context").click();
    expect(await page.getByRole("tablist").count()).toBe(0);
    await button("object context").click();
    await page.getByRole("status").filter({ hasText: "Draft" }).waitFor();
    await button("Return to record tabs").press("Enter");
    await page.getByRole("tablist", { name: "Record views" }).waitFor();
    await button("tabs context").click();
    await page.getByRole("tab", { name: "Contributed history" }).waitFor();
    await button("fallback context").click();
    await page.getByRole("link", { name: "Record detail" }).click();
    await page.getByRole("heading", { name: "Detail page" }).waitFor();
    expect(await page.getByRole("tablist").count()).toBe(0);
    await button("Return to records").press("Enter");
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    expect(await button("Return to records").count()).toBe(0);
    await page.getByRole("tablist", { name: "Record views" }).waitFor();
    const initial = await snapshot();
    await page.getByLabel("Persistent draft").fill("Keep this draft");
    await button("Expand Dock").focus();
    await button("Expand Dock").press("Enter");
    await page.getByRole("dialog").waitFor();
    const search = page.getByLabel("Search navigation");
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const [searchBox, closeBox] = await Promise.all([
        search.boundingBox(),
        button("Close navigation").boundingBox(),
      ]);
      expect(
        Math.abs(
          searchBox!.y +
            searchBox!.height / 2 -
            (closeBox!.y + closeBox!.height / 2)
        )
      ).toBeLessThanOrEqual(1);
      expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(closeBox!.x);
      await hitTest("Close navigation");
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await search.fill("Records");
    await customize();
    expect(
      await button("Drag Records").evaluate(
        (node) => node === document.activeElement
      )
    ).toBe(true);
    const tileAfter = await page
      .locator("[data-console-edit-item]")
      .first()
      .boundingBox();
    await page.mouse.click(
      tileAfter!.x + tileAfter!.width / 2,
      tileAfter!.y + tileAfter!.height / 2
    );
    expect(
      await page.getByRole("heading", { name: "Records page" }).count()
    ).toBe(1);
    expect(await search.count()).toBe(0);
    await button("Cancel").click();
    await button("Navigation settings").click();
    const navigationMode = page.getByRole("combobox", {
      name: "Navigation mode",
    });
    const dockPosition = page.getByRole("combobox", { name: "Dock position" });
    await navigationMode.click();
    await page.getByRole("option", { name: "Sidebar" }).click();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await dockPosition.click();
      const leftPosition = page.getByRole("option", { name: "left" });
      const popup = page.getByRole("listbox").filter({ has: leftPosition });
      expect(
        await popup.evaluate((node) => !node.closest("[data-dashboard-dock]"))
      ).toBe(true);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      );
      const popupBox = await popup.boundingBox();
      expect(popupBox!.x).toBeGreaterThanOrEqual(0);
      expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(width);
      if (width === 390) {
        await leftPosition.focus();
        await page.keyboard.press("Enter");
        break;
      }
      await page.keyboard.press("Escape");
      const triggerId = await dockPosition.getAttribute("id");
      expect(triggerId).not.toBeNull();
      await page.waitForFunction(
        (id) => document.getElementById(id) === document.activeElement,
        triggerId!
      );
      expect(
        await dockPosition.evaluate((node) => node === document.activeElement)
      ).toBe(true);
    }
    expect(await dockPosition.textContent()).toBe("left");
    const editorBeforeCommand = await page.getByRole("dialog").boundingBox();
    await dockPosition.focus();
    expect(await button("Command ⌘K").count()).toBe(0);
    await page.keyboard.press(commandKey);
    await commands.press("Escape");
    expect(await dockPosition.textContent()).toBe("left");
    expect(
      await page
        .getByLabel("Dock position")
        .evaluate((node) => node === document.activeElement)
    ).toBe(true);
    expect(await page.getByRole("dialog").boundingBox()).toEqual(
      editorBeforeCommand
    );
    await button("Cancel").press("Escape");
    expect(await search.inputValue()).toBe("Records");
    expect(
      await button("Navigation settings").evaluate(
        (node) => node === document.activeElement
      )
    ).toBe(true);
    const cancelled = await snapshot();
    expect(cancelled.stored.value).toBeNull();
    await button("Navigation settings").click();
    await navigationMode.click();
    await page.getByRole("option", { name: "Sidebar" }).click();
    await dockPosition.click();
    await page.getByRole("option", { name: "left" }).click();
    await save();
    await search.fill("Records");
    expect(
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Records", exact: true })
        .count()
    ).toBe(1);
    await page.getByRole("dialog").press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Console navigation"
    );
    await button("Console navigation").click();
    await customize();
    await button("Drag History").press("ArrowLeft");
    expect(
      await button("Drag History").evaluate(
        (node) => node === document.activeElement
      )
    ).toBe(true);
    await save();
    const keyboardOrder = await snapshot();
    expect(keyboardOrder.stored.value?.pinned[0]?.navigationId).toBe("history");
    await customize();
    // Coordinate gestures need a presented hit target, not its measurable bounds.
    await button("Drag History").hover();
    const [from, to] = await Promise.all([
      button("Drag History").boundingBox(),
      button("Drag Records").boundingBox(),
    ]);
    await page.mouse.move(
      from!.x + from!.width / 2,
      from!.y + from!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await save();
    const pointerOrder = await snapshot();
    expect(pointerOrder.stored.value?.pinned[0]?.navigationId).toBe("records");
    await customize();
    await button("Remove Records from preset").click();
    expect(
      await button("Drag History").evaluate(
        (node) => document.activeElement === node
      )
    ).toBe(true);
    await button("Remove History from preset").click();
    await page.evaluate(() => window.shellFixture.conflict(true));
    await button("Save").click();
    await page.getByRole("alert").waitFor();
    expect(await button("Drag Records").count()).toBe(0);
    expect(await button("Add destinations").count()).toBe(1);
    const conflict = await snapshot();
    expect(conflict.stored.value?.pinned.length).toBe(2);
    await page.evaluate(() => window.shellFixture.conflict(false));
    await save();
    const empty = await snapshot();
    expect(empty.stored.value?.pinned).toEqual([]);
    await customize();
    await add("Records");
    await add("History");
    await presetAction("New preset");
    await page.getByLabel("Preset name", { exact: true }).fill("Focus");
    await add("Records");
    await save();
    const created = await snapshot();
    expect(created.stored.value?.dockPresets?.presets.length).toBe(2);
    await customize();
    // Switching in the draft retains both collections without saving early.
    await button("Remove Records from preset").click();
    // Text-field shortcut checks do not catch a dirty collection being replaced.
    const editorShortcut = await page.evaluate(() =>
      /Mac|iPhone|iPad/.test(navigator.platform)
        ? "Meta+Alt+1"
        : "Control+Alt+1"
    );
    await page.keyboard.press(editorShortcut);
    expect(await button("Dock preset: Focus").count()).toBe(1);
    expect(await button("Drag Records").count()).toBe(0);
    await button("Dock preset: Focus").click();
    const escapedMenu = page.getByRole("menu", { name: "Dock presets" });
    await escapedMenu.waitFor();
    expect(
      await escapedMenu.evaluate((node) => {
        const dock = document
          .querySelector("[data-dashboard-dock-surface]")!
          .getBoundingClientRect();
        const menu = node.getBoundingClientRect();
        const x = menu.x + menu.width / 2;
        const y = menu.y + 8;
        return (
          (x < dock.left ||
            x > dock.right ||
            y < dock.top ||
            y > dock.bottom) &&
          node.contains(document.elementFromPoint(x, y))
        );
      })
    ).toBe(true);
    await page
      .getByRole("menuitemradio", { name: "Default", exact: true })
      .click();
    expect(await button("Drag History").count()).toBe(1);
    await button("Dock preset: Default").click();
    await page
      .getByRole("menuitemradio", { name: "Focus", exact: true })
      .click();
    expect(await button("Drag Records").count()).toBe(0);
    await add("Records");
    await presetAction("Rename preset");
    expect(
      await page.getByLabel("Preset name", { exact: true }).inputValue()
    ).toBe("Focus");
    await presetAction("New preset");
    await page.getByLabel("Preset name", { exact: true }).fill("");
    expect(await button("Save").isDisabled()).toBe(true);
    await page.getByRole("alert").waitFor();
    await page.getByLabel("Preset name", { exact: true }).fill("Temporary");
    await save();
    await customize();
    await presetAction("Delete preset");
    await button("Confirm delete preset").press("Enter");
    await save();
    const afterPresetRemoval = await snapshot();
    expect(
      afterPresetRemoval.stored.value?.dockPresets?.presets.map(
        (preset) => preset.name
      )
    ).toEqual(["Default", "Focus"]);
    // A center hit can pass while the Dock clips the menu's outer rows. Prove
    // a viewport hit outside the physical shell, not merely popup layout bounds.
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((mode) => {
          document.documentElement.dataset.theme = mode;
        }, theme);
        const switcherBounds = await button(
          "Dock preset: Default"
        ).boundingBox();
        const managerBounds = await button(
          "Customize navigation"
        ).boundingBox();
        expect(switcherBounds!.y + switcherBounds!.height).toBeLessThanOrEqual(
          managerBounds!.y
        );
        expect(switcherBounds!.width).toBeGreaterThan(managerBounds!.width);
        await button("Dock preset: Default").click();
        const menu = page.getByRole("menu", { name: "Dock presets" });
        await menu.waitFor();
        const bounds = await menu.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(800);
        expect(
          await menu.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            const x = rect.x + rect.width / 2;
            const y = rect.y + 8;
            return node.contains(document.elementFromPoint(x, y));
          })
        ).toBe(true);
        expect(
          await page
            .getByRole("menuitemradio", { name: "Focus" })
            .evaluate((node) => {
              const r = node.getBoundingClientRect();
              return node.contains(
                document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              );
            })
        ).toBe(true);
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
        expect(
          await button("Dock preset: Default").evaluate(
            (node) => node === document.activeElement
          )
        ).toBe(true);
        expect(await page.getByLabel("Search navigation").isVisible()).toBe(
          true
        );
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await button("Dock preset: Default").press("ArrowDown");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("role") === "menuitemradio"
    );
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await button("Dock preset: Focus").waitFor();
    const switched = await snapshot();
    expect(switched.stored.value?.dockPresets?.activeId).toBe(
      created.stored.value?.dockPresets?.activeId
    );
    await button("Dock preset: Focus").click();
    await page.getByRole("menuitemradio", { name: "Default" }).click();
    await button("Use Dock").click();
    await button("Close navigation").click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "Records page" }).click();
    const previous = page.getByRole("button", {
      name: /^Previous Dock preset/,
    });
    const next = page.getByRole("button", { name: /^Next Dock preset/ });
    await page.keyboard.down("Meta");
    await page.keyboard.up("Meta");
    await page.waitForTimeout(600);
    expect(await next.count()).toBe(0);
    await page.keyboard.down("Meta");
    await next.waitFor();
    await next.click({ modifiers: ["Meta"] });
    await page.waitForFunction(
      () =>
        window.shellFixture.snapshot().stored.value?.dockPresets?.activeId !==
        "default"
    );
    await page.keyboard.up("Meta");
    await next.waitFor({ state: "hidden" });
    await page.keyboard.down("Meta");
    await previous.waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await previous.waitFor({ state: "hidden" });
    await page.keyboard.up("Meta");
    const shortcut = await page.evaluate(() =>
      /Mac|iPhone|iPad/.test(navigator.platform)
        ? "Meta+Alt+1"
        : "Control+Alt+1"
    );
    await page.keyboard.press(shortcut);
    await page.waitForFunction(
      () =>
        window.shellFixture.snapshot().stored.value?.dockPresets?.activeId ===
        "default"
    );
    await page.getByLabel("Persistent draft").focus();
    await page.keyboard.press(shortcut.replace("1", "2"));
    const typed = await snapshot();
    expect(typed.stored.value?.dockPresets?.activeId).toBe("default");
    await page.getByRole("heading", { name: "Records page" }).click();
    await page.evaluate(() =>
      document.dispatchEvent(new CompositionEvent("compositionstart"))
    );
    await page.keyboard.press(shortcut.replace("1", "2"));
    await page.evaluate(() =>
      document.dispatchEvent(new CompositionEvent("compositionend"))
    );
    const composed = await snapshot();
    expect(composed.stored.value?.dockPresets?.activeId).toBe("default");
    const records = (await button("History").boundingBox())!;
    await page.mouse.move(
      records.x + records.width / 2,
      records.y + records.height / 2
    );
    await page.mouse.down();
    await button("Save").waitFor();
    await page.mouse.up();
    expect(
      await page.getByRole("heading", { name: "Records page" }).count()
    ).toBe(1);
    await button("Remove History from preset").press("Enter");
    await button("Cancel").press("Enter");
    await button("Close navigation").click();
    const afterCancel = await snapshot();
    expect(afterCancel.stored.value?.pinned.length).toBe(2);
    expect(await page.getByLabel("Persistent draft").inputValue()).toBe(
      "Keep this draft"
    );
    expect(afterCancel.mounts).toBe(initial.mounts);
    await button("Expand Dock").click();
    await button("Navigation settings").click();
    await page.getByRole("combobox", { name: "Dock position" }).click();
    await page.getByRole("option", { name: "bottom" }).click();
    await save();
    await button("Close navigation").click();
    await button("Select record").click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('[data-kind="selection"]')?.dataset
          .ready === "true"
    );
    // Existing count/action checks miss a stable node being hidden by a replayed
    // surface reveal. Sample the actual presentation while adding rows 2 and 3.
    await page.getByText("Records · 1 selected", { exact: true }).click();
    await button("Archive selected record").focus();
    await button("Archive selected record").hover();
    for (const id of [2, 3, 4]) {
      const sampling = page.evaluate(async (row) => {
        const toolbar = document.querySelector(
          '[aria-label="Records selection actions"]'
        )!;
        const pane = toolbar.parentElement!;
        const action = toolbar.querySelector("button")!;
        const surface = document.querySelector(
          "[data-dashboard-dock-surface]"
        )!;
        const initialWidth = surface.getBoundingClientRect().width;
        const initialX = surface.getBoundingClientRect().x;
        const samples: {
          same: boolean;
          ready: boolean;
          opacity: number;
          width: number;
          travel: number;
          focused: boolean;
          hovered: boolean;
        }[] = [];
        const start = performance.now();
        const capture = () => {
          samples.push({
            same:
              document.querySelector(
                '[aria-label="Records selection actions"]'
              ) === toolbar,
            ready: pane.dataset.ready === "true" && !pane.inert,
            opacity:
              Number(getComputedStyle(pane).opacity) *
              Number(getComputedStyle(pane.parentElement!).opacity),
            width: surface.getBoundingClientRect().width - initialWidth,
            travel: surface.getBoundingClientRect().x - initialX,
            focused: document.activeElement === action,
            hovered: action.matches(":hover"),
          });
          if (performance.now() - start < 350) {
            requestAnimationFrame(capture);
          }
        };
        requestAnimationFrame(capture);
        if (row < 4) {
          const checkbox = [...document.querySelectorAll("label")]
            .find(
              (label) => label.textContent?.trim() === `Select record ${row}`
            )!
            .querySelector("input")!;
          checkbox.click();
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
        return samples;
      }, id);
      if (id === 4) {
        // Genuine geometry travel must still happen without replaying this scope.
        await page.setViewportSize({ width: 1100, height: 800 });
      }
      const frames = await sampling;
      expect(frames.length).toBeGreaterThan(5);
      expect(
        frames.every(
          (frame) =>
            frame.same &&
            frame.ready &&
            frame.opacity > 0.99 &&
            Math.abs(frame.width) < 0.1 &&
            frame.focused &&
            (id === 4 || frame.hovered)
        )
      ).toBe(true);
      if (id === 4) {
        expect(frames.some((frame) => Math.abs(frame.travel) > 50)).toBe(true);
      }
      expect(
        await page
          .getByRole("toolbar", { name: "Records selection actions" })
          .textContent()
      ).toContain(`${Math.min(id, 3)} selected`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await button("Console navigation").click();
    await page.getByRole("dialog").press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await button("Archive selected record").click();
    const afterAction = await snapshot();
    expect(afterAction.actions).toBe(1);
    const archive = (await button("Archive selected record").boundingBox())!;
    await page.mouse.move(
      archive.x + archive.width / 2,
      archive.y + archive.height / 2
    );
    await page.mouse.down();
    await page.evaluate(() => window.shellFixture.revise());
    await page.waitForFunction(
      (index) => window.shellFixture.snapshot().aborted[index],
      afterAction.aborted.length - 1
    );
    await page.mouse.up();
    const afterSwap = await snapshot();
    expect(afterSwap.actions).toBe(1);
    await button("Archive selected record").click();
    const afterCurrent = await snapshot();
    expect(afterCurrent.actions).toBe(2);
    await page.keyboard.down("Meta");
    await page.waitForTimeout(600);
    expect(await next.count()).toBe(0);
    await page.keyboard.up("Meta");
    await page.evaluate(() => window.shellFixture.scope("second"));
    await page.waitForFunction(
      (index) => window.shellFixture.snapshot().aborted[index],
      afterCurrent.aborted.length - 1
    );
    expect(await button("Archive selected record").count()).toBe(0);
    await page.evaluate(() =>
      window.shellFixture.navigate("/console/records/42")
    );
    await page.getByRole("heading", { name: "Detail page" }).waitFor();
    await button("Return to records").waitFor();
    expect(await page.getByRole("tablist").count()).toBe(0);
    await page.evaluate(() => window.shellFixture.allow(false));
    await page
      .getByText("You do not have access to this page.", { exact: true })
      .waitFor();
    await button("Expand Dock").click();
    expect(await page.getByRole("dialog").getByRole("link").count()).toBe(0);
    await page.getByRole("dialog").press("Escape");
    await page.evaluate(() => {
      window.shellFixture.allow(true);
      document.documentElement.dataset.theme = "dark";
    });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await button("Expand Dock").click();
    await customize();
    const bounds = (await page.getByRole("dialog").boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(await button("Close navigation").count()).toBe(0);
    for (const name of ["Cancel", "Save"]) {
      await hitTest(name);
    }
    await button("Cancel").click();
    await button("Close navigation").click();
    await page.evaluate(() => {
      window.shellFixture.navigate("/console/records");
      window.shellFixture.tabsPosition("content");
    });
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    expect(
      await page
        .getByRole("tablist", { name: "Record views" })
        .evaluate((node) => !!node.closest("main"))
    ).toBe(true);
    await button("hidden context").click();
    expect(await page.getByRole("tablist").count()).toBe(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const separationFrames = page.evaluate(async () => {
      const frames: {
        gap: number;
        seamRadius: number;
        outerRadius: number;
        width: number;
        hit: boolean;
        opacity: number;
      }[] = [];
      const capture = () => {
        const cap = document.querySelector('[data-context-surface="return"]');
        const body = document.querySelector('[data-context-surface="object"]');
        const returnButton = document.querySelector(
          '[aria-label="Return to record tabs"]'
        );
        if (!cap || !body || !returnButton) {
          return;
        }
        const a = cap.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        const corners = getComputedStyle(cap)
          .clipPath.split("round ")[1]!
          .match(/[\d.]+/g)!
          .map(Number);
        const text = body
          .parentElement!.querySelector("span")!
          .getBoundingClientRect();
        frames.push({
          gap: b.left - a.right,
          seamRadius: corners[1] ?? corners[0]!,
          outerRadius: corners[0]!,
          width: text.width,
          opacity: Number(getComputedStyle(cap.parentElement!).opacity),
          hit: returnButton.contains(
            document.elementFromPoint(a.x + 2, a.y + a.height / 2)
          ),
        });
      };
      // A cold browser can miss the first RAF while committing the new object.
      // Observe its actual initial paint as well as subsequent physical frames.
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-context-surface="return"]')) {
          capture();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const start = performance.now();
      while (performance.now() - start < 500) {
        await new Promise(requestAnimationFrame);
        capture();
      }
      observer.disconnect();
      return frames;
    });
    await button("object context").click();
    const frames = await separationFrames;
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.some((frame) => frame.gap < 1 && frame.seamRadius < 1)).toBe(
      true
    );
    expect(
      frames.some(
        (frame) =>
          frame.gap > 1 &&
          frame.gap < 7 &&
          frame.seamRadius > 1 &&
          frame.seamRadius < frame.outerRadius - 1
      )
    ).toBe(true);
    const settled = frames.at(-1)!;
    expect(settled.gap).toBeGreaterThan(7);
    expect(settled.seamRadius).toBe(settled.outerRadius);
    expect(
      frames.every(
        (frame) =>
          frame.hit &&
          frame.opacity === 1 &&
          frame.gap >= -0.5 &&
          frame.gap <= settled.gap + 0.5 &&
          Math.abs(frame.width - settled.width) < 0.5
      )
    ).toBe(true);
    await button("Return to record tabs").waitFor();
    await button("Return to record tabs").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    expect(
      await button("Return to record tabs").evaluate(
        (node) => getComputedStyle(node).outlineStyle
      )
    ).toBe("solid");
    // Restore pointer intent without moving focus, so reversal exercises the
    // animated path rather than the deliberately immediate keyboard path.
    await page.mouse.click(20, 70);
    await button("Return to record tabs").focus();
    const reversal = await page.evaluate(async () => {
      const context = document.querySelector('[aria-label="Task context"]')!;
      const gap = () => {
        const cap = context
          .querySelector('[data-context-surface="return"]')!
          .getBoundingClientRect();
        const body = context
          .querySelector('[data-context-surface="object"]')!
          .getBoundingClientRect();
        return body.left - cap.right;
      };
      window.shellFixture.returnAvailable(false);
      const start = performance.now();
      while (performance.now() - start < 200) {
        await new Promise(requestAnimationFrame);
        if (gap() > 2 && gap() < 6) {
          const before = gap();
          const focus =
            document.activeElement ===
            document.querySelector('[data-context-surface="object"]')!
              .parentElement;
          const inert = !!document
            .querySelector('[aria-label="Return"]')
            ?.closest("[inert]");
          window.shellFixture.returnAvailable(true);
          await new Promise(requestAnimationFrame);
          return { before, after: gap(), focus, inert };
        }
      }
      return null;
    });
    expect(reversal).not.toBeNull();
    expect(reversal!.focus).toBe(true);
    expect(reversal!.inert).toBe(true);
    // One frame can still advance the closing tween before React commits the
    // reversal. It must remain between endpoints, not replay either pose.
    expect(reversal!.after).toBeGreaterThan(0.5);
    expect(reversal!.after).toBeLessThan(7.5);
    expect(Math.abs(reversal!.after - reversal!.before)).toBeLessThan(3);
    await page.waitForTimeout(220);
    await hitTest("Return to record tabs");
    // Motion's old hook only read the initial preference. A live preference
    // change must remove the decorative filter without remounting the control.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      () =>
        !document.querySelector('[aria-label="Task context"] [data-gooey-svg]')
    );
    await hitTest("Return to record tabs");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => window.shellFixture.returnAvailable(false));
    await page.waitForFunction(
      () => !document.querySelector('[data-context-surface="return"]')
    );
    await page.waitForTimeout(220);
    expect(
      await page.locator('[data-context-surface="object"]').evaluate((node) => {
        const body = node.getBoundingClientRect();
        const group = node
          .closest('[aria-label="Task context"]')!
          .getBoundingClientRect();
        return Math.abs(body.x + body.width / 2 - group.x - group.width / 2);
      })
    ).toBeLessThan(0.5);
    await page.evaluate(() => window.shellFixture.returnAvailable(true));
    await button("Return to record tabs").waitFor();
    await page.waitForTimeout(220);
    await hitTest("Return to record tabs");
    for (let turn = 0; turn < 3; turn += 1) {
      await button("fallback context").click();
      await button("object context").click();
    }
    await button("Return to record tabs").press("Enter");
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const placement of ["top", "bottom", "left", "right"] as const) {
      await page.evaluate(
        (position) => window.shellFixture.tabsPosition(position),
        placement
      );
      await page.waitForFunction((position) => {
        const node = document.querySelector(
          '[aria-label="Record views pages"]'
        );
        if (!node || node.closest("main")) {
          return false;
        }
        const rect = node.getBoundingClientRect();
        return position === "top"
          ? rect.y < 60
          : position === "bottom"
            ? rect.y > 650
            : position === "left"
              ? rect.x < 100
              : rect.x > 150;
      }, placement);
      const tabBounds = await page
        .getByRole("navigation", { name: "Record views pages" })
        .boundingBox();
      expect(tabBounds!.width).toBeGreaterThan(0);
      expect(tabBounds!.height).toBeLessThan(200);
      expect(tabBounds!.x).toBeGreaterThanOrEqual(0);
      expect(tabBounds!.x + tabBounds!.width).toBeLessThanOrEqual(390);
      if (placement === "top") {
        expect(tabBounds!.y).toBeLessThan(60);
      }
      if (placement === "bottom") {
        expect(tabBounds!.y).toBeGreaterThan(650);
      }
      if (placement === "left") {
        expect(tabBounds!.x).toBeLessThan(100);
      }
      if (placement === "right") {
        expect(tabBounds!.x).toBeGreaterThan(150);
      }
    }
    // Long, scrollable menus must escape the editor's physical Dock even when
    // collision placement flips. Existing center hits with two short names miss it.
    for (const [position, width, height, theme] of [
      ["bottom", 1280, 800, "light"],
      ["left", 390, 520, "dark"],
      ["right", 1280, 800, "dark"],
      ["top", 390, 520, "light"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        ({ position: placement, theme: mode }) => {
          document.documentElement.dataset.theme = mode;
          const pinned = [{ bindingId: "records", navigationId: "records" }];
          window.shellFixture.seedPreferences({
            mode: "dock",
            position: placement,
            pinned,
            dockPresets: {
              version: 1,
              activeId: "default",
              presets: [
                { id: "default", name: "Default", pinned },
                ...Array.from({ length: 12 }, (_, i) => ({
                  id: `long-${i}`,
                  name: `Fixture long preset ${i}: a name that wraps without escaping the menu`,
                  pinned,
                })),
              ],
            },
          });
        },
        { position, theme }
      );
      await page.evaluate(
        (placement) => window.shellFixture.scope(`portal-${placement}`),
        position
      );
      await button("Expand Dock").click();
      await customize();
      const trigger = button("Dock preset: Default");
      await trigger.press("ArrowDown");
      const menu = page.getByRole("menu", { name: "Dock presets" });
      await menu.waitFor();
      expect(
        await menu.evaluate((node) =>
          getComputedStyle(node).getPropertyValue("--foreground")
        )
      ).toBe(
        await trigger.evaluate((node) =>
          getComputedStyle(node).getPropertyValue("--foreground")
        )
      );
      if (height === 520) {
        expect(await menu.getAttribute("data-side")).toBe("bottom");
      }
      expect(
        await menu.evaluate((node) => {
          const r = node.getBoundingClientRect();
          const x = r.x + r.width / 2;
          const y = r.y + 8;
          return {
            viewport:
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.top >= 0 &&
              r.bottom <= innerHeight,
            hit: node.contains(document.elementFromPoint(x, y)),
            scrollable: node.scrollHeight > node.clientHeight,
          };
        })
      ).toEqual({ viewport: true, hit: true, scrollable: true });
      await page.keyboard.press("End");
      expect(
        await page
          .getByRole("menuitemradio")
          .last()
          .evaluate((node) => {
            const r = node.getBoundingClientRect();
            return node.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            );
          })
      ).toBe(true);
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden" });
      expect(
        await trigger.evaluate((node) => node === document.activeElement)
      ).toBe(true);
      expect(await button("Save").isVisible()).toBe(true);
      await button("Cancel").click();
      await button("Close navigation").click();
    }
    await page.setViewportSize({ width: 390, height: 800 });
    // A filtered launcher and absent contribution must never turn visible
    // reorder indices into offsets against the full persisted pin array.
    await page.evaluate(() =>
      window.shellFixture.seedPreferences({
        mode: "dock",
        position: "bottom",
        pinned: [
          { bindingId: "records", navigationId: "records" },
          { bindingId: "temporarily-unavailable", navigationId: "hidden" },
          { bindingId: "records", navigationId: "history" },
        ],
      })
    );
    await button("Expand Dock").click();
    await search.fill("History");
    await customize();
    expect(await search.count()).toBe(0);
    await button("Drag History").press("ArrowLeft");
    await save();
    expect(await search.inputValue()).toBe("History");
    const hiddenAfterReorder = await snapshot();
    expect(
      hiddenAfterReorder.stored.value?.pinned.map((ref) => ref.navigationId)
    ).toEqual(["history", "records", "hidden"]);
    await customize();
    await button("Remove History from preset").press("Enter");
    await button("Add destinations").press("Enter");
    const picker = page.getByRole("region", { name: "Add destinations" });
    await picker.waitFor();
    const pickerBounds = (await picker.boundingBox())!;
    expect(pickerBounds.y + pickerBounds.height).toBeLessThanOrEqual(800);
    expect(pickerBounds.x + pickerBounds.width).toBeLessThanOrEqual(390);
    await button("Close destination picker").press("Escape");
    expect(
      await button("Add destinations").evaluate(
        (node) => node === document.activeElement
      )
    ).toBe(true);
    expect(await button("Save").isVisible()).toBe(true);
    await button("Add destinations").press("Enter");
    await picker
      .getByRole("button", { name: "Add History to preset", exact: true })
      .press("Enter");
    expect(
      await button("Add destinations").evaluate(
        (node) => node === document.activeElement
      )
    ).toBe(true);
    await save();
    const hiddenAfterAdd = await snapshot();
    expect(
      hiddenAfterAdd.stored.value?.pinned.map((ref) => ref.navigationId)
    ).toEqual(["records", "hidden", "history"]);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
  }
}, 60_000);

// The seam-only walkthrough cannot catch a body that teleports when the page
// changes between its tabs and object identity. Sample the actual painted skin.
test("retains task surface travel in both directions through route changes", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  try {
    await page.goto(`${server.resolvedUrls!.local[0]}test/browser/index.html`);
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    const capture = () =>
      page.evaluate(async () => {
        const frames: {
          x: number;
          width: number;
          opacity: number;
          labelWidth?: number;
        }[] = [];
        const start = performance.now();
        while (performance.now() - start < 450) {
          await new Promise(requestAnimationFrame);
          const skin =
            document.querySelector<HTMLElement>(
              "[data-context-body-surface]"
            ) ??
            document.querySelector<HTMLElement>(
              '[data-context-surface="object"]'
            ) ??
            document.querySelector<HTMLElement>(
              '[aria-label="Record views pages"]'
            );
          if (skin) {
            const box = skin.getBoundingClientRect();
            frames.push({
              x: box.x,
              width: box.width,
              opacity: Number(
                getComputedStyle(
                  document.querySelector("[data-context-content]") ?? skin
                ).opacity
              ),
              ...(skin.dataset.contextSurface === "object" && {
                labelWidth: document
                  .querySelector("[data-context-content] span")!
                  .getBoundingClientRect().width,
              }),
            });
          }
        }
        return frames;
      });
    for (const name of ["Record detail", "Return to records"]) {
      const sampling = capture();
      if (name === "Record detail") {
        await page.getByRole("link", { name, exact: true }).click();
      } else {
        await page.getByRole("button", { name, exact: true }).click();
      }
      const frames = await sampling;
      expect(frames.length).toBeGreaterThan(5);
      const widths = new Set(frames.map((frame) => Math.round(frame.width)));
      expect(widths.size).toBeGreaterThan(3);
      expect(frames.some((frame) => frame.opacity < 0.9)).toBe(true);
      expect(frames.at(-1)!.opacity).toBe(1);
      const labels = frames.flatMap((frame) =>
        frame.labelWidth === undefined ? [] : [frame.labelWidth]
      );
      if (labels.length) {
        expect(Math.max(...labels) - Math.min(...labels)).toBeLessThan(0.5);
      }
    }
    await page
      .getByRole("link", { name: "Record detail", exact: true })
      .press("Enter");
    await page.getByRole("heading", { name: "Detail page" }).waitFor();
    expect(
      await page
        .locator("[data-context-body-surface]")
        .getAttribute("data-travelling")
    ).toBe("false");
    expect(
      await page.locator('[aria-label="Task context"] [data-gooey-svg]').count()
    ).toBe(0);
    await page
      .getByRole("button", { name: "Return to records", exact: true })
      .press("Enter");
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    // Reverse a real page contribution while the skin is between endpoints.
    // Old observers and completion callbacks must not settle the new route.
    await page.mouse.click(20, 70);
    const reversal = await page.evaluate(async () => {
      window.shellFixture.navigate("/console/records/42");
      const start = performance.now();
      while (performance.now() - start < 200) {
        await new Promise(requestAnimationFrame);
        const skin = document.querySelector<HTMLElement>(
          "[data-context-body-surface]"
        )!;
        if (skin.dataset.travelling === "true") {
          const before = skin.getBoundingClientRect().width;
          document
            .querySelector<HTMLButtonElement>(
              '[aria-label="Return to records"]'
            )!
            .click();
          await new Promise(requestAnimationFrame);
          return { before, after: skin.getBoundingClientRect().width };
        }
      }
      return null;
    });
    expect(reversal).not.toBeNull();
    expect(Math.abs(reversal!.after - reversal!.before)).toBeLessThan(20);
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    await page.waitForTimeout(250);
    expect(
      await page
        .locator("[data-context-body-surface]")
        .getAttribute("data-context-surface")
    ).toBe("tabs");
    expect(
      await page
        .locator("[data-context-content]")
        .evaluate((node) => (node as HTMLElement).inert)
    ).toBe(false);
    const detail = page.getByRole("link", {
      name: "Record detail",
      exact: true,
    });
    await detail.click();
    await page.getByRole("heading", { name: "Detail page" }).waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-context-body-surface]")
          ?.dataset.travelling === "true"
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-context-body-surface]")
          ?.dataset.travelling === "false" &&
        !document.querySelector('[aria-label="Task context"] [data-gooey-svg]')
    );
    expect(
      await page
        .locator("[data-context-content]")
        .evaluate((node) => getComputedStyle(node).opacity)
    ).toBe("1");
    expect(
      await page.locator('[aria-label="Task context"] [data-gooey-svg]').count()
    ).toBe(0);
    await page
      .getByRole("button", { name: "Return to records", exact: true })
      .click();
    await page.getByRole("heading", { name: "Records page" }).waitFor();
    expect(
      await page
        .locator("[data-context-body-surface]")
        .getAttribute("data-travelling")
    ).toBe("false");
  } finally {
    await browser.close();
    await server.close();
  }
}, 20_000);

// Page-only proofs cannot verify retained plugin owners, IME/overlay dismissal,
// admission revocation or the physical geometry of a projected bar and tray.
test("projects a plugin Dock with staged focus, preserved drafts, selection restoration and revoked controllers", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    optimizeDeps: {
      include: [
        "@lenso/ui/tooltip",
        "@lenso/ui/button",
        "@lenso/ui/modal",
        "@lenso/ui/popover",
        "@lenso/ui/hooks",
        "@lenso/ui/surface",
        "@lenso/ui/select",
        "liquid-gooey",
      ],
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
    await page
      .getByRole("button", { name: "Conversation action" })
      .evaluate((element) => {
        element.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true })
        );
        window.shellFixture.tray(false);
      });
    await conversation.waitFor({ state: "hidden" });
    await page.evaluate(() => window.shellFixture.tray(true));
    await conversation.waitFor();
    await page
      .getByRole("button", { name: "Conversation action" })
      .evaluate((element) => {
        element.dispatchEvent(
          new MouseEvent("click", { bubbles: true, detail: 1 })
        );
      });
    expect(
      await page.getByText("Test conversation details", { exact: true }).count()
    ).toBe(0);
    await composer.press("Escape");
    await conversation.waitFor({ state: "hidden" });
    expect(await composer.getAttribute("data-identity")).toBe("original");
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
    // Focused typing during viewport retargeting must keep the exact input owner.
    await composer.focus();
    await page.setViewportSize({ width: 1100, height: 760 });
    await composer.press("End");
    await composer.pressSequentially(" resized");
    expect(await composer.getAttribute("data-identity")).toBe("original");
    expect(await composer.inputValue()).toBe("Plugin state resized");
    await waitForComposerFocus();
    // Command yields the same measured surface without discarding plugin draft.
    const commandKey = (await page.evaluate(() =>
      /Mac|iPhone|iPad/.test(navigator.platform)
    ))
      ? "Meta+k"
      : "Control+k";
    await composer.press(commandKey);
    await page.getByRole("dialog", { name: "Command", exact: true }).waitFor();
    await page
      .getByRole("dialog", { name: "Command", exact: true })
      .press("Escape");
    await composer.waitFor();
    expect(await composer.getAttribute("data-identity")).toBe("original");
    expect(await composer.inputValue()).toBe("Plugin state resized");
    // Composer-only restoration cannot prove that the exact secondary tray
    // control survives Command, without an intermediate initial-input focus.
    const trayAction = page.getByRole("button", {
      name: "Conversation action",
    });
    for (const [reducedMotion, dismissal] of [
      ["no-preference", "keyboard"],
      ["no-preference", "pointer"],
      ["reduce", "keyboard"],
      ["reduce", "pointer"],
    ] as const) {
      await page.emulateMedia({ reducedMotion });
      await trayAction.focus();
      await composer.evaluate((element) => {
        let focused = 0;
        const lifetime = new AbortController();
        element.addEventListener(
          "focus",
          () => {
            focused += 1;
          },
          { signal: lifetime.signal }
        );
        Object.assign(element, {
          finishFocusTrace() {
            lifetime.abort();
            return focused;
          },
        });
      });
      await trayAction.press(commandKey);
      const commandSearch = page.getByRole("searchbox", {
        name: "Search commands",
      });
      await commandSearch.waitFor();
      if (dismissal === "keyboard") {
        await commandSearch.press("Escape");
      } else {
        await page
          .getByRole("button", { name: "Close Command", exact: true })
          .click();
      }
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>("[data-dashboard-dock]")?.dataset
            .geometryReady === "true"
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );
      expect(
        await trayAction.evaluate(
          (element) => document.activeElement === element
        )
      ).toBe(true);
      expect(
        await composer.evaluate((element) =>
          (
            element as HTMLElement & { finishFocusTrace(): number }
          ).finishFocusTrace()
        )
      ).toBe(0);
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page
      .getByRole("button", { name: "Select record", exact: true })
      .click();
    expect(await conversation.isVisible()).toBe(true);
    await page
      .getByRole("checkbox", { name: "Select record 2", exact: true })
      .check();
    expect(
      await page
        .getByRole("button", { name: "Archive selected record", exact: true })
        .count()
    ).toBe(0);
    expect(
      await page
        .locator('button[aria-label="Archive selected record"]')
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2
            )
          );
        })
    ).toBe(false);
    await back.click();
    const archive = page.getByRole("button", {
      name: "Archive selected record",
      exact: true,
    });
    await archive.waitFor();
    expect(
      await page
        .getByRole("toolbar", { name: "Records selection actions" })
        .textContent()
    ).toContain("2 selected");
    await page
      .getByRole("button", { name: "Toggle selection execution" })
      .click();
    expect(await entry.isDisabled()).toBe(true);
    await page
      .getByRole("button", { name: "Toggle selection execution" })
      .click();
    await entry.click();
    await waitForComposerFocus();
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
    await page
      .getByRole("button", { name: "Toggle selection execution" })
      .click();
    await composer.waitFor({ state: "hidden" });
    expect(await archive.isDisabled()).toBe(true);
    await page
      .getByRole("button", { name: "Toggle selection execution" })
      .click();
    await composer.waitFor();
    expect(await composer.inputValue()).toBe("Plugin state resized");
    await page.evaluate(() => window.shellFixture.selection(false));
    expect(await composer.inputValue()).toBe("Plugin state resized");
    if (await conversation.isVisible()) {
      await page
        .getByRole("button", { name: "Collapse Test Agent", exact: true })
        .click();
      await conversation.waitFor({ state: "hidden" });
    }
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
    for (const position of ["bottom", "top", "left", "right"]) {
      await page
        .getByRole("button", { name: "Expand Dock", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Navigation settings", exact: true })
        .click();
      await page.getByRole("combobox", { name: "Dock position" }).click();
      await page.getByRole("option", { name: position, exact: true }).click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
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
    await page
      .getByRole("button", { name: "Navigation settings", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Navigation mode" }).click();
    await page.getByRole("option", { name: "Sidebar", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await entry.click();
    await waitForComposerFocus();
    await conversation.waitFor();
    expect(
      await composer.evaluate((element) => {
        let opacity = 1;
        let current: HTMLElement | null = element as HTMLElement;
        while (current) {
          opacity *= Number(getComputedStyle(current).opacity);
          current = current.parentElement;
        }
        return opacity;
      })
    ).toBe(1);
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
        document.activeElement.textContent === "Test Agent"
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
    expect(await page.getByLabel("Persistent draft").count()).toBe(0);
    const finalState = await page.evaluate(() =>
      window.shellFixture.snapshot()
    );
    expect(finalState.mounts).toBe(pageMounts);
    expect(errors).toEqual([]);
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

// The short plugin fixture proves surface projection, not whether a long page's
// boundary controls remain hit-testable behind a tall floating tray.
test("keeps page boundary controls unobstructed by measured plugin Dock clearance", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    optimizeDeps: { include: ["@lenso/ui", "@lenso/ui/**", "liquid-gooey"] },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const executablePath = process.env.LENSO_BROWSER_EXECUTABLE_PATH?.trim();
  const browser = await chromium.launch(
    executablePath ? { executablePath } : {}
  );
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const end = page.getByRole("button", {
    name: "End page action",
    exact: true,
  });
  const first = page.getByRole("textbox", { name: "First page control" });
  const hit = async (control: Locator) =>
    page.evaluate(
      (element) => {
        if (!element) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          )
        );
      },
      await control.elementHandle()
    );
  const waitForHit = async (control: Locator) => {
    await page.waitForFunction(
      (element) => {
        const rect = element!.getBoundingClientRect();
        return element!.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          )
        );
      },
      await control.elementHandle()
    );
  };
  const settled = async () => {
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-dashboard-dock]")?.dataset
          .geometryReady === "true"
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
  };
  try {
    await page.goto(
      `${server.resolvedUrls!.local[0]}test/browser/index.html?dock&clearance`
    );
    await page.getByRole("button", { name: "Test Agent", exact: true }).click();
    await page.getByRole("region", { name: "Plugin conversation" }).waitFor();
    await settled();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );
    expect(await hit(end)).toBe(true);
    await page.getByLabel("Plugin draft").evaluate((element) => {
      element.style.height = "100px";
    });
    await settled();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );
    await waitForHit(end);
    expect(await hit(end)).toBe(true);
    await end.focus();
    await end.press("Enter");
    expect(await page.getByLabel("Persistent draft").inputValue()).toBe(
      "End reached"
    );
    expect(await hit(end)).toBe(true);
    const commandKey = (await page.evaluate(() =>
      /Mac|iPhone|iPad/.test(navigator.platform)
    ))
      ? "Meta+k"
      : "Control+k";
    await page.getByLabel("Plugin draft").press(commandKey);
    await page.getByRole("dialog", { name: "Command", exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".console-layout")
          ?.getAttribute("style")
          ?.includes("--console-dock-bottom-clearance")
    );
    await page
      .getByRole("dialog", { name: "Command", exact: true })
      .press("Escape");
    await page.getByRole("region", { name: "Plugin conversation" }).waitFor();
    await settled();
    await page
      .getByRole("button", { name: "Back to navigation", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".console-layout")
          ?.getAttribute("style")
          ?.includes("--console-dock-bottom-clearance")
    );

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const position of ["top", "bottom"] as const) {
        for (const theme of ["light", "dark"]) {
          await page.evaluate(
            ({ theme: mode, position: placement }) => {
              document.documentElement.dataset.theme = mode;
              window.shellFixture.seedPreferences({
                mode: "dock",
                position: placement,
                pinned: [{ bindingId: "records", navigationId: "records" }],
              });
            },
            { theme, position }
          );
          await page
            .getByRole("button", { name: "Test Agent", exact: true })
            .click();
          await page
            .getByRole("region", { name: "Plugin conversation" })
            .waitFor();
          await settled();
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute("aria-label") ===
              "Plugin draft"
          );
          await page.evaluate(() => window.scrollTo(0, 0));
          await waitForHit(first);
          expect(await hit(first)).toBe(true);
          await first.focus();
          await first.press("Tab");
          await page.keyboard.press("Shift+Tab");
          expect(
            await first.evaluate(
              (element) => document.activeElement === element
            )
          ).toBe(true);
          expect(await hit(first)).toBe(true);
          await end.focus();
          await waitForHit(end);
          expect(await hit(end)).toBe(true);
          if (position === "bottom") {
            await page.evaluate(() =>
              window.scrollTo(0, document.documentElement.scrollHeight)
            );
            await waitForHit(end);
            expect(await hit(end)).toBe(true);
          }
          await page.setViewportSize({ width, height: 650 });
          await settled();
          await end.focus();
          await waitForHit(end);
          expect(await hit(end)).toBe(true);
          await page.setViewportSize({ width, height: 800 });
          await settled();
          await first.focus();
          await waitForHit(first);
          expect(await hit(first)).toBe(true);
          await page
            .getByRole("button", { name: "Back to navigation", exact: true })
            .click();
          await page.waitForFunction(
            () =>
              !document
                .querySelector(".console-layout")
                ?.getAttribute("style")
                ?.includes("--console-dock-")
          );
        }
      }
    }
    await page.getByRole("button", { name: "Test Agent", exact: true }).click();
    await page.getByRole("region", { name: "Plugin conversation" }).waitFor();
    await settled();
    await page.evaluate(() => window.shellFixture.allowDock(false));
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".console-layout")
          ?.getAttribute("style")
          ?.includes("--console-dock-")
    );
    await end.focus();
    await waitForHit(end);
    expect(await hit(end)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
  }
}, 60_000);

// A single admitted view cannot reveal clipping of explicitly ordered leading
// entries, which the navigation-only directory cannot recover.
test("keeps admitted Dock views reachable through bounded overflow on coarse screens", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    optimizeDeps: { include: ["@lenso/ui", "@lenso/ui/**", "liquid-gooey"] },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Keep this fixture's physical hit proof beside its overflow scenarios.
  const hit = (control: Locator) =>
    control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        element.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          )
        )
      );
    });
  try {
    for (const count of [8, 32]) {
      for (const position of ["bottom", "top", "left", "right"] as const) {
        await page.setViewportSize({
          width: 390,
          height: position === "left" || position === "right" ? 400 : 844,
        });
        await page.goto(
          `${server.resolvedUrls!.local[0]}test/browser/index.html?dock&many-dock&dock-count=${count}`
        );
        await page.evaluate(
          (placement) =>
            window.shellFixture.seedPreferences({
              mode: "dock",
              position: placement,
              pinned: [],
            }),
          position
        );
        const moreViews = page.getByRole("button", {
          name: "More Dock views",
          exact: true,
        });
        const expand = page.getByRole("button", {
          name: "Expand Dock",
          exact: true,
        });
        await moreViews.waitFor();
        await page.waitForFunction(
          () =>
            document.querySelector<HTMLElement>("[data-dashboard-dock]")
              ?.dataset.geometryReady === "true"
        );
        expect(
          await page.evaluate(() => matchMedia("(pointer: coarse)").matches)
        ).toBe(true);
        const entries = page
          .getByRole("group", { name: "Dock views", exact: true })
          .getByRole("button");
        const entryNames = await entries.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-label")!)
        );
        const visibleNames = entryNames.filter(
          (name) => name !== "More Dock views"
        );
        for (const control of [...(await entries.all()), expand]) {
          expect(await hit(control)).toBe(true);
        }
        expect(
          await page
            .getByRole("navigation", { name: "Pinned navigation" })
            .evaluate(
              (element) => element.scrollWidth <= element.clientWidth + 1
            )
        ).toBe(true);
        await moreViews.click();
        const menu = page.getByRole("menu", {
          name: "More Dock views",
          exact: true,
        });
        const options = menu.getByRole("menuitem");
        await options.first().waitFor();
        expect([...visibleNames, ...(await options.allTextContents())]).toEqual(
          Array.from({ length: count }, (_, index) =>
            index ? `Test Agent ${index + 1}` : "Test Agent"
          )
        );
        await options.first().focus();
        await page.keyboard.press("End");
        expect(await hit(options.last())).toBe(true);
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
        expect(
          await moreViews.evaluate(
            (element) => document.activeElement === element
          )
        ).toBe(true);
        await moreViews.click();
        if (position === "left" || position === "top") {
          await options.first().focus();
          await page.keyboard.press("End");
          await page.keyboard.press("Enter");
        } else {
          await options.last().click();
        }
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute("aria-label") ===
            "Plugin draft"
        );
        await page
          .getByRole("button", { name: "Back to navigation", exact: true })
          .click();
        await moreViews.waitFor();
        await page.waitForFunction(
          (element) => document.activeElement === element,
          await moreViews.elementHandle()
        );
        expect(
          await moreViews.evaluate(
            (element) => document.activeElement === element
          )
        ).toBe(true);
        await expand.click();
        await page
          .getByRole("dialog", { name: "Console navigation", exact: true })
          .waitFor();
      }
    }
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "More Dock views", exact: true })
      .click();
    const retiredOption = await page
      .getByRole("menuitem", { name: "Test Agent 32", exact: true })
      .elementHandle();
    const mountsBeforeRevocation = await page.evaluate(
      () => window.shellFixture.snapshot().composerMounts
    );
    await page.evaluate(() => window.shellFixture.allowDock(false));
    await page
      .getByRole("button", { name: "More Dock views", exact: true })
      .waitFor({ state: "hidden" });
    await retiredOption!.evaluate((element) =>
      (element as HTMLElement).click()
    );
    expect(
      await page.evaluate(() => window.shellFixture.snapshot().composerMounts)
    ).toBe(mountsBeforeRevocation);
    expect(
      await page.getByRole("textbox", { name: "Plugin draft" }).count()
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
  }
}, 60_000);
