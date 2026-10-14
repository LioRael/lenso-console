import { Database, type Statement } from "bun:sqlite";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  AccessSnapshot,
  CredentialDelivery,
  Page,
  DirectoryUser,
} from "@lenso/auth-console/client";
import { createConsoleClient } from "@lenso/console-sdk/transport";
import { defineApp, startApp, valuesSource } from "@lenso/core";

import {
  createLocalAdministrationState,
  initializeLocalAdministration,
} from "./administration-host";
import { hostSources, resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";
import { migrateLocalLocaleStore } from "./locale-store";
import { freePort } from "./test/port";

async function decode(response: Response) {
  expect(response.status).toBe(200);
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("application/json")) {
    return JSON.parse(text);
  }
  const data = text.split("\n").find((line) => line.startsWith("data: "));
  expect(data).toBeDefined();
  return JSON.parse(data!.slice(6));
}

async function measureDatabaseCalls<T>(work: () => Promise<T>) {
  const calls = {
    session: 0,
    key: 0,
    role: 0,
    directory: 0,
    audit: 0,
    auditWrites: 0,
    other: 0,
  };
  const probes: { mockRestore(): void }[] = [];
  const seen = new WeakSet<Statement>();
  const depth = new WeakMap<Statement, number>();
  function instrument(statement: Statement) {
    if (seen.has(statement)) {
      return;
    }
    seen.add(statement);
    // Bun installs execution methods on each Statement, not its prototype.
    for (const method of ["get", "all", "values", "run"] as const) {
      const original = statement[method];
      probes.push(
        spyOn(statement, method).mockImplementation(
          function instrumentStatement(this: Statement, ...args: unknown[]) {
            const nesting = depth.get(this) ?? 0;
            depth.set(this, nesting + 1);
            try {
              if (nesting === 0) {
                const sql = this.toString();
                if (
                  /^\s*(?:insert|update|delete)/i.test(sql) &&
                  sql.includes("lenso_audit_events")
                ) {
                  calls.auditWrites += 1;
                } else if (sql.includes("auth_sessions")) {
                  calls.session += 1;
                } else if (sql.includes("api_keys")) {
                  calls.key += 1;
                } else if (sql.includes("console_administration")) {
                  calls.role += 1;
                } else if (sql.includes("local_console_directory")) {
                  calls.directory += 1;
                } else if (sql.includes("lenso_audit_events")) {
                  calls.audit += 1;
                } else {
                  calls.other += 1;
                }
              }
              return Reflect.apply(original, this, args);
            } finally {
              depth.set(this, nesting);
            }
          }
        )
      );
    }
  }
  for (const method of ["query", "prepare"] as const) {
    const original = Database.prototype[method];
    probes.push(
      spyOn(Database.prototype, method).mockImplementation(
        function instrumentDatabase(this: Database, ...args: unknown[]) {
          const statement = Reflect.apply(original, this, args);
          instrument(statement);
          return statement;
        }
      )
    );
  }
  try {
    return { result: await work(), calls };
  } finally {
    for (const probe of probes) {
      probe.mockRestore();
    }
  }
}

// valuesSource fixtures use booleans and missed the real environment's string
// parsing, which otherwise made the documented opt-in command fail at startup.
test("administration opt-in parses strict environment booleans", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "console-config-"));
  try {
    for (const [raw, expected] of [
      ["true", true],
      ["false", false],
    ] as const) {
      const config = await resolveHostConfiguration(
        directory,
        hostSources(directory, (name) =>
          name === "LENSO_TS_TOKEN"
            ? "isolated-config-test-secret"
            : name === "LENSO_TS_ADMINISTRATION"
              ? raw
              : undefined
        )
      );
      expect(config.administration).toBe(expected);
    }
    await expect(
      resolveHostConfiguration(
        directory,
        hostSources(directory, (name) =>
          name === "LENSO_TS_TOKEN"
            ? "isolated-config-test-secret"
            : name === "LENSO_TS_ADMINISTRATION"
              ? "yes"
              : undefined
        )
      )
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Existing legacy fixtures never installed persistent membership, protected PAT
// delivery, or a real MCP protocol session sharing the Console listener.
test("local account freeze and promotion share the same atomic revision and active-owner fence", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "console-account-fence-")
  );
  let running: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    const config = await resolveHostConfiguration(directory, [
      valuesSource({
        administration: true,
        token: "isolated-account-fence-secret",
        databasePath: path.join(directory, "state.sqlite"),
      }),
    ]);
    initializeLocalAdministration(config, [
      { subjectId: "second", label: "Second test identity" },
      { subjectId: "third", label: "Third test identity" },
    ]);
    const plugin = createLocalAdministrationState(config);
    running = await startApp(defineApp({ plugins: [plugin] }));
    const state = running.get(plugin);
    const bindOwner =
      (subjectId: string) =>
      (snapshot: Parameters<Parameters<typeof state.store.mutate>[1]>[0]) => ({
        ...snapshot,
        graph: {
          ...snapshot.graph,
          bindings: [
            ...snapshot.graph.bindings,
            {
              ...snapshot.graph.bindings[0]!,
              id: subjectId,
              principal: {
                ...snapshot.graph.bindings[0]!.principal,
                subjectId,
              },
            },
          ],
        },
      });
    const before = state.store.read().revision;
    state.store.mutate(before, bindOwner("second"));
    await expect(
      state.directory.disable("second", before)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const secondUser = await state.directory.read("second");
    expect(secondUser?.status).toBe("active");
    const next = state.store.read().revision;
    expect(await state.directory.disable("third", next)).toBe(true);
    expect(() => state.store.mutate(next, bindOwner("third"))).toThrow();
    expect(() =>
      state.store.mutate(state.store.read().revision, bindOwner("third"))
    ).toThrow();
    await expect(
      state.directory.disable(config.subject, state.store.read().revision)
    ).rejects.toMatchObject({ code: "DENIED" });
    const currentUser = await state.directory.read(config.subject);
    expect(currentUser?.status).toBe("active");
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("local administration shares authenticated service policy across Console and HTTP MCP", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "console-administration-")
  );
  let running: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    const config = await resolveHostConfiguration(directory, [
      valuesSource({
        token: "isolated-administration-operator-secret",
        administration: true,
        origin: `http://127.0.0.1:${await freePort()}`,
        databasePath: path.join(directory, "locale.sqlite"),
        shellDirectory: path.resolve("plugins/console/shell/dist/client"),
      }),
    ]);
    await migrateLocalLocaleStore(config.databasePath);
    const colleague = "existing@localhost.test";
    expect(
      initializeLocalAdministration(config, [
        { subjectId: colleague, label: "Existing directory user" },
      ])
    ).toBe(true);
    expect(initializeLocalAdministration(config)).toBe(false);
    const host = await createHost(config);
    running = await startApp(host.app);
    const { origin } = running.get(host.listener).url;
    const request = (route: string, init?: RequestInit) =>
      fetch(origin + route, init);
    const discovery = await request(`${config.authBasePath}/methods`);
    const csrf = discovery.headers.get("set-cookie")!.split(";")[0]!;
    const headers = {
      cookie: csrf,
      origin,
      "x-csrf-token": csrf.slice(csrf.indexOf("=") + 1),
      "content-type": "application/json",
    };
    const login = await request(`${config.authBasePath}/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        identifier: config.subject,
        password: config.token,
      }),
    });
    expect(login.status).toBe(204);
    headers.cookie += `; ${login.headers.get("set-cookie")!.split(";")[0]!}`;
    const client = createConsoleClient({
      origin,
      url: `/${config.apiBasePath.slice(1)}/console/v2/rpc`,
      headers,
    });
    let catalog = await client.catalog({ targetId: "local" });
    const invoke = async <T>(method: string, input: unknown): Promise<T> => {
      const selectedOperation = catalog.operations.find(
        (operation) => operation.method === method
      );
      expect(selectedOperation).toBeDefined();
      return (await client.invoke({
        targetId: "local",
        key: selectedOperation!.key,
        input,
      })) as T;
    };
    const users = await invoke<Page<DirectoryUser>>("usersList", {});
    expect(users.items.map((user) => user.subjectId)).toContain(colleague);
    let access = await invoke<AccessSnapshot>("accessRead", {});
    const viewer = access.roles.find((role) => role.id === "readonly")!;
    expect(viewer).toBeDefined();
    access = await invoke<AccessSnapshot>("membersSet", {
      subjectId: colleague,
      roleId: viewer.id,
      expectedRevision: access.revision,
    });
    expect(access.members).toContainEqual(
      expect.objectContaining({ subjectId: colleague, status: "active" })
    );

    const issue = (
      selectedHeaders = headers,
      extra: Record<string, unknown> = {}
    ) =>
      request(`${config.apiBasePath}/admin/credentials/issue`, {
        method: "POST",
        headers: selectedHeaders,
        body: JSON.stringify({
          requestedScopes: ["users.list", "sessions.list"],
          expiresAt: Date.now() + 3_600_000,
          requestId: crypto.randomUUID(),
          ...extra,
        }),
      });
    const badCsrf = await issue({ ...headers, "x-csrf-token": "wrong" });
    expect(badCsrf.status).toBe(403);
    const forgedPrincipal = await issue(headers, {
      principal: { subjectId: colleague },
    });
    expect(forgedPrincipal.status).toBe(400);
    const delivery = await issue();
    expect(delivery.status).toBe(200);
    expect(delivery.headers.get("cache-control")).toBe("no-store");
    const credential = (await delivery.json()) as CredentialDelivery;
    expect(credential.credential).toBeString();
    const rotationDelivery = await issue();
    expect(rotationDelivery.status).toBe(200);
    const rotationCredential =
      (await rotationDelivery.json()) as CredentialDelivery;
    const rotate = () =>
      request(`${config.apiBasePath}/admin/credentials/rotate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: rotationCredential.token.id,
          expectedRevision: rotationCredential.token.revision,
          overlapMs: 0,
        }),
      });
    const rotatedDelivery = await rotate();
    expect(rotatedDelivery.status).toBe(200);
    const rotatedCredential =
      (await rotatedDelivery.json()) as CredentialDelivery;
    const staleRotation = await rotate();
    expect(staleRotation.status).toBe(409);
    expect(await staleRotation.json()).toEqual({
      code: "CONFLICT",
      message: "Credential operation could not be confirmed",
    });
    expect(staleRotation.headers.get("x-lenso-audit-intent")).toBeNull();
    expect(
      await running
        .get(host.administration!.plugin)
        .apiKeys.verify(rotatedCredential.credential)
    ).not.toBeNull();
    const identity = await running
      .get(host.authentication)
      .authenticate(new Request(origin, { headers }));
    await expect(
      running.get(host.authentication).enforce(identity, {
        targetId: "local",
        tenantId: "other-tenant",
        pluginId: "console-administration",
        operation: "usersList",
        action: "invoke",
      })
    ).rejects.toThrow();
    await expect(
      running
        .get(host.administration!.plugin)
        .apiKeys.use(credential.credential, "users.list", {
          consoleId: "local",
          tenantId: "other-tenant",
          realmId: "ts-console-local",
        })
    ).rejects.toThrow();
    const { mcpPath } = host.administration!;
    const mcpHeaders = {
      authorization: `Bearer ${credential.credential}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    let id = 1;
    let session = "";
    const rpc = async (method: string, params: unknown = {}) => {
      const response = await request(mcpPath, {
        method: "POST",
        headers: {
          ...mcpHeaders,
          ...(session
            ? {
                "mcp-session-id": session,
                "mcp-protocol-version": "2025-03-26",
              }
            : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      id += 1;
      session = response.headers.get("mcp-session-id") ?? session;
      return response;
    };
    const initialized = await decode(
      await rpc("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "local-contract-test", version: "1" },
      })
    );
    expect(initialized.result.capabilities.tools).toBeDefined();
    expect(session).not.toBe("");
    const notified = await request(mcpPath, {
      method: "POST",
      headers: {
        ...mcpHeaders,
        "mcp-session-id": session,
        "mcp-protocol-version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
    expect(notified.status).toBe(202);
    const listed = await decode(await rpc("tools/list"));
    const tools = listed.result.tools as { name: string; title: string }[];
    expect(
      tools.every(
        (tool) =>
          !/membersSet|membersPromote|rolesSave|issue|rotate|tokensRevoke/.test(
            tool.title
          )
      )
    ).toBe(true);
    const listUsers = tools.find(
      (tool) => tool.title === "console-administration.usersList"
    )!;
    expect(listUsers).toBeDefined();

    const measured = await measureDatabaseCalls(async () =>
      decode(await rpc("tools/call", { name: listUsers.name, arguments: {} }))
    );
    expect(measured.result.result.isError).not.toBe(true);
    expect(JSON.stringify(measured.result.result)).toContain(colleague);
    console.info("MCP usersList database calls", measured.calls);
    // Entry, dispatch and disclosure are fresh credential boundaries. No cookie
    // session lookup or per-permission credential loop is allowed for MCP.
    expect(measured.calls.session).toBe(0);
    // Released API Keys verifies again after awaiting subject activity, so each
    // of the three credential phases executes two key reads.
    expect(measured.calls.key).toBe(6);
    expect(measured.calls.role).toBeLessThanOrEqual(10);
    expect(measured.calls.directory).toBeLessThanOrEqual(10);
    expect(measured.calls.auditWrites).toBe(2);
    const listSessions = tools.find(
      (tool) => tool.title === "console-administration.sessionsList"
    );
    expect(listSessions).toBeDefined();
    const agentSessions = await decode(
      await rpc("tools/call", {
        name: listSessions!.name,
        arguments: { subjectId: config.subject },
      })
    );
    expect(agentSessions.result.isError).not.toBe(true);
    const sessionData = JSON.parse(agentSessions.result.content[0].text);
    expect(sessionData.items.length).toBe(1);
    expect(sessionData.items[0].subjectId).toBe(config.subject);
    const denied = await decode(
      await rpc("tools/call", {
        name: "console-administration.membersSet",
        arguments: { subjectId: colleague, roleId: "administrator" },
      })
    );
    expect(denied.error || denied.result?.isError).toBeTruthy();
    const badOrigin = await request(mcpPath, {
      method: "POST",
      headers: { ...mcpHeaders, origin: "https://untrusted.test" },
      body: "{}",
    });
    expect(badOrigin.status).toBe(403);
    const anonymous = await request(mcpPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).not.toContain(
      "resource_metadata"
    );
    const metadata = await request(
      `/.well-known/oauth-protected-resource${mcpPath}`
    );
    expect(metadata.status).toBe(404);
    await invoke("tokensRevoke", {
      id: credential.token.id,
      expectedRevision: credential.token.revision,
    });
    const revokedCredential = await rpc("tools/list");
    expect(revokedCredential.status).toBe(401);

    const audit = await invoke<Page<unknown>>("auditList", {});
    expect(audit.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain(credential.credential!);
    await running.stop();
    running = undefined;
    const restarted = await createHost(config);
    running = await startApp(restarted.app);
    catalog = await client.catalog({ targetId: "local" });
    const restored = running.get(restarted.state!).store.read();
    expect(
      restored.members.find((member) => member.subjectId === colleague)?.roleId
    ).toBe(viewer.id);
    const sessions = await invoke<Page<{ id: string; revision: number }>>(
      "sessionsList",
      { subjectId: config.subject }
    );
    expect(sessions.items.length).toBe(1);
    const otherLogin = await request(`${config.authBasePath}/login`, {
      method: "POST",
      headers: { ...headers, cookie: csrf },
      body: JSON.stringify({
        identifier: config.subject,
        password: config.token,
      }),
    });
    expect(otherLogin.status).toBe(204);
    const allSessions = await invoke<Page<{ id: string; revision: number }>>(
      "sessionsList",
      { subjectId: config.subject }
    );
    const otherSession = allSessions.items.find(
      (item) => item.id !== sessions.items[0]!.id
    )!;
    expect(otherSession).toBeDefined();
    const revokeOther = () =>
      invoke("sessionsRevoke", {
        id: otherSession.id,
        subjectId: config.subject,
        expectedRevision: otherSession.revision,
      });
    await expect(revokeOther()).resolves.toMatchObject({ revoked: true });
    await expect(revokeOther()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Conflict",
    });
    const failureAudit = await invoke<Page<{ action: string; result: string }>>(
      "auditList",
      {}
    );
    for (const action of ["tokens.rotate", "sessions.revoke"]) {
      expect(
        failureAudit.items.filter(
          (event) => event.action === action && event.result === "failure"
        )
      ).toHaveLength(1);
    }
    await expect(
      invoke("sessionsRevoke", {
        id: sessions.items[0]!.id,
        subjectId: config.subject,
        expectedRevision: sessions.items[0]!.revision,
      })
    ).rejects.toThrow();
    const revokedSession = await request(
      `${config.apiBasePath}/console/v1/session`,
      { headers }
    );
    expect(revokedSession.status).toBe(401);
    const relogin = await request(`${config.authBasePath}/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        identifier: config.subject,
        password: config.token,
      }),
    });
    expect(relogin.status).toBe(204);
    headers.cookie = `${csrf}; ${relogin.headers.get("set-cookie")!.split(";")[0]!}`;
    const secondDelivery = await issue();
    expect(secondDelivery.status).toBe(200);
    const secondCredential =
      (await secondDelivery.json()) as CredentialDelivery;
    mcpHeaders.authorization = `Bearer ${secondCredential.credential}`;
    access = await invoke<AccessSnapshot>("accessRead", {});
    access = await invoke<AccessSnapshot>("membersPromote", {
      subjectId: colleague,
      roleId: "instance-owner",
      expectedRevision: access.revision,
    });
    await expect(
      invoke("membersRevoke", {
        subjectId: config.subject,
        expectedRevision: access.revision,
      })
    ).rejects.toThrow();
    const revokedMember = await rpc("tools/list");
    expect(revokedMember.status).toBe(401);
    await running.stop();
    running = undefined;
    const retired = await createHost(config);
    running = await startApp(retired.app);
    expect(
      running.get(retired.state!).store.admission(config.subject)
    ).toBeNull();
    await expect(
      running.get(retired.state!).directory.read(config.subject)
    ).resolves.toMatchObject({ status: "active" });
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
