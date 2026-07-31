/* eslint-disable func-style */

import { parseCoreDocument, type CoreDocument } from "./core-contracts.js";
import type { PostgresPoolLike } from "./postgres-store.js";
import type {
  ManagedServiceConnectionState,
  ManagedServiceEnrollmentState,
  ManagedServiceRegistration,
  ManagedServiceRegistryRecord,
  ManagedServiceRegistryStore,
} from "./registry.js";

export class ManagedServiceRegistryConcurrencyError extends Error {
  readonly code = "managed_service_registry_concurrent_change";

  constructor(serviceId: string) {
    super(`Managed Service registry changed concurrently for ${serviceId}`);
    this.name = "ManagedServiceRegistryConcurrencyError";
  }
}

interface ManagedServiceRow {
  service_id: string;
  service_principal: string;
  base_url: string;
  enrollment_receipt_digest: string;
  enrollment_grant_revision: string | number;
  authorization_epoch: string | number;
  enrollment_expires_at_unix_ms: string | number;
  enrollment_state: ManagedServiceEnrollmentState;
  core_document: unknown | null;
  core_observed_at: Date | string | null;
  connection_state: ManagedServiceConnectionState;
  last_error_code: string | null;
  version: string | number;
}

const columns = `
  service_id, service_principal, base_url, enrollment_receipt_digest,
  enrollment_grant_revision, authorization_epoch, enrollment_expires_at_unix_ms,
  enrollment_state, core_document, core_observed_at, connection_state,
  last_error_code, version
`;

export class PostgresManagedServiceRegistryStore implements ManagedServiceRegistryStore {
  readonly #pool: PostgresPoolLike;

  constructor(pool: PostgresPoolLike) {
    this.#pool = pool;
  }

  async get(
    serviceId: string
  ): Promise<ManagedServiceRegistryRecord | undefined> {
    const result = await this.#pool.query<ManagedServiceRow>(
      `select ${columns} from console.managed_services where service_id = $1`,
      [serviceId]
    );
    return result.rows[0] === undefined ? undefined : record(result.rows[0]);
  }

  async insert(
    registration: ManagedServiceRegistration
  ): Promise<ManagedServiceRegistryRecord> {
    const result = await this.#pool.query<ManagedServiceRow>(
      `insert into console.managed_services (
        service_id, service_principal, base_url, enrollment_receipt_digest,
        enrollment_grant_revision, authorization_epoch, enrollment_expires_at_unix_ms,
        enrollment_state, connection_state
      ) values ($1, $2, $3, $4, $5, $6, $7, 'active', 'never_observed')
      returning ${columns}`,
      [
        registration.serviceId,
        registration.servicePrincipal,
        registration.baseUrl,
        registration.enrollmentReceiptDigest,
        registration.enrollmentGrantRevision,
        registration.authorizationEpoch,
        registration.enrollmentExpiresAtUnixMs,
      ]
    );
    return requireRow(result.rows[0], registration.serviceId);
  }

  async recordCore(
    expectedVersion: number,
    serviceId: string,
    document: CoreDocument,
    observedAt: string,
    state: "ready" | "incompatible",
    errorCode?: string
  ): Promise<ManagedServiceRegistryRecord> {
    const result = await this.#pool.query<ManagedServiceRow>(
      `update console.managed_services
       set core_document = $3, core_observed_at = $4, connection_state = $5,
           last_error_code = $6, version = version + 1, updated_at = now()
       where service_id = $1 and version = $2
       returning ${columns}`,
      [
        serviceId,
        expectedVersion,
        document,
        observedAt,
        state,
        errorCode ?? null,
      ]
    );
    return requireRow(result.rows[0], serviceId);
  }

  async recordFailure(
    expectedVersion: number,
    serviceId: string,
    state: "unavailable" | "incompatible",
    errorCode: string
  ): Promise<ManagedServiceRegistryRecord> {
    const result = await this.#pool.query<ManagedServiceRow>(
      `update console.managed_services
       set connection_state = $3, last_error_code = $4,
           version = version + 1, updated_at = now()
       where service_id = $1 and version = $2
       returning ${columns}`,
      [serviceId, expectedVersion, state, errorCode]
    );
    return requireRow(result.rows[0], serviceId);
  }
}

function requireRow(
  row: ManagedServiceRow | undefined,
  serviceId: string
): ManagedServiceRegistryRecord {
  if (row === undefined) {
    throw new ManagedServiceRegistryConcurrencyError(serviceId);
  }
  return record(row);
}

function record(row: ManagedServiceRow): ManagedServiceRegistryRecord {
  const coreDocument =
    row.core_document === null
      ? undefined
      : parseCoreDocument(row.core_document);
  return {
    authorizationEpoch: integer(row.authorization_epoch, "authorization_epoch"),
    baseUrl: row.base_url,
    connectionState: row.connection_state,
    ...(coreDocument === undefined ? {} : { coreDocument }),
    ...(row.core_observed_at === null
      ? {}
      : { coreObservedAt: new Date(row.core_observed_at).toISOString() }),
    enrollmentExpiresAtUnixMs: integer(
      row.enrollment_expires_at_unix_ms,
      "enrollment_expires_at_unix_ms"
    ),
    enrollmentGrantRevision: integer(
      row.enrollment_grant_revision,
      "enrollment_grant_revision"
    ),
    enrollmentReceiptDigest: row.enrollment_receipt_digest,
    enrollmentState: row.enrollment_state,
    ...(row.last_error_code === null
      ? {}
      : { lastErrorCode: row.last_error_code }),
    serviceId: row.service_id,
    servicePrincipal: row.service_principal,
    version: integer(row.version, "version"),
  };
}

function integer(value: string | number, column: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError(
      `Managed Service registry ${column} is not a safe integer`
    );
  }
  return parsed;
}
