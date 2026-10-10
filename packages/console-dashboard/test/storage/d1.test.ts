import { expect, test } from "bun:test";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import { DashboardCommitOutcomeUnknownError } from "../../src/server";
import {
  createD1DashboardRepository,
  initializeD1DashboardSchema,
} from "../../src/storage/d1";
import { durableContract, empty, save } from "./contract";

test("D1: real local workerd batch, conditional CAS, collision and rollback", async () => {
  const fixture = new Miniflare({
    ...convertV4MiniflareOptions({
      modules: true,
      script:
        "export default { fetch() { return new Response('dashboard storage test'); } };",
      compatibilityDate: "2026-10-06",
      d1Databases: { DB: crypto.randomUUID() },
      d1Persist: false,
    }),
    host: "127.0.0.1",
    port: 0,
    telemetry: { enabled: false },
  });
  try {
    const binding = await fixture.getD1Database("DB");
    await initializeD1DashboardSchema(binding);
    const first = createD1DashboardRepository(binding, empty);
    const second = createD1DashboardRepository(
      await fixture.getD1Database("DB"),
      empty
    );
    await first.transaction("read-only", async (tx) => tx.read());
    expect(
      await binding
        .prepare("SELECT count(*) AS n FROM lenso_dashboard_documents")
        .first("n")
    ).toBe(0);
    await durableContract(first, second);
    await binding
      .prepare(`CREATE TRIGGER reject_dashboard_document BEFORE INSERT ON lenso_dashboard_documents
      WHEN NEW.scope_key = 'sql-rollback' BEGIN SELECT RAISE(ABORT, 'document rejected'); END`)
      .run();
    await expect(save(first, "sql-rollback", "attempt")).rejects.toBeInstanceOf(
      DashboardCommitOutcomeUnknownError
    );
    expect(
      await binding
        .prepare(
          "SELECT count(*) AS n FROM lenso_dashboard_mutations WHERE scope_key = 'sql-rollback'"
        )
        .first("n")
    ).toBe(0);
    await binding.prepare("DROP TRIGGER reject_dashboard_document").run();
    const rollbackRetry = await save(second, "sql-rollback", "attempt");
    expect(rollbackRetry.revision).toBe("1");

    const lostResponse = createD1DashboardRepository(
      {
        prepare: (sql) => binding.prepare(sql),
        async batch(statements) {
          await binding.batch(
            statements as Parameters<typeof binding.batch>[0]
          );
          throw new Error("Batch response lost after durable commit");
        },
      },
      empty
    );
    await expect(
      save(lostResponse, "ambiguous", "attempt")
    ).rejects.toBeInstanceOf(DashboardCommitOutcomeUnknownError);
    const ambiguousReplay = await save(second, "ambiguous", "attempt");
    expect(ambiguousReplay.revision).toBe("1");
  } finally {
    await fixture.dispose();
  }
}, 30_000);
