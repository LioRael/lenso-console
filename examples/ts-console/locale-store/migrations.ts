import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const migrationsFolder = fileURLToPath(new URL("migrations/", import.meta.url));
const options = { migrationsFolder };

function canonicalDefinition(sql: string) {
  return sql.replaceAll(/'(?:''|[^'])*'|IF\s+NOT\s+EXISTS|[\s";]/g, (token) =>
    token.startsWith("'") ? token : ""
  );
}

export function assertLocaleSchema(db: Database, allowEmpty = false) {
  const tables = db
    .query<{ name: string; sql: string }, []>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('console_locale_schema', 'console_locale_default', 'console_locale_preferences')"
    )
    .all();
  if (tables.length === 0 && allowEmpty) {
    return;
  }
  if (!tables.some(({ name }) => name === "console_locale_schema")) {
    throw new Error("Local Console locale schema requires explicit migration");
  }
  const versions = db
    .query<{ version: number }, []>("SELECT version FROM console_locale_schema")
    .all();
  if (versions.length !== 1 || versions[0]?.version !== 1) {
    throw new Error("Unsupported local Console locale schema");
  }
  // The immutable v1 SQL is also the adoption contract for the handwritten store.
  const definitions =
    readMigrationFiles(options)[0]?.sql.filter((statement) =>
      statement.trim().startsWith("CREATE TABLE")
    ) ?? [];
  if (
    tables.length !== definitions.length ||
    definitions.some(
      (definition) =>
        !tables.some(
          (table) =>
            canonicalDefinition(table.sql) === canonicalDefinition(definition)
        )
    )
  ) {
    throw new Error("Unsupported local Console locale schema definition");
  }
}

export function assertMigrationHistory(db: Database, allowPending = false) {
  const exists = db
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"
    )
    .get();
  if (!exists) {
    return;
  }
  const records = db
    .query<{ hash: string; created_at: number }, []>(
      "SELECT hash, created_at FROM __drizzle_migrations ORDER BY id"
    )
    .all();
  const history = readMigrationFiles(options);
  if (
    (!allowPending && records.length !== history.length) ||
    records.some(
      (record, index) =>
        record.hash !== history[index]?.hash ||
        record.created_at !== history[index]?.folderMillis
    )
  ) {
    throw new Error("Unsupported local Console locale migration history");
  }
}

/** Explicit local/test operation; the host never invokes migrations at startup. */
export async function migrateLocalLocaleStore(databasePath: string) {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath, { create: true, strict: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    assertLocaleSchema(db, true);
    assertMigrationHistory(db, true);
    migrate(drizzle(db), options);
    assertLocaleSchema(db);
  } finally {
    db.close();
  }
}
