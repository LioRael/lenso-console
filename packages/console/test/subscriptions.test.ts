import { expect, test } from "bun:test";

import type { ConsoleClient } from "@lenso/console-sdk/protocol";
import { defineApp, startApp, type Plugin } from "@lenso/core";
import { defineOperation, type Operation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import { createWebPlugin } from "@lenso/web";
import { createBunListenerPlugin } from "@lenso/web/bun";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { z } from "zod";

import { ConsoleRequestError } from "../src/auth";
import { createConsoleService } from "../src/service";
import { subscription } from "../src/subscription";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleMount,
  ConsoleOptions,
  ConsoleStream,
} from "../src/types";

const origin = "https://console.test";
const digest = "a".repeat(64);
const headers = {
  "x-lenso-page-owner": "events",
  "x-lenso-page-revision": "1",
  "x-lenso-page-implementation": digest,
  "x-lenso-expected-subject": "alice",
};

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}

async function fixture(
  overrides?: (stream: ConsoleStream) => ConsoleStream,
  binding?: ConsoleOptions["binding"],
  publicWatch = "watch"
) {
  const gate = deferred();
  const state = {
    enabled: true,
    scope: "1",
    permitted: true,
    opened: 0,
    returned: 0,
    revokeOnBinding: false,
    missingContext: false,
    bound: [] as unknown[],
    lateError: false,
    raw: { label: "你好 🌍", private: "not-public" },
  };
  const identity = () =>
    ({
      actor: { subjectId: "alice", realmId: "realm", audience: "console" },
      readScope: state.scope,
    }) as ConsoleIdentity;
  const auth: ConsoleAuthentication = {
    admit() {},
    async authenticate() {
      if (!state.enabled) {
        throw new ConsoleRequestError("unauthorized");
      }
      return identity();
    },
    async enforce() {
      if (!state.permitted) {
        throw new ConsoleRequestError("forbidden");
      }
    },
    async can() {
      return state.permitted;
    },
    async session() {
      return { administrator: false, workspace_ids: ["north"] };
    },
    async fetch() {
      return undefined;
    },
  };
  const plugin: Plugin<{
    read: () => string;
    watch: (
      input: { label: string },
      context: { signal: AbortSignal; identity: ConsoleIdentity }
    ) => AsyncGenerator<unknown>;
  }> = {
    id: "events",
    setup() {
      return {
        read: () => "finite",
        async *watch(input, context) {
          await auth.enforce(context.identity, {
            action: "invoke",
            targetId: "north",
            tenantId: "north",
          });
          state.opened += 1;
          try {
            yield { ...state.raw, input: input.label };
            await Promise.race([
              gate.promise,
              new Promise<void>((_resolve, reject) => {
                if (context.signal.aborted) {
                  reject(context.signal.reason);
                } else {
                  context.signal.addEventListener(
                    "abort",
                    () => reject(context.signal.reason),
                    { once: true }
                  );
                }
              }),
            ]);
            context.signal.throwIfAborted();
            if (state.lateError) {
              throw new Error("secret-generator-cause");
            }
            yield state.raw;
          } finally {
            state.returned += 1;
          }
        },
      };
    },
  };
  const watch = defineOperation({
    plugin,
    method: "watch",
    input: z.object({ label: z.string().trim().min(1) }),
    effect: "read",
    description: "Watch public events",
    context: true,
  });
  const read = defineOperation({
    plugin,
    method: "read",
    input: z.object({}),
    effect: "read",
    description: "Read finite value",
  });
  const manage = defineManage({ plugin, operations: [read] });
  const stream = overrides?.({
    operation: watch,
    output: z.object({ label: z.string() }),
  }) ?? { operation: watch, output: z.object({ label: z.string() }) };
  const mount: ConsoleMount = {
    descriptor: {
      apiMajor: 1,
      id: "events-page",
      title: "Events",
      subject: { kind: "console" },
      owner: { instance: "events", source: "application", trusted: true },
      revision: "1",
      implementationId: digest,
      basePath: "/events",
      module: `/api/console/v1/pages/events-page/assets/${digest}/page.mjs`,
      styles: [],
      navigation: { label: "Events", items: [] },
      requirements: [
        {
          service_id: "events",
          capability_id: "events",
          descriptor_version: "1",
          operations: ["read", publicWatch],
          available: true,
          required: true,
          source: "owner",
          streaming_operations: ["read", "invented"],
        },
      ],
    },
    services: {
      events: {
        manage,
        operations: [read],
        streams: [stream],
        operationAliases:
          publicWatch === "watch" ? undefined : { [publicWatch]: "watch" },
      },
    },
    asset: async () => undefined,
  };
  const running = await startApp(defineApp({ plugins: [plugin] }));
  let service: ReturnType<typeof createConsoleService>;
  try {
    service = createConsoleService(
      {
        ...running,
        get() {
          throw new Error(
            "Borrowed subscriptions must not dispatch in the host runtime"
          );
        },
      },
      auth,
      {
        authentication: { id: "unused-auth", setup: () => auth },
        management: true,
        targets: [
          {
            id: "north",
            label: "North",
            tenantId: "north",
            plugins: [plugin],
            manage: [manage],
            mounts: [mount],
            running,
          },
        ],
        binding(operation, input, request, actor, resource) {
          state.bound.push(input);
          if (binding) {
            return binding(operation, input, request, actor, resource);
          }
          if (state.revokeOnBinding) {
            state.permitted = false;
          }
          if (state.missingContext) {
            return { signal: request.signal };
          }
          return {
            context: { signal: request.signal, identity: actor },
            signal: request.signal,
          };
        },
      }
    );
  } catch (error) {
    await running.stop();
    throw error;
  }
  const client = (extra?: Record<string, string>): ConsoleClient =>
    createORPCClient(
      new RPCLink({
        origin,
        url: "/api/console/v2/rpc",
        headers: { ...headers, ...extra },
        async fetch(input, init) {
          return (
            (await service.fetch(new Request(input, init))) ??
            new Response(null, { status: 404 })
          );
        },
      })
    );
  const subscribe = (extra?: Record<string, string>, input?: unknown) =>
    client(extra).workspace.subscribe({
      mountId: "events-page",
      service: "events",
      operation: publicWatch,
      input: input === undefined ? { label: "  public  " } : input,
    });
  return { service, running, state, subscribe, client, gate, mount };
}

test("Fetch/oRPC streams project Unicode DTOs and keep finite Manage/catalog separate", async () => {
  for (const publicWatch of ["watch", "updates"]) {
    const f = await fixture(undefined, undefined, publicWatch);
    try {
      const iterator = await f.subscribe();
      expect(await iterator.next()).toEqual({
        done: false,
        value: { label: "你好 🌍" },
      });
      expect(f.state.bound).toEqual([{ label: "public" }]);
      f.gate.resolve();
      expect(await iterator.next()).toEqual({
        done: false,
        value: { label: "你好 🌍" },
      });
      const completed = await iterator.next();
      expect(completed.done).toBe(true);
      expect(f.state.returned).toBe(1);
      const catalog = await f.client().catalog({});
      expect(catalog.operations.map((operation) => operation.method)).toEqual([
        "read",
      ]);
      await expect(
        f.client().workspace.invoke({
          mountId: "events-page",
          service: "events",
          operation: publicWatch,
          input: { label: "x" },
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const pages = await f.service.fetch(
        new Request(`${origin}/api/console/v1/pages`)
      );
      const result = await pages!.json();
      expect(result.mounts[0].requirements[0].streaming_operations).toEqual([
        publicWatch,
      ]);
      expect(result.mounts[0].requirements[0].operations).toEqual([
        "read",
        publicWatch,
      ]);
      await f.service.close?.();
      expect(
        f.running.get(f.mount.services.events.manage.plugin)
      ).toBeDefined();
    } finally {
      await f.service.close?.();
      await f.running.stop();
    }
  }
});

test("wrong immutable mount and expected subject fail before stream opening; input validates before binding", async () => {
  const f = await fixture();
  try {
    for (const [header, value] of [
      ["x-lenso-page-revision", "stale"],
      ["x-lenso-page-owner", "other"],
      ["x-lenso-page-implementation", "b".repeat(64)],
      ["x-lenso-expected-subject", "bob"],
    ]) {
      await expect(f.subscribe({ [header!]: value! })).rejects.toMatchObject({
        code:
          header === "x-lenso-expected-subject"
            ? "PRECONDITION_FAILED"
            : "CONFLICT",
      });
    }
    await expect(f.subscribe(undefined, { label: 42 })).rejects.toMatchObject({
      code: "UNPROCESSABLE_CONTENT",
    });
    expect(f.state.opened).toBe(0);
    expect(f.state.bound).toEqual([]);
  } finally {
    await f.service.close?.();
    await f.running.stop();
  }
});

test("streams reject default/write/unknown/destructive/gated declarations and invalid item budgets", async () => {
  for (const patch of [
    { effect: undefined },
    { effect: "write" },
    { effect: "unknown" },
    { destructive: true },
    { confirmation: "required" },
    { approval: "required" },
  ]) {
    await expect(
      fixture((stream) => ({
        ...stream,
        operation: { ...stream.operation, ...patch } as Operation,
      }))
    ).rejects.toBeInstanceOf(Error);
  }
  for (const maxItemBytes of [0, -1, 1.5, 1024 * 1024 + 1]) {
    await expect(
      fixture((stream) => ({ ...stream, maxItemBytes }))
    ).rejects.toBeInstanceOf(Error);
  }
});

test("revoked authentication, changed scope and late producer errors terminate with opaque errors", async () => {
  for (const mode of ["revoke", "scope", "error"] as const) {
    const f = await fixture();
    try {
      const iterator = await f.subscribe();
      await iterator.next();
      if (mode === "revoke") {
        f.state.enabled = false;
      }
      if (mode === "scope") {
        f.state.scope = "2";
      }
      if (mode === "error") {
        f.state.lateError = true;
      }
      f.gate.resolve();
      const failure = await iterator.next().catch((error: unknown) => error);
      expect(failure).toMatchObject({
        code:
          mode === "revoke"
            ? "UNAUTHORIZED"
            : mode === "scope"
              ? "PRECONDITION_FAILED"
              : "SERVICE_UNAVAILABLE",
      });
      expect(JSON.stringify(failure)).not.toContain("secret-generator-cause");
      expect(f.state.returned).toBe(1);
    } finally {
      await f.service.close?.();
      await f.running.stop();
    }
  }
});

test("raw item budget applies before DTO strips private fields", async () => {
  const f = await fixture((stream) => ({ ...stream, maxItemBytes: 128 }));
  try {
    f.state.raw.private = "private".repeat(100);
    const iterator = await f.subscribe();
    await expect(iterator.next()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(f.state.returned).toBe(1);
  } finally {
    await f.service.close?.();
    await f.running.stop();
  }
});

test("authorization is re-enforced after trusted binding and context cannot be omitted", async () => {
  for (const missingContext of [false, true]) {
    const f = await fixture();
    try {
      f.state.revokeOnBinding = !missingContext;
      f.state.missingContext = missingContext;
      await expect(f.subscribe()).rejects.toMatchObject({
        code: missingContext ? "SERVICE_UNAVAILABLE" : "FORBIDDEN",
      });
      expect(f.state.opened).toBe(0);
    } finally {
      await f.service.close?.();
      await f.running.stop();
    }
  }
});

test("scope changes during asynchronous DTO validation cannot deliver stale items", async () => {
  let changeScope: () => void;
  const f = await fixture((stream) => ({
    ...stream,
    output: {
      "~standard": {
        version: 1,
        vendor: "fixture",
        async validate(value) {
          await Promise.resolve();
          changeScope();
          return z.object({ label: z.string() })["~standard"].validate(value);
        },
      },
    },
  }));
  try {
    changeScope = () => {
      f.state.scope = "changed";
    };
    const iterator = await f.subscribe();
    await expect(iterator.next()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(f.state.returned).toBe(1);
  } finally {
    await f.service.close?.();
    await f.running.stop();
  }
});

test("projected DTO budget and schema failures are opaque late failures", async () => {
  for (const throws of [false, true]) {
    const f = await fixture((stream) => ({
      ...stream,
      maxItemBytes: 128,
      output: {
        "~standard": {
          version: 1,
          vendor: "fixture",
          validate() {
            if (throws) {
              throw new Error("private-schema-text");
            }
            return { value: { label: "expanded".repeat(100) } };
          },
        },
      },
    }));
    try {
      const iterator = await f.subscribe();
      const failure = await iterator.next().catch((error: unknown) => error);
      expect(failure).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(JSON.stringify(failure)).not.toContain("private-schema-text");
      expect(f.state.returned).toBe(1);
    } finally {
      await f.service.close?.();
      await f.running.stop();
    }
  }
});

test("stream initialization and iterator cleanup failures never expose raw causes or succeed silently", async () => {
  const f = await fixture();
  try {
    const installed = f.running.get(f.mount.services.events.manage.plugin) as {
      watch: () => unknown;
    };
    installed.watch = () => {
      throw new Error("private-initialization");
    };
    const failure = await f.subscribe().catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(JSON.stringify(failure)).not.toContain("private-initialization");
  } finally {
    await f.service.close?.();
    await f.running.stop();
  }

  const controller = new AbortController();
  let returns = 0;
  const iterator = subscription(
    {
      async next() {
        return { done: true, value: undefined };
      },
      async return() {
        returns += 1;
        throw new Error("private-cleanup");
      },
    },
    controller,
    controller.signal,
    async (value) => value,
    () => new Error("safe-cleanup")
  );
  await expect(iterator.next()).rejects.toThrow("safe-cleanup");
  await expect(iterator.return()).rejects.toThrow("safe-cleanup");
  expect(returns).toBe(1);
});

test("boundary return interrupts a waiting cooperative producer exactly once without read-ahead", async () => {
  const controller = new AbortController();
  let pulls = 0;
  let released = 0;
  async function* producer() {
    try {
      pulls += 1;
      yield "first";
      pulls += 1;
      await new Promise<void>((_resolve, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("private abort")),
          { once: true }
        )
      );
    } finally {
      released += 1;
    }
  }
  const iterator = subscription(
    producer(),
    controller,
    controller.signal,
    async (value) => value,
    () => new Error("safe")
  );
  expect(pulls).toBe(0);
  await iterator.next();
  expect(pulls).toBe(1);
  const pending = iterator.next();
  const observed = (async () => {
    try {
      await pending;
    } catch (error) {
      return (error as Error).message;
    }
    return undefined;
  })();
  await iterator.return();
  await iterator.return();
  expect(await observed).toBe("safe");
  expect(released).toBe(1);
});

// Waiting only for generator.return() releases dependencies while async DTO
// validation still runs. Its completion is a separate owned-work barrier.
test("subscription cleanup drains in-flight DTO validation before releasing its owner", async () => {
  const entered = deferred();
  const release = deferred();
  const returned = deferred();
  const controller = new AbortController();
  let ownerReleased = false;
  let closeCompleted = false;
  async function* producer() {
    try {
      yield "pending DTO";
    } finally {
      returned.resolve();
    }
  }
  const iterator = subscription(
    producer(),
    controller,
    controller.signal,
    async (value) => {
      entered.resolve();
      await release.promise;
      return value;
    },
    () => new Error("cancelled"),
    () => {
      ownerReleased = true;
    }
  );
  const pending = iterator.next();
  const reading = (async () => {
    try {
      await pending;
      return undefined;
    } catch (error) {
      return error;
    }
  })();
  await entered.promise;
  const closing = (async () => {
    await iterator.return();
    closeCompleted = true;
  })();
  await returned.promise;
  expect(closeCompleted).toBe(false);
  expect(ownerReleased).toBe(false);
  release.resolve();
  await closing;
  expect(await reading).toMatchObject({ message: "cancelled" });
  expect(closeCompleted).toBe(true);
  expect(ownerReleased).toBe(true);
});

test("Console close reports a remembered opaque cleanup failure after its stream has ended", async () => {
  const f = await fixture();
  let returns = 0;
  try {
    const installed = f.running.get(f.mount.services.events.manage.plugin) as {
      watch: () => unknown;
    };
    installed.watch = () => ({
      async next() {
        return { done: true, value: undefined };
      },
      async return() {
        returns += 1;
        throw new Error("private-cleanup-resource");
      },
    });
    const iterator = await f.subscribe();
    await expect(iterator.next()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    const failure = await f.service.close?.().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({ code: "SERVICE_UNAVAILABLE" }),
    ]);
    expect(returns).toBe(1);
  } finally {
    await f.service.close?.().catch(() => {});
    await f.running.stop();
  }
});

// Producer-only cleanup coverage starts after binding. Startup work can own
// asynchronous cleanup before there is an iterator for close() to drain.
test("Console close waits for pending binding cleanup before initialization drains", async () => {
  const entered = deferred();
  const cleaning = deferred();
  const release = deferred();
  const f = await fixture(undefined, async (_operation, _input, request) => {
    entered.resolve();
    try {
      await new Promise<void>((resolve) => {
        request.signal.addEventListener("abort", () => resolve(), {
          once: true,
        });
      });
      throw request.signal.reason;
    } finally {
      cleaning.resolve();
      await release.promise;
    }
  });
  async function openingResult() {
    try {
      return await f.subscribe();
    } catch (error) {
      return error;
    }
  }
  try {
    const rejected = openingResult();
    await entered.promise;
    let closed = false;
    const closing = f.service.close!().then(() => {
      closed = true;
    });
    await cleaning.promise;
    expect(closed).toBe(false);
    expect(f.state.opened).toBe(0);
    release.resolve();
    await closing;
    expect(await rejected).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(closed).toBe(true);
  } finally {
    release.resolve();
    await f.service.close?.();
    await f.running.stop();
  }
}, 1000);

// An input-schema or policy test does not exercise mutation of a declaration
// retained by the application while asynchronous binding is in progress.
test("subscriptions retain startup execution and DTO declarations during binding mutation", async () => {
  let original!: ConsoleStream;
  const f = await fixture(
    (stream) => {
      original = stream;
      return stream;
    },
    async (_operation, _input, request, identity) => {
      Object.assign(original.operation, {
        method: "read",
        effect: "write",
        confirmation: "required",
        approval: "required",
      });
      Object.assign(original, {
        output: z.object({ private: z.string() }),
        maxItemBytes: 1,
      });
      return {
        context: { signal: request.signal, identity },
        signal: request.signal,
      };
    }
  );
  try {
    const iterator = await f.subscribe();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { label: "你好 🌍" },
    });
    expect(f.state.opened).toBe(1);
    await iterator.return();
    expect(f.state.returned).toBe(1);
  } finally {
    await f.service.close?.();
    await f.running.stop();
  }
});

test("Console close drains a cooperative producer while its borrowed target remains running", async () => {
  const f = await fixture();
  try {
    const iterator = await f.subscribe();
    await iterator.next();
    await f.service.close?.();
    expect(f.state.returned).toBe(1);
    expect(f.running.get(f.mount.services.events.manage.plugin)).toBeDefined();
  } finally {
    await f.service.close?.();
    await f.running.stop();
  }
});

test("real Web/Bun listener disconnect releases a waiting subscription producer", async () => {
  const f = await fixture();
  const consolePlugin: Plugin<ReturnType<typeof createConsoleService>> = {
    id: "console-transport",
    setup(context) {
      context.onCleanup(() => f.service.close?.());
      return f.service;
    },
  };
  const web = createWebPlugin({
    requires: [consolePlugin],
    router: () => ({}),
    fetch:
      (context) =>
      ({ request }) =>
        context.get(consolePlugin).fetch(request),
  });
  const listener = createBunListenerPlugin({
    web,
    hostname: "127.0.0.1",
    port: 0,
    ingress: () => undefined,
  });
  const app = await startApp(
    defineApp({ plugins: [consolePlugin, web, listener] })
  );
  try {
    const client: ConsoleClient = createORPCClient(
      new RPCLink({
        origin: app.get(listener).url.origin,
        url: "/api/console/v2/rpc",
        headers,
      })
    );
    for (const cancel of ["return", "abort"] as const) {
      const controller = new AbortController();
      const iterator = await client.workspace.subscribe(
        {
          mountId: "events-page",
          service: "events",
          operation: "watch",
          input: { label: "public" },
        },
        { signal: controller.signal }
      );
      const first = await iterator.next();
      expect(first.value).toEqual({ label: "你好 🌍" });
      if (cancel === "return") {
        await iterator.return();
      } else {
        controller.abort();
      }
      const expectedReturns = cancel === "return" ? 1 : 2;
      const deadline = Date.now() + 1500;
      while (f.state.returned < expectedReturns && Date.now() < deadline) {
        await Bun.sleep(10);
      }
      expect(f.state.returned).toBe(expectedReturns);
    }
    expect(f.running.get(f.mount.services.events.manage.plugin)).toBeDefined();
  } finally {
    await app.stop();
    await f.service.close?.();
    await f.running.stop();
  }
}, 5000);
