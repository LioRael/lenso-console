import { expect, test } from "bun:test";

import {
  consoleAuthenticationError,
  parseConsoleAuthDiscovery,
  safeConsoleReturnPath,
} from "../../src/authentication";
import {
  configureSessionReadScope,
  retireSessionReads,
  sessionFetch,
} from "../../src/browser-session-fetch";

test("discovery admits typed local host actions, not remote UI or duplicate methods", () => {
  const password = {
    id: "password",
    kind: "password",
    label: "Sign in",
    action: "/auth/login",
  };
  expect(
    parseConsoleAuthDiscovery({
      methods: [
        password,
        {
          id: "sso",
          kind: "redirect",
          label: "Company account",
          action: "/auth/sso",
        },
        {
          id: "device",
          kind: "custom",
          renderer: "device-code",
          label: "Device code",
          action: "/auth/device",
        },
      ],
      session: { logout: "/auth/logout" },
    }).methods
  ).toHaveLength(3);
  for (const methods of [
    [password, password],
    [{ ...password, action: "https://other.test/login" }],
    [{ ...password, action: "//other.test/login" }],
    [{ ...password, action: "/auth/../login" }],
    [{ ...password, kind: "script", module: "/login.js" }],
    [{ ...password, kind: "custom" }],
  ]) {
    expect(() => parseConsoleAuthDiscovery({ methods })).toThrow();
  }
  expect(() =>
    parseConsoleAuthDiscovery({
      methods: [],
      session: { renew: "/auth/renew?token=secret" },
    })
  ).toThrow();
  expect(() =>
    parseConsoleAuthDiscovery({
      methods: [password],
      csrf: { cookie_name: "session", header_name: "authorization" },
    })
  ).toThrow();
});

test("return paths stay within Console or explicit application-approved roots", () => {
  expect(
    safeConsoleReturnPath("/console/orders?filter=open#item", ["/console"])
  ).toBe("/console/orders?filter=open#item");
  expect(safeConsoleReturnPath("/authorization/", ["/authorization"])).toBe(
    "/authorization/"
  );
  for (const path of [
    "//evil.test",
    "https://evil.test",
    "/console-evil",
    "/outside",
    "/console/../outside",
    "/console/%2e%2e/outside",
    "/console/%2f/evil",
    "/console/%252f/evil",
    "/console\\evil",
    "/console/\n",
  ]) {
    expect(safeConsoleReturnPath(path, ["/console"])).toBe("/console");
  }
  expect(safeConsoleReturnPath("/auth/login")).toBe("/");
});

test("admission does not confuse unavailable providers or forbidden access with expiry", () => {
  expect(consoleAuthenticationError(401).state).toBe("unauthenticated");
  expect(consoleAuthenticationError(401, true).state).toBe("expired");
  expect(consoleAuthenticationError(412).state).toBe("expired");
  expect(consoleAuthenticationError(403, true).state).toBe("forbidden");
  expect(consoleAuthenticationError(503, true).state).toBe("unavailable");
});

test("an HTTP response resolving after cancellation cannot invalidate a newer session", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  let invalidations = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "https://console.test" },
      dispatchEvent: () => {
        invalidations += 1;
      },
    },
  });
  let resolveResponse!: (response: Response) => void;
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    })) as typeof fetch;
  const old = new AbortController();
  const reason = new Error("old page retired");
  try {
    configureSessionReadScope("a".repeat(64), async () => {});
    const pending = sessionFetch("/api/console/v1/pages", {
      signal: old.signal,
    });
    old.abort(reason);
    retireSessionReads();
    configureSessionReadScope("b".repeat(64), async () => {});
    resolveResponse(new Response(null, { status: 401 }));
    await expect(pending).rejects.toBe(reason);
    expect(invalidations).toBe(0);
  } finally {
    retireSessionReads();
    globalThis.fetch = originalFetch;
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
