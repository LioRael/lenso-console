/** Explicit initialization only; applications own production migration approval. */
export const dashboardSqliteSchemaSql = [
  `CREATE TABLE IF NOT EXISTS lenso_dashboard_documents (
    scope_key TEXT PRIMARY KEY NOT NULL,
    revision TEXT NOT NULL,
    document_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS lenso_dashboard_mutations (
    scope_key TEXT NOT NULL,
    mutation_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    revision TEXT NOT NULL,
    document_json TEXT NOT NULL,
    dispatch_token TEXT NOT NULL,
    PRIMARY KEY (scope_key, mutation_id)
  )`,
] as const;

export const dashboardPostgresSchemaSql = dashboardSqliteSchemaSql;
