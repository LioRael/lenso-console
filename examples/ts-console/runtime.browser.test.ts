import { expect, test } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createConsoleClient } from "@lenso/console-sdk/transport";
import { valuesSource } from "@lenso/core";
import { chromium, type Page } from "playwright";

import { resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";
import { csrfCookie } from "./local-auth";
import { migrateLocalLocaleStore } from "./locale-store";
import { freePort } from "./test/port";
import {
  startGreetingFixture,
  writeGreetingManifest,
} from "./test/runtime-greeting";

// Only a real Shell, admitted module and kernel can prove this optional page's
// transport, theme, refresh and interaction geometry together. The previous
// status-only proof could not catch static declarations masquerading as live
// registration or a trial that bypasses the admitted Manage/authentication path.
const runtimeRequired = process.env.LENSO_REQUIRE_RUNTIME === "1";
const runtimeTest =
  process.env.LENSO_RUNTIME_ROOT || runtimeRequired ? test : test.skip;
runtimeTest(
  "Runtime page separates build contracts from live metadata and invokes only an admitted greeting",
  async () => {
    const runtimeRoot = process.env.LENSO_RUNTIME_ROOT;
    if (!runtimeRoot) {
      throw new Error("Set LENSO_RUNTIME_ROOT to prebuilt Runtime binaries.");
    }
    const { startRuntimeApp } = await import("@lenso/runtime");
    const { startRuntimeCompanions } = await import("@lenso/runtime/engine");
    const { RuntimeHost } = await import("@lenso/runtime-sdk");
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "console-runtime-browser-")
    );
    const cleanup: (() => Promise<void>)[] = [];
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let running: Awaited<ReturnType<typeof startRuntimeApp>> | undefined;
    let probe: Awaited<ReturnType<typeof RuntimeHost.connect>> | undefined;
    let page: Page | undefined;
    const failures: unknown[] = [];
    const disposeCompanions = async () => {
      const errors: unknown[] = [];
      while (cleanup.length) {
        const dispose = cleanup.pop()!;
        try {
          await dispose();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Runtime fixture cleanup failed");
      }
    };
    try {
      const runtimeBinDir =
        process.env.LENSO_RUNTIME_BIN_DIR ??
        path.join(runtimeRoot, "target", "debug");
      for (const binary of ["lenso-runtime", "logs-batch"]) {
        const binaryPath = path.join(runtimeBinDir, binary);
        await access(binaryPath);
      }
      const runtimePort = await freePort();
      await startRuntimeCompanions(
        {
          port: runtimePort,
          kernelBinary: path.join(runtimeBinDir, "lenso-runtime"),
          services: [
            {
              binary: path.join(runtimeBinDir, "logs-batch"),
              ready: async (host) => {
                const status = await host.status();
                return status.services.some(
                  (row) =>
                    row !== null &&
                    typeof row === "object" &&
                    (row as Record<string, unknown>).service === "batch" &&
                    (row as Record<string, unknown>).state === "ready"
                );
              },
            },
          ],
        },
        (dispose) => cleanup.push(dispose)
      );
      probe = await RuntimeHost.connect({
        namespace: "demo",
        service: "browser-fixture",
        instance: "one",
        port: runtimePort,
        contract: { version: "1", methods: {} },
      });
      let greetingCalls = 0;
      let beforeGreetingReply: (() => Promise<void>) | undefined;
      const greeting = await startGreetingFixture(runtimePort, async () => {
        greetingCalls += 1;
        await beforeGreetingReply?.();
      });
      cleanup.push(async () => greeting.close());
      const runtimeManifestPath = path.join(directory, "build-manifest.json");
      await writeGreetingManifest(runtimeManifestPath);
      const token = crypto.randomUUID();
      const config = await resolveHostConfiguration(directory, [
        valuesSource({
          token,
          runtimePort,
          runtimeManifestPath,
          runtimeGreetingTrial: true,
          origin: `http://127.0.0.1:${await freePort()}`,
          shellDirectory: path.resolve("plugins/console/shell/dist/client"),
          databasePath: path.join(directory, "locale.sqlite"),
        }),
      ]);
      await migrateLocalLocaleStore(config.databasePath);
      const host = await createHost(config);
      running = await startRuntimeApp(host.app);
      const { origin } = running.get(host.listener).url;
      const executablePath = process.env.LENSO_BROWSER_EXECUTABLE_PATH?.trim();
      browser = await chromium.launch(executablePath ? { executablePath } : {});
      const browserContext = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      page = await browserContext.newPage();
      page.setDefaultTimeout(10000);
      const errors: string[] = [];
      let recordConsole = false;
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (
          recordConsole &&
          (message.type() === "error" || message.type() === "warning")
        ) {
          errors.push(message.text());
        }
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let holding = true;
      await page.route("**/*", async (route) => {
        if (
          holding &&
          route.request().method() === "POST" &&
          route.request().postData()?.includes('"status"')
        ) {
          await gate;
        }
        await route.continue();
      });
      await page.goto(`${origin}/plugins/local/runtime/runtime/`);
      await page.getByRole("heading", { name: "Sign in to Console" }).waitFor();
      await page.getByLabel("Account", { exact: true }).fill(config.subject);
      await page.getByLabel("Password", { exact: true }).fill(token);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByRole("main", { name: "Runtime", exact: true }).waitFor();
      recordConsole = true;
      await page
        .getByText("Loading runtime diagnostics…", { exact: true })
        .waitFor();
      holding = false;
      release();
      await page.getByText("demo/batch", { exact: true }).waitFor();
      expect(
        await page
          .getByText("aggregate (unary), progress (stream)", { exact: false })
          .count()
      ).toBeGreaterThan(0);
      expect(
        await page
          .getByText("No active or waiting calls.", { exact: true })
          .count()
      ).toBe(1);

      expect(page.url()).toBe(`${origin}/plugins/local/runtime/runtime/`);
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
      await page
        .getByRole("region", { name: "Capability directory", exact: true })
        .getByText("Static build manifest", { exact: false })
        .waitFor();
      await page
        .getByRole("heading", {
          name: "console-demo/planned-greeting",
          exact: true,
        })
        .waitFor();
      expect(
        await page
          .getByRole("table", { name: "Runtime instances" })
          .getByText("console-demo/planned-greeting", { exact: true })
          .count()
      ).toBe(0);
      const schemas = page.getByRole("button", {
        name: "View schemas for console-demo/greeting.greet",
        exact: true,
      });
      await schemas.focus();
      await page.keyboard.press("Enter");
      await page.getByText('"maxLength": 80', { exact: false }).waitFor();
      await page.keyboard.press("Escape");

      // Actual Auth cookies and the public Console client exercise the same
      // admitted path as the form, including server rejection before dispatch.
      const cookies = await browserContext.cookies();
      const client = createConsoleClient({
        origin,
        url: "/api/console/v2/rpc",
        headers: {
          origin,
          cookie: cookies
            .map(({ name, value }) => `${name}=${value}`)
            .join("; "),
          "x-csrf-token": cookies.find(({ name }) => name === csrfCookie)!
            .value,
        },
      });
      const invoke = (operation: string, input: unknown) =>
        client.workspace.invoke({
          mountId: "runtime",
          service: "runtime",
          operation,
          input,
        });
      for (const input of [
        { name: " " },
        { name: "x".repeat(81) },
        { name: "Ada", method: "delete" },
        { name: "Ada", namespace: "other" },
      ]) {
        await expect(invoke("greet", input)).rejects.toThrow();
      }
      await expect(
        invoke("call", { method: "greet", name: "Ada" })
      ).rejects.toThrow();
      const anonymous = createConsoleClient({
        origin,
        url: "/api/console/v2/rpc",
      });
      await expect(
        anonymous.workspace.invoke({
          mountId: "runtime",
          service: "runtime",
          operation: "greet",
          input: { name: "Ada" },
        })
      ).rejects.toThrow();
      expect(greetingCalls).toBe(0);

      let finishGreeting!: () => void;
      let markGreetingStarted!: () => void;
      const greetingStarted = new Promise<void>((resolve) => {
        markGreetingStarted = resolve;
      });
      beforeGreetingReply = () =>
        new Promise<void>((resolve) => {
          finishGreeting = resolve;
          markGreetingStarted();
        });
      await page
        .getByRole("button", { name: "Open greeting trial", exact: true })
        .click();
      const runGreeting = page.getByRole("button", {
        name: "Run greeting",
        exact: true,
      });
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Ada");
      await runGreeting.focus();
      await page.keyboard.press("Enter");
      await page.getByText("Running greeting…", { exact: true }).waitFor();
      expect(await runGreeting.isDisabled()).toBe(true);
      await page.waitForFunction(
        () => document.querySelector("form[aria-busy='true']") !== null
      );
      // The handler gate proves a real Runtime dispatch, not a rendered mock.
      await greetingStarted;
      expect(greetingCalls).toBe(1);
      finishGreeting();
      beforeGreetingReply = undefined;
      await page.getByText("Hello, Ada!", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Close greeting trial", exact: true })
        .press("Enter");
      await page
        .getByRole("dialog", { name: "Greeting trial", exact: true })
        .waitFor({ state: "detached" });
      expect(
        await page
          .getByText("No terminal calls have been recorded.", { exact: true })
          .count()
      ).toBe(1);

      const target = {
        namespace: "demo",
        service: "batch",
        contractVersion: "1",
      };
      await probe.call(
        target,
        "aggregate",
        {
          logs: [
            {
              level: "info",
              message: "synthetic browser fixture",
              duration_ms: 1,
            },
          ],
        },
        { traceId: "browser-proof" }
      );
      const refresh = page.getByRole("button", {
        name: "Refresh runtime",
        exact: true,
      });
      await refresh.focus();
      await page
        .getByRole("tooltip", { name: "Refresh runtime", exact: true })
        .waitFor();
      expect(
        await refresh.evaluate((node) => node === document.activeElement)
      ).toBe(true);
      await page.keyboard.press("Enter");
      await page.getByText("trace browser-proof", { exact: false }).waitFor();

      const geometry: unknown[] = [];
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForFunction(
          (value) => document.documentElement.dataset.theme === value,
          theme
        );
        await page.setViewportSize({
          width: theme === "light" ? 1280 : 390,
          height: 844,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
        await refresh.scrollIntoViewIfNeeded();
        const box = await refresh.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return {
            height: rect.height,
            visible: node.contains(
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2
              )
            ),
            color: getComputedStyle(node).color,
          };
        });
        expect(box.height).toBeGreaterThanOrEqual(32);
        expect(box.visible).toBe(true);
        const contrast = await page
          .getByRole("main", { name: "Runtime", exact: true })
          .evaluate((node) => {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d", {
              willReadFrequently: true,
            })!;
            const luminance = (color: string) => {
              context.fillStyle = color;
              context.fillRect(0, 0, 1, 1);
              const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
                .slice(0, 3)
                .map((value) => {
                  const channel = value / 255;
                  return channel <= 0.04045
                    ? channel / 12.92
                    : ((channel + 0.055) / 1.055) ** 2.4;
                });
              return (
                channels[0]! * 0.2126 +
                channels[1]! * 0.7152 +
                channels[2]! * 0.0722
              );
            };
            const foreground = luminance(getComputedStyle(node).color);
            const background = luminance(
              getComputedStyle(document.body).backgroundColor
            );
            return (
              (Math.max(foreground, background) + 0.05) /
              (Math.min(foreground, background) + 0.05)
            );
          });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
        const last = page
          .getByRole("region", { name: "Recent outcomes", exact: true })
          .getByRole("row")
          .last();
        await last.scrollIntoViewIfNeeded();
        expect(
          await last.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return node.contains(
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2
              )
            );
          })
        ).toBe(true);
        geometry.push({
          theme,
          width: theme === "light" ? 1280 : 390,
          contrast,
          ...box,
        });
        await refresh.scrollIntoViewIfNeeded();
        await refresh.click();
        await page.waitForFunction(
          (node) => !(node as HTMLButtonElement).disabled,
          await refresh.elementHandle()
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        const pageContext = page.getByText("Runtime", { exact: true });
        // Shell context uses a short opacity transition after a refreshed
        // contribution. Capture its settled label, not an intermediate frame.
        await page.waitForFunction(
          (node) => {
            let current = node as HTMLElement | null;
            while (current) {
              if (Number(getComputedStyle(current).opacity) < 0.99) {
                return false;
              }
              current = current.parentElement;
            }
            return true;
          },
          await pageContext.elementHandle()
        );
        await page.screenshot({
          path: path.join(
            process.env.DELTA_SCRATCH_DIR ?? directory,
            `runtime-console-${theme}.png`
          ),
          fullPage: true,
        });
        await page.screenshot({
          path: path.join(
            process.env.DELTA_SCRATCH_DIR ?? directory,
            `runtime-console-${theme}-viewport.png`
          ),
        });
      }
      const touchContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        colorScheme: "dark",
        storageState: await browserContext.storageState(),
      });
      const touchPage = await touchContext.newPage();
      await touchPage.goto(`${origin}/plugins/local/runtime/runtime/`);
      const touchRefresh = touchPage.getByRole("button", {
        name: "Refresh runtime",
        exact: true,
      });
      await touchRefresh.waitFor();
      expect(
        await touchPage.evaluate(() => matchMedia("(pointer: coarse)").matches)
      ).toBe(true);
      const touchBox = await touchRefresh.boundingBox();
      expect(touchBox!.width).toBeGreaterThanOrEqual(44);
      expect(touchBox!.height).toBeGreaterThanOrEqual(44);
      await touchRefresh.tap();
      await touchPage
        .getByRole("button", { name: "Open greeting trial", exact: true })
        .tap();
      await touchPage
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Touch");
      await touchPage
        .getByRole("button", { name: "Run greeting", exact: true })
        .tap();
      await touchPage.getByText("Hello, Touch!", { exact: true }).waitFor();
      await touchPage.screenshot({
        path: path.join(
          process.env.DELTA_SCRATCH_DIR ?? directory,
          "runtime-console-touch.png"
        ),
      });
      await touchContext.close();
      expect(await page.locator("vite-error-overlay").count()).toBe(0);
      expect(errors).toEqual([]);
      await page.waitForFunction(
        (node) => !(node as HTMLButtonElement).disabled,
        await refresh.elementHandle()
      );
      await page.screenshot({
        path: path.join(
          process.env.DELTA_SCRATCH_DIR ?? directory,
          "runtime-console.png"
        ),
        fullPage: true,
      });
      // Navigating away while the owner is still working must retire form
      // feedback and abort the browser request; a late reply cannot reach a new page.
      let finishRetiredGreeting!: () => void;
      let markRetiredGreetingStarted!: () => void;
      const retireStarted = new Promise<void>((resolve) => {
        markRetiredGreetingStarted = resolve;
      });
      beforeGreetingReply = () =>
        new Promise<void>((resolve) => {
          finishRetiredGreeting = resolve;
          markRetiredGreetingStarted();
        });
      await page
        .getByRole("button", { name: "Open greeting trial", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Retired");
      await runGreeting.click();
      await page.getByText("Running greeting…", { exact: true }).waitFor();
      await retireStarted;
      expect(finishRetiredGreeting).toBeDefined();
      await page.goto(`${origin}/`);
      finishRetiredGreeting();
      beforeGreetingReply = undefined;
      await page.goto(`${origin}/plugins/local/runtime/runtime/`);
      await page
        .getByRole("button", { name: "Open greeting trial", exact: true })
        .click();
      await page.getByRole("textbox", { name: "Name", exact: true }).waitFor();
      expect(
        await page.getByText("Hello, Retired!", { exact: true }).count()
      ).toBe(0);
      expect(
        await page
          .getByRole("textbox", { name: "Name", exact: true })
          .inputValue()
      ).toBe("");
      await page
        .getByRole("button", { name: "Close greeting trial", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Greeting trial", exact: true })
        .waitFor({ state: "detached" });
      // The following 5xx is an intentional disconnect proof.
      recordConsole = false;
      await disposeCompanions();
      await refresh.click();
      await page
        .getByRole("alert")
        .getByText("Runtime diagnostics could not be read.", { exact: false })
        .waitFor();
      console.log(
        JSON.stringify({
          browser: "pass",
          geometry,
          checks: [
            "login",
            "real instances and capabilities",
            "static manifest separated from live registration",
            "schema disclosure keyboard interaction",
            "invalid and anonymous trial rejected before dispatch",
            "explicit greeting request and guarded running state",
            "loading",
            "empty calls/outcomes",
            "keyboard refresh",
            "both themes and contrast",
            "narrow overflow",
            "coarse-pointer target and greeting",
            "retired trial feedback discarded",
            "final-row clearance",
            "disconnected error state",
          ],
        })
      );
    } catch (error) {
      if (page && process.env.DELTA_SCRATCH_DIR) {
        await page
          .screenshot({
            path: path.join(
              process.env.DELTA_SCRATCH_DIR,
              "runtime-console-failure.png"
            ),
            fullPage: true,
          })
          .catch(() => undefined);
      }
      failures.push(error);
    } finally {
      for (const dispose of [
        () => browser?.close(),
        () => running?.stop(),
        () => probe?.close(),
        disposeCompanions,
        () => rm(directory, { force: true, recursive: true }),
      ]) {
        try {
          await dispose();
        } catch (error) {
          failures.push(error);
        }
      }
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length) {
      throw new AggregateError(failures, "Runtime browser verification failed");
    }
  },
  60000
);
