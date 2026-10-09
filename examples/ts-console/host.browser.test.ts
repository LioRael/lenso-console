import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startApp, valuesSource } from "@lenso/core";
import { chromium } from "playwright";

import { resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";
import { migrateLocalLocaleStore } from "./locale-store";
import { freePort } from "./test/port";

// Fetch fixtures cannot prove compiled-module React sharing, rendered business
// results, real control geometry, or removal of a mounted page after logout.
test("browser mounts authorized inspection and retires it after actual backend logout", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "console-browser-"));
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
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
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const denied = page.waitForResponse(
      (response) =>
        response.url().endsWith("/console/v1/session") &&
        response.status() === 401
    );
    await page.goto(`${origin}/authorization/`);
    await denied;
    await page.getByRole("alert").waitFor();
    expect(
      await page.getByText("local-operator", { exact: true }).count()
    ).toBe(0);
    const login = await page.evaluate(
      async ({ subject, password }) => {
        const response = await fetch("/auth/methods");
        const methods = await response.json();
        const prefix = `${methods.csrf.cookie_name}=`;
        const csrf = document.cookie
          .split(";")
          .map((cookie) => cookie.trim())
          .find((cookie) => cookie.startsWith(prefix))
          ?.slice(prefix.length);
        const signedIn = await fetch("/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [methods.csrf.header_name]: csrf ?? "",
          },
          body: JSON.stringify({ identifier: subject, password }),
        });
        return signedIn.status;
      },
      { subject: config.subject, password: token }
    );
    expect(login).toBe(204);
    const admitted = page.waitForResponse(
      (response) =>
        response.url().includes("/rpc/workspace/invoke") &&
        response.status() === 200
    );
    await page.getByRole("button", { name: "Retry admission" }).click();
    await admitted;
    await page.getByText("local-operator", { exact: true }).waitFor();
    expect(
      await page
        .getByRole("heading", { name: "Authorization", exact: true })
        .count()
    ).toBe(1);
    const refreshed = page.waitForResponse(
      (response) =>
        response.url().includes("/rpc/workspace/invoke") &&
        response.status() === 200
    );
    await page.getByRole("button", { name: "Refresh authorization" }).focus();
    await page.keyboard.press("Enter");
    await refreshed;
    const home = page.getByRole("button", { name: "Home", exact: true });
    await home.focus();
    await page.getByRole("tooltip", { name: "Home", exact: true }).waitFor();
    const homeBox = await home.boundingBox();
    const titleBox = await page
      .getByRole("heading", { name: "Authorization", exact: true })
      .boundingBox();
    expect(homeBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(titleBox!.y).toBeGreaterThanOrEqual(homeBox!.y + homeBox!.height);
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
    const loggedOut = await page.evaluate(async () => {
      const prefix = "__Host-lenso-csrf=";
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
    });
    expect(loggedOut).toBe(204);
    const expired = page.waitForResponse(
      (response) =>
        response.url().endsWith("/console/v1/session") &&
        response.status() === 401
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expired;
    await page.getByRole("alert").waitFor();
    expect(
      await page.getByText("local-operator", { exact: true }).count()
    ).toBe(0);
    expect(
      await page.getByRole("button", { name: "Refresh authorization" }).count()
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await app?.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
