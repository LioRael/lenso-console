import { describe, expect, test, vi } from "vitest";

import { proxyAgentControlRequest } from "./agent-control.server";

const environment = {
  LENSO_CONSOLE_AGENT_CONTROL_TOKEN: "server-secret",
  LENSO_CONSOLE_AGENT_URL: "http://127.0.0.1:8788",
};

describe("Agent Control proxy", () => {
  test("forwards policy reads with the server-only Harness credential", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({ revision: 3 })
    );
    const response = await proxyAgentControlRequest(
      new Request(
        "http://console.test/api/console/v1/agent/control/tool-policy"
      ),
      environment,
      { fetch: upstream }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 3 });
    const [url, init] = upstream.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "http://127.0.0.1:8788/api/console/v1/agent/control/tool-policy"
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer server-secret"
    );
  });

  test("forwards policy updates without the browser credential", async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({ revision: 4 })
    );
    await proxyAgentControlRequest(
      new Request(
        "http://console.test/api/console/v1/agent/control/tool-policy",
        {
          body: JSON.stringify({ allowed: ["read_file"], expectedRevision: 3 }),
          headers: { Authorization: "Bearer browser-token" },
          method: "PUT",
        }
      ),
      environment,
      { fetch: upstream }
    );

    const [, init] = upstream.mock.calls[0] ?? [];
    expect(init?.body).toBe(
      JSON.stringify({ allowed: ["read_file"], expectedRevision: 3 })
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer server-secret"
    );
  });

  test("rejects non-loopback control origins", async () => {
    const response = await proxyAgentControlRequest(
      new Request(
        "http://console.test/api/console/v1/agent/control/tool-policy"
      ),
      { ...environment, LENSO_CONSOLE_AGENT_URL: "https://example.com" }
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      detail: "LENSO_CONSOLE_AGENT_URL must be a clean loopback HTTP origin",
    });
  });
});
