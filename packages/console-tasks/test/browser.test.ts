import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";

import { chromium } from "playwright";
import { createServer } from "vite";

import { managedQueue } from "./managed-queue";

// A fake transport cannot detect incorrect Manage binding or a lost acknowledgement
// after a durable retry. Exercise the actual application composition and queue instead.
for (const fault of ["read", "acknowledgement"] as const) {
  test(`managed task UI recovers from ${fault} failure`, async () => {
    const backend = await managedQueue(fault);
    const server = await createServer({
      configFile: new URL("vite.config.ts", import.meta.url).pathname,
      server: {
        port: 0,
        strictPort: false,
        proxy: { "/task-api": backend.server.url.href },
      },
    });
    await server.listen();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1100, height: 850 },
      });
      page.setDefaultTimeout(10000);
      await page.goto(
        `${server.resolvedUrls!.local[0]}${fault === "acknowledgement" ? "?dark" : ""}`
      );
      if (fault === "read") {
        await page
          .getByRole("button", { name: "Try again", exact: true })
          .click();
      }
      await page.getByRole("button", { name: "View task" }).click();
      expect(await page.getByText(backend.denied).count()).toBe(0);
      await page
        .getByRole("button", { name: "Retry task", exact: true })
        .click();
      expect(backend.writes).toEqual([]);
      await page.getByRole("button", { name: "Confirm retry" }).dblclick();
      if (fault === "acknowledgement") {
        await page.getByRole("button", { name: "Check status" }).click();
        await page
          .getByRole("button", { name: "Cancel task", exact: true })
          .waitFor();
        expect(
          await page
            .getByRole("button", { name: "Retry task", exact: true })
            .count()
        ).toBe(0);
      } else {
        await page
          .getByText("Retry accepted. Execution has not yet completed.")
          .waitFor();
      }
      expect(backend.writes).toEqual(["retry"]);
      const retried = await backend.queue.get(backend.owned);
      expect(retried?.state).toBe("pending");
      await page.getByText("Not provided by the queue API").waitFor();
      await page
        .getByRole("button", { name: "Cancel task", exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      const dialog = page.getByRole("dialog");
      await page.waitForFunction(() => {
        const r = document
          .querySelector('[role="dialog"]')!
          .getBoundingClientRect();
        return r.x >= 0 && r.right <= innerWidth;
      });
      const bounds = await dialog.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      await mkdir("/tmp/lenso-tasks-proof", { recursive: true });
      await page.screenshot({
        path: `/tmp/lenso-tasks-proof/tasks-${fault}-narrow.png`,
      });
      await page.getByRole("button", { name: "Confirm cancel" }).click();
      await page.getByText("Task cancelled.", { exact: true }).waitFor();
      expect(backend.writes).toEqual(["retry", "cancel"]);
      const cancelled = await backend.queue.get(backend.owned);
      expect(cancelled?.state).toBe("cancelled");
      await page
        .getByText("Submitting…", { exact: true })
        .waitFor({ state: "hidden" });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      expect(
        await page
          .getByRole("button", { name: "View task" })
          .evaluate((el) => el === document.activeElement)
      ).toBe(true);
      backend.revoke();
      await page.getByRole("button", { name: "View task" }).click();
      await page.getByRole("button", { name: "Check status" }).waitFor();
      expect(backend.writes).toEqual(["retry", "cancel"]);
    } finally {
      await browser.close();
      await server.close();
      await backend.close();
    }
  }, 60000);
}

// Existing retry coverage never completes a long handler or destroys browser memory.
test("long task survives offline, reload and reauthentication", async () => {
  const backend = await managedQueue("long");
  const server = await createServer({
    configFile: new URL("vite.config.ts", import.meta.url).pathname,
    server: {
      port: 0,
      strictPort: false,
      proxy: { "/task-api": backend.server.url.href },
    },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 850 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(15000);
    const url = server.resolvedUrls!.local[0]!;
    await page.goto(url);
    expect(page.url()).toBe(url);
    await page.getByRole("main", { name: "Tasks" }).waitFor();
    await page.getByRole("button", { name: "View task" }).click();
    await page.getByText("Status: running", { exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "View task" }).click();
    await page.getByText("Status: running", { exact: true }).waitFor();
    await context.setOffline(true);
    await page.getByText("Status is unconfirmed.", { exact: false }).waitFor();
    expect(
      await page
        .getByRole("button", { name: "Cancel task", exact: true })
        .isDisabled()
    ).toBe(true);
    await backend.finish();
    const completed = await backend.queue.get(backend.owned);
    expect(completed?.state).toBe("succeeded");
    await mkdir("/tmp/lenso-tasks-proof", { recursive: true });
    await page.screenshot({
      path: "/tmp/lenso-tasks-proof/offline.png",
      animations: "disabled",
    });
    await context.setOffline(false);
    await page.getByText("Status: succeeded", { exact: true }).waitFor();
    await page
      .getByRole("region", { name: "Task result" })
      .getByText("Report ready: 42 rows", { exact: true })
      .waitFor();
    expect(
      await page.getByText("private result", { exact: false }).count()
    ).toBe(0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    backend.revoke();
    await page.getByRole("button", { name: "Fixture sign out" }).click();
    expect(await page.getByRole("main", { name: "Tasks" }).count()).toBe(0);
    backend.reauthenticate();
    await page.getByRole("button", { name: "Fixture sign in" }).click();
    await page.getByRole("button", { name: "View task" }).click();
    await page.getByText("Report ready: 42 rows", { exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "View task" }).click();
    await page.getByText("Report ready: 42 rows", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const r = document
        .querySelector('[role="dialog"]')!
        .getBoundingClientRect();
      return r.x >= 0 && r.right <= innerWidth;
    });
    const close = page.getByRole("button", { name: "Close", exact: true });
    await close.focus();
    expect(
      await close.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        );
      })
    ).toBe(true);
    await page.screenshot({
      path: "/tmp/lenso-tasks-proof/recovered-result.png",
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    expect(
      await page
        .getByRole("button", { name: "View task" })
        .evaluate((el) => el === document.activeElement)
    ).toBe(true);
    expect(await page.locator("vite-error-overlay").count()).toBe(0);
    expect(errors).toEqual([]);
    expect(backend.writes).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    await backend.close();
  }
}, 60000);
