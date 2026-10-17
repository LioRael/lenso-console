import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";

import { chromium } from "playwright";
import { createServer } from "vite";

// Real-browser proof for Modal focus, confirmation, repeated submit, feedback and narrow geometry.
test("task UI confirmation, recovery, focus and narrow layout", async () => {
  const server = await createServer({
    configFile: false,
    root: import.meta.dirname,
    server: { host: "127.0.0.1", port: 18442, strictPort: true },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 850 },
    });
    const url = server.resolvedUrls!.local[0]!;
    page.setDefaultTimeout(8000);
    await page.goto(`${url}?read-error`);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("button", { name: "View task" }).click();
    await page.getByRole("button", { name: "Retry task", exact: true }).click();
    expect(
      await page.evaluate(() => (window as Window & { writes: number }).writes)
    ).toBe(0);
    await page.getByRole("button", { name: "Confirm retry" }).dblclick();
    await page
      .getByText("Retry accepted. Execution has not yet completed.")
      .waitFor();
    expect(
      await page.evaluate(() => (window as Window & { writes: number }).writes)
    ).toBe(1);
    await page
      .getByRole("button", { name: "Cancel task", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm cancel" }).click();
    await page
      .getByText("Cancellation requested. Running work may still finish.")
      .waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).waitFor();
    await page
      .getByText("Submitting…", { exact: true })
      .waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    expect(
      await page
        .getByRole("button", { name: "View task" })
        .evaluate((el) => el === document.activeElement)
    ).toBe(true);
    await page.goto(`${url}?write-error&dark`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "View task" }).click();
    await page.getByRole("button", { name: "Retry task", exact: true }).click();
    await page.getByRole("button", { name: "Confirm retry" }).click();
    await page.getByRole("button", { name: "Check status" }).waitFor();
    await page.getByRole("button", { name: "Check status" }).click();
    await page.getByRole("button", { name: "Retry task", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await mkdir("output/playwright", { recursive: true });
    await page.screenshot({ path: "output/playwright/tasks-narrow-dark.png" });
    await page.setViewportSize({ width: 1100, height: 850 });
    await page.screenshot({ path: "output/playwright/tasks-confirmation.png" });
    await page.goto(`${url}?empty`);
    await page.getByText("No tasks on this page.").waitFor();
  } finally {
    await browser.close();
    await server.close();
  }
}, 60_000);
