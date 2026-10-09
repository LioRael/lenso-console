import { afterEach, expect, test } from "bun:test";

import {
  ApiKeyError,
  createApiKeys,
  sameKeySubject,
  type ApiKeyStore,
  type KeyRecord,
} from "@lenso/api-keys";
import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import { AuthorizationError } from "@lenso/authorization";
import { definePlugin, startApp } from "@lenso/core";

import { createConsoleAuthentication } from "../src/auth";
import {
  consoleApiKeyError,
  createConsoleApiKeyCredentials,
  createConsoleApiKeyManage,
} from "../src/integrations/api-keys";
import {
  consoleAuthorizationError,
  createConsoleAuthorizationPolicy,
  createConsoleScopedAuthorization,
} from "../src/integrations/authorization";
import type { ConsoleIdentity, ConsoleResource } from "../src/types";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  const pending = cleanup.splice(0);
  while (pending.length > 0) {
    const close = pending.pop();
    if (close) {
      await close();
    }
  }
});
const origin = "https://security.example.test";
const subject = {
  namespace: "business-accounts",
  tenantId: "tenant-a",
  subjectId: "business-alice",
};
const resource = (operation: string): ConsoleResource => ({
  action: "invoke",
  targetId: "business-app",
  tenantId: "tenant-a",
  pluginId: "console-keys",
  operation,
});
const post = (path: string, body: unknown) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer fixture",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

function fixture() {
  let active = true;
  let allowed = true;
  const auth = createAuth(
    realm(
      "platform",
      defineSource({
        verify: async (token: string | null) =>
          token === "fixture" && active
            ? { status: "verified", subjectId: "platform-alice", kind: "user" }
            : { status: "rejected" },
      })
    )
  );
  const access = auth
    .for(audience("console"))
    .memberships(async (_actor, target: ConsoleResource) =>
      target.tenantId === "tenant-a" ? {} : null
    );
  const authentication = createConsoleAuthentication({
    access,
    policy: () => allowed,
    requestPolicy: { origin, credentialMode: "bearer" },
    evidence: (request) =>
      request.headers.get("authorization")?.slice(7) ?? null,
    permissionRevision: () => "fixture-revision",
    session: () => ({ administrator: true, workspace_ids: ["business-app"] }),
  });
  const rows = new Map<string, KeyRecord>();
  const store: ApiKeyStore = {
    async create(record) {
      const prior = [...rows.values()].find(
        (row) =>
          row.subject.namespace === record.subject.namespace &&
          row.subject.tenantId === record.subject.tenantId &&
          row.requestId === record.requestId
      );
      if (prior) {
        return { created: false, record: prior };
      }
      rows.set(record.id, record);
      return { created: true, record };
    },
    async read(id) {
      return rows.get(id) ?? null;
    },
    async list(selected, after, limit) {
      return [...rows.values()]
        .filter(
          (row) =>
            sameKeySubject(row.subject, selected) &&
            (after === null || row.id > after)
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async rotate(input) {
      const row = rows.get(input.id);
      if (
        !row ||
        !sameKeySubject(row.subject, input.subject) ||
        row.revision !== input.expectedRevision ||
        row.revokedAt !== null
      ) {
        return null;
      }
      const next = {
        ...row,
        digest: input.digest,
        revision: row.revision + 1,
        previousDigest: input.overlapMs ? row.digest : null,
        overlapUntil: input.overlapMs ? input.now + input.overlapMs : null,
      };
      rows.set(row.id, next);
      return next;
    },
    async revoke(selected, id, now) {
      const row = rows.get(id);
      if (!row || !sameKeySubject(row.subject, selected)) {
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
  const keys = createApiKeys<ConsoleIdentity, unknown>({
    store,
    config: { maxLifetimeMs: 60_000, maxOverlapMs: 5000 },
    authorizeManagement: async (caller, _action, target) => {
      await authentication.enforce(caller, resource("manage"));
      return sameKeySubject(target.subject, subject);
    },
    grantScopes: (_caller, _subject, scopes) =>
      scopes.filter((scope) => scope === "notes:read"),
    subjectActive: () => true,
    authorizeUse: () => allowed,
  });
  cleanup.push(
    () => auth.close(),
    () => keys.close()
  );
  const endpoint = createConsoleApiKeyCredentials({
    keys,
    authentication,
    issuePath: "/credentials/issue",
    rotatePath: "/credentials/rotate",
    resource,
    map: (identity) => ({ caller: identity, subject }),
  });
  return {
    keys,
    endpoint,
    rows,
    authentication,
    access,
    revokeCredential: () => {
      active = false;
    },
    deny: () => {
      allowed = false;
    },
  };
}

test("secret routes reject subject injection, enforce POST and do not own adjacent routes", async () => {
  const { endpoint, rows } = fixture();
  expect(await endpoint.fetch(post("/credentials/other", {}))).toBeUndefined();
  const method = await endpoint.fetch(
    new Request(`${origin}/credentials/issue`)
  );
  expect(method?.status).toBe(405);
  expect(method?.headers.get("cache-control")).toBe("no-store");
  const response = await endpoint.fetch(
    post("/credentials/issue", {
      requestedScopes: ["notes:read"],
      expiresAt: Date.now() + 30_000,
      requestId: "one",
      subject: { ...subject, tenantId: "attacker" },
    })
  );
  expect(response?.status).toBe(400);
  expect(rows.size).toBe(0);
});

test("real ApiKeys issue replay never returns the secret again and stale rotations conflict", async () => {
  const { endpoint, keys, authentication } = fixture();
  const input = {
    requestedScopes: ["notes:read"],
    expiresAt: Date.now() + 30_000,
    requestId: "one",
  };
  const first = await endpoint.fetch(post("/credentials/issue", input));
  expect(first?.status).toBe(200);
  expect(first?.headers.get("cache-control")).toBe("no-store");
  const issued = await first!.json();
  expect(typeof issued.credential).toBe("string");
  expect(issued.key.subject).toEqual(subject);
  const second = await endpoint.fetch(post("/credentials/issue", input));
  expect(await second!.json()).toMatchObject({
    credential: null,
    replayed: true,
  });
  const rotated = await endpoint.fetch(
    post("/credentials/rotate", {
      id: issued.key.id,
      expectedRevision: 0,
      overlapMs: 0,
    })
  );
  expect(rotated?.status).toBe(200);
  const stale = await endpoint.fetch(
    post("/credentials/rotate", {
      id: issued.key.id,
      expectedRevision: 0,
      overlapMs: 0,
    })
  );
  expect(stale?.status).toBe(409);
  const metadata = await keys.list(
    { subject },
    await authentication.authenticate(post("/metadata", {}))
  );
  expect(JSON.stringify(metadata)).not.toContain(issued.credential);
  expect(metadata[0]?.revision).toBe(1);
});

test("credential routes revalidate current Auth and management authority", async () => {
  const f = fixture();
  f.deny();
  const denied = await f.endpoint.fetch(
    post("/credentials/issue", {
      requestedScopes: [],
      expiresAt: Date.now() + 30_000,
      requestId: "denied",
    })
  );
  expect(denied?.status).toBe(403);
  expect(f.rows.size).toBe(0);
  f.revokeCredential();
  const unauthenticated = await f.endpoint.fetch(
    post("/credentials/issue", {})
  );
  expect(unauthenticated?.status).toBe(401);
});

test("scoped Manage exposes metadata only and independently closes unsafe revoke", async () => {
  const f = fixture();
  const keysPlugin = definePlugin({ id: "keys", setup: () => f.keys });
  const authPlugin = definePlugin({
    id: "authentication",
    setup: () => f.authentication,
  });
  let safeRevoke = false;
  const companion = createConsoleApiKeyManage({
    id: "console-keys",
    keys: keysPlugin,
    authentication: authPlugin,
    map: ({ identity }) => ({ caller: identity, subject }),
    canRevoke: () => safeRevoke,
  });
  expect(companion.operations.map((operation) => operation.method)).toEqual([
    "list",
    "read",
    "revoke",
  ]);
  const app = await startApp({
    plugins: [keysPlugin, authPlugin, companion.plugin],
  });
  cleanup.push(() => app.stop());
  const request = post("/metadata", {});
  const identity = await f.authentication.authenticate(request);
  const service = app.get(companion.plugin);
  expect(
    await service.list({}, { identity, resource: resource("list"), request })
  ).toEqual([]);
  await expect(
    service.revoke(
      { id: "key" },
      {
        identity,
        resource: resource("revoke"),
        request,
      }
    )
  ).rejects.toThrow("Access denied");
  await expect(
    service.list(
      {},
      {
        identity: { ...identity },
        resource: resource("list"),
        request,
      }
    )
  ).rejects.toThrow("Authentication required");
  const issued = await f.keys.issue(
    {
      subject,
      requestedScopes: ["notes:read"],
      expiresAt: Date.now() + 30_000,
      requestId: "revoke",
    },
    identity
  );
  const rotated = await f.keys.rotate(
    {
      subject,
      id: issued.key.id,
      expectedRevision: 0,
      overlapMs: 1000,
    },
    identity
  );
  expect(await f.keys.verify(issued.credential)).not.toBeNull();
  expect(
    await service.read(
      { id: issued.key.id },
      {
        identity,
        resource: resource("read"),
        request,
      }
    )
  ).toMatchObject({ revision: 1 });
  safeRevoke = true;
  expect(
    await service.revoke(
      { id: issued.key.id },
      {
        identity,
        resource: resource("revoke"),
        request,
      }
    )
  ).toBe(true);
  expect(await f.keys.verify(issued.credential)).toBeNull();
  expect(await f.keys.verify(rotated.credential)).toBeNull();
});

test("Console policy preserves Auth provenance and exact business RBAC scope", async () => {
  const f = fixture();
  const scope = { type: "workspace", id: "tenant-a" };
  const principal = {
    realmId: "business-accounts",
    subjectId: "business-alice",
    kind: "user",
  };
  const authorization = createConsoleScopedAuthorization({
    actions: ["read"],
    rbac: {
      graph: {
        roles: [
          {
            id: "reader",
            scope,
            permissions: [{ action: "read", resourceType: "workspace", scope }],
          },
        ],
        bindings: [{ id: "alice-reader", principal, roleId: "reader", scope }],
      },
    },
  });
  const policy = createConsoleAuthorizationPolicy({
    authorization,
    map: (verified) => ({
      principal,
      action: "read",
      resource: {
        type: "workspace",
        id: verified.resource.targetId,
        scope: { type: "workspace", id: verified.resource.tenantId },
      },
      context: {},
      audience: verified.principal.audience,
    }),
  });
  const actor = await f.access.required("fixture");
  await expect(f.access.enforce(actor, resource("list"), policy)).resolves.toBe(
    actor
  );
  expect(
    await authorization.can({
      principal,
      action: "read",
      context: {},
      resource: {
        type: "workspace",
        id: "business-app",
        scope: { type: "workspace", id: "tenant-b" },
      },
    })
  ).toBe(false);
  const denied = createConsoleScopedAuthorization({
    actions: ["read"],
    rbac: {
      graph: {
        roles: [
          {
            id: "reader",
            scope,
            permissions: [{ action: "read", resourceType: "workspace", scope }],
          },
        ],
        bindings: [{ id: "reader", principal, roleId: "reader", scope }],
      },
    },
    policies: [{ evaluate: () => "deny" }],
  });
  expect(
    await denied.can({
      principal,
      action: "read",
      context: {},
      resource: { type: "workspace", id: "business-app", scope },
    })
  ).toBe(false);
  await expect(
    f.access.enforce({ ...actor }, resource("list"), policy)
  ).rejects.toThrow();
  await expect(
    f.access.enforce(
      actor,
      { ...resource("list"), tenantId: "tenant-b" },
      policy
    )
  ).rejects.toThrow();
  f.revokeCredential();
  await expect(
    f.access.enforce(actor, resource("list"), policy)
  ).rejects.toThrow();
});

test("security projectors recognize real domain errors and never echo thrown data", () => {
  expect(consoleApiKeyError(new ApiKeyError("CONFLICT"))).toEqual({
    code: "conflict",
    phase: "invoke",
    message: "API key operation failed",
  });
  expect(consoleAuthorizationError(new AuthorizationError())).toEqual({
    code: "denied",
    phase: "invoke",
    message: "Authorization operation denied",
  });
  expect(
    consoleApiKeyError({ code: "CONFLICT", message: "private-secret" })
  ).toBeUndefined();
  expect(
    consoleAuthorizationError(new Error("private-secret"))
  ).toBeUndefined();
});
