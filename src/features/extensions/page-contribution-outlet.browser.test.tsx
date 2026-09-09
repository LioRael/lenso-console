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
        export const createPage = () => ({
          Page: () => { throw new Error("Contribution render exploded"); }
        });
      `)}`,
        navigation: { label: "Broken" },
        styles: [],
        subject: "console",
        title: "Broken",
      },
    ]
  );
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet mountId="broken" segments={[]} />
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
