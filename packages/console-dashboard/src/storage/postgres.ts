import type { SQL } from "bun";

import type { DashboardDocument } from "../contract";
import {
  DashboardCommitOutcomeUnknownError,
  DashboardConflictError,
} from "../server";
import { dashboardPostgresSchemaSql } from "./schema";
import {
  beforeDispatch,
  decode,
  decodeMutation,
  durableRepository,
  verifyWrite,
  type StoredRow,
  type MutationRow,
} from "./shared";

export { dashboardPostgresSchemaSql } from "./schema";

/** Structural pg Pool contract; connections and cleanup belong to the application. */
export interface DashboardPostgresConnection {
  query(
    sql: string,
    values?: unknown[]
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release(): void;
}
export interface DashboardPostgresPool {
  connect(): Promise<DashboardPostgresConnection>;
}

function postgresPool(
  client: DashboardPostgresPool | SQL
): DashboardPostgresPool {
  if (!("reserve" in client)) {
    return client;
  }
  if (client.options.adapter !== "postgres") {
    throw new Error(
      "Dashboard PostgreSQL storage requires a PostgreSQL client"
    );
  }
  return {
    async connect() {
      const reserved = await client.reserve();
      return {
        async query(sql, values = []) {
          const rows = await reserved.unsafe(sql, values);
          return { rows: Array.from(rows), rowCount: rows.count };
        },
        release() {
          reserved.release();
        },
      };
    },
  };
}

export async function initializePostgresDashboardSchema(
  client: DashboardPostgresPool | SQL
) {
  const pool = postgresPool(client);
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    for (const sql of dashboardPostgresSchemaSql) {
      await connection.query(sql);
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

async function mutation(
  connection: DashboardPostgresConnection,
  scope: string,
  id: string
) {
  const { rows } = await connection.query(
    "SELECT revision, document_json, fingerprint FROM lenso_dashboard_mutations WHERE scope_key = $1 AND mutation_id = $2",
    [scope, id]
  );
  return decodeMutation(rows[0] as MutationRow | undefined);
}

export function createPostgresDashboardRepository(
  client: DashboardPostgresPool | SQL,
  defaults: DashboardDocument
) {
  const pool = postgresPool(client);
  return durableRepository(
    defaults,
    async (scope, id) => {
      const connection = await pool.connect();
      try {
        const { rows } = await connection.query(
          "SELECT revision, document_json FROM lenso_dashboard_documents WHERE scope_key = $1",
          [scope]
        );
        return {
          snapshot: rows[0] ? decode(rows[0] as StoredRow) : undefined,
          mutation: id ? await mutation(connection, scope, id) : undefined,
        };
      } finally {
        connection.release();
      }
    },
    async (scope, write, options) => {
      const connection = await pool.connect();
      let commitDispatched = false;
      let wrote = false;
      try {
        await connection.query("BEGIN");
        // Transaction-scoped database lock also covers the absent first document.
        // Hash collisions only serialize unrelated scopes; they cannot mix data.
        await connection.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [scope]
        );
        const previous = await mutation(connection, scope, write.mutationId);
        if (previous) {
          verifyWrite(write, previous);
        } else {
          options.signal?.throwIfAborted();
          const json = JSON.stringify(write.snapshot.document);
          const result =
            write.expectedRevision === "0"
              ? await connection.query(
                  `INSERT INTO lenso_dashboard_documents (scope_key, revision, document_json)
              VALUES ($1, $2, $3) ON CONFLICT(scope_key) DO NOTHING`,
                  [scope, write.snapshot.revision, json]
                )
              : await connection.query(
                  `UPDATE lenso_dashboard_documents SET revision = $1, document_json = $2
              WHERE scope_key = $3 AND revision = $4`,
                  [write.snapshot.revision, json, scope, write.expectedRevision]
                );
          if (result.rowCount !== 1) {
            throw new DashboardConflictError();
          }
          wrote = true;
          await connection.query(
            `INSERT INTO lenso_dashboard_mutations
          (scope_key, mutation_id, fingerprint, revision, document_json, dispatch_token)
          VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              scope,
              write.mutationId,
              write.fingerprint,
              write.snapshot.revision,
              json,
              crypto.randomUUID(),
            ]
          );
        }
        await beforeDispatch(options);
        commitDispatched = true;
        await connection.query("COMMIT");
      } catch (error) {
        try {
          await connection.query("ROLLBACK");
        } catch (rollbackError) {
          if (wrote || commitDispatched) {
            throw new DashboardCommitOutcomeUnknownError({
              cause: rollbackError,
            });
          }
        }
        // A successful ROLLBACK after a lost COMMIT response cannot prove whether
        // the earlier COMMIT succeeded. Replay by mutation ID resolves it.
        if (commitDispatched && wrote) {
          throw new DashboardCommitOutcomeUnknownError({ cause: error });
        }
        throw error;
      } finally {
        connection.release();
      }
    }
  );
}
