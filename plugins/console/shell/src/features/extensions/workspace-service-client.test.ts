import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { afterEach, describe, expect, it, vi } from "vitest";

import { consoleContract } from "../../../../../../packages/console-authoring/src/protocol";
import {
  configureSessionReadScope,
  retireSessionReads,
  sessionFetch,
} from "../../lib/session-fetch";
import type { PageMount } from "./page-contribution-catalog";
import { createWorkspaceServices } from "./workspace-service-client";

const mount: PageMount = {
  apiMajor: 1,
  protocol: "lenso-console-rpc/2",
  id: "welcome",
  implementationId: "a".repeat(64),
  module: `/api/console/v1/pages/welcome/assets/${"a".repeat(64)}/workspace.mjs`,
  navigation: { items: [], label: "Welcome" },
  owner: { instance: "welcome/default", source: "application", trusted: true },
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

function rpcFetch(
  handle: (input: {
    mountId: string;
    service: string;
    operation: string;
    input: unknown;
  }) => unknown = (input) => input.input,
  prefix: `/${string}` = "/api/console/v2/rpc"
) {
  const handler = new RPCHandler(
    {
      workspace: {
        invoke: implement(consoleContract.workspace.invoke).handler(
          ({ input }) => handle(input)
        ),
      },
    },
    { errorStatusMap: { WORKSPACE_SERVICE_DOMAIN_ERROR: 422 } }
  );
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(
      new URL(String(input), "https://console.test"),
      init
    );
    const result = await handler.handle(request, { prefix, context: {} });
    return result.matched
      ? result.response
      : new Response(null, { status: 404 });
  });
}

afterEach(() => {
  retireSessionReads();
  vi.unstubAllGlobals();
});

describe("Workspace service client", () => {
  it("isolates the operator endpoint, expected actor, CSRF and retired lifetime", async () => {
    const controller = new AbortController();
    const retire = vi.fn(() => controller.abort());
    const revalidate = vi.fn(async () => undefined);
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
      revalidate,
    };
    vi.stubGlobal("window", {
      location: { origin: "https://console.test" },
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("document", {
      cookie: "__Host-account-csrf=account; __Host-operator-csrf=operator",
    });
    const fetch = rpcFetch(() => ({ ok: true }), "/admin/api/console/v2/rpc");
    vi.stubGlobal("fetch", fetch);
    const services = createWorkspaceServices(
      { ...mount, transport },
      undefined,
      "account-a"
    );
    await expect(services.invoke("welcome", "greet", {})).resolves.toEqual({
      ok: true,
    });
    const [url, options] = fetch.mock.calls[0]!;
    expect(new URL(String(url), "https://console.test").pathname).toBe(
      "/admin/api/console/v2/rpc/workspace/invoke"
    );
    expect(new Headers(options?.headers).get("x-lenso-expected-subject")).toBe(
      "operator-a"
    );
    expect(new Headers(options?.headers).get("x-csrf-token")).toBe("operator");
    fetch.mockResolvedValue(Response.json({}, { status: 403 }));
    await expect(services.invoke("welcome", "greet", {})).rejects.toBeDefined();
    expect(retire).not.toHaveBeenCalled();
    expect(revalidate).toHaveBeenCalledOnce();
    fetch.mockResolvedValue(Response.json({}, { status: 401 }));
    await expect(services.invoke("welcome", "greet", {})).rejects.toBeDefined();
    expect(retire).toHaveBeenCalledOnce();
    fetch.mockClear();
    await expect(services.invoke("welcome", "greet", {})).rejects.toMatchObject(
      { name: "AbortError" }
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("invokes only an operation admitted by its mount over the real RPC protocol", async () => {
    const input = { name: "你好 🌍" };
    const dispatch = vi.fn((value) => value.input);
    const fetch = rpcFetch(dispatch);
    vi.stubGlobal("fetch", fetch);
    const services = createWorkspaceServices(mount, undefined, "actor-a");
    await expect(services.invoke("welcome", "greet", input)).resolves.toEqual(
      input
    );
    expect(dispatch).toHaveBeenCalledWith({
      mountId: "welcome",
      service: "welcome",
      operation: "greet",
      input,
    });
    const [, options] = fetch.mock.calls[0]!;
    const headers = new Headers(options?.headers);
    expect(headers.get("x-lenso-page-owner")).toBe(mount.owner.instance);
    expect(headers.get("x-lenso-page-revision")).toBe(mount.revision);
    expect(headers.get("x-lenso-page-implementation")).toBe(
      mount.implementationId
    );
    expect(headers.get("x-lenso-expected-subject")).toBe("actor-a");
    await expect(
      services.invoke("welcome", "delete", {})
    ).rejects.toMatchObject({
      code: "workspace_service_unavailable",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects oversized UTF-8 JSON before HTTP dispatch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      createWorkspaceServices(mount).invoke("welcome", "greet", {
        text: "你".repeat(350_000),
      })
    ).rejects.toMatchObject({
      code: "workspace_service_request_too_large",
      status: 413,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explicitly rejects streams without dispatching or pretending success", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const stream = createWorkspaceServices(mount).subscribe(
      "welcome",
      "ticks",
      {}
    );
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({
      code: "workspace_service_unavailable",
      status: 503,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes caller cancellation to an outstanding request", async () => {
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
    const pending = createWorkspaceServices(mount).invoke(
      "welcome",
      "greet",
      {},
      { signal: controller.signal }
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("discards a late response after a mount switch even when fetch ignores cancellation", async () => {
    let finish!: () => void;
    const realFetch = rpcFetch((input) => ({ instance: input.mountId }));
    const fetch = rpcFetch((input) => ({ instance: input.mountId }));
    fetch.mockImplementationOnce(async (url, init) => {
      const response = await realFetch(url, init);
      return new Promise((resolve) => {
        finish = () => resolve(response);
      });
    });
    vi.stubGlobal("fetch", fetch);
    const lifetime = new AbortController();
    const caller = new AbortController();
    const old = createWorkspaceServices(mount, lifetime.signal);
    const pending = old.invoke(
      "welcome",
      "greet",
      {},
      { signal: caller.signal }
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    lifetime.abort();
    await expect(
      createWorkspaceServices({
        ...mount,
        id: "beta",
        owner: { ...mount.owner, instance: "welcome/beta" },
      }).invoke("welcome", "greet", {})
    ).resolves.toEqual({ instance: "beta" });
    finish();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(old.invoke("welcome", "greet", {})).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetch.mock.calls[1]?.[1]?.headers).get("x-lenso-page-owner")
    ).toBe("welcome/beta");
  });

  // The response can arrive before retirement while decoding remains pending.
  it.each(["CONFLICT", "WORKSPACE_SERVICE_DOMAIN_ERROR"] as const)(
    "discards a retired %s failure during body decoding",
    async (code) => {
      const realFetch = rpcFetch(() => {
        throw new ORPCError(code, {
          data:
            code === "CONFLICT" ? undefined : { payload: { error: "denied" } },
        });
      });
      let finish!: () => void;
      let pendingResponse: Response | undefined;
      const fetch = vi.fn(
        async (url: RequestInfo | URL, init?: RequestInit) => {
          const response = await realFetch(url, init);
          const bytes = new Uint8Array(await response.arrayBuffer());
          pendingResponse = new Response(
            new ReadableStream({
              start(controller) {
                finish = () => {
                  controller.enqueue(bytes);
                  controller.close();
                };
              },
            }),
            { status: response.status, headers: response.headers }
          );
          return pendingResponse;
        }
      );
      vi.stubGlobal("fetch", fetch);
      const controller = new AbortController();
      const pending = createWorkspaceServices(mount, controller.signal).invoke(
        "welcome",
        "greet",
        {}
      );
      await vi.waitFor(() => expect(pendingResponse?.bodyUsed).toBe(true));
      controller.abort();
      finish();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    }
  );

  it("rejects malformed service responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          headers: { "content-type": "application/json" },
        })
      )
    );
    await expect(
      createWorkspaceServices(mount).invoke("welcome", "greet", {})
    ).rejects.toMatchObject({
      code: "workspace_service_protocol_error",
      status: 502,
    });
  });

  // HTTP 200 precedes the terminal error, so sessionFetch's response status
  // alone cannot retire a revoked stream scope or revalidate object access.
  it.each([
    ["ordinary", "UNAUTHORIZED", 401],
    ["ordinary", "PRECONDITION_FAILED", 412],
    ["ordinary", "FORBIDDEN", 403],
    ["external", "UNAUTHORIZED", 401],
    ["external", "PRECONDITION_FAILED", 412],
    ["external", "FORBIDDEN", 403],
  ] as const)(
    "handles late %s %s without universal logout",
    async (kind, code, status) => {
      const controller = new AbortController();
      const retire = vi.fn(() => controller.abort());
      const revalidate = vi.fn(async () => undefined);
      const dispatchEvent = vi.fn();
      vi.stubGlobal("window", {
        location: { origin: "https://console.test" },
        dispatchEvent,
      });
      vi.stubGlobal("document", { cookie: "" });
      configureSessionReadScope("local", revalidate);
      const prefix = kind === "external" ? "/admin/api" : "/api";
      const handler = new RPCHandler({
        workspace: {
          subscribe: implement(consoleContract.workspace.subscribe).handler(
            async function* lateErrorStream() {
              yield { text: "你好 🌍" };
              throw new ORPCError(code, { message: "private diagnostic" });
            }
          ),
        },
      });
      const fetch = vi.fn(
        async (url: RequestInfo | URL, init?: RequestInit) => {
          const result = await handler.handle(
            new Request(new URL(String(url), "https://console.test"), init),
            { prefix: `${prefix}/console/v2/rpc`, context: {} }
          );
          return result.matched
            ? result.response
            : new Response(null, { status: 404 });
        }
      );
      vi.stubGlobal("fetch", fetch);
      const streamingMount: PageMount = {
        ...mount,
        requirements: mount.requirements.map((requirement) => ({
          ...requirement,
          streaming_operations: ["ticks"],
        })),
        ...(kind === "external"
          ? {
              transport: {
                sourceId: "operations",
                apiBasePath: prefix,
                subject: "operator-a",
                readScope: "local",
                csrf: {
                  cookie_name: "__Host-operator-csrf",
                  header_name: "x-csrf-token",
                },
                signal: controller.signal,
                retire,
                revalidate,
              },
            }
          : {}),
      };
      const stream = createWorkspaceServices(streamingMount).subscribe(
        "welcome",
        "ticks",
        {}
      );
      const iterator = stream[Symbol.asyncIterator]();
      expect(await iterator.next()).toEqual({
        done: false,
        value: { text: "你好 🌍" },
      });
      await expect(iterator.next()).rejects.toMatchObject({
        code,
        status,
        message: `Workspace service welcome/ticks: ${code}`,
      });
      if (status === 403) {
        expect(revalidate).toHaveBeenCalledOnce();
        expect(retire).not.toHaveBeenCalled();
        expect(dispatchEvent).not.toHaveBeenCalled();
      } else if (kind === "external") {
        expect(retire).toHaveBeenCalledOnce();
        expect(dispatchEvent).not.toHaveBeenCalled();
      } else {
        expect(dispatchEvent).toHaveBeenCalledOnce();
        expect(dispatchEvent.mock.calls[0]![0].type).toBe(
          "lenso-session-expired"
        );
      }
    }
  );

  // SDK cannot cancel a body that sessionFetch rejects before handing it over.
  it.each(["cancelled", "scope"] as const)(
    "cancels an unclaimed SSE opening response on %s retirement",
    async (mode) => {
      const dispatchEvent = vi.fn();
      vi.stubGlobal("window", {
        location: { origin: "https://console.test" },
        dispatchEvent,
      });
      configureSessionReadScope("a".repeat(64), async () => undefined);
      let resolveResponse!: (response: Response) => void;
      vi.stubGlobal(
        "fetch",
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          })
      );
      const cancel = vi.fn();
      const response = new Response(new ReadableStream({ cancel }), {
        headers: {
          "content-type": "text/event-stream",
          "x-lenso-read-scope":
            mode === "scope" ? "b".repeat(64) : "a".repeat(64),
        },
      });
      const controller = new AbortController();
      const pending = sessionFetch("/api/console/v2/rpc/workspace/subscribe", {
        signal: controller.signal,
      });
      const rejected = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      if (mode === "cancelled") {
        controller.abort();
      }
      resolveResponse(response);
      await rejected;
      expect(cancel).toHaveBeenCalledOnce();
      expect(dispatchEvent).toHaveBeenCalledTimes(mode === "scope" ? 1 : 0);
    }
  );

  it("does not let an ordinary stream from a retired request epoch expire the newly admitted account", async () => {
    const dispatchEvent = vi.fn();
    const revalidate = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      location: { origin: "https://console.test" },
      dispatchEvent,
    });
    vi.stubGlobal("document", { cookie: "" });
    configureSessionReadScope("local", revalidate);
    let finish!: () => void;
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const handler = new RPCHandler({
      workspace: {
        subscribe: implement(consoleContract.workspace.subscribe).handler(
          async function* retiredStream() {
            yield "old-account";
            await wait;
            throw new ORPCError("UNAUTHORIZED");
          }
        ),
      },
    });
    vi.stubGlobal(
      "fetch",
      async (url: RequestInfo | URL, init?: RequestInit) => {
        // This fixture intentionally ignores request cancellation so a late frame
        // arrives after the account's lifetime has been replaced.
        const result = await handler.handle(
          new Request(new URL(String(url), "https://console.test"), {
            ...init,
            signal: null,
          }),
          { prefix: "/api/console/v2/rpc", context: {} }
        );
        return result.matched
          ? result.response
          : new Response(null, { status: 404 });
      }
    );
    const services = createWorkspaceServices({
      ...mount,
      requirements: mount.requirements.map((requirement) => ({
        ...requirement,
        streaming_operations: ["ticks"],
      })),
    });
    const stream = services.subscribe("welcome", "ticks", {});
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    retireSessionReads();
    configureSessionReadScope("local", revalidate);
    finish();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
});
