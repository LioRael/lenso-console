import "@lenso/tokens/styles.css";
import "../../styles.css";
import { ThemeScope } from "@lenso/ui";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { ConsoleAppearanceProvider } from "../../app/console-appearance";
import { HostConsoleLocaleProvider } from "../../app/console-locale";
import { ConsoleSession } from "../../app/console-session";
import { SettingsPage } from "./settings-page";

vi.mock("../../dev/console-dev-config", () => ({
  consoleDevConfig: { mode: "production" },
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  flushSync(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = undefined;
  container = undefined;
  await page.viewport(1280, 800);
});

function mountSettings(theme: "light" | "dark" = "light") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root?.render(
      <HostConsoleLocaleProvider>
        <ConsoleSession>
          <ConsoleAppearanceProvider>
            <ThemeScope theme={theme}>
              <SettingsPage />
              <input aria-label="Unsaved plugin draft" defaultValue="" />
            </ThemeScope>
          </ConsoleAppearanceProvider>
        </ConsoleSession>
      </HostConsoleLocaleProvider>
    )
  );
}

test.each(["light", "dark"] as const)(
  "ordinary settings retain native select keyboard focus and popup geometry (%s)",
  async (theme) => {
    serviceFixture(false);
    mountSettings(theme);
    const trigger = page.getByRole("combobox", {
      name: "Time zone",
      exact: true,
    });
    await expect.element(trigger).toBeVisible();
    for (const width of [1280, 390]) {
      await page.viewport(width, 800);
      trigger.element().blur();
      await userEvent.hover(trigger);
      const restingShadow = getComputedStyle(trigger.element()).boxShadow;
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      const before = trigger.element().getBoundingClientRect();
      trigger.element().focus();
      await userEvent.keyboard("{ArrowDown}");
      await expect.element(page.getByRole("listbox")).toBeVisible();
      const popup = page.getByRole("listbox").element().getBoundingClientRect();
      expect(popup.left).toBeGreaterThanOrEqual(0);
      expect(popup.right).toBeLessThanOrEqual(width);
      await userEvent.keyboard("{Escape}");
      await expect.element(trigger).toHaveFocus();
      const after = trigger.element().getBoundingClientRect();
      expect(after.x).toBe(before.x);
      expect(after.width).toBe(before.width);
      expect(trigger.element().matches(":focus-visible")).toBe(true);
      const focusStyle = getComputedStyle(trigger.element());
      expect(focusStyle.boxShadow).not.toBe(restingShadow);
      expect(
        focusStyle.outlineStyle !== "none" || focusStyle.boxShadow !== "none"
      ).toBe(true);
      if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
        await page.screenshot({
          path: `__screenshots__/settings-native-focus-${theme}-${width}.png`,
        });
      }
    }
  }
);
function reloadSettings() {
  flushSync(() => root?.unmount());
  container?.remove();
  mountSettings();
}

function serviceFixture(canManageDefault: boolean) {
  let account = "alice";
  let globalDefault: "en" | "zh-CN" = "en";
  const preferences = new Map<string, "global" | "en" | "zh-CN">();
  const writes: Array<{
    account: string;
    path: string;
    body: Record<string, unknown>;
  }> = [];
  let sessions = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/session")) {
        sessions += 1;
        return Response.json({
          mode: "required",
          authenticated: true,
          subject: account,
          administrator: false,
          workspace_ids: [],
        });
      }
      if (path.includes("/auth/methods")) {
        return Response.json({ methods: [] });
      }
      if (!path.includes("/api/console/v1/locale")) {
        throw new Error(`Unexpected request: ${path}`);
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ account, path, body });
        if (path.endsWith("/preference")) {
          preferences.set(
            account,
            body.preference as "global" | "en" | "zh-CN"
          );
        } else if (path.endsWith("/default") && canManageDefault) {
          globalDefault = body.locale as "en" | "zh-CN";
        } else {
          return Response.json({}, { status: 403 });
        }
      }
      return Response.json({
        global_default: globalDefault,
        preference: preferences.get(account) ?? "global",
        available: true,
        can_manage_default: canManageDefault,
      });
    })
  );
  return {
    writes,
    preferences,
    get sessions() {
      return sessions;
    },
    setAccount(next: string) {
      account = next;
    },
    setPreference(next: "global" | "en" | "zh-CN") {
      preferences.set(account, next);
    },
  };
}

// Probe-only coverage misses the actual SettingsPage select, permission gating, and persisted value.
test("ordinary accounts can change language through settings without losing a draft or another account inheriting it", async () => {
  const service = serviceFixture(false);
  mountSettings();
  const language = page.getByRole("combobox", {
    name: "Console language",
    exact: true,
  });
  await expect.element(language).toBeEnabled();
  await expect
    .element(page.getByRole("combobox", { name: "Global default language" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByText("Console administration", { exact: true }))
    .not.toBeInTheDocument();
  await page
    .getByLabelText("Unsaved plugin draft")
    .fill("preserve this unsaved draft");
  const draft = container?.querySelector<HTMLInputElement>(
    'input[aria-label="Unsaved plugin draft"]'
  );
  const sessionsBefore = service.sessions;
  await language.click();
  await expect
    .element(page.getByRole("option", { name: "简体中文", exact: true }))
    .toBeVisible();
  await userEvent.keyboard("{End}{Enter}");
  await expect
    .element(page.getByRole("heading", { name: "偏好设置", exact: true }))
    .toBeVisible();
  expect(service.preferences.get("alice")).toBe("zh-CN");
  expect(service.writes).toHaveLength(1);
  expect(service.writes[0]?.path).toContain("/locale/preference");
  expect(service.sessions).toBe(sessionsBefore);
  expect(
    container?.querySelector('input[aria-label="Unsaved plugin draft"]')
  ).toBe(draft);
  expect(draft?.value).toBe("preserve this unsaved draft");
  await expect
    .element(page.getByText("Checking session…", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("combobox", { name: "全局默认语言" }))
    .not.toBeInTheDocument();

  reloadSettings();
  await expect
    .element(page.getByRole("combobox", { name: "Console 语言", exact: true }))
    .toHaveTextContent("简体中文");
  expect(service.writes).toHaveLength(1);
  service.setAccount("bob");
  reloadSettings();
  await expect
    .element(
      page.getByRole("combobox", { name: "Console language", exact: true })
    )
    .toHaveTextContent("Follow global default");
  expect(service.preferences.has("bob")).toBe(false);
  expect(service.preferences.get("alice")).toBe("zh-CN");
});

// Explicit default-management permission must reveal a separate write path, without replacing personal preference.
test("global language management is separate from the account's explicit language choice", async () => {
  const service = serviceFixture(true);
  service.setPreference("en");
  mountSettings();
  const global = page.getByRole("combobox", {
    name: "Global default language",
    exact: true,
  });
  await expect.element(global).toBeEnabled();
  await expect
    .element(page.getByText("Console administration", { exact: true }))
    .toBeVisible();
  await global.click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await expect.element(global).toHaveTextContent("简体中文");
  await expect
    .element(
      page.getByRole("combobox", { name: "Console language", exact: true })
    )
    .toHaveTextContent("English (US)");
  await expect
    .element(page.getByRole("heading", { name: "Preferences", exact: true }))
    .toBeVisible();
  expect(service.preferences.get("alice")).toBe("en");
  expect(service.writes).toHaveLength(1);
  expect(service.writes[0]?.path).toContain("/locale/default");
  expect(service.writes[0]?.body).toEqual({ locale: "zh-CN" });
  await page
    .getByRole("combobox", { name: "Console language", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Follow global default", exact: true })
    .click();
  await expect
    .element(page.getByRole("heading", { name: "偏好设置", exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: "Console 语言", exact: true }))
    .toHaveTextContent("跟随全局默认");
  await expect
    .element(page.getByRole("combobox", { name: "全局默认语言", exact: true }))
    .toHaveTextContent("简体中文");
  expect(service.writes).toHaveLength(2);
  expect(service.writes[1]?.path).toContain("/locale/preference");
  expect(service.writes[1]?.body).toEqual({ preference: "global" });
});
