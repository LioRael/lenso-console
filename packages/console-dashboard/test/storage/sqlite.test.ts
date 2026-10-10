import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSqliteDashboardRepository,
  initializeSqliteDashboardSchema,
} from "../../src/storage/sqlite";
import { durableContract, empty, save } from "./contract";

test("SQLite: two native connections, CAS, rollback, restart and explicit initialization", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-sqlite-"));
  const filename = join(directory, "dashboard.sqlite");
  const first = new Database(filename);
  const second = new Database(filename);
  try {
    initializeSqliteDashboardSchema(first);
    first.run("PRAGMA journal_mode = WAL");
    first.run("PRAGMA busy_timeout = 5000");
    second.run("PRAGMA busy_timeout = 5000");
    const a = createSqliteDashboardRepository(first, empty);
    const b = createSqliteDashboardRepository(second, empty);
    first.run("BEGIN");
    await expect(
      a.transaction("nested", async (tx) => tx.read())
    ).rejects.toThrow("cannot nest");
    expect(first.inTransaction).toBe(true);
    first.run("ROLLBACK");
    await a.transaction("read-only", async (tx) => tx.read());
    expect(
      first.query("SELECT count(*) AS n FROM lenso_dashboard_documents").get()
    ).toEqual({ n: 0 });
    await durableContract(a, b);
    first.run(`CREATE TRIGGER reject_dashboard_mutation BEFORE INSERT ON lenso_dashboard_mutations
      WHEN NEW.scope_key = 'sql-rollback' BEGIN SELECT RAISE(ABORT, 'mutation rejected'); END`);
    await expect(save(a, "sql-rollback", "attempt")).rejects.toThrow(
      "mutation rejected"
    );
    expect(
      first
        .query(
          "SELECT count(*) AS n FROM lenso_dashboard_documents WHERE scope_key = 'sql-rollback'"
        )
        .get()
    ).toEqual({ n: 0 });
    first.run("DROP TRIGGER reject_dashboard_mutation");
    const rollbackRetry = await save(b, "sql-rollback", "attempt");
    expect(rollbackRetry.revision).toBe("1");
    first
      .query("INSERT INTO lenso_dashboard_documents VALUES (?, ?, ?)")
      .run("corrupt", "1", JSON.stringify({ ...empty, schemaVersion: 2 }));
    await expect(
      a.transaction("corrupt", async (tx) => tx.read())
    ).rejects.toThrow("Invalid dashboard document");
    first
      .query("INSERT INTO lenso_dashboard_documents VALUES (?, ?, ?)")
      .run(
        "oversized",
        "1",
        JSON.stringify({ ...empty, extra: "x".repeat(256 * 1024) })
      );
    await expect(
      a.transaction("oversized", async (tx) => tx.read())
    ).rejects.toThrow("Stored dashboard is too large");
    const expected = await save(a, "restart", "stable");
    second.close();
    const restarted = new Database(filename);
    try {
      expect(
        await save(
          createSqliteDashboardRepository(restarted, empty),
          "restart",
          "stable"
        )
      ).toEqual(expected);
    } finally {
      restarted.close();
    }
  } finally {
    first.close();
    // Bun close is idempotent.
    second.close();
    await rm(directory, { recursive: true, force: true });
  }
});
