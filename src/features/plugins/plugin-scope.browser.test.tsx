import { ThemeScope } from "@lenso/ui/theme-scope";
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
import { expect, test } from "vitest";
import { page } from "vitest/browser";

import {
  HostConsoleLocaleProvider,
  useConsoleLocale,
} from "../../app/console-locale";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { AppManagementProvider } from "../apps/app-management-context";
import { PluginAgentWorkbenchProvider } from "./plugin-agent-workbench-context";
import { PluginDetailPage } from "./plugin-detail-page";
import { PluginWorkbenchPage } from "./plugin-workbench-page";

function LocaleSwitch() {
  const { setPreference } = useConsoleLocale();
  return (
    <button onClick={() => setPreference("zh-CN")}>Switch to Chinese</button>
  );
}

test("manages non-Agent Apps without an Agent identity provider and keeps all scopes isolated", async () => {
  const previousLanguage = localStorage.getItem(
    "lenso-console:language-preference"
  );
  localStorage.setItem(
    "lenso-console:language-preference",
    JSON.stringify("en")
  );
  const rootRoute = createRootRoute({ component: Outlet });
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
    await page.getByRole("combobox", { name: "Manage App" }).click();
    await page
      .getByRole("option", { name: "Console management Agent", exact: true })
      .click();
    await expect
      .element(page.getByTitle("lenso.agent.loop/agent"))
      .toHaveAttribute("href", "/plugins/console/lenso.agent.loop/agent");
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
    await plugin.click();
    await expect
      .element(page.getByRole("tab", { name: "Configuration", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "About", exact: true }).click();
    await expect
      .element(page.getByRole("heading", { name: "Provided capabilities" }))
      .toBeVisible();

    await expect
      .element(page.getByRole("heading", { name: "Package and authority" }))
      .toBeVisible();
    await router.navigate({ to: "/plugins" });
    await expect
      .element(page.getByRole("searchbox", { name: "Search plugins" }))
      .toHaveValue("tickets");
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
    flushSync(() => root.unmount());
    client.clear();
    container.remove();
    if (previousLanguage === null) {
      localStorage.removeItem("lenso-console:language-preference");
    } else {
      localStorage.setItem(
        "lenso-console:language-preference",
        previousLanguage
      );
    }
    document.documentElement.lang = "en";
  }
});
