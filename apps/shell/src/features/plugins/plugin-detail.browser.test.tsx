import "@lenso/tokens/styles.css";
import "@fontsource-variable/inter";
import "@fontsource/roboto-mono/400.css";
import "../../styles.css";
import { ThemeScope } from "@lenso/ui";
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

import { ConsoleAppearanceProvider } from "../../app/console-appearance";
import { HostConsoleLocaleProvider } from "../../app/console-locale";
import { ConsoleSession } from "../../app/console-session";
import { Providers } from "../../app/providers";
import { ConsoleShell } from "../../components/runtime/console-shell";
import { queryClient as shellQueryClient } from "../../lib/query-client";
import { AppManagementProvider } from "../apps/app-management-context";
import { PluginAgentWorkbenchProvider } from "./plugin-agent-workbench-context";
import type {
  PluginInventory,
  PluginManagement,
  PluginSelectionItem,
} from "./plugin-control-contract";
import { PluginDetailPage } from "./plugin-detail-page";
import { pluginWorkbenchQueryKey } from "./use-plugin-workbench";

// This file exercises public HTTP contract fixtures. Configure only this
// file's API boundary; the rest of the browser suite keeps its demo mode.
vi.mock(import("../../lib/http-client"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    httpClient: original.httpClient.extend({ prefix: "/" }),
    isApiMode: () => true,
  };
});

// Descriptor-derived identities and roles, returned as isolated public HTTP
// contract fixtures. No native Host, health probe, resource or binding fixture.
const auth: PluginSelectionItem = {
  disableable: true,
  entrypoint: "default",
  executionClass: "lenso.native-rust@1",
  instanceKey: "lenso.auth.web-session/default",
  packageId: "lenso.auth.web-session",
  packageRevision: "fixture-auth-revision",
  providedCapabilities: ["lenso.http.endpoint@1"],
  requiredCapabilities: [
    "lenso.auth.federated@1",
    "lenso.auth.credential-issuer@1",
  ],
};
const observe: PluginSelectionItem = {
  ...auth,
  instanceKey: "lenso.console.workspace.observe/default",
  packageId: "lenso.console.workspace.observe",
  packageRevision: "fixture-observe-revision",
  providedCapabilities: [
    "lenso.ui.contribution@1",
    "lenso.ui.workspace-service@1",
    "lenso.observability.query@1",
    "lenso.http.stream-endpoint@1",
  ],
  requiredCapabilities: [],
};
const authority = {
  kind: "sqlite_configuration_store",
  publicationHistory: false,
  reference: "console",
  rollbackProposals: false,
};

function contractState(plugins = [auth, observe]) {
  const inventory: PluginInventory = {
    active: {
      generationSpecDigest: "fixture-generation",
      planDigest: "fixture-plan",
      pluginRootRevision: "fixture-root",
      plugins,
    },
    appliedRevision: "fixture-root",
    configurationAuthority: authority,
    configurationStatus: "applied",
    cursor: "0",
    desired: {
      desiredStateDigest: "fixture-desired",
      planDigest: "fixture-plan",
      pluginRootRevision: "fixture-root",
      plugins,
    },
    desiredRevision: "fixture-root",
    events: [],
    preparing: null,
    schema: "lenso.agent.plugin-inventory.v2",
    streamId: "fixture-stream",
    truncated: false,
  };
  const management: PluginManagement = {
    configurationAuthority: authority,
    plugins: plugins.map((plugin) => ({
      configurationDefaults: {},
      configurationSchema: null,
      instances: [
        {
          disableable: plugin.disableable,
          hasRootDifference: false,
          instanceKey: "default",
          origin: "host-default",
          rootConfigurationToml: null,
          selection: "enabled",
          sourceDigest: "fixture-source",
        },
      ],
      packageId: plugin.packageId,
      packageRevision: plugin.packageRevision,
      rootSupplied: false,
    })),
    revision: "fixture-root",
    schema: "lenso.agent.plugin-management.v1",
    selectionAuthority: null,
  };
  return { inventory, management };
}

function RoutedPluginDetail() {
  const params = useParams({ strict: false }) as {
    agentId: string;
    packageId: string;
    instanceKey: string;
  };
  return <PluginDetailPage {...params} />;
}

async function fixture({
  packageId = auth.packageId,
  state = contractState(),
  denied = false,
  respond,
  withShell = false,
}: {
  packageId?: string;
  state?: ReturnType<typeof contractState>;
  denied?: boolean;
  respond?: (request: Request) => Response | Promise<Response> | undefined;
  withShell?: boolean;
} = {}) {
  const requests: { path: string; method: string }[] = [];
  const nativeFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      if (!path.startsWith("/api/")) {
        return nativeFetch(input, init);
      }
      requests.push({ path, method: request.method });
      if (withShell) {
        if (path.endsWith("/session")) {
          return Response.json({ mode: "local" });
        }
        if (path.endsWith("/agents")) {
          return Response.json({ agents: [] });
        }
        if (path.endsWith("/pages") || path.endsWith("/surfaces")) {
          return Response.json({
            schema: "console.page-catalog/1",
            mounts: [],
          });
        }
      }
      if (path.endsWith("/apps")) {
        return Response.json({
          apps: [
            {
              id: "console",
              label: "Console management Agent",
              scope: "management-agent",
              pluginConfiguration: true,
              agentId: null,
              localBundleInstall: false,
            },
          ],
        });
      }
      if (denied) {
        return Response.json(
          { detail: "Plugin access denied." },
          { status: 403 }
        );
      }
      const response = respond?.(request);
      if (response) {
        return response;
      }
      if (path.endsWith("/control/plugins")) {
        return Response.json(state.management);
      }
      if (path.endsWith("/plugins")) {
        return Response.json(state.inventory);
      }
      throw new Error(`Unexpected fixture request: ${request.method} ${path}`);
    }
  );
  const rootRoute = createRootRoute({
    component: withShell
      ? () => (
          <ConsoleShell>
            <Outlet />
          </ConsoleShell>
        )
      : Outlet,
  });
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [`/plugins/console/${packageId}/default`],
    }),
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/plugins",
        component: () => <div>Plugin list</div>,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/plugins/$agentId/$packageId/$instanceKey",
        component: RoutedPluginDetail,
      }),
    ]),
  });
  await router.load();
  const client = withShell
    ? shellQueryClient
    : new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
  const container = document.createElement("div");
  container.style.height = "100vh";
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      withShell ? (
        <HostConsoleLocaleProvider>
          <ConsoleAppearanceProvider>
            <ConsoleSession>
              <Providers>
                <RouterProvider router={router} />
              </Providers>
            </ConsoleSession>
          </ConsoleAppearanceProvider>
        </HostConsoleLocaleProvider>
      ) : (
        <ThemeScope style={{ height: "100%" }}>
          <QueryClientProvider client={client}>
            <AppManagementProvider>
              <PluginAgentWorkbenchProvider>
                <RouterProvider router={router} />
              </PluginAgentWorkbenchProvider>
            </AppManagementProvider>
          </QueryClientProvider>
        </ThemeScope>
      )
    )
  );
  return {
    client,
    requests,
    router,
    dispose() {
      flushSync(() => root.unmount());
      client.clear();
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

test("reads generic Plugin identity and declared requirements without inventing health or bindings", async () => {
  const view = await fixture();
  try {
    await expect
      .element(page.getByRole("heading", { name: "Lenso auth web session" }))
      .toBeVisible();
    await expect
      .element(page.getByText("Unknown", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("lenso.http.endpoint@1", { exact: true }))
      .toBeVisible();
    if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
      await page.screenshot({
        path: "__screenshots__/plugin-detail-auth-overview.png",
      });
    }
    await page.getByRole("button", { name: "View dependencies" }).click();
    await expect
      .element(page.getByRole("tab", { name: "Dependencies", exact: true }))
      .toHaveFocus();
    await expect
      .element(page.getByText("lenso.auth.federated@1", { exact: true }))
      .toBeVisible();
    await expect
      .element(
        page.getByText("lenso.auth.credential-issuer@1", { exact: true })
      )
      .toBeVisible();
    await expect
      .element(
        page.getByText("These are declared requirements.", { exact: false })
      )
      .toBeVisible();
    await view.router.navigate({
      to: "/plugins/$agentId/$packageId/$instanceKey",
      params: {
        agentId: "console",
        packageId: observe.packageId,
        instanceKey: "default",
      },
    });
    await expect
      .element(
        page.getByRole("heading", { name: "Lenso console workspace observe" })
      )
      .toBeVisible();
    await expect
      .element(page.getByText("lenso.observability.query@1", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("lenso.http.endpoint@1", { exact: true }))
      .not.toBeInTheDocument();
    if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
      await page.screenshot({
        path: "__screenshots__/plugin-detail-observe-overview.png",
      });
    }
    await page.getByRole("button", { name: "View dependencies" }).click();
    await expect
      .element(
        page.getByText("This selection declares no required capabilities.")
      )
      .toBeVisible();
    await page.getByRole("button", { name: "Edit configuration" }).click();
    const editor = page.getByRole("textbox", {
      name: `TOML configuration for ${observe.packageId}/default`,
    });
    await expect.element(editor).toBeVisible();
    await editor.fill('source_id = "fixture-source"\n');
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: "Edit configuration" }).click();
    await expect.element(editor).toHaveValue('source_id = "fixture-source"\n');
    await expect.element(page.getByRole("switch")).toBeDisabled();
    expect(view.requests.every((request) => request.method === "GET")).toBe(
      true
    );
  } finally {
    view.dispose();
  }
});

test("renders the generic Auth detail inside the existing Console Shell", async () => {
  const previousTheme = localStorage.getItem("lenso-console:theme-preference");
  localStorage.setItem(
    "lenso-console:theme-preference",
    JSON.stringify("light")
  );
  await page.viewport(1470, 994);
  const view = await fixture({ withShell: true });
  try {
    await expect
      .element(page.getByRole("heading", { name: "Lenso auth web session" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("navigation", { name: "Console areas" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("banner", { name: "Console toolbar" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "View dependencies" }))
      .toBeVisible();
    expect(window.innerWidth).toBe(1470);
    const tabs = page
      .getByRole("tablist", { name: "Plugin details" })
      .element();
    expect(tabs.getBoundingClientRect().width).toBeLessThan(500);
    expect(
      getComputedStyle(
        page.getByRole("tab", { name: "Overview", exact: true }).element()
      ).borderBottomWidth
    ).toBe("0px");
    const cards = document.querySelectorAll<HTMLElement>(
      '[data-page="plugin-detail"] [data-slot="surface"]'
    );
    expect(cards.length).toBe(4);
    const firstCardBounds = cards.item(0).getBoundingClientRect();
    const secondCardBounds = cards.item(1).getBoundingClientRect();
    expect(firstCardBounds.top).toBe(secondCardBounds.top);
    expect(firstCardBounds.height).toBe(secondCardBounds.height);
    const mainBounds = page.getByRole("main").element().getBoundingClientRect();
    expect(firstCardBounds.left - mainBounds.left).toBeLessThan(40);
    for (const card of cards) {
      expect(getComputedStyle(card).boxShadow).not.toBe("none");
      expect(
        Number(getComputedStyle(card).borderRadius.replace("px", ""))
      ).toBeGreaterThanOrEqual(20);
    }
    if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
      await page.screenshot({
        path: "__screenshots__/plugin-detail-auth-shell-overview.png",
      });
    }
    expect(view.requests.every(({ method }) => method === "GET")).toBe(true);
  } finally {
    view.dispose();
    if (previousTheme === null) {
      localStorage.removeItem("lenso-console:theme-preference");
    } else {
      localStorage.setItem("lenso-console:theme-preference", previousTheme);
    }
    await page.viewport(1280, 800);
  }
});

test("distinguishes missing selection from an empty declaration and preserves read-only authority", async () => {
  const state = contractState();
  state.inventory.active.plugins = [];
  state.inventory.desired.plugins = [];
  state.management.revision = "fixture-authority-ahead";
  const view = await fixture({ state });
  try {
    await expect
      .element(page.getByText("Selection unavailable", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("This selection provides no capabilities."))
      .not.toBeInTheDocument();
    await page.getByRole("button", { name: "View configuration" }).click();
    await expect
      .element(
        page.getByRole("textbox", {
          name: `TOML configuration for ${auth.packageId}/default`,
        })
      )
      .toHaveAttribute("readonly");
    await expect
      .element(page.getByRole("button", { name: "Preview change" }))
      .toBeDisabled();
    await expect.element(page.getByRole("switch")).toBeDisabled();
    expect(view.requests.every((request) => request.method === "GET")).toBe(
      true
    );
  } finally {
    view.dispose();
  }
  const denied = await fixture({ denied: true });
  try {
    await expect
      .element(page.getByRole("heading", { name: "Plugin unavailable" }))
      .toBeVisible();
    await expect
      .element(page.getByText("Unknown", { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Edit configuration" }))
      .not.toBeInTheDocument();
  } finally {
    denied.dispose();
  }
});

test("keeps the title revision and capability selection in the same phase", async () => {
  const state = contractState();
  state.inventory.active.plugins = [];
  state.inventory.preparing = {
    ...state.inventory.desired,
    generationSpecDigest: "fixture-candidate-generation",
    plugins: [{ ...auth, packageRevision: "fixture-candidate-A" }],
  };
  state.inventory.desired.plugins = [
    { ...auth, packageRevision: "fixture-desired-B" },
  ];
  state.inventory.configurationStatus = "pending";
  const view = await fixture({ state });
  try {
    await expect
      .element(
        page.getByText("Candidate Revision: fixture-candidate-A", {
          exact: false,
        })
      )
      .toBeVisible();
    await expect
      .element(
        page.getByText("Desired revision: fixture-desired-B", { exact: true })
      )
      .toBeVisible();
    await expect
      .element(page.getByText("Serving Revision", { exact: false }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByText("lenso.http.endpoint@1", { exact: true }))
      .toBeVisible();
  } finally {
    view.dispose();
  }
});

test("revokes cached Plugin content and requires two fresh reads before recovery", async () => {
  for (const deniedEndpoint of ["/plugins", "/control/plugins"]) {
    const state = contractState();
    let mode: "allowed" | "denied" | "recovering" = "allowed";
    let releaseManagement!: (response: Response) => void;
    const managementGate = new Promise<Response>((resolve) => {
      releaseManagement = resolve;
    });
    const conditionalHeaders: (string | null)[] = [];
    state.management.plugins[0]!.instances[0]!.rootConfigurationToml =
      'private_value = "old"';
    const view = await fixture({
      state,
      respond(request) {
        const path = new URL(request.url).pathname;
        const management = path.endsWith("/control/plugins");
        if (
          mode === "denied" &&
          (deniedEndpoint === "/plugins" ? !management : management)
        ) {
          return Response.json(
            { detail: "Plugin access revoked." },
            { status: 403 }
          );
        }
        if (mode === "recovering") {
          if (management) {
            conditionalHeaders.push(request.headers.get("If-None-Match"));
            return managementGate;
          }
          return Response.json(state.inventory);
        }
        return management
          ? Response.json(state.management, {
              headers: { ETag: '"fixture-old"' },
            })
          : undefined;
      },
    });
    try {
      await expect
        .element(page.getByRole("heading", { name: "Lenso auth web session" }))
        .toBeVisible();
      await page.getByRole("button", { name: "Edit configuration" }).click();
      const editor = page.getByRole("textbox", {
        name: `TOML configuration for ${auth.packageId}/default`,
      });
      await editor.fill('private_value = "draft"');
      mode = "denied";
      await view.client.invalidateQueries({
        queryKey: pluginWorkbenchQueryKey("console"),
      });
      await expect
        .element(page.getByRole("heading", { name: "Plugin unavailable" }))
        .toBeVisible();
      await expect.element(editor).not.toBeInTheDocument();
      await expect
        .element(page.getByRole("heading", { name: "Lenso auth web session" }))
        .not.toBeInTheDocument();
      await expect
        .poll(() =>
          view.client
            .getQueriesData({ queryKey: pluginWorkbenchQueryKey("console") })
            .some(([, data]) => data !== undefined)
        )
        .toBe(false);
      mode = "recovering";
      state.management.plugins[0]!.instances[0]!.rootConfigurationToml =
        'private_value = "new"';
      await page.getByRole("button", { name: "Try again" }).click();
      await expect.poll(() => conditionalHeaders.length).toBeGreaterThan(0);
      await expect
        .element(page.getByRole("heading", { name: "Plugin unavailable" }))
        .toBeVisible();
      await expect.element(editor).not.toBeInTheDocument();
      expect(conditionalHeaders.every((header) => header === null)).toBe(true);
      releaseManagement(Response.json(state.management));
      await expect
        .element(page.getByRole("heading", { name: "Lenso auth web session" }))
        .toBeVisible();
      await expect.element(editor).toHaveValue('private_value = "new"');
      expect(view.requests.every((request) => request.method === "GET")).toBe(
        true
      );
    } finally {
      releaseManagement(Response.json(state.management));
      view.dispose();
    }
  }
});

test("keeps generic detail actions and tabs usable across themes and narrow widths", async () => {
  const state = contractState();
  state.inventory.active.plugins = [
    {
      ...auth,
      providedCapabilities: [
        "a.very.long.capability.identifier.with.an.unbroken.namespace@1",
      ],
    },
  ];
  const view = await fixture({ state });
  const previousTheme = document.documentElement.dataset.theme;
  try {
    await expect
      .element(
        page.getByRole("heading", { name: "Capabilities & contributions" })
      )
      .toBeVisible();
    for (const theme of ["light", "dark"]) {
      document.documentElement.dataset.theme = theme;
      for (const width of [1440, 390]) {
        await page.viewport(width, width === 390 ? 844 : 900);
        expect(window.innerWidth).toBe(width);
        const edit = page.getByRole("button", { name: "Edit configuration" });
        if (width === 390) {
          const identity = page
            .getByRole("heading", { name: "Lenso auth web session" })
            .element().parentElement!;
          expect(
            edit.element().getBoundingClientRect().top
          ).toBeGreaterThanOrEqual(identity.getBoundingClientRect().bottom);
        }
        const bounds = edit.element().getBoundingClientRect();
        await edit.hover();
        expect(edit.element().getBoundingClientRect().width).toBe(bounds.width);
        await userEvent.tab();
        edit.element().focus();
        await expect.element(edit).toHaveFocus();
        const focusStyle = getComputedStyle(edit.element());
        expect(
          focusStyle.outlineStyle !== "none" || focusStyle.boxShadow !== "none"
        ).toBe(true);
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          window.innerWidth
        );
        if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
          await page.screenshot({
            path: `__screenshots__/plugin-detail-${theme}-${width}.png`,
          });
        }
        await edit.click();
        const editor = page.getByRole("textbox", {
          name: `TOML configuration for ${auth.packageId}/default`,
        });
        await expect.element(editor).toBeVisible();
        const editorBounds = editor.element().getBoundingClientRect();
        expect(editorBounds.right).toBeLessThanOrEqual(window.innerWidth);
        if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
          await page.screenshot({
            path: `__screenshots__/plugin-detail-configuration-${theme}-${width}.png`,
          });
        }
        await page.getByRole("tab", { name: "Overview", exact: true }).click();
        await page.getByRole("button", { name: "View dependencies" }).click();
        await expect
          .element(page.getByRole("tab", { name: "Dependencies", exact: true }))
          .toHaveFocus();
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          window.innerWidth
        );
        await page.getByRole("tab", { name: "Overview", exact: true }).click();
      }
    }
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await userEvent.keyboard("{ArrowRight}");
    await expect
      .element(page.getByRole("tab", { name: "Configuration", exact: true }))
      .toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("tab", { name: "Configuration", exact: true }))
      .toHaveAttribute("aria-selected", "true");
  } finally {
    if (previousTheme === undefined) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = previousTheme;
    }
    await page.viewport(1280, 800);
    view.dispose();
  }
});
