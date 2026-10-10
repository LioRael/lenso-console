import type { Database } from "bun:sqlite";

import type { DashboardDocument } from "../contract";
import { DashboardConflictError } from "../server";
import { dashboardSqliteSchemaSql } from "./schema";
import {
  beforeDispatch,
  decode,
  decodeMutation,
  durableRepository,
  verifyWrite,
  type StoredRow,
  type MutationRow,
} from "./shared";

export { dashboardSqliteSchemaSql } from "./schema";

export function initializeSqliteDashboardSchema(client: Database): void {
  if (client.inTransaction) {
    throw new Error(
      "Dashboard schema initialization cannot nest inside a transaction"
    );
  }
  client.transaction(() => {
    for (const sql of dashboardSqliteSchemaSql) {
      client.run(sql);
    }
  })();
}

/** Uses the same native client accepted by @lenso/db/bun-sqlite. */
export function createSqliteDashboardRepository(
  client: Database,
  defaults: DashboardDocument
) {
  const mutation = (scope: string, id: string) =>
    decodeMutation(
      client
        .query<MutationRow, [string, string]>(
          "SELECT revision, document_json, fingerprint FROM lenso_dashboard_mutations WHERE scope_key = ? AND mutation_id = ?"
        )
        .get(scope, id) ?? undefined
    );
  return durableRepository(
    defaults,
    async (scope, id) => {
      if (client.inTransaction) {
        throw new Error(
          "Dashboard repository cannot nest inside a transaction"
        );
      }
      const row = client
        .query<StoredRow, [string]>(
          "SELECT revision, document_json FROM lenso_dashboard_documents WHERE scope_key = ?"
        )
        .get(scope);
      return {
        snapshot: row ? decode(row) : undefined,
        mutation: id ? mutation(scope, id) : undefined,
      };
    },
    async (scope, write, options) => {
      await beforeDispatch(options);
      if (client.inTransaction) {
        throw new Error(
          "Dashboard repository cannot nest inside a transaction"
        );
      }
      client
        .transaction(() => {
          options.signal?.throwIfAborted();
          const previous = mutation(scope, write.mutationId);
          if (previous) {
            verifyWrite(write, previous);
            return;
          }
          const json = JSON.stringify(write.snapshot.document);
          const result =
            write.expectedRevision === "0"
              ? client
                  .query(`INSERT INTO lenso_dashboard_documents (scope_key, revision, document_json)
            VALUES (?, ?, ?) ON CONFLICT(scope_key) DO NOTHING`)
                  .run(scope, write.snapshot.revision, json)
              : client
                  .query(`UPDATE lenso_dashboard_documents SET revision = ?, document_json = ?
            WHERE scope_key = ? AND revision = ?`)
                  .run(
                    write.snapshot.revision,
                    json,
                    scope,
                    write.expectedRevision
                  );
          if (result.changes !== 1) {
            throw new DashboardConflictError();
          }
          client
            .query(`INSERT INTO lenso_dashboard_mutations
        (scope_key, mutation_id, fingerprint, revision, document_json, dispatch_token)
        VALUES (?, ?, ?, ?, ?, ?)`)
            .run(
              scope,
              write.mutationId,
              write.fingerprint,
              write.snapshot.revision,
              json,
              crypto.randomUUID()
            );
        })
        .immediate();
    }
  );
}
