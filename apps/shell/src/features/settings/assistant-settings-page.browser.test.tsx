import { ThemeScope } from "@lenso/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import "@lenso/tokens/styles.css";
import "../../styles.css";
import { ConsoleSession } from "../../app/console-session";
import { AssistantSettingsPage } from "./assistant-settings-page";

vi.mock("../../dev/console-dev-config", () => ({
  consoleDevConfig: { mode: "production" },
}));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const providers = [
  { id: "alpha", label: "Team Alpha", model: "model-alpha" },
  { id: "beta", label: "Private Beta", model: "model-beta" },
];

beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Focus the browser runner before mounting the session focus listener.
  await userEvent.keyboard("{Escape}");
});

afterEach(async () => {
  flushSync(() => root.unmount());
  container.remove();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await page.viewport(1280, 800);
});

function mount(theme: "light" | "dark" = "light") {
  flushSync(() =>
    root.render(
      <ThemeScope theme={theme}>
        <ConsoleSession>
          <QueryClientProvider client={client}>
            <AssistantSettingsPage />
          </QueryClientProvider>
        </ConsoleSession>
      </ThemeScope>
    )
  );
}

function mockBackend({ enabled = true, rejectWrite = false } = {}) {
  let selected: string | null = "alpha";
  let hasByok = false;
  const writes: unknown[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/console/v1/session") {
        return Response.json({
          mode: "required",
          authenticated: true,
          subject: "member-alice",
          administrator: false,
          assistant_enabled: enabled,
          workspace_ids: [],
        });
      }
      if (path === "/auth/methods") {
        return Response.json({ methods: [] });
      }
      if (path !== "/api/console/v1/assistant/settings") {
        throw new Error(`Unexpected request: ${path}`);
      }
      if (init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));
        if (rejectWrite) {
          return Response.json(
            { detail: "private synthetic credential must not reach the UI" },
            {
              status: 403,
              headers: { "content-type": "application/problem+json" },
            }
          );
        }
        const update = JSON.parse(String(init.body)) as {
          provider_id: string | null;
          byok?: unknown;
        };
        selected = update.provider_id;
        if ("byok" in update) {
          hasByok = update.byok !== null;
        }
        return new Response(null, { status: 204 });
      }
      return Response.json({
        providers,
        selected_provider_id: selected,
        byok_enabled: true,
        has_byok: hasByok,
        api_key: "backend-only-synthetic-secret",
      });
    }
  );
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, writes };
}

// Prevents a granted Console member from needing admin/global configuration and
// prevents credentials from surviving in query/mutation caches after saving.
// Existing settings tests only checked appearance and global Agent connections.
test("a member saves their provider and BYOK without retaining credentials", async () => {
  const { writes } = mockBackend();
  mount();
  const trigger = page.getByRole("combobox", { name: "Assistant provider" });
  await expect.element(trigger).toBeVisible();
  await page.viewport(1280, 800);
  await userEvent.hover(trigger);
  trigger.element().focus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Private Beta" }).click();
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("Assistant settings saved.");
  expect(writes).toEqual([{ provider_id: "beta" }]);

  const key = "synthetic-alice-key";
  const input = page.getByLabelText("New API key");
  await input.fill(key);
  await page
    .getByRole("button", { name: "Save personal key", exact: true })
    .click();
  await expect.element(input).toHaveValue("");
  await expect
    .element(page.getByText("A personal key is saved."))
    .toBeVisible();
  expect(writes[1]).toEqual({
    provider_id: "beta",
    byok: { provider_id: "beta", api_key: key },
  });
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data)
    )
  ).not.toContain(key);
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data)
    )
  ).not.toContain("backend-only-synthetic-secret");
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  expect(JSON.stringify(localStorage)).not.toContain(key);
  expect(JSON.stringify(sessionStorage)).not.toContain(key);

  await page.getByRole("button", { name: "Remove personal key" }).click();
  await expect
    .element(page.getByText("No personal key is saved."))
    .toBeVisible();
  expect(writes[2]).toEqual({ provider_id: "beta", byok: null });
});

test("denied members never load personal settings and revoked writes hide controls", async () => {
  const denied = mockBackend({ enabled: false });
  mount();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("Assistant access is not enabled");
  expect(
    denied.fetcher.mock.calls.some(([input]) =>
      String(input).includes("assistant/settings")
    )
  ).toBe(false);
  await expect
    .element(page.getByLabelText("New API key"))
    .not.toBeInTheDocument();

  mockBackend({ rejectWrite: true });
  window.dispatchEvent(new Event("lenso-session-expired"));
  const input = page.getByLabelText("New API key");
  await expect.element(input).toBeVisible();
  await input.fill("synthetic-key-for-rejection");
  await page
    .getByRole("button", { name: "Save personal key", exact: true })
    .click();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("You do not have permission");
  await expect.element(input).not.toBeInTheDocument();
  expect(container.textContent).not.toContain("private synthetic credential");
});

// Browser geometry, popup placement, and keyboard focus are native dependencies
// that cannot be established by the request/permission tests above.
test.each(["light", "dark"] as const)(
  "provider controls fit desktop and narrow layouts with keyboard focus (%s)",
  async (theme) => {
    mockBackend();
    mount(theme);
    const trigger = page.getByRole("combobox", { name: "Assistant provider" });
    await expect.element(trigger).toBeVisible();
    for (const width of [1280, 390]) {
      await page.viewport(width, 800);
      await userEvent.hover(trigger);
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
      const focusStyle = getComputedStyle(trigger.element());
      expect(
        focusStyle.outlineStyle !== "none" || focusStyle.boxShadow !== "none"
      ).toBe(true);
      if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
        await page.screenshot({
          path: `__screenshots__/assistant-settings-${theme}-${width}.png`,
        });
      }
    }
  }
);
