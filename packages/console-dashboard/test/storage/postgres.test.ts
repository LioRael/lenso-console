import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SQL } from "bun";

import { DashboardCommitOutcomeUnknownError } from "../../src/server";
import {
  createPostgresDashboardRepository,
  initializePostgresDashboardSchema,
} from "../../src/storage/postgres";
import { durableContract, empty, save } from "./contract";

const available =
  spawnSync("initdb", ["--version"]).status === 0 &&
  spawnSync("pg_ctl", ["--version"]).status === 0;

if (process.env.LENSO_REQUIRE_POSTGRES === "1" && !available) {
  throw new Error("Required disposable PostgreSQL test binaries are missing");
}

test.skipIf(!available)(
  "PostgreSQL: owned disposable cluster, independent Bun SQL clients and atomic CAS",
  async () => {
    // macOS tmpdir paths can exceed PostgreSQL's Unix socket pathname limit.
    const directory = await mkdtemp(
      join(process.platform === "darwin" ? "/tmp" : tmpdir(), "dashboard-pg-")
    );
    const data = join(directory, "data");
    const socket = directory;
    const reservation = createServer();
    await new Promise<void>((resolve) =>
      reservation.listen(0, "127.0.0.1", resolve)
    );
    const address = reservation.address();
    if (!address || typeof address === "string") {
      throw new Error("Missing local port");
    }
    const { port } = address;
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve()))
    );
    function command(binary: string, args: string[]) {
      const result = spawnSync(binary, args, { encoding: "utf-8" });
      if (result.status !== 0) {
        const log = join(directory, "postgres.log");
        throw new Error(
          `${binary}: ${result.stdout}\n${result.stderr}\n${existsSync(log) ? readFileSync(log, "utf-8") : ""}`
        );
      }
    }
    let started = false;
    let first: SQL | undefined;
    let second: SQL | undefined;
    try {
      command("initdb", [
        "-D",
        data,
        "-A",
        "trust",
        "-U",
        "dashboard_test",
        "--no-locale",
        "-E",
        "utf-8",
      ]);
      // Owned local cluster only, on an allocated loopback port.
      command("pg_ctl", [
        "-D",
        data,
        "-l",
        join(directory, "postgres.log"),
        "-o",
        `-k ${socket} -p ${port} -c listen_addresses='127.0.0.1'`,
        "-w",
        "start",
      ]);
      started = true;
      const options = {
        adapter: "postgres" as const,
        hostname: "127.0.0.1",
        port,
        username: "dashboard_test",
        database: "postgres",
        password: "",
        tls: false,
        connectionTimeout: 3,
      };
      first = new SQL(options);
      second = new SQL(options);
      await initializePostgresDashboardSchema(first);
      const a = createPostgresDashboardRepository(first, empty);
      const b = createPostgresDashboardRepository(second, empty);
      await a.transaction("read-only", async (tx) => tx.read());
      const rows = await first.unsafe(
        "SELECT count(*)::integer AS n FROM lenso_dashboard_documents"
      );
      expect(rows[0].n).toBe(0);
      await durableContract(a, b);
      await first.unsafe(`CREATE FUNCTION reject_dashboard_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.scope_key = 'sql-rollback' THEN RAISE EXCEPTION 'mutation rejected'; END IF; RETURN NEW; END $$`);
      await first.unsafe(`CREATE TRIGGER reject_dashboard_mutation BEFORE INSERT ON lenso_dashboard_mutations
      FOR EACH ROW EXECUTE FUNCTION reject_dashboard_mutation()`);
      await expect(save(a, "sql-rollback", "attempt")).rejects.toThrow(
        "mutation rejected"
      );
      const rollbackRows = await second.unsafe(
        "SELECT count(*)::integer AS n FROM lenso_dashboard_documents WHERE scope_key = 'sql-rollback'"
      );
      expect(rollbackRows[0].n).toBe(0);
      await first.unsafe(
        "DROP TRIGGER reject_dashboard_mutation ON lenso_dashboard_mutations"
      );
      const rollbackRetry = await save(b, "sql-rollback", "attempt");
      expect(rollbackRetry.revision).toBe("1");

      const ownedClient = first;
      const lostResponse = createPostgresDashboardRepository(
        {
          async connect() {
            const reserved = await ownedClient.reserve();
            return {
              async query(sql: string, values: unknown[] = []) {
                const result = await reserved.unsafe(sql, values);
                if (sql === "COMMIT") {
                  throw new Error("Commit response lost after durable commit");
                }
                return { rows: Array.from(result), rowCount: result.count };
              },
              release() {
                reserved.release();
              },
            };
          },
        },
        empty
      );
      await expect(
        save(lostResponse, "ambiguous", "attempt")
      ).rejects.toBeInstanceOf(DashboardCommitOutcomeUnknownError);
      const ambiguousReplay = await save(b, "ambiguous", "attempt");
      expect(ambiguousReplay.revision).toBe("1");
    } finally {
      await first?.close({ timeout: 0 });
      await second?.close({ timeout: 0 });
      if (started) {
        command("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000
);
