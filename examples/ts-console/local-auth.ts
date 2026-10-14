import { Database } from "bun:sqlite";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  audience,
  createAuth,
  defineSource,
  realm,
  type Actor,
  type PolicyContext,
} from "@lenso/auth";
import {
  administrationActions,
  administrationRequirements,
  type AdministrationContext,
  type AdministrationAction,
  type AdministrationMethod,
} from "@lenso/auth-console/administration/server";
import { sqliteSessionStore } from "@lenso/auth/drizzle/sqlite";
import {
  assertAuthHttpBindings,
  authCookie,
  createAuthHttpBinding,
} from "@lenso/auth/http";
import { passwordLogin, type PasswordInput } from "@lenso/auth/interactive";
import { createAuthPlugin } from "@lenso/auth/plugin";
import {
  createManagedSessions,
  createSessionAdministration,
} from "@lenso/auth/sessions";
import type { RoleSnapshot, RoleStore } from "@lenso/authorization";
import type { ConsoleResource } from "@lenso/console";
import { createConsoleAuthPlugin } from "@lenso/console/auth";
import {
  createConsoleAuthorizationPolicy,
  createConsoleScopedAuthorization,
} from "@lenso/console/authorization";
import { drizzle } from "drizzle-orm/bun-sqlite";

import type { LocalAdministrationState } from "./administration-host";
import type { HostConfiguration } from "./configuration";

export const localScope = { type: "tenant", id: "local" };
export const localRealm = "ts-console-local";
export const localTarget = "local";
export const sessionCookie = "__Host-lenso-console-session";
export const csrfCookie = "__Host-lenso-console-csrf";
const digest = (value: string) => createHash("sha256").update(value).digest();

export function createLocalAuthentication(
  config: HostConfiguration,
  state?: LocalAdministrationState
) {
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
  const localSnapshot: RoleSnapshot<"access" | "configure"> = {
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
    read: () => structuredClone(localSnapshot),
    compareAndSwap: () => false,
  };
  const authorization = createConsoleScopedAuthorization({
    actions: ["access", "configure"] as const,
    rbac: { store: roleStore },
  });
  const source = createAuthPlugin({
    id: "local-auth-source",
    requires: state ? [state] : [],
    async setup(context) {
      const persistent = state ? context.get(state) : undefined;
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
      const sessionStore = sqliteSessionStore(drizzle(client));
      const sessions = createManagedSessions({
        realmId: localRealm,
        store: sessionStore,
        lifetime: {
          idle: 3_600_000,
          absolute: 28_800_000,
          renewAfter: 900_000,
        },
        subjectActive: async (subject, verification) => {
          if (!persistent) {
            return subject === config.subject;
          }
          const user = await persistent.directory.read(
            subject,
            verification.signal
          );
          return user?.status === "active";
        },
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
        returnRoots: [
          "/",
          "/console",
          "/authorization",
          "/runtime",
          "/identity",
          "/access",
          "/agent-connections",
        ],
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
      const sessionAdministration = persistent
        ? (() => {
            const staffAccess = auth
              .for(audience("console"))
              .memberships(async (actor) =>
                actor.realmId === localRealm
                  ? persistent.store.admission(actor.subjectId)
                  : null
              );
            const staffAuthorization = createConsoleScopedAuthorization({
              actions: administrationActions,
              rbac: { store: persistent.store.roleStore },
            });
            const administration = createSessionAdministration({
              realmId: localRealm,
              store: sessionStore,
              access: staffAccess,
              policy: ({ principal: actor, resource, signal }) =>
                staffAuthorization.can(
                  {
                    principal: actor,
                    action:
                      (resource.operation === "scope" &&
                        resource.action !== "revoke") ||
                      resource.operation === "get"
                        ? "sessions.list"
                        : "sessions.revoke",
                    resource: {
                      type: "console",
                      id: localTarget,
                      scope: persistent.store.scope,
                    },
                    context: {},
                  },
                  { signal }
                ),
              auditScope: {
                tenantId: localScope.id,
                scopeId: persistent.store.scope.id,
              },
              audit: {
                prepare: (input, actor) =>
                  persistent.audit.prepare(
                    input,
                    persistent.mint(actor, "human")
                  ),
                complete: persistent.audit.complete,
              },
            });
            return {
              async list(
                subjectId: string,
                input: { limit?: number; cursor?: string },
                caller: AdministrationContext
              ) {
                await persistent.assertManagementCaller(caller);
                const page = await administration.list(
                  {
                    ...(input.limit === undefined
                      ? {}
                      : { limit: input.limit }),
                    ...(input.cursor === undefined
                      ? {}
                      : { cursor: input.cursor }),
                  },
                  caller.principal as Parameters<typeof administration.list>[1],
                  { signal: caller.signal }
                );
                return {
                  items: page.sessions
                    .filter((session) => session.subjectId === subjectId)
                    .map((session) => ({
                      id: session.id,
                      subjectId: session.subjectId,
                      createdAt: session.issuedAt,
                      expiresAt: session.expiresAt,
                      revokedAt: session.revokedAt,
                      revision: session.revision,
                    })),
                  nextCursor: page.nextCursor,
                };
              },
              async revoke(
                id: string,
                subjectId: string,
                expectedRevision: number,
                caller: AdministrationContext
              ) {
                await persistent.assertManagementCaller(caller);
                const actor = caller.principal as Parameters<
                  typeof administration.get
                >[1];
                const session = await administration.get({ id }, actor, {
                  signal: caller.signal,
                });
                if (!session || session.subjectId !== subjectId) {
                  return false;
                }
                const result = await administration.revoke(
                  { id, expectedRevision },
                  actor,
                  {
                    signal: caller.signal,
                  }
                );
                return result.revoked;
              },
            };
          })()
        : undefined;
      return {
        auth,
        binding,
        sessionAdministration,
        sessionStore,
        persistent,
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
    configure({ auth, binding, persistent }) {
      return {
        binding,
        access: auth
          .for(audience("console"))
          .memberships(
            async (actor, resource: ConsoleResource, verification) => {
              if (
                resource.targetId !== localTarget ||
                resource.tenantId !== localScope.id
              ) {
                return null;
              }
              if (!persistent) {
                return { snapshot: undefined };
              }
              const currentSnapshot = await persistent.store.roleStore.read({
                now: Date.now(),
                signal: verification.signal,
              });
              return currentSnapshot.graph.bindings.some(
                (memberBinding) =>
                  memberBinding.principal.subjectId === actor.subjectId &&
                  memberBinding.principal.realmId === actor.realmId
              )
                ? { snapshot: currentSnapshot }
                : null;
            }
          ),
        policy: persistent
          ? async ({
              principal: actor,
              resource,
              membership,
              signal,
            }: PolicyContext<
              Actor,
              ConsoleResource,
              { snapshot: RoleSnapshot<AdministrationAction> | undefined }
            >) => {
              const permission = persistent.permission(resource);
              if (
                resource.pluginId === "console-administration" &&
                resource.operation &&
                resource.operation !== "info"
              ) {
                if (!membership.snapshot) {
                  return false;
                }
                const required =
                  administrationRequirements[
                    resource.operation as AdministrationMethod
                  ] ?? (permission ? [permission] : undefined);
                if (!required) {
                  return false;
                }
                const phaseAuthorization = createConsoleScopedAuthorization({
                  actions: administrationActions,
                  rbac: { graph: membership.snapshot.graph },
                });
                for (const requiredAction of required) {
                  if (
                    !(await phaseAuthorization.can(
                      {
                        principal: actor,
                        action: requiredAction,
                        resource: {
                          type: "console",
                          id: localTarget,
                          scope: persistent.store.scope,
                        },
                        context: {},
                      },
                      { signal }
                    ))
                  ) {
                    return false;
                  }
                }
                return true;
              }
              // Shell admission is separate from administration privileges. Configure
              // and unrelated owner invocation are never inferred from membership.
              return (
                ["session", "list"].includes(resource.action) ||
                (resource.pluginId === "console-administration" &&
                  resource.operation === "info")
              );
            }
          : createConsoleAuthorizationPolicy({
              authorization,
              map: ({ principal: actor, resource }) => ({
                principal: { ...principal, subjectId: actor.subjectId },
                action:
                  resource.action === "configure" ? "configure" : "access",
                resource: {
                  type: "console",
                  id: localTarget,
                  scope: localScope,
                },
                context: {},
              }),
            }),
        permissionRevision: () =>
          persistent
            ? persistent.store.read().revision
            : localSnapshot.revision,
        session: (actor) => {
          const currentSnapshot = persistent?.store.read();
          const member = currentSnapshot?.members.find(
            (value) => value.subjectId === actor.subjectId
          );
          const permissions = currentSnapshot?.roles.find(
            (role) => role.id === member?.roleId
          )?.permissions;
          return {
            administrator:
              !persistent ||
              (!!permissions?.includes("members.write") &&
                permissions.includes("roles.write")),
            workspace_ids: [],
          };
        },
      };
    },
  });
  return { source, authentication, roleStore, principal, requestPolicy };
}
