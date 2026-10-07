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
  it("isolates the operator endpoint, expected actor, CSRF and retired lifetime", async () => {
    const controller = new AbortController();
    const retire = vi.fn(() => controller.abort());
    const transport = {
      sourceId: "operations",
      apiBasePath: "/admin/api",
      subject: "operator-a",
      readScope: "operators-scope",
      csrf: {
        cookie_name: "__Host-operator-csrf",
        header_name: "x-csrf-token",
      },
      signal: controller.signal,
      retire,
    };
    vi.stubGlobal("window", {
      location: { origin: "https://console.test" },
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("document", {
      cookie: "__Host-account-csrf=account; __Host-operator-csrf=operator",
    });
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const services = createWorkspaceServices(
      { ...mount, transport },
      undefined,
      "account-a"
    );
    await services.invoke("welcome", "greet", {});
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe(
      "/admin/api/console/v1/pages/welcome/services/welcome/invoke/greet"
    );
    expect(new Headers(options.headers).get("x-lenso-expected-subject")).toBe(
      "operator-a"
    );
    expect(new Headers(options.headers).get("x-csrf-token")).toBe("operator");
    fetch.mockResolvedValue(Response.json({}, { status: 403 }));
    await expect(services.invoke("welcome", "greet", {})).rejects.toBeDefined();
    expect(retire).toHaveBeenCalledOnce();
    fetch.mockClear();
    await expect(services.invoke("welcome", "greet", {})).rejects.toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });
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

  it("rejects a late response from a retired mount even if fetch ignores cancellation", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValueOnce(Response.json({ instance: "beta" }));
    vi.stubGlobal("fetch", fetch);
    const alpha = new AbortController();
    const caller = new AbortController();
    const old = createWorkspaceServices(mount, alpha.signal);
    const pending = old.invoke(
      "welcome",
      "greet",
      {},
      { signal: caller.signal }
    );
    alpha.abort();
    await expect(
      createWorkspaceServices({
        ...mount,
        id: "beta",
        owner: { ...mount.owner, instance: "welcome/beta" },
      }).invoke("welcome", "greet", {})
    ).resolves.toEqual({ instance: "beta" });
    finish(Response.json({ instance: "alpha" }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(old.invoke("welcome", "greet", {})).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]).toEqual([
      "/api/console/v1/pages/beta/services/welcome/invoke/greet",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-lenso-page-owner": "welcome/beta",
        }),
        cache: "no-store",
      }),
    ]);
  });

  it("cancels an idle stream reader when the mount retires", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    const controller = new AbortController();
    const source = createWorkspaceServices(mount, controller.signal).subscribe(
      "welcome",
      "ticks",
      {}
    );
    const stream = source[Symbol.asyncIterator]();
    const pending = stream.next();
    await vi.waitFor(() => expect(body.locked).toBe(true));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  // Fetch may finish before cancellation while body decoding is still pending.
  // The transport-level late-response test cannot exercise this second boundary.
  it.each([
    ["invoke", 422, true],
    ["invoke", 409, false],
    ["subscribe", 409, false],
  ] as const)(
    "cancels a retired %s failure while decoding status %i (domain=%s)",
    async (kind, status, domain) => {
      let finish!: (body: unknown) => void;
      const response = new Response(null, {
        status,
        headers: domain ? { "x-lenso-workspace-outcome": "domain_error" } : {},
      });
      const decode = vi.spyOn(response, "json").mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      const controller = new AbortController();
      const services = createWorkspaceServices(mount, controller.signal);
      const stream = services.subscribe("welcome", "ticks", {});
      const pending =
        kind === "invoke"
          ? services.invoke("welcome", "greet", {})
          : stream[Symbol.asyncIterator]().next();
      const rejected = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
      controller.abort();
      finish({ code: "old_instance_failure" });
      await rejected;
    }
  );

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
