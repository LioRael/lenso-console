import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";

import { chromium } from "playwright";

const gone = (locator) => locator.waitFor({ state: "hidden" });
const startHost = async () => {
  const child = spawn("bun", ["packages/console/test/browser-host.ts"], {
    cwd: path.resolve("."),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics += chunk;
  });
  const lines = createInterface({
    input: child.stdout,
    signal: AbortSignal.timeout(20_000),
  });
  const stop = async () => {
    lines.close();
    if (child.exitCode !== null) {
      return;
    }
    child.stdin.end();
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      await once(child, "exit");
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    for await (const line of lines) {
      const message = JSON.parse(line);
      if (message.origin) {
        return { origin: message.origin, stop };
      }
    }
    throw new Error(`Fixture did not become ready\n${diagnostics}`);
  } catch (error) {
    await stop();
    throw error;
  }
};

// Service tests cannot catch Shell/outlet loading, real browser credential handling,
// stale-content disclosure or controls that are occluded at narrow widths.
test(
  "actual Shell management pages use authenticated real services",
  { timeout: 180_000 },
  async (t) => {
    const host = await startHost();
    let browser;
    const screenshots = process.env.DELTA_SCRATCH_DIR;
    const errors = [];
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        locale: "en-US",
        timezoneId: "UTC",
        viewport: { height: 800, width: 1280 },
      });
      await context.route(`${host.origin}/**`, (route) =>
        route.continue({
          headers: {
            ...route.request().headers(),
            authorization: "Bearer fixture",
          },
        })
      );
      await context.addInitScript(() => {
        if (!localStorage.getItem("lenso-console:theme-preference")) {
          localStorage.setItem(
            "lenso-console:theme-preference",
            JSON.stringify("light")
          );
        }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      page.on("pageerror", (error) => errors.push(error.message));
      const button = (name) => page.getByRole("button", { exact: true, name });
      const visible = async (locator) => {
        try {
          await locator.waitFor({ state: "visible" });
        } catch (error) {
          const body = await page.evaluate(() => {
            const copy = document.body.cloneNode(true);
            for (const element of copy.querySelectorAll("pre")) {
              element.textContent = "[omitted]";
            }
            return copy.textContent;
          });
          t.diagnostic(
            `page=${page.url()} errors=${JSON.stringify(errors)} body=${body}`
          );
          throw error;
        }
      };
      const state = async (input) => {
        const response = await fetch(`${host.origin}/__fixture/state`, {
          headers: {
            authorization: "Bearer fixture",
            ...(input ? { "content-type": "application/json" } : {}),
          },
          ...(input ? { body: JSON.stringify(input), method: "POST" } : {}),
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(response.status, 200);
        return response.json();
      };
      const ids = await state();
      const waitSchedule = (field, expected) =>
        page.waitForFunction(
          async ({ name, value }) => {
            const response = await fetch("/__fixture/state");
            const snapshot = await response.json();
            return snapshot.schedules[0]?.[name] === value;
          },
          { name: field, value: expected }
        );
      const visit = async (route, title) => {
        await page.goto(host.origin + route);
        try {
          await visible(
            page.getByRole("heading", { exact: true, level: 1, name: title })
          );
        } catch (error) {
          t.diagnostic(
            `route=${page.url()} browser-errors=${JSON.stringify(errors)} body=${await page.locator("body").textContent()}`
          );
          if (screenshots) {
            await page.screenshot({
              fullPage: true,
              path: path.join(screenshots, "management-load-failure.png"),
            });
          }
          throw error;
        }
      };
      const geometry = async (route, title) => {
        for (const [viewport, theme] of [
          [{ height: 800, width: 1280 }, "light"],
          [{ height: 844, width: 390 }, "dark"],
        ]) {
          await page.setViewportSize(viewport);
          await page.evaluate(
            (value) =>
              localStorage.setItem(
                "lenso-console:theme-preference",
                JSON.stringify(value)
              ),
            theme
          );
          await visit(route, title);
          await page.waitForFunction(
            (value) => document.documentElement.dataset.theme === value,
            theme
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            ),
            true,
            `${route}: page overflow`
          );
          const refresh = page
            .getByRole("button", {
              exact: true,
              name: route === "/audit" ? "Refresh events" : "Refresh",
            })
            .first();
          await refresh.scrollIntoViewIfNeeded();
          await refresh.focus();
          assert.equal(
            await refresh.evaluate(
              (element) => element === document.activeElement
            ),
            true
          );
          assert.equal(
            await refresh.evaluate((element) => {
              const style = getComputedStyle(element);
              return (
                (style.outlineStyle !== "none" &&
                  Number(style.outlineWidth.replace("px", "")) > 0) ||
                style.boxShadow !== "none"
              );
            }),
            true,
            `${route}: visible keyboard focus`
          );
          const box = await refresh.boundingBox();
          assert.ok(
            box && box.width >= 44 && box.height >= 44,
            `${route}: minimum target`
          );
          assert.equal(
            await refresh.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              const hit = document.elementFromPoint(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2
              );
              return hit === element || element.contains(hit);
            }),
            true,
            `${route}: unoccluded target`
          );
          await refresh.press("Enter");
          await refresh.hover();
          await gone(page.getByText("Loading records…", { exact: true }));
          if (screenshots) {
            await fs.mkdir(screenshots, { recursive: true });
            await page.screenshot({
              fullPage: true,
              path: path.join(
                screenshots,
                `management-${route.slice(1)}-${viewport.width}-${theme}.png`
              ),
            });
          }
          t.diagnostic(
            `${route} ${viewport.width}x${viewport.height} ${theme}: real Auth → SDK v2 → Manage → service; focus/target/overflow`
          );
        }
        await page.setViewportSize({ height: 800, width: 1280 });
      };

      await visit("/audit", "Audit");
      await visible(button(`View event ${ids.eventId}`));
      await page.getByLabel("Action", { exact: true }).fill("no-such-action");
      await button("Apply filters").click();
      await visible(
        page.getByText("No events match these filters.", { exact: false })
      );
      await button("Clear filters").click();
      await button(`View event ${ids.eventId}`).click();
      await visible(page.getByRole("region", { name: "Event details" }));
      await state({ denied: true });
      await button("Refresh events").click();
      await gone(button(`View event ${ids.eventId}`));
      assert.equal(
        await page.getByText("fixture-report", { exact: false }).count(),
        0
      );
      await state({ denied: false });
      await geometry("/audit", "Audit");

      await visit("/api-keys", "API keys");
      await button("Issue key").click();
      await page
        .getByLabel("Requested scopes (comma or space separated)", {
          exact: true,
        })
        .fill("production:write");
      const expiry = new Date(Date.now() + 3_600_000)
        .toISOString()
        .slice(0, 16);
      await page
        .getByLabel("Expiry (local time)", { exact: true })
        .fill(expiry);
      await page
        .getByRole("dialog")
        .getByRole("button", { exact: true, name: "Issue key" })
        .click();
      await visible(
        page
          .getByRole("dialog")
          .getByText("Your current identity cannot perform this operation.", {
            exact: true,
          })
      );
      await page.keyboard.press("Escape");
      await gone(page.getByRole("dialog"));
      await button("Issue key").click();
      await page
        .getByLabel("Requested scopes (comma or space separated)", {
          exact: true,
        })
        .fill("fixture:read");
      await page
        .getByRole("dialog")
        .getByRole("button", { exact: true, name: "Issue key" })
        .click();
      const oneTime = page.getByRole("region", {
        exact: true,
        name: "One-time credential",
      });
      await visible(oneTime);
      const secret = await oneTime.locator("pre").textContent();
      assert.ok(secret && secret.length > 20);
      const persisted = await page.evaluate(() => ({
        history: JSON.stringify(history.state),
        storage: JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }),
        url: location.href,
      }));
      for (const value of Object.values(persisted)) {
        assert.equal(value.includes(secret), false);
      }
      await button("Dismiss credential").click();
      await gone(oneTime);
      await button("Details").click();
      await button("Rotate key").click();
      await button("Confirm rotation").click();
      await visible(oneTime);
      assert.notEqual(await oneTime.locator("pre").textContent(), secret);
      await button("Dismiss credential").click();
      await button("Revoke key").click();
      await button("Confirm revocation").click();
      await gone(page.getByRole("dialog"));
      await visible(page.getByText("Key revoked.", { exact: true }));
      await button("Close details").click();
      await page.reload();
      assert.equal(await page.getByText(secret, { exact: true }).count(), 0);
      await state({ writes: false });
      await page.reload();
      await gone(button("Issue key"));
      await state({ writes: true });
      await geometry("/api-keys", "API keys");

      await visit("/authorization", "Authorization");
      await visible(page.getByText("fixture-reader", { exact: true }).first());
      assert.equal(
        await page
          .getByRole("button", { name: /create|delete|save|grant|revoke/iu })
          .count(),
        0
      );
      await geometry("/authorization", "Authorization");

      await visit("/tasks", "Tasks");
      await visible(page.getByText(ids.jobId, { exact: true }));
      await button(`View job ${ids.jobId}`).click();
      const job = page.getByRole("region", {
        exact: true,
        name: "Job details",
      });
      await visible(job);
      await button("Retry job").click();
      await button("Confirm").click();
      await visible(page.getByRole("alert").first());
      const refusedRetry = await state();
      assert.equal(
        refusedRetry.jobState,
        "failed",
        "A failed safety check must not replay a job"
      );
      await state({ safeRetry: true });
      await button("Reload job").click();
      await button("Retry job").click();
      await button("Confirm").click();
      await page.waitForFunction(async () => {
        const response = await fetch("/__fixture/state");
        const snapshot = await response.json();
        return snapshot.jobState === "pending";
      });
      await button("Reload job").click();
      await button("Cancel job").click();
      await button("Confirm").click();
      await page.waitForFunction(async () => {
        const response = await fetch("/__fixture/state");
        const snapshot = await response.json();
        return snapshot.jobState === "cancelled";
      });
      await geometry("/tasks", "Tasks");

      await visit("/scheduler", "Scheduler");
      await button("Create schedule").click();
      const creation = page.getByRole("region", {
        exact: true,
        name: "Create schedule",
      });
      await creation
        .getByRole("combobox", { exact: true, name: "Registered task" })
        .click();
      await page
        .getByRole("option", { exact: true, name: "fixture.report" })
        .click();
      await creation
        .getByRole("combobox", { exact: true, name: "Rule type" })
        .click();
      await page.getByRole("option", { exact: true, name: "Cron" }).click();
      await creation
        .getByLabel("Cron expression", { exact: true })
        .fill("0 9 * * *");
      await creation
        .getByLabel("IANA time zone", { exact: true })
        .fill("Etc/UTC");
      await creation.getByLabel(/reportId/u).fill("fixture-report");
      await creation
        .getByRole("button", { exact: true, name: "Confirm creation" })
        .click();
      await visible(page.getByText("Schedule created.", { exact: true }));
      const created = await state();
      const scheduleId = created.schedules[0].id;
      await button(`View schedule ${scheduleId}`).click();
      await visible(
        page.getByRole("region", { exact: true, name: "Schedule details" })
      );
      await button("Pause").click();
      await button("Confirm").click();
      await waitSchedule("state", "paused");
      await button("Reload schedule").click();
      await button("Resume").click();
      await button("Confirm").click();
      await waitSchedule("state", "active");
      await button("Reload schedule").click();
      await state({ scheduleConflict: scheduleId });
      await button("Pause").click();
      await button("Confirm").click();
      await visible(page.getByRole("alert").first());
      const conflicted = await state();
      assert.equal(
        conflicted.schedules[0].revision,
        4,
        "Stale revision must not replace the external change"
      );
      await button("Reload schedule").click();
      await button("Resume").click();
      await button("Confirm").click();
      await waitSchedule("state", "active");
      await button("Reload schedule").click();
      await button("Trigger once").click();
      await waitSchedule("occurrenceCount", 1);
      await geometry("/scheduler", "Scheduler");
      assert.deepEqual(errors, [], "No uncaught browser errors");
    } finally {
      try {
        await browser?.close();
      } finally {
        await host.stop();
      }
    }
  }
);
