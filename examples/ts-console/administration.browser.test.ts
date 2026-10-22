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

async function capturePaging(page: Page, name: string) {
  if (process.env.LENSO_ADMIN_SCREENSHOTS) {
    await mkdir(process.env.LENSO_ADMIN_SCREENSHOTS, { recursive: true });
    await page.screenshot({
      path: path.join(process.env.LENSO_ADMIN_SCREENSHOTS, `${name}.png`),
      animations: "disabled",
    });
  }
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
      ...Array.from({ length: 25 }, (_, index) => ({
        subjectId: `paging-${index}@localhost.test`,
        label: `Paging fixture ${index}`,
      })),
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
    // The admitted host must expose real navigation without a fake page command.
    await page
      .getByRole("button", { name: "Console access", exact: true })
      .click();
    await page.getByRole("table", { name: "Members", exact: true }).waitFor();
    await page.getByRole("button", { name: "Identity", exact: true }).click();
    await page
      .getByRole("table", { name: "Identities", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Search identities", exact: true })
      .click();
    expect(
      await page
        .getByRole("searchbox", { name: "Search identities" })
        .evaluate(
          (node) =>
            node.closest<HTMLElement>("[data-console-corner]")?.dataset
              .consoleCorner
        )
    ).toBe("topLeft");
    expect(
      await page
        .getByRole("button", { name: "Next page", exact: true })
        .evaluate(
          (node) =>
            node.closest<HTMLElement>("[data-console-corner]")?.dataset
              .consoleCorner
        )
    ).toBe("bottomRight");
    expect(
      await page
        .getByRole("button", { name: "Next page", exact: true })
        .textContent()
    ).toBe("");
    expect(
      await page
        .getByRole("button", {
          name: "Table controls: Identities",
          exact: true,
        })
        .count()
    ).toBe(0);

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
      for (const control of [
        page.getByRole("searchbox", { name: "Search identities" }),
        page.getByRole("button", { name: "Next page", exact: true }),
        page.getByRole("button", {
          name: /^Filter identities:/,
          exact: true,
        }),
      ]) {
        if (!(await control.isDisabled())) {
          await control.click({ trial: true });
        }
        expect(
          await control.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight &&
              (node.matches(":disabled, [aria-disabled=true]") ||
                node.contains(
                  document.elementFromPoint(
                    rect.left + rect.width / 2,
                    rect.top + rect.height / 2
                  )
                ))
            );
          })
        ).toBe(true);
      }
    }
    // Cursor navigation has no URL: the rendered control must support Enter,
    // fetch the next real page, and honestly stop at the final cursor.
    await page.getByRole("button", { name: "Next page", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Next page"]')
        ?.matches(":disabled, [aria-disabled=true]")
    );
    await page
      .getByRole("table", { name: "Identities", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("table", { name: "Identities", exact: true })
        .getByRole("row")
        .count()
    ).toBe(3);
    await page.getByRole("button", { name: "First page", exact: true }).focus();
    await page.getByRole("button", { name: "Next page", exact: true }).focus();
    await page
      .getByRole("tooltip")
      .filter({ hasText: "No next page" })
      .waitFor();
    const doneFilters = async () => {
      await page
        .getByRole("button", { name: "Apply filters", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Filters", exact: true })
        .waitFor({ state: "hidden" });
      await page.waitForFunction(() =>
        document.activeElement
          ?.getAttribute("aria-label")
          ?.startsWith("Filter identities:")
      );
    };
    const editCondition = async (field: string) => {
      await page
        .getByRole("button", { name: /^Filter identities:/, exact: true })
        .click();
      await page
        .getByRole("button", { name: `Edit ${field} condition`, exact: true })
        .click();
    };
    await page
      .getByRole("button", { name: /^Filter identities:/, exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Add condition to group 1", exact: true })
      .click();
    await page.getByRole("option", { name: "Status", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Value for Status", exact: true })
      .click();
    await page.getByRole("option", { name: "Disabled", exact: true }).click();
    await doneFilters();
    await page
      .getByRole("heading", { name: "No identities match", exact: true })
      .waitFor();
    await editCondition("Status");
    await page
      .getByRole("combobox", { name: "Value for Status", exact: true })
      .click();
    await page.getByRole("option", { name: "Active", exact: true }).click();
    await doneFilters();
    await page
      .getByRole("table", { name: "Identities", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("table", { name: "Identities", exact: true })
        .getByRole("row")
        .count()
    ).toBe(26);
    await page
      .getByRole("button", { name: /^Filter identities:/, exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Add condition to group 1", exact: true })
      .click();
    await page.getByRole("option", { name: "Name", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Value for Name", exact: true })
      .fill("Fixture member");
    await page.keyboard.press("Enter");
    await doneFilters();
    await page
      .getByRole("link", { name: "Fixture member", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("table", { name: "Identities", exact: true })
        .getByRole("row")
        .count()
    ).toBe(2);
    const applied = page.getByRole("group", {
      name: "Filter identities",
      exact: true,
    });
    expect(
      await applied
        .getByRole("combobox", { name: "Filter logic", exact: true })
        .count()
    ).toBe(0);
    await page
      .getByRole("button", { name: /^Filter identities:/, exact: true })
      .click();
    // Geometry alone misses a light Select surface with white text in a dark host.
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        colorScheme
      );
      await page
        .getByRole("combobox", { name: "Filter logic", exact: true })
        .evaluate(async (node) => {
          // Theme variables change before the library's surface transition finishes.
          node.getBoundingClientRect();
          await Promise.all(
            node
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished.catch(() => undefined))
          );
        });
      const contrast = await page
        .getByRole("combobox", { name: "Filter logic", exact: true })
        .evaluate((node) => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const paint = canvas.getContext("2d")!;
          paint.fillStyle = "white";
          paint.fillRect(0, 0, 1, 1);
          const ancestors: Element[] = [];
          for (
            let element: Element | null = node;
            element;
            element = element.parentElement
          ) {
            ancestors.unshift(element);
          }
          for (const element of ancestors) {
            paint.fillStyle = getComputedStyle(element).backgroundColor;
            paint.fillRect(0, 0, 1, 1);
          }
          // Serialized browser evaluators cannot capture module-level helpers.
          // eslint-disable-next-line unicorn/consistent-function-scoping
          const luminance = (pixels: Uint8ClampedArray) => {
            const channels = [pixels[0]!, pixels[1]!, pixels[2]!].map(
              (value) => {
                const channel = value / 255;
                return channel <= 0.04045
                  ? channel / 12.92
                  : ((channel + 0.055) / 1.055) ** 2.4;
              }
            );
            return (
              channels[0]! * 0.2126 +
              channels[1]! * 0.7152 +
              channels[2]! * 0.0722
            );
          };
          const background = luminance(paint.getImageData(0, 0, 1, 1).data);
          paint.fillStyle = getComputedStyle(node).color;
          paint.fillRect(0, 0, 1, 1);
          const foreground = luminance(paint.getImageData(0, 0, 1, 1).data);
          return {
            ratio:
              (Math.max(background, foreground) + 0.05) /
              (Math.min(background, foreground) + 0.05),
            color: getComputedStyle(node).color,
            surface: getComputedStyle(node).backgroundColor,
            background,
            foreground,
          };
        });
      expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
    }
    await doneFilters();
    expect(
      await applied.evaluate(
        (node) =>
          node.closest<HTMLElement>("[data-console-corner]")?.dataset
            .consoleCorner
      )
    ).toBe("topRight");
    await page
      .getByRole("button", { name: "Search identities", exact: true })
      .click();
    const expandedSearch = page.getByRole("searchbox", {
      name: "Search identities",
      exact: true,
    });
    await expandedSearch.click({ trial: true });
    const searchBounds = await expandedSearch.boundingBox();
    const filterBounds = await applied.boundingBox();
    expect(searchBounds!.width >= 180).toBe(true);
    expect(
      searchBounds!.x < filterBounds!.x + filterBounds!.width &&
        searchBounds!.x + searchBounds!.width > filterBounds!.x &&
        searchBounds!.y < filterBounds!.y + filterBounds!.height &&
        searchBounds!.y + searchBounds!.height > filterBounds!.y
    ).toBe(false);
    await page.waitForFunction(
      ({ table, search }) =>
        !!table &&
        !!search &&
        table.getBoundingClientRect().top >=
          search.getBoundingClientRect().bottom + 8,
      {
        table: await page
          .getByRole("table", { name: "Identities", exact: true })
          .elementHandle(),
        search: await expandedSearch.elementHandle(),
      }
    );
    await editCondition("Name");
    await page
      .getByRole("combobox", { name: "Rule for Name", exact: true })
      .click();
    await page.getByRole("option", { name: "equals", exact: true }).click();
    await doneFilters();
    await editCondition("Name");
    await page
      .getByRole("textbox", { name: "Value for Name", exact: true })
      .fill("Fixture");
    await page.keyboard.press("Enter");
    await doneFilters();
    await page
      .getByRole("heading", { name: "No identities match", exact: true })
      .waitFor();
    await editCondition("Name");
    await page
      .getByRole("combobox", { name: "Rule for Name", exact: true })
      .click();
    await page.getByRole("option", { name: "contains", exact: true }).click();
    await doneFilters();
    await page
      .getByRole("table", { name: "Identities", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("table", { name: "Identities", exact: true })
        .getByRole("row")
        .count()
    ).toBe(26);
    // Forward-only cursors must still offer a way out of a final or failed page
    // without clearing the operator's search and conditions.
    const nextPage = page.getByRole("button", {
      name: "Next page",
      exact: true,
    });
    const firstPage = page.getByRole("button", {
      name: "First page",
      exact: true,
    });
    const filterSummary = await applied.textContent();
    await nextPage.click();
    await page
      .getByRole("link", { name: "Paging fixture 9", exact: true })
      .waitFor();
    expect(await nextPage.isDisabled()).toBe(true);
    expect(await firstPage.count()).toBe(1);
    await nextPage.focus();
    await page.keyboard.press("ArrowLeft");
    expect(
      await firstPage.evaluate((node) => node === document.activeElement)
    ).toBe(true);
    await page
      .getByRole("tooltip")
      .filter({ hasText: "Return to first page" })
      .waitFor();
    await capturePaging(page, "identity-terminal-mobile");
    await page.keyboard.press("Enter");
    await page
      .getByRole("link", { name: "Fixture member", exact: true })
      .waitFor();
    expect(await applied.textContent()).toBe(filterSummary);
    expect(await firstPage.count()).toBe(0);
    expect(
      await page
        .getByRole("region", { name: "Identity results", exact: true })
        .evaluate((node) => node === document.activeElement)
    ).toBe(true);

    // A malformed cursor exercises the real service error response. The page
    // must return to the first page without retrying the failed cursor.
    if (!(await expandedSearch.isVisible())) {
      await page
        .getByRole("button", { name: "Search identities", exact: true })
        .click();
    }
    await expandedSearch.fill("fixture ");
    await nextPage.click({ trial: true });
    let failedCursorReads = 0;
    let rejectCursor = true;
    await page.route("**/rpc/workspace/invoke", async (route) => {
      const body = route.request().postDataJSON();
      if (body.json?.operation === "usersList" && body.json.input.cursor) {
        if (rejectCursor) {
          failedCursorReads += 1;
        }
        body.json.input.cursor = rejectCursor ? "" : "zzzz";
        return route.continue({ postData: JSON.stringify(body) });
      }
      return route.continue();
    });
    await nextPage.click();
    await page.getByRole("alert").waitFor();
    const failedAttempts = failedCursorReads;
    expect(failedAttempts).toBeGreaterThan(0);
    expect(await nextPage.isDisabled()).toBe(true);
    await capturePaging(page, "identity-error-mobile");
    await page.setViewportSize({ width: 1280, height: 900 });
    await firstPage.click({ trial: true });
    await page
      .getByRole("button", { name: "Console access", exact: true })
      .click({ trial: true });
    await capturePaging(page, "identity-error-desktop");
    await firstPage.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("link", { name: "Fixture member", exact: true })
      .waitFor();
    if (!(await expandedSearch.isVisible())) {
      await page
        .getByRole("button", { name: "Search identities", exact: true })
        .click();
    }
    expect(await expandedSearch.inputValue()).toBe("fixture ");
    expect(await applied.textContent()).toBe(filterSummary);
    expect(failedCursorReads).toBe(failedAttempts);
    // A directory can shrink between pages. An empty later page is not an
    // empty directory, and must retain the same first-page recovery.
    rejectCursor = false;
    await nextPage.click();
    await page
      .getByRole("heading", { name: "No identities on this page", exact: true })
      .waitFor();
    await capturePaging(page, "identity-empty-page-desktop");
    await firstPage.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("link", { name: "Fixture member", exact: true })
      .waitFor();
    await page.unroute("**/rpc/workspace/invoke");
    if (!(await expandedSearch.isVisible())) {
      await page
        .getByRole("button", { name: "Search identities", exact: true })
        .click();
    }
    await expandedSearch.fill("");
    await page
      .getByRole("button", { name: "Collapse search identities", exact: true })
      .click();
    for (const field of ["Name", "Status"]) {
      await editCondition(field);
      await page
        .getByRole("button", { name: `Remove ${field} condition`, exact: true })
        .click();
      await doneFilters();
    }
    await page
      .getByRole("button", { name: "Search identities", exact: true })
      .click();
    await page
      .getByRole("searchbox", { name: "Search identities" })
      .fill("no-matching-fixture");
    await page
      .getByRole("heading", { name: "No identities match", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Clear search identities", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Fixture member", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Fixture member", exact: true })
      .waitFor();
    expect(page.url()).toContain("/identity/users/");
    await page.goto(`${origin}/access/`);
    await page.getByRole("table", { name: "Members", exact: true }).waitFor();
    expect(
      await page
        .getByRole("combobox", { name: "Existing identity", exact: true })
        .isVisible()
    ).toBe(false);
    await page.getByRole("button", { name: "Add member", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("combobox", { name: "Existing identity", exact: true })
      .click();
    await page.getByRole("option", { name: /Fixture member/ }).click();
    const picker = page.getByRole("region", {
      name: "Select existing identity",
      exact: true,
    });
    await picker
      .getByRole("button", { name: "Next page", exact: true })
      .click();
    await picker
      .getByRole("button", { name: "First page", exact: true })
      .focus();
    expect(
      await picker
        .getByRole("combobox", { name: "Existing identity", exact: true })
        .textContent()
    ).toContain("fixture-member@localhost.test");
    await page.keyboard.press("Enter");
    expect(
      await picker
        .getByRole("button", { name: "First page", exact: true })
        .count()
    ).toBe(0);
    expect(
      await picker
        .getByRole("combobox", { name: "Existing identity", exact: true })
        .textContent()
    ).toContain("Fixture member");
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
    // Wrapped subject IDs must remain readable and selecting a row must open its actual role.
    const memberEntry = page.getByRole("button", {
      name: `Inspect member ${colleague}`,
      exact: true,
    });
    expect(
      await memberEntry.evaluate(
        (node) => node.scrollHeight <= node.clientHeight
      )
    ).toBe(true);
    await memberEntry.click();
    expect(
      await page
        .getByRole("combobox", { name: "Membership role", exact: true })
        .textContent()
    ).toMatch(/read.?only/i);
    await page
      .getByRole("button", { name: "Close membership editor", exact: true })
      .click();
    await page.getByRole("tab", { name: "Roles", exact: true }).click();
    expect(page.url()).toContain("/access/roles");
    await page
      .getByRole("button", { name: "Inspect role readonly", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Role readonly", exact: true })
      .getByText(/users.list/)
      .waitFor();
    await inBounds(page);
    await page.getByRole("button", { name: "Close role", exact: true }).click();
    await page
      .getByRole("button", { name: "Create role", exact: true })
      .click();
    const roleForm = page.getByRole("form", {
      name: "Create custom role",
      exact: true,
    });
    await roleForm.getByLabel("Role ID", { exact: true }).fill("fixture-role");
    await roleForm
      .getByLabel("Role name", { exact: true })
      .fill("Fixture permissions");
    // Closing an overlay unmounts its fields. The page must retain the draft.
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Create role", exact: true })
      .waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Create role", exact: true })
      .click();
    expect(
      await roleForm.getByLabel("Role ID", { exact: true }).inputValue()
    ).toBe("fixture-role");
    expect(
      await roleForm.getByLabel("Role name", { exact: true }).inputValue()
    ).toBe("Fixture permissions");
    // Send an invalid field through the actual adapter to exercise Engine -> RPC -> Form.
    // No fake error response, credential or external service is involved.
    let roleWrites = 0;
    let rejectRole = true;
    const holdRole = Promise.withResolvers<undefined>();
    await page.route("**/rpc/workspace/invoke", async (route) => {
      const body = route.request().postDataJSON();
      if (body.json?.operation !== "rolesSave") {
        return route.continue();
      }
      roleWrites += 1;
      await holdRole.promise;
      if (rejectRole) {
        body.json.input.label = "";
        return route.continue({ postData: JSON.stringify(body) });
      }
      return route.continue();
    });
    await roleForm
      .getByRole("combobox", { name: "Role template", exact: true })
      .click();
    await page.getByRole("option", { name: /read.?only/i }).click();
    await page
      .getByRole("dialog", { name: "Create role", exact: true })
      .getByRole("button", { name: "Create custom role", exact: true })
      .click();
    const confirmRole = page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true });
    // Two native activations in one task catch guards that rely only on a React render.
    await confirmRole.evaluate((node: HTMLButtonElement) => {
      node.click();
      node.click();
    });
    await page.waitForFunction(
      () => !!document.querySelector('[role="alertdialog"][aria-busy="true"]')
    );
    expect(await confirmRole.isDisabled()).toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.getByRole("alertdialog").isVisible()).toBe(true);
    holdRole.resolve(undefined);
    await roleForm.getByText("Check this value.", { exact: true }).waitFor();
    expect(roleWrites).toBe(1);
    expect(
      await roleForm
        .getByLabel("Role name", { exact: true })
        .getAttribute("aria-invalid")
    ).toBe("true");
    expect(
      await roleForm.getByLabel("Role ID", { exact: true }).inputValue()
    ).toBe("fixture-role");
    expect(
      await page
        .getByRole("button", {
          name: "Reload administration data",
          exact: true,
        })
        .count()
    ).toBe(0);
    const described = await roleForm
      .getByLabel("Role name", { exact: true })
      .getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    expect(
      await page.locator(`[id="${described!.split(" ").at(-1)}"]`).textContent()
    ).toContain("Check this value.");
    if (process.env.LENSO_ADMIN_SCREENSHOTS) {
      await mkdir(process.env.LENSO_ADMIN_SCREENSHOTS, { recursive: true });
      await page.screenshot({
        path: path.join(
          process.env.LENSO_ADMIN_SCREENSHOTS,
          "role-validation.png"
        ),
      });
    }
    rejectRole = false;
    await roleForm
      .getByLabel("Role name", { exact: true })
      .fill("Fixture permissions corrected");
    await roleForm
      .getByLabel("Role name", { exact: true })
      .fill("Fixture permissions");
    await roleForm.getByLabel("Role name", { exact: true }).press("Enter");
    await confirmRole.click();
    await page
      .getByRole("button", { name: "Retry session", exact: true })
      .click();
    expect(roleWrites).toBe(2);
    await page.unroute("**/rpc/workspace/invoke");
    const roleEditor = page.getByRole("region", {
      name: "Role Fixture permissions",
      exact: true,
    });
    await page
      .getByRole("button", {
        name: "Inspect role Fixture permissions",
        exact: true,
      })
      .click();
    await roleEditor
      .getByRole("checkbox", { name: "users.read", exact: true })
      .uncheck();
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Fixture permissions", exact: true })
      .waitFor({ state: "hidden" });
    await page
      .getByRole("button", {
        name: "Inspect role Fixture permissions",
        exact: true,
      })
      .click();
    expect(
      await roleEditor
        .getByRole("checkbox", { name: "users.read", exact: true })
        .isChecked()
    ).toBe(false);
    for (const [width, theme] of [
      [390, "dark"],
      [1280, "light"],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const save = roleEditor.getByRole("button", {
        name: "Save permissions",
        exact: true,
      });
      await save.scrollIntoViewIfNeeded();
      await save.click({ trial: true });
      await inBounds(page);
      expect(
        await save.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return (
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.top >= 0 &&
            box.bottom <= innerHeight &&
            node.contains(
              document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2
              )
            )
          );
        })
      ).toBe(true);
      if (process.env.LENSO_ADMIN_SCREENSHOTS) {
        await page.screenshot({
          path: path.join(
            process.env.LENSO_ADMIN_SCREENSHOTS,
            `role-draft-${width}.png`
          ),
        });
      }
    }
    await roleEditor
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    expect(
      await roleEditor
        .getByRole("checkbox", { name: "users.read", exact: true })
        .isChecked()
    ).toBe(true);
    expect(
      await roleEditor
        .getByRole("button", { name: "Save permissions", exact: true })
        .isDisabled()
    ).toBe(true);
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
    await page
      .getByRole("button", {
        name: "Inspect role Fixture permissions",
        exact: true,
      })
      .click();
    expect(
      await roleEditor
        .getByRole("checkbox", { name: "users.read", exact: true })
        .isChecked()
    ).toBe(false);
    await page.goto(`${origin}/agent-connections/`);
    await page
      .getByRole("button", { name: "Create personal token", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "Create token", exact: true })
        .isVisible()
    ).toBe(false);
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
    expect(
      await page.getByText("Connect an MCP client", { exact: true }).count()
    ).toBe(0);
    await page.getByRole("tab", { name: "Tokens", exact: true }).click();
    await page
      .getByRole("button", { name: "Create personal token", exact: true })
      .click();
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
    const delivery = page.getByRole("dialog", {
      name: "Save your full PAT now",
      exact: true,
    });
    await delivery.waitFor();
    // Visibility can precede the modal's queued initial-focus frame.
    // Observe that transition without moving focus or dismissing the secret.
    try {
      await page.waitForFunction(
        (node) => !!node?.contains(document.activeElement),
        await delivery.elementHandle(),
        { timeout: 5000 }
      );
    } catch (error) {
      console.error(
        "PAT delivery focus observation failed",
        await delivery
          .evaluate((node) => ({
            dialogRect: node.getBoundingClientRect().toJSON(),
            dialogInert: !!node.closest("[inert]"),
            containsFocus: node.contains(document.activeElement),
            activeTag: document.activeElement?.tagName,
            activeRole: document.activeElement?.getAttribute("role"),
            activeRect: document.activeElement
              ?.getBoundingClientRect()
              .toJSON(),
          }))
          .catch(() => ({ unavailable: true }))
      );
      throw error;
    }
    expect(
      await delivery.evaluate((node) => node.contains(document.activeElement))
    ).toBe(true);
    await page.keyboard.press("Escape");
    expect(await delivery.isVisible()).toBe(true);
    expect(await delivery.locator("pre").textContent()).toBe(oneTime);
    await page
      .getByRole("button", { name: "I've saved the full PAT", exact: true })
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
      .getByRole("button", { name: "Create personal token", exact: true })
      .click();
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
