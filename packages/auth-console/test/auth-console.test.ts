import { describe, expect, test } from "bun:test";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import { definePlugin } from "@lenso/core/plugin";

import { createAuthConsoleServer, sessionDTO } from "../src/server";

function fixture() {
  const customerSource = defineSource<string>({
    async verify() {
      return { status: "rejected" };
    },
  });
  const customerA = createAuth(realm("customers", customerSource));
  const customerB = createAuth(realm("customers", customerSource));
  const staffAuth = createAuth(
    realm(
      "staff",
      defineSource<string>({
        async verify(token) {
          return token === "staff-a" || token === "staff-b"
            ? { status: "verified", subjectId: token }
            : { status: "rejected" };
        },
      })
    )
  );
  const targetA = {
    plugin: definePlugin({ id: "customer-a", setup: () => customerA }),
    access: customerA.for(audience("customer")),
  };
  const targetB = {
    plugin: definePlugin({ id: "customer-b", setup: () => customerB }),
    access: customerB.for(audience("customer")),
  };
  const revoked: string[] = [];
  function adapter(target: typeof targetA | typeof targetB) {
    return createAuthConsoleServer({
      target,
      staff: staffAuth.for(audience("console")),
      policy: ({ actor, target: actual }) =>
        actor.realmId === "staff" &&
        actual.plugin === target.plugin &&
        actual.access === target.access &&
        actor.subjectId ===
          (target.plugin === targetA.plugin ? "staff-a" : "staff-b"),
      sessions: {
        async list(context) {
          expect(context.actor.realmId).toBe("staff");
          expect(context.target.plugin).toBe(target.plugin);
          expect(context.target.access).toBe(target.access);
          return [
            {
              id: "same-session-id",
              realmId: "customers",
              subjectId: target.plugin.id,
              createdAt: 1,
              expiresAt: 1000,
              tokenDigest: "must-not-leak",
              token: "must-not-leak",
              metadata: { secret: true },
            },
          ];
        },
        async read(id, context) {
          return {
            id,
            realmId: "customers",
            subjectId: context.target.plugin.id,
            createdAt: 1,
            expiresAt: 1000,
          };
        },
        async revoke(id, context) {
          revoked.push(`${context.target.plugin.id}:${id}`);
          return true;
        },
      },
    });
  }
  return {
    a: adapter(targetA),
    b: adapter(targetB),
    revoked,
    staffAuth,
    customerA,
    customerB,
  };
}

describe("authorized app-owned Auth Console capabilities", () => {
  // Legacy repository coverage cannot prove domain pagination, actor identity or CAS forwarding.
  test("domain administration keeps exact targets, staff actors, cursor pages and revision writes", async () => {
    const f = fixture();
    const staff = f.staffAuth.for(audience("console"));
    const targets = [f.customerA, f.customerB].map((auth, index) => ({
      plugin: definePlugin({ id: `target-${index}`, setup: () => auth }),
      access: auth.for(audience("customer")),
    }));
    const writes: unknown[] = [];
    const row = {
      id: "same-id",
      realmId: "customers",
      subjectId: "subject",
      kind: "user",
      revision: 3,
      issuedAt: 1,
      expiresAt: 2000,
      lastActiveAt: 10,
      revokedAt: null,
      tokenDigest: "must-not-leak",
    };
    try {
      for (const [index, target] of targets.entries()) {
        let verifiedActor:
          | Awaited<ReturnType<typeof staff.required>>
          | undefined;
        const server = createAuthConsoleServer({
          target,
          staff,
          maxResults: 2,
          policy: (context) => {
            expect(context.target.plugin).toBe(target.plugin);
            expect(context.target.access).toBe(target.access);
            verifiedActor = context.actor;
            return (
              context.actor.subjectId === (index === 0 ? "staff-a" : "staff-b")
            );
          },
          administration: {
            async list(input, actor, options) {
              expect(actor === verifiedActor).toBe(true);
              expect(actor.realmId).toBe("staff");
              expect(options?.signal).toBeInstanceOf(AbortSignal);
              expect(input).toEqual({
                limit: 1,
                ...(input.cursor ? { cursor: "opaque-next" } : {}),
              });
              return {
                sessions: [{ ...row, subjectId: target.plugin.id }],
                nextCursor: input.cursor ? null : "opaque-next",
              };
            },
            async get(input, actor) {
              expect(actor === verifiedActor).toBe(true);
              expect(input).toEqual({ id: "same-id" });
              return row;
            },
            async revoke(input, actor) {
              expect(actor === verifiedActor).toBe(true);
              writes.push({ target: target.plugin, ...input });
              return { revoked: true, intentId: `intent-${index}` };
            },
          },
        });
        const evidence = index === 0 ? "staff-a" : "staff-b";
        const first = await server.listSessionPage!(evidence, { limit: 1 });
        expect(first.sessions[0]!.subjectId).toBe(target.plugin.id);
        expect(first.sessions[0]!.createdAt).toBe(row.issuedAt);
        expect(first.sessions[0]!.revision).toBe(3);
        expect(first.nextCursor).toBe("opaque-next");
        expect(JSON.stringify(first)).not.toContain("must-not-leak");
        expect("issuedAt" in first.sessions[0]!).toBe(false);
        const last = await server.listSessionPage!(evidence, {
          limit: 1,
          cursor: first.nextCursor!,
        });
        expect(last.nextCursor).toBeNull();
        expect((await server.readSession!(evidence, "same-id"))!.revision).toBe(
          3
        );
        expect(
          await server.revokeSession!(evidence, "same-id", undefined, 3)
        ).toEqual({ revoked: true, intentId: `intent-${index}` });
        await expect(
          server.revokeSession!(evidence, "same-id")
        ).rejects.toThrow("revision");
        await expect(
          server.revokeSession!(
            index === 0 ? "staff-b" : "staff-a",
            "same-id",
            undefined,
            3
          )
        ).rejects.toThrow();
        await expect(
          server.listSessionPage!(evidence, { limit: 3 })
        ).rejects.toThrow("limit");
      }
      expect(writes).toEqual(
        targets.map((target) => ({
          target: target.plugin,
          id: "same-id",
          expectedRevision: 3,
        }))
      );
      for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => sessionDTO({ ...row, revision: invalid }, true)).toThrow(
          "revision"
        );
      }
    } finally {
      await Promise.all([
        f.staffAuth.close(),
        f.customerA.close(),
        f.customerB.close(),
      ]);
    }
  });

  // Abort-ignoring domain backends must not release a late page or replace a newer cursor result.
  test("cancels a deferred page and propagates audited write uncertainty without retry", async () => {
    const f = fixture();
    let finish!: (value: {
      sessions: readonly unknown[];
      nextCursor: string | null;
    }) => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    const uncertain = Object.assign(new Error("Audit completion unknown"), {
      code: "outcome-unknown",
      intentId: "intent",
    });
    let attempts = 0;
    const server = createAuthConsoleServer({
      target: {
        plugin: definePlugin({ id: "deferred", setup: () => f.customerA }),
        access: f.customerA.for(audience("customer")),
      },
      staff: f.staffAuth.for(audience("console")),
      policy: () => true,
      administration: {
        list: async () => {
          started();
          return new Promise<{
            sessions: readonly unknown[];
            nextCursor: string | null;
          }>((resolve) => {
            finish = resolve;
          });
        },
        get: async () => null,
        revoke: async () => {
          attempts += 1;
          throw uncertain;
        },
      },
    });
    try {
      const controller = new AbortController();
      const late = server.listSessionPage!(
        "staff-a",
        { cursor: "old" },
        controller.signal
      );
      await pending;
      controller.abort();
      finish({ sessions: [], nextCursor: "late-cursor" });
      await expect(late).rejects.toThrow();
      try {
        await server.revokeSession!("staff-a", "session", undefined, 1);
        throw new Error("Expected uncertainty");
      } catch (error) {
        expect(error).toBe(uncertain);
      }
      expect(attempts).toBe(1);
    } finally {
      await Promise.all([
        f.staffAuth.close(),
        f.customerA.close(),
        f.customerB.close(),
      ]);
    }
  });

  // Auth core tests cannot cover a new adapter's staff-to-target boundary or output projection.
  test("two same-realm target instances remain isolated with a separate trusted staff Auth", async () => {
    const f = fixture();
    try {
      const a = await f.a.listSessions!("staff-a");
      const b = await f.b.listSessions!("staff-b");
      expect(a[0]!.subjectId).toBe("customer-a");
      expect(b[0]!.subjectId).toBe("customer-b");
      expect(JSON.stringify(a)).not.toContain("must-not-leak");
      expect(Object.keys(a[0]!)).toEqual([
        "id",
        "realmId",
        "subjectId",
        "createdAt",
        "expiresAt",
      ]);
      expect(
        (await f.a.readSession!("staff-a", "same-session-id"))!.subjectId
      ).toBe("customer-a");
      await f.a.revokeSession!("staff-a", "same-session-id");
      expect(f.revoked).toEqual(["customer-a:same-session-id"]);
      await expect(
        f.b.revokeSession!("staff-a", "same-session-id")
      ).rejects.toThrow();
      await expect(f.a.listSessions!("staff-b")).rejects.toThrow();
      await expect(f.a.listSessions!("untrusted")).rejects.toThrow();
      expect(f.revoked).toHaveLength(1);
    } finally {
      await Promise.all([
        f.staffAuth.close(),
        f.customerA.close(),
        f.customerB.close(),
      ]);
    }
  });

  test("invalid public output fails rather than leaking raw repository data", () => {
    expect(() =>
      sessionDTO({
        id: "s",
        realmId: "r",
        subjectId: "u",
        createdAt: 1,
        expiresAt: "secret",
      })
    ).toThrow();
  });

  test("rechecks permission after a deferred repository read before releasing its DTO", async () => {
    const f = fixture();
    let finish!: (rows: readonly unknown[]) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const target = {
      plugin: definePlugin({
        id: "deferred-customer",
        setup: () => f.customerA,
      }),
      access: f.customerA.for(audience("customer")),
    };
    let permitted = true;
    const server = createAuthConsoleServer({
      target,
      staff: f.staffAuth.for(audience("console")),
      policy: () => permitted,
      sessions: {
        list: () => {
          markStarted();
          return new Promise<readonly unknown[]>((resolve) => {
            finish = resolve;
          });
        },
      },
    });
    try {
      const result = server.listSessions!("staff-a");
      await started;
      permitted = false;
      finish([
        {
          id: "private",
          realmId: "customers",
          subjectId: "user",
          createdAt: 1,
          expiresAt: 2,
        },
      ]);
      await expect(result).rejects.toThrow();
    } finally {
      await Promise.all([
        f.staffAuth.close(),
        f.customerA.close(),
        f.customerB.close(),
      ]);
    }
  });

  test("rejects a list over its configured output budget before projecting entries", async () => {
    const f = fixture();
    const target = {
      plugin: definePlugin({
        id: "bounded-customer",
        setup: () => f.customerA,
      }),
      access: f.customerA.for(audience("customer")),
    };
    const server = createAuthConsoleServer({
      target,
      staff: f.staffAuth.for(audience("console")),
      policy: () => true,
      maxResults: 1,
      sessions: {
        list: async () => [
          {
            id: "first",
            realmId: "customers",
            subjectId: "user",
            createdAt: 1,
            expiresAt: 2,
          },
          null,
        ],
      },
    });
    try {
      await expect(server.listSessions!("staff-a")).rejects.toThrow(
        "result limit"
      );
    } finally {
      await Promise.all([
        f.staffAuth.close(),
        f.customerA.close(),
        f.customerB.close(),
      ]);
    }
  });

  // Prevents fabricated pages or successful no-op methods when Auth has no admin backend.
  test("no repository means no session/subject capabilities, methods, routes or navigation", async () => {
    const auth = createAuth(
      realm(
        "staff",
        defineSource<string>({
          async verify() {
            return { status: "rejected" };
          },
        })
      )
    );
    try {
      const server = createAuthConsoleServer({
        target: {
          plugin: definePlugin({ id: "target", setup: () => auth }),
          access: auth.for(audience("customer")),
        },
        staff: auth.for(audience("console")),
        policy: () => false,
      });
      expect(server.capabilities).toEqual({
        info: false,
        sessionList: false,
        sessionDetail: false,
        sessionRevoke: false,
        subjects: false,
      });
      expect("listSessions" in server).toBe(false);
      expect("revokeSession" in server).toBe(false);
      expect("listSubjects" in server).toBe(false);
    } finally {
      await auth.close();
    }
  });
});
