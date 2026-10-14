import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startApp, valuesSource } from "@lenso/core";
import { chromium, type Page } from "playwright";

import { initializeLocalAdministration } from "./administration-host";
import { resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";
import { migrateLocalLocaleStore } from "./locale-store";
import { freePort } from "./test/port";

async function inBounds(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  for (const name of [
    "Home",
    "Sign out",
    "Renew session",
    "Reload administration data",
  ]) {
    expect(await page.getByRole("button", { name, exact: true }).count()).toBe(
      0
    );
  }
}

async function settledAgentContext(page: Page) {
  await page
    .getByRole("tab", { name: "Events", exact: true })
    .click({ trial: true });
}

// Package/server tests cannot prove compiled React contexts, portal focus,
// one-time secret retirement or reachable controls inside the real Shell.
test("compiled administration pages manage real isolated data and retire one-time credentials", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "console-admin-browser-")
  );
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let activePage: Page | undefined;
  const errors: string[] = [];
  const credentialFailures: { status: number; code?: string }[] = [];
  try {
    const config = await resolveHostConfiguration(directory, [
      valuesSource({
        administration: true,
        token: "isolated-browser-administration-secret",
        origin: `http://127.0.0.1:${await freePort()}`,
        shellDirectory: path.resolve("plugins/console/shell/dist/client"),
        databasePath: path.join(directory, "locale.sqlite"),
      }),
    ]);
    await migrateLocalLocaleStore(config.databasePath);
    const colleague = "fixture-member@localhost.test";
    initializeLocalAdministration(config, [
      { subjectId: colleague, label: "Fixture member" },
    ]);
    const host = await createHost(config);
    app = await startApp(host.app);
    const listener = app.get(host.listener);
    const { origin } = listener.url;
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(8000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", async (response) => {
      if (
        response.url().endsWith("/admin/credentials/issue") &&
        !response.ok()
      ) {
        const data = await response.json().catch(() => null);
        credentialFailures.push({
          status: response.status(),
          ...(typeof data?.code === "string" ? { code: data.code } : {}),
        });
      }
    });
    await page.goto(`${origin}/identity/`);
    await page.getByLabel("Account", { exact: true }).fill(config.subject);
    await page.getByLabel("Password", { exact: true }).fill(config.token);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("table", { name: "Identities", exact: true })
      .waitFor();

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForFunction(
        (value) => document.documentElement.dataset.theme === value,
        theme
      );
      await page.setViewportSize({
        width: theme === "light" ? 1280 : 390,
        height: 900,
      });
      await inBounds(page);
    }
    await page
      .getByRole("searchbox", { name: "Search identities" })
      .fill("no-matching-fixture");
    await page.getByText("No identities found.", { exact: true }).waitFor();
    await page.getByRole("searchbox", { name: "Search identities" }).fill("");
    await page
      .getByRole("link", { name: "Fixture member", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Fixture member", exact: true })
      .waitFor();
    expect(page.url()).toContain("/identity/users/");
    await page.goto(`${origin}/access/`);
    await page
      .getByRole("combobox", { name: "Existing identity", exact: true })
      .click();
    await page.getByRole("option", { name: /Fixture member/ }).click();
    await page
      .getByRole("combobox", { name: "Membership role", exact: true })
      .click();
    await page.getByRole("option", { name: /read.?only/i }).click();
    const grant = page.getByRole("button", {
      name: "Grant membership",
      exact: true,
    });
    await grant.click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    expect(
      await grant.evaluate((node) => node === document.activeElement)
    ).toBe(true);
    await grant.click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    // Permission revisions deliberately retire the old trusted read scope.
    // Retry session re-admits the same live cookie; it does not repeat the write.
    await page
      .getByRole("button", { name: "Retry session", exact: true })
      .click();
    await page
      .getByRole("table", { name: "Members", exact: true })
      .getByText(colleague, { exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "Roles", exact: true }).click();
    expect(page.url()).toContain("/access/roles");
    await page
      .getByRole("region", { name: "Role readonly", exact: true })
      .getByText(/users.list/)
      .waitFor();
    await inBounds(page);
    await page
      .getByRole("button", { name: "Create role", exact: true })
      .click();
    const roleForm = page.getByRole("region", {
      name: "Create custom role",
      exact: true,
    });
    await roleForm.getByLabel("Role ID", { exact: true }).fill("fixture-role");
    await roleForm
      .getByLabel("Role name", { exact: true })
      .fill("Fixture permissions");
    await roleForm
      .getByRole("button", { name: "Create custom role", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry session", exact: true })
      .click();
    const roleEditor = page.getByRole("region", {
      name: "Role Fixture permissions",
      exact: true,
    });
    await roleEditor.waitFor();
    await roleEditor
      .getByRole("checkbox", { name: "users.read", exact: true })
      .uncheck();
    await roleEditor
      .getByRole("button", { name: "Save permissions", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry session", exact: true })
      .click();
    await roleEditor.waitFor();
    expect(
      await roleEditor
        .getByRole("checkbox", { name: "users.read", exact: true })
        .isChecked()
    ).toBe(false);
    await page.goto(`${origin}/agent-connections/`);
    await page
      .getByRole("button", { name: "Create token", exact: true })
      .waitFor();
    await inBounds(page);
    // Unit coverage cannot see Context Bar text wrapping in the compiled narrow Shell.
    const events = page.getByRole("tab", { name: "Events", exact: true });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await settledAgentContext(page);
      expect(
        await page.getByRole("tab").evaluateAll((nodes) =>
          nodes.map((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const lines = [...range.getClientRects()];
            const box = node.getBoundingClientRect();
            return {
              label: node.textContent,
              lines: new Set(lines.map((line) => Math.round(line.y))).size,
              visible: lines.every(
                (line) =>
                  line.left >= box.left &&
                  line.right <= box.right &&
                  box.left >= 0 &&
                  box.right <= innerWidth
              ),
            };
          })
        )
      ).toEqual([
        { label: "Tokens", lines: 1, visible: true },
        { label: "Events", lines: 1, visible: true },
      ]);
    }
    await events.focus();
    expect(
      await events.evaluate((node) => node === document.activeElement)
    ).toBe(true);
    await page.keyboard.press("Enter");
    await page
      .getByRole("table", { name: "Observed events", exact: true })
      .waitFor();
    expect(await events.getAttribute("aria-selected")).toBe("true");
    await page.getByRole("tab", { name: "Tokens", exact: true }).click();
    await page
      .getByRole("button", { name: "Create token", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await page
      .getByRole("region", { name: "One-time credential", exact: true })
      .waitFor();
    const oneTime = await page
      .getByRole("region", { name: "One-time credential" })
      .locator("pre")
      .textContent();
    expect(oneTime).toMatch(/^lk_/);
    await page
      .getByRole("button", { name: "Dismiss credential", exact: true })
      .click();
    expect(await page.getByText(oneTime!, { exact: true }).count()).toBe(0);
    const persisted = await page.evaluate(() =>
      JSON.stringify([
        Object.entries(localStorage),
        Object.entries(sessionStorage),
      ])
    );
    expect(persisted).not.toContain(oneTime!);
    await page
      .getByRole("table", { name: "Personal tokens", exact: true })
      .waitFor();

    const capture = process.env.LENSO_ADMIN_SCREENSHOTS;
    if (capture) {
      await mkdir(capture, { recursive: true });
      await page.emulateMedia({ colorScheme: "light" });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "light"
      );
      for (const [route, name] of [
        ["identity", "identity"],
        ["access", "access"],
        ["agent-connections", "agent"],
      ] as const) {
        await page.goto(`${origin}/${route}/`);
        await page
          .getByRole("table", {
            name:
              name === "identity"
                ? "Identities"
                : name === "access"
                  ? "Members"
                  : "Personal tokens",
            exact: true,
          })
          .waitFor();
        await page.screenshot({
          path: path.join(capture, `${name}.png`),
          fullPage: true,
        });
      }
      await page.getByRole("tab", { name: "Events", exact: true }).click();
      await page
        .getByRole("table", { name: "Observed events", exact: true })
        .waitFor();
      await page.screenshot({
        path: path.join(capture, "events.png"),
        fullPage: true,
      });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.setViewportSize({ width: 390, height: 900 });
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "dark"
      );
      await settledAgentContext(page);
      await page.screenshot({
        path: path.join(capture, "events-narrow-dark.png"),
        fullPage: false,
      });
    }

    // A lost issuance response must not invite a second credential creation.
    await page.route("**/admin/credentials/issue", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "unavailable" }),
      })
    );
    await page.goto(`${origin}/agent-connections/`);
    await page
      .getByRole("button", { name: "Create token", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    expect(
      await page
        .getByRole("button", { name: "Create token", exact: true })
        .isDisabled()
    ).toBe(true);
    await page.unroute("**/admin/credentials/issue");
    await page
      .getByRole("button", { name: "Reload administration data", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Data reloaded." })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "Create token", exact: true })
        .isDisabled()
    ).toBe(false);
    expect(errors).toEqual([]);
  } catch (error) {
    console.error("Administration browser errors", errors);
    console.error("Credential failure classifications", credentialFailures);
    if (activePage) {
      console.error(
        "Administration browser path",
        new URL(activePage.url()).pathname
      );
      console.error(
        "Administration browser grids",
        await activePage
          .getByRole("grid")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("aria-label"))
          )
      );
      console.error(
        "Administration browser alerts",
        await activePage.getByRole("alert").allTextContents()
      );
      if (
        process.env.LENSO_ADMIN_SCREENSHOTS &&
        (await activePage
          .locator('[aria-label="One-time credential"]')
          .count()) === 0
      ) {
        await mkdir(process.env.LENSO_ADMIN_SCREENSHOTS, { recursive: true });
        await activePage.screenshot({
          path: path.join(process.env.LENSO_ADMIN_SCREENSHOTS, "failure.png"),
          fullPage: true,
        });
      }
    }
    throw error;
  } finally {
    await browser?.close();
    await app?.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
