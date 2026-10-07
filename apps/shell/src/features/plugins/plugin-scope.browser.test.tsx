import { ThemeScope } from "@lenso/ui";
import * as stylex from "@stylexjs/stylex";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import {
  HostConsoleLocaleProvider,
  useConsoleLocale,
} from "../../app/console-locale";

import "@lenso/tokens/styles.css";
import { ConsoleFrame } from "../../components/runtime/console-frame";
import { shellStyles } from "../../components/runtime/console-shell.stylex";
import { useConsoleNavigation } from "../../components/runtime/use-console-navigation";
import {
  AppManagementProvider,
  type ManagedApp,
} from "../apps/app-management-context";
import { PluginAgentWorkbenchProvider } from "./plugin-agent-workbench-context";
import { PluginDetailPage } from "./plugin-detail-page";
import { PluginWorkbenchPage } from "./plugin-workbench-page";

function LocaleSwitch() {
  const { setPreference } = useConsoleLocale();
  return (
    <button onClick={() => setPreference("zh-CN")}>Switch to Chinese</button>
  );
}

function WorkbenchFrame() {
  const navigation = useConsoleNavigation("/plugins");
  return (
    <ConsoleFrame
      navigation={navigation}
      title="Plugins"
      toolbar={<header {...stylex.props(shellStyles.header)} />}
      rail={
        <nav
          aria-label="Primary navigation"
          {...stylex.props(shellStyles.rail)}
        />
      }
      sidebar="Plugins"
    >
      <Outlet />
    </ConsoleFrame>
  );
}

test("manages non-Agent Apps without an Agent identity provider and keeps all scopes isolated", async () => {
  // Locale is now supplied by the owner API, not the retired browser-local preference.
  // Keep the real provider and asynchronous catalog load; only supply this fixture's account snapshot.
  let preference = "en";
  const originalFetch = window.fetch.bind(window);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href
      );
      if (/\/api\/console\/v1\/locale(?:\/preference)?$/.test(url.pathname)) {
        if (init?.method === "PUT") {
          ({ preference } = JSON.parse(String(init.body)));
        }
        return Response.json({
          global_default: "en",
          preference,
          available: true,
          can_manage_default: false,
        });
      }
      return originalFetch(input, init);
    })
  );
  const rootRoute = createRootRoute({ component: WorkbenchFrame });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/plugins",
        component: PluginWorkbenchPage,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/plugins/$agentId/$packageId/$instanceKey",
        component: () => {
          const params = router.state.matches.at(-1)!.params as {
            agentId: string;
            packageId: string;
            instanceKey: string;
          };
          return <PluginDetailPage {...params} />;
        },
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/plugins"] }),
  });
  await router.load();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    flushSync(() =>
      root.render(
        <ThemeScope>
          <HostConsoleLocaleProvider>
            <LocaleSwitch />
            <QueryClientProvider client={client}>
              <AppManagementProvider>
                <PluginAgentWorkbenchProvider>
                  <RouterProvider router={router} />
                </PluginAgentWorkbenchProvider>
              </AppManagementProvider>
            </QueryClientProvider>
          </HostConsoleLocaleProvider>
        </ThemeScope>
      )
    );
    await page.getByRole("combobox", { name: "Manage App" }).click();
    await page
      .getByRole("option", { name: "Support App", exact: true })
      .click();
    const plugin = page.getByTitle("example.support.tickets/default");
    await expect
      .element(plugin)
      .toHaveAttribute(
        "href",
        "/plugins/support/example.support.tickets/default"
      );
    await expect
      .element(
        page.getByRole("heading", { name: "Plugins", level: 1, exact: true })
      )
      .toBeVisible();
    const search = page.getByRole("searchbox", { name: "Search plugins" });
    await expect
      .element(page.getByRole("columnheader", { name: "Package", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("cell", { name: "default", exact: true }))
      .toBeVisible();
    let searchRestingStyles = focusStyles(search.element());
    search.element().focus();
    await userEvent.keyboard("{Tab}{Shift>}{Tab}{/Shift}");
    await expect.element(search).toHaveFocus();
    expectUnclippedFocus(search.element(), searchRestingStyles);
    const pluginRestingStyles = focusStyles(plugin.element());
    plugin.element().focus();
    await userEvent.keyboard("{Tab}{Shift>}{Tab}{/Shift}");
    await expect.element(plugin).toHaveFocus();
    expectUnclippedFocus(plugin.element(), pluginRestingStyles);
    await page.viewport(375, 800);
    await expect
      .element(page.getByRole("columnheader", { name: "Package", exact: true }))
      .not.toBeInTheDocument();
    searchRestingStyles = focusStyles(search.element());
    search.element().focus();
    expectUnclippedFocus(search.element(), searchRestingStyles);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375);
    const apps = client.getQueryData<readonly ManagedApp[]>([
      "app-management-catalog",
    ]);
    if (!apps) {
      throw new Error("Managed App fixture was not loaded");
    }
    client.setQueryData(
      ["app-management-catalog"],
      apps.map((app) => ({
        ...app,
        label:
          app.id === "support"
            ? "Support App for multilingual research and production operations"
            : app.label,
      }))
    );
    await page.viewport(320, 800);
    const main = page.getByRole("main").element();
    await expect.poll(() => main.scrollWidth <= main.clientWidth).toBe(true);
    expectUnclippedFocus(search.element(), searchRestingStyles);
    client.setQueryData(["app-management-catalog"], apps);
    await page.viewport(1280, 800);
    await search.fill("tickets");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const category = page.getByRole("combobox", { name: "Plugin category" });
    const selection = page.getByRole("combobox", { name: "Plugin selection" });
    await category.click();
    await page.getByRole("option", { name: /^Uncategorized/ }).click();
    await selection.click();
    await page.getByRole("option", { name: "Enabled", exact: true }).click();
    await expect.element(plugin).toBeVisible();
    await page.getByRole("combobox", { name: "Manage App" }).click();
    await page
      .getByRole("option", { name: "Console management Agent", exact: true })
      .click();
    await expect
      .element(page.getByTitle("lenso.agent.loop/agent"))
      .toHaveAttribute("href", "/plugins/console/lenso.agent.loop/agent");
    await expect.element(search).toHaveValue("");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect.element(category).toHaveTextContent(/^All/);
    await expect.element(selection).toHaveTextContent("All states");
    await search.fill("loop");
    await page.getByRole("combobox", { name: "Manage App" }).click();
    await page.getByRole("option", { name: "Console", exact: true }).click();
    await expect
      .element(
        page.getByRole("heading", { name: "Plugin management unavailable" })
      )
      .toBeVisible();
    await expect.element(plugin).not.toBeInTheDocument();
    await page.getByRole("combobox", { name: "Manage App" }).click();
    await page
      .getByRole("option", { name: "Support App", exact: true })
      .click();
    await expect
      .element(plugin)
      .toHaveAttribute(
        "href",
        "/plugins/support/example.support.tickets/default"
      );
    await expect.element(search).toHaveValue("tickets");
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect.element(category).toHaveTextContent(/^Uncategorized/);
    await expect.element(selection).toHaveTextContent("Enabled");
    await page
      .getByRole("searchbox", { name: "Search plugins" })
      .fill("missing-plugin");
    await expect
      .element(page.getByRole("heading", { name: "No matching Plugins" }))
      .toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page
      .getByRole("searchbox", { name: "Search plugins" })
      .fill("tickets");
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect.element(search).toHaveValue("");
    await expect.element(search).toHaveFocus();
    await search.fill("tickets");
    const pluginRow = page.getByRole("row", {
      name: /Example support tickets/,
    });
    await pluginRow.getByRole("cell").last().click();
    await expect
      .element(page.getByRole("tab", { name: "Overview", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Edit configuration" }).click();
    await expect
      .element(page.getByRole("tab", { name: "Configuration", exact: true }))
      .toHaveFocus();
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect
      .element(
        page.getByRole("heading", { name: "Capabilities & contributions" })
      )
      .toBeVisible();
    await page.getByRole("button", { name: "View dependencies" }).click();
    await expect
      .element(page.getByRole("tab", { name: "Dependencies", exact: true }))
      .toHaveFocus();
    await expect
      .element(page.getByRole("heading", { name: "Package and authority" }))
      .toBeVisible();
    await router.navigate({ to: "/plugins" });
    await expect
      .element(page.getByRole("searchbox", { name: "Search plugins" }))
      .toHaveValue("tickets");
    pluginRow.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("tab", { name: "Overview", exact: true }))
      .toBeVisible();
    await router.navigate({ to: "/plugins" });
    await page.getByRole("button", { name: "Switch to Chinese" }).click();
    await expect
      .element(page.getByRole("searchbox", { name: "搜索插件" }))
      .toHaveValue("tickets");
    await expect
      .element(page.getByRole("combobox", { name: "选择管理对象" }))
      .toBeVisible();
    await expect
      .element(page.getByTitle("example.support.tickets/default"))
      .toHaveAttribute(
        "href",
        "/plugins/support/example.support.tickets/default"
      );
    await page.getByRole("combobox", { name: "选择管理对象" }).click();
    await expect
      .element(page.getByText("控制台扩展", { exact: true }))
      .toBeVisible();
  } finally {
    await page.viewport(1280, 800);
    flushSync(() => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
    document.documentElement.lang = "en";
  }
});

function focusStyles(input: Element) {
  const result = new Map<Element, string>();
  for (
    let element: Element | null = input;
    element;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    result.set(element, `${style.outline}|${style.boxShadow}`);
  }
  return result;
}

function expectUnclippedFocus(
  input: Element,
  resting: ReadonlyMap<Element, string>
) {
  expect(input.matches(":focus-visible")).toBe(true);
  let owner = input;
  let hasIndicator = false;
  while (owner.parentElement) {
    const style = getComputedStyle(owner);
    const visible =
      (style.outlineStyle !== "none" &&
        Number(style.outlineWidth.replace("px", "")) > 0) ||
      style.boxShadow !== "none";
    if (
      visible &&
      resting.get(owner) !== `${style.outline}|${style.boxShadow}`
    ) {
      hasIndicator = true;
      break;
    }
    owner = owner.parentElement;
  }
  expect(hasIndicator).toBe(true);
  const bounds = owner.getBoundingClientRect();
  let clippingAncestors = 0;
  for (
    let parent = owner.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    const clip = parent.getBoundingClientRect();
    if (["auto", "hidden", "clip", "scroll"].includes(style.overflowX)) {
      clippingAncestors += 1;
      expect(bounds.left - clip.left).toBeGreaterThanOrEqual(4);
      expect(clip.right - bounds.right).toBeGreaterThanOrEqual(4);
    }
    if (["auto", "hidden", "clip", "scroll"].includes(style.overflowY)) {
      clippingAncestors += 1;
      expect(bounds.top - clip.top).toBeGreaterThanOrEqual(4);
      expect(clip.bottom - bounds.bottom).toBeGreaterThanOrEqual(4);
    }
  }
  expect(clippingAncestors).toBeGreaterThan(0);
}
