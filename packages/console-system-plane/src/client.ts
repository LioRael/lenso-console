/* eslint-disable func-style, no-use-before-define */

import {
  parseRuntimeObservabilitySnapshot,
  parseRuntimeObservationFeed,
  runtimeObservabilityFeatures,
  runtimeObservabilityProtocol,
  type RuntimeObservabilitySnapshot,
  type RuntimeObservationFeed,
} from "./contracts.js";
import {
  SystemPlaneClientError,
  SystemPlaneJsonTransport,
  type SystemPlaneCredentialProvider,
} from "./transport.js";

export { SystemPlaneClientError } from "./transport.js";
export type {
  SystemPlaneClientErrorKind,
  SystemPlaneCredentialProvider,
  SystemPlaneCredentialRequest,
} from "./transport.js";

export interface RuntimeObservabilityCapability {
  contractId: typeof runtimeObservabilityProtocol;
  schemaDigest: string;
  endpoint: string;
  featureIds: readonly string[];
}

export interface ManagedServiceTarget {
  serviceId: string;
  servicePrincipal: string;
  serviceRevision: string;
  baseUrl: string;
  capability: RuntimeObservabilityCapability;
}

export class RuntimeObservabilityClient {
  readonly #transport: SystemPlaneJsonTransport;

  constructor(options: {
    credentials: SystemPlaneCredentialProvider;
    fetch?: typeof fetch;
    now?: () => number;
  }) {
    this.#transport = new SystemPlaneJsonTransport(options);
  }

  async snapshot(
    target: ManagedServiceTarget,
    deadlineUnixMs: number
  ): Promise<RuntimeObservabilitySnapshot> {
    this.#validateTarget(target, runtimeObservabilityFeatures.queueSummary);
    const value = await this.#transport.get({
      baseUrl: target.baseUrl,
      contractId: target.capability.contractId,
      deadlineUnixMs,
      featureId: runtimeObservabilityFeatures.queueSummary,
      path: target.capability.endpoint,
      servicePrincipal: target.servicePrincipal,
    });
    let snapshot: RuntimeObservabilitySnapshot;
    try {
      snapshot = parseRuntimeObservabilitySnapshot(value);
    } catch (error) {
      throw new SystemPlaneClientError(
        "contract",
        "Managed Service returned an invalid Runtime Observability snapshot",
        { cause: error }
      );
    }
    this.#validateSnapshotSource(target, snapshot);
    return snapshot;
  }

  async changes(
    target: ManagedServiceTarget,
    cursor: string,
    limit: number,
    deadlineUnixMs: number
  ): Promise<RuntimeObservationFeed> {
    this.#validateTarget(target, runtimeObservabilityFeatures.recoveryFeed);
    if (cursor.length === 0) {
      throw new SystemPlaneClientError(
        "configuration",
        "Runtime observation recovery requires a snapshot cursor"
      );
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new SystemPlaneClientError(
        "configuration",
        "Runtime observation feed limit must be between 1 and 500"
      );
    }
    const query = new URLSearchParams({ cursor, limit: String(limit) });
    const value = await this.#transport.get({
      baseUrl: target.baseUrl,
      contractId: target.capability.contractId,
      deadlineUnixMs,
      featureId: runtimeObservabilityFeatures.recoveryFeed,
      path: `${target.capability.endpoint}/changes?${query.toString()}`,
      servicePrincipal: target.servicePrincipal,
    });
    let feed: RuntimeObservationFeed;
    try {
      feed = parseRuntimeObservationFeed(value);
    } catch (error) {
      throw new SystemPlaneClientError(
        "contract",
        "Managed Service returned an invalid Runtime Observation feed",
        { cause: error }
      );
    }
    this.#validateFeedSource(target, feed);
    return feed;
  }

  #validateTarget(target: ManagedServiceTarget, featureId: string): void {
    if (target.capability.contractId !== runtimeObservabilityProtocol) {
      throw new SystemPlaneClientError(
        "configuration",
        "Managed Service did not negotiate Runtime Observability v1"
      );
    }
    if (!target.capability.featureIds.includes(featureId)) {
      throw new SystemPlaneClientError(
        "configuration",
        `Managed Service did not negotiate feature ${featureId}`
      );
    }
    if (!target.capability.endpoint.startsWith("/system-plane/v1/")) {
      throw new SystemPlaneClientError(
        "configuration",
        "Runtime Observability endpoint is outside the System Plane namespace"
      );
    }
    if (
      target.serviceId.length === 0 ||
      target.servicePrincipal.length === 0 ||
      target.serviceRevision.length === 0
    ) {
      throw new SystemPlaneClientError(
        "configuration",
        "Managed Service identity is incomplete"
      );
    }
  }

  #validateSnapshotSource(
    target: ManagedServiceTarget,
    snapshot: RuntimeObservabilitySnapshot
  ): void {
    if (snapshot.serviceId !== target.serviceId) {
      throw new SystemPlaneClientError(
        "contract",
        "Runtime observation source Service does not match the registry target"
      );
    }
    if (snapshot.serviceRevision !== target.serviceRevision) {
      throw new SystemPlaneClientError(
        "contract",
        "Runtime observation Service revision does not match Core discovery"
      );
    }
    if (snapshot.schemaDigest !== target.capability.schemaDigest) {
      throw new SystemPlaneClientError(
        "contract",
        "Runtime observation schema digest does not match negotiated Core discovery"
      );
    }
  }

  #validateFeedSource(
    target: ManagedServiceTarget,
    feed: RuntimeObservationFeed
  ): void {
    if (feed.serviceId !== target.serviceId) {
      throw new SystemPlaneClientError(
        "contract",
        "Runtime observation source Service does not match the registry target"
      );
    }
    const gapReason = feed.evidenceGap?.reason;
    if (
      feed.serviceRevision !== target.serviceRevision &&
      gapReason !== "service_revision_changed"
    ) {
      throw new SystemPlaneClientError(
        "contract",
        "Runtime observation feed changed Service revision without the matching Evidence Gap"
      );
    }
    if (
      feed.schemaDigest !== target.capability.schemaDigest &&
      gapReason !== "schema_changed"
    ) {
      throw new SystemPlaneClientError(
        "contract",
        "Runtime observation feed changed schema without the matching Evidence Gap"
      );
    }
  }
}
