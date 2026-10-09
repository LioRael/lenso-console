import { describe, expect, it } from "bun:test";

import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import { consoleContract } from "../../src/protocol";
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

describe("Console SDK Fetch transport", () => {
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
  it.each(["/api/console/v2/rpc", "/admin/api/console/v2/rpc"] as const)(
    "streams Unicode, terminal errors and completion at %s without wrong-mode dispatch",
    async (prefix) => {
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
        mount: {
          ...mount,
          requirements: [
            {
              ...mount.requirements[0]!,
              operations: ["echo", "ticks"],
              streaming_operations: ["ticks"],
            },
          ],
        },
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
      await expect(services.invoke("notes", "ticks", {})).rejects.toMatchObject(
        {
          code: "workspace_service_unavailable",
        }
      );
      await expect(
        services.subscribe("notes", "echo", {})[Symbol.asyncIterator]().next()
      ).rejects.toMatchObject({ code: "workspace_service_unavailable" });
      expect(dispatches).toBe(2);
    }
  );

  it("cancels the response body exactly once on early return, break and stalled next cancellation", async () => {
    for (const mode of [
      "return",
      "stalled-return",
      "caller",
      "mount",
      "break",
    ]) {
      const stalled = !["return", "break"].includes(mode);
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
        mount: {
          ...mount,
          requirements: [
            {
              ...mount.requirements[0]!,
              operations: ["ticks"],
              streaming_operations: ["ticks"],
            },
          ],
        },
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
