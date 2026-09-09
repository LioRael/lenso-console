import { afterEach, describe, expect, it, vi } from "vitest";

import type { PageMount } from "./page-contribution-catalog";
import { createWorkspaceServices } from "./workspace-service-client";

const mount: PageMount = {
  apiMajor: 1,
  id: "welcome",
  module:
    "/api/console/v1/pages/welcome/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workspace.mjs",
  navigation: { items: [], label: "Welcome" },
  owner: {
    instance: "welcome/default",
    source: "resolved-plan",
    trusted: true,
  },
  requirements: [
    {
      available: true,
      capability_id: "lenso.console.welcome@1",
      descriptor_version: "1.0.0",
      operations: ["greet", "ticks"],
      required: true,
      service_id: "welcome",
      source: "owner",
    },
  ],
  revision: "1",
  styles: [],
  subject: { kind: "console" },
  title: "Welcome",
};

afterEach(() => vi.unstubAllGlobals());

describe("Workspace service client", () => {
  it("invokes only a service declared by its mount", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        { message: "Hello" },
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      )
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      createWorkspaceServices(mount).invoke("welcome", "greet", {
        name: "Console",
      })
    ).resolves.toEqual({ message: "Hello" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/console/v1/pages/welcome/services/welcome/invoke/greet",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects undeclared operations before HTTP dispatch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      createWorkspaceServices(mount).invoke("welcome", "delete", {})
    ).rejects.toMatchObject({
      code: "workspace_service_unavailable",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("decodes bounded SSE items and terminal success", async () => {
    const payload = btoa(JSON.stringify({ tick: 0 }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: item\ndata: {"sequence":"0","outcome":"item","bodyBase64Url":"${payload}"}\n\nevent: terminal\ndata: {"outcome":"success"}\n\n`
          )
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        })
      )
    );
    const items: unknown[] = [];
    for await (const item of createWorkspaceServices(mount).subscribe(
      "welcome",
      "ticks",
      { count: 1 }
    )) {
      items.push(item);
    }
    expect(items).toEqual([{ tick: 0 }]);
  });

  it("passes mount cancellation to an outstanding request", async () => {
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const invocation = createWorkspaceServices(mount).invoke(
      "welcome",
      "greet",
      {},
      { signal: controller.signal }
    );
    controller.abort();
    await expect(invocation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects malformed service responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          headers: { "content-type": "application/json" },
          status: 200,
        })
      )
    );
    await expect(
      createWorkspaceServices(mount).invoke("welcome", "greet", {})
    ).rejects.toMatchObject({ code: "workspace_service_protocol_error" });
  });
});
