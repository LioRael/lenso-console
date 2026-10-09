import { Database, type SQLQueryBindings } from "bun:sqlite";
import { expect, test } from "bun:test";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import { definePlugin, startApp } from "@lenso/core";
import { createManageAdapter } from "@lenso/manage";
import { createScheduler, type ScheduleSummary } from "@lenso/scheduler";
import { createD1ScheduleStore } from "@lenso/scheduler/d1";
import { createTaskQueue, defineTask, type JobSummary } from "@lenso/tasks";
import {
  createD1TaskProvider,
  provisionD1TaskQueue,
  type D1Database,
  type D1PreparedStatement,
  type D1Result,
} from "@lenso/tasks/d1";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";

import { ConsoleOperationError } from "../src/errors";
import { createConsoleSchedulerIntegration } from "../src/integrations/scheduler";
import { createConsoleTasksIntegration } from "../src/integrations/tasks";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleResource,
} from "../src/types";

// Executes real provider SQL with atomic batches. This is a local SQLite fixture, not online D1.
function sqliteBindings(values: unknown[]): SQLQueryBindings[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "boolean" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    throw new TypeError(`Unsupported SQLite fixture binding: ${typeof value}`);
  });
}

function sqliteD1(db: Database): D1Database {
  class Statement implements D1PreparedStatement {
    readonly query: string;
    readonly values: unknown[];
    constructor(query: string, values: unknown[] = []) {
      this.query = query;
      this.values = values;
    }
    bind(...values: unknown[]) {
      return new Statement(this.query, values);
    }
    async all<T>(): Promise<D1Result<T>> {
      return this.execute<T>();
    }
    async raw() {
      return db.query(this.query).values(...sqliteBindings(this.values));
    }
    async run() {
      return this.execute();
    }
    execute<T>(): D1Result<T> {
      return {
        success: true,
        results: db
          .query(this.query)
          .all(...sqliteBindings(this.values)) as T[],
      };
    }
  }
  return {
    prepare(query) {
      return new Statement(query);
    },
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      return db.transaction(() =>
        statements.map((statement) => (statement as Statement).execute<T>())
      )();
    },
    withSession() {
      throw new Error("Fixture does not implement D1 sessions");
    },
  };
}

function authFixture() {
  const auth = createAuth(
    realm(
      "console-tasks",
      defineSource({
        async verify(token: string) {
          return { status: "verified" as const, subjectId: token };
        },
      })
    )
  );
  return auth;
}

function consoleAuthentication(identity: ConsoleIdentity) {
  let allowed = true;
  let enforced = 0;
  const service: ConsoleAuthentication = {
    admit() {},
    async authenticate() {
      return identity;
    },
    async enforce(current, resource) {
      enforced += 1;
      if (
        !allowed ||
        current !== identity ||
        resource.targetId !== "north-app" ||
        resource.tenantId !== "north"
      ) {
        throw new ConsoleOperationError("FORBIDDEN");
      }
    },
    async can() {
      return allowed;
    },
    async session() {
      return { administrator: false, workspace_ids: ["north"] };
    },
    async fetch() {
      return undefined;
    },
  };
  return {
    service,
    revoke() {
      allowed = false;
    },
    enforced: () => enforced,
  };
}

// Prevents cross-tenant leakage and owner-only replay through real Manage invocation.
// Existing Audit tests do not exercise an unscoped queue or provider retry/cancel transitions.
test("Tasks isolate actual jobs, hide cursors/results and gate replay through real D1 SQL and Manage", async () => {
  const db = new Database(":memory:");
  const auth = authFixture();
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  let queue: ReturnType<typeof createTaskQueue> | undefined;
  try {
    const migration = new URL(
      "../migrations/d1/0001_tasks.sql",
      import.meta.resolve("@lenso/tasks/d1")
    );
    db.exec(await Bun.file(migration).text());
    const database = sqliteD1(db);
    await provisionD1TaskQueue(database, "business");
    const provider = await createD1TaskProvider({
      database,
      queueName: "business",
      clock: () => 100,
    });
    const task = defineTask({
      name: "invoice.send",
      input: z.strictObject({ secret: z.string() }),
      maxAttempts: 1,
      async handler(): Promise<void> {
        throw new Error("private handler detail");
      },
    });
    const otherTask = defineTask({
      name: "private.task",
      input: z.strictObject({}),
      async handler() {},
    });
    queue = createTaskQueue({ provider, tasks: [task, otherTask] });
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push(await queue.enqueue(task, { secret: `private-${i}` }));
    }
    ids.sort();
    const [owned, denied, secondOwned] = ids as [string, string, string];
    const privateId = await queue.enqueue(otherTask, {});
    const ownership = new Map([
      [owned, "north"],
      [denied, "south"],
      [secondOwned, "north"],
      [privateId, "north"],
    ]);
    const identity: ConsoleIdentity = {
      actor: await auth.for(audience("console")).required("alice"),
      readScope: "north",
    };
    const security = consoleAuthentication(identity);
    const authentication = definePlugin({
      id: "console-auth",
      setup: () => security.service,
    });
    const queuePlugin = definePlugin({
      id: "business-queue",
      setup: () => queue!,
    });
    let safe = false;
    const integration = createConsoleTasksIntegration({
      id: "task-page",
      queue: queuePlugin,
      authentication,
      tasks: [task],
      authorizeJob(trusted, job) {
        expect(trusted.identity).toBe(identity);
        return ownership.get(job.jobId) === trusted.resource.tenantId;
      },
      safeRetry(trusted, registered, job) {
        expect(trusted.identity).toBe(identity);
        expect(registered).toBe(task);
        expect(job.jobId).toBe(owned);
        return safe;
      },
    });
    const closedIntegration = createConsoleTasksIntegration({
      id: "task-closed",
      queue: queuePlugin,
      authentication,
      tasks: [task],
      authorizeJob: (trusted, job) =>
        ownership.get(job.jobId) === trusted.resource.tenantId,
    });
    const legacyQueue = createTaskQueue({
      provider: { ...provider, list: undefined },
      tasks: [task],
    });
    const legacyQueuePlugin = definePlugin({
      id: "legacy-queue",
      setup: () => legacyQueue,
    });
    const unsupported = createConsoleTasksIntegration({
      id: "task-unsupported",
      queue: legacyQueuePlugin,
      authentication,
      tasks: [task],
      authorizeJob: () => true,
    });
    const plugins = [
      queuePlugin,
      legacyQueuePlugin,
      authentication,
      integration.plugin,
      closedIntegration.plugin,
      unsupported.plugin,
    ];
    app = await startApp({ plugins });
    let tenantId = "north";
    const request = new Request("https://console.test/rpc");
    const adapter = createManageAdapter({
      running: app,
      plugins,
      operations: [...integration.operations, ...closedIntegration.operations],
      canList: async () => true,
      binding(operation, input) {
        const resource: ConsoleResource = {
          action: "invoke",
          targetId: "north-app",
          tenantId,
          pluginId: operation.plugin.id,
          operation: operation.method,
        };
        return (
          operation.plugin === integration.plugin
            ? integration
            : closedIntegration
        ).binding(operation, input, request, identity, resource);
      },
    });
    const invoke = (method: string, input: unknown) =>
      adapter.invoke(integration.plugin.id, method, input);
    expect(integration.plugin.requires).toEqual([queuePlugin, authentication]);
    expect(() =>
      integration.binding(
        {
          ...integration.operations[0],
          plugin: { ...integration.plugin },
        },
        {},
        request,
        identity,
        {
          action: "invoke",
          targetId: "north-app",
          tenantId,
          pluginId: integration.plugin.id,
          operation: "list",
        }
      )
    ).toThrow(ConsoleOperationError);
    for (const input of [
      { actor: {} },
      { tasks: ["private.task"] },
      { limit: 101 },
      { after: denied },
    ]) {
      await expect(invoke("list", input)).rejects.toBeDefined();
    }
    expect(security.enforced()).toBe(0);
    await expect(
      app.get(unsupported.plugin).list(
        {},
        {
          identity,
          request,
          resource: {
            action: "invoke",
            targetId: "north-app",
            tenantId,
            pluginId: unsupported.plugin.id,
            operation: "list",
          },
        }
      )
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
    const first = (await invoke("list", { limit: 2 })) as {
      items: JobSummary[];
      nextCursor: string;
    };
    expect(first.items.map((job) => job.jobId)).toEqual([owned]);
    expect(first.nextCursor).not.toBe(denied);
    expect(atob(first.nextCursor)).not.toContain(denied);
    expect(Object.keys(first).sort()).toEqual(["items", "nextCursor"]);
    const second = (await invoke("list", {
      limit: 2,
      cursor: first.nextCursor,
    })) as { items: JobSummary[]; nextCursor: null };
    expect(second.items.map((job) => job.jobId)).toEqual([secondOwned]);
    expect(second.nextCursor).toBeNull();
    expect(await invoke("get", { jobId: owned })).toEqual({
      ...first.items[0],
      failure: null,
    });
    for (const jobId of [denied, privateId, crypto.randomUUID()]) {
      for (const method of ["get", "retry", "cancel"]) {
        await expect(invoke(method, { jobId })).rejects.toBeDefined();
      }
    }
    await expect(invoke("list", { cursor: denied })).rejects.toBeDefined();
    tenantId = "south";
    await expect(
      invoke("list", { cursor: first.nextCursor })
    ).rejects.toBeDefined();
    tenantId = "north";
    await queue.runBatch({ maxJobs: 4 });
    const failed = await queue.get(owned);
    expect(failed?.state).toBe("failed");
    await expect(invoke("retry", { jobId: owned })).rejects.toBeDefined();
    await expect(
      adapter.invoke(closedIntegration.plugin.id, "retry", { jobId: owned })
    ).rejects.toBeDefined();
    const refusedRetry = await queue.get(owned);
    expect(refusedRetry?.state).toBe("failed");
    safe = true;
    expect(await invoke("retry", { jobId: owned })).toEqual({
      jobId: owned,
      retried: true,
    });
    await expect(invoke("retry", { jobId: owned })).rejects.toBeDefined();
    expect(await invoke("cancel", { jobId: owned })).toEqual({
      jobId: owned,
      outcome: "cancelled",
    });
    const cancelled = await queue.get(owned);
    expect(cancelled?.state).toBe("cancelled");
    const serialized = JSON.stringify(await invoke("get", { jobId: owned }));
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("error");
    expect(serialized).not.toContain("result");
    security.revoke();
    await expect(invoke("list", {})).rejects.toBeDefined();
    await expect(
      app.get(integration.plugin).get(
        { jobId: owned },
        {
          identity,
          request,
          resource: {
            action: "invoke",
            targetId: "north-app",
            tenantId: "north",
            pluginId: integration.plugin.id,
            operation: "get",
          },
        }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await app.stop();
    app = undefined;
    // Adapter lifecycle must not close the borrowed queue.
    const borrowed = await queue.get(owned);
    expect(borrowed?.state).toBe("cancelled");
  } finally {
    await app?.stop();
    await queue?.close();
    await auth.close();
    db.close();
  }
});

// Prevents treating Console permission as Scheduler permission or dropping the mapped audience.
// Task coverage cannot prove schedule scope, authorization, revisions or occurrence deduplication.
test("Scheduler uses its authentic scoped companion and mapped Auth actor through Manage", async () => {
  const db = new Database(":memory:");
  const auth = authFixture();
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  let queue: ReturnType<typeof createTaskQueue> | undefined;
  try {
    for (const [entry, path] of [
      ["@lenso/tasks/d1", "../migrations/d1/0001_tasks.sql"],
      ["@lenso/scheduler/d1", "../migrations/d1/0001_scheduler.sql"],
    ]) {
      db.exec(
        await Bun.file(new URL(path!, import.meta.resolve(entry!))).text()
      );
    }
    const database = sqliteD1(db);
    await provisionD1TaskQueue(database, "schedules");
    const task = defineTask({
      name: "report.send",
      input: z.strictObject({ reportId: z.string() }),
      async handler() {},
    });
    queue = createTaskQueue({
      provider: await createD1TaskProvider({
        database,
        queueName: "schedules",
        clock: () => 100,
      }),
      tasks: [task],
    });
    const store = await createD1ScheduleStore(
      drizzle(database as Parameters<typeof drizzle>[0])
    );
    const consoleActor = await auth.for(audience("console")).required("alice");
    const schedulerActor = await auth
      .for(audience("schedules"))
      .required("alice");
    const identity: ConsoleIdentity = {
      actor: consoleActor,
      readScope: "north",
    };
    const security = consoleAuthentication(identity);
    let schedulerAllowed = true;
    const scheduler = createScheduler({
      store,
      queue,
      tasks: [task],
      scope: { namespace: "business", tenantId: "north" },
      clock: () => 100,
      authorize(actor, _action, scope) {
        return (
          schedulerAllowed &&
          actor === schedulerActor &&
          actor.audience === "schedules" &&
          scope.tenantId === "north"
        );
      },
      authorizeExecution: () => true,
    });
    const schedulerPlugin = definePlugin({
      id: "business-scheduler",
      setup: () => scheduler,
    });
    let mapped = 0;
    const integration = createConsoleSchedulerIntegration({
      id: "schedule-page",
      scheduler: schedulerPlugin,
      tasks: [task],
      authentication: security.service,
      resolve(trusted) {
        mapped += 1;
        expect(trusted.identity.actor.audience).toBe("console");
        expect(trusted.resource.tenantId).toBe("north");
        return schedulerActor;
      },
    });
    const plugins = [schedulerPlugin, integration.plugin];
    app = await startApp({ plugins });
    const request = new Request("https://console.test/rpc");
    const adapter = createManageAdapter({
      running: app,
      plugins,
      operations: integration.operations,
      canList: async () => true,
      binding(operation, input) {
        return integration.binding(operation, input, request, identity, {
          action: "invoke",
          targetId: "north-app",
          tenantId: "north",
          pluginId: operation.plugin.id,
          operation: operation.method,
        });
      },
    });
    const invoke = (method: string, input: unknown) =>
      adapter.invoke(integration.plugin.id, method, input);
    const definition = {
      task: task.name,
      input: { reportId: "private-report" },
      rule: { kind: "once", at: 200 },
      misfire: "skip",
      graceMs: 0,
    };
    await expect(
      invoke("create", { ...definition, actor: consoleActor })
    ).rejects.toBeDefined();
    expect(mapped).toBe(0);
    const created = (await invoke("create", definition)) as ScheduleSummary;
    expect(created.revision).toBe(1);
    expect(JSON.stringify(created)).not.toContain("private-report");
    expect(await invoke("get", { id: created.id })).toEqual(created);
    const other = createScheduler({
      store,
      queue,
      tasks: [task],
      scope: { namespace: "business", tenantId: "south" },
      clock: () => 100,
      authorize: () => true,
      authorizeExecution: () => true,
    });
    const otherSchedule = await other.create(
      {
        task: task.name,
        input: { reportId: "south-secret" },
        rule: { kind: "once", at: 200 },
        misfire: "skip",
        graceMs: 0,
      },
      schedulerActor
    );
    expect(
      ((await invoke("list", { limit: 10 })) as ScheduleSummary[]).map(
        (schedule) => schedule.id
      )
    ).toEqual([created.id]);
    await expect(invoke("get", { id: otherSchedule.id })).rejects.toBeDefined();
    const paused = (await invoke("pause", {
      id: created.id,
      revision: 1,
    })) as ScheduleSummary;
    expect(paused.state).toBe("paused");
    expect(paused.revision).toBe(2);
    await expect(
      invoke("resume", { id: created.id, revision: 1 })
    ).rejects.toBeDefined();
    expect(
      (
        (await invoke("resume", {
          id: created.id,
          revision: 2,
        })) as ScheduleSummary
      ).revision
    ).toBe(3);
    const first = await invoke("trigger", {
      id: created.id,
      key: "manual-request",
    });
    expect(
      await invoke("trigger", { id: created.id, key: "manual-request" })
    ).toEqual(first);
    expect(
      await invoke("occurrences", { id: created.id, limit: 10 })
    ).toHaveLength(1);
    schedulerAllowed = false;
    await expect(invoke("list", {})).rejects.toBeDefined();
    await expect(
      invoke("cancel", { id: created.id, revision: 3 })
    ).rejects.toBeDefined();
    schedulerAllowed = true;
    expect(
      (
        (await invoke("cancel", {
          id: created.id,
          revision: 3,
        })) as ScheduleSummary
      ).state
    ).toBe("cancelled");
    security.revoke();
    const before = mapped;
    await expect(invoke("get", { id: created.id })).rejects.toBeDefined();
    expect(mapped).toBe(before);
  } finally {
    await app?.stop();
    await queue?.close();
    await auth.close();
    db.close();
  }
});
