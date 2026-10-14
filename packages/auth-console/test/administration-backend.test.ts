import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ApiKeyError } from "@lenso/api-keys";
import { AuditOutcomeUnknownError, createAuditService } from "@lenso/audit";
import { createSqliteAuditRepository } from "@lenso/audit/sqlite";
import {
  SessionAdministrationError,
  SessionRevokeOutcomeUnknownError,
} from "@lenso/auth/sessions";
import { startApp } from "@lenso/core";
import { createManageAdapter, describeManage } from "@lenso/manage";
import { drizzle } from "drizzle-orm/bun-sqlite";

import {
  administrationActions,
  type DirectoryUser,
} from "../src/administration-contracts";
import {
  createConsoleAdministrationService,
  createConsoleAdministration,
  createConsoleAdministrationManage,
  type AdministrationContext,
} from "../src/administration-server";
import {
  AdministrationError,
  createConsoleAdministrationStore,
} from "../src/administration-store";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).toReversed()) {
    close();
  }
});
const instance = {
  consoleId: "console-one",
  tenantId: "tenant-one",
  realmId: "realm-one",
};
const evaluation = () => ({
  signal: new AbortController().signal,
  now: Date.now(),
});
function fixture() {
  const path = mkdtempSync(join(tmpdir(), "console-administration-"));
  cleanup.push(() => rmSync(path, { recursive: true, force: true }));
  const db = new Database(join(path, "state.db"));
  cleanup.push(() => db.close());
  db.exec(
    "PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000"
  );
  const users = new Map<string, DirectoryUser>(
    ["owner", "second", "reader"].map((subjectId) => [
      subjectId,
      {
        subjectId,
        realmId: instance.realmId,
        label: subjectId,
        source: "test-directory",
        status: "active",
      },
    ])
  );
  const store = createConsoleAdministrationStore({
    database: db,
    ...instance,
    subjectActiveAtCommit: (subjectId) =>
      users.get(subjectId)?.status === "active",
  });
  store.initializeInstance("owner");
  const trusted = new WeakSet<object>();
  const context = (
    subjectId = "owner",
    entry: "human" | "agent" = "human",
    credentialScopes?: AdministrationContext["credentialScopes"]
  ): AdministrationContext => {
    const value: AdministrationContext = {
      principal: { realmId: instance.realmId, subjectId, kind: "user" },
      entry,
      ...(credentialScopes ? { credentialScopes } : {}),
      signal: new AbortController().signal,
    };
    trusted.add(value);
    return value;
  };
  let failOutcome = false;
  let failIntent = false;
  let blockOutcome: Promise<void> | undefined;
  let outcomeEntered: (() => void) | undefined;
  const assertManagementCaller = (value: AdministrationContext) => {
    if (!trusted.has(value)) {
      throw new Error("untrusted context");
    }
  };
  const directory = {
    async list() {
      return { items: [...users.values()], nextCursor: null };
    },
    async read(subjectId: string) {
      return users.get(subjectId) ?? null;
    },
    async disable(subjectId: string) {
      const value = users.get(subjectId);
      if (!value) {
        return false;
      }
      users.set(subjectId, { ...value, status: "disabled" });
      return true;
    },
  };
  db.exec(
    readFileSync(
      new URL(
        "../node_modules/@lenso/audit/migrations/sqlite/0000_audit.sql",
        import.meta.url
      ),
      "utf-8"
    )
  );
  const repository = createSqliteAuditRepository(drizzle(db), {
    durableIntents: true,
  });
  const audit = createAuditService<AdministrationContext>({
    repository: {
      ...repository,
      async insert(event) {
        if (
          (failOutcome && event.result !== "intent") ||
          (failIntent && event.result === "intent")
        ) {
          throw new Error("injected database failure");
        }
        if (event.result !== "intent") {
          outcomeEntered?.();
          await blockOutcome;
        }
        return repository.insert(event);
      },
    },
    summaryPolicy: Object.fromEntries(
      administrationActions.map((action) => [
        action,
        { agent: { type: "boolean" as const } },
      ])
    ),
    authority: {
      async resolve(value, scope) {
        assertManagementCaller(value);
        if (
          scope.scopeId !== store.scope.id ||
          scope.tenantId !== instance.tenantId
        ) {
          throw new Error("wrong audit scope");
        }
        return {
          kind: "user",
          realmId: value.principal.realmId,
          subjectId: value.principal.subjectId,
        };
      },
    },
  });
  const options = {
    ...instance,
    mcpUrl: "http://localhost:4510/mcp",
    store,
    directory,
    audit,
    assertManagementCaller,
  };
  const service = createConsoleAdministrationService(options);
  cleanup.push(() => {
    void service.apiKeys.close();
  });
  return {
    path,
    db,
    store,
    users,
    context,
    directory,
    options,
    service,
    faults: {
      outcome(value: boolean) {
        failOutcome = value;
      },
      intent(value: boolean) {
        failIntent = value;
      },
      blockOutcome(value: Promise<void> | undefined, onEnter?: () => void) {
        blockOutcome = value;
        outcomeEntered = onEnter;
      },
    },
  };
}

test("disabled surviving owners and missing activity facts cannot satisfy recovery", () => {
  const f = fixture();
  expect(() => {
    // @ts-expect-error A caller without authoritative commit-time activity cannot construct a safe store.
    createConsoleAdministrationStore({ database: f.db, ...instance });
  }).toThrow();
  f.store.mutate("1", (snapshot) => ({
    ...snapshot,
    graph: {
      ...snapshot.graph,
      bindings: [
        ...snapshot.graph.bindings,
        {
          ...snapshot.graph.bindings[0]!,
          id: "second",
          principal: {
            ...snapshot.graph.bindings[0]!.principal,
            subjectId: "second",
          },
        },
      ],
    },
  }));
  f.users.set("second", { ...f.users.get("second")!, status: "disabled" });
  expect(() =>
    f.store.mutate("2", (snapshot) => ({
      ...snapshot,
      graph: {
        ...snapshot.graph,
        bindings: snapshot.graph.bindings.filter(
          (binding) => binding.principal.subjectId !== "owner"
        ),
      },
    }))
  ).toThrow();
  expect(f.store.admission("owner")).not.toBeNull();
});

test("persistent initialization does not overwrite; exact instances and two connections enforce CAS and recovery", async () => {
  const f = fixture();
  const secondDb = new Database(join(f.path, "state.db"));
  cleanup.push(() => secondDb.close());
  const second = createConsoleAdministrationStore({
    database: secondDb,
    ...instance,
    subjectActiveAtCommit: (subjectId) =>
      f.users.get(subjectId)?.status === "active",
  });
  expect(second.initializeInstance("replacement")).toBe(false);
  expect(second.admission("replacement")).toBeNull();
  const original = await f.store.roleStore.read(evaluation());
  const next = {
    ...original,
    graph: {
      ...original.graph,
      bindings: [
        ...original.graph.bindings,
        {
          id: "second",
          principal: {
            realmId: instance.realmId,
            subjectId: "second",
            kind: "user",
          },
          roleId: "instance-owner",
          scope: f.store.scope,
        },
      ],
    },
  };
  const results = await Promise.all([
    f.store.roleStore.compareAndSwap("1", next, evaluation()),
    second.roleStore.compareAndSwap("1", next, evaluation()),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  const current = await second.roleStore.read(evaluation());
  const removals = ["owner", "second"].map((id) => ({
    ...current,
    graph: {
      ...current.graph,
      bindings: current.graph.bindings.filter((binding) => binding.id !== id),
    },
  }));
  const removed = await Promise.all(
    removals.map((value, index) =>
      (index ? second : f.store).roleStore.compareAndSwap(
        current.revision,
        value,
        evaluation()
      )
    )
  );
  expect(removed.filter(Boolean)).toHaveLength(1);
  const last = await second.roleStore.read(evaluation());
  expect(() =>
    second.roleStore.compareAndSwap(
      last.revision,
      { ...last, graph: { ...last.graph, bindings: [] } },
      evaluation()
    )
  ).toThrow();
  const withoutRecovery = {
    ...last,
    graph: {
      ...last.graph,
      roles: last.graph.roles.map((role) => ({
        ...role,
        permissions: role.permissions.filter(
          (permission) => permission.action !== "members.promote"
        ),
      })),
    },
  };
  expect(() =>
    second.roleStore.compareAndSwap(
      last.revision,
      withoutRecovery,
      evaluation()
    )
  ).toThrow();
  expect(second.read()).toEqual(f.store.read());
  const other = createConsoleAdministrationStore({
    database: secondDb,
    ...instance,
    subjectActiveAtCommit: (subjectId) =>
      f.users.get(subjectId)?.status === "active",
    consoleId: "console-two",
  });
  expect(() => other.read()).toThrow();
  expect(other.initializeInstance("reader")).toBe(true);
  expect(other.admission("owner")).toBeNull();
  const foreign = {
    ...last,
    graph: {
      ...last.graph,
      roles: last.graph.roles.map((role) => ({ ...role, scope: other.scope })),
    },
  };
  expect(() =>
    second.roleStore.compareAndSwap(last.revision, foreign, evaluation())
  ).toThrow();
  const inheritedOwner = {
    ...last,
    graph: {
      ...last.graph,
      roles: last.graph.roles.map((role) =>
        role.id === "readonly"
          ? { ...role, inherits: ["instance-owner"] }
          : role
      ),
    },
  };
  const limitedResource = {
    ...last,
    graph: {
      ...last.graph,
      roles: last.graph.roles.map((role) =>
        role.id === "readonly"
          ? {
              ...role,
              permissions: role.permissions.map((permission) => ({
                ...permission,
                resourceId: "another-console",
              })),
            }
          : role
      ),
    },
  };
  expect(() =>
    second.roleStore.compareAndSwap(last.revision, inheritedOwner, evaluation())
  ).toThrow();
  expect(() =>
    second.roleStore.compareAndSwap(
      last.revision,
      limitedResource,
      evaluation()
    )
  ).toThrow();
});

test("server separates ordinary membership assignment from delegation and blocks self/agent escalation", async () => {
  const f = fixture();
  const owner = f.context();
  await expect(
    f.service.membersSet(
      { subjectId: "reader", roleId: "administrator", expectedRevision: "1" },
      owner
    )
  ).rejects.toMatchObject({ code: "DENIED" });
  await f.service.membersSet(
    { subjectId: "reader", roleId: "readonly", expectedRevision: "1" },
    owner
  );
  await expect(
    f.service.membersSet(
      { subjectId: "second", roleId: "readonly", expectedRevision: "1" },
      owner
    )
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    f.service.membersPromote(
      { subjectId: "reader", roleId: "administrator", expectedRevision: "2" },
      f.context("reader")
    )
  ).rejects.toThrow();
  const agent = f.context("owner", "agent", administrationActions);
  await expect(
    f.service.membersPromote(
      { subjectId: "reader", roleId: "administrator", expectedRevision: "2" },
      agent
    )
  ).rejects.toMatchObject({ code: "DENIED" });
  await expect(
    f.service.rolesSave(
      {
        id: "custom",
        label: "Custom",
        permissions: ["users.list"],
        expectedRevision: "2",
      },
      agent
    )
  ).rejects.toMatchObject({ code: "DENIED" });
  await expect(
    f.service.issueToken(
      {
        scopes: ["users.list"],
        requestId: "agent-issue",
        expiresAt: Date.now() + 100000,
      },
      agent
    )
  ).rejects.toMatchObject({ code: "DENIED" });
  await expect(
    f.service.usersDisable({ subjectId: "owner", expectedRevision: "2" }, owner)
  ).rejects.toMatchObject({ code: "DENIED" });
  await f.service.membersPromote(
    { subjectId: "reader", roleId: "administrator", expectedRevision: "2" },
    owner
  );
  await expect(
    f.service.rolesSave(
      {
        id: "delegation",
        label: "Delegate",
        permissions: ["members.promote"],
        expectedRevision: "3",
      },
      f.context("reader")
    )
  ).rejects.toMatchObject({ code: "DENIED" });
  await expect(
    f.service.membersPromote(
      { subjectId: "reader", roleId: "instance-owner", expectedRevision: "3" },
      f.context("reader")
    )
  ).rejects.toThrow();
  await expect(f.service.accessRead({}, { ...owner })).rejects.toThrow(
    "untrusted context"
  );
  await f.service.rolesSave(
    {
      id: "member-writer",
      label: "Member writer",
      permissions: ["members.write", "members.list"],
      expectedRevision: "3",
    },
    owner
  );
  await f.service.membersPromote(
    { subjectId: "reader", roleId: "member-writer", expectedRevision: "4" },
    owner
  );
  await expect(
    f.service.membersSet(
      { subjectId: "second", roleId: "readonly", expectedRevision: "5" },
      f.context("reader")
    )
  ).rejects.toThrow();
  expect(f.store.admission("second")).toBeNull();
  expect(f.store.read().revision).toBe("5");
});

test("PATs persist only digests, issue once, rotate without overlap, and revalidate revoked subject/membership/scope", async () => {
  const f = fixture();
  const owner = f.context();
  await f.service.membersPromote(
    { subjectId: "second", roleId: "administrator", expectedRevision: "1" },
    owner
  );
  const caller = f.context("second");
  const input = {
    scopes: ["users.list"] as const,
    expiresAt: Date.now() + 3600000,
    requestId: "request-one",
  };
  const issued = await f.service.issueToken(input, caller);
  expect(issued.credential).toBeString();
  expect(
    JSON.stringify(f.db.query("SELECT * FROM api_keys").all())
  ).not.toContain(issued.credential!);
  expect(JSON.stringify(await f.service.tokensList({}, caller))).not.toContain(
    "digest"
  );
  const replay = await f.service.issueToken(input, caller);
  expect(replay.replayed).toBe(true);
  expect(replay.credential).toBeNull();
  const ownerTokens = await f.service.tokensList({}, owner);
  expect(ownerTokens.items).toHaveLength(0);
  const rotated = await f.service.rotateToken(
    {
      id: issued.token.id,
      expectedRevision: issued.token.revision,
      overlapMs: 0,
    },
    caller
  );
  expect(await f.service.apiKeys.verify(issued.credential)).toBeNull();
  expect(await f.service.apiKeys.verify(rotated.credential)).not.toBeNull();
  await expect(
    f.service.rotateToken(
      {
        id: issued.token.id,
        expectedRevision: issued.token.revision,
        overlapMs: 0,
      },
      caller
    )
  ).rejects.toMatchObject({ code: "CONFLICT", message: "CONFLICT" });
  expect(await f.service.apiKeys.verify(rotated.credential)).not.toBeNull();
  const rotationAudit = await f.service.auditList({}, owner);
  expect(
    rotationAudit.items.filter(
      (event) => event.action === "tokens.rotate" && event.result === "failure"
    )
  ).toHaveLength(1);
  await expect(
    f.service.tokensRevoke(
      { id: issued.token.id, expectedRevision: issued.token.revision },
      caller
    )
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    f.service.apiKeys.use(rotated.credential, "users.list", {
      ...instance,
      tenantId: "another",
    })
  ).rejects.toThrow();
  await expect(
    f.service.apiKeys.use(rotated.credential, "members.promote", instance)
  ).rejects.toThrow();
  f.users.set("second", { ...f.users.get("second")!, status: "disabled" });
  expect(await f.service.apiKeys.verify(rotated.credential)).toBeNull();
  f.users.set("second", { ...f.users.get("second")!, status: "active" });
  await f.service.membersRevoke(
    { subjectId: "second", expectedRevision: "2" },
    owner
  );
  expect(await f.service.apiKeys.verify(rotated.credential)).toBeNull();
  await expect(f.service.usersList({}, caller)).rejects.toMatchObject({
    code: "DENIED",
  });
  await expect(
    f.service.issueToken(
      {
        ...input,
        requestId: "too-long",
        expiresAt: Date.now() + 31 * 86400000,
      },
      owner
    )
  ).rejects.toThrow();
  const ownerKey = await f.service.issueToken(
    { ...input, requestId: "owner-key" },
    owner
  );
  await f.service.tokensRevoke(
    { id: ownerKey.token.id, expectedRevision: ownerKey.token.revision },
    owner
  );
  expect(await f.service.apiKeys.verify(ownerKey.credential)).toBeNull();
});

// Provider rejections were being recorded as unknown; code-shaped foreign errors
// and owner reconciliation errors must not become evidence of a no-effect failure.
test.each([
  [new ApiKeyError("CONFLICT"), "CONFLICT"],
  [new ApiKeyError("INVALID_INPUT"), "INVALID_INPUT"],
  [new ApiKeyError("FORBIDDEN"), "DENIED"],
  [new SessionAdministrationError("invalid-input"), "INVALID_INPUT"],
  [new SessionAdministrationError("stale-revision"), "CONFLICT"],
  [new ApiKeyError("UNAVAILABLE"), "OUTCOME_UNKNOWN"],
  [
    new SessionAdministrationError("pending-reconciliation", "owner-intent"),
    "OUTCOME_UNKNOWN",
  ],
  [new SessionRevokeOutcomeUnknownError("owner-intent"), "OUTCOME_UNKNOWN"],
  [new AuditOutcomeUnknownError("owner-intent"), "OUTCOME_UNKNOWN"],
  [
    new AdministrationError(
      "OUTCOME_UNKNOWN",
      "a441ecfa-b499-4aa4-88f8-d5c1fe106ecc"
    ),
    "OUTCOME_UNKNOWN",
  ],
  [
    Object.assign(new Error("private provider detail"), { code: "CONFLICT" }),
    "OUTCOME_UNKNOWN",
  ],
] as const)(
  "audited provider error %s maps to %s without disclosing provider details",
  async (providerError, code) => {
    const f = fixture();
    if (!(providerError instanceof AdministrationError)) {
      providerError.message = "private provider detail";
    }
    const service = createConsoleAdministrationService({
      ...f.options,
      sessions: {
        async list() {
          return { items: [], nextCursor: null };
        },
        async revoke() {
          throw providerError;
        },
      },
    });
    cleanup.push(() => {
      void service.apiKeys.close();
    });
    const owner = f.context();
    const rejectedError = await service
      .sessionsRevoke(
        { id: "session-one", subjectId: "reader", expectedRevision: 1 },
        owner
      )
      .catch((error: unknown) => error);
    expect(rejectedError).toMatchObject({ code, message: code });
    const auditPage = await f.service.auditList({}, owner);
    const events = auditPage.items.filter(
      (event) => event.action === "sessions.revoke"
    );
    const intent = events.find((event) => event.result === "intent")!;
    expect(intent).toBeDefined();
    expect(events.find((event) => event.result !== "intent")).toMatchObject({
      result: code === "OUTCOME_UNKNOWN" ? "unknown" : "failure",
    });
    if (code === "OUTCOME_UNKNOWN") {
      expect(rejectedError).toMatchObject({
        intentId:
          providerError instanceof AdministrationError
            ? providerError.intentId
            : intent.id,
      });
    } else {
      expect(rejectedError).toMatchObject({ intentId: undefined });
    }
    expect(JSON.stringify(events)).not.toContain("private provider detail");
  }
);

test("output projection, strict audit gate/unknown outcome, and public Manage declaration omit credential methods", async () => {
  const f = fixture();
  const owner = f.context();
  f.users.set("reader", {
    ...f.users.get("reader")!,
    digest: "hidden",
  } as DirectoryUser);
  expect(JSON.stringify(await f.service.usersList({}, owner))).not.toContain(
    "hidden"
  );
  f.users.set("reader", { ...f.users.get("reader")!, realmId: "foreign" });
  await expect(f.service.usersList({}, owner)).rejects.toMatchObject({
    code: "DENIED",
  });
  f.users.set("reader", {
    ...f.users.get("reader")!,
    realmId: instance.realmId,
  });
  f.faults.intent(true);
  await expect(
    f.service.membersSet(
      { subjectId: "reader", roleId: "readonly", expectedRevision: "1" },
      owner
    )
  ).rejects.toThrow();
  expect(f.store.read().revision).toBe("1");
  f.faults.intent(false);
  f.faults.outcome(true);
  await expect(
    f.service.membersSet(
      { subjectId: "reader", roleId: "readonly", expectedRevision: "1" },
      owner
    )
  ).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
  expect(f.store.read().revision).toBe("2");
  f.faults.outcome(false);
  const plugin = createConsoleAdministration(f.options);
  const manage = createConsoleAdministrationManage(plugin);
  const declaration = describeManage(manage.manage);
  expect(declaration.pluginId).toBe(plugin.id);
  expect(declaration.views).toEqual([]);
  expect(declaration.extensions).toEqual({});
  expect(manage.operations.map((operation) => operation.method)).not.toContain(
    "issueToken"
  );
  expect(manage.operations.map((operation) => operation.method)).not.toContain(
    "rotateToken"
  );
  const running = await startApp({ plugins: [plugin] });
  try {
    const adapter = createManageAdapter({
      running,
      plugins: [plugin],
      operations: manage.operations,
      canList: () => true,
      binding: () => ({ context: owner }),
    });
    const result = await adapter.invoke(plugin.id, "accessRead", {});
    expect(result).toEqual(f.store.read());
    await expect(adapter.invoke(plugin.id, "issueToken", {})).rejects.toThrow();
  } finally {
    await running.stop();
  }
});

test("agent scopes intersect current grants and deferred reads cannot disclose after membership revoke", async () => {
  const f = fixture();
  const owner = f.context();
  const initialInfo = await f.service.info({}, owner);
  expect(initialInfo.observedLastCallAt).toBeNull();
  const agent = f.context("owner", "agent", ["users.list"]);
  await f.service.usersList({}, agent);
  await expect(
    f.service.usersRead({ subjectId: "reader" }, agent)
  ).rejects.toMatchObject({ code: "DENIED" });
  const observedInfo = await f.service.info({}, owner);
  expect(observedInfo.observedLastCallAt).toBeNumber();
  await f.service.membersSet(
    { subjectId: "reader", roleId: "readonly", expectedRevision: "1" },
    owner
  );
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const { list } = f.directory;
  f.directory.list = async () => {
    entered();
    await blocked;
    return list();
  };
  const read = f.service.usersList({}, f.context("reader"));
  await started;
  await f.service.membersRevoke(
    { subjectId: "reader", expectedRevision: "2" },
    owner
  );
  release();
  await expect(read).rejects.toMatchObject({ code: "DENIED" });
});

test("read disclosure rechecks caller membership after the awaited audit outcome", async () => {
  const f = fixture();
  await f.service.membersSet(
    { subjectId: "reader", roleId: "readonly", expectedRevision: "1" },
    f.context()
  );
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const completed = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.faults.blockOutcome(blocked, entered);
  const read = f.service.usersList({}, f.context("reader"));
  await completed;
  const current = await f.store.roleStore.read(evaluation());
  await f.store.roleStore.compareAndSwap(
    current.revision,
    {
      ...current,
      graph: {
        ...current.graph,
        bindings: current.graph.bindings.filter(
          (binding) => binding.principal.subjectId !== "reader"
        ),
      },
    },
    evaluation()
  );
  release();
  await expect(read).rejects.toMatchObject({ code: "DENIED" });
});
