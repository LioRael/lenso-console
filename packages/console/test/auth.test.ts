import { afterEach, expect, test } from "bun:test";

import { audience, createAuth, realm, type Actor } from "@lenso/auth";
import { bearerEvidence } from "@lenso/auth/fetch";
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
  type ConsoleBrowserAuthAdapter,
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
const bearerCredential = (input: Request) =>
  bearerEvidence({ request: input }).evidence;
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
  browser?: ConsoleBrowserAuthAdapter
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
    requestPolicy,
    evidence: (input) => new Headers(input.headers),
    permissionRevision: () => revision,
    session: (actor) => {
      const grant = grants.get(actor.subjectId);
      return {
        administrator: grant?.administrator ?? false,
        workspace_ids: grant?.workspaces ?? [],
      };
    },
    browser,
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

test("mounted host handlers actually renew/revoke managed sessions and preserve owner Set-Cookie", async () => {
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
  const sessions = createManagedSessions({
    realmId: "host-realm",
    store,
    now: () => time,
    lifetime: { idle: 100, absolute: 500, renewAfter: 20 },
    subjectActive: async (subject) => subject === "alice",
    login: {
      verify: async (proof: string) =>
        proof === "disposable-test-proof"
          ? { status: "verified", subjectId: "alice" }
          : { status: "rejected" },
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
  let invocations = 0;
  const service = createConsoleAuthentication({
    access: auth.for(audience("console")),
    policy: () => true,
    requestPolicy: bearerPolicy,
    evidence: bearerCredential,
    permissionRevision: () => "1",
    session: () => ({ administrator: false, workspace_ids: [] }),
    browser: {
      methodsPath: "/auth/methods",
      methods: [
        {
          id: "test",
          kind: "password",
          label: "Disposable test owner",
          action: "/auth/login",
        },
      ],
      handlers: [
        {
          path: "/auth/login",
          method: "POST",
          async handle(input) {
            invocations += 1;
            const issued = await sessions.issue(await input.text(), {
              signal: input.signal,
            });
            return new Response(null, {
              status: 204,
              headers: {
                "set-cookie": `__Host-lenso-session=${issued.credential}; Secure; HttpOnly; Path=/`,
              },
            });
          },
        },
        {
          path: "/auth/renew",
          method: "POST",
          authenticated: true,
          async handle(input) {
            invocations += 1;
            const renewed = await sessions.renew(bearerCredential(input)!, {
              signal: input.signal,
            });
            return new Response(null, {
              status: 204,
              headers: {
                "set-cookie": `__Host-lenso-session=${renewed.credential}; Secure; HttpOnly; Path=/`,
              },
            });
          },
        },
        {
          path: "/auth/logout",
          method: "POST",
          authenticated: true,
          async handle(input) {
            invocations += 1;
            await sessions.revoke(bearerCredential(input)!, {
              signal: input.signal,
            });
            return new Response(null, {
              status: 204,
              headers: {
                "set-cookie":
                  "__Host-lenso-session=; Secure; HttpOnly; Path=/; Max-Age=0",
              },
            });
          },
        },
      ],
    },
  });
  await expect(
    service.fetch(
      request(
        { origin: "https://attacker.example.test" },
        "/auth/login",
        "POST"
      )
    )
  ).rejects.toMatchObject({ status: 403 });
  expect(invocations).toBe(0);
  const login = await service.fetch(
    new Request(`${origin}/auth/login`, {
      method: "POST",
      headers: { origin },
      body: "disposable-test-proof",
    })
  );
  const token = /__Host-lenso-session=([^;]+)/.exec(
    login!.headers.get("set-cookie")!
  )![1]!;
  const identity = await service.authenticate(
    request({ authorization: `Bearer ${token}` })
  );
  await expect(
    service.fetch(
      request(
        {
          origin,
          authorization: `Bearer ${token}`,
          "x-lenso-expected-subject": "bob",
        },
        "/auth/logout",
        "POST"
      )
    )
  ).rejects.toMatchObject({ status: 412 });
  expect(invocations).toBe(1);
  time = 1021;
  const renewal = await service.fetch(
    request({ origin, authorization: `Bearer ${token}` }, "/auth/renew", "POST")
  );
  expect(renewal!.status).toBe(204);
  const rotated = /__Host-lenso-session=([^;]+)/.exec(
    renewal!.headers.get("set-cookie")!
  )![1]!;
  expect(rotated).not.toBe(token);
  expect(await service.can(identity, resource)).toBe(false);
  const current = await service.authenticate(
    request({ authorization: `Bearer ${rotated}` })
  );
  const logout = await service.fetch(
    request(
      { origin, authorization: `Bearer ${rotated}` },
      "/auth/logout",
      "POST"
    )
  );
  expect(logout!.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await service.can(current, resource)).toBe(false);
  await expect(
    service.authenticate(request({ authorization: `Bearer ${rotated}` }))
  ).rejects.toMatchObject({ status: 401 });
});
