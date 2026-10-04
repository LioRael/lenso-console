import "@lenso/tokens/styles.css";
import "../../styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import type { PageMount } from "./page-contribution-catalog";
import { PageContributionOutlet } from "./page-contribution-outlet";

function fixture(kind: "empty" | "invalid" | "valid") {
  const id = `recovery-${kind}-${crypto.randomUUID()}`;
  const base = `/api/console/v1/pages/${id}/assets/${"a".repeat(64)}`;
  const mount = {
    apiMajor: 1 as const,
    id,
    pageId: id,
    module: `${base}/workspace.mjs`,
    navigation: { items: [], label: "Recovery" },
    owner: {
      instance: `${id}/default`,
      source: "resolved-plan" as const,
      trusted: true,
    },
    requirements: [],
    revision: "1",
    styles: [`${base}/workspace.css`],
    subject: { kind: "console" as const },
    title: "Workspace",
  };
  return mount;
}

function mounted(mount: PageMount) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["console-page-catalog"], [mount]);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = () => {
    flushSync(() => {
      root.render(
        <QueryClientProvider client={client}>
          <PageContributionOutlet
            mountId={mount.id}
            segments={[]}
            subject={{ kind: "console" }}
          />
        </QueryClientProvider>
      );
    });
  };
  render();
  return {
    update(next: PageMount) {
      client.setQueryData(["console-page-catalog"], [next]);
      render();
    },
    dispose() {
      root.unmount();
      client.clear();
      container.remove();
    },
  };
}

function importedUrls(module: string) {
  return performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name))
    .filter((url) => url.pathname === module);
}

// Existing immutable data: fixtures cannot test a repaired server response against
// an already evaluated, empty namespace in the browser's ESM module map.
test("explicit Retry recovers an empty cached module after the server repairs it", async () => {
  const evaluations: Record<string, number> = {};
  vi.stubGlobal("__lensoRecoveryEvaluations", evaluations);
  const mount = fixture("empty");
  const view = mounted(mount);
  try {
    await expect
      .element(page.getByText("The extension module contract is invalid"))
      .toBeVisible();
    const repaired = await fetch(mount.module, { cache: "no-store" });
    expect(repaired.status).toBe(200);
    expect(repaired.headers.get("content-type")).toContain("text/javascript");
    expect(await repaired.text()).toContain("export const apiMajor = 1");
    // Correct fresh HTTP bytes do not replace the old namespace.
    // eslint-disable-next-line no-inline-comments -- Vite requires this import annotation.
    const cached = await import(/* @vite-ignore */ mount.module);
    expect(Object.keys(cached)).toEqual([]);
    await userEvent.tab();
    expect(document.activeElement).toBe(
      page.getByRole("button", { name: "Try again" }).element()
    );
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("heading", { name: "Recovered Workspace" }))
      .toBeVisible();
    expect(evaluations[mount.module]).toBe(1);
    const moduleUrl = importedUrls(mount.module).find((url) =>
      url.searchParams.has("__lenso_console_recovery")
    );
    expect(moduleUrl).toBeDefined();
    const stylesheet = document.querySelector<HTMLLinkElement>(
      `link[data-console-contribution="${mount.id}"]`
    );
    expect(
      new URL(stylesheet!.href).searchParams.get("__lenso_console_recovery")
    ).toBe(moduleUrl!.searchParams.get("__lenso_console_recovery"));
    expect(moduleUrl!.origin).toBe(window.location.origin);
    expect(moduleUrl!.pathname).toBe(mount.module);
    view.dispose();
    const remounted = mounted({ ...mount, title: "After session remount" });
    try {
      await expect
        .element(
          page.getByRole("heading", { name: "Recovered After session remount" })
        )
        .toBeVisible();
      expect(evaluations[mount.module]).toBe(1);
    } finally {
      remounted.dispose();
    }
  } finally {
    view.dispose();
  }
});

test("recovery keeps rejecting invalid exports and reuses one recovery identity", async () => {
  const evaluations: Record<string, number> = {};
  vi.stubGlobal("__lensoRecoveryEvaluations", evaluations);
  const mount = fixture("invalid");
  const view = mounted(mount);
  try {
    await expect
      .element(page.getByText("The extension module contract is invalid"))
      .toBeVisible();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.getByRole("button", { name: "Try again" }).click();
      await expect
        .element(page.getByText("The extension module contract is invalid"))
        .toBeVisible();
    }
    expect(evaluations[mount.module]).toBe(2);
    expect(
      new Set(importedUrls(mount.module).map((url) => url.href)).size
    ).toBe(2);
    await expect
      .element(page.getByRole("heading", { name: "Recovered Workspace" }))
      .not.toBeInTheDocument();
  } finally {
    view.dispose();
  }
});

test("normal loads reuse executable code across factory remounts", async () => {
  const evaluations: Record<string, number> = {};
  vi.stubGlobal("__lensoRecoveryEvaluations", evaluations);
  const mount = fixture("valid");
  const view = mounted(mount);
  try {
    await expect
      .element(page.getByRole("heading", { name: "Recovered Workspace" }))
      .toBeVisible();
    view.update({ ...mount, title: "Another factory" });
    await expect
      .element(page.getByRole("heading", { name: "Recovered Another factory" }))
      .toBeVisible();
    expect(evaluations[mount.module]).toBe(1);
    expect(
      importedUrls(mount.module).every(
        (url) => !url.searchParams.has("__lenso_console_recovery")
      )
    ).toBe(true);
  } finally {
    view.dispose();
  }
});
