import "@lenso/tokens/styles.css";
import { ThemeScope } from "@lenso/ui";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { AgentCodingSetup } from "./agent-coding-setup";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});
function Harness() {
  const [busy, setBusy] = useState(false);
  return (
    <ThemeScope>
      <div style={{ position: "relative", zIndex: 4, minHeight: 800 }}>
        <AgentCodingSetup
          agentId="app"
          agentLabel="App Agent"
          busy={busy}
          configure={async (operation) => {
            setBusy(true);
            try {
              await operation();
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </ThemeScope>
  );
}
function render() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root?.render(<Harness />));
}

test("requires explicit Tool selection after import and environment validation", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("/api/")) {
        return originalFetch(String(input), init);
      }
      requests.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("control/profiles/import")) {
        return Response.json({
          revision: "2",
          profiles: ["plan", "code", "code-sandbox"],
        });
      }
      if (url.endsWith("control/plugins")) {
        return Response.json({ revision: "1" });
      }
      if (url.endsWith("/plugins")) {
        return Response.json({ streamId: "app-generation" });
      }
      if (url.endsWith("control/profile")) {
        return Response.json({ profile: "code" });
      }
      return Response.json({
        schema: "lenso.agent.tool-policy.v1",
        revision: 3,
        allowed: ["retained-tool"],
        available: [
          { name: "edit", description: "Edit workspace files." },
          { name: "retained-tool", description: "Existing authorized Tool." },
        ],
      });
    })
  );
  render();
  await page
    .getByRole("button", { name: "Set up coding", exact: true })
    .click();
  const check = page.getByRole("button", {
    name: "Activate Code and check environment",
  });
  await expect.element(check).toBeDisabled();
  await page
    .getByRole("button", { name: "Import coding Profiles", exact: true })
    .click();
  await expect.element(check).toBeEnabled();
  expect(requests.some(({ init }) => init?.method === "PUT")).toBe(false);
  await check.click();
  const edit = page.getByRole("checkbox", {
    name: "edit Edit workspace files.",
  });
  await expect.element(edit).not.toBeChecked();
  await edit.click();
  expect(requests.some(({ init }) => init?.method === "PUT")).toBe(false);
  await page.getByRole("button", { name: "Save Tool access" }).click();
  await expect
    .element(page.getByRole("button", { name: "Use Plan" }))
    .toBeVisible();
  const update = requests.find(({ init }) => init?.method === "PUT");
  expect(update).toMatchObject({
    url: "/api/console/v1/agents/app/control/tool-policy",
    init: {
      body: JSON.stringify({
        allowed: ["retained-tool", "edit"],
        expectedRevision: 3,
      }),
    },
  });
  expect(
    requests.every(({ url }) => url.startsWith("/api/console/v1/agents/app/"))
  ).toBe(true);
});

test("shows a failed Ready Gate without exposing an authorization step", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (!url.startsWith("/api/")) {
        return originalFetch(String(input));
      }
      if (url.endsWith("control/profiles/import")) {
        return Response.json({
          revision: "2",
          profiles: ["plan", "code", "code-sandbox"],
        });
      }
      if (url.endsWith("control/plugins")) {
        return Response.json({ revision: "1" });
      }
      if (url.endsWith("/plugins")) {
        return Response.json({ streamId: "app-generation" });
      }
      return Response.json(
        { error: "required program rg was not found" },
        { status: 409 }
      );
    })
  );
  render();
  await page
    .getByRole("button", { name: "Set up coding", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import coding Profiles", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Activate Code and check environment" })
    .click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Save Tool access" }))
    .not.toBeInTheDocument();
});
