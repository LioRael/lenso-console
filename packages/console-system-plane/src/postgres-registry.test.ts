import { describe, expect, it } from "vitest";

import {
  ManagedServiceRegistryConcurrencyError,
  PostgresManagedServiceRegistryStore,
} from "./postgres-registry.js";
import type {
  PostgresPoolLike,
  PostgresQueryResult,
} from "./postgres-store.js";

const row = {
  authorization_epoch: "3",
  base_url: "https://support.internal/",
  connection_state: "never_observed",
  core_document: null,
  core_observed_at: null,
  enrollment_expires_at_unix_ms: "1900000060000",
  enrollment_grant_revision: "2",
  enrollment_receipt_digest: `sha256:${"a".repeat(64)}`,
  enrollment_state: "active",
  last_error_code: null,
  service_id: "support",
  service_principal: "service:support",
  version: "1",
} as const;

describe("PostgresManagedServiceRegistryStore", () => {
  it("maps enrollment identity and connection state", async () => {
    const pool = new FakePool([{ rowCount: 1, rows: [row] }]);
    const store = new PostgresManagedServiceRegistryStore(pool);

    await expect(store.get("support")).resolves.toMatchObject({
      authorizationEpoch: 3,
      connectionState: "never_observed",
      enrollmentGrantRevision: 2,
      serviceId: "support",
      version: 1,
    });
  });

  it("uses the expected version when recording discovery failure", async () => {
    const pool = new FakePool([
      {
        rowCount: 1,
        rows: [
          {
            ...row,
            connection_state: "unavailable",
            last_error_code: "system_plane_transport",
            version: "2",
          },
        ],
      },
    ]);
    const store = new PostgresManagedServiceRegistryStore(pool);

    await store.recordFailure(
      1,
      "support",
      "unavailable",
      "system_plane_transport"
    );
    expect(pool.queries[0]?.values).toEqual([
      "support",
      1,
      "unavailable",
      "system_plane_transport",
    ]);
  });

  it("rejects a stale writer instead of overwriting registry state", async () => {
    const pool = new FakePool([{ rowCount: 0, rows: [] }]);
    const store = new PostgresManagedServiceRegistryStore(pool);

    await expect(
      store.recordFailure(3, "support", "unavailable", "offline")
    ).rejects.toBeInstanceOf(ManagedServiceRegistryConcurrencyError);
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
