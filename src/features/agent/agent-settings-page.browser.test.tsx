import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { ToolAccess } from "./agent-settings-page";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let client: QueryClient | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  client?.clear();
  vi.unstubAllGlobals();
});

test("bulk edits cover all tools and remain drafts until explicitly saved", async () => {
  let allowed = ["read"];
  let revision = 1;
  let conflict = false;
  const writes: unknown[] = [];
  const available = ["read", "edit", "search"].map((name) => ({
    name,
    description: name,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("bootstrap")) {
        return Response.json({
          mode: "console",
          profile: "code",
          trajectory: "lenso.agent.trajectory@1",
          capabilities: {
            cancel: false,
            edit: false,
            sessionList: false,
            sessionRead: false,
            userInteraction: false,
          },
          tools: { allowed, available },
        });
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        if (conflict) {
          revision += 1;
          return Response.json(
            { detail: "Policy changed elsewhere" },
            { status: 409 }
          );
        }
        expect(body.expectedRevision).toBe(revision);
        ({ allowed } = body);
        revision += 1;
      }
      return Response.json({
        schema: "lenso.agent.tool-policy.v1",
        revision,
        allowed,
        available,
      });
    })
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root?.render(
      <QueryClientProvider client={client!}>
        <ThemeScope>
          <ToolAccess
            agent={{
              id: "app",
              label: "Lenso Agent",
              role: "app",
              capabilities: ["lenso.agent.plugin-configuration@1"],
            }}
          />
        </ThemeScope>
      </QueryClientProvider>
    )
  );
  await expect
    .element(page.getByRole("switch", { name: "Allow read", exact: true }))
    .toBeChecked();
  await page.getByRole("searchbox", { name: "Filter tools" }).fill("edit");
  await page.getByRole("button", { name: "Enable all", exact: true }).click();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => allowed).toEqual(["edit", "read", "search"]);
  await page.getByRole("button", { name: "Disable all", exact: true }).click();
  expect(writes).toHaveLength(1);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect
    .element(page.getByRole("switch", { name: "Allow edit", exact: true }))
    .toBeChecked();
  await page.getByRole("button", { name: "Disable all", exact: true }).click();
  conflict = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .element(
      page.getByText(
        "Tool access changed elsewhere. Reset your draft to load the latest policy."
      )
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Save changes", exact: true }))
    .toBeDisabled();
  expect(allowed).toEqual(["edit", "read", "search"]);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  conflict = false;
  await page.getByRole("button", { name: "Disable all", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => allowed).toEqual([]);
});
