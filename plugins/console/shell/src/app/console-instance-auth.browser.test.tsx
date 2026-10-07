import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { contributionAssetUrl } from "../features/extensions/contribution-asset-url";
import { workspacePageHref } from "../features/extensions/workspace-paths";
import { queryClient } from "../lib/query-client";
import { sessionFetch } from "../lib/session-fetch";
import { consoleBasePath } from "./console-router-config";
import {
  ConsoleSession,
  parseLoginMethods,
  useConsoleSession,
} from "./console-session";

vi.hoisted(() => {
  const bootstrap = document.createElement("script");
  bootstrap.id = "lenso-console-http-paths";
  bootstrap.type = "application/json";
  bootstrap.textContent = JSON.stringify({
    shell_base_path: "/admin",
    api_base_path: "/admin/api",
    auth_base_path: "/auth/operator",
  });
  document.head.append(bootstrap);
});

vi.mock("../dev/console-dev-config", () => ({
  consoleDevConfig: { mode: "production" },
}));

function Workspace() {
  const session = useConsoleSession();
  const handleSignOut = session.signOut;
  return (
    <>
      <p>Operator workspace {session.workspaceIds.join(",")}</p>
      <button onClick={handleSignOut} type="button">
        End operator session
      </button>
    </>
  );
}

// Existing root session tests cannot catch an operator document reading accounts
// methods/logout, or a Request losing its subject header/body during API remapping.
test("fixed admin bootstrap keeps login, requests, asset recovery and logout in its own instance", async () => {
  let signedIn = false;
  const observed: string[] = [];
  let releaseCanceledReply: ((response: Response) => void) | undefined;
  let canceledRequest: Request | undefined;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const target =
        input instanceof Request ? new URL(input.url).pathname : String(input);
      observed.push(target);
      if (target === "/admin/api/cancel" && input instanceof Request) {
        canceledRequest = input;
        return new Promise<Response>((resolve) => {
          releaseCanceledReply = resolve;
        });
      }
      if (target === "/auth/operator/methods") {
        return Response.json({
          methods: [
            {
              id: "password",
              kind: "password",
              label: "Password",
              action: "/auth/operator/password/login",
            },
          ],
          csrf: {
            cookie_name: "__Host-operators-csrf",
            header_name: "x-csrf-token",
          },
        });
      }
      if (target === "/auth/operator/password/login") {
        signedIn = true;
        return new Response(null, { status: 204 });
      }
      if (target === "/auth/operator/logout") {
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe(
          "operator-token"
        );
        signedIn = false;
        return new Response(null, { status: 204 });
      }
      if (target === "/admin/api/console/v1/session") {
        return signedIn
          ? Response.json({
              mode: "required",
              authenticated: true,
              subject: "operator",
              administrator: false,
              workspace_ids: ["admin"],
            })
          : new Response(null, { status: 401 });
      }
      if (
        target ===
          "/admin/api/console/v1/pages/admin/services/orders/invoke/read" &&
        input instanceof Request
      ) {
        expect(input.method).toBe("POST");
        expect(input.headers.get("x-lenso-expected-subject")).toBe("operator");
        expect(input.headers.get("x-lenso-page-owner")).toBe(
          "orders/operators"
        );
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe(
          "operator-token"
        );
        expect(await input.text()).toBe('{"id":"42"}');
        return Response.json({ id: "42" });
      }
      throw new Error(`Unexpected cross-instance request: ${target}`);
    }
  );
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(document, "cookie", "get").mockReturnValue(
    "__Host-accounts-csrf=account-token; __Host-operators-csrf=operator-token"
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    expect(consoleBasePath).toBe("/admin");
    expect(
      workspacePageHref(
        {
          id: "admin",
          basePath: "/",
          subject: { kind: "console" },
          owner: {
            instance: "orders/operators",
            source: "resolved-plan",
            trusted: true,
          },
          revision: "1",
          module: "module",
          styles: [],
          navigation: { label: "Admin", items: [] },
          requirements: [],
          apiMajor: 1,
          title: "Admin",
          access: "administrator",
        },
        []
      )
    ).toBe("/admin/");
    expect(
      parseLoginMethods({
        methods: [
          "/auth/password/login",
          "/auth/operator/password%2flogin",
          "/auth/operator//password/login",
        ].map((action, index) => ({
          id: `cross-${index}`,
          kind: "redirect",
          label: "Invalid action",
          action,
        })),
      })
    ).toEqual([]);
    expect(
      parseLoginMethods({
        methods: [
          {
            id: "operator",
            kind: "redirect",
            label: "Operator",
            action: "/auth/operator?return_to=%2Fadmin%2F",
          },
        ],
      })
    ).toHaveLength(1);
    const asset = `/api/console/v1/pages/admin/assets/${"a".repeat(64)}/workspace.mjs`;
    expect(contributionAssetUrl(asset, false)).toBe(`/admin${asset}`);
    const recovered = new URL(
      contributionAssetUrl(asset, true),
      window.location.origin
    );
    expect(recovered.pathname).toBe(`/admin${asset}`);
    expect(recovered.searchParams.has("__lenso_console_recovery")).toBe(true);
    flushSync(() =>
      root.render(
        <ConsoleSession>
          <Workspace />
        </ConsoleSession>
      )
    );
    await page
      .getByLabelText("Email", { exact: true })
      .fill("operator@example.test");
    await page
      .getByLabelText("Password", { exact: true })
      .fill("synthetic-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect
      .element(page.getByText("Operator workspace admin"))
      .toBeVisible();
    const controller = new AbortController();
    await sessionFetch(
      new Request(
        new URL(
          "/api/console/v1/pages/admin/services/orders/invoke/read",
          window.location.origin
        ),
        {
          method: "POST",
          body: '{"id":"42"}',
          headers: {
            "content-type": "application/json",
            "x-lenso-expected-subject": "operator",
            "x-lenso-page-owner": "orders/operators",
          },
          signal: controller.signal,
        }
      )
    );
    const lateController = new AbortController();
    const retired = (async () => {
      try {
        return await sessionFetch(
          new Request(new URL("/api/cancel", window.location.origin), {
            method: "POST",
            signal: lateController.signal,
          })
        );
      } catch (error) {
        return error;
      }
    })();
    await expect.poll(() => Boolean(canceledRequest)).toBe(true);
    lateController.abort();
    expect(canceledRequest?.signal.aborted).toBe(true);
    releaseCanceledReply?.(Response.json({ stale: true }));
    await expect(retired).resolves.toHaveProperty("name", "AbortError");
    queryClient.setQueryData(["operator-private"], "private");
    await page.getByRole("button", { name: "End operator session" }).click();
    await expect
      .element(page.getByLabelText("Password", { exact: true }))
      .toBeVisible();
    expect(queryClient.getQueryData(["operator-private"])).toBeUndefined();
    expect(
      observed.every(
        (target) =>
          target.startsWith("/admin/api/") ||
          target.startsWith("/auth/operator/")
      )
    ).toBe(true);
  } finally {
    root.unmount();
    container.remove();
    queryClient.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.getElementById("lenso-console-http-paths")?.remove();
  }
});
