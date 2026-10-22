import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";

import { chromium, type Locator } from "playwright";
import { createServer } from "vite";

const visibleControl = async (locator: Locator) => {
  await locator.scrollIntoViewIfNeeded();
  expect(
    await locator.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.x >= 0 &&
        r.right <= innerWidth &&
        r.y >= 0 &&
        r.bottom <= innerHeight &&
        element.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        )
      );
    })
  ).toBe(true);
};

// Existing Tasks browser coverage does not mount the new Scheduler/Audit controls.
// Keep the fixture's exact host/port; a bind failure is a failure, never a fallback.
test("operations controls preserve revisions, uncertain writes and retired audit views", async () => {
  const directory = "/tmp/lenso-operations-proof";
  const server = await createServer({
    configLoader: "native",
    configFile: new URL(
      "../../../examples/composed-console/operations-fixture/vite.config.ts",
      import.meta.url
    ).pathname,
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  let releaseLate: (() => void) | undefined;
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
    });
    page.setDefaultTimeout(15000);
    const consoleMessages: string[] = [],
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleMessages.push(message.text());
      }
    });
    const origin = "http://127.0.0.1:18462";
    const control = async (action: string) => {
      const response = await page.request.post(`${origin}/fixture-api`, {
        data: { control: action },
      });
      expect(response.ok()).toBe(true);
      return response.json() as Promise<{ writes: string[] }>;
    };
    const statusWrites = async () => {
      const state = await control("status");
      return state.writes;
    };
    await mkdir(directory, { recursive: true });
    await page.goto(origin);
    expect(new URL(page.url()).origin).toBe(origin);
    expect(await page.title()).toMatch(/operations/i);
    await page.getByRole("main", { name: "Tasks", exact: true }).waitFor();
    const schedules = page.getByRole("region", {
      name: "Schedules",
      exact: true,
    });
    await schedules
      .getByRole("button", { name: "Pause schedule", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Confirm pause schedule", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    expect(
      await schedules
        .getByRole("button", { name: "Pause schedule", exact: true })
        .evaluate((element) => element === document.activeElement)
    ).toBe(true);
    await schedules
      .getByRole("button", { name: "Pause schedule", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm schedule change", exact: true })
      .dblclick();
    await page
      .getByText(
        "Schedule change confirmed. Already accepted jobs keep their own status.",
        { exact: true }
      )
      .waitFor();
    expect(await statusWrites()).toEqual(["pause"]);
    await page.screenshot({
      path: `${directory}/schedules-desktop.png`,
      animations: "disabled",
    });
    await control("lose-ack");
    await schedules
      .getByRole("button", { name: "Resume schedule", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm schedule change", exact: true })
      .click();
    await page
      .getByText(
        "Change unconfirmed. Check schedule status before trying another action. The request may have committed.",
        { exact: true }
      )
      .waitFor();
    expect(
      await schedules
        .getByRole("button", { name: "Resume schedule", exact: true })
        .isDisabled()
    ).toBe(true);
    expect(await statusWrites()).toEqual(["pause", "resume"]);
    await schedules
      .getByRole("button", { name: "Check schedule status", exact: true })
      .click();
    await page
      .getByText(
        "Current schedule status checked. Review its revision before another action.",
        { exact: true }
      )
      .waitFor();
    expect(await statusWrites()).toEqual(["pause", "resume"]);
    await page
      .getByRole("button", { name: "Fixture theme", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await schedules
      .getByRole("button", { name: "Pause schedule", exact: true })
      .click();
    const scheduleDialog = page.getByRole("dialog", {
      name: "Confirm pause schedule",
      exact: true,
    });
    await scheduleDialog.waitFor();
    await visibleControl(
      scheduleDialog.getByRole("button", {
        name: "Confirm schedule change",
        exact: true,
      })
    );
    await page.screenshot({
      path: `${directory}/schedules-dark-narrow.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await scheduleDialog.waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 1200, height: 900 });
    await page
      .getByRole("button", { name: "Fixture audit", exact: true })
      .click();
    const audit = page.getByRole("main", { name: "Audit", exact: true });
    await audit
      .getByRole("button", { name: "View audit record", exact: true })
      .first()
      .waitFor();
    expect(
      await audit
        .getByRole("button", { name: "View audit record", exact: true })
        .count()
    ).toBe(50);
    await audit.getByLabel("Target type", { exact: true }).fill("report");
    await audit
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await audit
      .getByRole("alert")
      .getByText("Provide both target type and target ID.", { exact: true })
      .waitFor();
    await audit.getByLabel("Target ID", { exact: true }).fill("local");
    await audit.getByLabel("Action", { exact: true }).fill("absent");
    await audit
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await audit.getByText("No audit records match.", { exact: true }).waitFor();
    await audit.getByLabel("Action", { exact: true }).fill("fixture.report");
    await audit
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await audit.getByRole("button", { name: "Next page", exact: true }).click();
    await audit
      .getByRole("button", { name: "First page", exact: true })
      .waitFor();
    expect(
      await audit
        .getByRole("button", { name: "View audit record", exact: true })
        .count()
    ).toBe(2);
    await audit
      .getByRole("button", { name: "First page", exact: true })
      .click();
    await audit
      .getByRole("button", { name: "Next page", exact: true })
      .waitFor();
    await audit
      .getByRole("button", { name: "View audit record", exact: true })
      .first()
      .click();
    const detail = page.getByRole("dialog", {
      name: "Audit record",
      exact: true,
    });
    await detail
      .getByRole("button", { name: "View related record", exact: true })
      .click();
    await detail
      .getByText("fixture.report · intent", { exact: true })
      .waitFor();
    await page.screenshot({
      path: `${directory}/audit-related-desktop.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await detail.waitFor({ state: "hidden" });
    expect(
      await audit
        .getByRole("button", { name: "View audit record", exact: true })
        .first()
        .evaluate((element) => element === document.activeElement)
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await audit
      .getByRole("button", { name: "View audit record", exact: true })
      .first()
      .click();
    await detail
      .getByRole("button", { name: "View related record", exact: true })
      .waitFor();
    await visibleControl(
      detail.getByRole("button", { name: "Close", exact: true })
    );
    await page.screenshot({
      path: `${directory}/audit-dark-narrow.png`,
      animations: "disabled",
    });
    await control("revoke");
    await detail
      .getByRole("button", { name: "View related record", exact: true })
      .click();
    await detail
      .getByText("Record unavailable. Access may have changed.", {
        exact: true,
      })
      .waitFor();
    expect(
      await detail.getByText("Reason: fixture", { exact: true }).count()
    ).toBe(0);
    await page.keyboard.press("Escape");
    await audit
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await audit
      .getByText(
        "Audit records unavailable. Check access or try the filters again.",
        { exact: true }
      )
      .waitFor();
    expect(
      await audit
        .getByRole("button", { name: "View audit record", exact: true })
        .count()
    ).toBe(0);
    await control("restore");
    await audit
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await audit
      .getByRole("button", { name: "View audit record", exact: true })
      .first()
      .waitFor();
    let entered!: () => void, settled!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseLate = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      settled = resolve;
    });
    await page.route("**/fixture-api", async (route) => {
      const body = route.request().postDataJSON();
      if (body.service !== "fixture.audit-page" || body.method !== "get") {
        return route.continue();
      }
      try {
        const response = await route.fetch();
        entered();
        await released;
        await route.fulfill({ response });
      } catch {
        // Retiring the real request may abort delivery; it must not remount detail.
      } finally {
        settled();
      }
    });
    await audit
      .getByRole("button", { name: "View audit record", exact: true })
      .first()
      .click();
    await started;
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Fixture schedules", exact: true })
      .click();
    releaseLate!();
    await finished;
    await page.getByRole("main", { name: "Tasks", exact: true }).waitFor();
    expect(
      await page
        .getByRole("dialog", { name: "Audit record", exact: true })
        .count()
    ).toBe(0);
    expect(await page.locator("vite-error-overlay").count()).toBe(0);
    expect(errors).toEqual([]);
    const unexpected = consoleMessages.filter(
      (message) =>
        !/status of 403|403 \(Forbidden\)|net::ERR_ABORTED/.test(message)
    );
    expect(unexpected).toEqual([]);
    await writeFile(
      `${directory}/receipt.json`,
      JSON.stringify(
        {
          source: process.env.GITHUB_SHA,
          url: origin,
          viewports: [
            [1200, 900],
            [390, 844],
          ],
          browser: "repository-pinned Playwright Chromium",
          passed: true,
          scheduleWrites: await statusWrites(),
          expectedNegativeConsole: consoleMessages,
          pageErrors: errors,
          proof: [
            "double-click one write",
            "lost acknowledgement read-only reconciliation",
            "modal focus and visible geometry",
            "audit filters/pagination/related record",
            "fresh denial clears detail/list",
            "late real response after retirement discarded",
          ],
          realUserData: false,
        },
        null,
        2
      )
    );
  } finally {
    releaseLate?.();
    await browser.close();
    await server.close();
  }
}, 120000);
