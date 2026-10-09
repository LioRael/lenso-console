import type { Database, SQLQueryBindings } from "bun:sqlite";

import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "@lenso/tasks/d1";

// Executes real provider SQL with atomic local batches, not a D1 network emulator.
export function sqliteD1(db: Database): D1Database {
  class Statement implements D1PreparedStatement {
    readonly query: string;
    readonly values: SQLQueryBindings[];
    constructor(query: string, values: SQLQueryBindings[] = []) {
      this.query = query;
      this.values = values;
    }
    bind(...values: unknown[]) {
      return new Statement(
        this.query,
        values.map((value) => {
          if (value instanceof ArrayBuffer) {
            return new Uint8Array(value);
          }
          if (
            value === null ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "bigint" ||
            typeof value === "boolean" ||
            value instanceof Uint8Array
          ) {
            return value;
          }
          throw new TypeError("Unsupported SQLite binding");
        })
      );
    }
    execute<T>(): D1Result<T> {
      return {
        success: true,
        results: db.query(this.query).all(...this.values) as T[],
      };
    }
    async all<T>() {
      return this.execute<T>();
    }
    async run() {
      return this.execute();
    }
    async raw() {
      return db.query(this.query).values(...this.values);
    }
  }
  return {
    prepare: (query) => new Statement(query),
    async batch<T>(statements: D1PreparedStatement[]) {
      return db.transaction(() =>
        statements.map((statement) => (statement as Statement).execute<T>())
      )();
    },
    withSession() {
      throw new Error("Fixture does not implement D1 sessions");
    },
  };
}
