import { afterEach, expect, test, vi } from "vitest";

import type { WorkspaceSource } from "../../lib/console-http-paths";
import { withIdentityTransition } from "../../lib/identity-transition";
import {
  readWorkspaceSourceSession,
  retireWorkspaceSources,
} from "./workspace-source-session";

const source: WorkspaceSource = {
  id: "operations",
  account_issuer: "relay.accounts.local",
  shell_base_path: "/admin",
  api_base_path: "/admin/api",
  auth_base_path: "/auth/operator",
  mounts: [],
};
const csrfConfiguration = () =>
  Response.json({
    csrf: { cookie_name: "__Host-operator-csrf", header_name: "x-csrf-token" },
  });

afterEach(() => {
  retireWorkspaceSources();
  vi.restoreAllMocks();
});

// A real Web Lock proves cookie-write serialization. Unit service lifetime
// tests do not cover cancellation while the server is still exchanging cookies.
test("a cancelled discovery keeps the cookie-write lock until exchange completes", async () => {
  let account = "account-a";
  let authenticated = false;
  let completeExchange: ((response: Response) => void) | undefined;
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === "/auth/operator/session") {
        return Response.json({
          eligible: true,
          source_issuer: source.account_issuer,
          source_subject: account,
          operator_subject: "operator-a",
        });
      }
      if (path === "/api/console/v1/session") {
        return Response.json({
          mode: "required",
          authenticated: true,
          subject: account,
        });
      }
      if (path === "/admin/api/console/v1/session") {
        return authenticated
          ? Response.json(
              { mode: "required", authenticated: true, subject: "operator-a" },
              { headers: { "x-lenso-read-scope": "a".repeat(64) } }
            )
          : Response.json({}, { status: 401 });
      }
      if (path === "/auth/operator/methods") {
        return Response.json({
          csrf: {
            cookie_name: "__Host-operator-csrf",
            header_name: "x-csrf-token",
          },
        });
      }
      if (path === "/auth/operator/logout") {
        expect(new Headers(init?.headers).get("content-type")).toBe(
          "application/json"
        );
        expect(init?.body).toBe("{}");
        authenticated = false;
        return Response.json({ signed_out: true });
      }
      if (path === "/auth/operator/exchange") {
        expect(init?.signal).toBeUndefined();
        return new Promise<Response>((resolve) => {
          completeExchange = resolve;
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
  const controller = new AbortController();
  const pending = readWorkspaceSourceSession(
    source,
    account,
    controller.signal
  );
  const cancelled = expect(pending).rejects.toBeDefined();
  await vi.waitFor(() => expect(completeExchange).toBeDefined());
  controller.abort();
  const switchAccount = vi.fn(async () => {
    account = "account-b";
    authenticated = false;
  });
  const switched = withIdentityTransition(switchAccount);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(switchAccount).not.toHaveBeenCalled();
  authenticated = true;
  completeExchange!(
    Response.json({ authenticated: true, redirect: "/admin/" })
  );
  await cancelled;
  await switched;
  expect(switchAccount).toHaveBeenCalledOnce();
  expect(authenticated).toBe(false);
  expect(
    fetch.mock.calls.some(([input]) =>
      /bootstrap|resume-binding|grant/u.test(String(input))
    )
  ).toBe(false);
});

test("ordinary and foreign-issuer bindings cannot exchange or reuse operator cookies", async () => {
  for (const candidate of [
    {
      eligible: false,
      source_issuer: source.account_issuer,
      source_subject: "account-a",
      operator_subject: "operator-a",
    },
    {
      eligible: true,
      source_issuer: "other.accounts",
      source_subject: "account-a",
      operator_subject: "operator-a",
    },
    {
      eligible: true,
      source_issuer: source.account_issuer,
      source_subject: "account-b",
      operator_subject: "operator-a",
    },
  ]) {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(candidate));
    expect(
      await readWorkspaceSourceSession(
        source,
        "account-a",
        new AbortController().signal
      )
    ).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("/auth/operator/session");
    fetch.mockRestore();
  }
});

test("concurrent admissions publish one tracked transport and retirement rejects a pending admission", async () => {
  const methods: ((value: Response) => void)[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/auth/operator/session") {
      return Response.json({
        eligible: true,
        source_issuer: source.account_issuer,
        source_subject: "account-a",
        operator_subject: "operator-a",
      });
    }
    if (path === "/admin/api/console/v1/session") {
      return Response.json(
        { mode: "required", authenticated: true, subject: "operator-a" },
        { headers: { "x-lenso-read-scope": "a".repeat(64) } }
      );
    }
    if (path === "/auth/operator/methods") {
      return new Promise<Response>((resolve) => {
        methods.push(resolve);
      });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  const first = readWorkspaceSourceSession(
    source,
    "account-a",
    new AbortController().signal
  );
  const second = readWorkspaceSourceSession(
    source,
    "account-a",
    new AbortController().signal
  );
  await vi.waitFor(() => expect(methods).toHaveLength(2));
  for (const finish of methods) {
    finish(csrfConfiguration());
  }
  const [one, two] = await Promise.all([first, second]);
  expect(one).toBe(two);
  expect(one).not.toBeNull();
  retireWorkspaceSources([source.id]);
  expect(one?.signal.aborted).toBe(true);
  expect(two?.signal.aborted).toBe(true);
  methods.length = 0;
  const pending = readWorkspaceSourceSession(
    source,
    "account-a",
    new AbortController().signal
  );
  await vi.waitFor(() => expect(methods).toHaveLength(1));
  retireWorkspaceSources([source.id]);
  methods[0]!(csrfConfiguration());
  expect(await pending).toBeNull();
});
