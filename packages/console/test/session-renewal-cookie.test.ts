import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineSource } from "@lenso/auth";
import { createManagedSessions } from "@lenso/auth/sessions";
import type { SessionRecord } from "@lenso/auth/sessions";
import { chromium } from "playwright";

const readCredential = (request: Request) =>
  /(?:^|;\s*)synthetic_console=([^;]+)/u.exec(
    request.headers.get("cookie") ?? ""
  )?.[1] ?? null;

// Helper-only tab tests cannot establish shared-cookie rotation or disk persistence.
// This fixture uses the actual session owner, SDK identity lock and browser cookie jar.
test("shared Cookie rotates once under browser locks, persists browser restart, and respects logout/revocation", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "console-cookie-renew-"));
  const profile = join(scratch, "profile");
  const day = 86_400_000;
  let now = Date.now();
  const records = new Map<string, SessionRecord>();
  let logins = 0,
    renewals = 0;
  let initialCredential = "";
  const sessions = createManagedSessions({
    lifetime: { absolute: 30 * day, idle: 7 * day, renewAfter: 60_000 },
    login: defineSource<string>({
      capabilities: { authenticatedAt: true },
      async verify() {
        return {
          status: "verified",
          subjectId: "synthetic",
          kind: "user",
          session: { expiresAt: now + 30 * day, authenticatedAt: now },
        };
      },
    }),
    now: () => now,
    realmId: "synthetic-console",
    store: {
      async create(record) {
        records.set(record.id, structuredClone(record));
      },
      async mutate(mutation) {
        const old = records.get(mutation.next.id);
        if (
          !old ||
          old.revision !== mutation.expectedRevision ||
          old.tokenDigest !== mutation.expectedDigest ||
          old.revokedAt !== null ||
          now >= Math.min(old.expiresAt, old.lastActiveAt + old.idleTimeoutMs)
        ) {
          return false;
        }
        records.set(old.id, structuredClone(mutation.next));
        return true;
      },
      async read(realmId, id) {
        const record = records.get(id);
        return record?.realmId === realmId ? structuredClone(record) : null;
      },
      async revoke(realmId, id, at) {
        const old = records.get(id);
        if (!old || old.realmId !== realmId || old.revokedAt !== null) {
          return false;
        }
        records.set(id, { ...old, revokedAt: at, revision: old.revision + 1 });
        return true;
      },
    },
    subjectActive: async () => true,
  });
  const cookie = (credential: string, expiresAt: number) =>
    `synthetic_console=${credential}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((expiresAt - now) / 1000)}`;
  let script = "";

  const server = Bun.serve({
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/") {
        return new Response(
          '<!doctype html><script src="/fixture.js"></script>',
          { headers: { "content-type": "text/html" } }
        );
      }
      if (path === "/fixture.js") {
        return new Response(script, {
          headers: { "content-type": "text/javascript" },
        });
      }
      try {
        if (path === "/login" && request.method === "POST") {
          const issued = await sessions.issue("synthetic");
          logins += 1;
          initialCredential ||= issued.credential;
          return new Response(null, {
            headers: {
              "set-cookie": cookie(issued.credential, issued.expiresAt),
            },
          });
        }
        const value = readCredential(request);
        if (!value) {
          return new Response(null, { status: 401 });
        }
        if (path === "/status") {
          return Response.json(await sessions.status(value));
        }
        if (path === "/renew" && request.method === "POST") {
          const next = await sessions.renew(value);
          renewals += 1;
          return new Response(null, {
            headers: { "set-cookie": cookie(next.credential, next.expiresAt) },
          });
        }
        if (path === "/logout" && request.method === "POST") {
          await sessions.revoke(value);
          return new Response(null, {
            headers: {
              "set-cookie":
                "synthetic_console=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
            },
          });
        }
        if (path === "/revoke" && request.method === "POST") {
          // Fixture-owned administrative boundary; no production management API or grant is claimed.
          await sessions.revoke(value);
          return new Response(null);
        }
        return new Response(null, { status: 404 });
      } catch {
        return new Response(null, { status: 401 });
      }
    },
    hostname: "127.0.0.1",
    port: 0,
  });
  const executablePath = process.env.LENSO_BROWSER_EXECUTABLE_PATH?.trim();
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  let context: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const entry = join(scratch, "entry.ts");
    await writeFile(
      entry,
      `import {withConditionalIdentityTransition} from ${JSON.stringify(new URL("../../console-authoring/src/identity-transition.ts", import.meta.url).pathname)};
      import {sessionRenewalDue,parseSessionRenewalStatus} from ${JSON.stringify(new URL("../../console-authoring/src/session-renewal.ts", import.meta.url).pathname)};
      globalThis.fixture={async read(){return (await fetch('/status')).status},async renew(){return withConditionalIdentityTransition(async()=>{const response=await fetch('/status');if(!response.ok)throw new Error('unavailable');return sessionRenewalDue(parseSessionRenewalStatus(await response.json()))},async()=>{if(!(await fetch('/renew',{method:'POST'})).ok)throw new Error('unavailable')},new AbortController().signal)}};`
    );
    const bundle = await Bun.build({
      entrypoints: [entry],
      format: "iife",
      target: "browser",
    });
    if (!bundle.success) {
      throw new Error("Cookie fixture browser bundle failed");
    }
    script = await bundle.outputs[0]!.text();
    context = await launch();
    const first = await context.newPage(),
      second = await context.newPage();
    await Promise.all([
      first.goto(String(server.url)),
      second.goto(String(server.url)),
    ]);
    expect(await first.evaluate(() => !!navigator.locks)).toBe(true);
    expect(
      await first.evaluate(async () => {
        const response = await fetch("/login", { method: "POST" });
        return response.status;
      })
    ).toBe(200);
    const observed = await second.evaluate(async () => {
      const response = await fetch("/status");
      return response.status;
    });
    expect(observed).toBe(200);
    const before = await context.cookies();
    expect(before.length).toBe(1);
    expect(before[0]!.httpOnly).toBe(true);
    expect(before[0]!.expires).toBeGreaterThan(Date.now() / 1000 + 3600);
    expect(await first.evaluate(() => document.cookie)).toBe("");
    now += 7 * day - 30_000;
    const outcomes = await Promise.all(
      [first, second].map((page) =>
        page.evaluate(async () =>
          (
            globalThis as unknown as { fixture: { renew(): Promise<boolean> } }
          ).fixture.renew()
        )
      )
    );
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(renewals).toBe(1);
    const rotated = await context.cookies();
    expect(rotated[0]!.value === before[0]!.value).toBe(false);
    await expect(sessions.status(initialCredential)).rejects.toBeDefined();
    expect(
      await first.evaluate(async () => {
        const response = await fetch("/status");
        return response.status;
      })
    ).toBe(200);
    expect(
      await second.evaluate(async () => {
        const response = await fetch("/status");
        return response.status;
      })
    ).toBe(200);
    await context.close();
    context = undefined;
    now += 3_600_000;
    context = await launch();
    const revisited = await context.newPage();
    await revisited.goto(String(server.url));
    expect(
      await revisited.evaluate(async () => {
        const response = await fetch("/status");
        return response.status;
      })
    ).toBe(200);
    expect(logins).toBe(1);
    expect(renewals).toBe(1);
    const other = await context.newPage();
    await other.goto(String(server.url));
    expect(
      await revisited.evaluate(async () => {
        const response = await fetch("/logout", { method: "POST" });
        return response.status;
      })
    ).toBe(200);
    expect(
      await other.evaluate(async () => {
        const response = await fetch("/status");
        return response.status;
      })
    ).toBe(401);
    expect(
      await revisited.evaluate(async () => {
        const response = await fetch("/status");
        return response.status;
      })
    ).toBe(401);
    await revisited.evaluate(() => fetch("/login", { method: "POST" }));
    await other.evaluate(() => fetch("/revoke", { method: "POST" }));
    expect(
      await revisited.evaluate(async () => {
        const response = await fetch("/status");
        return response.status;
      })
    ).toBe(401);
    await expect(
      revisited.evaluate(async () =>
        (
          globalThis as unknown as { fixture: { renew(): Promise<boolean> } }
        ).fixture.renew()
      )
    ).rejects.toBeDefined();
    expect(renewals).toBe(1);
    await revisited.evaluate(() => fetch("/login", { method: "POST" }));
    now += 7 * day + 1;
    expect(
      await revisited.evaluate(async () => {
        const response = await fetch("/status");
        return response.status;
      })
    ).toBe(401);
    await expect(
      revisited.evaluate(async () =>
        (
          globalThis as unknown as { fixture: { renew(): Promise<boolean> } }
        ).fixture.renew()
      )
    ).rejects.toBeDefined();
    expect(renewals).toBe(1);
  } finally {
    await context?.close();
    await server.stop(true);
    await sessions.close();
    await rm(scratch, { force: true, recursive: true });
  }
}, 30_000);
