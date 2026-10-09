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
import { defineApp, startApp, valuesSource, type Plugin } from "@lenso/core";
import { defineOperation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { z } from "zod";

import { createConsoleAuthentication } from "../src/auth";
import { consoleConfiguration, createConsolePlugin } from "../src/index";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
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
  const state = { enabled: true, north: true, admitted: 0 };
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
                ? { status: "verified", subjectId: token }
                : { status: "rejected" };
            },
          })
        )
      );
      context.onCleanup(() => auth.close());
      access = auth
        .for(audience("console" as string))
        .memberships(async (_subject, resource: ConsoleResource) =>
          state.north && resource.tenantId === "north"
            ? { allowed: true as const }
            : null
        );
      const service = createConsoleAuthentication({
        access,
        policy: ({ membership }) => membership.allowed,
        requestPolicy: { origin, credentialMode: "bearer" },
        evidence: (request) =>
          request.headers.get("authorization")?.slice(7) ?? null,
        permissionRevision: () => String(state.north),
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
  const state = { setups: 0, cleanups: 0, value: 0, calls: 0 };
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
          throw new Error("private-database-password");
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
  statuses?: number[]
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
    expect(
      catalog.operations.some((entry) => entry.method === "unselected")
    ).toBe(false);
    expect(
      await rpc.invoke({
        targetId: "right",
        pluginId: right.plugin.id,
        method: "read",
        input: { label: " ok " },
      })
    ).toEqual({ id: "counter/right", value: 0, label: "ok", subject: "alice" });
    expect(left.state.calls).toBe(0);
    expect(right.state.calls).toBe(1);
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
    // This method has no business actor context, isolating borrowed lifetime from cross-Auth policy.
    await expect(
      client(host.get(consolePlugin)).invoke({
        targetId: "external",
        pluginId: "external",
        method: "fail",
        input: {},
      })
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await host.stop();
    expect(externalCounter.state).toMatchObject({ setups: 1, cleanups: 0 });
    expect(borrowed.get(externalCounter.plugin)).toBeDefined();
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

test("startup refuses detached Manage owners, unadmitted workspace operations and overlapping route owners", async () => {
  const auth = authentication();
  const instance = counter("counter", auth.plugin);
  const detached = counter("counter", auth.plugin);
  for (const targets of [
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
  ]) {
    const consolePlugin = createConsolePlugin({
      authentication: auth.plugin,
      targets,
      binding: bound,
    });
    await expect(
      startApp(
        defineApp({ plugins: [auth.plugin, instance.plugin, consolePlugin] })
      )
    ).rejects.toBeDefined();
  }
});
