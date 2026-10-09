import "@lenso/tokens/styles.css";
import "@fontsource-variable/inter";
import "../../styles.css";
import {
  consoleContract,
  type ConsolePluginDescriptor,
} from "@lenso/console-sdk/protocol";
import { ThemeScope } from "@lenso/ui";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { ConsoleLocaleProvider } from "../../../../../../packages/console-authoring/src/locale";
import { loadConsoleMessages } from "../../app/console-i18n";
import type { ConsoleLocale } from "../../app/console-locale";
import { AppManagementProvider } from "../apps/app-management-context";
import { PluginAgentWorkbenchProvider } from "./plugin-agent-workbench-context";
import { PluginDetailPage } from "./plugin-detail-page";
import { PluginWorkbenchPage } from "./plugin-workbench-page";

vi.mock(import("../../app/console-session"), async (original) => ({
  ...(await original()),
  useConsoleSession: () => ({
    subject: "inspector",
    administrator: true,
    assistantEnabled: false,
    managementEnabled: true,
    managementProtocol: "lenso-console-rpc/2" as const,
    humanManagementEnabled: false,
    workspaceIds: [],
  }),
}));
vi.mock(import("../../lib/console-http-paths"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    consoleHttpPaths: {
      ...actual.consoleHttpPaths,
      api_base_path: "/admin/api",
    },
  };
});
vi.mock(import("../../lib/http-client"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    httpClient: actual.httpClient.extend({ prefix: "/" }),
    isApiMode: () => true,
  };
});

const plugin: ConsolePluginDescriptor = {
  id: "mail/eu",
  targetId: "north",
  configuration: {
    state: "resolved",
    writable: false,
    unavailableReason:
      "Startup configuration is read-only here. Change the application-owned source and restart.",
    sources: [{ id: "host-env", kind: "environment" }],
    fields: [
      {
        path: ["credentials", "token"],
        sourceIds: ["host-env"],
        sensitive: true,
      },
    ],
  },
};

function RoutedDetail() {
  const params = useParams({ strict: false }) as {
    agentId: string;
    packageId: string;
    instanceKey: string;
  };
  return <PluginDetailPage {...params} />;
}

async function fixture(
  plugins = [plugin],
  holdInspection = false,
  locale: ConsoleLocale = "en"
) {
  await loadConsoleMessages(locale);
  let denied = false;
  const requests: Request[] = [];
  const targets: string[] = [];
  const rpc = new RPCHandler({
    plugins: implement(consoleContract).plugins.handler(({ input }) => {
      targets.push(input.targetId);
      if (denied) {
        throw new ORPCError("FORBIDDEN");
      }
      return { schemaVersion: 1 as const, plugins };
    }),
  });
  const nativeFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      if (!path.includes("/api/")) {
        return nativeFetch(input, init);
      }
      requests.push(request);
      if (path.endsWith("/apps")) {
        return Response.json({
          apps: [
            {
              id: "north",
              label: "North host",
              scope: "application",
              pluginConfiguration: true,
              agentId: null,
              localBundleInstall: false,
            },
          ],
        });
      }
      if (holdInspection && path.endsWith("/rpc/plugins")) {
        return new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => reject(request.signal.reason),
            { once: true }
          );
        });
      }
      const handled = await rpc.handle(request, {
        prefix: "/admin/api/console/v2/rpc",
      });
      if (handled.matched) {
        return handled.response;
      }
      throw new Error(
        `Unexpected legacy or mutation request: ${request.method} ${path}`
      );
    }
  );
  const rootRoute = createRootRoute({ component: Outlet });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/plugins"] }),
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/plugins",
        component: PluginWorkbenchPage,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/plugins/$agentId/$packageId/$instanceKey",
        component: RoutedDetail,
      }),
    ]),
  });
  await router.load();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <ThemeScope>
        <ConsoleLocaleProvider
          value={{
            locale,
            preference: locale,
            globalDefault: locale,
            available: true,
            canManageDefault: false,
            saving: false,
            error: null,
            setPreference: async () => {},
            setGlobalDefault: async () => {},
          }}
        >
          <QueryClientProvider client={client}>
            <AppManagementProvider>
              <PluginAgentWorkbenchProvider>
                <RouterProvider router={router} />
              </PluginAgentWorkbenchProvider>
            </AppManagementProvider>
          </QueryClientProvider>
        </ConsoleLocaleProvider>
      </ThemeScope>
    )
  );
  return {
    client,
    router,
    requests,
    targets,
    deny: () => {
      denied = true;
    },
    dispose: () => {
      flushSync(() => root.unmount());
      client.clear();
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

// The Rust fixtures do not exercise SDK provenance; both locales must preserve
// keyboard inspection, host-owned reasons and narrow-screen geometry.
test.each(["en", "zh-CN"] as const)(
  "existing list and detail inspect SDK RPC metadata in %s without legacy requests or authoring",
  async (locale) => {
    const copy =
      locale === "en"
        ? {
            search: "Search plugins",
            empty: "No matching Plugins",
            clear: "Clear search",
            status: "Configuration: resolved · Read-only",
            overview: "Overview",
            configuration: "Configuration",
            environment: "environment",
            sensitive: "host-env · Sensitive (value not exposed)",
            reason:
              "Read-only: Startup configuration is read-only here. Change the application-owned source and restart.",
            guidance: "Change the application-owned configuration source,",
            action: "View configuration",
          }
        : {
            search: "搜索插件",
            empty: "没有匹配的插件",
            clear: "清除搜索",
            status: "配置: 已解析 · 只读",
            overview: "概览",
            configuration: "配置",
            environment: "环境变量",
            sensitive: "host-env · 敏感字段（不提供值）",
            reason:
              "只读: 此处的启动配置为只读。请修改应用管理的配置来源，然后重启应用。",
            guidance:
              "请修改应用管理的配置来源，然后重启应用并重新加载此页面。",
            action: "查看配置",
          };
    const view = await fixture([plugin], false, locale);
    const previousTheme = document.documentElement.dataset.theme;
    try {
      await expect
        .element(page.getByRole("link", { name: plugin.id, exact: true }))
        .toBeVisible();
      await userEvent.fill(
        page.getByRole("searchbox", { name: copy.search }),
        "missing"
      );
      await expect
        .element(page.getByRole("heading", { name: copy.empty }))
        .toBeVisible();
      await page.getByRole("button", { name: copy.clear }).click();
      const link = page.getByRole("link", { name: plugin.id, exact: true });
      (link.element() as HTMLElement).focus();
      await expect.element(link).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await expect
        .element(page.getByRole("heading", { name: plugin.id, exact: true }))
        .toBeVisible();
      await expect
        .element(page.getByText(copy.status, { exact: true }))
        .toBeVisible();
      await page.getByRole("tab", { name: copy.overview, exact: true }).click();
      await userEvent.keyboard("{ArrowRight}");
      const configurationTab = page.getByRole("tab", {
        name: copy.configuration,
        exact: true,
      });
      await expect.element(configurationTab).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await expect
        .element(configurationTab)
        .toHaveAttribute("aria-selected", "true");
      await expect
        .element(page.getByText('["credentials","token"]', { exact: true }))
        .toBeVisible();
      await expect
        .element(page.getByText(copy.environment, { exact: true }))
        .toBeVisible();
      await expect
        .element(
          page.getByText(copy.sensitive, {
            exact: true,
          })
        )
        .toBeVisible();
      await expect
        .element(page.getByText(copy.reason, { exact: true }))
        .toBeVisible();
      await expect
        .element(page.getByText(copy.guidance, { exact: false }))
        .toBeVisible();
      for (const theme of ["light", "dark"]) {
        document.documentElement.dataset.theme = theme;
        for (const width of [1440, 390]) {
          await page.viewport(width, width === 390 ? 844 : 900);
          const action = page.getByRole("button", {
            name: copy.action,
            exact: true,
          });
          const bounds = action.element().getBoundingClientRect();
          await action.hover();
          expect(action.element().getBoundingClientRect().width).toBe(
            bounds.width
          );
          action.element().focus();
          await expect.element(action).toHaveFocus();
          const focusStyle = getComputedStyle(action.element());
          expect(
            focusStyle.outlineStyle !== "none" ||
              focusStyle.boxShadow !== "none"
          ).toBe(true);
          expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
            window.innerWidth
          );
          if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
            await page.screenshot({
              path: `__screenshots__/typescript-plugin-configuration-${locale}-${theme}-${width}.png`,
            });
          }
        }
      }
      expect(document.querySelector("textarea")).toBeNull();
      expect(document.body.textContent).not.toMatch(
        /Publish configuration|Edit configuration|Root TOML/
      );
      expect(new Set(view.targets)).toEqual(new Set(["north"]));
      const calls = view.requests.filter((request) =>
        new URL(request.url).pathname.includes("/rpc/")
      );
      expect(calls.length).toBeGreaterThan(0);
      expect(
        calls.every(
          (request) =>
            new URL(request.url).pathname ===
            "/admin/api/console/v2/rpc/plugins"
        )
      ).toBe(true);
      expect(
        calls.every(
          (request) =>
            request.headers.get("X-Lenso-Expected-Subject") === "inspector"
        )
      ).toBe(true);
    } finally {
      if (previousTheme === undefined) {
        delete document.documentElement.dataset.theme;
      } else {
        document.documentElement.dataset.theme = previousTheme;
      }
      await page.viewport(1280, 800);
      view.dispose();
    }
  }
);

// A response for another target must fail, not become a fake empty inventory.
test.each(["en", "zh-CN"] as const)(
  "wrong-target metadata is reported as an error instead of no installed Plugins in %s",
  async (locale) => {
    const view = await fixture(
      [{ ...plugin, targetId: "south" }],
      false,
      locale
    );
    try {
      await expect
        .element(
          page.getByText(
            locale === "en"
              ? "Plugin metadata could not be loaded."
              : "无法加载插件元数据。",
            { exact: false }
          )
        )
        .toBeVisible();
      expect(document.body.textContent).not.toContain("No Plugins available");
      expect(document.body.textContent).not.toContain(plugin.id);
    } finally {
      view.dispose();
    }
  }
);

// Metadata must disappear after configure/list authorization is revoked,
// even when React Query has successful per-target data cached.
test.each(["en", "zh-CN"] as const)(
  "denied refresh suppresses cached provenance and never falls back to Rust inventory in %s",
  async (locale) => {
    const view = await fixture([plugin], false, locale);
    try {
      await page.getByRole("link", { name: plugin.id, exact: true }).click();
      await page
        .getByRole("tab", {
          name: locale === "en" ? "Configuration" : "配置",
          exact: true,
        })
        .click();
      await expect
        .element(page.getByText('["credentials","token"]', { exact: true }))
        .toBeVisible();
      view.deny();
      await view.client.invalidateQueries({ queryKey: ["typescript-plugins"] });
      await expect
        .element(
          page.getByText(
            locale === "en"
              ? "Access denied for this account."
              : "此账号无权访问。",
            { exact: false }
          )
        )
        .toBeVisible();
      expect(document.body.textContent).not.toContain(
        '["credentials","token"]'
      );
      expect(
        view.requests.every(
          (request) => !new URL(request.url).pathname.includes("/control/")
        )
      ).toBe(true);
    } finally {
      view.dispose();
    }
  }
);

// Exercise missing, current and legacy generic reasons through the mounted
// inspector, while keeping application-specific failure details intact.
test.each([
  { locale: "en" as const, reason: undefined },
  { locale: "zh-CN" as const, reason: undefined },
  {
    locale: "zh-CN" as const,
    reason:
      "Startup configuration is read-only here. Change the application-owned source and restart.",
  },
  {
    locale: "zh-CN" as const,
    reason:
      "The host ConfigSource exposes startup metadata only; no write, compare-and-swap or publish API is available.",
  },
])(
  "unconfigured and unavailable instances preserve provenance and reasons in $locale ($reason)",
  async ({ locale, reason }) => {
    const chinese = locale === "zh-CN";
    const view = await fixture(
      [
        {
          ...plugin,
          configuration: {
            state: "unconfigured",
            sources: [],
            fields: [],
            unavailableReason: reason,
          },
        },
        {
          ...plugin,
          id: "offline",
          configuration: {
            state: "unavailable",
            sources: [],
            fields: [],
            unavailableReason: "Startup source cannot be inspected.",
          },
        },
      ],
      false,
      locale
    );
    try {
      await expect
        .element(
          page.getByText(
            chinese ? "未配置 · 只读" : "unconfigured · Read-only",
            { exact: true }
          )
        )
        .toBeVisible();
      await expect
        .element(
          page.getByText(
            chinese ? "不可用 · 只读" : "unavailable · Read-only",
            { exact: true }
          )
        )
        .toBeVisible();
      await page.getByRole("link", { name: plugin.id, exact: true }).click();
      await page
        .getByRole("tab", {
          name: chinese ? "配置" : "Configuration",
          exact: true,
        })
        .click();
      await expect
        .element(
          page.getByText(
            chinese ? "未报告配置来源。" : "No configuration sources reported.",
            { exact: true }
          )
        )
        .toBeVisible();
      await expect
        .element(
          page.getByText(
            chinese
              ? "未报告字段来源，这不代表使用了默认值。"
              : "No field provenance reported. This does not imply default values.",
            { exact: true }
          )
        )
        .toBeVisible();
      await expect
        .element(
          page.getByText(
            chinese
              ? "只读: 此处的启动配置为只读。请修改应用管理的配置来源，然后重启应用。"
              : "Read-only: Startup configuration is read-only here. Change the application-owned source and restart.",
            { exact: true }
          )
        )
        .toBeVisible();
      await view.router.navigate({ to: "/plugins" });
      await page.getByRole("link", { name: "offline", exact: true }).click();
      await expect
        .element(
          page.getByText(
            chinese
              ? "只读: Startup source cannot be inspected."
              : "Read-only: Startup source cannot be inspected.",
            { exact: true }
          )
        )
        .toBeVisible();
    } finally {
      view.dispose();
    }
  }
);

// A retired target query must cancel the SDK Fetch request, not merely ignore
// its result after the host has continued inspecting the previous target.
test.each(["en", "zh-CN"] as const)(
  "unmount cancels the actual SDK inspection request in %s",
  async (locale) => {
    const view = await fixture([plugin], true, locale);
    let disposed = false;
    try {
      await expect
        .element(
          page.getByRole("heading", {
            name: locale === "en" ? "Loading Plugins" : "正在加载插件列表",
            exact: true,
          })
        )
        .toBeVisible();
      await expect
        .poll(() =>
          view.requests.find((request) =>
            new URL(request.url).pathname.endsWith("/rpc/plugins")
          )
        )
        .toBeDefined();
      const request = view.requests.find((candidate) =>
        new URL(candidate.url).pathname.endsWith("/rpc/plugins")
      )!;
      expect(request.signal.aborted).toBe(false);
      view.dispose();
      disposed = true;
      expect(request.signal.aborted).toBe(true);
    } finally {
      if (!disposed) {
        view.dispose();
      }
    }
  }
);
