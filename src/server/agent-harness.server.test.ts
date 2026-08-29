import { describe, expect, test, vi } from "vitest";

import { proxyAgentHarnessRequest } from "./agent-harness.server";

const environment = {
  LENSO_CONSOLE_AGENT_URL: "http://127.0.0.1:8788",
};

describe("Agent Harness proxy", () => {
  test("forwards Agent paths and queries to the loopback Harness", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({ sessions: [] })
    );
    const response = await proxyAgentHarnessRequest(
      new Request(
        "http://console.test/api/console/v1/agent/sessions?cursor=next"
      ),
      environment,
      { fetch: upstream }
    );

    expect(response.status).toBe(200);
    const [url] = upstream.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "http://127.0.0.1:8788/api/console/v1/agent/sessions?cursor=next"
    );
  });

  test("does not forward browser authorization", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({ accepted: true })
    );
    await proxyAgentHarnessRequest(
      new Request("http://console.test/api/console/v1/agent/turns", {
        body: JSON.stringify({ prompt: "hello" }),
        headers: {
          Authorization: "Bearer browser-secret",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
      environment,
      { fetch: upstream }
    );

    const [, init] = upstream.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.get("content-type")).toBe("application/json");
  });

  test.each([
    "/api/console/v1/agent/bootstrap",
    "/api/console/v1/agent/sessions",
    "/api/console/v1/agent/sessions/session-1",
    "/api/console/v1/agent/sessions/session-1/trajectory",
    "/api/console/v1/agent/turns/request-1/interactions",
  ])("allows the supported GET route %s", async (path) => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({}));
    const response = await proxyAgentHarnessRequest(
      new Request(`http://console.test${path}`),
      environment,
      { fetch: upstream }
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });

  test.each([
    "/api/console/v1/agent/turns",
    "/api/console/v1/agent/turns/request-1/cancel",
    "/api/console/v1/agent/turns/request-1/interactions/interaction-1/answer",
  ])("allows the supported POST route %s", async (path) => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({}));
    const response = await proxyAgentHarnessRequest(
      new Request(`http://console.test${path}`, { method: "POST" }),
      environment,
      { fetch: upstream }
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });

  test("rejects an unsupported Agent route before forwarding", async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await proxyAgentHarnessRequest(
      new Request("http://console.test/api/console/v1/agent/admin"),
      environment,
      { fetch: upstream }
    );

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  test("rejects a method not supported by a real Agent route", async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await proxyAgentHarnessRequest(
      new Request("http://console.test/api/console/v1/agent/sessions", {
        method: "POST",
      }),
      environment,
      { fetch: upstream }
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(upstream).not.toHaveBeenCalled();
  });

  test("fails closed for a non-loopback Harness origin", async () => {
    const response = await proxyAgentHarnessRequest(
      new Request("http://console.test/api/console/v1/agent/bootstrap"),
      { LENSO_CONSOLE_AGENT_URL: "https://agent.example.com" }
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      detail: "LENSO_CONSOLE_AGENT_URL must be a clean loopback HTTP origin",
    });
  });
});
