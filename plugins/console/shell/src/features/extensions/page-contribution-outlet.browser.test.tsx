import "@lenso/tokens/styles.css";
import "../../styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import type { PageMount } from "./page-contribution-catalog";
import { PageContributionOutlet } from "./page-contribution-outlet";

const sessionScope = vi.hoisted(() => ({ subject: "local" }));
vi.mock(import("../../app/console-session"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useConsoleSession: () => ({
      ...actual.useConsoleSession(),
      subject: sessionScope.subject,
    }),
  };
});

// A business read effect may depend on navigation/location/environment. Existing
// lifetime tests cover unmount cancellation, not redundant reads after a same-scope
// Host render with semantically identical route props.
test("same-scope Host renders keep read dependencies stable while route changes still reach the page", async () => {
  sessionScope.subject = "local";
  const reads = vi.fn();
  const factories = vi.fn();
  vi.stubGlobal("__lensoRefreshDependencyRead", reads);
  vi.stubGlobal("__lensoRefreshDependencyFactory", factories);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["console-page-catalog"],
    [
      {
        apiMajor: 1,
        id: "refresh-dependencies",
        module: `data:text/javascript,${encodeURIComponent(`
      export const apiMajor = 1;
      export function createWorkspace({ react, createElement, modules }) {
        if (typeof modules?.["@lenso/console-sdk/locale"]?.useConsoleLocale !== "function") {
          throw new Error("Workspace locale external is unavailable");
        }
        globalThis.__lensoRefreshDependencyFactory();
        return { Page: ({ mount, navigation, location, environment, readRefreshPolicy }) => {
          react.useEffect(() => {
            globalThis.__lensoRefreshDependencyRead(location.segments.join("/"));
          }, [mount, navigation, location, environment, readRefreshPolicy]);
          return createElement("h1", null, "Route " + location.segments.join("/"));
        } };
      }
    `)}`,
        navigation: { items: [], label: "Read dependencies" },
        owner: {
          instance: "reads/alpha",
          source: "resolved-plan",
          trusted: true,
        },
        requirements: [],
        revision: "fixture-1",
        styles: [],
        subject: { kind: "console" },
        title: "Read dependencies",
      },
    ]
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (segment: string) =>
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId="refresh-dependencies"
            segments={[segment]}
            subject={{ kind: "console" }}
          />
        </QueryClientProvider>
      )
    );
  try {
    render("keys");
    await expect
      .element(page.getByRole("heading", { name: "Route keys" }))
      .toBeVisible();
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
    render("keys");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(reads).toHaveBeenCalledTimes(1);
    expect(factories).toHaveBeenCalledTimes(1);
    render("other");
    await expect
      .element(page.getByRole("heading", { name: "Route other" }))
      .toBeVisible();
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
    expect(reads).toHaveBeenLastCalledWith("other");
    expect(factories).toHaveBeenCalledTimes(1);
  } finally {
    root.unmount();
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  }
});

// Existing browser coverage loads one owner. This protects factory/state identity,
// old request completion and retained action/navigation callbacks during a switch.
test("reuses a page implementation while isolating instance state and retired actions", async () => {
  sessionScope.subject = "alice";
  const signals: AbortSignal[] = [];
  const callbacks: (() => void)[] = [];
  vi.stubGlobal("__lensoInstanceSignals", signals);
  vi.stubGlobal("__lensoInstanceNavigation", callbacks);
  const retired = vi.fn();
  const expired = vi.fn();
  vi.stubGlobal("__lensoRetiredInstanceCall", retired);
  window.addEventListener("lenso-session-expired", expired);
  let finish!: (response: Response) => void;
  const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/slow")) {
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return Promise.resolve(
      Response.json({
        message: path.includes("/alpha/")
          ? "Alpha config and log"
          : new Headers(init?.headers).get("x-lenso-expected-subject") === "bob"
            ? "Bob config and log"
            : "Beta config and log",
      })
    );
  });
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) =>
    String(url).includes("/services/")
      ? fetch(url, init)
      : originalFetch(url, init)
  );
  const module = `data:text/javascript,${encodeURIComponent(`
    export const apiMajor = 1;
    export function createWorkspace({ react, createElement, services }) {
      const cache = new Map();
      return { Page: ({ mount, navigation, signal }) => {
        const [message, setMessage] = react.useState("Ready " + mount.owner.instance);
        react.useEffect(() => {
          globalThis.__lensoInstanceSignals.push(signal);
          globalThis.__lensoInstanceNavigation.push(() => navigation.go(["details"]));
        }, [signal]);
        const invoke = async (operation) => {
          try {
            const result = cache.get(operation) || await services.invoke("example", operation, {});
            cache.set(operation, result);
            setMessage(result.message);
          } catch (error) {
            if (signal.aborted) globalThis.__lensoRetiredInstanceCall();
            if (!signal.aborted) setMessage(error.message);
          }
        };
        return createElement("section", null,
          createElement("h1", null, mount.title),
          createElement("p", null, message),
          createElement("a", { href: navigation.href(["details"]) }, "Details"),
          createElement("button", { type: "button", onClick: () => invoke("read") }, "Read config and log"),
          createElement("button", { type: "button", onClick: () => invoke("slow") }, "Delayed action")
        );
      } };
    }
  `)}`;
  const mounts: PageMount[] = ["alpha", "beta"].map((id) => ({
    apiMajor: 1,
    basePath: id === "alpha" ? "/workspace-one/" : "/workspace-two/",
    id,
    pageId: "example",
    module,
    owner: {
      instance: `example/${id}`,
      source: "resolved-plan",
      trusted: true,
    },
    navigation: { items: [], label: id },
    requirements: [
      {
        available: true,
        capability_id: "example.query@1",
        descriptor_version: "1.0.0",
        operations: ["read", "slow"],
        required: true,
        service_id: "example",
        source: "owner",
      },
    ],
    revision: "1",
    styles: [],
    subject: { kind: "console" },
    title: id === "alpha" ? "Alpha instance" : "Beta instance",
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["console-page-catalog"], mounts);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (id: string) =>
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId={id}
            segments={[]}
            subject={{ kind: "console" }}
          />
        </QueryClientProvider>
      )
    );
  try {
    window.history.replaceState({}, "", "/workspace-one/");
    render("alpha");
    await expect
      .element(page.getByRole("heading", { name: "Alpha instance" }))
      .toBeVisible();
    await page.getByRole("button", { name: "Read config and log" }).click();
    await expect.element(page.getByText("Alpha config and log")).toBeVisible();
    await page.getByRole("button", { name: "Delayed action" }).click();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    window.history.replaceState({}, "", "/workspace-two/");
    render("beta");
    expect(container.textContent).not.toContain("Alpha config and log");
    await expect.element(page.getByText("Ready example/beta")).toBeVisible();
    expect(signals[0]?.aborted).toBe(true);
    expect(signals.at(-1)?.aborted).toBe(false);
    callbacks[0]?.();
    expect(window.location.pathname).toBe("/workspace-two/");
    await page.getByRole("button", { name: "Read config and log" }).click();
    await expect.element(page.getByText("Beta config and log")).toBeVisible();
    finish(Response.json({ message: "Late Alpha result" }, { status: 401 }));
    await vi.waitFor(() => expect(retired).toHaveBeenCalledOnce());
    expect(expired).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    await expect
      .element(page.getByText("Late Alpha result"))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("Beta config and log")).toBeVisible();
    expect(
      page.getByRole("link", { name: "Details" }).element().getAttribute("href")
    ).toBe("/workspace-two/details/");
    // The mount/catalog are unchanged: only the authenticated session changes.
    // Existing mount-switch coverage cannot catch an Alice factory reused for Bob.
    await page.getByRole("button", { name: "Delayed action" }).click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const aliceSignal = signals.at(-1);
    sessionScope.subject = "bob";
    render("beta");
    expect(container.textContent).not.toContain("Beta config and log");
    await expect.element(page.getByText("Ready example/beta")).toBeVisible();
    expect(aliceSignal?.aborted).toBe(true);
    await page.getByRole("button", { name: "Read config and log" }).click();
    await expect.element(page.getByText("Bob config and log")).toBeVisible();
    finish(Response.json({ message: "Late Alice result" }, { status: 401 }));
    await vi.waitFor(() => expect(retired).toHaveBeenCalledTimes(2));
    expect(expired).not.toHaveBeenCalled();
    expect(
      new Headers(fetch.mock.calls[2]?.[1]?.headers).get(
        "x-lenso-expected-subject"
      )
    ).toBe("alice");
    expect(
      new Headers(fetch.mock.calls[4]?.[1]?.headers).get(
        "x-lenso-expected-subject"
      )
    ).toBe("bob");
    await expect
      .element(page.getByText("Late Alice result"))
      .not.toBeInTheDocument();
  } finally {
    sessionScope.subject = "local";
    root.unmount();
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
    window.removeEventListener("lenso-session-expired", expired);
    window.history.replaceState({}, "", "/");
  }
});

test("gives a StrictMode contribution a live signal and cancels it on unmount", async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal("__lensoStrictContributionSignals", signals);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["console-page-catalog"],
    [
      {
        apiMajor: 1,
        id: "strict-signal",
        module: `data:text/javascript,${encodeURIComponent(`
      export const apiMajor = 1;
      export function createWorkspace({ react, createElement }) {
        return { Page: ({ signal }) => {
          const [status, setStatus] = react.useState("waiting");
          react.useEffect(() => {
            globalThis.__lensoStrictContributionSignals.push(signal);
            if (signal.aborted) return;
            setStatus("Live contribution signal");
          }, [signal]);
          return createElement("h1", null, status);
        } };
      }
    `)}`,
        navigation: { items: [], label: "Strict signal" },
        owner: {
          instance: "strict/default",
          source: "resolved-plan",
          trusted: true,
        },
        requirements: [],
        revision: "fixture-1",
        styles: [],
        subject: { kind: "console" },
        title: "Strict signal",
      },
    ]
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    flushSync(() =>
      root.render(
        <StrictMode>
          <QueryClientProvider client={client}>
            <PageContributionOutlet
              mountId="strict-signal"
              segments={[]}
              subject={{ kind: "console" }}
            />
          </QueryClientProvider>
        </StrictMode>
      )
    );
    await expect
      .element(page.getByRole("heading", { name: "Live contribution signal" }))
      .toBeVisible();
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    flushSync(() => root.unmount());
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  } finally {
    if (container.hasChildNodes()) {
      root.unmount();
    }
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  }
});

test("loads a discovered native contribution without a static component import", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  try {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId="welcome"
            segments={["request", "example"]}
            subject={{ kind: "console" }}
          />
        </QueryClientProvider>
      )
    );
    await expect
      .element(
        page.getByRole("heading", {
          name: "Welcome",
          exact: true,
        })
      )
      .toBeVisible();
    await expect.element(page.getByText("request/example")).toBeVisible();
    expect(
      document.head.querySelector('link[data-console-contribution="welcome"]')
    ).not.toBeNull();
  } finally {
    root.unmount();
    client.clear();
    container.remove();
  }
  expect(
    document.head.querySelector('link[data-console-contribution="welcome"]')
  ).toBeNull();
});

test("binds an App Workspace to the canonical URL subject", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  try {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId="development-overview"
            segments={[]}
            subject={{ appId: "development", kind: "app" }}
          />
        </QueryClientProvider>
      )
    );
    await expect
      .element(page.getByRole("heading", { name: "App workspace" }))
      .toBeVisible();
    await expect.element(page.getByText("Target: development")).toBeVisible();
  } finally {
    root.unmount();
    client.clear();
    container.remove();
  }
});

test("does not load an extension whose required service is unavailable", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["console-page-catalog"],
    [
      {
        apiMajor: 1,
        id: "blocked-service",
        module: `data:text/javascript,${encodeURIComponent(`
          globalThis.__lensoBlockedContributionLoaded = true;
          export const apiMajor = 1;
          export const createWorkspace = () => ({
            Page: () => null
          });
        `)}`,
        navigation: { items: [], label: "Blocked" },
        owner: {
          instance: "blocked/default",
          source: "resolved-plan",
          trusted: true,
        },
        requirements: [
          {
            available: false,
            capability_id: `example.${"a".repeat(116)}@1`,
            descriptor_version: "1.0.0",
            operations: ["observe"],
            required: true,
            service_id: "task",
            source: "owner",
          },
        ],
        revision: "1.0.0",
        styles: [],
        subject: { kind: "console" },
        title: "Blocked service",
      },
    ]
  );
  try {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId="blocked-service"
            segments={[]}
            subject={{ kind: "console" }}
          />
        </QueryClientProvider>
      )
    );
    await expect
      .element(
        page.getByRole("heading", {
          name: "Extension requirement unavailable",
        })
      )
      .toBeVisible();
    await expect
      .element(
        page.getByText(/A required service is unavailable.*task \(example\./)
      )
      .toBeVisible();
    // Public contract names may be long; diagnostics must remain readable at
    // supported widths without adding a second horizontal document scrollbar.
    const previousTheme = document.documentElement.dataset.theme;
    try {
      for (const theme of ["light", "dark"]) {
        document.documentElement.dataset.theme = theme;
        for (const width of [1280, 390]) {
          await page.viewport(width, width === 390 ? 844 : 800);
          expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
            window.innerWidth
          );
          if (import.meta.env.VITE_CONSOLE_DX_SCREENSHOTS === "1") {
            await page.screenshot({
              path: `__screenshots__/diagnostic-${theme}-${width}.png`,
            });
          }
        }
      }
    } finally {
      if (previousTheme === undefined) {
        delete document.documentElement.dataset.theme;
      } else {
        document.documentElement.dataset.theme = previousTheme;
      }
      await page.viewport(1280, 800);
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(
      Reflect.get(window, "__lensoBlockedContributionLoaded")
    ).toBeUndefined();
  } finally {
    Reflect.deleteProperty(window, "__lensoBlockedContributionLoaded");
    root.unmount();
    client.clear();
    container.remove();
  }
});

test("hands bounded JSON context to an installed workspace without reloading", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["console-page-catalog"],
    [
      {
        apiMajor: 1,
        id: "observe-app",
        module: `data:text/javascript,${encodeURIComponent(`
          export const apiMajor = 1;
          export const createWorkspace = ({ createElement }) => ({
            Page: ({ navigation }) => createElement(
              "button",
              {
                onClick: () => navigation.openWorkspace({
                  workspaceId: "projects",
                  subject: { kind: "console" },
                  handoff: {
                    kind: "lenso.observe.trace@1",
                    payload: { trace_id: "trace-1" }
                  }
                }),
                type: "button"
              },
              "Create issue"
            )
          });
        `)}`,
        navigation: { items: [], label: "Observe" },
        owner: {
          instance: "observe/app",
          source: "resolved-plan",
          trusted: true,
        },
        requirements: [],
        revision: "1.0.0",
        styles: [],
        subject: { appId: "app", kind: "app" },
        title: "Observe",
      },
      {
        apiMajor: 1,
        id: "projects",
        module: `data:text/javascript,${encodeURIComponent(`
          export const apiMajor = 1;
          export const createWorkspace = ({ createElement }) => ({
            Page: ({ location }) => createElement(
              "p",
              null,
              "Received " + location.handoff.payload.trace_id
            )
          });
        `)}`,
        navigation: { items: [], label: "Projects" },
        owner: {
          instance: "projects/default",
          source: "resolved-plan",
          trusted: true,
        },
        requirements: [],
        revision: "1.0.0",
        styles: [],
        subject: { kind: "console" },
        title: "Projects",
      },
    ]
  );
  window.history.replaceState({}, "", "/apps/app/observe-app/");
  try {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId="observe-app"
            segments={[]}
            subject={{ appId: "app", kind: "app" }}
          />
        </QueryClientProvider>
      )
    );
    await page.getByRole("button", { name: "Create issue" }).click();
    expect(window.location.pathname).toBe("/projects/");
    expect(window.history.state.__lensoWorkspaceHandoff).toMatchObject({
      handoff: {
        kind: "lenso.observe.trace@1",
        payload: { trace_id: "trace-1" },
      },
      subject: { kind: "console" },
      workspaceId: "projects",
    });
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId="projects"
            segments={[]}
            subject={{ kind: "console" }}
          />
        </QueryClientProvider>
      )
    );
    await expect.element(page.getByText("Received trace-1")).toBeVisible();
    await vi.waitFor(() =>
      expect(window.history.state.__lensoWorkspaceHandoff).toBeUndefined()
    );
  } finally {
    root.unmount();
    client.clear();
    container.remove();
    window.history.replaceState({}, "", "/");
  }
});

test("contains a contribution render failure and allows a retry", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["console-page-catalog"],
    [
      {
        apiMajor: 1,
        id: "broken",
        module: `data:text/javascript,${encodeURIComponent(`
        export const apiMajor = 1;
        export const createWorkspace = () => ({
          Page: () => { throw new Error("Contribution render exploded"); }
        });
      `)}`,
        navigation: { items: [], label: "Broken" },
        owner: {
          instance: "broken.plugin",
          source: "resolved-plan",
          trusted: true,
        },
        requirements: [],
        revision: "1.0.0",
        styles: [],
        subject: { kind: "console" },
        title: "Broken",
      },
    ]
  );
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId="broken"
            segments={[]}
            subject={{ kind: "console" }}
          />
        </QueryClientProvider>
      )
    );
    await expect
      .element(
        page.getByRole("heading", { name: "Extension failed to render" })
      )
      .toBeVisible();
    await expect
      .element(page.getByText("Contribution render exploded"))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Try again" }))
      .toBeVisible();
  } finally {
    consoleError.mockRestore();
    root.unmount();
    client.clear();
    container.remove();
  }
});
