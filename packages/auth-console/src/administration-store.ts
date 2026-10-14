import type { Database } from "bun:sqlite";

import { sqliteApiKeyStore } from "@lenso/api-keys/drizzle/sqlite";
import {
  effectivePermissions,
  validateRoleGraph,
  type RoleStore,
  type RoleSnapshot,
  type Scope,
} from "@lenso/authorization";
import { drizzle } from "drizzle-orm/bun-sqlite";

import {
  administrationActions,
  readOnlyAdministrationActions,
  type AdministrationAction,
  type AccessSnapshot,
  type Member,
} from "./administration-contracts";

export class AdministrationError extends Error {
  readonly code:
    | "DENIED"
    | "CONFLICT"
    | "INVALID_INPUT"
    | "UNAVAILABLE"
    | "OUTCOME_UNKNOWN";
  readonly intentId: string | undefined;
  constructor(
    code:
      | "DENIED"
      | "CONFLICT"
      | "INVALID_INPUT"
      | "UNAVAILABLE"
      | "OUTCOME_UNKNOWN",
    intentId?: string
  ) {
    super(code);
    this.name = "AdministrationError";
    this.code = code;
    this.intentId = intentId;
  }
}

export const readOnlyActions = readOnlyAdministrationActions;
const operatorActions = [
  ...readOnlyActions,
  "sessions.revoke",
  "tokens.revoke",
] as const;
const administratorActions = administrationActions.filter(
  (action) => action !== "members.promote"
);
export const ownerRoleId = "instance-owner";

function snapshotCopy(value: RoleSnapshot<AdministrationAction>) {
  validateRoleGraph(value.graph, administrationActions);
  return structuredClone(value);
}

export function createConsoleAdministrationStore(options: {
  database: Database;
  consoleId: string;
  tenantId: string;
  realmId: string;
  /** Same-database synchronous fact, evaluated inside the commit transaction. */
  subjectActiveAtCommit: (subjectId: string) => boolean;
}) {
  const { database, consoleId, tenantId, realmId } = options;
  if (typeof options.subjectActiveAtCommit !== "function") {
    throw new AdministrationError("INVALID_INPUT");
  }
  if (
    ![consoleId, tenantId, realmId].every(
      (value) => typeof value === "string" && value.length > 0
    )
  ) {
    throw new AdministrationError("INVALID_INPUT");
  }
  const key = JSON.stringify([consoleId, tenantId, realmId]);
  const scope: Scope = {
    type: "console",
    id: `console:${Buffer.from(key).toString("base64url")}`,
  };
  if (scope.id.length > 256) {
    throw new AdministrationError("INVALID_INPUT");
  }
  database.exec(`CREATE TABLE IF NOT EXISTS console_administration (
    instance_key TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL
  )`);
  // Released API Keys SQLite schema: credentials are never persisted, only digests.
  database.exec(`CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY NOT NULL, namespace TEXT NOT NULL, tenant_id TEXT NOT NULL,
    subject_id TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL,
    previous_digest TEXT, scopes TEXT NOT NULL, revision INTEGER NOT NULL,
    issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER,
    overlap_until INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS api_keys_request_uq ON api_keys(namespace, tenant_id, request_id);
  CREATE UNIQUE INDEX IF NOT EXISTS api_keys_digest_uq ON api_keys(digest);
  CREATE UNIQUE INDEX IF NOT EXISTS api_keys_previous_digest_uq ON api_keys(previous_digest);
  CREATE INDEX IF NOT EXISTS api_keys_subject_idx ON api_keys(namespace, tenant_id, subject_id, id)`);
  type State = {
    snapshot: RoleSnapshot<AdministrationAction>;
    labels: Record<string, string>;
  };
  function state(): State {
    const row = database
      .query(
        "SELECT revision, state FROM console_administration WHERE instance_key = ?"
      )
      .get(key) as { revision: number; state: string } | null;
    if (!row) {
      throw new AdministrationError("UNAVAILABLE");
    }
    const value = JSON.parse(row.state) as State;
    value.snapshot = snapshotCopy({
      ...value.snapshot,
      revision: String(row.revision),
    });
    return value;
  }
  function validate(snapshot: RoleSnapshot<AdministrationAction>) {
    if (
      snapshot.graph.roles.some(
        (role) =>
          (role.inherits?.length ?? 0) !== 0 ||
          role.scope.id !== scope.id ||
          role.scope.type !== scope.type ||
          role.permissions.some(
            (permission) =>
              permission.resourceType !== "console" ||
              permission.resourceId !== undefined ||
              permission.scope.id !== scope.id ||
              permission.scope.type !== scope.type
          )
      )
    ) {
      throw new AdministrationError("DENIED");
    }
    if (
      snapshot.graph.bindings.some(
        (binding) =>
          binding.scope.id !== scope.id ||
          binding.scope.type !== scope.type ||
          binding.principal.realmId !== realmId ||
          binding.principal.kind !== "user" ||
          binding.principal.attributes !== undefined ||
          binding.expiresAt !== undefined
      )
    ) {
      throw new AdministrationError("DENIED");
    }
    if (
      new Set(
        snapshot.graph.bindings.map((binding) => binding.principal.subjectId)
      ).size !== snapshot.graph.bindings.length
    ) {
      throw new AdministrationError("DENIED");
    }
    const permissions = snapshot.graph.bindings
      .filter(
        (binding) =>
          options.subjectActiveAtCommit(binding.principal.subjectId) === true
      )
      .map((binding) =>
        effectivePermissions(
          snapshot.graph,
          binding.principal,
          scope,
          Date.now()
        ).map((p) => p.action)
      );
    if (
      !permissions.some((actions) =>
        administratorActions.every((action) => actions.includes(action))
      ) ||
      !permissions.some((actions) =>
        administrationActions.every((action) => actions.includes(action))
      )
    ) {
      throw new AdministrationError("DENIED");
    }
  }
  function commit(
    expectedRevision: string,
    next: RoleSnapshot<AdministrationAction>,
    labels?: Record<string, string>
  ) {
    return database
      .transaction(() => {
        const current = state();
        if (current.snapshot.revision !== expectedRevision) {
          return false;
        }
        const immutable = snapshotCopy(next);
        if (
          immutable.graph.bindings.some((binding) => {
            const before = current.snapshot.graph.bindings.find(
              (selected) =>
                selected.principal.subjectId === binding.principal.subjectId
            );
            return (
              (!before || before.roleId !== binding.roleId) &&
              options.subjectActiveAtCommit(binding.principal.subjectId) !==
                true
            );
          })
        ) {
          throw new AdministrationError("DENIED");
        }
        validate(immutable);
        const revision = Number(expectedRevision) + 1;
        if (!Number.isSafeInteger(revision)) {
          throw new AdministrationError("UNAVAILABLE");
        }
        return (
          database
            .query(
              "UPDATE console_administration SET revision = ?, state = ? WHERE instance_key = ? AND revision = ?"
            )
            .run(
              revision,
              JSON.stringify({
                snapshot: { ...immutable, revision: String(revision) },
                labels: labels ?? current.labels,
              }),
              key,
              Number(expectedRevision)
            ).changes === 1
        );
      })
      .immediate();
  }
  const roleStore: RoleStore<AdministrationAction> = {
    read: (evaluation) => {
      evaluation.signal.throwIfAborted();
      return state().snapshot;
    },
    compareAndSwap: (expected, next, evaluation) => {
      evaluation.signal.throwIfAborted();
      return commit(expected, next);
    },
  };
  function read(): AccessSnapshot {
    const { snapshot, labels } = state();
    return {
      revision: snapshot.revision,
      consoleId,
      tenantId,
      members: snapshot.graph.bindings.map((binding) => ({
        subjectId: binding.principal.subjectId,
        realmId,
        roleId: binding.roleId,
        status: "active" as const,
      })),
      roles: snapshot.graph.roles.map((role) => ({
        id: role.id,
        label: labels[role.id] ?? role.id,
        permissions: role.permissions.map((permission) => permission.action),
        preset: ["readonly", "operator", "administrator", ownerRoleId].includes(
          role.id
        ),
      })),
    };
  }
  return {
    consoleId,
    tenantId,
    realmId,
    scope,
    roleStore,
    apiKeyStore: sqliteApiKeyStore(drizzle(database)),
    revokeKey(
      subjectId: string,
      id: string,
      expectedRevision: number
    ): boolean {
      // The provider's general revoke intentionally follows concurrent successors.
      // This UI contract instead requires a revision match in the same SQL write.
      const result = database
        .query(`UPDATE api_keys SET revoked_at = ?, previous_digest = NULL,
        overlap_until = NULL, revision = revision + 1
        WHERE namespace = ? AND tenant_id = ? AND subject_id = ? AND id = ? AND revision = ? AND revoked_at IS NULL`)
        .run(Date.now(), scope.id, tenantId, subjectId, id, expectedRevision);
      if (result.changes !== 1) {
        throw new AdministrationError("CONFLICT");
      }
      return true;
    },
    read,
    admission(subjectId: string): Member | null {
      return (
        read().members.find((member) => member.subjectId === subjectId) ?? null
      );
    },
    initializeInstance(firstSubjectId: string): boolean {
      if (!firstSubjectId) {
        throw new AdministrationError("INVALID_INPUT");
      }
      const presets = [
        ["readonly", readOnlyActions],
        ["operator", operatorActions],
        ["administrator", administratorActions],
        [ownerRoleId, administrationActions],
      ] as const;
      const snapshot: RoleSnapshot<AdministrationAction> = {
        revision: "1",
        graph: {
          roles: presets.map(([id, actions]) => ({
            id,
            scope,
            permissions: actions.map((action) => ({
              action,
              resourceType: "console",
              scope,
            })),
          })),
          bindings: [
            {
              id: firstSubjectId,
              principal: { realmId, subjectId: firstSubjectId, kind: "user" },
              roleId: ownerRoleId,
              scope,
            },
          ],
        },
      };
      return (
        database
          .query(
            "INSERT OR IGNORE INTO console_administration(instance_key, revision, state) VALUES (?, 1, ?)"
          )
          .run(
            key,
            JSON.stringify({
              snapshot,
              labels: Object.fromEntries(presets.map(([id]) => [id, id])),
            })
          ).changes === 1
      );
    },
    mutate(
      expectedRevision: string,
      change: (
        snapshot: RoleSnapshot<AdministrationAction>
      ) => RoleSnapshot<AdministrationAction>,
      labels?: Record<string, string>
    ): AccessSnapshot {
      const current = state();
      if (current.snapshot.revision !== expectedRevision) {
        throw new AdministrationError("CONFLICT");
      }
      if (
        !commit(
          expectedRevision,
          change(current.snapshot),
          labels ? { ...current.labels, ...labels } : undefined
        )
      ) {
        throw new AdministrationError("CONFLICT");
      }
      return read();
    },
  };
}
export type ConsoleAdministrationStore = ReturnType<
  typeof createConsoleAdministrationStore
>;
