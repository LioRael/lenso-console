import { expect, test } from "bun:test";

import {
  audience,
  AuthError,
  createAuth,
  defineSource,
  realm,
  type Access,
} from "@lenso/auth";
import type { ConsoleClient } from "@lenso/console-sdk/protocol";
import { WorkspaceServiceError } from "@lenso/console-sdk/server";
import { createConsoleWorkspaceServices } from "@lenso/console-sdk/transport";
import {
  defineApp,
  definePlugin,
  startApp,
  valuesSource,
  type Plugin,
} from "@lenso/core";
import { EngineError } from "@lenso/engine/diagnostics";
import { defineOperation, type Operation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { z } from "zod";

import { createConsoleAuthentication } from "../src/auth";
import { ConsoleOperationError } from "../src/errors";
import { consoleConfiguration, createConsolePlugin } from "../src/index";
import { readRequestBytes } from "../src/request-body";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleLocaleStore,
  ConsoleMount,
  ConsoleOptions,
  ConsoleResource,
  ConsoleService,
  ConsoleTarget,
} from "../src/types";

const origin = "https://console.test";
type FixtureAccess = Access<
  string,
  string | null,
  string,
  string,
  ConsoleResource,
  { allowed: true }
>;

function authentication(authBase = "/auth") {
  const state = {
    enabled: true,
    north: true,
    admitted: 0,
    localeDefault: false,
    kind: "user" as "user" | "service",
    revisionOverride: undefined as string | undefined,
  };
  let access: FixtureAccess;
  const plugin: Plugin<ConsoleAuthentication> = {
    id: "console-auth",
    setup(context) {
      const auth = createAuth(
        realm(
          "console-fixture" as string,
          defineSource({
            async verify(token: string | null) {
              if (token === null) {
                return { status: "absent" };
              }
              return state.enabled && token === "alice"
                ? { status: "verified", subjectId: token, kind: state.kind }
                : { status: "rejected" };
            },
          })
        )
      );
      context.onCleanup(() => auth.close());
      access = auth
        .for(audience("console" as string))
        .memberships(async (_subject, resource: ConsoleResource) =>
          state.north &&
          resource.tenantId === "north" &&
          (resource.operation !== "console.locale.default.manage" ||
            state.localeDefault)
            ? { allowed: true as const }
            : null
        );
      const service = createConsoleAuthentication({
        access,
        policy: ({ membership }) => membership.allowed,
        requestPolicy: { origin, credentialMode: "bearer" },
        evidence: (request) =>
          request.headers.get("authorization")?.slice(7) ?? null,
        permissionRevision: () => state.revisionOverride ?? String(state.north),
        session: async (actor) => {
          await access.enforce(
            actor,
            { action: "session", targetId: "north", tenantId: "north" },
            ({ membership }) => membership.allowed
          );
          return { administrator: false, workspace_ids: ["north"] };
        },
        methodsPath: `${authBase}/methods`,
      });
      return {
        ...service,
        admit(request) {
          state.admitted += 1;
          service.admit(request);
        },
      };
    },
  };
  return {
    plugin,
    state,
    get access() {
      return access;
    },
  };
}

function counter(
  id: string,
  authenticationPlugin: Plugin<ConsoleAuthentication>
) {
  const state: {
    setups: number;
    cleanups: number;
    value: number;
    calls: number;
    failure?: unknown;
  } = { setups: 0, cleanups: 0, value: 0, calls: 0 };
  const plugin = {
    id,
    requires: [authenticationPlugin],
    setup(context: Parameters<Plugin["setup"]>[0]) {
      state.setups += 1;
      const auth = context.get(authenticationPlugin);
      context.onCleanup(() => {
        state.cleanups += 1;
      });
      return {
        async read(
          input: { label: string },
          evidence: { identity: ConsoleIdentity; resource: ConsoleResource }
        ) {
          await auth.enforce(evidence.identity, evidence.resource);
          state.calls += 1;
          return {
            id,
            value: state.value,
            label: input.label,
            subject: evidence.identity.actor.subjectId,
          };
        },
        async write(
          _input: { label: string },
          evidence: { identity: ConsoleIdentity; resource: ConsoleResource }
        ) {
          await auth.enforce(evidence.identity, evidence.resource);
          state.calls += 1;
          state.value += 1;
          return state.value;
        },
        async fail() {
          throw state.failure ?? new Error("private-database-password");
        },
        async forbidden() {
          throw new AuthError("FORBIDDEN");
        },
        async unselected() {
          throw new Error("must not run");
        },
      };
    },
  };
  const schema = z.strictObject({ label: z.string().trim().min(1) });
  const read = defineOperation({
    plugin,
    method: "read",
    input: schema,
    description: "Read this counter.",
    effect: "read",
    context: true,
  });
  const write = defineOperation({
    plugin,
    method: "write",
    input: schema,
    description: "Increment this counter.",
    effect: "write",
    context: true,
    confirmation: "required",
    approval: "required",
  });
  const fail = defineOperation({
    plugin,
    method: "fail",
    input: z.strictObject({}),
    description: "Fail opaquely.",
    effect: "read",
  });
  const forbidden = defineOperation({
    plugin,
    method: "forbidden",
    input: z.strictObject({}),
    description: "Deny in service.",
    effect: "read",
  });
  const manage = defineManage({
    plugin,
    operations: [read, write, fail, forbidden],
  });
  return { plugin, state, manage, read, write };
}

function target(
  id: string,
  instance: ReturnType<typeof counter>,
  tenantId = "north"
): ConsoleTarget {
  return {
    id,
    label: id,
    tenantId,
    plugins: [instance.plugin],
    manage: [instance.manage],
  };
}

function client(
  service: ConsoleService,
  headers?: HeadersInit,
  api: `/${string}` = "/api",
  statuses?: number[],
  responses?: Response[]
): ConsoleClient {
  return createORPCClient(
    new RPCLink({
      origin,
      url: `${api}/console/v2/rpc`,
      headers: new Headers(headers ?? { authorization: "Bearer alice" }),
      async fetch(input, init) {
        const response =
          (await service.fetch(new Request(input, init))) ??
          new Response(null, { status: 404 });
        statuses?.push(response.status);
        responses?.push(response.clone());
        return response;
      },
    })
  );
}

const bound: ConsoleOptions["binding"] = (
  _operation,
  _input,
  _request,
  identity,
  resource
) => ({
  context: { identity, resource },
});

function mount(
  instance: ReturnType<typeof counter>,
  id = "counter"
): ConsoleMount {
  const implementationId = "a".repeat(64);
  return {
    descriptor: {
      apiMajor: 1,
      id,
      title: id,
      subject: { kind: "console" },
      owner: {
        instance: instance.plugin.id,
        source: "application",
        trusted: true,
      },
      revision: "1",
      implementationId,
      basePath: `/${id}`,
      module: `/api/console/v1/pages/${id}/assets/${implementationId}/page.mjs`,
      styles: [],
      navigation: { label: id, items: [] },
      requirements: [
        {
          service_id: "counter",
          capability_id: "counter",
          descriptor_version: "1",
          operations: ["read"],
          available: true,
          required: true,
          source: "owner",
        },
      ],
    },
    services: {
      counter: { manage: instance.manage, operations: [instance.read] },
    },
    asset: async (path) =>
      path === "page.mjs" ? new Response("export default {}") : undefined,
  };
}

test("a stalled Fetch body read aborts and releases its stream with the exact caller reason", async () => {
  let pulled!: () => void;
  const pending = new Promise<void>((resolve) => {
    pulled = resolve;
  });
  let cancelled: unknown;
  const stream = new ReadableStream<Uint8Array>({
    pull() {
      pulled();
    },
    cancel(reason) {
      cancelled = reason;
    },
  });
  const controller = new AbortController();
  const reason = new Error("fixture abort");
  const request = new Request(`${origin}/rpc`, {
    method: "POST",
    body: stream,
    signal: controller.signal,
  });
  const read = readRequestBytes(request, 32_768, () => new Error("oversized"));
  await pending;
  controller.abort(reason);
  await expect(read).rejects.toBe(reason);
  expect(cancelled).toBe(reason);
  expect(stream.locked).toBe(false);
}, 1000);

test("SDK errors keep trusted domain status and safe retry units, never arbitrary error fields", async () => {
  const auth = authentication();
  const instance = counter("counter", auth.plugin);
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    management: true,
    targets: [target("north", instance)],
    binding: bound,
  });
  const app = await startApp({
    plugins: [auth.plugin, instance.plugin, consolePlugin],
  });
  try {
    const responses: Response[] = [];
    const sdk = client(
      app.get(consolePlugin),
      undefined,
      "/api",
      undefined,
      responses
    );
    const cases: readonly {
      error: unknown;
      code: string;
      status: number;
      retry?: string;
    }[] = [
      {
        error: new EngineError({
          code: "conflict",
          phase: "invoke",
          message: "private-database-password",
        }),
        code: "CONFLICT",
        status: 409,
      },
      {
        error: new WorkspaceServiceError("denied"),
        code: "FORBIDDEN",
        status: 403,
      },
      {
        error: new WorkspaceServiceError("codec_mismatch"),
        code: "UNPROCESSABLE_CONTENT",
        status: 422,
      },
      {
        error: new WorkspaceServiceError("unknown_operation"),
        code: "NOT_FOUND",
        status: 404,
      },
      {
        error: new WorkspaceServiceError("unknown_service"),
        code: "NOT_FOUND",
        status: 404,
      },
      {
        error: new WorkspaceServiceError("request_too_large"),
        code: "PAYLOAD_TOO_LARGE",
        status: 413,
      },
      {
        error: new WorkspaceServiceError("response_too_large"),
        code: "SERVICE_UNAVAILABLE",
        status: 503,
      },
      {
        error: new ConsoleOperationError("TOO_MANY_REQUESTS", {
          retryAfterMs: 1001,
        }),
        code: "TOO_MANY_REQUESTS",
        status: 429,
        retry: "2",
      },
      {
        error: new ConsoleOperationError("TOO_MANY_REQUESTS"),
        code: "TOO_MANY_REQUESTS",
        status: 429,
      },
      {
        error: Object.assign(new Error("private-database-password"), {
          code: "FORBIDDEN",
          status: 403,
        }),
        code: "SERVICE_UNAVAILABLE",
        status: 503,
      },
      {
        error: Object.assign(new Error("private-database-password"), {
          code: "denied",
        }),
        code: "SERVICE_UNAVAILABLE",
        status: 503,
      },
    ];
    for (const fixture of cases) {
      instance.state.failure = fixture.error;
      await expect(
        sdk.invoke({
          targetId: "north",
          pluginId: instance.plugin.id,
          method: "fail",
          input: {},
        })
      ).rejects.toMatchObject({ code: fixture.code });
      const response = responses.at(-1)!;
      expect(response.status).toBe(fixture.status);
      expect(response.headers.get("retry-after")).toBe(fixture.retry ?? null);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const text = await response.text();
      expect(text).not.toContain("private-database-password");
      if (fixture.retry) {
        expect(text).toContain('"retryAfterMs":1001');
      }
    }
  } finally {
    await app.stop();
  }
});

test("a grant revoked during trusted binding prevents dispatch", async () => {
  const auth = authentication();
  let calls = 0;
  const plugin: Plugin<{ read(): Promise<null> }> = {
    id: "binding-gate",
    setup: () => ({
      async read() {
        calls += 1;
        return null;
      },
    }),
  };
  const operation = defineOperation({
    plugin,
    method: "read",
    input: z.strictObject({}),
    effect: "read",
    description: "Exercise a deferred trusted binding.",
  });
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    management: true,
    targets: [
      {
        id: "north",
        label: "North",
        tenantId: "north",
        plugins: [plugin],
        manage: [defineManage({ plugin, operations: [operation] })],
      },
    ],
    async binding() {
      await Promise.resolve();
      auth.state.north = false;
      return {};
    },
  });
  const app = await startApp({ plugins: [auth.plugin, plugin, consolePlugin] });
  try {
    await expect(
      client(app.get(consolePlugin)).invoke({
        targetId: "north",
        pluginId: plugin.id,
        method: "read",
        input: {},
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls).toBe(0);
  } finally {
    await app.stop();
  }
});

test("same-type instances and selected lists dispatch exact services with current verified actors", async () => {
  const auth = authentication();
  const left = counter("counter/left", auth.plugin);
  const right = counter("counter/right", auth.plugin);
  const hidden = counter("counter/hidden", auth.plugin);
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    management: true,
    targets: [
      target("left", left),
      target("right", right),
      target("hidden", hidden, "south"),
    ],
    binding: bound,
  });
  const app = await startApp(
    defineApp({
      plugins: [
        auth.plugin,
        left.plugin,
        right.plugin,
        hidden.plugin,
        consolePlugin,
      ],
    })
  );
  try {
    const service = app.get(consolePlugin);
    const rpc = client(service);
    const listedTargets = await rpc.targets();
    expect(listedTargets.targets.map((item) => item.id)).toEqual([
      "left",
      "right",
    ]);
    const catalog = await rpc.catalog({});
    expect(catalog.operations).toHaveLength(8);
    // Creating request adapters must not rotate opaque selection handles.
    const refreshedCatalog = await rpc.catalog({});
    expect(refreshedCatalog.operations.map((entry) => entry.key)).toEqual(
      catalog.operations.map((entry) => entry.key)
    );
    const read = catalog.operations.find(
      (entry) => entry.targetId === "right" && entry.method === "read"
    )!;
    expect(
      catalog.operations.some((entry) => entry.method === "unselected")
    ).toBe(false);
    expect(
      await rpc.invoke({
        targetId: "right",
        key: read.key,
        input: { label: " ok " },
      })
    ).toEqual({ id: "counter/right", value: 0, label: "ok", subject: "alice" });
    expect(left.state.calls).toBe(0);
    expect(right.state.calls).toBe(1);
    await expect(
      rpc.invoke({
        targetId: "left",
        key: read.key,
        input: { label: "ok" },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      rpc.invoke({
        targetId: "right",
        pluginId: left.plugin.id,
        method: "read",
        input: { label: "ok" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      rpc.invoke({
        targetId: "right",
        pluginId: right.plugin.id,
        method: "unselected",
        input: {},
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    auth.state.north = false;
    const hiddenTargets = await rpc.targets();
    expect(hiddenTargets.targets).toEqual([]);
    await expect(
      rpc.invoke({
        targetId: "right",
        pluginId: right.plugin.id,
        method: "read",
        input: { label: "ok" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    auth.state.enabled = false;
    await expect(rpc.catalog({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(right.state.calls).toBe(1);
  } finally {
    await app.stop();
  }
});

test("write attestation defaults closed and cannot replace required approval or confirmation", async () => {
  const auth = authentication();
  const instance = counter("counter", auth.plugin);
  const closed = createConsolePlugin({
    id: "closed-console",
    authentication: auth.plugin,
    management: true,
    targets: [target("north", instance)],
    binding: bound,
  });
  const attested = createConsolePlugin({
    id: "attested-console",
    authentication: auth.plugin,
    management: true,
    targets: [target("north", instance)],
    binding: bound,
    canWrite: () => true,
  });
  const approved = createConsolePlugin({
    id: "approved-console",
    authentication: auth.plugin,
    management: true,
    targets: [target("north", instance)],
    canWrite: () => true,
    binding: (...args) => ({
      ...bound(...args),
      confirm: () => true,
      approve: () => true,
    }),
  });
  const app = await startApp(
    defineApp({
      plugins: [auth.plugin, instance.plugin, closed, attested, approved],
    })
  );
  try {
    const catalog = await client(app.get(closed)).catalog({});
    expect(
      catalog.operations.find((entry) => entry.method === "write")
    ).toMatchObject({
      available: false,
      unavailableReason: expect.any(String),
    });
    const input = {
      targetId: "north",
      pluginId: "counter",
      method: "write",
      input: { label: "ok" },
    };
    await expect(client(app.get(closed)).invoke(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(client(app.get(attested)).invoke(input)).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    expect(instance.state.value).toBe(0);
    expect(await client(app.get(approved)).invoke(input)).toBe(1);
  } finally {
    await app.stop();
  }
});

test("validation precedes binding and service failures retain safe status without private error text", async () => {
  const auth = authentication();
  const instance = counter("counter", auth.plugin);
  let bindings = 0;
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    management: true,
    targets: [target("north", instance)],
    binding: (...args) => {
      bindings += 1;
      return bound(...args);
    },
  });
  const app = await startApp(
    defineApp({ plugins: [auth.plugin, instance.plugin, consolePlugin] })
  );
  try {
    const statuses: number[] = [];
    const rpc = client(app.get(consolePlugin), undefined, "/api", statuses);
    await expect(
      rpc.invoke({
        targetId: "north",
        pluginId: "counter",
        method: "read",
        input: { label: "" },
      })
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(statuses.at(-1)).toBe(422);
    expect(bindings).toBe(0);
    await expect(
      rpc.invoke({
        targetId: "north",
        pluginId: "counter",
        method: "read",
        input: { label: "x".repeat(1024 * 1024 + 1) },
      })
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(statuses.at(-1)).toBe(413);
    expect(bindings).toBe(0);
    await expect(
      rpc.invoke({
        targetId: "north",
        pluginId: "counter",
        method: "forbidden",
        input: {},
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(statuses.at(-1)).toBe(403);
    try {
      await rpc.invoke({
        targetId: "north",
        pluginId: "counter",
        method: "fail",
        input: {},
      });
      throw new Error("Expected service failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(JSON.stringify(error)).not.toContain("private-database-password");
      expect(statuses.at(-1)).toBe(503);
    }
  } finally {
    await app.stop();
  }
});

test("borrowed running targets remain usable and are neither started again nor stopped by Console", async () => {
  const externalAuth = authentication();
  const externalCounter = counter("external", externalAuth.plugin);
  const borrowed = await startApp(
    defineApp({ plugins: [externalAuth.plugin, externalCounter.plugin] })
  );
  const hostAuth = authentication();
  const consolePlugin = createConsolePlugin({
    authentication: hostAuth.plugin,
    management: true,
    binding: bound,
    targets: [{ ...target("external", externalCounter), running: borrowed }],
  });
  const host = await startApp(
    defineApp({ plugins: [hostAuth.plugin, consolePlugin] })
  );
  try {
    const rpc = client(host.get(consolePlugin));
    const catalog = await rpc.catalog({});
    const retained = catalog.operations.find(
      (entry) => entry.method === "forbidden"
    )!;
    // This method has no business actor context, isolating borrowed lifetime from cross-Auth policy.
    await expect(
      rpc.invoke({
        targetId: "external",
        pluginId: "external",
        method: "fail",
        input: {},
      })
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await host.stop();
    expect(externalCounter.state).toMatchObject({ setups: 1, cleanups: 0 });
    expect(borrowed.get(externalCounter.plugin)).toBeDefined();
    // Closing Console revokes retained handles, not the borrowed application.
    await expect(
      rpc.invoke({
        targetId: "external",
        key: retained.key,
        input: {},
      })
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  } finally {
    await host.stop();
    await borrowed.stop();
  }
  expect(externalCounter.state.cleanups).toBe(1);
});

test("workspace revisions and expected subject fail before dispatch; asset authorization uses the same mount", async () => {
  const auth = authentication();
  const instance = counter("counter", auth.plugin);
  const installed = mount(instance);
  let assetCalls = 0;
  const page: ConsoleMount = {
    ...installed,
    descriptor: {
      ...installed.descriptor,
      requirements: [
        ...installed.descriptor.requirements,
        {
          ...installed.descriptor.requirements[0]!,
          service_id: "closed",
          available: false,
          required: false,
        },
      ],
    },
    services: {
      counter: {
        manage: instance.manage,
        operations: [instance.read, instance.write],
      },
      closed: { manage: instance.manage, operations: [instance.read] },
    },
    asset: async (path) => {
      assetCalls += 1;
      return installed.asset(path);
    },
  };
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    management: true,
    canWrite: () => true,
    binding: (...args) => ({
      ...bound(...args),
      confirm: () => true,
      approve: () => true,
    }),
    targets: [{ ...target("north", instance), mounts: [page] }],
  });
  const app = await startApp(
    defineApp({ plugins: [auth.plugin, instance.plugin, consolePlugin] })
  );
  try {
    const service = app.get(consolePlugin);
    const headers = {
      authorization: "Bearer alice",
      "x-lenso-page-owner": "counter",
      "x-lenso-page-revision": "1",
      "x-lenso-page-implementation": "a".repeat(64),
      "x-lenso-expected-subject": "alice",
    };
    const input = {
      mountId: "counter",
      service: "counter",
      operation: "read",
      input: { label: "ok" },
    };
    expect(
      await client(service, headers).workspace.invoke(input)
    ).toMatchObject({ subject: "alice" });
    await expect(
      client(service, headers).workspace.invoke({
        ...input,
        operation: "write",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      client(service, headers).workspace.invoke({ ...input, service: "closed" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(instance.state.value).toBe(0);
    await expect(
      client(service, {
        ...headers,
        "x-lenso-page-revision": "stale",
      }).workspace.invoke(input)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      client(service, {
        ...headers,
        "x-lenso-expected-subject": "bob",
      }).workspace.invoke(input)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(instance.state.calls).toBe(1);
    const request = () =>
      new Request(`${origin}${page.descriptor.module}`, { headers });
    const assetResponse = await service.fetch(request());
    expect(assetResponse?.status).toBe(200);
    expect(assetCalls).toBe(1);
    auth.state.north = false;
    const deniedAssetResponse = await service.fetch(request());
    expect(deniedAssetResponse?.status).toBe(403);
    expect(assetCalls).toBe(1);
  } finally {
    await app.stop();
  }
});

// A target selection snapshot alone does not freeze its narrower workspace
// subset. An optional requirement must not become writable through a live array.
test("workspace admission does not expand when the caller mutates its service subset", async () => {
  const auth = authentication();
  const instance = counter("counter", auth.plugin);
  const admitted: Operation[] = [instance.read];
  const original = mount(instance);
  const installed: ConsoleMount = {
    ...original,
    services: {
      counter: { ...original.services.counter!, operations: admitted },
    },
  };
  installed.descriptor.requirements[0]!.required = false;
  installed.descriptor.requirements[0]!.operations = ["read", "write"];
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    management: true,
    targets: [{ ...target("north", instance), mounts: [installed] }],
    canWrite: () => true,
    binding: (...args) => ({
      ...bound(...args),
      confirm: () => true,
      approve: () => true,
    }),
  });
  const app = await startApp(
    defineApp({ plugins: [auth.plugin, instance.plugin, consolePlugin] })
  );
  try {
    admitted.push(instance.write);
    const rpc = client(app.get(consolePlugin), {
      authorization: "Bearer alice",
      "x-lenso-page-owner": instance.plugin.id,
      "x-lenso-page-revision": installed.descriptor.revision,
      "x-lenso-page-implementation": installed.descriptor.implementationId,
    });
    await expect(
      rpc.workspace.invoke({
        mountId: installed.descriptor.id,
        service: "counter",
        operation: "write",
        input: { label: "must not run" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(instance.state.value).toBe(0);
    expect(instance.state.calls).toBe(0);
  } finally {
    await app.stop();
  }
});

test("management is opt-in, page files do not install mounts, and REST sessions use real Auth projection", async () => {
  const auth = authentication("/admin/auth");
  const instance = counter("counter", auth.plugin);
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    targets: [target("north", instance)],
    binding: bound,
    config: {
      contract: consoleConfiguration,
      sources: [
        valuesSource(
          { management: true, apiBasePath: "/old-api" },
          { id: "base" }
        ),
        valuesSource(
          {
            management: false,
            apiBasePath: "/admin/api",
            shellBasePath: "/admin",
            authBasePath: "/admin/auth",
          },
          { id: "override" }
        ),
      ],
    },
    shellMatches: (request) => new URL(request.url).pathname === "/admin",
    shell: async (request) =>
      new URL(request.url).pathname === "/admin"
        ? new Response("<main>provided shell</main>")
        : undefined,
  });
  const app = await startApp(
    defineApp({ plugins: [auth.plugin, instance.plugin, consolePlugin] })
  );
  try {
    const service = app.get(consolePlugin);
    const get = (path: string, headers?: HeadersInit) =>
      service.fetch(
        new Request(`${origin}${path}`, {
          headers: headers ?? { authorization: "Bearer alice" },
        })
      );
    const unauthenticatedSession = await get(
      "/admin/api/console/v1/session",
      {}
    );
    expect(unauthenticatedSession?.status).toBe(401);
    const session = await get("/admin/api/console/v1/session");
    expect(session?.headers.get("x-lenso-read-scope")).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(await session?.json()).toMatchObject({
      mode: "required",
      authenticated: true,
      subject: "alice",
      administrator: false,
      assistant_enabled: false,
      human_management_enabled: false,
      management_enabled: false,
    });
    const pages = await get("/admin/api/console/v1/pages");
    expect(await pages?.json()).toEqual({
      schema: "console.page-catalog/1",
      mounts: [],
    });
    const surfaces = await get("/admin/api/console/v1/surfaces");
    expect(await surfaces?.json()).toEqual({
      schema: "console.page-catalog/1",
      mounts: [],
    });
    await expect(
      client(service, { authorization: "Bearer alice" }, "/admin/api").catalog(
        {}
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const authMethods = await get("/admin/auth/methods", {});
    expect(await authMethods?.json()).toEqual({
      methods: [],
    });
    const shell = await get("/admin", {});
    expect(await shell?.text()).toContain("provided shell");
    const { admitted } = auth.state;
    expect(await get("/business")).toBeUndefined();
    expect(await get("/admin/business")).toBeUndefined();
    expect(auth.state.admitted).toBe(admitted);
  } finally {
    await app.stop();
  }
});

// Manage's own redaction test cannot prove the separate Console discovery routes
// hide the same metadata or that their display identifiers never drive dispatch.
test("discovery redacts metadata while opaque catalog keys retain exact dispatch", async () => {
  const previous = process.env.LENSO_CONSOLE_TEST_METADATA_SECRET;
  process.env.LENSO_CONSOLE_TEST_METADATA_SECRET = "original-target";
  const auth = authentication();
  const instance = counter("original-target", auth.plugin);
  const installed = mount(instance, "workspace");
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    management: true,
    binding: bound,
    targets: [
      {
        ...target("north", instance),
        label: "original-target",
        mounts: [installed],
      },
    ],
  });
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    app = await startApp(
      defineApp({ plugins: [auth.plugin, instance.plugin, consolePlugin] })
    );
    const service = app.get(consolePlugin);
    const rpc = client(service);
    const catalog = await rpc.catalog({});
    const read = catalog.operations.find((entry) => entry.method === "read")!;
    expect(read.pluginId).toBe("[REDACTED]");
    expect(
      await rpc.invoke({
        targetId: "north",
        key: read.key,
        input: { label: "ok" },
      })
    ).toMatchObject({ id: "[REDACTED]", subject: "alice" });
    expect(instance.state.calls).toBe(1);
    expect(
      JSON.stringify(await rpc.plugins({ targetId: "north" }))
    ).not.toContain("original-target");
    expect(JSON.stringify(await rpc.targets())).not.toContain(
      "original-target"
    );
    const pages = await service.fetch(
      new Request(`${origin}/api/console/v1/pages`, {
        headers: { authorization: "Bearer alice" },
      })
    );
    expect(await pages?.text()).not.toContain("original-target");
  } finally {
    await app?.stop();
    if (previous === undefined) {
      delete process.env.LENSO_CONSOLE_TEST_METADATA_SECRET;
    } else {
      process.env.LENSO_CONSOLE_TEST_METADATA_SECRET = previous;
    }
  }
});

test("mounted aliases isolate same-name services and snapshot exact owner methods", async () => {
  const auth = authentication();
  const owner = definePlugin({
    id: "owner",
    setup: () => ({
      "orders.read": async () => ({ service: "orders" }),
      "inventory.read": async () => ({ service: "inventory" }),
    }),
  });
  const operations = (["orders.read", "inventory.read"] as const).map(
    (method) =>
      defineOperation({
        plugin: owner,
        method,
        input: z.strictObject({}),
        effect: "read",
        description: `Read ${method}`,
      })
  );
  const manage = defineManage({ plugin: owner, operations });
  const original = mount(counter("unused", auth.plugin), "services");
  const ordersAliases = { read: "orders.read" };
  const page: ConsoleMount = {
    ...original,
    descriptor: {
      ...original.descriptor,
      owner: { instance: owner.id, source: "application", trusted: true },
      requirements: ["orders", "inventory"].map((id) => ({
        ...original.descriptor.requirements[0]!,
        service_id: id,
      })),
    },
    services: {
      orders: {
        manage,
        operations: [operations[0]!],
        operationAliases: ordersAliases,
      },
      inventory: {
        manage,
        operations: [operations[1]!],
        operationAliases: { read: "inventory.read" },
      },
    },
  };
  const boundMethods: string[] = [];
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    management: true,
    targets: [
      {
        id: "north",
        label: "North",
        tenantId: "north",
        plugins: [owner],
        manage: [manage],
        mounts: [page],
      },
    ],
    binding: (...args) => {
      boundMethods.push(args[4].operation!);
      return bound(...args);
    },
  });
  const app = await startApp(
    defineApp({ plugins: [auth.plugin, owner, consolePlugin] })
  );
  try {
    ordersAliases.read = "inventory.read";
    const service = app.get(consolePlugin);
    const catalog = await service.fetch(
      new Request(`${origin}/api/console/v1/pages`, {
        headers: { authorization: "Bearer alice" },
      })
    );
    expect(catalog!.status).toBe(200);
    const catalogResult = await catalog!.json();
    expect(
      catalogResult.mounts[0].requirements.map(
        (requirement: { operations: string[] }) => requirement.operations
      )
    ).toEqual([["read"], ["read"]]);
    const rpc = client(service, {
      authorization: "Bearer alice",
      "x-lenso-page-owner": owner.id,
      "x-lenso-page-revision": "1",
      "x-lenso-page-implementation": page.descriptor.implementationId,
    });
    for (const id of ["orders", "inventory"]) {
      expect(
        await rpc.workspace.invoke({
          mountId: "services",
          service: id,
          operation: "read",
          input: {},
        })
      ).toEqual({ service: id });
    }
    expect(boundMethods).toEqual(["orders.read", "inventory.read"]);
    await expect(
      rpc.workspace.invoke({
        mountId: "services",
        service: "orders",
        operation: "inventory.read",
        input: {},
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  } finally {
    await app.stop();
  }
});

test("startup refuses detached Manage owners, unadmitted workspace operations and overlapping route owners", async () => {
  const auth = authentication();
  const instance = counter("counter", auth.plugin);
  const detached = counter("counter", auth.plugin);
  const other = counter("second-counter", auth.plugin);
  const reasons = [
    "Manage must bind an explicitly selected exact plugin.",
    "Required workspace services must be explicitly admitted.",
    "Console workspace route ownership overlaps.",
    "Workspace requirements must uniquely bind their declared service owner.",
    "Workspace operation aliases must uniquely name admitted methods without collisions.",
  ];
  for (const [index, targets] of [
    [{ ...target("north", instance), manage: [detached.manage] }],
    [
      {
        ...target("north", instance),
        mounts: [
          {
            ...mount(instance),
            services: { counter: { manage: instance.manage, operations: [] } },
          },
        ],
      },
    ],
    [
      {
        ...target("north", instance),
        mounts: [
          mount(instance),
          {
            ...mount(instance, "other"),
            descriptor: {
              ...mount(instance, "other").descriptor,
              basePath: "/counter/nested",
            },
          },
        ],
      },
    ],
    // A declared owner service must not dispatch the other installed plugin's
    // same-named method behind a target-bound management shortcut.
    [
      {
        ...target("north", instance),
        plugins: [instance.plugin, other.plugin],
        manage: [instance.manage, other.manage],
        mounts: [
          {
            ...mount(instance),
            services: {
              counter: { manage: other.manage, operations: [other.read] },
            },
          },
        ],
      },
    ],
    [
      {
        ...target("north", instance),
        mounts: [
          {
            ...mount(instance),
            services: {
              counter: {
                manage: instance.manage,
                operations: [instance.read],
                operationAliases: { read: "write" },
              },
            },
          },
        ],
      },
    ],
  ].entries()) {
    const consolePlugin = createConsolePlugin({
      authentication: auth.plugin,
      targets,
      binding: bound,
    });
    const before = [instance, other].map(({ state }) => ({ ...state }));
    let rejected: unknown;
    try {
      const app = await startApp(
        defineApp({
          plugins: [auth.plugin, instance.plugin, other.plugin, consolePlugin],
        })
      );
      await app.stop();
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toBeInstanceOf(Error);
    const messages: string[] = [];
    const seen = new Set<Error>();
    while (rejected instanceof Error && !seen.has(rejected)) {
      seen.add(rejected);
      messages.push(rejected.message);
      rejected = rejected.cause;
    }
    expect(messages).toContain(reasons[index]!);
    for (const [position, { state }] of [instance, other].entries()) {
      expect(state.setups - before[position]!.setups).toBe(1);
      expect(state.cleanups - before[position]!.cleanups).toBe(1);
    }
    expect(detached.state.setups).toBe(0);
  }
});

// Existing tests exercise Manage only, not the Shell's locale endpoints or the
// separate global-default permission. Personal writes must never accept account IDs.
test("Shell locale routes separate personal preferences from independently authorized defaults", async () => {
  const auth = authentication();
  let globalDefault: "en" | "zh-CN" | null = "en";
  const preferences = new Map<string, "global" | "en" | "zh-CN">();
  let unavailable = false;
  const provider: Plugin<ConsoleLocaleStore> = {
    id: "locale-store",
    setup: () => ({
      async readDefault() {
        if (unavailable) {
          throw new Error("private-storage-location");
        }
        return globalDefault;
      },
      async readPreference(identity) {
        return (
          preferences.get(
            JSON.stringify([identity.actor.realmId, identity.actor.subjectId])
          ) ?? "global"
        );
      },
      async writePreference(identity, preference) {
        preferences.set(
          JSON.stringify([identity.actor.realmId, identity.actor.subjectId]),
          preference
        );
      },
      async writeDefault(_identity, locale) {
        globalDefault = locale;
      },
    }),
  };
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    targets: [],
    binding: bound,
    apiBasePath: "/ops/api",
    locale: provider,
    localeResource: {
      action: "configure",
      targetId: "north",
      tenantId: "north",
      pluginId: provider.id,
      operation: "console.locale.default.manage",
    },
  });
  const app = await startApp({
    plugins: [auth.plugin, provider, consolePlugin],
  });
  const service = app.get(consolePlugin);
  const request = (suffix: string, body?: unknown, authenticated = true) =>
    service.fetch(
      new Request(`${origin}/ops/api/console/v1/locale${suffix}`, {
        method: body === undefined ? "GET" : "PUT",
        headers: {
          ...(authenticated ? { authorization: "Bearer alice" } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    );
  try {
    const publicSnapshot = await request("", undefined, false);
    expect(await publicSnapshot?.json()).toMatchObject({
      global_default: "en",
      preference: "global",
      can_manage_default: false,
      available: true,
    });
    const personal = await request("/preference", { preference: "zh-CN" });
    expect(personal?.status).toBe(200);
    expect(await personal?.json()).toMatchObject({
      global_default: "en",
      preference: "zh-CN",
      can_manage_default: false,
    });
    const deniedDefault = await request("/default", { locale: null });
    expect(deniedDefault?.status).toBe(403);
    expect(globalDefault).toBe("en");
    const injectedSubject = await request("/preference", {
      preference: "en",
      subject: "bob",
    });
    expect(injectedSubject?.status).toBe(400);
    const anonymousWrite = await request(
      "/preference",
      { preference: "en" },
      false
    );
    expect(anonymousWrite?.status).toBe(401);
    auth.state.localeDefault = true;
    const permittedDefault = await request("/default", { locale: null });
    expect(permittedDefault?.status).toBe(200);
    const currentSnapshot = await request("");
    expect(await currentSnapshot?.json()).toMatchObject({
      global_default: null,
      preference: "zh-CN",
      can_manage_default: true,
    });
    auth.state.localeDefault = false;
    const revokedDefault = await request("/default", { locale: "en" });
    expect(revokedDefault?.status).toBe(403);
    unavailable = true;
    const failure = await request("");
    expect(failure?.status).toBe(503);
    expect(await failure?.text()).not.toContain("private-storage-location");
    // An unawaited public snapshot escapes the Fetch error sanitizer entirely.
    const publicFailure = await request("", undefined, false);
    expect(publicFailure?.status).toBe(503);
    expect(publicFailure?.headers.get("cache-control")).toBe("no-store");
    expect(await publicFailure?.text()).not.toContain(
      "private-storage-location"
    );
    unavailable = false;
    auth.state.enabled = false;
    const invalidCredential = await request("");
    expect(invalidCredential?.status).toBe(401);
  } finally {
    await app.stop();
  }
});

// A constant empty surfaces response and default-prefix-only tests cannot prove
// declared global contributions load through the exact same admission as pages.
test("deployed catalog assets, target binding and global surfaces use declared mounts", async () => {
  const auth = authentication();
  const instance = counter("counter", auth.plugin);
  const install = (id: string, placement: ConsoleMount["placement"]) => {
    const existing = mount(instance, id);
    return {
      ...existing,
      placement,
      descriptor: {
        ...existing.descriptor,
        module: existing.descriptor.module.replace("/api/", "/ops/api/"),
      },
    };
  };
  const page = install("counter", "page");
  const global = install("global-counter", "global");
  const consolePlugin = createConsolePlugin({
    authentication: auth.plugin,
    targets: [{ ...target("north", instance), mounts: [page, global] }],
    management: true,
    apiBasePath: "/ops/api",
    binding: bound,
  });
  const app = await startApp({
    plugins: [auth.plugin, instance.plugin, consolePlugin],
  });
  const service = app.get(consolePlugin);
  const get = (path: string) =>
    service.fetch(
      new Request(`${origin}${path}`, {
        headers: { authorization: "Bearer alice" },
      })
    );
  try {
    const pageResponse = await get("/ops/api/console/v1/pages");
    const pages = await pageResponse!.json();
    expect(pages.mounts).toHaveLength(1);
    expect(pages.mounts[0]).toMatchObject({
      id: "counter",
      targetId: "north",
      module: page.descriptor.module,
    });
    const surfaceResponse = await get("/ops/api/console/v1/surfaces");
    const surfaces = await surfaceResponse!.json();
    expect(surfaces.mounts.map((entry: { id: string }) => entry.id)).toEqual([
      "global-counter",
    ]);
    const moduleResponse = await get(page.descriptor.module);
    expect(moduleResponse?.status).toBe(200);
    const wrongDigest = await get(
      page.descriptor.module.replace("a".repeat(64), "b".repeat(64))
    );
    expect(wrongDigest?.status).toBe(404);
    expect(
      await get(page.descriptor.module.replace("/ops/api/", "/api/"))
    ).toBeUndefined();
    auth.state.north = false;
    const revokedSurfaces = await get("/ops/api/console/v1/surfaces");
    const revokedCatalog = await revokedSurfaces!.json();
    expect(revokedCatalog.mounts).toEqual([]);
    const deniedModule = await get(global.descriptor.module);
    expect(deniedModule?.status).toBe(403);
  } finally {
    await app.stop();
  }
});

test("real Framework Auth re-verifies subscriptions after asynchronous DTO validation", async () => {
  const cases = [
    { change: { enabled: false }, code: "UNAUTHORIZED", status: 401 },
    { change: { north: false }, code: "FORBIDDEN", status: 403 },
    {
      change: { revisionOverride: "changed" },
      code: "PRECONDITION_FAILED",
      status: 412,
    },
    {
      change: { kind: "service" as const },
      code: "PRECONDITION_FAILED",
      status: 412,
    },
  ];
  for (const { change, code, status } of cases) {
    const auth = authentication();
    auth.state.revisionOverride = "initial";
    let entered!: () => void;
    const validating = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let opened = 0;
    let finalized = 0;
    const plugin = {
      id: "events",
      requires: [auth.plugin],
      setup(context: Parameters<Plugin["setup"]>[0]) {
        const authenticationService = context.get(auth.plugin);
        return {
          async *watch(
            _input: Record<string, never>,
            evidence: { identity: ConsoleIdentity; resource: ConsoleResource }
          ) {
            await authenticationService.enforce(
              evidence.identity,
              evidence.resource
            );
            expect(evidence.identity.actor).toMatchObject({
              subjectId: "alice",
              realmId: "console-fixture",
              audience: "console",
              kind: "user",
            });
            expect(evidence.resource).toMatchObject({
              targetId: "north",
              tenantId: "north",
              pluginId: "events",
              operation: "watch",
            });
            opened += 1;
            try {
              yield { seq: 1 };
              yield { seq: 2 };
            } finally {
              finalized += 1;
            }
          },
        };
      },
    };
    const watch = defineOperation({
      plugin,
      method: "watch",
      input: z.strictObject({}),
      description: "Watch authenticated events.",
      effect: "read",
      context: true,
    });
    const manage = defineManage({ plugin, operations: [] });
    const schema = z.strictObject({ seq: z.number() });
    const digest = "a".repeat(64);
    const page: ConsoleMount = {
      descriptor: {
        apiMajor: 1,
        id: "events-page",
        title: "Events",
        subject: { kind: "console" },
        owner: { instance: plugin.id, source: "application", trusted: true },
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
            operations: ["watch"],
            available: true,
            required: true,
            source: "owner",
          },
        ],
      },
      services: {
        events: {
          manage,
          operations: [],
          streams: [
            {
              operation: watch,
              output: {
                "~standard": {
                  version: 1,
                  vendor: "auth-regression",
                  async validate(value) {
                    const result = await schema["~standard"].validate(value);
                    if ("value" in result && result.value.seq === 2) {
                      entered();
                      await barrier;
                    }
                    return result;
                  },
                },
              },
            },
          ],
        },
      },
      asset: async () => undefined,
    };
    const consolePlugin = createConsolePlugin({
      authentication: auth.plugin,
      binding: bound,
      management: true,
      targets: [
        {
          id: "north",
          label: "North",
          tenantId: "north",
          plugins: [plugin],
          manage: [manage],
          mounts: [page],
        },
      ],
    });
    const app = await startApp(
      defineApp({ plugins: [auth.plugin, plugin, consolePlugin] })
    );
    try {
      const service = app.get(consolePlugin);
      const headers = {
        authorization: "Bearer alice",
        "x-lenso-page-owner": plugin.id,
        "x-lenso-page-revision": "1",
        "x-lenso-page-implementation": digest,
        "x-lenso-expected-subject": "alice",
      };
      const response = await service.fetch(
        new Request(`${origin}/api/console/v1/pages`, { headers })
      );
      const catalog = await response!.json();
      const services = createConsoleWorkspaceServices({
        origin,
        mount: catalog.mounts[0],
        headers,
        async fetch(input, init) {
          return (
            (await service.fetch(new Request(input, init))) ??
            new Response(null, { status: 404 })
          );
        },
      });
      const events = services.subscribe("events", "watch", {});
      const iterator = events[Symbol.asyncIterator]();
      expect(await iterator.next()).toEqual({ done: false, value: { seq: 1 } });
      expect(opened).toBe(1);
      const next = iterator.next();
      await validating;
      Object.assign(auth.state, change);
      release();
      await expect(next).rejects.toMatchObject({ code, status });
      expect(finalized).toBe(1);
    } finally {
      release();
      await app.stop();
    }
    expect(finalized).toBe(1);
  }
});
