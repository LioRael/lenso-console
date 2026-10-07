import "@lenso/tokens/styles.css";
import "../../styles.css";
import { ThemeScope } from "@lenso/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import {
  ContextNavigationContent,
  ContextNavigationItem,
} from "../../components/runtime/context-navigation";
import {
  parseConsoleHttpPaths,
  type WorkspaceSource,
} from "../../lib/console-http-paths";
import { usePageCatalog, type PageMount } from "./page-contribution-catalog";
import { createWorkspaceServices } from "./workspace-service-client";

const fixture = vi.hoisted(() => ({
  sources: [] as readonly WorkspaceSource[],
  ordinary: {} as unknown,
}));
vi.mock(import("../../lib/console-http-paths"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    consoleHttpPaths: {
      ...actual.consoleHttpPaths,
      get workspace_sources() {
        return fixture.sources;
      },
    },
  };
});
vi.mock(import("../../app/console-session"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    useConsoleSession: () => ({
      ...actual.useConsoleSession(),
      subject: "account-a",
    }),
  };
});
vi.mock(import("../../lib/http-client"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    isApiMode: () => true,
    httpClient: actual.httpClient.extend({
      prefix: "/",
      fetch: async () => Response.json(fixture.ordinary),
    }),
  };
});

function mount(id: string, title: string): PageMount {
  return {
    apiMajor: 1,
    id,
    title,
    module: `/api/console/v1/pages/${id}/assets/${"a".repeat(64)}/workspace.mjs`,
    navigation: { label: title, items: [{ label: title, path: [] }] },
    owner: {
      instance: `${id}/default`,
      source: "resolved-plan",
      trusted: true,
    },
    requirements: [],
    revision: "1",
    styles: [],
    subject: { kind: "console" },
  };
}

function Navigation({ theme }: { theme: "light" | "dark" }) {
  const catalog = usePageCatalog();
  const [result, setResult] = useState("");
  return (
    <ThemeScope theme={theme}>
      <aside aria-label="Workspace projects" style={{ width: 240 }}>
        <ContextNavigationContent>
          {catalog.data?.flatMap((workspace) =>
            workspace.navigation.items.map((item) => (
              <ContextNavigationItem
                key={`${workspace.id}/${item.path.join("/")}`}
                onClick={() => {
                  if (workspace.transport) {
                    void (async () => {
                      try {
                        const value = await createWorkspaceServices(
                          workspace
                        ).invoke<unknown, { message: string }>(
                          "actions",
                          "list",
                          {}
                        );
                        setResult(value.message);
                      } catch {
                        setResult("");
                      }
                    })();
                  }
                }}
              >
                {item.label}
              </ContextNavigationItem>
            ))
          )}
        </ContextNavigationContent>
      </aside>
      <output>{catalog.sourceError || result}</output>
    </ThemeScope>
  );
}

// Uses a real rendered Sidebar item, React Query cache and browser identity lock.
// Protocol fixtures isolate partial admission and immediate provider retirement;
// the real Auth/runtime suite remains the final backend qualification.
test("partial workspace admission keeps ordinary projects and retires denied operator reads", async () => {
  const ordinary = {
    ...mount("account", "Your account"),
    basePath: "/",
    routes: [[], ["keys"]],
  };
  fixture.ordinary = { schema: "console.page-catalog/1", mounts: [ordinary] };
  const operations: PageMount = {
    ...mount("operations", "Operations"),
    navigation: {
      label: "Operations",
      items: [
        { label: "Account access", path: [] },
        { label: "Channels", path: ["channels"] },
      ],
    },
    requirements: [
      {
        available: true,
        capability_id: "relay.actions@1",
        descriptor_version: "1",
        required: true,
        service_id: "actions",
        source: "owner",
        operations: ["describe", "describe_channels", "list"],
      },
    ],
  };
  fixture.sources =
    parseConsoleHttpPaths({
      workspace_sources: [
        {
          id: "operations",
          account_issuer: "relay.accounts.local",
          shell_base_path: "/admin",
          api_base_path: "/admin/api",
          auth_base_path: "/auth/operator",
          mounts: [
            {
              id: "operations",
              base_path: "/operations/",
              navigation_checks: [
                {
                  path: [],
                  service_id: "actions",
                  operation: "describe",
                  fields: ["can_read"],
                },
                {
                  path: ["channels"],
                  service_id: "actions",
                  operation: "describe_channels",
                  fields: ["can_manage"],
                },
              ],
            },
          ],
        },
      ],
    }).workspace_sources ?? [];
  let denied = false;
  let unavailable = false;
  let exchangeUnavailable = false;
  let exchanges = 0;
  let bindingRead: Promise<void> | undefined;
  let bindingStarted: (() => void) | undefined;
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === "/auth/operator/session") {
        const pending = bindingRead;
        bindingRead = undefined;
        if (pending) {
          bindingStarted?.();
          await pending;
        }
        return Response.json({
          eligible: !denied,
          source_issuer: "relay.accounts.local",
          source_subject: "account-a",
          operator_subject: "operator-a",
        });
      }
      if (path === "/admin/api/console/v1/session") {
        if (exchangeUnavailable) {
          return Response.json({}, { status: 401 });
        }
        return Response.json(
          { mode: "required", authenticated: true, subject: "operator-a" },
          { headers: { "x-lenso-read-scope": "a".repeat(64) } }
        );
      }
      if (path === "/auth/operator/methods") {
        return Response.json({
          csrf: {
            cookie_name: "__Host-operator-csrf",
            header_name: "x-csrf-token",
          },
        });
      }
      if (path === "/api/console/v1/session") {
        return Response.json({ subject: "account-a" });
      }
      if (path === "/auth/operator/logout") {
        return Response.json({ signed_out: true });
      }
      if (path === "/auth/operator/exchange") {
        exchanges += 1;
        return Response.json({}, { status: 503 });
      }
      if (path === "/admin/api/console/v1/pages") {
        return Response.json({
          schema: "console.page-catalog/1",
          mounts: [operations, mount("undeclared", "Undeclared")],
        });
      }
      expect(new Headers(init?.headers).get("x-lenso-expected-subject")).toBe(
        "operator-a"
      );
      if (path.endsWith("/invoke/describe")) {
        return Response.json({ can_read: true });
      }
      if (path.endsWith("/invoke/describe_channels")) {
        if (unavailable) {
          return Response.json({}, { status: 503 });
        }
        return Response.json(
          { error: "denied" },
          {
            status: 422,
            headers: { "x-lenso-workspace-outcome": "domain_error" },
          }
        );
      }
      if (path.endsWith("/invoke/list")) {
        return denied
          ? Response.json({}, { status: 403 })
          : Response.json({ message: "Operator read completed" });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const render = (theme: "light" | "dark") =>
    root.render(
      <QueryClientProvider client={client}>
        <Navigation theme={theme} />
      </QueryClientProvider>
    );
  try {
    render("light");
    const access = page.getByRole("button", {
      name: "Account access",
      exact: true,
    });
    await expect.element(access).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Your account" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Channels" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Undeclared" }))
      .not.toBeInTheDocument();
    await access.click();
    await expect
      .element(page.getByText("Operator read completed"))
      .toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      render(theme);
      await page.viewport(theme === "dark" ? 375 : 1280, 800);
      const button = access.element();
      button.focus();
      expect(document.activeElement).toBe(button);
      const rect = button.getBoundingClientRect();
      expect(rect.height).toBeGreaterThanOrEqual(28);
      expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
      expect(getComputedStyle(button).color).not.toBe("rgba(0, 0, 0, 0)");
      await userEvent.keyboard("{Enter}");
      await page.screenshot({
        path: `__screenshots__/authorized-workspaces/partial-${theme}.png`,
        element: node,
      });
    }
    unavailable = true;
    await client.invalidateQueries({ queryKey: ["console-page-catalog"] });
    await expect
      .element(
        page.getByText(
          "Some workspaces could not be checked. Retry workspace access."
        )
      )
      .toBeVisible();
    await expect.element(access).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Your account" }))
      .toBeVisible();
    unavailable = false;
    await client.invalidateQueries({ queryKey: ["console-page-catalog"] });
    await expect
      .element(
        page.getByText(
          "Some workspaces could not be checked. Retry workspace access."
        )
      )
      .not.toBeInTheDocument();
    for (const routes of [
      undefined,
      [["operations"]],
      [["[project]"]],
      [["[...projects]"]],
    ]) {
      fixture.ordinary = {
        schema: "console.page-catalog/1",
        mounts: [{ ...ordinary, routes }],
      };
      await client.invalidateQueries({ queryKey: ["console-page-catalog"] });
      await expect.element(access).not.toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Your account" }))
        .toBeVisible();
    }
    fixture.ordinary = { schema: "console.page-catalog/1", mounts: [ordinary] };
    await client.invalidateQueries({ queryKey: ["console-page-catalog"] });
    await expect.element(access).toBeVisible();
    // A peer exchanges while this catalog is in flight. Its stale generation
    // must retire immediately, then refresh without waiting for the 30s poll.
    let releaseBinding!: () => void;
    bindingRead = new Promise<void>((resolve) => {
      releaseBinding = resolve;
    });
    const reading = new Promise<void>((resolve) => {
      bindingStarted = resolve;
    });
    const refreshing = client.invalidateQueries({
      queryKey: ["console-page-catalog"],
    });
    await reading;
    for (const phase of ["begin", "complete"]) {
      window.dispatchEvent(
        new CustomEvent("lenso-workspace-identity-transition", {
          detail: { phase, sourceId: "operations" },
        })
      );
    }
    await expect.element(access).not.toBeInTheDocument();
    releaseBinding();
    await refreshing;
    await expect.element(access).toBeVisible();
    denied = true;
    await access.click();
    await expect.element(access).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Your account" }))
      .toBeVisible();
    expect(
      fetch.mock.calls.some(([input]) =>
        String(input).startsWith("/api/console/v1/pages/operations/")
      )
    ).toBe(false);
    // A failed exchange completes its cookie-write lock but must not trigger
    // another exchange through its own completion notification.
    denied = false;
    exchangeUnavailable = true;
    await client.invalidateQueries({ queryKey: ["console-page-catalog"] });
    await expect
      .element(
        page.getByText(
          "Some workspaces could not be checked. Retry workspace access."
        )
      )
      .toBeVisible();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(exchanges).toBe(1);
    expect(client.isFetching({ queryKey: ["console-page-catalog"] })).toBe(0);
  } finally {
    root.unmount();
    client.clear();
    node.remove();
    fixture.sources = [];
    fetch.mockRestore();
    await page.viewport(1280, 800);
  }
});
