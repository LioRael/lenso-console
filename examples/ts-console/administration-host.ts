import { Database } from "bun:sqlite";

import type { KeyMetadata } from "@lenso/api-keys";
import { createAuditService } from "@lenso/audit";
import { createSqliteAuditRepository } from "@lenso/audit/sqlite";
import {
  audience,
  createAuth,
  defineSource,
  realm,
  type Actor,
} from "@lenso/auth";
import {
  administrationActions,
  administrationRequirements,
  AdministrationError,
  createConsoleAdministrationManage,
  createConsoleAdministrationService,
  createConsoleAdministrationStore,
  type AdministrationAction,
  type AdministrationMethod,
  type AdministrationContext,
  type DirectoryUser,
  type PageInput,
} from "@lenso/auth-console/administration/server";
import { createSessionAdministration } from "@lenso/auth/sessions";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleResource,
} from "@lenso/console";
import {
  ConsoleRequestError,
  consoleRequestErrorResponse,
} from "@lenso/console/auth";
import { definePlugin, type Plugin } from "@lenso/core";
import type { OperationRuntime } from "@lenso/engine/operations";
import { createHttpMcp, type McpIdentity } from "@lenso/mcp";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { z } from "zod";

import type { HostConfiguration } from "./configuration";
import {
  localRealm,
  localScope,
  localTarget,
  type createLocalAuthentication,
} from "./local-auth";

const instance = {
  consoleId: localTarget,
  tenantId: localScope.id,
  realmId: localRealm,
};
const administrationPath = (config: HostConfiguration) =>
  `${config.databasePath}.administration`;

type Row = { subject_id: string; label: string; status: "active" | "disabled" };
function project(row: Row): DirectoryUser {
  return {
    subjectId: row.subject_id,
    realmId: localRealm,
    label: row.label,
    status: row.status,
    source: "local-operator-directory",
  };
}
function binding(
  owned: LocalAdministration,
  identity: ConsoleIdentity,
  signal: AbortSignal,
  revalidate: () => Promise<void>
) {
  return owned.mint(identity.actor, "human", signal, undefined, revalidate);
}

function administrationStore(database: Database) {
  return createConsoleAdministrationStore({
    database,
    ...instance,
    subjectActiveAtCommit(subjectId) {
      const row = database
        .query<{ status: string }, [string]>(
          "SELECT status FROM local_console_directory WHERE subject_id = ?"
        )
        .get(subjectId);
      return row?.status === "active";
    },
  });
}

function openState(config: HostConfiguration) {
  const database = new Database(administrationPath(config), {
    create: true,
    strict: true,
  });
  try {
    database.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS local_console_directory (
        subject_id TEXT PRIMARY KEY, label TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled'))
      );
      CREATE TABLE IF NOT EXISTS lenso_audit_events (
        tenant_key TEXT NOT NULL, scope_id TEXT NOT NULL, id TEXT NOT NULL,
        recorded_at INTEGER NOT NULL, action TEXT NOT NULL,
        target_type TEXT NOT NULL, target_id TEXT NOT NULL, result TEXT NOT NULL,
        correlation_id TEXT, event_json TEXT NOT NULL,
        PRIMARY KEY (tenant_key, scope_id, id)
      );
      CREATE INDEX IF NOT EXISTS lenso_audit_events_scope_order
        ON lenso_audit_events (tenant_key, scope_id, recorded_at DESC, id DESC);`);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

/** Explicit local provisioning, never called by application startup. */
export function initializeLocalAdministration(
  config: HostConfiguration,
  additionalUsers: readonly { subjectId: string; label: string }[] = []
) {
  const database = openState(config);
  try {
    const store = administrationStore(database);
    return database.transaction(() => {
      const initialized = store.initializeInstance(config.subject);
      if (!initialized) {
        return false;
      }
      const insert = database.query(
        "INSERT INTO local_console_directory (subject_id, label, status) VALUES (?, ?, 'active')"
      );
      insert.run(config.subject, config.subject);
      for (const user of additionalUsers) {
        if (user.subjectId !== config.subject) {
          insert.run(user.subjectId, user.label);
        }
      }
      return true;
    })();
  } finally {
    database.close();
  }
}

export function createLocalAdministrationState(config: HostConfiguration) {
  return definePlugin({
    id: "local-console-state",
    setup(context) {
      const database = openState(config);
      context.onCleanup(() => database.close());
      const store = administrationStore(database);
      const callers = new WeakSet<AdministrationContext>();
      const phaseVerifiers = new WeakMap<
        AdministrationContext,
        () => Promise<void>
      >();
      const mint = (
        principal: AdministrationContext["principal"],
        entry: AdministrationContext["entry"],
        signal?: AbortSignal,
        credentialScopes?: readonly AdministrationAction[],
        revalidate?: () => Promise<void>
      ): AdministrationContext => {
        const caller = Object.freeze({
          principal,
          entry,
          signal,
          credentialScopes,
        });
        callers.add(caller);
        if (revalidate) {
          phaseVerifiers.set(caller, revalidate);
        }
        return caller;
      };
      const assertManagementCaller = async (
        caller: AdministrationContext,
        phase?: "dispatch" | "disclosure"
      ) => {
        caller.signal?.throwIfAborted();
        if (!callers.has(caller) || caller.principal.realmId !== localRealm) {
          throw new ConsoleRequestError("forbidden");
        }
        if (phase) {
          const verify = phaseVerifiers.get(caller);
          if (!verify) {
            throw new ConsoleRequestError("forbidden");
          }
          await verify();
          caller.signal?.throwIfAborted();
        }
      };
      const directory = {
        async read(subjectId: string, signal?: AbortSignal) {
          signal?.throwIfAborted();
          const row = database
            .query<Row, [string]>(
              "SELECT subject_id, label, status FROM local_console_directory WHERE subject_id = ?"
            )
            .get(subjectId);
          return row ? project(row) : null;
        },
        async list(input: PageInput, signal?: AbortSignal) {
          signal?.throwIfAborted();
          const limit = Math.min(input.limit ?? 50, 100);
          const rows = database
            .query<Row, [string, string, number]>(
              "SELECT subject_id, label, status FROM local_console_directory WHERE subject_id > ? AND instr(lower(label), lower(?)) > 0 ORDER BY subject_id LIMIT ?"
            )
            .all(input.cursor ?? "", input.search ?? "", limit + 1);
          return {
            items: rows.slice(0, limit).map(project),
            nextCursor:
              rows.length > limit ? rows[limit - 1]!.subject_id : null,
          };
        },
        async disable(
          subjectId: string,
          expectedRevision: string,
          signal?: AbortSignal
        ) {
          signal?.throwIfAborted();
          return database
            .transaction(() => {
              const current = store.read();
              if (current.revision !== expectedRevision) {
                throw new AdministrationError("CONFLICT");
              }
              const member = current.members.find(
                (value) => value.subjectId === subjectId
              );
              const role = current.roles.find(
                (value) => value.id === member?.roleId
              );
              if (
                role?.permissions.some(
                  (action) =>
                    action === "members.promote" || action === "roles.write"
                )
              ) {
                throw new AdministrationError("DENIED");
              }
              const changed =
                database
                  .query(
                    "UPDATE local_console_directory SET status = 'disabled' WHERE subject_id = ? AND status = 'active'"
                  )
                  .run(subjectId).changes > 0;
              if (changed) {
                store.mutate(expectedRevision, (snapshot) => snapshot);
              }
              return changed;
            })
            .immediate();
        },
      };
      const audit = createAuditService<AdministrationContext>({
        repository: createSqliteAuditRepository(drizzle(database), {
          durableIntents: true,
        }),
        authority: {
          async resolve(caller, scope) {
            await assertManagementCaller(caller);
            if (
              scope.tenantId !== instance.tenantId ||
              scope.scopeId !== store.scope.id
            ) {
              throw new ConsoleRequestError("forbidden");
            }
            return {
              realmId: caller.principal.realmId,
              subjectId: caller.principal.subjectId,
              kind: "user",
            };
          },
        },
        summaryPolicy: Object.fromEntries(
          administrationActions.map((action) => [
            action,
            { agent: { type: "boolean" as const } },
          ])
        ),
      });
      return {
        store,
        directory,
        audit,
        mint,
        assertManagementCaller,
        permission: administrationPermission,
      };
    },
  });
}

export type LocalAdministrationState = ReturnType<
  typeof createLocalAdministrationState
>;
export type LocalAdministration =
  LocalAdministrationState extends Plugin<infer T> ? T : never;

function methodAction(method: string): AdministrationAction | null {
  if (method === "issue") {
    return "tokens.issue";
  }
  if (method === "rotate") {
    return "tokens.rotate";
  }
  return (
    administrationRequirements[method as AdministrationMethod]?.[0] ?? null
  );
}
export function administrationPermission(
  resource: ConsoleResource
): AdministrationAction | null {
  return resource.pluginId === "console-administration"
    ? methodAction(resource.operation ?? "")
    : null;
}

const issueInput = z.strictObject({
  requestedScopes: z
    .array(z.enum(administrationActions))
    .min(1)
    .max(administrationActions.length),
  expiresAt: z.number().int().positive(),
  requestId: z.string().min(1).max(128),
});
const rotateInput = z.strictObject({
  id: z.string().min(1).max(128),
  expectedRevision: z.number().int().nonnegative(),
  overlapMs: z.number().int().min(0).max(300_000),
});

async function smallJson(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
      "application/json" ||
    !request.body
  ) {
    throw new ConsoleRequestError("bad_request");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > 4096) {
        throw new ConsoleRequestError("bad_request");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw new ConsoleRequestError("bad_request");
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Preserve the original input failure when the stream is already closed.
    }
    reader.releaseLock();
  }
}

export function createAdministrationHost(
  config: HostConfiguration,
  state: LocalAdministrationState,
  local: ReturnType<typeof createLocalAuthentication>
) {
  const mcpPath = `${config.apiBasePath}/admin/mcp`;
  const mcpUrl = config.origin + mcpPath;
  const plugin = definePlugin({
    id: "console-administration",
    requires: [state, local.source],
    setup(context) {
      const owned = context.get(state);
      const source = context.get(local.source);
      type AgentEvidence = { readonly credential: string };
      const keyFacts = new WeakMap<AgentEvidence, KeyMetadata>();
      const actorEvidence = new WeakMap<Actor, AgentEvidence>();
      const service = createConsoleAdministrationService({
        ...instance,
        mcpUrl,
        store: owned.store,
        directory: owned.directory,
        audit: owned.audit,
        sessions: {
          agent: true,
          async list(subjectId, input, caller) {
            if (caller.entry === "human") {
              return source.sessionAdministration!.list(
                subjectId,
                input,
                caller
              );
            }
            const page = await agentSessions.list(
              {
                ...(input.limit === undefined ? {} : { limit: input.limit }),
                ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
              },
              caller.principal as Parameters<typeof agentSessions.list>[1],
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
          async revoke(id, subjectId, expectedRevision, caller) {
            if (caller.entry === "human") {
              return source.sessionAdministration!.revoke(
                id,
                subjectId,
                expectedRevision,
                caller
              );
            }
            const actor = caller.principal as Parameters<
              typeof agentSessions.get
            >[1];
            const session = await agentSessions.get({ id }, actor, {
              signal: caller.signal,
            });
            if (!session || session.subjectId !== subjectId) {
              return false;
            }
            const result = await agentSessions.revoke(
              { id, expectedRevision },
              actor,
              {
                signal: caller.signal,
              }
            );
            return result.revoked;
          },
        },
        assertManagementCaller: owned.assertManagementCaller,
      });
      context.onCleanup(() => service.apiKeys.close());
      // Auth creates the agent actor; verified key metadata is not a serialized actor.
      const agentAuth = createAuth(
        realm(
          localRealm,
          defineSource<AgentEvidence>({
            async verify(evidence, verification) {
              verification.signal.throwIfAborted();
              const key = await service.apiKeys.verify(evidence.credential);
              if (
                !key ||
                key.subject.namespace !== owned.store.scope.id ||
                key.subject.tenantId !== instance.tenantId
              ) {
                return { status: "rejected" };
              }
              keyFacts.set(evidence, key);
              return {
                status: "verified",
                subjectId: key.subject.subjectId,
                kind: "user",
              };
            },
          })
        )
      );
      context.onCleanup(() => agentAuth.close());
      const agentAccess = agentAuth
        .for(audience("mcp"))
        .memberships(async (actor) => {
          const snapshot = owned.store.read();
          const member = snapshot.members.find(
            (value) => value.subjectId === actor.subjectId
          );
          return member ? { member, snapshot } : null;
        });
      const agentCan = (
        actor: Actor,
        required: readonly AdministrationAction[],
        snapshot: ReturnType<LocalAdministration["store"]["read"]>
      ) => {
        const evidence = actorEvidence.get(actor);
        const key = evidence && keyFacts.get(evidence);
        const member = snapshot.members.find(
          (value) => value.subjectId === actor.subjectId
        );
        const role = snapshot.roles.find(
          (value) => value.id === member?.roleId
        );
        return (
          !!key &&
          !!member &&
          required.every(
            (action) =>
              key.scopes.includes(action) && role?.permissions.includes(action)
          )
        );
      };
      const agentSessions = createSessionAdministration({
        realmId: localRealm,
        store: source.sessionStore,
        access: agentAccess,
        policy: ({ principal: actor, resource, membership }) =>
          agentCan(
            actor,
            [
              resource.operation === "revoke" ||
              (resource.operation === "scope" && resource.action === "revoke")
                ? "sessions.revoke"
                : "sessions.list",
            ],
            membership.snapshot
          ),
        auditScope: {
          tenantId: instance.tenantId,
          scopeId: owned.store.scope.id,
        },
        audit: {
          prepare: (input, actor) =>
            owned.audit.prepare(input, owned.mint(actor, "agent")),
          complete: owned.audit.complete,
        },
      });
      return {
        ...service,
        async authenticateAgent(credential: string, signal: AbortSignal) {
          const evidence = Object.freeze({ credential });
          const actor = await agentAccess.required(evidence, { signal });
          actorEvidence.set(actor, evidence);
          const key = keyFacts.get(evidence)!;
          return {
            actor,
            key,
            async revalidate(required: readonly AdministrationAction[]) {
              await agentAccess.enforce(
                actor,
                {},
                ({ principal, membership }) =>
                  agentCan(principal, required, membership.snapshot),
                { signal }
              );
            },
          };
        },
      };
    },
  });
  const manage = createConsoleAdministrationManage(plugin);
  const credentialFetch = async (
    owned: LocalAdministration,
    service: ReturnType<typeof createConsoleAdministrationService>,
    authentication: ConsoleAuthentication,
    request: Request
  ): Promise<Response | undefined> => {
    const { pathname } = new URL(request.url);
    const operation =
      pathname === `${config.apiBasePath}/admin/credentials/issue`
        ? "issue"
        : pathname === `${config.apiBasePath}/admin/credentials/rotate`
          ? "rotate"
          : null;
    if (!operation) {
      return undefined;
    }
    try {
      if (request.method !== "POST") {
        return new Response(null, {
          status: 405,
          headers: { "cache-control": "no-store", allow: "POST" },
        });
      }
      const raw = await smallJson(request);
      const issued = issueInput.safeParse(raw);
      const rotated = rotateInput.safeParse(raw);
      if (operation === "issue" ? !issued.success : !rotated.success) {
        throw new ConsoleRequestError("bad_request");
      }
      const identity = await authentication.authenticate(request);
      const resource: ConsoleResource = {
        targetId: localTarget,
        tenantId: localScope.id,
        pluginId: plugin.id,
        operation,
        action: "invoke",
      };
      await authentication.enforce(identity, resource);
      const caller = binding(owned, identity, request.signal, () =>
        authentication.enforce(identity, resource)
      );
      const result =
        operation === "issue"
          ? await service.issueToken(
              {
                scopes: issued.data!.requestedScopes,
                expiresAt: issued.data!.expiresAt,
                requestId: issued.data!.requestId,
              },
              caller
            )
          : await service.rotateToken(rotated.data!, caller);
      return Response.json(result, {
        headers: { "cache-control": "no-store", pragma: "no-cache" },
      });
    } catch (error) {
      if (error instanceof AdministrationError) {
        const status = {
          DENIED: 403,
          CONFLICT: 409,
          INVALID_INPUT: 400,
          UNAVAILABLE: 503,
          OUTCOME_UNKNOWN: 503,
        }[error.code];
        return Response.json(
          {
            code: error.code,
            message: "Credential operation could not be confirmed",
            ...(error.intentId ? { intentId: error.intentId } : {}),
          },
          {
            status,
            headers: {
              "cache-control": "no-store",
              ...(error.intentId
                ? { "x-lenso-audit-intent": error.intentId }
                : {}),
            },
          }
        );
      }
      return consoleRequestErrorResponse(error, request.signal);
    }
  };
  const createMcp = async (
    running: OperationRuntime,
    options: { listPageSize?: number } = {}
  ) => {
    const service = running.get(plugin);
    const owned = running.get(state);
    const approved = new Set([
      "info",
      "usersList",
      "usersRead",
      "sessionsList",
      "accessRead",
      "permissionsRead",
      "tokensList",
      "auditList",
    ]);
    const operations = manage.operations.filter((operation) =>
      approved.has(operation.method)
    );
    const issuer = config.origin;
    type Identity = McpIdentity & {
      subjectId: string;
      credentialScopes: readonly AdministrationAction[];
      actor: Actor;
      revalidate(required: readonly AdministrationAction[]): Promise<void>;
    };
    const protocol = await createHttpMcp<Identity, (typeof operations)[number]>(
      {
        running,
        plugins: [plugin],
        operations,
        resource: mcpUrl,
        authenticationMode: "personal-token",
        personalTokenIssuer: issuer,
        listPageSize: options.listPageSize,
        requiredScopes: [],
        allowedOrigins: [config.origin],
        async verifyToken(credential, signal) {
          signal.throwIfAborted();
          const verified = await service.authenticateAgent(credential, signal);
          const { key } = verified;
          if (
            !key ||
            key.subject.namespace !== owned.store.scope.id ||
            key.subject.tenantId !== instance.tenantId
          ) {
            throw new ConsoleRequestError("unauthorized");
          }
          const user = await owned.directory.read(
            key.subject.subjectId,
            signal
          );
          const graph = owned.store.read();
          const activeMember = graph.members.find(
            (candidate) =>
              candidate.subjectId === key.subject.subjectId &&
              candidate.status === "active"
          );
          if (user?.status !== "active" || !activeMember) {
            throw new ConsoleRequestError("unauthorized");
          }
          const assignedRole = graph.roles.find(
            (candidate) => candidate.id === activeMember.roleId
          );
          const scopes = administrationActions.filter(
            (scope) =>
              key.scopes.includes(scope) &&
              assignedRole?.permissions.includes(scope)
          );
          return {
            subject: key.subject.subjectId,
            subjectId: key.subject.subjectId,
            tenant: key.subject.tenantId,
            issuer,
            audience: [mcpUrl],
            scopes,
            credentialScopes: scopes,
            actor: verified.actor,
            expiresAt: key.expiresAt / 1000,
            revalidate: verified.revalidate,
          };
        },
        canList(operation, request) {
          const required =
            administrationRequirements[
              operation.method as AdministrationMethod
            ];
          return (
            !!required &&
            required.every((action) => request.identity.scopes.includes(action))
          );
        },
        authorize(operation, request) {
          const required =
            administrationRequirements[
              operation.method as AdministrationMethod
            ];
          return (
            !!required &&
            required.every((action) => request.identity.scopes.includes(action))
          );
        },
        binding(operation, _input, request) {
          return {
            context: owned.mint(
              request.identity.actor,
              "agent",
              request.signal,
              request.identity.credentialScopes,
              async () => {
                const required =
                  administrationRequirements[
                    operation.method as AdministrationMethod
                  ];
                if (!required) {
                  throw new ConsoleRequestError("forbidden");
                }
                await request.identity.revalidate(required);
              }
            ),
            signal: request.signal,
          };
        },
        maxFrameBytes: 64 * 1024,
        maxResponseBytes: 1024 * 1024,
        maxSessions: 32,
      }
    );
    return protocol;
  };
  return { ...manage, state, mcpPath, binding, credentialFetch, createMcp };
}
