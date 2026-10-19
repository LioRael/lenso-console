import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let url: string;
const output = fileURLToPath(
  new URL("../../../../output/playwright/", import.meta.url)
);
beforeAll(async () => {
  server = await createServer({
    configFile: fileURLToPath(new URL("vite.config.ts", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  url = `${server.resolvedUrls!.local[0]}packages/auth-console/test/browser/identity.html`;
  await mkdir(output, { recursive: true });
});
afterAll(async () => {
  await server?.close();
});

declare global {
  interface Window {
    identityFixture: {
      requests: Record<string, number>;
      navigations: string[];
      revoke(): void;
    };
  }
}
const counts = (page: Page) =>
  page.evaluate(() => ({
    ...window.identityFixture.requests,
  }));

test("identity detail restores directory query and cursor, scopes session refresh and withdraws revoked permission", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const filter = {
      id: "identities",
      operator: "and",
      children: [
        { id: "active", field: "status", operator: "equals", value: "active" },
      ],
    };
    const state = encodeURIComponent(
      JSON.stringify({ search: "", conditions: [], filter })
    );
    await page.goto(`${url}?routes&paged&directory=${state}`);
    await page
      .getByRole("button", { name: "Search identities", exact: true })
      .click();
    const search = page.getByRole("searchbox", {
      name: "Search identities",
      exact: true,
    });
    await search.fill("Sample editor");
    const editor = page.getByRole("link", {
      name: "Sample editor",
      exact: true,
    });
    await editor.waitFor();
    expect(await editor.getAttribute("href")).toContain("directory=");
    await editor.click();
    await page
      .getByRole("heading", { name: "Console access", exact: true })
      .waitFor();
    expect(
      await page.getByText("Active membership", { exact: true }).count()
    ).toBe(1);
    await page
      .getByRole("button", { name: "Permission sources", exact: true })
      .click();
    await page
      .getByRole("table", { name: "Permission sources", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Back to identities", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Search identities", exact: true })
      .click();
    expect(await search.inputValue()).toBe("Sample editor");
    expect(
      await page.evaluate(
        () =>
          JSON.parse(new URLSearchParams(location.search).get("directory")!)
            .filter
      )
    ).toEqual(filter);
    await search.fill("No such person");
    await page
      .getByRole("heading", { name: "No identities match", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Clear search and filters", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Sample operator", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page
      .getByRole("link", { name: "Sample viewer", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Sample viewer", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Back to identities", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Sample viewer", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("link", { name: "Sample operator", exact: true })
        .count()
    ).toBe(0);

    await page.goto(`${url}?subject=sample-editor`);
    await page.getByRole("table", { name: "Sessions", exact: true }).waitFor();
    const before = await counts(page);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
      .getByRole("button", { name: "Copy subject", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page.getByText("Copied", { exact: true }).waitFor();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "sample-editor"
    );
    const revokeButton = page
      .getByRole("button", { name: "Revoke", exact: true })
      .first();
    await revokeButton.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alertdialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    expect(
      await revokeButton.evaluate(
        (element) => document.activeElement === element
      )
    ).toBe(true);
    await revokeButton.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await page.getByText("Change completed.", { exact: true }).waitFor();
    const after = await counts(page);
    expect(after.info).toBe(before.info! + 1);
    expect(after.sessionsList).toBe(before.sessionsList! + 1);
    for (const key of ["usersRead", "accessRead", "permissionsRead"]) {
      expect(after[key]).toBe(before[key]);
    }
    await Bun.write(
      `${output}/invalidation-after.json`,
      JSON.stringify({ before, after }, null, 2)
    );
    await page.screenshot({
      path: `${output}/after-detail.png`,
      fullPage: true,
    });

    await page.evaluate(() => window.identityFixture.revoke());
    await page
      .getByRole("button", { name: "Revoke", exact: true })
      .last()
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await page
      .getByText("You do not have permission for users.read.", { exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("heading", { name: "Sample editor", exact: true })
        .count()
    ).toBe(0);
    expect(
      await page.getByRole("button", { name: "Revoke", exact: true }).count()
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);

test("identity distinguishes empty, unavailable, denied and unsupported states; template submits real navigation", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    isMobile: true,
    hasTouch: true,
  });
  try {
    await page.goto(`${url}?state=empty`);
    await page
      .getByRole("heading", { name: "No identities yet", exact: true })
      .waitFor();
    await page.goto(`${url}?state=failure`);
    await page.getByRole("alert").waitFor();
    expect(
      await page
        .getByRole("button", { name: "Reload data", exact: true })
        .count()
    ).toBe(1);
    await page.goto(`${url}?state=denied`);
    await page
      .getByText("You do not have permission for users.list.", { exact: true })
      .waitFor();
    const deniedCounts = await counts(page);
    expect(deniedCounts.usersList).toBeUndefined();
    await page.goto(`${url}?subject=sample-editor&state=unsupported`);
    await page
      .getByText(
        "This identity source does not support session administration.",
        { exact: true }
      )
      .waitFor();
    const unsupportedCounts = await counts(page);
    expect(unsupportedCounts.sessionsList).toBeUndefined();
    await page.goto(`${url}?subject=sample-editor`);
    await page
      .getByRole("heading", { name: "Sample editor", exact: true })
      .waitFor();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    const revoke = await page
      .getByRole("button", { name: "Revoke", exact: true })
      .first()
      .boundingBox();
    expect(
      revoke !== null && revoke.x >= 0 && revoke.x + revoke.width <= 390
    ).toBe(true);
    await page.screenshot({
      path: `${output}/after-detail-mobile.png`,
      fullPage: true,
    });
    await page.goto(`${url}?template`);
    const reference = page.getByLabel("Order reference", { exact: true });
    await reference.fill("42");
    await reference.press("Enter");
    expect(
      await page.evaluate(() => window.identityFixture.navigations)
    ).toContain("/identity/orders/42");
    await page.screenshot({
      path: `${output}/after-template-mobile.png`,
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}, 60_000);
