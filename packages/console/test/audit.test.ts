import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import {
  createAuditService,
  type AuditPage,
  type AuditScope,
} from "@lenso/audit";
import { createSqliteAuditRepository } from "@lenso/audit/sqlite";
import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import { createConsoleClient } from "@lenso/console-sdk/transport";
import { definePlugin, startApp } from "@lenso/core";
import { createManageAdapter } from "@lenso/manage";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { createConsoleAuthentication } from "../src/auth";
import { createConsoleAuditIntegration } from "../src/integrations/audit";
import { createConsolePlugin } from "../src/plugin";
import type { ConsoleIdentity, ConsoleResource } from "../src/types";

test("Audit binding isolates trusted target scope, pages real rows and rechecks every read", async () => {
  const db = new Database(":memory:");
  const auth = createAuth(
    realm(
      "console-audit",
      defineSource({
        async verify(token: string) {
          return { status: "verified" as const, subjectId: token };
        },
      })
    )
  );
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    db.exec(
      await Bun.file(
        Bun.resolveSync(
          "@lenso/audit/migrations/sqlite/0000_audit.sql",
          import.meta.dir
        )
      ).text()
    );
    const principal = Object.freeze({});
    let allowed = true;
    let reads = 0;
    const scope: AuditScope = { tenantId: "north", scopeId: "workspace" };
    const other = { tenantId: "south", scopeId: "workspace" };
    const service = createAuditService({
      repository: createSqliteAuditRepository(drizzle(db)),
      clock: () => 10,
      authority: {
        async resolve(actor: object, requested, operation) {
          if (actor !== principal || !allowed) {
            throw new Error("denied");
          }
          if (operation === "query") {
            reads += 1;
            if (
              requested.tenantId !== scope.tenantId ||
              requested.scopeId !== scope.scopeId
            ) {
              throw new Error("denied");
            }
          }
          return { kind: "system", systemId: "fixture" };
        },
      },
    });
    const audit = definePlugin({ id: "business-audit", setup: () => service });
    const identity: ConsoleIdentity = {
      actor: await auth.for(audience("console")).required("alice"),
      readScope: "north",
    };
    let resolved = 0;
    const integration = createConsoleAuditIntegration({
      id: "audit-page",
      audit,
      resolve(trusted) {
        resolved += 1;
        expect(trusted.identity.actor.subjectId).toBe(identity.actor.subjectId);
        if (trusted.resource.targetId !== "north-app") {
          throw new Error("unknown target");
        }
        return { principal, scope };
      },
    });
    const ids = [1, 2, 3].map(
      (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`
    );
    for (const [index, id] of ids.entries()) {
      await service.append(
        {
          id,
          occurredAt: index + 1,
          scope,
          action: index === 0 ? "document.remove" : "document.update",
          target: { type: "document", id: "doc-1" },
          result: "success",
          reasonCode: "completed",
          correlationId: "trace-1",
        },
        principal
      );
    }
    await service.append(
      {
        id: ids[2]!,
        occurredAt: 1,
        scope: other,
        action: "document.update",
        target: { type: "document", id: "secret-doc" },
        result: "success",
        reasonCode: "completed",
      },
      principal
    );
    const access = auth
      .for(audience("console"))
      .memberships(async (_actor, resource: ConsoleResource) =>
        resource.tenantId === "north" ? { allowed: true } : null
      );
    const authentication = definePlugin({
      id: "audit-console-auth",
      setup: () =>
        createConsoleAuthentication({
          access,
          policy: ({ membership }) => membership.allowed,
          requestPolicy: {
            origin: "https://console.test",
            credentialMode: "bearer",
          },
          evidence: (request) =>
            request.headers.get("authorization")?.slice(7) ?? "",
          permissionRevision: () => String(allowed),
          session: () => ({ administrator: false, workspace_ids: [] }),
        }),
    });
    const consolePlugin = createConsolePlugin({
      authentication,
      management: true,
      targets: [
        {
          id: "north-app",
          label: "North",
          tenantId: "north",
          plugins: [integration.plugin],
          manage: [integration.manage],
        },
      ],
      binding: integration.binding,
    });
    const plugins = [audit, integration.plugin, authentication, consolePlugin];
    app = await startApp({ plugins });
    const request = new Request("https://console.test/rpc");
    let target = "north-app";
    let tenant = "north";
    const adapter = createManageAdapter({
      running: app,
      plugins,
      operations: integration.operations,
      canList: async () => true,
      binding(operation, input) {
        const resource: ConsoleResource = {
          action: "invoke",
          targetId: target,
          tenantId: tenant,
          pluginId: operation.plugin.id,
          operation: operation.method,
        };
        return integration.binding(
          operation,
          input,
          request,
          identity,
          resource
        );
      },
    });
    const entries = await adapter.catalog();
    expect(entries.map((entry) => entry.method)).toEqual(["query", "get"]);
    expect(integration.plugin.requires).toEqual([audit]);
    for (const input of [
      { scope: other },
      { principal: {} },
      { tenantId: "south" },
    ]) {
      await expect(
        adapter.invoke(integration.plugin.id, "query", input)
      ).rejects.toBeDefined();
    }
    expect(resolved).toBe(0);
    const first = (await adapter.invoke(integration.plugin.id, "query", {
      limit: 2,
    })) as AuditPage;
    expect(first.events.map((event) => event.id)).toEqual([ids[2], ids[1]]);
    expect(first.nextCursor).toEqual({ recordedAt: 10, id: ids[1] });
    const second = (await adapter.invoke(integration.plugin.id, "query", {
      limit: 2,
      cursor: first.nextCursor,
    })) as AuditPage;
    expect(second.events.map((event) => event.id)).toEqual([ids[0]]);
    expect(second.nextCursor).toBeNull();
    const filtered = (await adapter.invoke(integration.plugin.id, "query", {
      action: "document.update",
      target: { type: "document", id: "doc-1" },
      result: "success",
      correlationId: "trace-1",
      recordedFrom: 10,
      recordedTo: 10,
    })) as AuditPage;
    expect(filtered.events).toHaveLength(2);
    expect(
      await adapter.invoke(integration.plugin.id, "get", { id: ids[2] })
    ).toEqual(first.events[0]);
    expect(
      await adapter.invoke(integration.plugin.id, "get", {
        id: crypto.randomUUID(),
      })
    ).toBeNull();
    expect(reads).toBe(5);
    const recorded = await service.query({ scope }, principal);
    expect(recorded.events).toHaveLength(3);
    target = "south-app";
    await expect(
      adapter.invoke(integration.plugin.id, "query", {})
    ).rejects.toBeDefined();
    target = "north-app";
    tenant = "south";
    await expect(
      adapter.invoke(integration.plugin.id, "query", {})
    ).rejects.toBeDefined();
    tenant = "north";
    const client = createConsoleClient({
      origin: "https://console.test",
      headers: { authorization: "Bearer alice" },
      fetch: async (url, init) =>
        (await app!.get(consolePlugin).fetch(new Request(url, init))) ??
        new Response(null, { status: 404 }),
    });
    const catalog = await client.catalog({ targetId: "north-app" });
    const queryEntry = catalog.operations.find(
      (entry) => entry.method === "query"
    )!;
    expect(
      await client.invoke({
        targetId: "north-app",
        key: queryEntry.key,
        input: { limit: 2 },
      })
    ).toEqual(first);
    allowed = false;
    await expect(
      adapter.invoke(integration.plugin.id, "query", {})
    ).rejects.toBeDefined();
    await expect(
      adapter.invoke(integration.plugin.id, "get", { id: ids[2] })
    ).rejects.toBeDefined();
    await expect(
      client.invoke({
        targetId: "north-app",
        key: queryEntry.key,
        input: {},
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  } finally {
    await app?.stop();
    await auth.close();
    db.close();
  }
});
