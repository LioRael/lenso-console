import { expect, test } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { valuesSource } from "@lenso/core";
import { chromium, type Page } from "playwright";

import { resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";
import { migrateLocalLocaleStore } from "./locale-store";
import { freePort } from "./test/port";

// Only a real Shell, admitted module and kernel can prove this optional page's
// transport, theme, refresh and interaction geometry together.
const runtimeRequired = process.env.LENSO_REQUIRE_RUNTIME === "1";
const runtimeTest =
  process.env.LENSO_RUNTIME_ROOT || runtimeRequired ? test : test.skip;
runtimeTest(
  "Runtime page reads live metadata through authenticated Console and retires safely",
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
      const token = crypto.randomUUID();
      const config = await resolveHostConfiguration(directory, [
        valuesSource({
          token,
          runtimePort,
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
      page.on("pageerror", (error) => errors.push(error.message));
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
      await page
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Runtime", exact: true })
        .waitFor();
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
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.visible).toBe(true);
        const contrast = await page
          .getByRole("main", { name: "Runtime", exact: true })
          .evaluate((node) => {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d")!;
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
          .getByRole("listitem")
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
      }
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
            "loading",
            "empty calls/outcomes",
            "keyboard refresh",
            "both themes and contrast",
            "narrow overflow",
            "final-row clearance",
            "disconnected error state",
          ],
        })
      );
    } catch (error) {
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
