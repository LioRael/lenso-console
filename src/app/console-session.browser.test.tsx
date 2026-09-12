import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { configureSessionCsrf, sessionFetch } from "../lib/session-fetch";
import {
  ConsoleSession,
  parseLoginMethods,
  useConsoleSession,
} from "./console-session";

vi.mock("../dev/console-dev-config", () => ({
  consoleDevConfig: { mode: "production" },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  configureSessionCsrf(null);
});
afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  configureSessionCsrf(null);
});

function mount() {
  flushSync(() =>
    root.render(
      <ConsoleSession>
        <p>Private workspace</p>
      </ConsoleSession>
    )
  );
}

test("only configured SSO appears and private content waits for authentication", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/auth/methods")
        ? Response.json({
            methods: [
              {
                id: "sso",
                kind: "redirect",
                label: "Work account",
                action: "/auth/oidc/start",
              },
            ],
          })
        : new Response(null, { status: 401 })
    )
  );
  mount();
  await expect
    .element(page.getByRole("button", { name: "Work account" }))
    .toBeVisible();
  await expect.element(page.getByLabelText("Password")).not.toBeInTheDocument();
  await expect
    .element(page.getByText("Private workspace"))
    .not.toBeInTheDocument();
});

test("password authentication restores the requested workspace without storing credentials", async () => {
  let signedIn = false;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth/password/login") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          identifier: "alice@example.test",
          password: "example-password",
        });
        signedIn = true;
        return new Response(null, { status: 204 });
      }
      if (String(input) === "/auth/methods") {
        return Response.json({
          methods: [
            {
              id: "password",
              kind: "password",
              label: "Password",
              action: "/auth/password/login",
            },
          ],
          csrf: {
            cookie_name: "__Host-lenso-csrf",
            header_name: "x-csrf-token",
          },
        });
      }
      return signedIn
        ? Response.json({
            mode: "required",
            authenticated: true,
            subject: "alice",
          })
        : new Response(null, { status: 401 });
    }
  );
  vi.stubGlobal("fetch", fetcher);
  mount();
  await page
    .getByLabelText("Email", { exact: true })
    .fill("alice@example.test");
  await page
    .getByLabelText("Password", { exact: true })
    .fill("example-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.element(page.getByText("Private workspace")).toBeVisible();
  signedIn = false;
  window.dispatchEvent(new Event("lenso-session-expired"));
  await expect
    .element(page.getByLabelText("Password", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText("Private workspace"))
    .not.toBeInTheDocument();
});

test("authentication service failure never opens private content", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 }))
  );
  mount();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect
    .element(page.getByText("Private workspace"))
    .not.toBeInTheDocument();
});

test("CSRF is attached only to same-origin writes", async () => {
  configureSessionCsrf({
    csrf: { cookie_name: "__Host-lenso-csrf", header_name: "x-csrf-token" },
  });
  vi.spyOn(document, "cookie", "get").mockReturnValue(
    "__Host-lenso-csrf=test-csrf"
  );
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 204 })
  );
  vi.stubGlobal("fetch", fetcher);
  await sessionFetch("/api/write", { method: "POST" });
  expect(
    new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("x-csrf-token")
  ).toBe("test-csrf");
  await sessionFetch("https://external.example/write", { method: "POST" });
  expect(
    new Headers(fetcher.mock.calls[1]?.[1]?.headers).has("x-csrf-token")
  ).toBe(false);
});

test("login actions cannot escape the Auth URL namespace", () => {
  expect(
    parseLoginMethods({
      methods: [
        "https://evil.test",
        "/auth/../api/agent",
        "/auth/%2e%2e/api/agent",
        "//evil.test/auth",
      ].map((action) => ({
        id: action,
        kind: "password",
        label: "Bad",
        action,
      })),
    })
  ).toEqual([]);
});

test("authenticated users without Console access cannot mount shared workspaces", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/auth/methods")
        ? Response.json({
            methods: [],
            csrf: {
              cookie_name: "__Host-lenso-csrf",
              header_name: "x-csrf-token",
            },
          })
        : new Response(null, { status: 403 })
    )
  );
  mount();
  await expect
    .element(
      page.getByText(
        "Your account does not have access to this Console. Contact your administrator."
      )
    )
    .toBeVisible();
  await expect
    .element(page.getByText("Private workspace"))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Sign out" }))
    .toBeVisible();
});

function AuthenticatedContent() {
  const { signOut } = useConsoleSession();
  return (
    <button
      onClick={() => {
        void signOut?.();
      }}
    >
      End session
    </button>
  );
}

test("authenticated Console sign-out revokes through Auth and unmounts content", async () => {
  let signedIn = true;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth/logout") {
        expect(init?.method).toBe("POST");
        signedIn = false;
        return new Response(null, { status: 204 });
      }
      if (String(input) === "/auth/methods") {
        return Response.json({
          methods: [
            {
              id: "sso",
              kind: "redirect",
              label: "Work account",
              action: "/auth/oidc/start",
            },
          ],
        });
      }
      return signedIn
        ? Response.json({
            mode: "required",
            authenticated: true,
            subject: "alice",
          })
        : new Response(null, { status: 401 });
    }
  );
  vi.stubGlobal("fetch", fetcher);
  flushSync(() =>
    root.render(
      <ConsoleSession>
        <AuthenticatedContent />
      </ConsoleSession>
    )
  );
  await page.getByRole("button", { name: "End session" }).click();
  await expect
    .element(page.getByRole("button", { name: "Work account" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "End session" }))
    .not.toBeInTheDocument();
});

test("member sessions expose only their configured workspace access", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        mode: "required",
        authenticated: true,
        subject: "member-alice",
        administrator: false,
        workspace_ids: ["projects"],
      })
    )
  );

  flushSync(() =>
    root.render(
      <ConsoleSession>
        <Access />
      </ConsoleSession>
    )
  );
  await expect.element(page.getByText("Member access: projects")).toBeVisible();
  await expect
    .element(page.getByText("Administrator access"))
    .not.toBeInTheDocument();
});

function Access() {
  const { administrator, workspaceIds } = useConsoleSession();
  return (
    <p>
      {administrator
        ? "Administrator access"
        : `Member access: ${workspaceIds.join(", ")}`}
    </p>
  );
}

test.each([false, true])(
  "shows login problem or missing browser session (success=%s)",
  async (success) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/auth/methods") {
          return Response.json({
            methods: [
              {
                id: "password",
                kind: "password",
                label: "Password",
                action: "/auth/password/login",
              },
            ],
          });
        }
        if (String(input) === "/auth/password/login") {
          return success
            ? new Response(null, { status: 204 })
            : Response.json(
                {
                  type: "about:blank",
                  title: "Too Many Requests",
                  status: 429,
                  detail: "Wait before trying again.",
                },
                {
                  status: 429,
                  headers: { "Content-Type": "application/problem+json" },
                }
              );
        }
        return new Response(null, { status: 401 });
      })
    );
    mount();
    await page
      .getByLabelText("Email", { exact: true })
      .fill("alice@example.test");
    await page
      .getByLabelText("Password", { exact: true })
      .fill("example-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent(
        success
          ? "browser did not establish a session"
          : "Wait before trying again."
      );
    await expect
      .element(page.getByText("Private workspace"))
      .not.toBeInTheDocument();
  }
);
