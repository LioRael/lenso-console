import { Database } from "bun:sqlite";
import path from "node:path";

import {
  ApiKeyError,
  createApiKeys,
  sameKeySubject,
  type ApiKeyStore,
  type KeyRecord,
} from "@lenso/api-keys";
import { createAuditService } from "@lenso/audit";
import { createSqliteAuditRepository } from "@lenso/audit/sqlite";
import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import type { RoleSnapshot, RoleStore } from "@lenso/authorization";
import { createAuthorizationInspection } from "@lenso/authorization/manage";
import { createConsolePlugin, type ConsoleResource } from "@lenso/console";
import {
  createConsoleApiKeyCredentials,
  createConsoleApiKeyManage,
} from "@lenso/console/api-keys";
import { createConsoleAuditIntegration } from "@lenso/console/audit";
import { createConsoleAuthentication } from "@lenso/console/auth";
import {
  createConsoleAuthorizationManage,
  createConsoleScopedAuthorization,
  createConsoleAuthorizationPolicy,
} from "@lenso/console/authorization";
import { createConsoleLimitsBinding } from "@lenso/console/limits";
import { createConsoleManagementMount } from "@lenso/console/pages";
import { createConsoleSchedulerIntegration } from "@lenso/console/scheduler";
import { createConsoleTasksIntegration } from "@lenso/console/tasks";
import { definePlugin, startApp } from "@lenso/core";
import { createScheduler } from "@lenso/scheduler";
import { createD1ScheduleStore } from "@lenso/scheduler/d1";
import { createTaskQueue, defineTask } from "@lenso/tasks";
import { createD1TaskProvider, provisionD1TaskQueue } from "@lenso/tasks/d1";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { z } from "zod";

import { sqliteD1 } from "./fixtures/sqlite-d1";

const db = new Database(":memory:");
const preview = process.env.LENSO_MANAGEMENT_PREVIEW === "1";
const cleanups: (() => unknown | Promise<unknown>)[] = [() => db.close()];
let stopped = false;
let dispatch: (request: Request) => Promise<Response> = async () =>
  new Response(null, { status: 503 });
const assertTrusted = (trusted: {
  identity: { actor: { subjectId: string } };
  resource: ConsoleResource;
}) => {
  if (
    trusted.identity.actor.subjectId !== "reader" ||
    trusted.resource.targetId !== "fixture" ||
    trusted.resource.tenantId !== "fixture"
  ) {
    throw new Error("Unknown fixture resource");
  }
};
const resource = (operation: string): ConsoleResource => ({
  action: "invoke",
  targetId: "fixture",
  tenantId: "fixture",
  pluginId: "api-keys",
  operation,
});
async function close() {
  if (stopped) {
    return;
  }
  stopped = true;
  const failures = [];
  for (const cleanup of cleanups.toReversed()) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, "Fixture cleanup failed");
  }
}

try {
  for (const migration of [
    Bun.resolveSync(
      "@lenso/audit/migrations/sqlite/0000_audit.sql",
      import.meta.dir
    ),
    new URL(
      "../migrations/d1/0001_tasks.sql",
      import.meta.resolve("@lenso/tasks/d1")
    ),
    new URL(
      "../migrations/d1/0001_scheduler.sql",
      import.meta.resolve("@lenso/scheduler/d1")
    ),
  ]) {
    db.exec(await Bun.file(migration).text());
  }
  let denied = false;
  let writes = true;
  let safeRetry = preview;
  const permissionRevision = 1;
  const principal = { realmId: "browser", kind: "user", subjectId: "reader" };
  const scope = { type: "tenant", id: "fixture" };
  let snapshot: RoleSnapshot<"access"> = {
    revision: "1",
    graph: {
      roles: [
        {
          id: "fixture-reader",
          scope,
          permissions: [{ action: "access", resourceType: "console", scope }],
        },
      ],
      bindings: [
        { id: "fixture-binding", principal, roleId: "fixture-reader", scope },
      ],
    },
  };
  const roleStore: RoleStore<"access"> = {
    read: () => snapshot,
    compareAndSwap(expected, next) {
      if (snapshot.revision !== expected) {
        return false;
      }
      snapshot = next;
      return true;
    },
  };
  const authorization = createConsoleScopedAuthorization({
    actions: ["access"] as const,
    rbac: { store: roleStore },
    boundaries: [() => !denied],
  });
  const auth = createAuth(
    realm(
      "browser",
      defineSource({
        async verify(token: string | null) {
          return token === "fixture"
            ? { status: "verified", subjectId: "reader", kind: "user" }
            : { status: "rejected" };
        },
      })
    )
  );
  cleanups.push(() => auth.close());
  // Reserve the only listener before configuring exact origin admission.
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => dispatch(request),
  });
  cleanups.push(() => server.stop(true));
  const { origin } = server.url;
  const authenticationService = createConsoleAuthentication({
    access: auth
      .for(audience("console"))
      .memberships(async (_actor, selected: ConsoleResource) =>
        selected.tenantId === "fixture" ? {} : null
      ),
    policy: createConsoleAuthorizationPolicy({
      authorization,
      map: ({ principal: actor }) => ({
        principal: { ...principal, subjectId: actor.subjectId },
        action: "access",
        resource: { type: "console", id: "fixture", scope },
        context: {},
      }),
    }),
    requestPolicy: { origin, credentialMode: "bearer" },
    evidence: (request) =>
      request.headers.get("authorization")?.slice(7) ?? null,
    permissionRevision: () => String(permissionRevision),
    session: () => ({ administrator: false, workspace_ids: [] }),
    browser: { methodsPath: "/auth/methods", methods: [], handlers: [] },
  });
  const authentication = definePlugin({
    id: "fixture-auth",
    setup: () => authenticationService,
  });
  const auditPrincipal = Object.freeze({});
  const auditScope = { tenantId: "fixture", scopeId: "browser" };
  const auditService = createAuditService({
    repository: createSqliteAuditRepository(drizzle(db)),
    authority: {
      async resolve(actor, requested) {
        if (
          actor !== auditPrincipal ||
          denied ||
          requested.tenantId !== "fixture" ||
          requested.scopeId !== "browser"
        ) {
          throw new Error("denied");
        }
        return { kind: "system", systemId: "browser-fixture" };
      },
    },
  });
  const eventId = "00000000-0000-0000-0000-000000000001";
  await auditService.append(
    {
      id: eventId,
      occurredAt: Date.now(),
      scope: auditScope,
      action: "fixture.read",
      target: { type: "report", id: "fixture-report" },
      result: "success",
      reasonCode: "completed",
    },
    auditPrincipal
  );
  const auditPlugin = definePlugin({
    id: "fixture-audit",
    setup: () => auditService,
  });
  const audit = createConsoleAuditIntegration({
    id: "audit",
    audit: auditPlugin,
    resolve: (trusted) => {
      assertTrusted(trusted);
      return { principal: auditPrincipal, scope: auditScope };
    },
  });
  const keySubject = {
    namespace: "browser",
    tenantId: "fixture",
    subjectId: "reader",
  };
  const rows = new Map<string, KeyRecord>();
  const keyStore: ApiKeyStore = {
    async create(record) {
      const existing = [...rows.values()].find(
        (row) =>
          row.requestId === record.requestId &&
          sameKeySubject(row.subject, record.subject)
      );
      if (existing) {
        return { created: false, record: existing };
      }
      if (
        record.expiresAt <= Date.now() ||
        rows.has(record.id) ||
        [...rows.values()].some((row) => row.digest === record.digest)
      ) {
        throw new Error("Invalid insert");
      }
      rows.set(record.id, record);
      return { created: true, record };
    },
    async read(id) {
      return rows.get(id) ?? null;
    },
    async list(subject, after, limit) {
      return [...rows.values()]
        .filter(
          (row) =>
            sameKeySubject(subject, row.subject) &&
            (after === null || row.id > after)
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async rotate(input) {
      const row = rows.get(input.id);
      const now = Math.max(Date.now(), input.now);
      if (
        !row ||
        !sameKeySubject(row.subject, input.subject) ||
        row.revision !== input.expectedRevision ||
        row.revokedAt !== null ||
        row.expiresAt <= now ||
        (row.overlapUntil !== null && row.overlapUntil > now)
      ) {
        return null;
      }
      const next = {
        ...row,
        revision: row.revision + 1,
        digest: input.digest,
        previousDigest: input.overlapMs ? row.digest : null,
        overlapUntil: input.overlapMs
          ? Math.min(row.expiresAt, now + input.overlapMs)
          : null,
      };
      rows.set(row.id, next);
      return next;
    },
    async revoke(subject, id, now) {
      const row = rows.get(id);
      if (!row || !sameKeySubject(subject, row.subject)) {
        return false;
      }
      rows.set(id, {
        ...row,
        revokedAt: now,
        previousDigest: null,
        overlapUntil: null,
      });
      return true;
    },
  };
  const keysService = createApiKeys({
    store: keyStore,
    config: { maxLifetimeMs: 86_400_000, maxOverlapMs: 5000 },
    authorizeManagement: (_caller, action, target) =>
      !denied &&
      (!["issue", "rotate", "revoke"].includes(action) || writes) &&
      sameKeySubject(target.subject, keySubject),
    grantScopes: (_caller, _subject, scopes) => {
      if (scopes.some((value) => value !== "fixture:read")) {
        throw new ApiKeyError("FORBIDDEN");
      }
      return scopes;
    },
    subjectActive: () => true,
    authorizeUse: () => !denied,
  });
  cleanups.push(() => keysService.close());
  const keysPlugin = definePlugin({
    id: "fixture-keys",
    setup: () => keysService,
  });
  const keys = createConsoleApiKeyManage({
    id: "api-keys",
    keys: keysPlugin,
    authentication,
    canRevoke: () => writes,
    map: (trusted) => {
      assertTrusted(trusted);
      return { caller: trusted.identity, subject: keySubject };
    },
  });
  const credentials = createConsoleApiKeyCredentials({
    keys: keysService,
    authentication: authenticationService,
    issuePath: "/credentials/issue",
    rotatePath: "/credentials/rotate",
    resource,
    map: (identity, selected) => {
      assertTrusted({ identity, resource: selected });
      return { caller: identity, subject: keySubject };
    },
  });
  const inspection = definePlugin({
    id: "fixture-inspection",
    setup: () =>
      createAuthorizationInspection({
        store: roleStore,
        actions: ["access"] as const,
        authorize: (_caller, selected) =>
          !denied && selected.type === scope.type && selected.id === scope.id,
        authorizeBinding: (_caller, binding) =>
          binding.principal.subjectId === principal.subjectId,
      }),
  });
  const authz = createConsoleAuthorizationManage({
    id: "authorization",
    inspection,
    authentication,
    map: (trusted) => {
      assertTrusted(trusted);
      return { caller: trusted.identity, scope };
    },
  });
  const database = sqliteD1(db);
  await provisionD1TaskQueue(database, "fixture");
  const task = defineTask({
    name: "fixture.report",
    input: z.strictObject({ reportId: z.string().min(1) }),
    maxAttempts: 1,
    async handler(): Promise<void> {
      throw new Error("Fixture terminal failure");
    },
  });
  const queue = createTaskQueue({
    provider: await createD1TaskProvider({ database, queueName: "fixture" }),
    tasks: [task],
  });
  cleanups.push(() => queue.close());
  const jobId = await queue.enqueue(task, { reportId: "fixture-report" });
  await queue.runBatch({ maxJobs: 1 });
  const queuePlugin = definePlugin({ id: "fixture-queue", setup: () => queue });
  const tasks = createConsoleTasksIntegration({
    id: "tasks",
    queue: queuePlugin,
    authentication,
    tasks: [task],
    authorizeJob: (trusted, job) => {
      assertTrusted(trusted);
      return job.task === task.name && job.jobId === jobId;
    },
    safeRetry: (_trusted, registered, job) =>
      writes && safeRetry && registered === task && job.jobId === jobId,
  });
  const schedulerActor = await auth
    .for(audience("schedules"))
    .required("fixture");
  const schedulerService = createScheduler({
    store: await createD1ScheduleStore(
      drizzleD1(database as Parameters<typeof drizzleD1>[0])
    ),
    queue,
    tasks: [task],
    scope: { namespace: "browser", tenantId: "fixture" },
    authorize: (actor, _action, selected) =>
      !denied && actor === schedulerActor && selected.tenantId === "fixture",
    authorizeExecution: () => !denied,
  });
  const schedulerPlugin = definePlugin({
    id: "fixture-scheduler",
    setup: () => schedulerService,
  });
  const scheduler = createConsoleSchedulerIntegration({
    id: "scheduler",
    scheduler: schedulerPlugin,
    tasks: [task],
    authentication: authenticationService,
    resolve: (trusted) => {
      assertTrusted(trusted);
      return schedulerActor;
    },
    async authorizeCatalog(actor, signal) {
      signal.throwIfAborted();
      if (denied || actor !== schedulerActor) {
        throw new Error("denied");
      }
    },
  });
  const integrations = [audit, keys, authz, tasks, scheduler];
  const mounts = integrations.map((integration) =>
    createConsoleManagementMount({
      id: integration.plugin.id,
      page: z
        .enum(["audit", "api-keys", "authorization", "tasks", "scheduler"])
        .parse(integration.plugin.id),
      title: integration.plugin.id,
      subject: { kind: "console" },
      manage: integration.manage,
      ...(integration === keys ? { credentials } : {}),
    })
  );
  const consolePlugin = createConsolePlugin({
    authentication,
    management: true,
    targets: [
      {
        id: "fixture",
        label: "Browser fixture",
        tenantId: "fixture",
        plugins: integrations.map((integration) => integration.plugin),
        manage: integrations.map((integration) => integration.manage),
        mounts,
      },
    ],
    canWrite: () => writes,
    binding(operation, input, request, identity, selected) {
      for (const integration of [audit, tasks, scheduler]) {
        if (integration.plugin === operation.plugin) {
          return integration.binding(
            operation,
            input,
            request,
            identity,
            selected
          );
        }
      }
      return { context: { identity, resource: selected, request } };
    },
  });
  void createConsoleLimitsBinding;
  const app = await startApp({
    plugins: [
      authentication,
      auditPlugin,
      keysPlugin,
      inspection,
      queuePlugin,
      schedulerPlugin,
      ...integrations.map((integration) => integration.plugin),
      consolePlugin,
    ],
  });
  cleanups.push(() => app.stop());
  const shell = path.resolve(
    process.env.LENSO_MANAGEMENT_SHELL ?? "plugins/console/shell/dist/client"
  );
  if (!(await Bun.file(path.join(shell, "index.html")).exists())) {
    throw new Error(`Build the actual Shell first: ${shell}`);
  }
  dispatch = async (incoming) => {
    let request = incoming;
    if (preview) {
      // Loopback-only demo identity; never consume the browser's real session cookies.
      const headers = new Headers(request.headers);
      headers.delete("cookie");
      headers.set("authorization", "Bearer fixture");
      request = new Request(request, { headers });
    }
    const url = new URL(request.url);
    if (url.pathname === "/__fixture/state") {
      if (request.headers.get("authorization") !== "Bearer fixture") {
        return new Response(null, { status: 401 });
      }
      if (request.method === "POST") {
        const input = await request.json();
        if (typeof input.denied === "boolean") {
          ({ denied } = input);
        }
        if (typeof input.writes === "boolean") {
          ({ writes } = input);
        }
        if (typeof input.safeRetry === "boolean") {
          ({ safeRetry } = input);
        }
        if (typeof input.scheduleConflict === "string") {
          const current = await schedulerService.get(
            input.scheduleConflict,
            schedulerActor
          );
          await schedulerService.pause(
            current.id,
            current.revision,
            schedulerActor
          );
        }
      }
      const job = await queue.get(jobId);
      const schedules = denied
        ? []
        : await schedulerService.list(schedulerActor);
      const summaries = await Promise.all(
        schedules.map(async ({ id, revision, state }) => {
          const occurrences = await schedulerService.occurrences(
            id,
            schedulerActor
          );
          return { id, revision, state, occurrenceCount: occurrences.length };
        })
      );
      return Response.json({
        eventId,
        jobId,
        denied,
        writes,
        jobState: job?.state,
        schedules: summaries,
      });
    }
    const credential = await credentials.fetch(request);
    if (credential) {
      return credential;
    }
    const response = await app.get(consolePlugin).fetch(request);
    if (response) {
      return response;
    }
    const filename = path.resolve(
      shell,
      `.${decodeURIComponent(url.pathname)}`
    );
    if (!filename.startsWith(shell + path.sep)) {
      return new Response(null, { status: 404 });
    }
    const file = Bun.file(filename);
    if (await file.exists()) {
      return new Response(file);
    }
    if (
      [
        "/",
        "/audit",
        "/api-keys",
        "/authorization",
        "/tasks",
        "/scheduler",
        "/management",
      ].includes(url.pathname)
    ) {
      return new Response(Bun.file(path.join(shell, "index.html")));
    }
    return new Response(null, { status: 404 });
  };
  const finish = async () => {
    await close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void finish());
  process.once("SIGINT", () => void finish());
  if (!preview) {
    process.stdin.resume();
    process.stdin.once("end", () => void finish());
  }
  console.log(JSON.stringify({ origin }));
} catch (error) {
  await close();
  throw error;
}
