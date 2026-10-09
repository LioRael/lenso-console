import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import type { RoleSnapshot, RoleStore } from "@lenso/authorization";
import type { ConsoleResource } from "@lenso/console";
import { createConsoleAuthPlugin } from "@lenso/console/auth";
import {
  createConsoleAuthorizationPolicy,
  createConsoleScopedAuthorization,
} from "@lenso/console/authorization";
import { definePlugin } from "@lenso/core";

import type { HostConfiguration } from "./configuration";

export const localScope = { type: "tenant", id: "local" };
export const localRealm = "ts-console-local";
export const localTarget = "local";
export const sessionCookie = "__Host-lenso-session";
export const csrfCookie = "__Host-lenso-csrf";

const digest = (value: string) => createHash("sha256").update(value).digest();
const cookie = (name: string, value: string, httpOnly = false, maxAge = 3600) =>
  `${name}=${value}; Path=/; Secure; SameSite=Strict; Max-Age=${maxAge}${httpOnly ? "; HttpOnly" : ""}`;

export function readCookie(request: Request, name: string) {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0]!.slice(name.length + 1) : null;
}

export function createLocalAuthentication(config: HostConfiguration) {
  const tokenDigest = digest(config.token);
  const matchesToken = (value: unknown) =>
    typeof value === "string" &&
    value.length <= 4096 &&
    timingSafeEqual(digest(value), tokenDigest);
  const principal = {
    realmId: localRealm,
    kind: "user",
    subjectId: config.subject,
  };
  const snapshot: RoleSnapshot<"access" | "configure"> = {
    revision: "local-policy-1",
    graph: {
      roles: [
        {
          id: "local-operator",
          scope: localScope,
          permissions: [
            { action: "access", resourceType: "console", scope: localScope },
            { action: "configure", resourceType: "console", scope: localScope },
          ],
        },
      ],
      bindings: [
        {
          id: "local-operator-binding",
          principal,
          roleId: "local-operator",
          scope: localScope,
        },
      ],
    },
  };
  const roleStore: RoleStore<"access" | "configure"> = {
    read: () => structuredClone(snapshot),
    compareAndSwap: () => false,
  };
  const authorization = createConsoleScopedAuthorization({
    actions: ["access", "configure"] as const,
    rbac: { store: roleStore },
  });
  const source = definePlugin({
    id: "local-auth-source",
    setup(context) {
      const sessions = new Map<string, number>();
      const prune = () => {
        for (const [id, expiry] of sessions) {
          if (expiry <= Date.now()) {
            sessions.delete(id);
          }
        }
      };
      const auth = createAuth(
        realm(
          localRealm,
          defineSource({
            async verify(
              evidence: { kind: "token" | "session"; value: string } | null
            ) {
              prune();
              if (evidence === null) {
                return { status: "absent" };
              }
              return (
                evidence.kind === "token"
                  ? matchesToken(evidence.value)
                  : sessions.has(evidence.value)
              )
                ? {
                    status: "verified",
                    subjectId: config.subject,
                    kind: "user",
                  }
                : { status: "rejected" };
            },
          })
        )
      );
      context.onCleanup(() => auth.close());
      context.onCleanup(() => {
        sessions.clear();
      });
      return { auth, sessions, prune };
    },
  });
  const authentication = createConsoleAuthPlugin({
    id: "local-console-auth",
    auth: source,
    configure({ auth, sessions, prune }) {
      const methods = [
        {
          id: "local-token",
          kind: "password",
          label: "Local operator token",
          action: `${config.authBasePath}/login`,
        },
      ];
      return {
        access: auth
          .for(audience("console"))
          .memberships(async (_actor, resource: ConsoleResource) =>
            resource.targetId === localTarget &&
            resource.tenantId === localScope.id
              ? {}
              : null
          ),
        policy: createConsoleAuthorizationPolicy({
          authorization,
          map: ({ principal: actor, resource }) => ({
            principal: { ...principal, subjectId: actor.subjectId },
            action: resource.action === "configure" ? "configure" : "access",
            resource: { type: "console", id: localTarget, scope: localScope },
            context: {},
          }),
        }),
        requestPolicy: {
          origin: config.origin,
          credentialMode: "cookie",
          sessionCookieName: sessionCookie,
          csrfCookieName: csrfCookie,
        },
        evidence: (request) => {
          const value = readCookie(request, sessionCookie);
          return value ? { kind: "session" as const, value } : null;
        },
        permissionRevision: () => snapshot.revision,
        session: () => ({ administrator: true, workspace_ids: [] }),
        browser: {
          methodsPath: `${config.authBasePath}/methods`,
          methods,
          async discover() {
            return Response.json(
              {
                methods,
                csrf: { cookie_name: csrfCookie, header_name: "x-csrf-token" },
              },
              {
                headers: {
                  "cache-control": "no-store",
                  "set-cookie": cookie(
                    csrfCookie,
                    randomBytes(32).toString("hex")
                  ),
                },
              }
            );
          },
          handlers: [
            {
              path: `${config.authBasePath}/login`,
              method: "POST",
              async handle(request) {
                const size = Number(request.headers.get("content-length"));
                if (size > 8192) {
                  return new Response(null, { status: 413 });
                }
                const reader = request.body?.getReader();
                if (!reader) {
                  return new Response(null, { status: 400 });
                }
                const chunks: Uint8Array[] = [];
                let length = 0;
                try {
                  while (true) {
                    const part = await reader.read();
                    if (part.done) {
                      break;
                    }
                    length += part.value.byteLength;
                    if (length > 8192) {
                      await reader.cancel();
                      return new Response(null, { status: 413 });
                    }
                    chunks.push(part.value);
                  }
                } finally {
                  reader.releaseLock();
                }
                let input: unknown;
                try {
                  input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
                } catch {
                  return new Response(null, { status: 400 });
                }
                if (
                  !input ||
                  typeof input !== "object" ||
                  !("identifier" in input) ||
                  input.identifier !== config.subject ||
                  !("password" in input) ||
                  typeof input.password !== "string"
                ) {
                  return new Response(null, {
                    status: 401,
                    headers: { "cache-control": "no-store" },
                  });
                }
                try {
                  await auth
                    .for(audience("console"))
                    .required(
                      { kind: "token", value: input.password },
                      { signal: request.signal }
                    );
                } catch {
                  request.signal.throwIfAborted();
                  return new Response(null, {
                    status: 401,
                    headers: { "cache-control": "no-store" },
                  });
                }
                request.signal.throwIfAborted();
                prune();
                if (sessions.size >= 128) {
                  return new Response(null, { status: 429 });
                }
                const previous = readCookie(request, sessionCookie);
                if (previous) {
                  sessions.delete(previous);
                }
                const id = randomBytes(32).toString("hex");
                sessions.set(id, Date.now() + 3_600_000);
                return new Response(null, {
                  status: 204,
                  headers: {
                    "set-cookie": cookie(sessionCookie, id, true),
                    "cache-control": "no-store",
                  },
                });
              },
            },
            {
              path: `${config.authBasePath}/logout`,
              method: "POST",
              async handle(request) {
                const id = readCookie(request, sessionCookie);
                if (id) {
                  sessions.delete(id);
                }
                return new Response(null, {
                  status: 204,
                  headers: {
                    "set-cookie": cookie(sessionCookie, "", true, 0),
                    "cache-control": "no-store",
                  },
                });
              },
            },
          ],
        },
      };
    },
  });
  return { source, authentication, roleStore, principal };
}
