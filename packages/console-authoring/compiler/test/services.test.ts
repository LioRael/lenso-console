import { test, expect } from "bun:test";

import { startApp } from "@lenso/core";
import { executeOperation } from "@lenso/engine/operations";

import {
  createWorkspacePlugin,
  createWorkspaceServices,
  defineServices,
  operation,
  streamOperation,
  type WorkspaceOperationContext,
} from "../../src/server";

const context: WorkspaceOperationContext = {
  mountId: "test",
  subject: { kind: "console" },
  owner: { instance: "example.orders" },
  revision: "test",
  signal: new AbortController().signal,
};

const labelledOperation = (label: string) =>
  operation({
    effect: "read",
    parse: (value: unknown) => value,
    authorize: () => true,
    handle: () => ({ label }),
  });

test("service adapters enforce validation and authorization before domain code", async () => {
  let calls = 0;
  const services = defineServices({
    orders: {
      capabilityId: "example.orders.query@1",
      version: "1.0.0",
      operations: {
        read: operation({
          parse(value: unknown) {
            if (typeof value !== "string") {
              throw new TypeError("string required");
            }
            return value;
          },
          authorize(_context, value) {
            return value === "42";
          },
          handle(value) {
            calls += 1;
            return { id: value };
          },
        }),
      },
    },
  });
  const adapter = createWorkspaceServices(services, "test");
  const invoke = (value: unknown) =>
    adapter.invoke(context, {
      service: "orders",
      operation: "read",
      input: value,
    });
  await expect(invoke(42)).rejects.toThrow("codec_mismatch");
  await expect(invoke("99")).rejects.toThrow("denied");
  expect(calls).toBe(0);
  const response = await invoke("42");
  expect(response).toEqual({ id: "42" });
  expect(calls).toBe(1);
  expect(() =>
    adapter.invoke(
      { ...context, revision: "stale" },
      {
        service: "orders",
        operation: "read",
        input: "42",
      }
    )
  ).toThrow("denied");
  expect(calls).toBe(1);
});

// Dotted aliases and methods can otherwise collapse to the same owner method.
// Direct dispatch tests never run the real Engine against the generated Plugin.
test("explicit owner operations preserve service namespaces and reject another owner", async () => {
  const installation = createWorkspacePlugin({
    id: context.owner.instance,
    revision: context.revision,
    services: defineServices({
      "orders.a": {
        capabilityId: "one",
        version: "1",
        operations: {
          read: labelledOperation("one"),
          watch: streamOperation({
            parse: (value: unknown) => value,
            authorize: () => true,
            async *handle() {
              yield { label: "one" };
            },
          }),
        },
      },
      orders: {
        capabilityId: "two",
        version: "1",
        operations: { "a.read": labelledOperation("two") },
      },
    }),
  });
  const running = await startApp({ plugins: [installation.plugin] });
  try {
    const { operations } = installation.manage;
    const mounted = installation.services["orders.a"]!;
    expect(mounted.operations).toHaveLength(1);
    expect(mounted.streams).toHaveLength(1);
    expect(operations).not.toContain(mounted.streams[0]!.operation);
    await expect(
      executeOperation(running, operations[0]!, null, context)
    ).resolves.toEqual({ label: "one" });
    await expect(
      executeOperation(running, operations[1]!, null, context)
    ).resolves.toEqual({ label: "two" });
    await expect(
      executeOperation(running, operations[0]!, null, {
        ...context,
        owner: { instance: "another-owner" },
      })
    ).rejects.toThrow("denied");
  } finally {
    await running.stop();
  }
});

// Request coverage cannot detect a domain iterator retained after cancellation.
test("stream authorization and cancellation close the domain iterator", async () => {
  let opened = 0;
  let closed = 0;
  const declaration = {
    parse: String,
    authorize: (_context: WorkspaceOperationContext, value: string) =>
      value === "42",
    async *handle(value: string) {
      opened += 1;
      try {
        yield { id: value };
        yield { id: value };
      } finally {
        closed += 1;
      }
    },
  };
  for (const effect of ["write", "unknown"]) {
    expect(() =>
      Reflect.apply(streamOperation, undefined, [{ ...declaration, effect }])
    ).toThrow("read-only");
  }
  const watch = streamOperation(declaration);
  const controller = new AbortController();
  const stream = watch.subscribe(
    { ...context, signal: controller.signal },
    "42"
  );
  const iterator = stream[Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({ done: false, value: { id: "42" } });
  controller.abort();
  await expect(iterator.next()).rejects.toThrow();
  expect(opened).toBe(1);
  expect(closed).toBe(1);
  const denied = watch.subscribe(context, "99")[Symbol.asyncIterator]();
  await expect(denied.next()).rejects.toThrow("denied");
  expect(opened).toBe(1);
});

// Prevent metadata accepted by the SDK from failing only during Host admission.
test("declarations reject oversized operations with the owning alias", () => {
  const operations = Object.fromEntries(
    Array.from({ length: 33 }, (_, index) => [
      `read${index}`,
      operation({
        parse: (value: unknown) => value,
        authorize: () => true,
        handle: (value: unknown) => value,
      }),
    ])
  );
  expect(() =>
    defineServices({
      orders: {
        capabilityId: "example.orders.query@1",
        version: "1.0.0",
        operations,
      },
    })
  ).toThrow('Workspace service "orders"');
});

// A Promise-like member would be advertised by inference but suppressed by the client.
// oxlint-disable unicorn/no-thenable -- Intentionally invalid declarations prove SDK rejection.
test("declarations reject thenable aliases before client use", () => {
  const read = operation({
    parse: (value: unknown) => value,
    authorize: () => true,
    handle: (value: unknown) => value,
  });
  const service = {
    capabilityId: "example.orders.query@1",
    version: "1.0.0",
    operations: { read },
  };
  expect(() => defineServices(Object.fromEntries([["then", service]]))).toThrow(
    'reserved client member "then"'
  );
  expect(() =>
    defineServices({
      orders: { ...service, operations: Object.fromEntries([["then", read]]) },
    })
  ).toThrow('reserved client member "then"');
});
// oxlint-enable unicorn/no-thenable
