import { ThemeScope } from "@lenso/ui/theme-scope";

import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { HumanApprovalPanel } from "./human-approval-panel";
import { HumanTokenPanel } from "./human-token-panel";

vi.mock("../../app/console-session", () => ({
  useConsoleSession: () => ({ subject: "browser-fixture" }),
}));
vi.mock("../../app/console-locale", () => ({
  useConsoleLocale: () => ({ locale: "en" }),
}));
const requests: Array<{ path: string; body: unknown; subject: string | null }> =
  [];
let found = false;
let receiptWait: Promise<void> | undefined;
vi.mock("../../lib/session-fetch", () => ({
  sessionFetch: async (path: string, init?: RequestInit) => {
    requests.push({
      path,
      subject: new Headers(init?.headers).get("x-lenso-expected-subject"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (path.endsWith("decide") || path.endsWith("issue")) {
      return new Response(null, {
        status: path.endsWith("decide") ? 503 : 403,
      });
    }
    if (path.endsWith("receipt")) {
      await receiptWait;
      return Response.json(
        found
          ? {
              found: true,
              credential: {
                active: true,
                credential_id: "owner-committed",
                deployment: "alpha",
                expires_at: "2030-01-01T00:00:00Z",
                name: "read-token",
                permissions: ["ops.state.read"],
                resource_scopes: [{ kind: "ops-state", id: "primary-state" }],
              },
            }
          : { found: false }
      );
    }
    return Response.json({
      audit_pending: false,
      capability: "example.ops-state@2",
      deployment: "alpha",
      description: "Update state",
      entry_id: "ops.state.update",
      expires_at: "2030-01-01T00:00:00Z",
      intent_digest: "a".repeat(64),
      operation: "update",
      operation_id: "operation-1",
      parameters_json: '{"value":4}',
      requester: "other-human",
      status: "pending",
      target_instance: "example.ops-state/primary",
      version: "2.0.0",
    });
  },
}));
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const storageKey = "lenso-pat-receipt:v1:browser-fixture:alpha";
function mount(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root?.render(<ThemeScope>{element}</ThemeScope>));
}
function unmount() {
  flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
}
afterEach(() => {
  unmount();
  requests.length = 0;
  found = false;
  receiptWait = undefined;
  localStorage.removeItem(storageKey);
});

test("locks an uncertain human decision until a fresh owner intent is read", async () => {
  mount(<HumanApprovalPanel />);
  await page.getByRole("textbox", { name: "Operation ID" }).fill("operation-1");
  await page.getByRole("button", { name: "Load intent" }).click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Approve this exact request",
        exact: true,
      })
    )
    .toBeEnabled();
  await page
    .getByRole("button", { name: "Approve this exact request", exact: true })
    .click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Approve this exact request",
        exact: true,
      })
    )
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: "Reject request", exact: true }))
    .toBeDisabled();
  await page.getByRole("button", { name: "Load intent" }).click();
  await expect
    .element(
      page.getByRole("button", {
        name: "Approve this exact request",
        exact: true,
      })
    )
    .toBeEnabled();
  expect(
    requests.filter((request) => request.path.endsWith("decide"))
  ).toHaveLength(1);
  expect(
    requests.find((request) => request.path.endsWith("decide"))?.subject
  ).toBe("browser-fixture");
});

test("retains only the receipt reference after a submitted rejection and recovers across remount", async () => {
  mount(<HumanTokenPanel deployment="alpha" />);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("read-token");
  await page
    .getByRole("textbox", { name: "Expiry (RFC3339)" })
    .fill("2030-01-01T00:00:00Z");
  await page
    .getByRole("textbox", { name: "Permissions (comma separated)" })
    .fill("ops.state.read");
  await page
    .getByRole("textbox", { name: "Resource scopes (JSON)" })
    .fill('[{"kind":"ops-state","id":"primary-state"}]');
  await page.getByRole("button", { name: "Issue personal token" }).click();
  await expect
    .element(page.getByRole("button", { name: "Issue personal token" }))
    .toBeDisabled();
  expect(
    requests.find((request) => request.path.endsWith("issue"))?.subject
  ).toBe("browser-fixture");
  const retained = localStorage.getItem(storageKey);
  expect(retained).toBeTruthy();
  expect(retained).not.toContain("read-token");
  unmount();
  mount(<HumanTokenPanel deployment="alpha" />);
  await expect
    .element(page.getByRole("button", { name: "Issue personal token" }))
    .toBeDisabled();
  await page.getByRole("button", { name: "Query issuance receipt" }).click();
  await expect
    .element(page.getByRole("button", { name: "Prepare another token" }))
    .toBeDisabled();
  expect(localStorage.getItem(storageKey)).toBe(retained);
  found = true;
  await page.getByRole("button", { name: "Query issuance receipt" }).click();
  await expect
    .element(
      page.getByText(
        "The owner confirms issuance. The one-time secret cannot be recovered; revoke this credential if you did not receive it."
      )
    )
    .toBeVisible();
  expect(localStorage.getItem(storageKey)).toBeNull();
  await page.getByRole("button", { name: "Prepare another token" }).click();
  await expect
    .element(page.getByRole("button", { name: "Issue personal token" }))
    .toBeEnabled();
  expect(
    requests.filter((request) => request.path.endsWith("issue"))
  ).toHaveLength(1);
  expect(
    requests
      .filter((request) => request.path.endsWith("receipt"))
      .every(
        (request) =>
          (request.body as { idempotency_key: string }).idempotency_key ===
          retained
      )
  ).toBe(true);
  await expect
    .element(page.getByRole("textbox", { name: "One-time token" }))
    .not.toBeInTheDocument();
});

test("a late receipt and stale prepare action preserve another tab's pending reference", async () => {
  localStorage.setItem(storageKey, "old-request");
  found = true;
  let release: (() => void) | undefined;
  receiptWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  mount(<HumanTokenPanel deployment="alpha" />);
  await page.getByRole("button", { name: "Query issuance receipt" }).click();
  await expect
    .poll(() => requests.some((request) => request.path.endsWith("receipt")))
    .toBe(true);
  await navigator.locks.request(storageKey, () => {
    localStorage.setItem(storageKey, "new-request");
  });
  release?.();
  await expect
    .element(
      page.getByText(
        "Another request reference must be reconciled before preparing a token."
      )
    )
    .toBeVisible();
  expect(localStorage.getItem(storageKey)).toBe("new-request");
  await expect
    .element(page.getByRole("button", { name: "Issue personal token" }))
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: "Prepare another token" }))
    .toBeDisabled();
});
