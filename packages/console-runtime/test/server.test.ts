import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import type { ConsoleResource } from "@lenso/console";
import { createConsoleAuthentication } from "@lenso/console/auth";
import { definePlugin, startApp } from "@lenso/core";
import { createManageAdapter } from "@lenso/manage";
import type { RuntimeService } from "@lenso/runtime";
import type { Contract } from "@lenso/runtime-sdk/schema";

import {
  projectRuntimeSnapshot,
  runtimeCatalogueSchema,
  runtimeInspectionLimits,
} from "../src/client";
import { readRuntimeBuildManifest } from "../src/manifest";
import {
  createConsoleRuntimeInspection,
  type ConsoleRuntimeGreetingTrial,
} from "../src/server";

const target = {
  namespace: "example",
  service: "greeting",
  contractVersion: "1",
};
const greetingTrial = { ...target, sideEffectFree: true as const };
const greetingContract = {
  version: "1",
  methods: {
    greet: {
      mode: "unary",
      input: {
        type: "object",
        properties: { name: { type: "string", minLength: 1, maxLength: 80 } },
        required: ["name"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          message: { type: "string", minLength: 1, maxLength: 512 },
        },
        required: ["message"],
        additionalProperties: false,
      },
      error: { type: "null" },
    },
  },
} satisfies Contract;

function buildManifest() {
  return {
    format: "lenso-runtime-build-manifest/1",
    services: [
      {
        namespace: target.namespace,
        service: target.service,
        contract: structuredClone(greetingContract),
      },
    ],
  };
}

async function withManifest(
  run: (path: string) => Promise<void>,
  value: unknown = buildManifest()
) {
  const directory = await mkdtemp(join(tmpdir(), "console-runtime-manifest-"));
  const path = join(directory, "manifest.json");
  try {
    await writeFile(path, JSON.stringify(value));
    await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function fixture(
  options: {
    manifestPath?: string;
    greetingTrial?: ConsoleRuntimeGreetingTrial;
  } = {}
) {
  const state = {
    active: true,
    allowed: true,
    administrator: true,
    targetId: "operator-app",
    tenantId: "local",
    operation: undefined as string | undefined,
    reads: 0,
    output: { message: "Hello, Ada!" } as unknown,
    callError: undefined as unknown,
    afterRead: undefined as (() => void) | undefined,
    afterCall: undefined as (() => void) | undefined,
  };
  const calls: {
    target: unknown;
    method: string;
    input: unknown;
    options: Record<string, unknown>;
  }[] = [];
  const origin = "https://runtime.example.test";
  const auth = createAuth(
    realm(
      "operators",
      defineSource({
        verify: async (token: string | null) =>
          token === "fixture" && state.active
            ? { status: "verified", subjectId: "operator", kind: "user" }
            : { status: "rejected" },
      })
    )
  );
  const authentication = createConsoleAuthentication({
    access: auth
      .for(audience("console"))
      .memberships(async (_actor, resource: ConsoleResource) =>
        resource.tenantId === "local" ? {} : null
      ),
    policy: () => state.allowed,
    requestPolicy: { origin, credentialMode: "bearer" },
    evidence: (request) =>
      request.headers.get("authorization")?.slice(7) ?? null,
    permissionRevision: () => "fixture",
    session: () => ({ administrator: state.administrator, workspace_ids: [] }),
  });
  const authenticationPlugin = definePlugin({
    id: "authentication",
    setup: () => authentication,
  });
  const runtime = definePlugin({
    id: "runtime-host",
    setup: () =>
      ({
        clients: undefined,
        host: {
          async status() {
            state.reads += 1;
            state.afterRead?.();
            return { services: [], calls: [], recent: [] };
          },
          async call(
            callTarget: unknown,
            method: string,
            input: unknown,
            callOptions: Record<string, unknown>
          ) {
            calls.push({
              target: callTarget,
              method,
              input,
              options: callOptions,
            });
            state.afterCall?.();
            if (state.callError) {
              throw state.callError;
            }
            return state.output;
          },
        },
      }) as unknown as RuntimeService,
  });
  let app: Awaited<ReturnType<typeof startApp>>;
  let inspection: ReturnType<typeof createConsoleRuntimeInspection>;
  try {
    inspection = createConsoleRuntimeInspection({
      id: "runtime",
      runtime,
      authentication: authenticationPlugin,
      targetId: "operator-app",
      tenantId: "local",
      ...options,
    });
    app = await startApp({
      plugins: [runtime, authenticationPlugin, inspection.plugin],
    });
  } catch (error) {
    await auth.close();
    throw error;
  }
  const controller = new AbortController();
  const request = new Request(origin, {
    headers: { authorization: "Bearer fixture" },
    signal: controller.signal,
  });
  const identity = await authentication.authenticate(request);
  const adapter = createManageAdapter({
    running: app,
    plugins: [inspection.plugin],
    operations: inspection.operations,
    binding: (operation) => ({
      context: {
        evidence: {
          identity,
          request,
          resource: {
            action: "invoke" as const,
            pluginId: "runtime",
            operation: state.operation ?? operation.method,
            targetId: state.targetId,
            tenantId: state.tenantId,
          },
        },
      },
    }),
    canList: () => true,
  });
  return {
    state,
    calls,
    adapter,
    controller,
    request,
    invoke: (method: string, input: unknown = {}) =>
      adapter.invoke("runtime", method, input),
    async close() {
      await app.stop();
      await auth.close();
    },
  };
}

test("default inspection remains read-only and revoked administrator evidence prevents status reads or results", async () => {
  const f = await fixture();
  try {
    const operations = await f.adapter.catalog();
    expect(
      operations.map(({ method, effect }) => ({
        method,
        effect,
      }))
    ).toEqual([
      { method: "status", effect: "read" },
      { method: "catalogue", effect: "read" },
    ]);
    expect(await f.invoke("status")).toEqual({
      services: [],
      calls: [],
      recent: [],
    });
    expect(await f.invoke("catalogue")).toEqual({
      source: "static-build-manifest",
      availability: "unverified",
      configured: false,
      services: [],
      greetingTrial: { enabled: false },
    });
    for (const method of ["call", "greet", "restart", "promote"]) {
      await expect(f.invoke(method)).rejects.toThrow();
    }
    await expect(
      f.invoke("status", { principal: "administrator" })
    ).rejects.toThrow();
    f.state.allowed = false;
    await expect(f.invoke("status")).rejects.toThrow();
    f.state.allowed = true;
    f.state.administrator = false;
    await expect(f.invoke("status")).rejects.toThrow();
    f.state.administrator = true;
    f.state.targetId = "unselected";
    await expect(f.invoke("status")).rejects.toThrow();
    f.state.targetId = "operator-app";
    f.state.tenantId = "unselected";
    await expect(f.invoke("status")).rejects.toThrow();
    f.state.tenantId = "local";
    f.state.active = false;
    await expect(f.invoke("status")).rejects.toThrow();
    f.state.active = true;
    expect(f.state.reads).toBe(1);
    f.state.afterRead = () => {
      f.state.allowed = false;
    };
    await expect(f.invoke("status")).rejects.toThrow();
    expect(f.state.reads).toBe(2);
    expect(f.calls).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test("static catalogue strips host metadata and never treats a declared contract as live availability or invocation authority", async () => {
  const manifest = {
    ...buildManifest(),
    credentials: "private-build-secret",
    services: [
      {
        ...buildManifest().services[0]!,
        endpoint: "private-endpoint",
        environment: { secret: "private-secret" },
      },
    ],
  };
  await withManifest(async (path) => {
    const f = await fixture({ manifestPath: path });
    try {
      const catalogue = runtimeCatalogueSchema.parse(
        await f.invoke("catalogue")
      );
      expect(catalogue).toEqual({
        source: "static-build-manifest",
        availability: "unverified",
        configured: true,
        services: buildManifest().services,
        greetingTrial: { enabled: false },
      });
      expect(JSON.stringify(catalogue)).not.toContain("private-");
      expect(f.state.reads).toBe(0);
      expect(f.calls).toHaveLength(0);
      await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow();
      await expect(
        f.invoke("catalogue", { manifestPath: "/other/path" })
      ).rejects.toThrow();
      catalogue.services[0]!.contract.version = "mutated";
      expect(
        runtimeCatalogueSchema.parse(await f.invoke("catalogue")).services[0]!
          .contract.version
      ).toBe("1");
      f.state.operation = "status";
      await expect(f.invoke("catalogue")).rejects.toThrow();
      f.state.operation = undefined;
      f.state.administrator = false;
      await expect(f.invoke("catalogue")).rejects.toThrow();
    } finally {
      await f.close();
    }
  }, manifest);
});

test("malformed, oversized, deep, duplicated or overpopulated manifests fail closed without revealing their contents", async () => {
  await withManifest(async (path) => {
    const tooManyMethods = buildManifest();
    tooManyMethods.services[0]!.contract.methods = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [
        `method${index}`,
        greetingContract.methods.greet,
      ])
    ) as typeof greetingContract.methods;
    let deep: unknown = {};
    for (let index = 0; index < 25; index += 1) {
      deep = { nested: deep };
    }
    const unsupportedSchema = buildManifest();
    Object.assign(unsupportedSchema.services[0]!.contract.methods.greet.input, {
      default: "private-schema-secret",
    });
    for (const value of [
      "invalid-json-private-secret",
      " ".repeat(runtimeInspectionLimits.manifestBytes + 1),
      JSON.stringify({ ...buildManifest(), metadata: deep }),
      JSON.stringify({
        ...buildManifest(),
        services: Array.from({ length: 65 }, () => buildManifest().services[0]),
      }),
      JSON.stringify({
        ...buildManifest(),
        services: [...buildManifest().services, ...buildManifest().services],
      }),
      JSON.stringify(tooManyMethods),
      JSON.stringify(unsupportedSchema),
    ]) {
      await writeFile(path, value);
      await expect(readRuntimeBuildManifest(path)).rejects.toThrow(
        "Runtime build manifest is invalid or exceeds inspection limits."
      );
    }
  });
});

test("greeting requires explicit side-effect-free acknowledgement and a supplied manifest must match the fixed unary target", async () => {
  await expect(
    fixture({
      greetingTrial: {
        ...greetingTrial,
        sideEffectFree: false,
      } as unknown as ConsoleRuntimeGreetingTrial,
    })
  ).rejects.toThrow();
  await withManifest(async (path) => {
    await expect(
      fixture({
        manifestPath: path,
        greetingTrial: { ...greetingTrial, contractVersion: "other" },
      })
    ).rejects.toThrow("declared unary greet target");
  });
});

test("greeting dispatches only trimmed bounded name input to the host-selected method, contract, deadline and signal", async () => {
  await withManifest(async (path) => {
    const f = await fixture({ manifestPath: path, greetingTrial });
    try {
      expect(
        runtimeCatalogueSchema.parse(await f.invoke("catalogue")).greetingTrial
      ).toEqual({ enabled: true, target, method: "greet", timeoutMs: 2000 });
      const operations = await f.adapter.catalog();
      expect(operations.map(({ method }) => method)).toEqual([
        "status",
        "catalogue",
        "greet",
      ]);
      for (const input of [
        {},
        { name: "" },
        { name: "   " },
        { name: "x".repeat(81) },
        { name: 4 },
        { name: "Ada", method: "delete" },
        { name: "Ada", target: { service: "other" } },
      ]) {
        await expect(f.invoke("greet", input)).rejects.toThrow();
      }
      await expect(f.invoke("delete", { name: "Ada" })).rejects.toThrow();
      expect(f.calls).toHaveLength(0);
      expect(await f.invoke("greet", { name: " Ada " })).toEqual({
        message: "Hello, Ada!",
      });
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]).toEqual({
        target,
        method: "greet",
        input: { name: "Ada" },
        options: {
          signal: f.request.signal,
          timeoutMs: 2000,
          contract: greetingContract.methods.greet,
        },
      });
    } finally {
      await f.close();
    }
  });
});

test("greeting rechecks current administrator, policy and authentication before dispatch and after a backend result", async () => {
  const f = await fixture({ greetingTrial });
  try {
    for (const field of ["active", "allowed", "administrator"] as const) {
      f.state[field] = false;
      await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow();
      f.state[field] = true;
    }
    f.state.operation = "status";
    await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow();
    f.state.operation = undefined;
    f.state.targetId = "other";
    await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow();
    f.state.targetId = "operator-app";
    expect(f.calls).toHaveLength(0);
    for (const field of ["active", "allowed", "administrator"] as const) {
      f.state.afterCall = () => {
        f.state[field] = false;
      };
      await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow();
      f.state[field] = true;
    }
    expect(f.calls).toHaveLength(3);
  } finally {
    await f.close();
  }
});

test("greeting rejects oversized or extra output and replaces backend errors with bounded public messages", async () => {
  const f = await fixture({ greetingTrial });
  try {
    for (const output of [
      { message: "x".repeat(513) },
      { message: "Hello", secret: "private-output" },
      { message: "" },
      "private-output",
    ]) {
      f.state.output = output;
      await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow(
        "Runtime greeting trial returned an invalid result."
      );
    }
    f.state.callError = Object.assign(new Error("private-backend-stack"), {
      details: { secret: "private-detail" },
    });
    await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow(
      "Runtime greeting trial is unavailable."
    );
    f.state.callError = {
      code: "deadline_exceeded",
      message: "private-backend-stack",
    };
    await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow(
      "Runtime greeting trial timed out."
    );
  } finally {
    await f.close();
  }
});

test("cancellation prevents greeting dispatch and suppresses results from a request cancelled while awaiting Runtime", async () => {
  const f = await fixture({ greetingTrial });
  try {
    f.state.afterCall = () => {
      f.controller.abort();
    };
    await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
    expect((f.calls[0]!.options.signal as AbortSignal).aborted).toBe(true);
    await expect(f.invoke("greet", { name: "Ada" })).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  } finally {
    await f.close();
  }
});

test("snapshot projection strips payloads and rejects unbounded service, call, capability and recent metadata", () => {
  const row = {
    id: "1",
    namespace: "orders",
    service: "worker",
    method: "read",
    trace_id: "trace",
    parent_id: null,
    outcome: "error",
    code: "business",
    duration_ms: 12,
    payload: { secret: "not-for-console" },
  };
  const snapshot = projectRuntimeSnapshot({
    services: [],
    calls: [],
    recent: [row],
    output: "not-for-console",
  });
  expect(snapshot.recent[0]).toEqual({
    id: "1",
    namespace: "orders",
    service: "worker",
    method: "read",
    trace_id: "trace",
    parent_id: null,
    outcome: "error",
    code: "business",
    duration_ms: 12,
  });
  const service = {
    namespace: "orders",
    service: "worker",
    instance: "1",
    generation: "1",
    state: "ready",
    contract_version: "1",
    active_calls: 0,
    max_concurrency: 1,
    capabilities: [{ method: "read", mode: "unary" }],
  };
  for (const value of [
    { services: [], calls: [], recent: Array.from({ length: 65 }, () => row) },
    {
      services: Array.from({ length: 257 }, () => service),
      calls: [],
      recent: [],
    },
    {
      services: [],
      calls: Array.from({ length: 1025 }, () => ({
        ...row,
        state: "active",
        remaining_ms: 1,
      })),
      recent: [],
    },
    {
      services: [
        {
          ...service,
          capabilities: Array.from(
            { length: 257 },
            () => service.capabilities[0]
          ),
        },
      ],
      calls: [],
      recent: [],
    },
  ]) {
    expect(() => projectRuntimeSnapshot(value)).toThrow();
  }
});
