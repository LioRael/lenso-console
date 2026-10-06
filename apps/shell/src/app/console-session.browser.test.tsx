import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import {
  AgentIdentityProvider,
  useAgentIdentity,
} from "../features/agent/agent-identity-context";
import { queryClient } from "../lib/query-client";
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
  queryClient.clear();
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

function AccountWorkspaceProbe() {
  const { loading } = useAgentIdentity();
  return <p>{loading ? "Loading Agent catalog" : "Account workspace ready"}</p>;
}

test("non-administrator workspace does not wait for a disabled Agent catalog", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/console/v1/session") {
      return Response.json({
        mode: "required",
        authenticated: true,
        subject: "account-workspace-member",
        administrator: false,
        management_enabled: false,
        human_management_enabled: false,
        workspace_ids: ["account-workspace"],
      });
    }
    if (String(input) === "/auth/methods") {
      return Response.json({
        methods: [
          {
            id: "password",
            kind: "password",
            label: "Sign in",
            action: "/auth/password/login",
          },
        ],
      });
    }
    throw new Error("A member must not request an Agent catalog");
  });
  vi.stubGlobal("fetch", fetcher);
  flushSync(() =>
    root.render(
      <ConsoleSession>
        <QueryClientProvider client={queryClient}>
          <AgentIdentityProvider>
            <AccountWorkspaceProbe />
          </AgentIdentityProvider>
        </QueryClientProvider>
      </ConsoleSession>
    )
  );
  await expect.element(page.getByText("Account workspace ready")).toBeVisible();
  expect(
    fetcher.mock.calls.every(([input]) => !String(input).includes("/agents"))
  ).toBe(true);
});

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
  vi.spyOn(document, "cookie", "get").mockReturnValue(
    "__Host-lenso-csrf=logout-proof"
  );
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth/logout") {
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe(
          "logout-proof"
        );
        signedIn = false;
        return new Response(null, { status: 204 });
      }
      if (String(input) === "/auth/methods") {
        return Response.json({
          csrf: {
            cookie_name: "__Host-lenso-csrf",
            header_name: "x-csrf-token",
          },
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

const admitted = {
  mode: "required",
  authenticated: true,
  subject: "alice",
  administrator: false,
  management_enabled: false,
  human_management_enabled: false,
  workspace_ids: ["one", "two"],
};

function statefulMount(freshnessMs?: number) {
  let mounts = 0;
  function Content() {
    const session = useConsoleSession();
    useEffect(() => {
      mounts += 1;
    }, []);
    return (
      <>
        <input aria-label="Workspace draft" defaultValue="" />
        <div
          aria-label="Workspace scroll"
          style={{ height: 100, overflow: "auto" }}
        >
          <p style={{ height: 500 }}>Private workspace</p>
        </div>
        <output>
          {session.subject}:{session.workspaceIds.join(",")}
        </output>
      </>
    );
  }
  flushSync(() =>
    root.render(
      <ConsoleSession {...(freshnessMs === undefined ? {} : { freshnessMs })}>
        <Content />
      </ConsoleSession>
    )
  );
  return () => mounts;
}

function methods() {
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

// Equal account names and permissions cannot identify separate Auth admission
// domains. Existing account/permission tests do not change only this metadata.
test("admitted realm metadata changes clear reads and remount private consumers while renewal preserves them", async () => {
  let scope = "a".repeat(64);
  let checks = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url) === "/auth/methods") {
        return methods();
      }
      checks += 1;
      return Response.json(admitted, {
        headers: { "x-lenso-read-scope": scope },
      });
    })
  );
  const mounts = statefulMount(0);
  const draft = page.getByRole("textbox", { name: "Workspace draft" });
  await draft.fill("private draft");
  queryClient.setQueryData(["realm-private-read"], "A metadata");
  const beforeRenewal = checks;
  await expect
    .poll(() => {
      window.dispatchEvent(new Event("focus"));
      return checks;
    })
    .toBeGreaterThan(beforeRenewal);
  await expect.element(draft).toHaveValue("private draft");
  expect(mounts()).toBe(1);
  expect(queryClient.getQueryData(["realm-private-read"])).toBe("A metadata");
  // Finish the coalesced renewal before requesting a second admission check.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  scope = "b".repeat(64);
  await expect
    .poll(() => {
      window.dispatchEvent(new Event("focus"));
      return queryClient.authenticationScope;
    })
    .toBe(scope);
  await expect.element(draft).toHaveValue("");
  expect(mounts()).toBe(2);
  expect(queryClient.getQueryData(["realm-private-read"])).toBeUndefined();
});

test("fresh focus is skipped and stale checks coalesce without remounting, clearing caches or losing draft/scroll", async () => {
  let clock = 100_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  let complete: ((response: Response) => void) | undefined;
  let checks = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/auth/methods") {
        return methods();
      }
      checks += 1;
      return checks === 1
        ? Response.json(admitted)
        : new Promise<Response>((resolve) => {
            complete = resolve;
          });
    })
  );
  const mounts = statefulMount();
  const input = page.getByRole("textbox", { name: "Workspace draft" });
  await input.fill("unsaved draft");
  const original = container.querySelector("input");
  const scroll = container.querySelector<HTMLDivElement>(
    '[aria-label="Workspace scroll"]'
  )!;
  scroll.scrollTop = 220;
  queryClient.setQueryData(["private-proof"], "keep");
  window.dispatchEvent(new Event("focus"));
  expect(checks).toBe(1);
  clock += 60_001;
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("focus"));
  await expect.poll(() => checks).toBe(2);
  expect(mounts()).toBe(1);
  expect(container.querySelector("input")).toBe(original);
  expect(scroll.scrollTop).toBe(220);
  expect(queryClient.getQueryData(["private-proof"])).toBe("keep");
  await expect
    .element(page.getByText("Checking your session…"))
    .not.toBeInTheDocument();
  complete?.(
    Response.json({ ...admitted, workspace_ids: ["two", "one", "one"] })
  );
  await expect
    .poll(
      () =>
        vi
          .mocked(fetch)
          .mock.calls.filter(([url]) => String(url) === "/auth/methods").length
    )
    .toBe(2);
  await expect.element(input).toHaveValue("unsaved draft");
  expect(mounts()).toBe(1);
  expect(queryClient.getQueryData(["private-proof"])).toBe("keep");
});

test.each(["network", "503"])(
  "temporary %s failure retains admitted content and backs off repeated focus",
  async (failure) => {
    let checks = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/auth/methods") {
          return methods();
        }
        checks += 1;
        if (checks === 1) {
          return Response.json(admitted);
        }
        if (failure === "network") {
          throw new TypeError("Network unavailable");
        }
        return new Response(null, { status: 503 });
      })
    );
    const mounts = statefulMount(0);
    const input = page.getByRole("textbox", { name: "Workspace draft" });
    await input.fill("keep after failure");
    queryClient.setQueryData(["private-proof"], "keep");
    window.dispatchEvent(new Event("focus"));
    await expect.poll(() => checks).toBe(2);
    // Flush the rejected fetch and the catch that records retry backoff.
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (let i = 0; i < 5; i += 1) {
      window.dispatchEvent(new Event("focus"));
    }
    expect(checks).toBe(2);
    expect(mounts()).toBe(1);
    await expect.element(input).toHaveValue("keep after failure");
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["private-proof"])).toBe("keep");
    // The scheduled retry recovers without recreating the page.
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url) === "/auth/methods" ? methods() : Response.json(admitted)
    );
    await expect
      .poll(
        () =>
          vi
            .mocked(fetch)
            .mock.calls.filter(([url]) => String(url) === "/auth/methods")
            .length
      )
      .toBe(2);
    expect(mounts()).toBe(1);
  }
);

test.each([
  "subject",
  "workspace_ids",
  "administrator",
  "management_enabled",
  "human_management_enabled",
] as const)(
  "changed %s retires private component state and caches",
  async (field) => {
    let value: Record<string, unknown> = admitted;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url) === "/auth/methods" ? methods() : Response.json(value)
      )
    );
    const mounts = statefulMount(0);
    const input = page.getByRole("textbox", { name: "Workspace draft" });
    await input.fill("old scope draft");
    queryClient.setQueryData(["private-proof"], "old scope");
    value = {
      ...admitted,
      [field]:
        field === "subject"
          ? "bob"
          : field === "workspace_ids"
            ? ["two"]
            : true,
    };
    window.dispatchEvent(new Event("focus"));
    await expect.poll(mounts).toBe(2);
    await expect.element(input).toHaveValue("");
    expect(queryClient.getQueryData(["private-proof"])).toBeUndefined();
  }
);

test("confirmed invalid session clears immediately even if Auth methods are unavailable", async () => {
  let valid = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      String(url) === "/auth/methods"
        ? valid
          ? methods()
          : new Response(null, { status: 503 })
        : valid
          ? Response.json(admitted)
          : new Response(null, { status: 401 })
    )
  );
  statefulMount(0);
  await page.getByRole("textbox", { name: "Workspace draft" }).fill("private");
  queryClient.setQueryData(["private-proof"], "secret");
  valid = false;
  window.dispatchEvent(new Event("focus"));
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Workspace draft" }))
    .not.toBeInTheDocument();
  expect(queryClient.getQueryData(["private-proof"])).toBeUndefined();
});

test.each(["options", "request"])(
  "retired %s requests cannot broadcast expiration into a new session",
  async (kind) => {
    const expired = vi.fn();
    window.addEventListener("lenso-session-expired", expired);
    try {
      let complete: ((response: Response) => void) | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              complete = resolve;
            })
        )
      );
      const controller = new AbortController();
      const request =
        kind === "options"
          ? sessionFetch("/api/private", { signal: controller.signal })
          : sessionFetch(
              new Request(new URL("/api/private", window.location.origin), {
                signal: controller.signal,
              })
            );
      controller.abort();
      complete?.(new Response(null, { status: 401 }));
      await expect(request).rejects.toMatchObject({ name: "AbortError" });
      expect(expired).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("lenso-session-expired", expired);
    }
  }
);

test("an expired event retires a pending check and its late response cannot replace the new subject", async () => {
  let checks = 0;
  let completeOld: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url) === "/auth/methods") {
        return methods();
      }
      checks += 1;
      if (checks === 2) {
        return new Promise<Response>((resolve) => {
          completeOld = resolve;
        });
      }
      return Response.json(
        checks === 1 ? admitted : { ...admitted, subject: "bob" }
      );
    })
  );
  statefulMount(0);
  await page
    .getByRole("textbox", { name: "Workspace draft" })
    .fill("alice draft");
  window.dispatchEvent(new Event("focus"));
  await expect.poll(() => checks).toBe(2);
  window.dispatchEvent(new Event("lenso-session-expired"));
  await expect.element(page.getByText("bob:one,two")).toBeVisible();
  completeOld?.(Response.json(admitted));
  await new Promise((resolve) => setTimeout(resolve, 20));
  await expect.element(page.getByText("bob:one,two")).toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Workspace draft" }))
    .toHaveValue("");
});

test("a confirmed permission change retires old content even if the subsequent configuration read fails", async () => {
  let changed = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      String(url) === "/auth/methods"
        ? changed
          ? new Response(null, { status: 503 })
          : methods()
        : Response.json(
            changed ? { ...admitted, workspace_ids: ["two"] } : admitted
          )
    )
  );
  statefulMount(0);
  await page.getByRole("textbox", { name: "Workspace draft" }).fill("private");
  queryClient.setQueryData(["private-proof"], "secret");
  changed = true;
  window.dispatchEvent(new Event("focus"));
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Workspace draft" }))
    .not.toBeInTheDocument();
  expect(queryClient.getQueryData(["private-proof"])).toBeUndefined();
});

test("sign-out waits for a retired check to settle and its late admission cannot reopen private content", async () => {
  let phase = "denied";
  let completeOld: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url) === "/auth/methods") {
        return methods();
      }
      if (String(url) === "/auth/logout") {
        phase = "signed-out";
        return new Response(null, { status: 204 });
      }
      if (phase === "holding") {
        return new Promise<Response>((resolve) => {
          completeOld = resolve;
        });
      }
      return new Response(null, { status: phase === "denied" ? 403 : 401 });
    })
  );
  mount();
  const signOut = page.getByRole("button", { name: "Sign out" });
  await expect.element(signOut).toBeVisible();
  phase = "holding";
  window.dispatchEvent(new Event("focus"));
  await expect.poll(() => Boolean(completeOld)).toBe(true);
  await signOut.click();
  // The origin-wide identity writer waits for the retired transport to settle.
  expect(phase).toBe("holding");
  completeOld?.(Response.json(admitted));
  await expect
    .element(page.getByRole("button", { name: "Work account" }))
    .toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await expect
    .element(page.getByText("Private workspace"))
    .not.toBeInTheDocument();
});

// Existing expired-event tests only cover one document; a remote Cookie transition
// must retire admitted content/cache before another tab finishes changing identity.
test("another identity surface retires cache until its transition completes", async () => {
  let subject = "alice";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      String(url) === "/auth/methods"
        ? methods()
        : Response.json({ ...admitted, subject })
    )
  );
  statefulMount(60_000);
  await page
    .getByRole("textbox", { name: "Workspace draft" })
    .fill("private draft");
  queryClient.setQueryData(["private-proof"], "private value");
  const peer = new BroadcastChannel("lenso-identity-transition");
  const broadcast = peer.postMessage.bind(peer);
  try {
    broadcast("begin");
    await expect
      .element(page.getByRole("textbox", { name: "Workspace draft" }))
      .not.toBeInTheDocument();
    expect(queryClient.getQueryData(["private-proof"])).toBeUndefined();
    subject = "bob";
    broadcast("complete");
    await expect.element(page.getByText("bob:one,two")).toBeVisible();
    await expect
      .element(page.getByRole("textbox", { name: "Workspace draft" }))
      .toHaveValue("");
  } finally {
    peer.close();
  }
});
