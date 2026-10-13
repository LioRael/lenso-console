import { expect, test } from "bun:test";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import type { ConsoleResource } from "@lenso/console";
import { createConsoleAuthentication } from "@lenso/console/auth";
import { definePlugin, startApp } from "@lenso/core";
import { createManageAdapter } from "@lenso/manage";
import type { RuntimeService } from "@lenso/runtime";

import { projectRuntimeSnapshot } from "../src/client";
import { createConsoleRuntimeInspection } from "../src/server";

test("status requires current administrator evidence, rejects extra input and selects no arbitrary calls", async () => {
  let active = true;
  let allowed = true;
  let administrator = true;
  let reads = 0;
  let afterRead: (() => void) | undefined;
  const origin = "https://runtime.example.test";
  const auth = createAuth(
    realm(
      "operators",
      defineSource({
        verify: async (token: string | null) =>
          token === "fixture" && active
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
    policy: () => allowed,
    requestPolicy: { origin, credentialMode: "bearer" },
    evidence: (request) =>
      request.headers.get("authorization")?.slice(7) ?? null,
    permissionRevision: () => "fixture",
    session: () => ({ administrator, workspace_ids: [] }),
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
            reads += 1;
            afterRead?.();
            return { services: [], calls: [], recent: [] };
          },
        },
      }) as unknown as RuntimeService,
  });
  const inspection = createConsoleRuntimeInspection({
    id: "runtime",
    runtime,
    authentication: authenticationPlugin,
    targetId: "operator-app",
    tenantId: "local",
  });
  const app = await startApp({
    plugins: [runtime, authenticationPlugin, inspection.plugin],
  });
  try {
    const request = new Request(origin, {
      headers: { authorization: "Bearer fixture" },
    });
    const identity = await authentication.authenticate(request);
    const resource: ConsoleResource = {
      action: "invoke",
      pluginId: "runtime",
      operation: "status",
      targetId: "operator-app",
      tenantId: "local",
    };
    const adapter = createManageAdapter({
      running: app,
      plugins: [inspection.plugin],
      operations: inspection.operations,
      binding: () => ({
        context: { evidence: { identity, request, resource } },
      }),
      canList: () => true,
    });
    const catalog = await adapter.catalog();
    expect(
      catalog.map((operation) => ({
        method: operation.method,
        effect: operation.effect,
      }))
    ).toEqual([{ method: "status", effect: "read" }]);
    expect(await adapter.invoke("runtime", "status", {})).toEqual({
      services: [],
      calls: [],
      recent: [],
    });
    await expect(
      adapter.invoke("runtime", "status", { principal: "administrator" })
    ).rejects.toThrow();
    await expect(adapter.invoke("runtime", "call", {})).rejects.toThrow();
    expect(reads).toBe(1);
    allowed = false;
    await expect(adapter.invoke("runtime", "status", {})).rejects.toThrow();
    allowed = true;
    administrator = false;
    await expect(adapter.invoke("runtime", "status", {})).rejects.toThrow();
    administrator = true;
    resource.targetId = "unselected";
    await expect(adapter.invoke("runtime", "status", {})).rejects.toThrow();
    resource.targetId = "operator-app";
    active = false;
    await expect(adapter.invoke("runtime", "status", {})).rejects.toThrow();
    active = true;
    expect(reads).toBe(1);
    afterRead = () => {
      allowed = false;
    };
    await expect(adapter.invoke("runtime", "status", {})).rejects.toThrow();
    expect(reads).toBe(2);
  } finally {
    await app.stop();
    await auth.close();
  }
});

test("snapshot projection removes payloads and rejects unbounded recent metadata", () => {
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
  expect(() =>
    projectRuntimeSnapshot({
      services: [],
      calls: [],
      recent: Array.from({ length: 65 }, () => row),
    })
  ).toThrow();
});
