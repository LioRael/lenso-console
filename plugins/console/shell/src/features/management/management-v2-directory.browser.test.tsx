import { ThemeScope } from "@lenso/ui";

import "@lenso/tokens/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import type { PageMount } from "../extensions/page-contribution-catalog";
import { ManagementV2Directory } from "./management-v2-directory";

vi.mock("../../app/console-locale", () => ({
  useConsoleLocale: () => ({ locale: "en" }),
}));
vi.mock("../../lib/console-http-paths", () => ({
  consoleHttpPaths: { api_base_path: "/prefix/api" },
}));
let mounts: readonly PageMount[] = [];
vi.mock("../extensions/page-contribution-catalog", () => ({
  usePageCatalog: () => ({ data: mounts }),
}));
const requests: { url: string; signal: AbortSignal | null | undefined }[] = [];
let pending = false;
vi.mock("../../lib/session-fetch", () => ({
  sessionFetch: async (url: string, init: RequestInit) => {
    requests.push({ url, signal: init.signal });
    if (pending) {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason)
        );
      });
    }
    return Response.json(
      url.endsWith("/catalog")
        ? {
            operations: ["alpha", "beta", "missing"].map((targetId) => ({
              approval: false,
              available: true,
              confirmation: false,
              description: `Restart ${targetId}`,
              effect: "write",
              key: targetId,
              method: "restart",
              pluginId: "worker",
              targetId,
            })),
          }
        : {
            targets: [
              { id: "alpha", label: "Alpha execution target" },
              { id: "beta", label: "Beta execution target" },
            ],
          }
    );
  },
}));
vi.mock("@lenso/console-sdk/transport", () => ({
  createConsoleClient: (options: {
    url: string;
    fetch: (url: string, init: RequestInit) => Promise<Response>;
  }) => ({
    catalog: async () => {
      const response = await options.fetch(`${options.url}/catalog`, {});
      return response.json();
    },
    targets: async () => {
      const response = await options.fetch(`${options.url}/targets`, {});
      return response.json();
    },
  }),
}));

function serviceMount(targetId: string): PageMount {
  return {
    apiMajor: 1,
    id: `worker-${targetId}`,
    module: "",
    navigation: { items: [], label: "Worker" },
    owner: { instance: "worker", source: "application", trusted: true },
    requirements: [
      {
        available: true,
        capability_id: "worker",
        descriptor_version: "1",
        operations: ["restart"],
        required: true,
        service_id: "control",
        source: "owner",
      },
    ],
    revision: "1",
    styles: [],
    subject: { kind: "console" },
    targetId,
    title: "Worker",
  };
}
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let client: QueryClient;
afterEach(() => {
  flushSync(() => root?.unmount());
  client?.clear();
  container?.remove();
  requests.length = 0;
  pending = false;
});
function mount() {
  client = new QueryClient();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root?.render(
      <ThemeScope>
        <QueryClientProvider client={client}>
          <ManagementV2Directory subject="fixture" />
        </QueryClientProvider>
      </ThemeScope>
    )
  );
}

test("keeps target labels and native keyboard destinations bound with bounded geometry", async () => {
  mounts = [serviceMount("beta"), serviceMount("alpha")];
  mount();
  const links = page.getByRole("link", { name: "Open installed service" });
  await expect.element(links.nth(0)).toHaveAttribute("href", "/worker-alpha/");
  await expect.element(links.nth(1)).toHaveAttribute("href", "/worker-beta/");
  await expect
    .element(page.getByText("Target: Alpha execution target · Effect: write"))
    .toBeVisible();
  await expect
    .element(page.getByText("Target: Beta execution target · Effect: write"))
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        "No uniquely installed service page is available for this operation."
      )
    )
    .toBeVisible();
  const refresh = page
    .getByRole("button", { name: "Refresh" })
    .element() as HTMLButtonElement;
  refresh.focus();
  await userEvent.keyboard("{Tab}");
  await expect.element(links.nth(0)).toHaveFocus();
  await userEvent.keyboard("{Tab}");
  await expect.element(links.nth(1)).toHaveFocus();
  for (const width of [1280, 390]) {
    await page.viewport(width, 800);
    const heading = page
      .getByRole("heading", { name: "Restart alpha" })
      .element()
      .getBoundingClientRect();
    const link = links.nth(0).element().getBoundingClientRect();
    expect(Math.abs(heading.left - link.left)).toBeLessThanOrEqual(1);
    expect(link.right).toBeLessThanOrEqual(width);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  }
  expect(requests.map(({ url }) => url)).toEqual([
    "/prefix/api/console/v2/rpc/catalog",
    "/prefix/api/console/v2/rpc/targets",
  ]);
});

test("shows ambiguity without a misleading installed-page link", async () => {
  mounts = [
    serviceMount("alpha"),
    { ...serviceMount("alpha"), id: "alternate" },
  ];
  mount();
  await expect
    .element(page.getByRole("heading", { name: "Restart alpha" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Open installed service" }))
    .not.toBeInTheDocument();
  expect(
    page
      .getByText(
        "No uniquely installed service page is available for this operation."
      )
      .elements()
  ).toHaveLength(3);
});

test("cancels both in-flight SDK reads at the fetch boundary", async () => {
  mounts = [];
  pending = true;
  mount();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests.every(({ signal }) => signal && !signal.aborted)).toBe(true);
  await client.cancelQueries({
    queryKey: ["management-v2-directory", "fixture"],
  });
  expect(requests.every(({ signal }) => signal?.aborted)).toBe(true);
});
