import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { PageContributionOutlet } from "./page-contribution-outlet";

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
          name: "Extension workspace",
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
  window.history.replaceState({}, "", "/apps/app/pages/observe-app");
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
    expect(window.location.pathname).toBe("/workspaces/projects");
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
