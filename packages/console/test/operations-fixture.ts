import { Database } from "bun:sqlite";

import { createAuditService } from "@lenso/audit";
import { createSqliteAuditRepository } from "@lenso/audit/sqlite";
import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import { definePlugin, startApp } from "@lenso/core";
import { createManageAdapter } from "@lenso/manage";
import { createScheduler } from "@lenso/scheduler";
import { createD1ScheduleStore } from "@lenso/scheduler/d1";
import { createTaskQueue, defineTask } from "@lenso/tasks";
import { createD1TaskProvider, provisionD1TaskQueue } from "@lenso/tasks/d1";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { drizzle as d1Drizzle } from "drizzle-orm/d1";
import { z } from "zod";

import { createConsoleAuditIntegration } from "../src/integrations/audit";
import { createConsoleSchedulerIntegration } from "../src/integrations/scheduler";
import type { ConsoleAuthentication } from "../src/types";
import { sqliteD1 } from "./fixtures/sqlite-d1";

// Disposable test-owned in-memory databases; this module never reads credentials or app databases.
export async function operationsFixture() {
  const db = new Database(":memory:");
  const auditDb = new Database(":memory:");
  db.exec(
    await Bun.file(
      new URL(
        "../migrations/d1/0001_tasks.sql",
        import.meta.resolve("@lenso/tasks/d1")
      )
    ).text()
  );
  db.exec(
    await Bun.file(
      new URL(
        "../migrations/d1/0001_scheduler.sql",
        import.meta.resolve("@lenso/scheduler/d1")
      )
    ).text()
  );
  auditDb.exec(
    await Bun.file(
      Bun.resolveSync(
        "@lenso/audit/migrations/sqlite/0000_audit.sql",
        import.meta.dir
      )
    ).text()
  );
  const database = sqliteD1(db);
  await provisionD1TaskQueue(database, "operations-fixture");
  const task = defineTask({
    name: "fixture.report",
    input: z.object({}),
    async handler() {
      /* Fixture never starts a task worker. */
    },
  });
  const queue = createTaskQueue({
    provider: await createD1TaskProvider({
      database,
      queueName: "operations-fixture",
    }),
    tasks: [task],
  });
  const auth = createAuth(
    realm(
      "fixture",
      defineSource({
        async verify() {
          return { status: "verified" as const, subjectId: "fixture-operator" };
        },
      })
    )
  );
  const actor = await auth.for(audience("scheduler")).required("synthetic");
  const consoleActor = await auth
    .for(audience("console"))
    .required("synthetic");
  let allowed = true,
    loseAck = false;
  const writes: string[] = [];
  const scope = { tenantId: "fixture-north", scopeId: "operations" };
  const principal = Object.freeze({});
  const scheduler = createScheduler({
    store: await createD1ScheduleStore(d1Drizzle(database as never)),
    queue,
    tasks: [task],
    scope: { namespace: "fixture", tenantId: "fixture-north" },
    authorize: (candidate) => allowed && candidate === actor,
    authorizeExecution: () => true,
  });
  const schedule = await scheduler.create(
    {
      task: task.name,
      input: {},
      rule: { kind: "cron", expression: "0 * * * *", timezone: "UTC" },
      misfire: "skip",
      graceMs: 0,
    },
    actor
  );
  const audit = createAuditService({
    repository: createSqliteAuditRepository(drizzle(auditDb)),
    authority: {
      async resolve(candidate: object, requested) {
        if (
          !allowed ||
          candidate !== principal ||
          requested.tenantId !== scope.tenantId ||
          requested.scopeId !== scope.scopeId
        ) {
          throw new Error("denied");
        }
        return { kind: "system", systemId: "isolated-fixture" };
      },
    },
  });
  const firstId = crypto.randomUUID();
  for (let i = 0; i < 52; i += 1) {
    await audit.append(
      {
        id: i === 0 ? firstId : crypto.randomUUID(),
        occurredAt: i,
        scope,
        action: "fixture.report",
        target: { type: "report", id: "local" },
        result: i === 0 ? "intent" : "success",
        reasonCode: "fixture",
        correlationId: "fixture-trace",
        ...(i
          ? {
              relation: {
                kind: i === 51 ? ("correction" as const) : ("outcome" as const),
                eventId: firstId,
              },
            }
          : {}),
      },
      principal
    );
  }
  const schedulerPlugin = definePlugin({
    id: "fixture.scheduler",
    setup: () => scheduler,
  });
  const auditPlugin = definePlugin({ id: "fixture.audit", setup: () => audit });
  const authentication: ConsoleAuthentication = {
    admit() {
      /* Synthetic test-only admission, no credentials. */
    },
    async authenticate() {
      return { actor: consoleActor, readScope: "fixture-north" };
    },
    async enforce() {
      if (!allowed) {
        throw new Error("denied");
      }
    },
    async can() {
      return allowed;
    },
    async session() {
      return { administrator: false, workspace_ids: [] };
    },
    async fetch() {
      return undefined;
    },
  };
  const schedules = createConsoleSchedulerIntegration({
    id: "fixture.schedules",
    scheduler: schedulerPlugin,
    tasks: [task],
    authentication,
    resolve: () => actor,
  });
  const audits = createConsoleAuditIntegration({
    id: "fixture.audit-page",
    audit: auditPlugin,
    resolve: () => ({ principal, scope }),
  });
  const plugins = [
    schedulerPlugin,
    auditPlugin,
    schedules.plugin,
    audits.plugin,
  ];
  const app = await startApp({ plugins });
  return {
    async invoke(body: unknown) {
      const { service, method, input } = z
        .object({
          service: z.enum(["fixture.schedules", "fixture.audit-page"]),
          method: z.string(),
          input: z.unknown(),
        })
        .parse(body);
      const request = new Request("http://fixture.invalid");
      const identity = { actor: consoleActor, readScope: "fixture-north" };
      const scheduleAdapter = createManageAdapter({
        running: app,
        plugins,
        operations: schedules.operations,
        canList: async () => allowed,
        binding(operation, value) {
          return schedules.binding(operation, value, request, identity, {
            action: "invoke",
            targetId: "fixture",
            tenantId: "fixture-north",
            pluginId: operation.plugin.id,
            operation: operation.method,
          });
        },
      });
      const auditAdapter = createManageAdapter({
        running: app,
        plugins,
        operations: audits.operations,
        canList: async () => allowed,
        binding(operation, value) {
          return audits.binding(operation, value, request, identity, {
            action: "invoke",
            targetId: "fixture",
            tenantId: "fixture-north",
            pluginId: operation.plugin.id,
            operation: operation.method,
          });
        },
      });
      const adapter =
        service === schedules.plugin.id ? scheduleAdapter : auditAdapter;
      const value = await adapter.invoke(service, method, input);
      if (["pause", "resume", "cancel"].includes(method)) {
        writes.push(method);
        if (loseAck) {
          loseAck = false;
          throw new Error("lost ACK after commit");
        }
      }
      return value;
    },
    control(action: string) {
      if (action === "lose-ack") {
        loseAck = true;
      }
      if (action === "revoke") {
        allowed = false;
      }
      if (action === "restore") {
        allowed = true;
      }
      return { writes, scheduleId: schedule.id };
    },
    async close() {
      await app.stop();
      await queue.close();
      await auth.close();
      db.close();
      auditDb.close();
    },
  };
}
