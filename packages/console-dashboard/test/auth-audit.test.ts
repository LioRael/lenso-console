import { afterEach, expect, test } from "bun:test";

import {
  createAuditService,
  sameEvent,
  type AuditEvent,
  type AuditRepository,
} from "@lenso/audit";
import {
  audience,
  createAuth,
  defineSource,
  realm,
  type ActorOf,
} from "@lenso/auth";

import type { DashboardDocument, DashboardStore } from "../src/contract";
import {
  createAuthorizedDashboardStore,
  createMemoryDashboardRepository,
  DashboardConflictError,
  DashboardForbiddenError,
  dashboardScopeKey,
  type DashboardAuthorization,
} from "../src/server";
import {
  createAuditedDashboardStore,
  createDashboardMutationReplayReader,
  DashboardAuditOutcomeUnknownError,
} from "../src/server-audit";
import {
  createAuthDashboardStore,
  createDashboardAuthAuthorization,
  type DashboardAuthOptions,
  type DashboardAuthResource,
  type DashboardOwnership,
} from "../src/server-auth";

// Existing generic policy tests cannot detect forged Auth actors or strict
// Audit receipt/replay mistakes. These fixtures exercise both published APIs.
const empty: DashboardDocument = {
  schemaVersion: 1,
  instances: [],
  placements: [],
};
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

function authFixture() {
  const state = {
    enabled: true,
    version: 1,
    retireOnWrite: false,
    widget: true,
  };
  const auth = createAuth(
    realm(
      "staff",
      defineSource({
        async verify(token: string) {
          return state.enabled && ["alice", "bob"].includes(token)
            ? { status: "verified" as const, subjectId: token }
            : { status: "rejected" as const };
        },
      })
    )
  );
  closers.push(() => auth.close());
  const access = auth
    .for(audience("console:dashboard"))
    .memberships(async (_subject, resource: DashboardAuthResource) =>
      resource.scope.targetId === "north"
        ? { version: state.version, read: true, write: true }
        : null
    );
  const ownership: DashboardOwnership = {
    applicationId: "console",
    dashboardId: "home",
    targetId: "north",
    tenantId: "tenant-one",
    kind: "personal",
  };
  const options: DashboardAuthOptions<
    "staff",
    string,
    string,
    "console:dashboard",
    {
      version: number;
      read: boolean;
      write: boolean;
    }
  > = {
    access,
    ownership,
    policies: {
      read: ({ membership }) => membership.read,
      write: ({ membership }) => {
        if (state.retireOnWrite) {
          state.version += 1;
        }
        return membership.write;
      },
      widget: () => state.widget,
    },
    revision: ({ membership }) =>
      `graph:1/member:${membership.version}/session:1/policy:1`,
  };
  return { auth, access, options, state };
}

test("actual Auth rejects plain/cloned actors, foreign audience, revoked evidence and wrong trusted target", async () => {
  const { auth, access, options, state } = authFixture();
  const actor = await access.required("alice");
  const authorization = createDashboardAuthAuthorization(options);
  const foreign = await auth.for(audience("other")).required("alice");
  const otherRuntime = await authFixture().access.required("alice");
  for (const principal of [
    { ...actor },
    structuredClone(actor),
    foreign,
    otherRuntime,
  ]) {
    await expect(
      authorization.resolveScope(principal as ActorOf<typeof access>)
    ).rejects.toBeInstanceOf(DashboardForbiddenError);
  }
  const scope = await authorization.resolveScope(actor);
  await expect(
    authorization.canWrite(actor, { ...scope, targetId: "south" })
  ).rejects.toBeInstanceOf(DashboardForbiddenError);
  const wrong = createDashboardAuthAuthorization({
    ...options,
    ownership: { ...options.ownership, targetId: "south" },
  });
  await expect(wrong.resolveScope(actor)).rejects.toBeInstanceOf(
    DashboardForbiddenError
  );
  state.enabled = false;
  await expect(authorization.resolveScope(actor)).rejects.toBeInstanceOf(
    DashboardForbiddenError
  );
});

test("personal scopes derive verified realm/subject; organization viewers share one fixed scope", async () => {
  const { access, options } = authFixture();
  const alice = await access.required("alice");
  const bob = await access.required("bob");
  const personal = createDashboardAuthAuthorization(options);
  const aliceScope = await personal.resolveScope(alice);
  expect(aliceScope).toMatchObject({ realmId: "staff", ownerSubject: "alice" });
  expect(dashboardScopeKey(aliceScope)).not.toBe(
    dashboardScopeKey(await personal.resolveScope(bob))
  );
  const sharedOptions = {
    ...options,
    ownership: {
      ...options.ownership,
      kind: "organization" as const,
      organizationId: "ops",
    },
  };
  const shared = createDashboardAuthAuthorization(sharedOptions);
  expect(dashboardScopeKey(await shared.resolveScope(alice))).toBe(
    dashboardScopeKey(await shared.resolveScope(bob))
  );
  const repository = createMemoryDashboardRepository(empty);
  const first = createAuthDashboardStore({
    ...sharedOptions,
    principal: alice,
    repository,
    definitions: [],
  });
  const second = createAuthDashboardStore({
    ...sharedOptions,
    principal: bob,
    repository,
    definitions: [],
  });
  await first.save({
    expectedRevision: "0",
    mutationId: "shared",
    document: empty,
  });
  const sharedSnapshot = await second.read();
  expect(sharedSnapshot.revision).toBe("1");
});

test("trusted permission revision retirement rejects a write and missing version fails closed", async () => {
  const { access, options, state } = authFixture();
  const principal = await access.required("alice");
  const repository = createMemoryDashboardRepository(empty);
  const store = createAuthDashboardStore({
    ...options,
    principal,
    repository,
    definitions: [],
  });
  state.retireOnWrite = true;
  await expect(
    store.save({
      expectedRevision: "0",
      mutationId: "retired",
      document: empty,
    })
  ).rejects.toBeInstanceOf(DashboardForbiddenError);
  state.retireOnWrite = false;
  const afterRetirement = await store.read();
  expect(afterRetirement.revision).toBe("0");
  const invalid = createAuthDashboardStore({
    ...options,
    revision: () => "",
    principal,
    repository,
    definitions: [],
  });
  await expect(invalid.read()).rejects.toBeInstanceOf(DashboardForbiddenError);
});

function auditFixture() {
  const events = new Map<string, AuditEvent>();
  const state = {
    failPrepare: false,
    failComplete: false,
    queryAllowed: true,
    writes: 0,
    now: 1000,
  };
  const repository: AuditRepository = {
    // Test-only durable-intent simulation; not an application durable backend.
    durableIntents: true,
    async insert(event) {
      if (
        (event.result === "intent" && state.failPrepare) ||
        (event.result !== "intent" && state.failComplete)
      ) {
        throw new Error("fixture-credential");
      }
      const old = events.get(event.id);
      if (old) {
        return sameEvent(old, event) ? "duplicate" : "conflict";
      }
      events.set(event.id, structuredClone(event));
      return "inserted";
    },
    async get(_scope, id) {
      return events.get(id) ?? null;
    },
    async list(query) {
      return [...events.values()].filter(
        (event) =>
          !query.target ||
          (event.target.type === query.target.type &&
            event.target.id === query.target.id)
      );
    },
  };
  const audit = createAuditService({
    repository,
    authority: {
      async resolve(principal: string, _scope, operation) {
        if (operation === "query" && !state.queryAllowed) {
          throw new Error("unauthorized");
        }
        return {
          kind: "user" as const,
          realmId: "staff",
          subjectId: principal,
        };
      },
    },
    summaryPolicy: {
      "dashboard.save": {
        instanceCount: { type: "integer", min: 0, max: 100 },
        placementCount: { type: "integer", min: 0, max: 100 },
      },
    },
    clock: () => {
      const { now } = state;
      state.now += 1;
      return now;
    },
  });
  const authorization: DashboardAuthorization<null> = {
    resolveScope: () => ({
      applicationId: "console",
      dashboardId: "home",
      kind: "personal",
      realmId: "staff",
      ownerSubject: "alice",
    }),
    revision: () => "policy:1",
    canRead: () => true,
    canWrite: () => true,
    canUseWidget: () => true,
  };
  const dashboardRepository = createMemoryDashboardRepository(empty);
  const storeOptions = {
    context: null,
    authorization,
    repository: dashboardRepository,
    definitions: [],
  };
  const base = createAuthorizedDashboardStore(storeOptions);
  const counted: DashboardStore = {
    read: (options) => base.read(options),
    async save(input, options) {
      state.writes += 1;
      return base.save(input, options);
    },
  };
  const replay = createDashboardMutationReplayReader(storeOptions);
  const make = (store: DashboardStore = counted) =>
    createAuditedDashboardStore({
      store,
      audit,
      principal: "alice",
      scope: { tenantId: "tenant-one", scopeId: "dashboard-home" },
      targetId: "console-home-alice",
      replay,
      clock: () => {
        const { now } = state;
        state.now += 1;
        return now;
      },
    });
  const input = { expectedRevision: "0", mutationId: "one", document: empty };
  return { events, state, make, input, base, counted, audit, replay };
}

test("strict real Audit prepare failure prevents the store write", async () => {
  const { state, make, input, base } = auditFixture();
  state.failPrepare = true;
  await expect(make().save(input)).rejects.toMatchObject({
    code: "storage-failed",
  });
  expect(state.writes).toBe(0);
  const afterPrepareFailure = await base.read();
  expect(afterPrepareFailure.revision).toBe("0");
});

test("strict success replay uses stable intent timestamp and reads prior outcome without repeating save", async () => {
  const { state, make, input, events, audit } = auditFixture();
  const result = await make().save(input);
  const original = [...events.values()].find(
    (event) => event.result === "intent"
  )!;
  state.now = 9000;
  expect(await make().save(input)).toEqual(result);
  expect(state.writes).toBe(1);
  expect(events.size).toBe(2);
  expect(events.get(original.id)?.occurredAt).toBe(original.occurredAt);
  expect(original.summary).toEqual({ instanceCount: 0, placementCount: 0 });
  const page = await audit.query(
    {
      scope: { tenantId: "tenant-one", scopeId: "dashboard-home" },
      target: { type: "dashboard", id: "console-home-alice" },
    },
    "alice"
  );
  expect(page.events).toHaveLength(2);
  await expect(
    make().save({ ...input, expectedRevision: "other" })
  ).rejects.toMatchObject({ code: "duplicate-conflict" });
  expect(state.writes).toBe(1);
  state.queryAllowed = false;
  await expect(make().save(input)).rejects.toMatchObject({
    code: "unauthorized",
  });
  expect(state.writes).toBe(1);
});

test("concurrent identical intents reuse the winning timestamp instead of falsely colliding", async () => {
  const { state, make, input } = auditFixture();
  const results = await Promise.allSettled([
    make().save(input),
    make().save(input),
  ]);
  expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  for (const result of results) {
    if (result.status === "rejected") {
      expect(result.reason).toBeInstanceOf(DashboardAuditOutcomeUnknownError);
    }
  }
  expect(state.writes).toBe(1);
  const replaySnapshot = await make().save(input);
  expect(replaySnapshot.revision).toBe("1");
  expect(state.writes).toBe(1);
});

test("a recorded intent without an outcome is unknown, never a new write", async () => {
  const { state, make, input } = auditFixture();
  let ready!: () => void;
  const prepared = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pendingStore: DashboardStore = {
    read: () => Promise.resolve({ revision: "0", document: empty }),
    async save() {
      state.writes += 1;
      ready();
      await wait;
      throw new Error("dispatched");
    },
  };
  const pending = (async () => {
    try {
      return await make(pendingStore).save(input);
    } catch (error) {
      return error;
    }
  })();
  await prepared;
  await expect(make().save(input)).rejects.toBeInstanceOf(
    DashboardAuditOutcomeUnknownError
  );
  expect(state.writes).toBe(1);
  release();
  expect(await pending).toBeInstanceOf(DashboardAuditOutcomeUnknownError);
});

test("unknown dispatched effect and complete failure never report rollback/success or repeat write", async () => {
  for (const failure of ["dispatch", "complete"] as const) {
    const { state, make, input, base, counted, events } = auditFixture();
    state.failComplete = failure === "complete";
    const uncertain: DashboardStore = {
      read: counted.read,
      async save(request, options) {
        await counted.save(request, options);
        throw new Error("SQL acknowledgement lost");
      },
    };
    await expect(
      make(failure === "dispatch" ? uncertain : counted).save(input)
    ).rejects.toBeInstanceOf(DashboardAuditOutcomeUnknownError);
    const afterUnknownOutcome = await base.read();
    expect(afterUnknownOutcome.revision).toBe("1");
    await expect(make().save(input)).rejects.toBeInstanceOf(
      DashboardAuditOutcomeUnknownError
    );
    expect(state.writes).toBe(1);
    expect(
      [...events.values()].some((event) => event.result === "success")
    ).toBe(false);
  }
});

test("known conflict records failure and replay does not dispatch; event metadata excludes raw documents", async () => {
  const { state, make, input, events } = auditFixture();
  const secretDocument: DashboardDocument = {
    schemaVersion: 1,
    instances: [
      {
        id: "one",
        definition: { bindingId: "jobs", widgetId: "status" },
        configVersion: 1,
        config: { password: "fixture-private-config" },
      },
    ],
    placements: [{ instanceId: "one", column: 0, row: 0, width: 1, height: 1 }],
  };
  const conflict: DashboardStore = {
    read: () => Promise.resolve({ revision: "0", document: empty }),
    async save() {
      state.writes += 1;
      throw new DashboardConflictError();
    },
  };
  const request = { ...input, document: secretDocument };
  await expect(make(conflict).save(request)).rejects.toBeInstanceOf(
    DashboardConflictError
  );
  await expect(make(conflict).save(request)).rejects.toBeInstanceOf(
    DashboardConflictError
  );
  const changed = structuredClone(request);
  changed.document.instances[0]!.config = {
    password: "different-private-config",
  };
  await expect(make(conflict).save(changed)).rejects.toMatchObject({
    code: "duplicate-conflict",
  });
  expect(state.writes).toBe(1);
  const serialized = JSON.stringify([...events.values()]);
  expect(serialized).not.toContain("fixture-private-config");
  expect(serialized).not.toContain("password");
  expect(serialized).not.toContain("widgetId");
  expect(
    [...events.values()].find((event) => event.result === "intent")?.summary
  ).toEqual({ instanceCount: 1, placementCount: 1 });
});
