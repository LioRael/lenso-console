import { afterEach, expect, test } from "bun:test";

import { audience, createAuth, realm, type Actor } from "@lenso/auth";
import { authCookie, createAuthHttpBinding } from "@lenso/auth/http";
import {
  externalEntry,
  passwordLogin,
  type InteractiveLogin,
} from "@lenso/auth/interactive";
import { sessionSource } from "@lenso/auth/session-source";
import {
  createManagedSessions,
  type SessionRecord,
  type SessionStore,
} from "@lenso/auth/sessions";

import {
  ConsoleRequestError,
  consoleRequestErrorResponse,
  createConsoleAuthentication,
  expectedConsoleSubject,
  requireConsoleRequest,
  type ConsoleRequestPolicy,
} from "../src/auth";
import type { ConsoleResource } from "../src/types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  const pending = cleanups.splice(0);
  while (pending.length > 0) {
    const cleanup = pending.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});
const origin = "https://console.example.test";
const bearerPolicy = { origin, credentialMode: "bearer" } as const;
const cookiePolicy = { origin, credentialMode: "cookie" } as const;
const resource: ConsoleResource = {
  action: "invoke",
  targetId: "workspace-a",
  tenantId: "tenant-a",
};
const request = (
  headers: HeadersInit = {},
  path = "/api/console/v1/session",
  method = "GET",
  signal?: AbortSignal
) => new Request(`${origin}${path}`, { headers, method, signal });

function fixture(
  requestPolicy: ConsoleRequestPolicy = bearerPolicy,
  login?: readonly InteractiveLogin[]
) {
  const records = new Map<string, { subject: string }>([
    ["first", { subject: "alice" }],
    ["second", { subject: "alice" }],
  ]);
  const grants = new Map([
    [
      "alice",
      { tenant: "tenant-a", administrator: false, workspaces: ["workspace-a"] },
    ],
  ]);
  let unavailable = false;
  let membershipUnavailable = false;
  let revision = "1";
  const source = sessionSource({
    hasCredential: (headers) =>
      headers.has("authorization") || headers.has("cookie"),
    async getSession({ headers }) {
      if (unavailable) {
        throw new Error("private provider diagnostic");
      }
      const credential =
        requestPolicy.credentialMode === "bearer"
          ? headers.get("authorization")?.slice(7)
          : /__Host-lenso-session=([^;]+)/.exec(
              headers.get("cookie") ?? ""
            )?.[1];
      return records.get(credential ?? "") ?? null;
    },
    subjectId: (session) => session.subject,
  });
  const auth = createAuth(realm("host-realm", source));
  cleanups.push(() => auth.close());
  const access = auth
    .for(audience("console"))
    .memberships(async (subject, target: ConsoleResource) => {
      if (membershipUnavailable) {
        throw new Error("membership provider failed");
      }
      const grant = grants.get(subject.subjectId);
      return grant?.tenant === target.tenantId ? grant : null;
    });
  const service = createConsoleAuthentication({
    access,
    policy: ({ membership, resource: target }) =>
      membership.workspaces.includes(target.targetId) &&
      target.action !== "admin",
    binding: createAuthHttpBinding({
      access,
      requestPolicy,
      evidence: (input) => new Headers(input.headers),
      methodsPath: "/auth/methods",
      returnRoots: ["/console"],
      login,
    }),
    permissionRevision: () => revision,
    session: (actor) => {
      const grant = grants.get(actor.subjectId);
      return {
        administrator: grant?.administrator ?? false,
        workspace_ids: grant?.workspaces ?? [],
      };
    },
  });
  return {
    service,
    auth,
    access,
    source,
    grants,
    records,
    outage: () => {
      unavailable = true;
    },
    membershipOutage: () => {
      membershipUnavailable = true;
    },
    revise: () => {
      revision = "2";
    },
  };
}

test("forged actors, another audience/realm and changed tenant membership cannot authorize", async () => {
  const f = fixture();
  const identity = await f.service.authenticate(
    request({ authorization: "Bearer first" })
  );
  expect(await f.service.can(identity, resource)).toBe(true);
  const visibility: ConsoleResource = { ...resource, action: "list" };
  expect(await f.service.canDispatch!(identity, visibility, resource)).toBe(
    true
  );
  expect(
    await f.service.canDispatch!(identity, visibility, {
      ...resource,
      tenantId: "tenant-b",
    })
  ).toBe(false);
  expect(
    await f.service.canDispatch!({ ...identity }, visibility, resource)
  ).toBe(false);
  expect(
    await f.service.can(
      { ...identity, actor: { ...identity.actor } as Actor },
      resource
    )
  ).toBe(false);
  const otherAudience = await f.auth
    .for(audience("not-console"))
    .required(new Headers({ authorization: "Bearer first" }));
  expect(
    await f.service.can({ ...identity, actor: otherAudience }, resource)
  ).toBe(false);
  const otherAuth = createAuth(realm("other-realm", f.source));
  cleanups.push(() => otherAuth.close());
  const otherRealm = await otherAuth
    .for(audience("console"))
    .required(new Headers({ authorization: "Bearer first" }));
  expect(
    await f.service.can({ ...identity, actor: otherRealm }, resource)
  ).toBe(false);
  expect(
    await f.service.can(identity, { ...resource, tenantId: "tenant-b" })
  ).toBe(false);
  expect(await f.service.can(identity, { ...resource, action: "admin" })).toBe(
    false
  );
  f.grants.delete("alice");
  expect(await f.service.can(identity, resource)).toBe(false);
  expect(await f.service.canDispatch!(identity, visibility, resource)).toBe(
    false
  );
});

test("session grants and readScope use host projection and safe revision, not login or credential", async () => {
  const f = fixture();
  const first = await f.service.authenticate(
    request({ authorization: "Bearer first" })
  );
  const second = await f.service.authenticate(
    request({ authorization: "Bearer second" })
  );
  expect(first.readScope).toMatch(/^[a-f0-9]{64}$/);
  expect(second.readScope).toBe(first.readScope);
  expect(await f.service.session(first)).toEqual({
    administrator: false,
    workspace_ids: ["workspace-a"],
  });
  f.grants.set("alice", {
    tenant: "tenant-a",
    administrator: true,
    workspaces: ["workspace-b"],
  });
  expect(await f.service.session(first)).toEqual({
    administrator: true,
    workspace_ids: ["workspace-b"],
  });
  f.revise();
  const authenticated = await f.service.authenticate(
    request({ authorization: "Bearer first" })
  );
  expect(authenticated.readScope).not.toBe(first.readScope);
  f.records.delete("first");
  await expect(f.service.session(first)).rejects.toMatchObject({ status: 401 });
  expect(await f.service.can(first, resource)).toBe(false);
});

test("source and membership outages fail 503 instead of being reported as empty denial", async () => {
  const f = fixture();
  const identity = await f.service.authenticate(
    request({ authorization: "Bearer first" })
  );
  f.membershipOutage();
  await expect(f.service.can(identity, resource)).rejects.toMatchObject({
    status: 503,
  });
  f.outage();
  await expect(
    f.service.authenticate(request({ authorization: "Bearer first" }))
  ).rejects.toMatchObject({ status: 503 });
  await expect(f.service.can(identity, resource)).rejects.toMatchObject({
    status: 503,
  });
  const response = consoleRequestErrorResponse(
    new Error("private provider diagnostic")
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private provider diagnostic");
});

test("wrong Host/origin, duplicate credentials and ambiguous credential selection fail before handlers", () => {
  const rejected: Record<string, string>[] = [
    { host: "attacker.example.test" },
    { origin: "https://attacker.example.test" },
    { authorization: "Bearer first, Bearer second" },
    { authorization: "Bearer first", cookie: "__Host-lenso-session=first" },
    { cookie: "__Host-lenso-session=first; __Host-lenso-session=second" },
    { cookie: "__Host-lenso-csrf=first; __Host-lenso-csrf=second" },
    { "x-csrf-token": "first, second" },
  ];
  for (const headers of rejected) {
    expect(() => requireConsoleRequest(request(headers), bearerPolicy)).toThrow(
      ConsoleRequestError
    );
  }
  expect(() =>
    requireConsoleRequest(
      new Request("https://attacker.example.test/"),
      bearerPolicy
    )
  ).toThrow(ConsoleRequestError);
  expect(() =>
    requireConsoleRequest(
      request({ authorization: "Bearer first" }),
      cookiePolicy
    )
  ).toThrow(ConsoleRequestError);
  expect(() =>
    requireConsoleRequest(
      request({ cookie: "__Host-lenso-session=first" }),
      bearerPolicy
    )
  ).toThrow(ConsoleRequestError);
});

test("unsafe cookie actions require exact Origin, no cross-site hint and double-submit CSRF", () => {
  const valid = {
    origin,
    cookie: "__Host-lenso-session=first; __Host-lenso-csrf=proof",
    "x-csrf-token": "proof",
  };
  expect(() =>
    requireConsoleRequest(request(valid, "/auth/logout", "POST"), cookiePolicy)
  ).not.toThrow();
  const rejected: Record<string, string>[] = [
    { cookie: valid.cookie, "x-csrf-token": "proof" },
    { ...valid, origin: "https://attacker.example.test" },
    { ...valid, "sec-fetch-site": "cross-site" },
    { ...valid, "x-csrf-token": "wrong" },
    { origin, "x-csrf-token": "proof" },
  ];
  for (const headers of rejected) {
    expect(() =>
      requireConsoleRequest(
        request(headers, "/auth/logout", "POST"),
        cookiePolicy
      )
    ).toThrow(ConsoleRequestError);
  }
});

test("malformed expected subject fails 400 and authenticated mismatch fails 412 before host invocation", async () => {
  const f = fixture();
  for (const value of ["", "alice,bob", "a".repeat(257), "alice\tbob"]) {
    try {
      expectedConsoleSubject(request({ "x-lenso-expected-subject": value }));
      throw new Error("Expected malformed subject rejection");
    } catch (error) {
      expect(error).toMatchObject({ status: 400, code: "bad_request" });
    }
  }
  await expect(
    f.service.authenticate(
      request({
        authorization: "Bearer first",
        "x-lenso-expected-subject": "bob",
      })
    )
  ).rejects.toMatchObject({ status: 412, code: "session_changed" });
  const duplicate = new Headers({ authorization: "Bearer first" });
  duplicate.append("x-lenso-expected-subject", "alice");
  duplicate.append("x-lenso-expected-subject", "alice");
  await expect(
    f.service.authenticate(request(duplicate))
  ).rejects.toMatchObject({ status: 400 });
});

test("absent browser owner advertises no login and does not pretend logout or renewal succeeded", async () => {
  const f = fixture();
  expect(
    await (await f.service.fetch(request({}, "/auth/methods")))!.json()
  ).toEqual({ methods: [] });
  expect(
    await f.service.fetch(request({}, "/auth/logout", "POST"))
  ).toBeUndefined();
  expect(
    await f.service.fetch(request({}, "/auth/renew", "POST"))
  ).toBeUndefined();
});

// Existing POST handlers do not prove navigation-based identity-provider handoff.
test("redirect methods dispatch the mounted host GET handler and preserve its redirect", async () => {
  const f = fixture(cookiePolicy, [
    externalEntry({
      descriptor: {
        id: "company",
        kind: "redirect",
        label: "Company account",
        action: "/auth/company",
      },
      async start(_input, context) {
        expect(context.returnPath).toBe("/console/records");
        return new Response(null, {
          status: 302,
          headers: {
            location: "https://identity.example.test/authorize",
          },
        });
      },
    }),
  ]);
  const response = await f.service.fetch(
    request({}, "/auth/company?return_to=/console/records")
  );
  expect(response?.status).toBe(302);
  expect(response?.headers.get("location")).toBe(
    "https://identity.example.test/authorize"
  );
  const wrongMethod = await f.service.fetch(
    request(
      {
        origin,
        cookie: "__Host-lenso-csrf=csrf",
        "x-csrf-token": "csrf",
      },
      "/auth/company",
      "POST"
    )
  );
  expect(wrongMethod?.status).toBe(405);
});

test("request cancellation preserves the exact caller reason rather than returning 503", async () => {
  const f = fixture();
  const controller = new AbortController();
  const reason = new Error("caller cancelled");
  controller.abort(reason);
  try {
    await f.service.authenticate(
      request(
        { authorization: "Bearer first" },
        undefined,
        undefined,
        controller.signal
      )
    );
    throw new Error("Expected cancellation");
  } catch (error) {
    expect(error).toBe(reason);
  }
  expect(() => consoleRequestErrorResponse(reason, controller.signal)).toThrow(
    reason
  );
});

test("Auth binding rotates/revokes sessions and retires Console identity proofs", async () => {
  let time = 1000;
  const records = new Map<string, SessionRecord<string>>();
  const store: SessionStore<string> = {
    async create(record) {
      if (records.has(record.id)) {
        throw new Error("Duplicate session");
      }
      records.set(record.id, record);
    },
    async read(realmId, id) {
      const record = records.get(id);
      return record?.realmId === realmId ? record : null;
    },
    async mutate(mutation) {
      const current = records.get(mutation.next.id);
      const { next } = mutation;
      const at = Math.max(time, mutation.now);
      if (
        !current ||
        current.realmId !== next.realmId ||
        current.revokedAt !== null ||
        current.revision !== mutation.expectedRevision ||
        current.tokenDigest !== mutation.expectedDigest ||
        at >=
          Math.min(
            current.expiresAt,
            next.expiresAt,
            current.lastActiveAt +
              Math.min(current.idleTimeoutMs, next.idleTimeoutMs)
          ) ||
        (mutation.kind === "renew" &&
          at < current.renewedAt + next.renewAfterMs) ||
        next.revision !== current.revision + 1 ||
        next.expiresAt > current.expiresAt ||
        next.idleTimeoutMs > current.idleTimeoutMs ||
        next.renewAfterMs < current.renewAfterMs
      ) {
        return false;
      }
      records.set(next.id, next);
      return true;
    },
    async revoke(realmId, id, at) {
      const current = records.get(id);
      if (
        !current ||
        current.realmId !== realmId ||
        current.revokedAt !== null
      ) {
        return false;
      }
      records.set(id, {
        ...current,
        revokedAt: at,
        revision: current.revision + 1,
      });
      return true;
    },
  };
  let invocations = 0;
  const sessions = createManagedSessions({
    realmId: "host-realm",
    store,
    now: () => time,
    lifetime: { idle: 100, absolute: 500, renewAfter: 20 },
    subjectActive: async (subject) => subject === "alice",
    login: {
      verify: async (proof: { identifier: string; password: string }) => {
        invocations += 1;
        return proof.password === "disposable-test-proof"
          ? { status: "verified", subjectId: "alice" }
          : { status: "rejected" };
      },
    },
  });
  const auth = createAuth(realm("host-realm", sessions.source), {
    now: () => time,
  });
  cleanups.push(async () => {
    await auth.close();
    await sessions.close();
    records.clear();
  });
  const access = auth.for(audience("console"));
  const binding = createAuthHttpBinding({
    access,
    requestPolicy: cookiePolicy,
    evidence: (input) => authCookie(input, "__Host-lenso-session"),
    methodsPath: "/auth/methods",
    returnRoots: ["/console"],
    sessions,
    renewPath: "/auth/renew",
    logoutPath: "/auth/logout",
    login: [
      passwordLogin({
        id: "test",
        label: "Disposable test owner",
        path: "/auth/login",
        sessions,
      }),
    ],
  });
  const service = createConsoleAuthentication({
    access,
    binding,
    policy: () => true,
    permissionRevision: () => "1",
    session: () => ({ administrator: false, workspace_ids: [] }),
  });
  expect(
    (await service.fetch(
      request(
        { origin: "https://attacker.example.test" },
        "/auth/login",
        "POST"
      )
    ))!.status
  ).toBe(403);
  expect(invocations).toBe(0);
  const login = await service.fetch(
    new Request(`${origin}/auth/login`, {
      method: "POST",
      headers: {
        origin,
        cookie: "__Host-lenso-csrf=csrf",
        "x-csrf-token": "csrf",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        identifier: "alice",
        password: "disposable-test-proof",
      }),
    })
  );
  const token = /__Host-lenso-session=([^;]+)/.exec(
    login!.headers.get("set-cookie")!
  )![1]!;
  const identity = await service.authenticate(
    request({ cookie: `__Host-lenso-session=${token}` })
  );
  expect(
    (await service.fetch(
      request(
        {
          origin,
          cookie: `__Host-lenso-session=${token}; __Host-lenso-csrf=csrf`,
          "x-csrf-token": "csrf",
          "x-lenso-expected-subject": "bob",
        },
        "/auth/logout",
        "POST"
      )
    ))!.status
  ).toBe(412);
  expect(invocations).toBe(1);
  time = 1021;
  const renewal = await service.fetch(
    request(
      {
        origin,
        cookie: `__Host-lenso-session=${token}; __Host-lenso-csrf=csrf`,
        "x-csrf-token": "csrf",
      },
      "/auth/renew",
      "POST"
    )
  );
  expect(renewal!.status).toBe(204);
  const rotated = /__Host-lenso-session=([^;]+)/.exec(
    renewal!.headers.get("set-cookie")!
  )![1]!;
  expect(rotated).not.toBe(token);
  expect(await service.can(identity, resource)).toBe(false);
  const current = await service.authenticate(
    request({ cookie: `__Host-lenso-session=${rotated}` })
  );
  const logout = await service.fetch(
    request(
      {
        origin,
        cookie: `__Host-lenso-session=${rotated}; __Host-lenso-csrf=csrf`,
        "x-csrf-token": "csrf",
      },
      "/auth/logout",
      "POST"
    )
  );
  expect(logout!.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await service.can(current, resource)).toBe(false);
  await expect(
    service.authenticate(request({ cookie: `__Host-lenso-session=${rotated}` }))
  ).rejects.toMatchObject({ status: 401 });
});

// Prevent scope transport from re-verifying during policy checks or accepting a
// different Request; existing fresh-enforce coverage does not exercise this opt-in.
test("explicit read scope binds the original request and refreshes permission revision before disclosure", async () => {
  const { defineSource } = await import("@lenso/auth");
  let verifies = 0,
    revision = "1",
    allowed = true;
  const auth = createAuth(
    realm(
      "read-console",
      defineSource<string>({
        capabilities: { authoritative: true },
        async verify() {
          verifies++;
          return {
            status: "verified",
            subjectId: "alice",
            kind: "user",
            session: { authoritative: true, expiresAt: Date.now() + 60000 },
          };
        },
      })
    )
  );
  const access = auth
    .for(audience("console"))
    .requireSession({ authoritative: true });
  const service = createConsoleAuthentication({
    access,
    requestPolicy: bearerPolicy,
    evidence: () => "fixture",
    permissionRevision: () => revision,
    policy: () => allowed,
    session: () => ({ administrator: false, workspace_ids: [] }),
  });
  try {
    const original = request({ authorization: "Bearer fixture" });
    const identity = await service.authenticate(original);
    await expect(
      service.beginRead!(identity, request({ authorization: "Bearer fixture" }))
    ).rejects.toMatchObject({ status: 401 });
    const scope = await service.beginRead!(identity, original);
    expect(await service.canRead!(identity, resource, scope)).toBe(true);
    expect(
      await service.canDispatchRead!(
        identity,
        { ...resource, action: "list" },
        resource,
        scope
      )
    ).toBe(true);
    expect(verifies).toBe(1);
    revision = "2";
    const current = await service.finishRead!(scope);
    expect(current.readScope).not.toBe(identity.readScope);
    expect(verifies).toBe(2);
    await expect(
      service.enforceRead!(identity, resource, scope)
    ).rejects.toThrow();
    service.closeRead!(scope);
    const second = request({ authorization: "Bearer fixture" });
    const other = await service.authenticate(second);
    const rejected = await service.beginRead!(other, second);
    expect(await service.canRead!(other, resource, rejected)).toBe(true);
    allowed = false;
    await expect(service.finishRead!(rejected)).rejects.toMatchObject({
      status: 403,
    });
    service.closeRead!(rejected);
  } finally {
    await auth.close();
  }
});
