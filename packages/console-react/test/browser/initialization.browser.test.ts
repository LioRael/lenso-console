import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

// A settings-link test cannot expose duplicate claims, unknown commit outcomes,
// secret retirement on Drawer closure or a late response from a previous host.
test("first-run UI retains only non-secret drafts and resumes a confirmed revision", async () => {
  const applyStarted = Promise.withResolvers<undefined>();
  let applies = 0;
  let activations = 0;
  let reads = 0;
  let unavailable = false;
  let state = "uninitialized";
  let revision: string | null = null;
  let blockers: { code: string }[] = [];
  let release: (() => void) | undefined;
  let hold: Promise<void> | undefined;
  let unknown = true;
  const requestIds: string[] = [];
  const errors: string[] = [];
  const handleSetup = (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void
  ) => {
    const handle = async () => {
      const action = request.url?.split("/").at(-1);
      if (!request.url?.startsWith("/__test_initialization/")) {
        return next();
      }
      response.setHeader("content-type", "application/json");
      if (action === "status") {
        reads += 1;
      }
      if (unavailable) {
        response.statusCode = 503;
        response.end(JSON.stringify({ message: "SYNTHETIC_SECRET" }));
        return;
      }
      if (request.headers["x-test-instance"] === "second") {
        response.end(
          JSON.stringify({
            schemaVersion: 1,
            state: "blocked",
            revision: null,
            blockers: [{ code: "external-configuration-required" }],
            nextAction: "external_configuration",
          })
        );
        return;
      }
      if (action === "apply") {
        applies += 1;
        applyStarted.resolve(undefined);
        let body = "";
        for await (const chunk of request) {
          body += chunk;
        }
        requestIds.push(JSON.parse(body).requestId);
        state = "awaiting_activation";
        revision = "synthetic-revision-1";
        await hold;
        if (unknown) {
          response.statusCode = 500;
          response.end(
            JSON.stringify({
              code: "initialization-outcome-unknown",
              message: "SYNTHETIC_SECRET",
            })
          );
          return;
        }
      }
      if (action === "activate") {
        activations += 1;
        state = "ready";
        blockers = [];
      }
      response.end(
        JSON.stringify({
          schemaVersion: 1,
          state,
          revision,
          blockers,
          nextAction:
            state === "ready"
              ? "none"
              : state === "blocked"
                ? "external_configuration"
                : revision
                  ? "activate"
                  : "apply",
        })
      );
    };
    // oxlint-disable-next-line promise/no-callback-in-promise -- Connect needs explicit forwarding of this test handler's rejected promise.
    void handle().catch(next);
  };
  const server = await createServer({
    configFile: false,
    plugins: [
      {
        name: "test-initialization-host",
        configureServer(viteServer) {
          viteServer.middlewares.use(handleSetup);
        },
      },
    ],
    root: fileURLToPath(new URL("../..", import.meta.url)),
    optimizeDeps: { include: ["@lenso/ui", "@lenso/ui/**", "liquid-gooey"] },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    hasTouch: true,
  });
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(
      `${server.resolvedUrls!.local[0]}test/browser/initialization.html`
    );
    await page.getByRole("link", { name: /Application setup/ }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Not initialized" })
      .waitFor();
    const initialId = await page.evaluate(() =>
      window.initializationFixture.requestId()
    );
    await page.getByRole("button", { name: "Configure this instance" }).click();
    const drawer = page.getByRole("dialog", { name: "First-time setup" });
    const username = drawer.getByLabel("Owner name", { exact: true });
    const password = drawer.getByLabel("Owner password", { exact: true });
    const key = drawer.getByLabel("Provider key", { exact: true });
    await username.fill("synthetic-owner");
    await password.fill("synthetic-owner-password");
    await key.fill("synthetic-provider-key");
    await drawer.getByRole("button", { name: "Close setup" }).click();
    await drawer.waitFor({ state: "hidden" });
    const opener = page.getByRole("button", {
      name: "Configure this instance",
    });
    await page.waitForFunction(
      (element) => document.activeElement === element,
      await opener.elementHandle()
    );
    await opener.focus();
    await page.keyboard.press("Enter");
    expect(await username.inputValue()).toBe("synthetic-owner");
    expect(await password.inputValue()).toBe("");
    expect(await key.inputValue()).toBe("");
    expect(
      await page.evaluate(() => window.initializationFixture.requestId())
    ).toBe(initialId);
    if (process.env.LENSO_INITIALIZATION_SCREENSHOTS) {
      await mkdir(process.env.LENSO_INITIALIZATION_SCREENSHOTS, {
        recursive: true,
      });
      await page.screenshot({
        path: path.join(
          process.env.LENSO_INITIALIZATION_SCREENSHOTS,
          "setup-desktop.png"
        ),
        fullPage: true,
      });
    }
    await password.fill("synthetic-owner-password");
    await key.fill("synthetic-provider-key");
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await drawer.getByRole("form").evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
      (form as HTMLFormElement).requestSubmit();
    });
    await drawer
      .getByRole("status")
      .filter({ hasText: "Submitting setup" })
      .waitFor();
    await applyStarted.promise;
    expect(applies).toBe(1);
    expect(await password.count()).toBe(0);
    release!();
    await drawer
      .getByRole("alert")
      .filter({ hasText: "not confirmed" })
      .waitFor();
    expect(
      await drawer.getByRole("button", { name: "Create first owner" }).count()
    ).toBe(0);
    await drawer.getByRole("button", { name: "Check status" }).click();
    await drawer
      .getByRole("status")
      .filter({ hasText: "Awaiting activation" })
      .waitFor();
    expect(
      await drawer.getByText("synthetic-revision-1", { exact: true }).count()
    ).toBe(1);
    expect(await password.count()).toBe(0);
    await drawer.getByRole("button", { name: "Close setup" }).click();
    await drawer.waitFor({ state: "hidden" });
    await page
      .getByLabel("Task context", { exact: true })
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page.getByRole("link", { name: /Application setup/ }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Awaiting activation" })
      .waitFor();
    expect(applies).toBe(1);
    expect(requestIds).toEqual([initialId]);
    await page.getByRole("button", { name: "Resume activation" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Ready for startup" })
      .waitFor();
    expect(activations).toBe(1);
    expect(
      await page.getByRole("button", { name: "Create first owner" }).count()
    ).toBe(0);
    state = "blocked";
    revision = "synthetic-revision-1";
    blockers = [{ code: "external-configuration-required" }];
    await page.evaluate(() => window.initializationFixture.platform("workers"));
    await page.getByRole("button", { name: "Check status" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Setup blocked" })
      .waitFor();
    expect(
      await page.getByRole("button", { name: "Resume activation" }).count()
    ).toBe(0);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    for (const action of await page
      .getByRole("button", { name: /Check status|View setup/ })
      .all()) {
      await action.scrollIntoViewIfNeeded();
      expect(
        await action.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.height >= 44 &&
            element.contains(
              document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2
              )
            )
          );
        })
      ).toBe(true);
    }
    if (process.env.LENSO_INITIALIZATION_SCREENSHOTS) {
      await page.screenshot({
        path: path.join(
          process.env.LENSO_INITIALIZATION_SCREENSHOTS,
          "setup-workers-dark.png"
        ),
        fullPage: true,
      });
    }
    unavailable = true;
    await page.getByRole("button", { name: "Check status" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "No new-instance state" })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "Configure this instance" })
        .count()
    ).toBe(0);
    expect(await page.locator("body").textContent()).not.toContain(
      "SYNTHETIC_SECRET"
    );
    unavailable = false;
    state = "uninitialized";
    revision = null;
    blockers = [];
    unknown = false;
    await page.getByRole("button", { name: "Check status" }).click();
    await page.getByRole("button", { name: "Configure this instance" }).click();
    await password.fill("synthetic-owner-password");
    await key.fill("synthetic-provider-key");
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await drawer.getByRole("button", { name: "Create first owner" }).click();
    await drawer
      .getByRole("status")
      .filter({ hasText: "Submitting setup" })
      .waitFor();
    await page.evaluate(() => window.initializationFixture.scope("second"));
    await page
      .getByRole("status")
      .filter({ hasText: "Setup blocked" })
      .waitFor();
    release!();
    await page.getByRole("button", { name: "Check status" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Setup blocked" })
      .waitFor();
    expect(
      await page.getByText("synthetic-revision-1", { exact: true }).count()
    ).toBe(0);
    expect(activations).toBe(1);
    expect(reads).toBeGreaterThan(5);
    expect(errors).toEqual([]);
  } catch (error) {
    console.error({
      errors,
      body: await page.locator("body").textContent(),
      reads,
    });
    throw error;
  } finally {
    release?.();
    await browser.close();
    await server.close();
  }
}, 60_000);
