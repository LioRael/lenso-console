import { Database } from "bun:sqlite";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

import { audience, createAuth, defineSource, realm } from "@lenso/auth";
import { sqliteSessionStore } from "@lenso/auth/drizzle/sqlite";
import {
  assertAuthHttpBindings,
  authCookie,
  createAuthHttpBinding,
} from "@lenso/auth/http";
import { passwordLogin, type PasswordInput } from "@lenso/auth/interactive";
import { createAuthPlugin } from "@lenso/auth/plugin";
import { createManagedSessions } from "@lenso/auth/sessions";
import type { RoleSnapshot, RoleStore } from "@lenso/authorization";
import type { ConsoleResource } from "@lenso/console";
import { createConsoleAuthPlugin } from "@lenso/console/auth";
import {
  createConsoleAuthorizationPolicy,
  createConsoleScopedAuthorization,
} from "@lenso/console/authorization";
import { drizzle } from "drizzle-orm/bun-sqlite";

import type { HostConfiguration } from "./configuration";

export const localScope = { type: "tenant", id: "local" };
export const localRealm = "ts-console-local";
export const localTarget = "local";
export const sessionCookie = "__Host-lenso-console-session";
export const csrfCookie = "__Host-lenso-console-csrf";
const digest = (value: string) => createHash("sha256").update(value).digest();

export function createLocalAuthentication(config: HostConfiguration) {
  const requestPolicy = {
    origin: config.origin,
    credentialMode: "cookie" as const,
    sessionCookieName: sessionCookie,
    csrfCookieName: csrfCookie,
  } as const;
  // This isolated local example uses an explicitly configured operator secret,
  // not a built-in account or a registration/user-management service.
  const tokenDigest = digest(config.token);
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
  const source = createAuthPlugin({
    id: "local-auth-source",
    async setup(context) {
      const client = new Database(`${config.databasePath}.auth`, {
        create: true,
        strict: true,
      });
      context.onCleanup(() => client.close());
      client.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000");
      const sql = await readFile(
        new URL(
          import.meta
            .resolve("@lenso/auth/migrations/sqlite/0000_auth_sessions.sql")
        ),
        "utf-8"
      );
      if (
        !client
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'"
          )
          .get()
      ) {
        client.transaction(() => client.exec(sql))();
      }
      const sessions = createManagedSessions({
        realmId: localRealm,
        store: sqliteSessionStore(drizzle(client)),
        lifetime: {
          idle: 3_600_000,
          absolute: 28_800_000,
          renewAfter: 900_000,
        },
        subjectActive: async (subject) => subject === config.subject,
        login: defineSource({
          async verify(input: PasswordInput) {
            return input.identifier === config.subject &&
              timingSafeEqual(digest(input.password), tokenDigest)
              ? { status: "verified", subjectId: config.subject, kind: "user" }
              : { status: "rejected" };
          },
        }),
      });
      context.onCleanup(() => sessions.close());
      const auth = createAuth(realm(localRealm, sessions.source));
      context.onCleanup(() => auth.close());
      const binding = createAuthHttpBinding({
        access: auth.for(audience("console")),
        requestPolicy,
        evidence: (request) => authCookie(request, sessionCookie),
        methodsPath: `${config.authBasePath}/methods`,
        returnRoots: ["/", "/console", "/authorization", "/runtime"],
        login: [
          passwordLogin({
            id: "local-password",
            label: "Local operator token",
            path: `${config.authBasePath}/login`,
            sessions,
          }),
        ],
        sessions,
        logoutPath: `${config.authBasePath}/logout`,
      });
      assertAuthHttpBindings([binding]);
      return {
        auth,
        binding,
        close: async () => {
          await auth.close();
          await sessions.close();
        },
      };
    },
  });
  const authentication = createConsoleAuthPlugin({
    id: "local-console-auth",
    auth: source,
    configure({ auth, binding }) {
      return {
        binding,
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
        permissionRevision: () => snapshot.revision,
        session: () => ({ administrator: true, workspace_ids: [] }),
      };
    },
  });
  return { source, authentication, roleStore, principal, requestPolicy };
}
