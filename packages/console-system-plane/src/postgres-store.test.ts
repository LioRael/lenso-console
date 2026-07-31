import { describe, expect, it } from "vitest";

import { runtimeObservabilityProtocol } from "./contracts.js";
import {
  PostgresRuntimeObservationProjectionStore,
  ProjectionConcurrencyError,
} from "./postgres-store.js";
import type {
  PostgresPoolLike,
  PostgresQueryResult,
} from "./postgres-store.js";

const snapshot = {
  nextCursor: "cursor-1",
  observedAt: "2026-07-30T10:00:00Z",
  protocol: runtimeObservabilityProtocol,
  queues: [],
  schemaDigest: `sha256:${"b".repeat(64)}`,
  serviceId: "support",
  serviceRevision: "release:one",
  snapshotRevision: `sha256:${"a".repeat(64)}`,
  status: "healthy",
} as const;

const row = {
  collected_at: "2026-07-30T10:00:10Z",
  collection_state: "ready",
  contract_id: runtimeObservabilityProtocol,
  cursor: "cursor-1",
  freshness_state: "current",
  last_evidence_gap: null,
  last_failure_code: null,
  observed_at: snapshot.observedAt,
  schema_digest: snapshot.schemaDigest,
  service_id: "support",
  service_revision: "release:one",
  snapshot,
  snapshot_revision: snapshot.snapshotRevision,
  version: "1",
} as const;

describe("PostgresRuntimeObservationProjectionStore", () => {
  it("maps durable source identity, cursor, freshness, and snapshot", async () => {
    const pool = new FakePool([{ rowCount: 1, rows: [row] }]);
    const store = new PostgresRuntimeObservationProjectionStore(pool);

    await expect(store.get("support")).resolves.toMatchObject({
      collectionState: "ready",
      cursor: "cursor-1",
      freshness: "current",
      serviceId: "support",
      snapshot,
      version: 1,
    });
    expect(pool.queries[0]?.values).toEqual(["support"]);
  });

  it("advances an unchanged feed cursor with optimistic concurrency", async () => {
    const pool = new FakePool([
      { rowCount: 1, rows: [{ ...row, cursor: "cursor-2", version: "2" }] },
    ]);
    const store = new PostgresRuntimeObservationProjectionStore(pool);

    await expect(
      store.markChecked(
        1,
        "support",
        "2026-07-30T10:00:20Z",
        "current",
        "cursor-2"
      )
    ).resolves.toMatchObject({ cursor: "cursor-2", version: 2 });
    expect(pool.queries[0]?.text).toContain(
      "where service_id = $1 and version = $2"
    );
    expect(pool.queries[0]?.values?.slice(0, 5)).toEqual([
      "support",
      1,
      "2026-07-30T10:00:20Z",
      "cursor-2",
      "current",
    ]);
  });

  it("rejects a stale writer instead of overwriting a newer projection", async () => {
    const pool = new FakePool([{ rowCount: 0, rows: [] }]);
    const store = new PostgresRuntimeObservationProjectionStore(pool);

    await expect(
      store.markChecked(
        3,
        "support",
        "2026-07-30T10:00:20Z",
        "stale",
        "cursor-old"
      )
    ).rejects.toBeInstanceOf(ProjectionConcurrencyError);
  });
});

class FakePool implements PostgresPoolLike {
  readonly queries: { text: string; values?: readonly unknown[] }[] = [];
  readonly #results: PostgresQueryResult<unknown>[];

  constructor(results: PostgresQueryResult<unknown>[]) {
    this.#results = results;
  }

  async connect(): Promise<never> {
    throw new Error("connect is not used by this adapter");
  }

  query<Row>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>> {
    this.queries.push({ text, ...(values === undefined ? {} : { values }) });
    const result = this.#results.shift();
    if (result === undefined) {
      throw new Error("missing query result fixture");
    }
    return Promise.resolve(result as PostgresQueryResult<Row>);
  }
}
