import type { DashboardDocument } from "../contract";
import { DashboardCommitOutcomeUnknownError } from "../server";
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

export { dashboardSqliteSchemaSql as dashboardD1SchemaSql } from "./schema";

export interface DashboardD1Statement {
  bind(...values: unknown[]): DashboardD1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface DashboardD1Database {
  prepare(sql: string): DashboardD1Statement;
  batch(statements: DashboardD1Statement[]): Promise<unknown[]>;
}

export async function initializeD1DashboardSchema(
  binding: DashboardD1Database
) {
  await binding.batch(
    dashboardSqliteSchemaSql.map((sql) => binding.prepare(sql))
  );
}

export function createD1DashboardRepository(
  binding: DashboardD1Database,
  defaults: DashboardDocument
) {
  async function mutation(scope: string, id: string) {
    return decodeMutation(
      (await binding
        .prepare(
          "SELECT revision, document_json, fingerprint FROM lenso_dashboard_mutations WHERE scope_key = ? AND mutation_id = ?"
        )
        .bind(scope, id)
        .first<MutationRow>()) ?? undefined
    );
  }
  return durableRepository(
    defaults,
    async (scope, id) => {
      const row = await binding
        .prepare(
          "SELECT revision, document_json FROM lenso_dashboard_documents WHERE scope_key = ?"
        )
        .bind(scope)
        .first<StoredRow>();
      return {
        snapshot: row ? decode(row) : undefined,
        mutation: id ? await mutation(scope, id) : undefined,
      };
    },
    async (scope, write, options) => {
      const token = crypto.randomUUID();
      const json = JSON.stringify(write.snapshot.document);
      // D1 batch is the transaction boundary. Admission is conditional on CAS;
      // subsequent document writes are gated on this dispatch's unique token.
      const admit = binding
        .prepare(`INSERT INTO lenso_dashboard_mutations
      (scope_key, mutation_id, fingerprint, revision, document_json, dispatch_token)
      SELECT ?, ?, ?, ?, ?, ? WHERE
        (? = '0' AND NOT EXISTS (SELECT 1 FROM lenso_dashboard_documents WHERE scope_key = ?))
        OR EXISTS (SELECT 1 FROM lenso_dashboard_documents WHERE scope_key = ? AND revision = ?)
      ON CONFLICT(scope_key, mutation_id) DO NOTHING`)
        .bind(
          scope,
          write.mutationId,
          write.fingerprint,
          write.snapshot.revision,
          json,
          token,
          write.expectedRevision,
          scope,
          scope,
          write.expectedRevision
        );
      const update = binding
        .prepare(`INSERT INTO lenso_dashboard_documents (scope_key, revision, document_json)
      SELECT scope_key, revision, document_json FROM lenso_dashboard_mutations
      WHERE scope_key = ? AND mutation_id = ? AND dispatch_token = ?
      ON CONFLICT(scope_key) DO UPDATE SET revision = excluded.revision, document_json = excluded.document_json`)
        .bind(scope, write.mutationId, token);
      await beforeDispatch(options);
      try {
        await binding.batch([admit, update]);
      } catch (error) {
        throw new DashboardCommitOutcomeUnknownError({ cause: error });
      }
      // Never infer success from batch completion: zero-row CAS is not an SQL error.
      let previous;
      try {
        previous = await mutation(scope, write.mutationId);
      } catch (error) {
        throw new DashboardCommitOutcomeUnknownError({ cause: error });
      }
      verifyWrite(write, previous);
    }
  );
}
