import assert from "node:assert/strict";

import { chromium } from "playwright";

// Draft/store tests cannot catch RGL's pixel refs being hidden behind its memo
// while rounded grid coordinates remain unchanged during a real held pointer.
const origin = process.env.COMPOSED_PREVIEW_URL ?? "http://127.0.0.1:5177";
const browser = await chromium.launch({ headless: true });
const diagnostics = [];

try {
  const page = await browser.newPage({
    viewport: { height: 776, width: 1512 },
  });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  page.on("requestfailed", (request) =>
    diagnostics.push(`requestfailed: ${request.url()}`)
  );
  await page.goto(origin);
  await page
    .getByRole("button", { exact: true, name: "Edit dashboard" })
    .click();
  const handle = page.locator("[data-dashboard-drag]").first();
  await handle.waitFor();
  const card = handle.locator(
    "xpath=ancestor::*[contains(@class, 'react-grid-item')]"
  );
  await page.evaluate(() => {
    const dragHandle = document.querySelector("[data-dashboard-drag]");
    const gridCard = dragHandle.closest(".react-grid-item");
    window.dashboardPointerIdentity = {
      card: gridCard,
      // The section is owned by the renderer, not the grid wrapper.
      renderer: gridCard.querySelector("section"),
    };
  });
  const settle = () =>
    page.evaluate(
      () =>
        // oxlint-disable-next-line promise/avoid-new -- Synchronize the proof with actual browser paint callbacks.
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        })
    );
  const box = await handle.boundingBox();
  assert.ok(box, "Drag handle is visible");
  const start = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 12,
    box.y + box.height / 2 + 12
  );
  await settle();
  const held = await card.boundingBox();
  await page.mouse.move(
    box.x + box.width / 2 + 20,
    box.y + box.height / 2 + 20
  );
  await settle();
  const heldAgain = await card.boundingBox();
  // Measure before release: stop snapping can conceal a frozen held transform.
  console.log("Held drag geometry", { held, heldAgain, start });
  assert.ok(
    Math.abs(held.x - start.x - 12) < 2,
    "Held drag follows 12px within one column"
  );
  assert.ok(
    Math.abs(held.y - start.y - 12) < 2,
    "Held drag follows 12px within one row"
  );
  assert.ok(
    Math.abs(heldAgain.x - start.x - 20) < 2,
    "Second same-cell move follows pointer"
  );
  await page.mouse.up();
  await settle();
  // A drag handle may also select settings on click in older UI revisions.
  if (await page.getByRole("dialog").isVisible()) {
    await page.keyboard.press("Escape");
  }
  // Release deliberately snaps back to the cell with RGL's CSS transition.
  // Wait for its real settled geometry before beginning another gesture.
  await page.waitForFunction(({ x, y }) => {
    const rect = document
      .querySelector("[data-dashboard-drag]")
      .closest(".react-grid-item")
      .getBoundingClientRect();
    return Math.abs(rect.x - x) < 0.1 && Math.abs(rect.y - y) < 0.1;
  }, start);
  const resize = card.locator(".react-resizable-handle-se");
  const resizeBox = await resize.boundingBox();
  assert.ok(resizeBox, "Resize handle is visible");
  const beforeResize = await card.boundingBox();
  await page.mouse.move(
    resizeBox.x + resizeBox.width / 2,
    resizeBox.y + resizeBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    resizeBox.x + resizeBox.width / 2 + 12,
    resizeBox.y + resizeBox.height / 2 + 12
  );
  await settle();
  const heldResize = await card.boundingBox();
  console.log("Held resize geometry", { beforeResize, heldResize });
  assert.ok(
    Math.abs(heldResize.width - beforeResize.width - 12) < 2,
    "Held resize follows width within one column"
  );
  assert.ok(
    Math.abs(heldResize.height - beforeResize.height - 12) < 2,
    "Held resize follows height within one row"
  );
  await page.mouse.move(
    resizeBox.x + resizeBox.width / 2 + 20,
    resizeBox.y + resizeBox.height / 2 + 20
  );
  await settle();
  const heldResizeAgain = await card.boundingBox();
  assert.ok(
    Math.abs(heldResizeAgain.width - beforeResize.width - 20) < 2 &&
      Math.abs(heldResizeAgain.height - beforeResize.height - 20) < 2,
    "Second same-cell resize follows pointer"
  );
  await page.mouse.up();
  await settle();
  const waitRect = (expected) =>
    page.waitForFunction((targetRect) => {
      const rect = window.dashboardPointerIdentity.card.getBoundingClientRect();
      return Object.entries(targetRect).every(
        ([field, value]) => Math.abs(rect[field] - value) < 0.1
      );
    }, expected);
  await waitRect({ height: start.height, width: start.width });
  const layoutOptions = page.getByRole("button", {
    exact: true,
    name: "Dashboard layout options",
  });
  if (await layoutOptions.count()) {
    await layoutOptions.click();
  }
  assert.equal(
    await page
      .getByRole("button", { exact: true, name: "Undo layout" })
      .isEnabled(),
    false,
    "Same-cell releases leave canonical layout unchanged"
  );
  if (await layoutOptions.count()) {
    await page.keyboard.press("Escape");
  }

  // Cross a real cell, then save: child invalidation must not reseed RGL's
  // internal layout from the still-unchanged draft during a held gesture.
  const column = (start.width + 12) / 4;
  const row = 64 + 12;
  const crossHandle = await handle.boundingBox();
  await page.mouse.move(
    crossHandle.x + crossHandle.width / 2,
    crossHandle.y + crossHandle.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    crossHandle.x + crossHandle.width / 2 + column,
    crossHandle.y + crossHandle.height / 2 + row
  );
  await settle();
  await page.mouse.up();
  await waitRect({ x: start.x + column, y: start.y + row });
  if (await page.getByRole("dialog").isVisible()) {
    await page.keyboard.press("Escape");
  }
  const crossResize = await resize.boundingBox();
  await page.mouse.move(
    crossResize.x + crossResize.width / 2,
    crossResize.y + crossResize.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    crossResize.x + crossResize.width / 2 + column,
    crossResize.y + crossResize.height / 2 + row
  );
  await settle();
  await page.mouse.up();
  const committed = {
    height: start.height + row,
    width: start.width + column,
    x: start.x + column,
    y: start.y + row,
  };
  await waitRect(committed);
  await page
    .getByRole("button", { exact: true, name: "Done editing dashboard" })
    .click();
  await page
    .getByRole("button", { exact: true, name: "Edit dashboard" })
    .click();
  await handle.waitFor();
  await waitRect(committed);
  assert.ok(
    await page.evaluate(() => {
      const identity = window.dashboardPointerIdentity;
      return (
        identity.card ===
          document
            .querySelector("[data-dashboard-drag]")
            .closest(".react-grid-item") &&
        identity.renderer === identity.card.querySelector("section") &&
        identity.renderer.isConnected
      );
    }),
    "Grid and renderer DOM retain identity through drag and resize"
  );
  assert.deepEqual(diagnostics, [], "No failed requests or page errors");
  console.log(
    "Dashboard pointer PASS: same-cell drag/resize track pixels without changing canonical layout; cross-cell drag/resize survive save; renderer identity retained; zero failed requests/page errors."
  );
} finally {
  await browser.close();
}
