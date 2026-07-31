/* eslint-disable func-style, no-use-before-define */

import {
  parseRuntimeObservabilitySnapshot,
  type RuntimeObservationEvidenceGap,
} from "./contracts.js";
import type {
  ReplaceProjectionInput,
  RuntimeObservationFreshness,
  RuntimeObservationProjection,
  RuntimeObservationProjectionStore,
} from "./projection.js";

export interface PostgresQueryResult<Row> {
  rows: Row[];
  rowCount: number | null;
}

export interface PostgresClientLike {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>>;
  release(): void;
}

export interface PostgresPoolLike {
  connect(): Promise<PostgresClientLike>;
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>>;
}

export class ProjectionConcurrencyError extends Error {
  readonly code = "runtime_observation_projection_concurrent_change";

  constructor(serviceId: string) {
    super(
      `Runtime observation projection changed concurrently for ${serviceId}`
    );
    this.name = "ProjectionConcurrencyError";
  }
}

interface ProjectionRow {
  service_id: string;
  service_revision: string;
  contract_id: string;
  schema_digest: string;
  snapshot_revision: string;
  cursor: string;
  observed_at: Date | string;
  collected_at: Date | string;
  freshness_state: "current" | "stale" | "expired";
  collection_state: "ready" | "gap" | "unavailable";
  snapshot: unknown;
  last_evidence_gap: RuntimeObservationEvidenceGap | null;
  last_failure_code: string | null;
  version: string | number;
}

const columns = `
  service_id, service_revision, contract_id, schema_digest, snapshot_revision,
  cursor, observed_at, collected_at, freshness_state, collection_state,
  snapshot, last_evidence_gap, last_failure_code, version
`;

export class PostgresRuntimeObservationProjectionStore implements RuntimeObservationProjectionStore {
  readonly #pool: PostgresPoolLike;

  constructor(pool: PostgresPoolLike) {
    this.#pool = pool;
  }

  async get(
    serviceId: string
  ): Promise<RuntimeObservationProjection | undefined> {
    const result = await this.#pool.query<ProjectionRow>(
      `select ${columns} from console.runtime_observation_projections where service_id = $1`,
      [serviceId]
    );
    return result.rows[0] === undefined
      ? undefined
      : projection(result.rows[0]);
  }

  async replace(
    expectedVersion: number | undefined,
    input: ReplaceProjectionInput
  ): Promise<RuntimeObservationProjection> {
    const values = [
      input.target.serviceId,
      input.snapshot.serviceRevision,
      input.target.capability.contractId,
      input.snapshot.schemaDigest,
      input.snapshot.snapshotRevision,
      input.snapshot.nextCursor,
      input.snapshot.observedAt,
      input.collectedAt,
      input.freshness,
      JSON.stringify(input.snapshot),
      input.lastEvidenceGap === undefined
        ? null
        : JSON.stringify(input.lastEvidenceGap),
    ];
    const result =
      expectedVersion === undefined
        ? await this.#pool.query<ProjectionRow>(
            `
            insert into console.runtime_observation_projections (
              service_id, service_revision, contract_id, schema_digest,
              snapshot_revision, cursor, observed_at, collected_at,
              freshness_state, collection_state, snapshot, last_evidence_gap
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ready',$10::jsonb,$11::jsonb)
            on conflict (service_id) do nothing
            returning ${columns}
            `,
            values
          )
        : await this.#pool.query<ProjectionRow>(
            `
            update console.runtime_observation_projections set
              service_revision = $2,
              contract_id = $3,
              schema_digest = $4,
              snapshot_revision = $5,
              cursor = $6,
              observed_at = $7,
              collected_at = $8,
              freshness_state = $9,
              collection_state = 'ready',
              snapshot = $10::jsonb,
              last_evidence_gap = coalesce($11::jsonb, last_evidence_gap),
              last_failure_code = null,
              version = version + 1,
              updated_at = now()
            where service_id = $1 and version = $12
            returning ${columns}
            `,
            [...values, expectedVersion]
          );
    return one(result, input.target.serviceId);
  }

  async markChecked(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    freshness: RuntimeObservationFreshness,
    cursor: string
  ): Promise<RuntimeObservationProjection> {
    return this.#updateState(expectedVersion, serviceId, {
      collectedAt,
      cursor,
      freshness,
      collectionState: "ready",
      gap: null,
      failureCode: null,
    });
  }

  async recordGap(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    gap: RuntimeObservationEvidenceGap
  ): Promise<RuntimeObservationProjection> {
    return this.#updateState(expectedVersion, serviceId, {
      collectedAt,
      collectionState: "gap",
      gap,
      failureCode: null,
    });
  }

  async recordUnavailable(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    failureCode: string,
    freshness: RuntimeObservationFreshness
  ): Promise<RuntimeObservationProjection> {
    return this.#updateState(expectedVersion, serviceId, {
      collectedAt,
      freshness,
      collectionState: "unavailable",
      failureCode,
    });
  }

  async #updateState(
    expectedVersion: number,
    serviceId: string,
    update: {
      collectedAt: string;
      cursor?: string;
      freshness?: RuntimeObservationFreshness;
      collectionState: "ready" | "gap" | "unavailable";
      gap?: RuntimeObservationEvidenceGap | null;
      failureCode?: string | null;
    }
  ): Promise<RuntimeObservationProjection> {
    const result = await this.#pool.query<ProjectionRow>(
      `
      update console.runtime_observation_projections set
        collected_at = $3,
        cursor = coalesce($4, cursor),
        freshness_state = coalesce($5, freshness_state),
        collection_state = $6,
        last_evidence_gap = case when $7::jsonb is null then last_evidence_gap else $7::jsonb end,
        last_failure_code = $8,
        version = version + 1,
        updated_at = now()
      where service_id = $1 and version = $2
      returning ${columns}
      `,
      [
        serviceId,
        expectedVersion,
        update.collectedAt,
        update.cursor ?? null,
        update.freshness ?? null,
        update.collectionState,
        update.gap === undefined || update.gap === null
          ? null
          : JSON.stringify(update.gap),
        update.failureCode ?? null,
      ]
    );
    return one(result, serviceId);
  }
}

function one(
  result: PostgresQueryResult<ProjectionRow>,
  serviceId: string
): RuntimeObservationProjection {
  const [row] = result.rows;
  if (row === undefined) {
    throw new ProjectionConcurrencyError(serviceId);
  }
  return projection(row);
}

function projection(row: ProjectionRow): RuntimeObservationProjection {
  const lastEvidenceGap = row.last_evidence_gap ?? undefined;
  const lastFailureCode = row.last_failure_code ?? undefined;
  return {
    serviceId: row.service_id,
    serviceRevision: row.service_revision,
    contractId: row.contract_id,
    schemaDigest: row.schema_digest,
    snapshotRevision: row.snapshot_revision,
    cursor: row.cursor,
    observedAt: timestamp(row.observed_at),
    collectedAt: timestamp(row.collected_at),
    freshness: row.freshness_state,
    collectionState: row.collection_state,
    snapshot: parseRuntimeObservabilitySnapshot(row.snapshot),
    ...(lastEvidenceGap === undefined ? {} : { lastEvidenceGap }),
    ...(lastFailureCode === undefined ? {} : { lastFailureCode }),
    version: integer(row.version, "version"),
  };
}

function timestamp(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function integer(value: number | string, field: string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Stored projection ${field} is invalid`);
  }
  return parsed;
}
