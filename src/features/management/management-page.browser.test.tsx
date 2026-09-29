import { ThemeScope } from "@lenso/ui/theme-scope";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { ManagementPage } from "./management-page";

vi.mock("../../app/console-session", () => ({
  useConsoleSession: () => ({ managementEnabled: true }),
}));
vi.mock("../../app/console-locale", () => ({
  useConsoleLocale: () => ({ locale: "en" }),
}));
const requests: unknown[] = [];
let state = "pending_approval";
vi.mock("../../lib/session-fetch", () => ({
  sessionFetch: async (path: string, init?: RequestInit) => {
    if (path.endsWith("catalog")) {
      return Response.json({
        deployment: "alpha",
        revision: "1",
        entries: [
          {
            id: "update",
            version: "1.0.0",
            description: "Update reference value",
            effect: "write",
            requires_approval: true,
            target_instance: "example/alpha",
            capability: "example.ops@1",
            operation: "update",
            input_schema_json:
              '{"type":"object","additionalProperties":false,"properties":{"value":{"type":"integer"}},"required":["value"]}',
          },
        ],
      });
    }
    if (path.endsWith("invoke")) {
      requests.push(JSON.parse(String(init?.body)));
    }
    return Response.json({
      operation_id: "operation-1",
      state,
      audit_pending: state === "unknown",
      receipt: null,
      result_json: null,
    });
  },
}));
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  requests.length = 0;
  state = "pending_approval";
});

test("keeps approved parameters immutable and queries an unknown result without replaying", async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root?.render(
      <ThemeScope>
        <ManagementPage />
      </ThemeScope>
    )
  );
  await page.getByRole("button", { name: "Update reference value" }).click();
  await page.getByRole("spinbutton", { name: "value" }).fill("4");
  await page.getByRole("button", { name: "Submit operation" }).click();
  await expect
    .element(
      page.getByText(
        "Waiting for human approval. Refresh the status after the reviewer decides."
      )
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Parameters (JSON)" }))
    .toBeDisabled();
  const intent = requests[0] as { idempotency_key: string; input_json: string };
  expect(JSON.parse(intent.input_json)).toEqual({ value: 4 });
  await expect
    .element(page.getByRole("spinbutton", { name: "value" }))
    .toBeDisabled();
  expect(intent.idempotency_key).toBeTruthy();
  state = "unknown";
  await page.getByRole("button", { name: "Query status" }).click();
  await expect
    .element(
      page.getByText(
        "The result is unknown. Query the receipt before taking another action; this page will not replay the write."
      )
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Continue original operation" }))
    .toBeDisabled();
  expect(requests).toHaveLength(1);
  await expect
    .element(
      page.getByText(
        "Audit delivery pending; the operation will not be replayed."
      )
    )
    .toBeVisible();
});
