import { describe, expect, test } from "bun:test";

import type { DashboardDocument } from "../src/contract";
import { DashboardDraft } from "../src/draft";
import {
  createAuthorizedDashboardStore,
  createMemoryDashboardRepository,
  DashboardConflictError,
  DashboardForbiddenError,
  DashboardMutationCollisionError,
  dashboardScopeKey,
  type DashboardAuthorization,
  type DashboardScope,
} from "../src/server";

const document: DashboardDocument = {
  schemaVersion: 1,
  instances: ["one", "two"].map((id) => ({
    id,
    definition: { bindingId: "jobs", widgetId: "status" },
    configVersion: 1,
    config: { target: id },
  })),
  placements: ["one", "two"].map((instanceId, row) => ({
    instanceId,
    column: 0,
    row: row * 2,
    width: 4,
    height: 2,
  })),
};
const definitions = [
  {
    bindingId: "jobs",
    widgetId: "status",
    configVersion: 1,
    configSchema: {
      parse(value: unknown) {
        if (
          !value ||
          typeof (value as { target?: unknown }).target !== "string"
        ) {
          throw new Error("Invalid target");
        }
        return { target: (value as { target: string }).target };
      },
    },
  },
];
type Context = {
  subject: string;
  read: boolean;
  write: boolean;
  widget: boolean;
};
const authorization: DashboardAuthorization<Context> = {
  resolveScope: (context) => ({
    applicationId: "app",
    dashboardId: "home",
    kind: "personal",
    realmId: "staff",
    ownerSubject: context.subject,
  }),
  revision: (context) => JSON.stringify(context),
  canRead: (context) => context.read,
  canWrite: (context) => context.write,
  canUseWidget: (context) => context.widget,
};
function setup() {
  const context = { subject: "alice", read: true, write: true, widget: true };
  const repository = createMemoryDashboardRepository(document);
  const make = (ctx = context, auth = authorization) =>
    createAuthorizedDashboardStore({
      context: ctx,
      authorization: auth,
      repository,
      definitions,
    });
  return { context, make, store: make() };
}

describe("dashboard contracts", () => {
  test("multiple instances keep independent config and undo only placement", () => {
    const draft = new DashboardDraft({ revision: "0", document });
    draft.setLayout(
      document.placements.map((placement) => ({ ...placement, column: 1 }))
    );
    draft.configure("one", { target: "changed" });
    draft.remove("two");
    draft.undoLayout();
    expect(draft.document.instances).toHaveLength(1);
    expect(draft.document.instances[0]?.config.target).toBe("changed");
    expect(draft.document.placements[0]?.column).toBe(0);
    expect(document.instances[0]?.config.target).toBe("one");
  });

  test("concurrent CAS admits only one writer and replay is idempotent", async () => {
    const { store } = setup();
    const first = { expectedRevision: "0", mutationId: "a", document };
    const results = await Promise.allSettled([
      store.save(first),
      store.save({ ...first, mutationId: "b" }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason).toBeInstanceOf(
      DashboardConflictError
    );
    const replayed = await store.save(first);
    expect(replayed.revision).toBe("1");
  });

  test("mutation ID cannot be replayed with different content", async () => {
    const { store } = setup();
    await store.save({ expectedRevision: "0", mutationId: "a", document });
    const changed = structuredClone(document);
    changed.instances[0]!.config = { target: "forged" };
    await expect(
      store.save({ expectedRevision: "0", mutationId: "a", document: changed })
    ).rejects.toBeInstanceOf(DashboardMutationCollisionError);
  });

  test("permission revisions close late projection and deleted-original gaps", async () => {
    const { context, make } = setup();
    let calls = 0;
    const store = make(context, {
      ...authorization,
      async canUseWidget() {
        calls += 1;
        if (calls === 2) {
          context.widget = false;
        }
        return true;
      },
    });
    await expect(store.read()).rejects.toBeInstanceOf(DashboardForbiddenError);
    calls = 0;
    context.widget = true;
    const draft = structuredClone(document);
    draft.instances.pop();
    draft.placements.pop();
    await expect(
      store.save({ expectedRevision: "0", mutationId: "late", document: draft })
    ).rejects.toBeInstanceOf(DashboardForbiddenError);
    context.widget = true;
    const unchanged = await make().read();
    expect(unchanged.revision).toBe("0");
    const invalid = {
      expectedRevision: "0",
      mutationId: {} as unknown as string,
      document,
    };
    await expect(make().save(invalid)).rejects.toThrow("Invalid mutation ID");
  });

  test("restricted projection redacts and ignores forged config and removal", async () => {
    const { store, context } = setup();
    context.widget = false;
    const projected = await store.read();
    expect(projected.restrictedInstanceIds).toEqual(["one", "two"]);
    expect(
      projected.document.instances.map((instance) => instance.config)
    ).toEqual([{}, {}]);
    const forged = structuredClone(projected.document);
    forged.instances[0]!.config = { target: "forged" };
    forged.instances.pop();
    forged.placements.pop();
    await store.save({
      expectedRevision: "0",
      mutationId: "a",
      document: forged,
    });
    context.widget = true;
    const retained = await store.read();
    expect(retained.document).toEqual(document);
  });

  test("new unauthorized instances and writes are rejected", async () => {
    const { store, context } = setup();
    context.write = false;
    await expect(
      store.save({ expectedRevision: "0", mutationId: "a", document })
    ).rejects.toBeInstanceOf(DashboardForbiddenError);
    context.write = true;
    context.widget = false;
    const forged = structuredClone(document);
    forged.instances.push({ ...forged.instances[0]!, id: "new" });
    forged.placements.push({
      ...forged.placements[0]!,
      instanceId: "new",
      row: 10,
    });
    await expect(
      store.save({ expectedRevision: "0", mutationId: "b", document: forged })
    ).rejects.toBeInstanceOf(DashboardForbiddenError);
  });

  test("scope has personal ownership but shared org keys do not contain viewer identity", async () => {
    const { store, make } = setup();
    await store.save({ expectedRevision: "0", mutationId: "a", document });
    const bob = make({ subject: "bob", read: true, write: true, widget: true });
    const personal = await bob.read();
    expect(personal.revision).toBe("0");
    const shared: DashboardScope = {
      applicationId: "app",
      dashboardId: "home",
      kind: "organization",
      organizationId: "org",
    };
    const orgAuth = { ...authorization, resolveScope: () => shared };
    const aliceOrg = make(undefined, orgAuth);
    const bobOrg = make(
      { subject: "bob", read: true, write: true, widget: true },
      orgAuth
    );
    await aliceOrg.save({
      expectedRevision: "0",
      mutationId: "shared",
      document,
    });
    const organization = await bobOrg.read();
    expect(organization.revision).toBe("1");
    expect(dashboardScopeKey(shared)).not.toContain("alice");
  });

  test("missing plugins survive projected saves and malformed geometry/config cannot be stored", async () => {
    const context = { subject: "alice", read: true, write: true, widget: true };
    const store = createAuthorizedDashboardStore({
      context,
      authorization,
      repository: createMemoryDashboardRepository(document),
      definitions: [],
    });
    const empty: DashboardDocument = {
      schemaVersion: 1,
      instances: [],
      placements: [],
    };
    const retained = await store.save({
      expectedRevision: "0",
      mutationId: "a",
      document: empty,
    });
    expect(retained.document).toEqual(document);
    const { store: validated } = setup();
    const invalid = structuredClone(document);
    invalid.instances[0]!.config = { target: 12 };
    await expect(
      validated.save({
        expectedRevision: "0",
        mutationId: "b",
        document: invalid,
      })
    ).rejects.toThrow("Invalid target");
    invalid.placements[0]!.column = 12;
    await expect(
      validated.save({
        expectedRevision: "0",
        mutationId: "c",
        document: invalid,
      })
    ).rejects.toThrow("Invalid widget placement");
    const duplicate = structuredClone(document);
    duplicate.instances[1]!.id = "one";
    await expect(
      validated.save({
        expectedRevision: "0",
        mutationId: "d",
        document: duplicate,
      })
    ).rejects.toThrow("duplicate");
    const overlapping = structuredClone(document);
    overlapping.placements[1]!.row = 0;
    await expect(
      validated.save({
        expectedRevision: "0",
        mutationId: "overlap",
        document: overlapping,
      })
    ).rejects.toThrow("overlap");
    const tooLarge = structuredClone(document);
    tooLarge.instances[0]!.config = { target: "x".repeat(256 * 1024) };
    await expect(
      validated.save({
        expectedRevision: "0",
        mutationId: "e",
        document: tooLarge,
      })
    ).rejects.toThrow("too large");
    const wrongVersion = structuredClone(document);
    wrongVersion.instances.push({
      ...wrongVersion.instances[0]!,
      id: "new",
      configVersion: 2,
    });
    wrongVersion.placements.push({
      ...wrongVersion.placements[0]!,
      instanceId: "new",
      row: 10,
    });
    await expect(
      validated.save({
        expectedRevision: "0",
        mutationId: "f",
        document: wrongVersion,
      })
    ).rejects.toThrow("Unavailable");
  });

  test("read policy revocation after an await denies the result", async () => {
    const context = { subject: "alice", read: true, write: true, widget: true };
    const store = createAuthorizedDashboardStore({
      context,
      repository: createMemoryDashboardRepository(document),
      definitions,
      authorization: {
        ...authorization,
        async canUseWidget() {
          await Promise.resolve();
          context.read = false;
          return true;
        },
      },
    });
    await expect(store.read()).rejects.toBeInstanceOf(DashboardForbiddenError);
  });

  test("write revocation during widget policy awaits leaves original revision unchanged", async () => {
    const context = { subject: "alice", read: true, write: true, widget: true };
    const repository = createMemoryDashboardRepository(document);
    const store = createAuthorizedDashboardStore({
      context,
      repository,
      definitions,
      authorization: {
        ...authorization,
        async canUseWidget() {
          await Promise.resolve();
          context.write = false;
          return true;
        },
      },
    });
    await expect(
      store.save({ expectedRevision: "0", mutationId: "a", document })
    ).rejects.toBeInstanceOf(DashboardForbiddenError);
    const unchanged = await store.read();
    expect(unchanged.revision).toBe("0");
  });
});
