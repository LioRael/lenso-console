import { ThemeScope } from "@lenso/ui/theme-scope";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { page } from "vitest/browser";

import {
  editPluginConfigurationDraft,
  PluginConfigurationDraftStore,
} from "./plugin-configuration-draft";
import { PluginDraftNavigationGuard } from "./plugin-draft-navigation-guard";

test("keeps a draft on cancelled navigation and leaves only after confirmation", async () => {
  const store = new PluginConfigurationDraftStore();
  const source = { sourceDigest: "base", toml: "" };
  store.set("plugin", source, (current) =>
    editPluginConfigurationDraft(current, source, 'name = "draft"')
  );
  function Editor() {
    return (
      <>
        <PluginDraftNavigationGuard store={store} />
        <Link to="/settings">Settings</Link>
      </>
    );
  }
  const rootRoute = createRootRoute({ component: Outlet });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: Editor,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/settings",
      component: () => <h1>Destination</h1>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    flushSync(() =>
      root.render(
        <ThemeScope>
          <RouterProvider router={router} />
        </ThemeScope>
      )
    );
    await page.getByRole("link", { name: "Settings" }).click();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Keep editing" }).click();
    expect(router.state.location.pathname).toBe("/");
    expect(store.get("plugin")?.value).toBe('name = "draft"');
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Leave page" }).click();
    await expect
      .element(page.getByRole("heading", { name: "Destination" }))
      .toBeVisible();
  } finally {
    flushSync(() => root.unmount());
    container.remove();
  }
});
