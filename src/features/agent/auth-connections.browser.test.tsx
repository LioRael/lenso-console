import "@lenso/tokens/styles.css";
import "@lenso/ui/styles.css";
import { ThemeScope } from "@lenso/ui/theme-scope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import { AuthConnections } from "./auth-connections";

vi.mock("./agent-runtime", () => ({
  agentApiUrl: (_id: string, path: string) => `/test/${path}`,
}));

test("business consent opens loopback App and polls without receiving credentials", async () => {
  let connected = false;
  const calls: unknown[] = [];
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, options) => {
      if (!options?.body) {
        return Response.json({
          generation: "generation",
          connections: [
            {
              provider: "business",
              status: {
                label: "Projects",
                connected,
                methods: ["browser_consent"],
              },
            },
          ],
        });
      }
      const body = JSON.parse(String(options.body));
      calls.push(body);
      if (body.action.kind === "begin") {
        return Response.json({
          attempt_id: "opaque-attempt",
          authorization_url:
            "http://127.0.0.1:55440/auth/agent/authorize?attempt=public",
          user_code: "",
          expires_at_millis: String(Date.now() + 60_000),
        });
      }
      if (body.action.kind === "poll") {
        connected = true;
        return Response.json({ state: "connected" });
      }
      if (body.action.kind === "disconnect") {
        connected = false;
      }
      return Response.json({ disconnected: true });
    });
  const replace = vi.fn();
  const close = vi.fn();
  const open = vi.spyOn(window, "open").mockReturnValue({
    opener: null,
    location: { replace },
    close,
  } as unknown as Window);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  try {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={query}>
          <ThemeScope>
            <AuthConnections agentId="agent" />
          </ThemeScope>
        </QueryClientProvider>
      )
    );
    await page
      .getByRole("button", { name: "Sign in with browser", exact: true })
      .click();
    await expect.poll(() => replace.mock.calls.length).toBe(1);
    expect(replace).toHaveBeenCalledWith(
      "http://127.0.0.1:55440/auth/agent/authorize?attempt=public"
    );
    await expect
      .element(
        page.getByText(
          "Connected for this Agent run. Restarting requires a new connection."
        )
      )
      .toBeVisible();
    await page
      .getByRole("button", { name: "Disconnect…", exact: true })
      .click();
    await expect
      .element(
        page.getByText(
          "Disconnect this App for new turns? Existing turns keep their identity. Revoke access in the App to stop them."
        )
      )
      .toBeVisible();
    await page
      .getByRole("button", { name: "Disconnect account", exact: true })
      .click();
    await expect
      .element(
        page.getByRole("button", { name: "Sign in with browser", exact: true })
      )
      .toBeVisible();
    expect(JSON.stringify(calls)).not.toContain("credential");
    expect(close).not.toHaveBeenCalled();
  } finally {
    flushSync(() => root.unmount());
    query.clear();
    container.remove();
    fetchMock.mockRestore();
    open.mockRestore();
  }
});

test("expired business account shows identity and reconnects through the existing handoff", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, options) => {
      if (!options?.body) {
        return Response.json({
          generation: "generation",
          connections: [
            {
              provider: "business",
              status: {
                label: "Projects",
                connected: false,
                methods: ["browser_consent"],
                account: {
                  origin: "https://projects.example",
                  subject: "alice",
                  expires_at_millis: String(Date.now() - 1000),
                  reconnect_required: true,
                },
              },
            },
          ],
        });
      }
      return Response.json({
        attempt_id: "renewal",
        authorization_url:
          "https://projects.example/auth/agent/authorize?attempt=renewal",
        user_code: "",
        expires_at_millis: String(Date.now() + 60000),
      });
    });
  const replace = vi.fn();
  const open = vi.spyOn(window, "open").mockReturnValue({
    opener: null,
    location: { replace },
    close: vi.fn(),
  } as unknown as Window);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  try {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={query}>
          <ThemeScope>
            <AuthConnections agentId="agent" />
          </ThemeScope>
        </QueryClientProvider>
      )
    );
    await expect.element(page.getByText("Account ID: alice")).toBeVisible();
    await expect
      .element(page.getByText("https://projects.example", { exact: true }))
      .toBeVisible();
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect.poll(() => replace.mock.calls.length).toBe(1);
  } finally {
    flushSync(() => root.unmount());
    query.clear();
    container.remove();
    fetchMock.mockRestore();
    open.mockRestore();
  }
});
