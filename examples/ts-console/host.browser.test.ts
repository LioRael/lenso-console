import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startApp, valuesSource } from "@lenso/core";
import { chromium } from "playwright";

import { resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";
import { csrfCookie } from "./local-auth";
import { migrateLocalLocaleStore } from "./locale-store";
import { freePort } from "./test/port";

// Fetch fixtures cannot prove compiled-module React sharing, rendered business
// results, real control geometry, or removal of a mounted page after logout.
test("Shell login restores sessions and retires pages on expiry and cross-tab logout", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "console-browser-"));
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let provider: ReturnType<typeof Bun.serve> | undefined;
  try {
    const token = "isolated-browser-operator-token";
    const config = await resolveHostConfiguration(directory, [
      valuesSource({
        token,
        origin: `http://127.0.0.1:${await freePort()}`,
        shellDirectory: path.resolve("plugins/console/shell/dist/client"),
        databasePath: path.join(directory, "locale.sqlite"),
      }),
    ]);
    await migrateLocalLocaleStore(config.databasePath);
    const host = await createHost(config);
    app = await startApp(host.app);
    const { origin } = app.get(host.listener).url;
    const executablePath = process.env.LENSO_BROWSER_EXECUTABLE_PATH?.trim();
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    // Notifications are not a prerequisite for login. Web Locks still serialize cookie writes.
    await context.addInitScript(() => {
      Object.defineProperty(globalThis, "BroadcastChannel", {
        value: undefined,
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const denied = page.waitForResponse(
      (response) =>
        response.url().endsWith("/console/v1/session") &&
        response.status() === 401
    );
    await page.goto(`${origin}/authorization/`);
    await denied;
    await page.getByRole("heading", { name: "Sign in to Console" }).waitFor();
    expect(
      await page
        .getByRole("button", { name: "Retry session", exact: true })
        .count()
    ).toBe(0);
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByLabel("Account", { exact: true })
        .evaluate((node) => node === document.activeElement)
    ).toBe(true);
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForFunction(
        (expectedTheme) =>
          document.documentElement.dataset.theme === expectedTheme,
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
      for (const name of ["Account", "Password"]) {
        expect(
          await page.getByLabel(name, { exact: true }).evaluate((node) => {
            const box = node.getBoundingClientRect();
            return (
              box.height >= 44 &&
              node.contains(
                document.elementFromPoint(
                  box.x + box.width / 2,
                  box.y + box.height / 2
                )
              )
            );
          })
        ).toBe(true);
      }
      expect(
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .evaluate((node) => {
            const box = node.getBoundingClientRect();
            return (
              box.height >= 44 &&
              node.contains(
                document.elementFromPoint(
                  box.x + box.width / 2,
                  box.y + box.height / 2
                )
              )
            );
          })
      ).toBe(true);
      for (const text of [
        page.getByLabel("Account", { exact: true }),
        page.getByRole("button", { name: "Sign in", exact: true }),
        page.getByText("Use an account provided by this application.", {
          exact: true,
        }),
      ]) {
        expect(
          await text.evaluate((node) => {
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext("2d")!;
            const luminance = (color: string) => {
              ctx.fillStyle = color;
              ctx.fillRect(0, 0, 1, 1);
              const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data]
                .slice(0, 3)
                .map((value) => {
                  const channel = value / 255;
                  return channel <= 0.04045
                    ? channel / 12.92
                    : ((channel + 0.055) / 1.055) ** 2.4;
                });
              return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
            };
            const foreground = luminance(getComputedStyle(node).color);
            const background = luminance(
              getComputedStyle(node.tagName === "BUTTON" ? node : document.body)
                .backgroundColor
            );
            return (
              (Math.max(foreground, background) + 0.05) /
              (Math.min(foreground, background) + 0.05)
            );
          })
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(
      await page.getByText("local-operator", { exact: true }).count()
    ).toBe(0);
    await page.getByLabel("Account", { exact: true }).fill(config.subject);
    await page.getByLabel("Password", { exact: true }).fill("incorrect");
    // Missing browser security cookies need an actionable recovery path before
    // password submission; the existing rejected-password case cannot prove it.
    await context.clearCookies({ name: csrfCookie });
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("alert")
      .getByText("Open this application over HTTPS", { exact: false })
      .waitFor();
    const refreshedMethods = page.waitForResponse(`${origin}/auth/methods`);
    await page
      .getByRole("button", { name: "Retry session", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await refreshedMethods;
    await page
      .getByRole("heading", { name: "Sign in to Console", exact: true })
      .waitFor();
    await page.getByLabel("Account", { exact: true }).fill(config.subject);
    await page.getByLabel("Password", { exact: true }).fill("incorrect");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("alert")
      .getByText("Sign-in was not accepted.", { exact: false })
      .waitFor();
    await page
      .getByRole("button", { name: "Retry session", exact: true })
      .waitFor();
    expect(
      await page.getByLabel("Password", { exact: true }).inputValue()
    ).toBe("");
    let attempts = 0;
    let releaseLogin!: () => void;
    let startedLogin!: () => void;
    let completedLogin!: () => void;
    const heldLogin = new Promise<void>((resolve) => {
      releaseLogin = resolve;
    });
    const loginStarted = new Promise<void>((resolve) => {
      startedLogin = resolve;
    });
    const loginCompleted = new Promise<void>((resolve) => {
      completedLogin = resolve;
    });
    await page.route(`${origin}/auth/login`, async (route) => {
      attempts += 1;
      startedLogin();
      await heldLogin;
      try {
        await route.fulfill({ status: 401, json: { code: "unauthorized" } });
      } catch {
        // The real browser may already have discarded the cancelled request.
      } finally {
        completedLogin();
      }
    });
    await page.getByLabel("Account", { exact: true }).fill(config.subject);
    await page.getByLabel("Password", { exact: true }).fill(token);
    await page
      .getByRole("form", { name: "Sign in", exact: true })
      .evaluate((node) => {
        (node as HTMLFormElement).requestSubmit();
        node.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true })
        );
      });
    await loginStarted;
    await page
      .getByRole("button", { name: "Cancel request", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Sign in to Console", exact: true })
      .waitFor();
    releaseLogin();
    await loginCompleted;
    expect(attempts).toBe(1);
    expect(await page.getByRole("alert").count()).toBe(0);
    await page.unroute(`${origin}/auth/login`);
    await page.getByLabel("Account", { exact: true }).fill(config.subject);
    await page.getByLabel("Password", { exact: true }).fill(token);
    const admitted = page.waitForResponse(
      (response) =>
        response.url().includes("/rpc/workspace/invoke") &&
        response.status() === 200
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).focus();
    await page.keyboard.press("Enter");
    await admitted;
    await page.getByText("local-operator", { exact: true }).waitFor();
    expect(
      await page
        .getByRole("main", { name: "Authorization", exact: true })
        .count()
    ).toBe(1);
    await page.reload();
    await page.getByText("local-operator", { exact: true }).waitFor();
    expect(
      await page
        .getByRole("button", { name: "Renew session", exact: true })
        .count()
    ).toBe(0);
    const sessionUrl = `${origin}/api/console/v1/session`;
    await page.route(`${origin}/auth/methods`, async (route) => {
      const response = await route.fetch();
      const discovery = await response.json();
      await route.fulfill({
        response,
        json: {
          ...discovery,
          session: { ...discovery.session, renew: "/auth/renew" },
        },
      });
    });
    await page.reload();
    await page.getByText("local-operator", { exact: true }).waitFor();
    for (const name of ["Home", "Sign out", "Renew session"]) {
      expect(
        await page.getByRole("button", { name, exact: true }).count()
      ).toBe(0);
    }
    await page.unroute(`${origin}/auth/methods`);
    await page.route(sessionUrl, (route) =>
      route.fulfill({ status: 503, json: { code: "service_unavailable" } })
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("heading", { name: "Console is unavailable", exact: true })
      .waitFor();
    expect(await page.getByLabel("Password", { exact: true }).count()).toBe(0);
    await page.unroute(sessionUrl);
    await page
      .getByRole("button", { name: "Retry session", exact: true })
      .click();
    await page.getByText("local-operator", { exact: true }).waitFor();
    await page.route(sessionUrl, async (route) => {
      const response = await route.fetch();
      const projection = await response.json();
      await route.fulfill({
        response,
        json: { ...projection, console_access: false },
      });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("heading", { name: "No Console access", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("button", {
          name: "Sign out to switch account",
          exact: true,
        })
        .count()
    ).toBe(1);
    expect(await page.getByLabel("Password", { exact: true }).count()).toBe(0);
    await page.unroute(sessionUrl);
    await page
      .getByRole("button", { name: "Retry session", exact: true })
      .click();
    await page.getByText("local-operator", { exact: true }).waitFor();
    const refreshed = page.waitForResponse(
      (response) =>
        response.url().includes("/rpc/workspace/invoke") &&
        response.status() === 200
    );
    await page.getByRole("button", { name: "Refresh authorization" }).focus();
    await page.keyboard.press("Enter");
    await refreshed;
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    const loggedOut = await page.evaluate(async (cookieName) => {
      const prefix = `${cookieName}=`;
      const csrf = document.cookie
        .split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(prefix))
        ?.slice(prefix.length);
      const response = await fetch("/auth/logout", {
        method: "POST",
        headers: { "x-csrf-token": csrf ?? "" },
      });
      return response.status;
    }, csrfCookie);
    expect(loggedOut).toBe(204);
    const expired = page.waitForResponse(
      (response) =>
        response.url().endsWith("/console/v1/session") &&
        response.status() === 401
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expired;
    await page
      .getByRole("heading", { name: "Sign in again", exact: true })
      .waitFor();
    expect(
      await page.getByText("local-operator", { exact: true }).count()
    ).toBe(0);
    expect(
      await page.getByRole("button", { name: "Refresh authorization" }).count()
    ).toBe(0);
    await page.getByLabel("Account", { exact: true }).fill(config.subject);
    await page.getByLabel("Password", { exact: true }).fill(token);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByText("local-operator", { exact: true }).waitFor();
    const second = await context.newPage();
    await second.goto(`${origin}/authorization/`);
    await second.getByText("local-operator", { exact: true }).waitFor();
    await page.route(sessionUrl, async (route) => {
      const response = await route.fetch();
      const projection = await response.json();
      await route.fulfill({
        response,
        json: { ...projection, console_access: false },
      });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("button", { name: "Sign out to switch account", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("heading", { name: "Sign in to Console", exact: true })
      .waitFor();
    await second
      .getByRole("heading", { name: "Sign in again", exact: true })
      .waitFor();
    expect(
      await second.getByText("local-operator", { exact: true }).count()
    ).toBe(0);
    expect(
      await page.getByText("local-operator", { exact: true }).count()
    ).toBe(0);
    await second.close();
    await page.route(`${origin}/auth/methods`, async (route) => {
      const response = await route.fetch();
      const discovery = await response.json();
      await route.fulfill({ response, json: { ...discovery, methods: [] } });
    });
    await page.reload();
    await page
      .getByText(
        "The application has not configured a login method. Contact its operator.",
        { exact: true }
      )
      .waitFor();
    expect(await page.getByLabel("Password", { exact: true }).count()).toBe(0);
    await page.unroute(`${origin}/auth/methods`);
    // Provider network/callbacks are host-owned; this fixture proves browser handoff only.
    provider = Bun.serve({
      hostname: "localhost",
      port: 0,
      fetch(request) {
        expect(request.headers.has("cookie")).toBe(false);
        return new Response("<h1>Provider handoff fixture</h1>", {
          headers: { "content-type": "text/html" },
        });
      },
    });
    const providerUrl = new URL("/authorize", provider.url).href;
    await page.route(`${origin}/auth/methods`, async (route) => {
      const response = await route.fetch();
      const discovery = await response.json();
      await route.fulfill({
        response,
        json: {
          ...discovery,
          methods: [
            {
              id: "company",
              kind: "redirect",
              label: "Company account",
              action: "/auth/company",
            },
          ],
        },
      });
    });
    await page.route(`${origin}/auth/company?*`, async (route) => {
      expect(new URL(route.request().url()).searchParams.get("return_to")).toBe(
        "/authorization/"
      );
      await route.fulfill({
        status: 302,
        headers: { location: providerUrl },
      });
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Company account", exact: true })
      .click();
    await page.waitForURL(providerUrl);
    await page
      .getByRole("heading", { name: "Provider handoff fixture", exact: true })
      .waitFor();
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    provider?.stop(true);
    await app?.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
