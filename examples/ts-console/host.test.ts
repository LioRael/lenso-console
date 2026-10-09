import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

import {
  createConsoleClient,
  createConsoleWorkspaceServices,
} from "@lenso/console-sdk/transport";
import { startApp, valuesSource } from "@lenso/core";

import { resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";
import { createBuiltShell } from "./shell";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No TCP address");
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

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
    expect(app.contributions("agent")).toEqual([]);
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
    const mount = pages.mounts.find(
      (entry: { id: string }) => entry.id === "authorization"
    );
    expect(mount).toBeDefined();
    const services = createConsoleWorkspaceServices({
      url: "/operator/api/console/v2/rpc",
      origin,
      headers,
      mount,
      expectedSubject: config.subject,
    });
    const roles = await services.invoke<
      Record<string, never>,
      { graph: { roles: { id: string }[] } }
    >("authorization", "inspect", {});
    expect(roles.graph.roles.map((role) => role.id)).toEqual([
      "local-operator",
    ]);
    const client = createConsoleClient({
      url: "/operator/api/console/v2/rpc",
      origin,
      headers,
    });
    const inspected = await client.plugins({ targetId: "local" });
    expect(
      inspected.plugins.find((plugin) => plugin.id === host.locale.id)
    ).toMatchObject({
      configuration: {
        state: "resolved",
        writable: false,
        sources: [{ id: "values", kind: "values" }],
        fields: [
          {
            path: ["databasePath"],
            sourceIds: ["values"],
            sensitive: true,
          },
        ],
      },
    });
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
