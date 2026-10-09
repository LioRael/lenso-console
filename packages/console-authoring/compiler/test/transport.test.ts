import { describe, expect, it } from "bun:test";

import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import {
  configureSessionReadScope,
  createSessionWorkspaceServices,
  retireSessionReads,
} from "../../src/browser-session-fetch";
import {
  consoleContract,
  consoleOperationDescriptorSchema,
  consoleSessionSchema,
} from "../../src/protocol";
import {
  createConsoleClient,
  createConsoleWorkspaceServices,
  WorkspaceServiceDomainError,
  WorkspaceServiceError,
} from "../../src/transport";

const mount = {
  id: "notes",
  owner: { instance: "notes/primary" },
  revision: "revision-1",
  implementationId: "a".repeat(64),
  requirements: [
    {
      available: true,
      service_id: "notes",
      operations: ["echo", "safeError", "domainError"],
    },
  ],
};

const streamingMount = {
  ...mount,
  requirements: [
    {
      ...mount.requirements[0]!,
      operations: ["echo", "ticks"],
      streaming_operations: ["ticks"],
    },
  ],
};

describe("Console SDK Fetch transport", () => {
  // Type-only oRPC outputs previously admitted partial catalog DTOs at runtime.
  // The successful transport fixture cannot detect weakened required fields.
  it("rejects incomplete operation and authenticated session projections", () => {
    expect(
      consoleOperationDescriptorSchema.safeParse({
        key: "notes:read",
        targetId: "self",
        pluginId: "notes",
        method: "read",
        description: "Read notes",
        effect: "read",
        schemaAvailability: "runtime-validation-only",
      }).success
    ).toBe(false);
    expect(
      consoleSessionSchema.safeParse({
        mode: "required",
        authenticated: true,
        subject: "actor-a",
        administrator: false,
        workspace_ids: [],
      }).success
    ).toBe(false);
  });

  // Mocked JSON cannot prove compatibility with the actual RPC framing.
  it("round trips Unicode JSON without base64 and preserves explicit public errors", async () => {
    const implementation = implement(consoleContract).$context<{
      headers: Headers;
    }>();
    const headers: Headers[] = [];
    const handler = new RPCHandler(
      implementation.router({
        catalog: implementation.catalog.handler(() => ({
          schemaVersion: 1,
          revision: "fixture",
          operations: [],
        })),
        invoke: implementation.invoke.handler(({ input }) => input.input),
        plugins: implementation.plugins.handler(() => ({
          schemaVersion: 1,
          plugins: [],
        })),
        targets: implementation.targets.handler(() => ({
          schemaVersion: 1,
          targets: [{ id: "世界", label: "世界 🌍" }],
        })),
        workspace: {
          subscribe: implementation.workspace.subscribe.handler(
            async function* fixtureStream() {
              yield "世界";
            }
          ),
          invoke: implementation.workspace.invoke.handler(
            ({ input, context }) => {
              headers.push(context.headers);
              if (input.operation === "safeError") {
                throw new ORPCError("WORKSPACE_SERVICE_ERROR", {
                  message: "Public conflict",
                  data: { code: "notes_conflict", status: 409 },
                });
              }
              if (input.operation === "domainError") {
                throw new ORPCError("WORKSPACE_SERVICE_DOMAIN_ERROR", {
                  data: { payload: { error: "denied", reason: "权限不足" } },
                });
              }
              return input.input;
            }
          ),
        },
      }),
      {
        errorStatusMap: {
          WORKSPACE_SERVICE_ERROR: 409,
          WORKSPACE_SERVICE_DOMAIN_ERROR: 422,
        },
      }
    );
    const bodies: string[] = [];
    const fetch = async (url: string, init: RequestInit) => {
      const request = new Request(url, init);
      bodies.push(await request.clone().text());
      const result = await handler.handle(request, {
        prefix: "/api/console/v2/rpc",
        context: { headers: request.headers },
      });
      return result.matched
        ? result.response
        : new Response(null, { status: 404 });
    };
    const options = { origin: "https://console.test", fetch };
    await expect(createConsoleClient(options).targets()).resolves.toEqual({
      schemaVersion: 1,
      targets: [{ id: "世界", label: "世界 🌍" }],
    });
    const services = createConsoleWorkspaceServices({
      ...options,
      mount,
      expectedSubject: "actor-a",
      headers: () => ({
        "x-custom": "custom",
        "x-lenso-page-owner": "cannot-override",
      }),
    });
    const input = { text: "你好 🌍", nested: { value: ["é", "日本語"] } };
    await expect(services.invoke("notes", "echo", input)).resolves.toEqual(
      input
    );
    expect(bodies[1]).toContain("你好 🌍");
    expect(bodies[1]).not.toContain("bodyBase64");
    expect(headers[0]?.get("x-lenso-page-owner")).toBe(mount.owner.instance);
    expect(headers[0]?.get("x-lenso-page-revision")).toBe(mount.revision);
    expect(headers[0]?.get("x-lenso-page-implementation")).toBe(
      mount.implementationId
    );
    expect(headers[0]?.get("x-lenso-expected-subject")).toBe("actor-a");
    expect(headers[0]?.get("x-custom")).toBe("custom");
    const safeError = await services
      .invoke("notes", "safeError", {})
      .catch((error) => error);
    expect(safeError).toBeInstanceOf(WorkspaceServiceError);
    expect(safeError).toMatchObject({ code: "notes_conflict", status: 409 });
    const domainError = await services
      .invoke("notes", "domainError", {})
      .catch((error) => error);
    expect(domainError).toBeInstanceOf(WorkspaceServiceDomainError);
    expect(domainError).toMatchObject({
      status: 422,
      payload: { error: "denied", reason: "权限不足" },
    });
    expect(bodies).toHaveLength(4);
  });

  // The old 501 stub never decoded frames or exercised an iterator's lifetime.
  it("streams Unicode, terminal errors and completion at a custom prefix without wrong-mode dispatch", async () => {
    const prefix = "/admin/api/console/v2/rpc";
    let dispatches = 0;
    const handler = new RPCHandler({
      workspace: {
        subscribe: implement(consoleContract.workspace.subscribe).handler(
          async function* unicodeStream({ input }) {
            dispatches += 1;
            yield { text: "你好 🌍" };
            if (input.input === "error") {
              throw new ORPCError("WORKSPACE_SERVICE_ERROR", {
                message: "private upstream diagnostic",
                data: { code: "safe_conflict", status: 409 },
              });
            }
          }
        ),
      },
    });
    const services = createConsoleWorkspaceServices({
      origin: "https://console.test",
      url: prefix,
      mount: streamingMount,
      fetch: async (url, init) => {
        const result = await handler.handle(new Request(url, init), {
          prefix,
          context: {},
        });
        return result.matched
          ? result.response
          : new Response(null, { status: 404 });
      },
    });
    const stream = services.subscribe("notes", "ticks", {});
    const iterator = stream[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { text: "你好 🌍" },
    });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    const failingStream = services.subscribe("notes", "ticks", "error");
    const failed = failingStream[Symbol.asyncIterator]();
    await failed.next();
    await expect(failed.next()).rejects.toMatchObject({
      code: "safe_conflict",
      status: 409,
      message: "Workspace service notes/ticks: safe_conflict",
    });
    await expect(services.invoke("notes", "ticks", {})).rejects.toMatchObject({
      code: "workspace_service_unavailable",
    });
    await expect(
      services.subscribe("notes", "echo", {})[Symbol.asyncIterator]().next()
    ).rejects.toMatchObject({ code: "workspace_service_unavailable" });
    expect(dispatches).toBe(2);
  });

  // Header-only session tests do not see a stream's later in-band revocation.
  it("retires session reads on terminal stream revocation but not from an aborted old mount", async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window"
    );
    const originalFetch = globalThis.fetch;
    const browser = Object.assign(new EventTarget(), {
      location: { origin: "https://console.test" },
    });
    let expired = 0;
    browser.addEventListener("lenso-session-expired", () => {
      expired += 1;
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: browser,
    });
    const prefix = "/api/console/v2/rpc";
    const handler = new RPCHandler({
      workspace: {
        subscribe: implement(consoleContract.workspace.subscribe).handler(
          async function* revokedStream() {
            yield { value: 1 };
            throw new ORPCError("UNAUTHORIZED");
          }
        ),
      },
    });
    globalThis.fetch = async (input, init) => {
      const result = await handler.handle(new Request(input, init), {
        prefix,
        context: {},
      });
      return result.matched
        ? result.response
        : new Response(null, { status: 404 });
    };
    const lifetime = new AbortController();
    try {
      configureSessionReadScope("a".repeat(64), async () => {});
      const services = createSessionWorkspaceServices({
        origin: browser.location.origin,
        url: prefix,
        signal: lifetime.signal,
        mount: streamingMount,
      });
      const currentStream = services.subscribe("notes", "ticks", {});
      const current = currentStream[Symbol.asyncIterator]();
      await current.next();
      await expect(current.next()).rejects.toMatchObject({ status: 401 });
      expect(expired).toBe(1);

      configureSessionReadScope("b".repeat(64), async () => {});
      const oldStream = services.subscribe("notes", "ticks", {});
      const old = oldStream[Symbol.asyncIterator]();
      await old.next();
      lifetime.abort();
      configureSessionReadScope("c".repeat(64), async () => {});
      await expect(old.next()).rejects.toBeInstanceOf(DOMException);
      expect(expired).toBe(1);
    } finally {
      lifetime.abort();
      retireSessionReads();
      globalThis.fetch = originalFetch;
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("cancels the response body exactly once on break and stalled next cancellation", async () => {
    for (const mode of ["stalled-return", "caller", "mount", "break"]) {
      const stalled = mode !== "break";
      const caller = new AbortController();
      const lifetime = new AbortController();
      let cancels = 0;
      let requestSignal: AbortSignal | null | undefined;
      let dispatched!: () => void;
      const ready = new Promise<void>((resolve) => {
        dispatched = resolve;
      });
      const handler = new RPCHandler({
        workspace: {
          subscribe: implement(consoleContract.workspace.subscribe).handler(
            async function* cancellationStream() {
              yield "é 🌍";
            }
          ),
        },
      });
      const framed = await handler.handle(
        new Request(
          "https://console.test/api/console/v2/rpc/workspace/subscribe",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              json: {
                mountId: "notes",
                service: "notes",
                operation: "ticks",
                input: {},
              },
            }),
          }
        ),
        { prefix: "/api/console/v2/rpc", context: {} }
      );
      if (!framed.matched) {
        throw new Error("Fixture did not match");
      }
      const bytes = new Uint8Array(await framed.response.arrayBuffer());
      const services = createConsoleWorkspaceServices({
        origin: "https://console.test",
        signal: lifetime.signal,
        mount: streamingMount,
        fetch: async (_url, init) => {
          requestSignal = init.signal;
          return new Response(
            new ReadableStream(
              {
                start(controller) {
                  if (!stalled) {
                    controller.enqueue(bytes);
                  }
                },
                pull() {
                  dispatched();
                },
                cancel() {
                  cancels += 1;
                },
              },
              { highWaterMark: 0 }
            ),
            { headers: framed.response.headers }
          );
        },
      });
      const stream = services.subscribe(
        "notes",
        "ticks",
        {},
        { signal: caller.signal }
      );
      if (mode === "break") {
        for await (const item of stream) {
          expect(item).toBe("é 🌍");
          break;
        }
        expect(requestSignal?.aborted).toBe(true);
        expect(cancels).toBe(1);
        continue;
      }
      const iterator = stream[Symbol.asyncIterator]();
      const pending = iterator.next();
      const settled = (async () => {
        try {
          return await pending;
        } catch (error) {
          return error;
        }
      })();
      if (stalled) {
        await ready;
      } else {
        await pending;
      }
      if (mode === "caller") {
        caller.abort();
      } else if (mode === "mount") {
        lifetime.abort();
      } else {
        await iterator.return!();
      }
      const outcome = await settled;
      if (stalled) {
        expect(outcome).toMatchObject({ name: "AbortError" });
      }
      await iterator.return!();
      expect(requestSignal?.aborted).toBe(true);
      expect(cancels).toBe(1);
    }
  });
});
