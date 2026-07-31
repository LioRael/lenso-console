/* eslint-disable func-style */

import type { ManagedServiceReference } from "./core-client.js";
import type { CoreDocument } from "./core-contracts.js";

export type ManagedServiceEnrollmentState = "active" | "revoked";
export type ManagedServiceConnectionState =
  | "never_observed"
  | "ready"
  | "unavailable"
  | "incompatible";

export interface ManagedServiceRegistration {
  serviceId: string;
  servicePrincipal: string;
  baseUrl: string;
  enrollmentReceiptDigest: string;
  enrollmentGrantRevision: number;
  authorizationEpoch: number;
  enrollmentExpiresAtUnixMs: number;
}

export interface ManagedServiceRegistryRecord extends ManagedServiceRegistration {
  enrollmentState: ManagedServiceEnrollmentState;
  coreDocument?: CoreDocument;
  coreObservedAt?: string;
  connectionState: ManagedServiceConnectionState;
  lastErrorCode?: string;
  version: number;
}

export interface ManagedServiceRegistryStore {
  get(serviceId: string): Promise<ManagedServiceRegistryRecord | undefined>;
  insert(
    registration: ManagedServiceRegistration
  ): Promise<ManagedServiceRegistryRecord>;
  recordCore(
    expectedVersion: number,
    serviceId: string,
    document: CoreDocument,
    observedAt: string,
    state: "ready" | "incompatible",
    errorCode?: string
  ): Promise<ManagedServiceRegistryRecord>;
  recordFailure(
    expectedVersion: number,
    serviceId: string,
    state: "unavailable" | "incompatible",
    errorCode: string
  ): Promise<ManagedServiceRegistryRecord>;
}

export class ManagedServiceRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ManagedServiceRegistryError";
    this.code = code;
  }
}

export class ManagedServiceRegistry {
  readonly #store: ManagedServiceRegistryStore;
  readonly #consoleServiceId: string;
  readonly #consoleServicePrincipal: string;
  readonly #now: () => number;

  constructor(options: {
    store: ManagedServiceRegistryStore;
    consoleServiceId: string;
    consoleServicePrincipal: string;
    now?: () => number;
  }) {
    this.#store = options.store;
    this.#consoleServiceId = options.consoleServiceId;
    this.#consoleServicePrincipal = options.consoleServicePrincipal;
    this.#now = options.now ?? Date.now;
  }

  async register(
    registration: ManagedServiceRegistration
  ): Promise<ManagedServiceRegistryRecord> {
    validateRegistration(registration);
    if (
      registration.serviceId === this.#consoleServiceId ||
      registration.servicePrincipal === this.#consoleServicePrincipal
    ) {
      throw new ManagedServiceRegistryError(
        "console_service_self_registration",
        "The Console Service cannot register itself as a managed Service"
      );
    }
    if (registration.enrollmentExpiresAtUnixMs <= this.#now()) {
      throw new ManagedServiceRegistryError(
        "managed_service_enrollment_expired",
        "The enrollment grant is already expired"
      );
    }
    return this.#store.insert({
      ...registration,
      baseUrl: normalizeBaseUrl(registration.baseUrl),
    });
  }

  async active(serviceId: string): Promise<ManagedServiceRegistryRecord> {
    const record = await this.#store.get(serviceId);
    if (record === undefined) {
      throw new ManagedServiceRegistryError(
        "managed_service_not_registered",
        `Managed Service ${serviceId} is not registered`
      );
    }
    if (record.enrollmentState !== "active") {
      throw new ManagedServiceRegistryError(
        "managed_service_enrollment_revoked",
        `Managed Service ${serviceId} has no active enrollment`
      );
    }
    if (record.enrollmentExpiresAtUnixMs <= this.#now()) {
      throw new ManagedServiceRegistryError(
        "managed_service_enrollment_expired",
        `Managed Service ${serviceId} enrollment has expired`
      );
    }
    return record;
  }

  reference(record: ManagedServiceRegistryRecord): ManagedServiceReference {
    return {
      baseUrl: record.baseUrl,
      serviceId: record.serviceId,
      servicePrincipal: record.servicePrincipal,
    };
  }

  recordCore(
    record: ManagedServiceRegistryRecord,
    document: CoreDocument,
    state: "ready" | "incompatible",
    errorCode?: string
  ): Promise<ManagedServiceRegistryRecord> {
    return this.#store.recordCore(
      record.version,
      record.serviceId,
      document,
      new Date(this.#now()).toISOString(),
      state,
      errorCode
    );
  }

  recordFailure(
    record: ManagedServiceRegistryRecord,
    state: "unavailable" | "incompatible",
    errorCode: string
  ): Promise<ManagedServiceRegistryRecord> {
    return this.#store.recordFailure(
      record.version,
      record.serviceId,
      state,
      errorCode
    );
  }
}

function validateRegistration(registration: ManagedServiceRegistration): void {
  if (
    registration.serviceId.length === 0 ||
    registration.servicePrincipal.length === 0
  ) {
    throw new ManagedServiceRegistryError(
      "managed_service_identity_invalid",
      "Managed Service identity must not be empty"
    );
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(registration.enrollmentReceiptDigest)) {
    throw new ManagedServiceRegistryError(
      "managed_service_enrollment_receipt_invalid",
      "Enrollment receipt digest must be a SHA-256 digest"
    );
  }
  if (
    !Number.isSafeInteger(registration.enrollmentGrantRevision) ||
    registration.enrollmentGrantRevision < 1 ||
    !Number.isSafeInteger(registration.authorizationEpoch) ||
    registration.authorizationEpoch < 0 ||
    !Number.isSafeInteger(registration.enrollmentExpiresAtUnixMs) ||
    registration.enrollmentExpiresAtUnixMs < 1
  ) {
    throw new ManagedServiceRegistryError(
      "managed_service_enrollment_invalid",
      "Enrollment revisions, epoch, and expiry must be valid integers"
    );
  }
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new ManagedServiceRegistryError(
      "managed_service_base_url_invalid",
      `Managed Service base URL is invalid: ${String(error)}`
    );
  }
  if (url.protocol !== "https:" && !isLoopback(url)) {
    throw new ManagedServiceRegistryError(
      "managed_service_base_url_insecure",
      "Managed Service base URL requires HTTPS outside loopback development"
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new ManagedServiceRegistryError(
      "managed_service_base_url_invalid",
      "Managed Service base URL must not contain credentials"
    );
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url.toString();
}

function isLoopback(url: URL): boolean {
  return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}
