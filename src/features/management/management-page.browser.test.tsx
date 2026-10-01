import { ThemeScope } from "@lenso/ui";

import "@lenso/tokens/styles.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { ManagementPage } from "./management-page";

vi.mock("../../app/console-session", () => ({
  useConsoleSession: () => ({
    managementEnabled: true,
    subject: "browser-fixture",
  }),
}));
vi.mock("../../app/console-locale", () => ({
  useConsoleLocale: () => ({ locale: "en" }),
}));
const requests: unknown[] = [];
let state = "pending_approval";
let loseInvokeResponse = false;
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
      if (loseInvokeResponse) {
        throw new TypeError("Failed to fetch");
      }
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
  loseInvokeResponse = false;
});

function mount() {
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
}

test("keeps approved parameters immutable and queries an unknown result without replaying", async () => {
  mount();
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

test("locks a lost continuation reply until the retained operation is queried", async () => {
  mount();
  await page.getByRole("button", { name: "Update reference value" }).click();
  await page.getByRole("spinbutton", { name: "value" }).fill("61");
  await page.getByRole("button", { name: "Submit operation" }).click();
  await expect
    .element(page.getByText("Operation ID: operation-1"))
    .toBeVisible();
  const original = requests[0] as { idempotency_key: string };
  state = "ready";
  await page.getByRole("button", { name: "Query status" }).click();
  const continueButton = page.getByRole("button", {
    name: "Continue original operation",
  });
  await expect.element(continueButton).toBeEnabled();
  loseInvokeResponse = true;
  await continueButton.click();
  await expect
    .element(
      page.getByText(
        "The result is unknown. Query the receipt before taking another action; this page will not replay the write."
      )
    )
    .toBeVisible();
  await expect.element(continueButton).toBeDisabled();
  await expect
    .element(page.getByText("Operation ID: operation-1"))
    .toBeVisible();
  await expect
    .element(page.getByText(`Request ID: ${original.idempotency_key}`))
    .toBeVisible();
  expect(requests).toEqual([original, original]);
  state = "succeeded";
  await page.getByRole("button", { name: "Query status" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Completed", exact: true }))
    .toBeVisible();
  expect(requests).toEqual([original, original]);
});

test("retains the request key and blocks replay when the first reply has no operation ID", async () => {
  mount();
  await page.getByRole("button", { name: "Update reference value" }).click();
  loseInvokeResponse = true;
  await page.getByRole("button", { name: "Submit operation" }).click();
  const original = requests[0] as { idempotency_key: string };
  expect(original.idempotency_key).toBeTruthy();
  await expect
    .element(page.getByText(`Request ID: ${original.idempotency_key}`))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Continue original operation" }))
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: "Query status" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "New operation" }))
    .not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
});
