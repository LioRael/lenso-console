import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import { definePlugin, startApp } from "@lenso/core";
import { createManageAdapter } from "@lenso/manage";
import { createTaskQueue, defineTask } from "@lenso/tasks";
import { createD1TaskProvider, provisionD1TaskQueue } from "@lenso/tasks/d1";
import { z } from "zod";

import {
  ConsoleOperationError,
  type ConsoleAuthentication,
  type ConsoleIdentity,
} from "../../console/src/index";
import { createConsoleTasksIntegration } from "../../console/src/integrations/tasks";
import { sqliteD1 } from "../../console/test/fixtures/sqlite-d1";

// Test-owned HTTP envelope around the real Manage adapter. Never installed by an app.
// Authentication is synthetic; ownership, operation binding and queue SQL are real.
export async function managedQueue(fault: "read" | "acknowledgement") {
  const directory = await mkdtemp(join(tmpdir(), "console-tasks-browser-"));
  const db = new Database(join(directory, "tasks.sqlite"));
  db.exec(
    await Bun.file(
      new URL(
        "../migrations/d1/0001_tasks.sql",
        import.meta.resolve("@lenso/tasks/d1")
      )
    ).text()
  );
  const database = sqliteD1(db);
  await provisionD1TaskQueue(database, "isolated-browser");
  const task = defineTask({
    name: "local.report",
    input: z.object({ privateValue: z.string() }),
    maxAttempts: 1,
    async handler(): Promise<void> {
      throw new Error("private handler failure");
    },
  });
  const queue = createTaskQueue({
    provider: await createD1TaskProvider({
      database,
      queueName: "isolated-browser",
    }),
    tasks: [task],
  });
  const owned = await queue.enqueue(task, { privateValue: "never disclose" });
  await queue.runBatch({ maxJobs: 1 });
  const denied = await queue.enqueue(task, { privateValue: "another tenant" });
  const auth = createAuth(
    realm(
      "fixture",
      defineSource({
        async verify() {
          return {
            status: "verified" as const,
            subjectId: "synthetic-operator",
          };
        },
      })
    )
  );
  const identity: ConsoleIdentity = {
    actor: await auth.for(audience("console")).required("synthetic"),
    readScope: "fixture-north",
  };
  let revoked = false;
  const authentication = definePlugin({
    id: "fixture-auth",
    setup: (): ConsoleAuthentication => ({
      admit() {
        /* Synthetic fixture admission. */
      },
      async authenticate() {
        return identity;
      },
      async enforce(current, resource) {
        if (
          revoked ||
          current !== identity ||
          resource.targetId !== "fixture" ||
          resource.tenantId !== "north"
        ) {
          throw new ConsoleOperationError("FORBIDDEN");
        }
      },
      async can() {
        return !revoked;
      },
      async session() {
        return { administrator: false, workspace_ids: ["north"] };
      },
      async fetch() {
        return undefined;
      },
    }),
  });
  const queuePlugin = definePlugin({ id: "fixture-queue", setup: () => queue });
  const integration = createConsoleTasksIntegration({
    id: "fixture-tasks",
    queue: queuePlugin,
    authentication,
    tasks: [task],
    authorizeJob: (_, job) => job.jobId === owned,
    safeRetry: () => true,
  });
  const plugins = [authentication, queuePlugin, integration.plugin];
  const app = await startApp({ plugins });
  let failRead = fault === "read";
  let loseAcknowledgement = fault === "acknowledgement";
  const writes: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (
        request.method !== "POST" ||
        new URL(request.url).pathname !== "/task-api"
      ) {
        return new Response(null, { status: 404 });
      }
      try {
        const { service, method, input } = z
          .object({
            service: z.literal("fixture-tasks"),
            method: z.enum(["list", "get", "retry", "cancel"]),
            input: z.unknown(),
          })
          .parse(await request.json());
        if (method === "list" && failRead) {
          failRead = false;
          return new Response(null, { status: 503 });
        }
        const adapter = createManageAdapter({
          running: app,
          plugins,
          operations: integration.operations,
          canList: async () => true,
          binding(operation, value) {
            return integration.binding(operation, value, request, identity, {
              action: "invoke",
              targetId: "fixture",
              tenantId: "north",
              pluginId: operation.plugin.id,
              operation: operation.method,
            });
          },
        });
        const result = await adapter.invoke(service, method, input);
        if (method === "retry" || method === "cancel") {
          writes.push(method);
        }
        if (method === "retry" && loseAcknowledgement) {
          loseAcknowledgement = false;
          return new Response(null, { status: 503 });
        }
        return Response.json(result);
      } catch {
        return new Response(null, { status: 403 });
      }
    },
  });
  return {
    server,
    writes,
    queue,
    owned,
    denied,
    revoke() {
      revoked = true;
    },
    async close() {
      server.stop(true);
      await app.stop();
      db.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
