import { Database } from "bun:sqlite";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import type { ConsoleIdentity } from "@lenso/console";
import { createConsoleClient } from "@lenso/console-sdk/transport";
import { defineApp, startApp, valuesSource } from "@lenso/core";

import { resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";
import { localRealm } from "./local-auth";
import {
  createLocalLocaleStore,
  migrateLocalLocaleStore,
} from "./locale-store";
import { createBuiltShell } from "./shell";
import { freePort } from "./test/port";

const token = "isolated-test-operator-token";
const shellDirectory = path.resolve("plugins/console/shell/dist/client");
async function configuration(directory: string) {
  return resolveHostConfiguration(directory, [
    valuesSource({
      token,
      origin: `http://127.0.0.1:${await freePort()}`,
      shellDirectory,
      databasePath: path.join(directory, "locale.sqlite"),
      apiBasePath: "/operator/api",
      authBasePath: "/operator/auth",
    }),
  ]);
}

// Backend Fetch fixtures cannot prove listener admission, browser session evidence,
// exact companion installation, durable local state, or owned listener cleanup.
test("owned host authenticates, invokes the original SDK, persists locale and closes its listener", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ts-console-host-"));
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    await expect(
      resolveHostConfiguration(directory, [valuesSource({})])
    ).rejects.toThrow();
    const config = await configuration(directory);
    await migrateLocalLocaleStore(config.databasePath);
    // API/Auth separation alone admitted /assets as Auth and stole the built JS,
    // while /plugins as API could steal an otherwise valid Plugin detail route.
    for (const collision of [
      { authBasePath: "/assets" },
      { apiBasePath: "/plugins" },
    ]) {
      await expect(
        resolveHostConfiguration(directory, [
          valuesSource({ ...config, ...collision }),
        ])
      ).rejects.toThrow();
    }
    const host = await createHost(config);
    app = await startApp(host.app);
    const { origin } = app.get(host.listener).url;
    const request = (route: string, init?: RequestInit) =>
      fetch(origin + route, init);
    const anonymous = await request("/operator/api/console/v1/session");
    expect(anonymous.status).toBe(401);
    const badOrigin = await request("/", {
      headers: { origin: "https://untrusted.test" },
    });
    expect(badOrigin.status).toBe(403);
    const badHost = await request("/", { headers: { host: "untrusted.test" } });
    expect(badHost.status).toBe(403);
    const publicLocale = await request("/operator/api/console/v1/locale");
    expect(await publicLocale.json()).toMatchObject({
      available: true,
      global_default: null,
      can_manage_default: false,
    });
    const shellResponse = await request("/");
    const html = await shellResponse.text();
    expect(html).toContain('"api_base_path":"/operator/api"');
    expect(html).toContain('"auth_base_path":"/operator/auth"');
    const discovery = await request("/operator/auth/methods");
    const methods = await discovery.json();
    expect(methods.methods[0].kind).toBe("password");
    const csrf = discovery.headers.get("set-cookie")!.split(";")[0]!;
    const csrfValue = csrf.slice(csrf.indexOf("=") + 1);
    const headers = {
      cookie: csrf,
      origin,
      "x-csrf-token": csrfValue,
      "content-type": "application/json",
    };
    const login = (password: string) =>
      request("/operator/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ identifier: config.subject, password }),
      });
    const rejected = await login("wrong-token");
    expect(rejected.status).toBe(401);
    const signedIn = await login(token);
    expect(signedIn.status).toBe(204);
    expect(signedIn.headers.get("set-cookie")).toContain("HttpOnly");
    const session = signedIn.headers.get("set-cookie")!.split(";")[0]!;
    headers.cookie = `${csrf}; ${session}`;
    const sessionResponse = await request("/operator/api/console/v1/session", {
      headers,
    });
    expect(await sessionResponse.json()).toMatchObject({
      subject: config.subject,
      authenticated: true,
      assistant_enabled: false,
    });
    const pageResponse = await request("/operator/api/console/v1/pages", {
      headers,
    });
    const pages = await pageResponse.json();
    expect(pages.mounts).toMatchObject([
      {
        id: "authorization",
        owner: { instance: "authorization" },
        requirements: [
          { service_id: "authorization", operations: ["inspect"] },
        ],
      },
    ]);
    const client = createConsoleClient({
      url: "/operator/api/console/v2/rpc",
      origin,
      headers,
    });
    const catalog = await client.catalog({ targetId: "local" });
    const inspectOperation = catalog.operations.find(
      (operation) => operation.method === "inspect"
    );
    expect(inspectOperation).toBeDefined();
    const roles = (await client.invoke({
      targetId: "local",
      key: inspectOperation!.key,
      input: {},
    })) as { graph: { roles: { id: string }[] } };
    expect(roles.graph.roles.map((role) => role.id)).toEqual([
      "local-operator",
    ]);
    const inspected = await client.plugins({ targetId: "local" });
    const metadata = JSON.stringify(inspected);
    expect(metadata).not.toContain(config.databasePath);
    expect(metadata).not.toContain(token);
    const write = (suffix: string, body: unknown, selected = headers) =>
      request(`/operator/api/console/v1/locale/${suffix}`, {
        method: "PUT",
        headers: selected,
        body: JSON.stringify(body),
      });
    const badCsrf = await write(
      "default",
      { locale: "zh-CN" },
      { ...headers, "x-csrf-token": "mismatch" }
    );
    expect(badCsrf.status).toBe(403);
    const anonymousWrite = await write(
      "default",
      { locale: "zh-CN" },
      { ...headers, cookie: csrf }
    );
    expect(anonymousWrite.status).toBe(401);
    const defaultWrite = await write("default", { locale: "zh-CN" });
    expect(await defaultWrite.json()).toMatchObject({
      global_default: "zh-CN",
    });
    const preferenceWrite = await write("preference", { preference: "en" });
    expect(await preferenceWrite.json()).toMatchObject({
      preference: "en",
      locale: "en",
    });
    const identity = await app
      .get(host.authentication)
      .authenticate(new Request(origin, { headers }));
    const store = app.get(host.locale);
    await app.stop();
    app = undefined;
    await expect(
      fetch(origin, { signal: AbortSignal.timeout(2000) })
    ).rejects.toThrow();
    await expect(
      store.readDefault(new AbortController().signal)
    ).rejects.toThrow();
    const restarted = await createHost(config);
    app = await startApp(restarted.app);
    expect(
      await app.get(restarted.locale).readDefault(new AbortController().signal)
    ).toBe("zh-CN");
    expect(
      await app
        .get(restarted.locale)
        .readPreference(identity, new AbortController().signal)
    ).toBe("en");
    const retiredSession = await request("/operator/api/console/v1/session", {
      headers,
    });
    expect(retiredSession.status).toBe(401);
    await app.stop();
    app = undefined;
    const occupied = createServer();
    await new Promise<void>((resolve) =>
      occupied.listen(Number(new URL(origin).port), "127.0.0.1", resolve)
    );
    try {
      const failed = await createHost(config);
      await expect(startApp(failed.app)).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve, reject) =>
        occupied.close((error) => (error ? reject(error) : resolve()))
      );
    }
    const recovered = await createHost(config);
    app = await startApp(recovered.app);
  } finally {
    await app?.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

// Fresh host restarts did not catch legacy data loss, subject-only keys, schema
// adoption writes at startup, or a migrator accepting unknown history.
test("locale repository preserves populated legacy v1 and refuses unknown versions without migration", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ts-console-locale-"));
  const databasePath = path.join(directory, "locale.sqlite");
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  const { signal } = new AbortController();
  try {
    const legacy = new Database(databasePath, { create: true });
    try {
      // Independent historical fixture, not the new migration or Drizzle schema.
      legacy.exec(`
        CREATE TABLE console_locale_schema (version INTEGER PRIMARY KEY);
        CREATE TABLE console_locale_default (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          locale TEXT NOT NULL CHECK (locale IN ('en', 'zh-CN'))
        );
        CREATE TABLE console_locale_preferences (
          realm TEXT NOT NULL, subject TEXT NOT NULL,
          preference TEXT NOT NULL CHECK (preference IN ('global', 'en', 'zh-CN')),
          PRIMARY KEY (realm, subject)
        );
        INSERT INTO console_locale_schema VALUES (1);
        INSERT INTO console_locale_default VALUES (1, 'zh-CN');
        INSERT INTO console_locale_preferences VALUES
          ('ts-console-local', 'alice', 'en'),
          ('ts-console-local', 'bob', 'zh-CN'),
          ('other-realm', 'alice', 'zh-CN');
      `);
    } finally {
      legacy.close();
    }
    const auth = createAuth(
      realm(
        localRealm,
        defineSource({
          async verify(subjectId: string) {
            return { status: "verified", kind: "user", subjectId };
          },
        })
      )
    );
    const actors = new Map<string, ConsoleIdentity["actor"]>();
    try {
      for (const subject of ["alice", "bob", "missing"]) {
        actors.set(
          subject,
          await auth.for(audience("console")).required(subject)
        );
      }
    } finally {
      await auth.close();
    }
    const identity = (subjectId: string): ConsoleIdentity => ({
      actor: actors.get(subjectId)!,
      readScope: subjectId,
    });
    const locale = createLocalLocaleStore(databasePath);
    app = await startApp(defineApp({ plugins: [locale] }));
    const store = app.get(locale);
    expect(await store.readDefault(signal)).toBe("zh-CN");
    expect(await store.readPreference(identity("alice"), signal)).toBe("en");
    expect(await store.readPreference(identity("bob"), signal)).toBe("zh-CN");
    expect(await store.readPreference(identity("missing"), signal)).toBe(
      "global"
    );
    const before = new Database(databasePath);
    try {
      expect(
        before
          .query(
            "SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'"
          )
          .get()
      ).toBeNull();
    } finally {
      before.close();
    }
    await app.stop();
    app = undefined;
    await expect(store.readDefault(signal)).rejects.toThrow();
    await migrateLocalLocaleStore(databasePath);
    await migrateLocalLocaleStore(databasePath);
    app = await startApp(defineApp({ plugins: [locale] }));
    const adopted = app.get(locale);
    expect(await adopted.readDefault(signal)).toBe("zh-CN");
    expect(await adopted.readPreference(identity("alice"), signal)).toBe("en");
    await adopted.writePreference(identity("alice"), "global", signal);
    await adopted.writePreference(identity("bob"), "en", signal);
    expect(await adopted.readPreference(identity("alice"), signal)).toBe(
      "global"
    );
    expect(await adopted.readPreference(identity("bob"), signal)).toBe("en");
    await adopted.writeDefault(identity("alice"), null, signal);
    expect(await adopted.readDefault(signal)).toBeNull();
    await adopted.writeDefault(identity("alice"), "en", signal);
    for (const invalid of [
      {
        ...identity("alice"),
        actor: { ...identity("alice").actor, realmId: "other-realm" },
      },
      {
        ...identity("alice"),
        actor: { ...identity("alice").actor, kind: "service" },
      },
    ] satisfies ConsoleIdentity[]) {
      await expect(adopted.readPreference(invalid, signal)).rejects.toThrow(
        "local user"
      );
      await expect(
        adopted.writePreference(invalid, "zh-CN", signal)
      ).rejects.toThrow("local user");
      await expect(
        adopted.writeDefault(invalid, "zh-CN", signal)
      ).rejects.toThrow("local user");
    }
    const aborted = AbortSignal.abort(new Error("cancelled"));
    await expect(
      adopted.writeDefault(identity("alice"), null, aborted)
    ).rejects.toThrow("cancelled");
    expect(await adopted.readDefault(signal)).toBe("en");
    await app.stop();
    app = undefined;
    const inspect = new Database(databasePath);
    try {
      expect(
        inspect
          .query(
            "SELECT preference FROM console_locale_preferences WHERE realm = 'other-realm' AND subject = 'alice'"
          )
          .get()
      ).toEqual({ preference: "zh-CN" });
      expect(
        inspect.query("SELECT hash, created_at FROM __drizzle_migrations").all()
      ).toEqual([
        {
          hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          created_at: 1781654400000,
        },
      ]);
      inspect.exec("UPDATE console_locale_schema SET version = 99");
    } finally {
      inspect.close();
    }
    const close = spyOn(Database.prototype, "close");
    try {
      await expect(startApp(defineApp({ plugins: [locale] }))).rejects.toThrow(
        "Unsupported local Console locale schema"
      );
      expect(close).toHaveBeenCalledTimes(1);
      await expect(migrateLocalLocaleStore(databasePath)).rejects.toThrow(
        "Unsupported local Console locale schema"
      );
      expect(close).toHaveBeenCalledTimes(2);
    } finally {
      close.mockRestore();
    }
    const unknown = new Database(databasePath);
    try {
      expect(
        unknown.query("SELECT version FROM console_locale_schema").all()
      ).toEqual([{ version: 99 }]);
      expect(
        unknown.query("SELECT locale FROM console_locale_default").get()
      ).toEqual({ locale: "en" });
      unknown.exec(
        "UPDATE console_locale_schema SET version = 1; UPDATE __drizzle_migrations SET hash = 'changed'"
      );
    } finally {
      unknown.close();
    }
    await expect(startApp(defineApp({ plugins: [locale] }))).rejects.toThrow(
      "migration history"
    );
    await expect(migrateLocalLocaleStore(databasePath)).rejects.toThrow(
      "migration history"
    );
    const mismatched = new Database(databasePath);
    try {
      mismatched.exec(`
        DROP TABLE __drizzle_migrations;
        ALTER TABLE console_locale_default RENAME TO old_default;
        CREATE TABLE console_locale_default (singleton INTEGER PRIMARY KEY, locale TEXT NOT NULL);
        INSERT INTO console_locale_default SELECT * FROM old_default;
        DROP TABLE old_default;
      `);
    } finally {
      mismatched.close();
    }
    await expect(startApp(defineApp({ plugins: [locale] }))).rejects.toThrow(
      "schema definition"
    );
    await expect(migrateLocalLocaleStore(databasePath)).rejects.toThrow(
      "schema definition"
    );
    const unchanged = new Database(databasePath);
    try {
      expect(
        unchanged.query("SELECT locale FROM console_locale_default").get()
      ).toEqual({ locale: "en" });
      expect(
        unchanged
          .query(
            "SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'"
          )
          .get()
      ).toBeNull();
    } finally {
      unchanged.close();
    }
  } finally {
    await app?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

// Realpath escape and encoded path handling belong to the application static
// adapter, not Manage's fixed assets or the framework listener.
test("built Shell adapter refuses traversal, symlink escapes and API fallback", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ts-console-static-"));
  try {
    const root = path.join(directory, "shell");
    await mkdir(path.join(root, "assets"), { recursive: true });
    await writeFile(
      path.join(root, "index.html"),
      "<html><head></head></html>"
    );
    await writeFile(path.join(directory, "secret.txt"), "not-public");
    await symlink(
      path.join(directory, "secret.txt"),
      path.join(root, "assets", "escape.txt")
    );
    const shell = await createBuiltShell(root, {
      apiBasePath: "/api",
      authBasePath: "/auth",
    });
    for (const route of [
      "/assets/escape.txt",
      "/assets/%2e%2e%2fsecret.txt",
      "/assets/%5csecret.txt",
    ]) {
      const response = await shell.fetch(
        new Request(`http://127.0.0.1${route}`)
      );
      expect(response?.status).toBe(404);
    }
    const encodedPlugin = await shell.fetch(
      new Request("http://127.0.0.1/plugins/local/%40lenso%2Fcore/local")
    );
    expect(encodedPlugin?.status).toBe(200);
    expect(
      await shell.fetch(new Request("http://127.0.0.1/api/unknown"))
    ).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
