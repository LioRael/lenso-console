/* eslint-disable func-style, no-use-before-define */

import { SystemPlaneClientError, type ManagedServiceTarget } from "./client.js";
import type {
  RuntimeObservabilitySnapshot,
  RuntimeObservationEvidenceGap,
  RuntimeObservationFeed,
} from "./contracts.js";

export interface RuntimeObservationSource {
  snapshot(
    target: ManagedServiceTarget,
    deadlineUnixMs: number
  ): Promise<RuntimeObservabilitySnapshot>;
  changes(
    target: ManagedServiceTarget,
    cursor: string,
    limit: number,
    deadlineUnixMs: number
  ): Promise<RuntimeObservationFeed>;
}

export interface ManagedServiceTargetResolver {
  refresh(
    staleTarget: ManagedServiceTarget,
    deadlineUnixMs: number
  ): Promise<ManagedServiceTarget>;
}

export type RuntimeObservationFreshness = "current" | "stale" | "expired";
export type RuntimeObservationCollectionState = "ready" | "gap" | "unavailable";

export interface RuntimeObservationProjection {
  serviceId: string;
  serviceRevision: string;
  contractId: string;
  schemaDigest: string;
  snapshotRevision: string;
  cursor: string;
  observedAt: string;
  collectedAt: string;
  freshness: RuntimeObservationFreshness;
  collectionState: RuntimeObservationCollectionState;
  snapshot: RuntimeObservabilitySnapshot;
  lastEvidenceGap?: RuntimeObservationEvidenceGap;
  lastFailureCode?: string;
  version: number;
}

export interface ReplaceProjectionInput {
  target: ManagedServiceTarget;
  snapshot: RuntimeObservabilitySnapshot;
  collectedAt: string;
  freshness: RuntimeObservationFreshness;
  lastEvidenceGap?: RuntimeObservationEvidenceGap;
}

export interface RuntimeObservationProjectionStore {
  get(serviceId: string): Promise<RuntimeObservationProjection | undefined>;
  replace(
    expectedVersion: number | undefined,
    input: ReplaceProjectionInput
  ): Promise<RuntimeObservationProjection>;
  markChecked(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    freshness: RuntimeObservationFreshness,
    cursor: string
  ): Promise<RuntimeObservationProjection>;
  recordGap(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    gap: RuntimeObservationEvidenceGap
  ): Promise<RuntimeObservationProjection>;
  recordUnavailable(
    expectedVersion: number,
    serviceId: string,
    collectedAt: string,
    failureCode: string,
    freshness: RuntimeObservationFreshness
  ): Promise<RuntimeObservationProjection>;
}

export type RuntimeObservationReconcileOutcome =
  | { kind: "initialized"; projection: RuntimeObservationProjection }
  | { kind: "unchanged"; projection: RuntimeObservationProjection }
  | { kind: "refreshed"; projection: RuntimeObservationProjection }
  | {
      kind: "rebuilt_after_gap";
      gap: RuntimeObservationEvidenceGap;
      projection: RuntimeObservationProjection;
    }
  | {
      kind: "unavailable";
      error: SystemPlaneClientError;
      projection?: RuntimeObservationProjection;
    }
  | {
      kind: "coordinator_failed";
      error: Error;
    };

export interface RuntimeObservationReconcilerOptions {
  client: RuntimeObservationSource;
  targetResolver: ManagedServiceTargetResolver;
  store: RuntimeObservationProjectionStore;
  currentForMs: number;
  expiresAfterMs: number;
  requestTimeoutMs?: number;
  feedLimit?: number;
  now?: () => number;
}

export class RuntimeObservationReconciler {
  readonly #client: RuntimeObservationSource;
  readonly #store: RuntimeObservationProjectionStore;
  readonly #targetResolver: ManagedServiceTargetResolver;
  readonly #currentForMs: number;
  readonly #expiresAfterMs: number;
  readonly #requestTimeoutMs: number;
  readonly #feedLimit: number;
  readonly #now: () => number;

  constructor(options: RuntimeObservationReconcilerOptions) {
    if (
      options.currentForMs < 0 ||
      options.expiresAfterMs <= options.currentForMs
    ) {
      throw new Error("Freshness horizons must satisfy 0 <= current < expired");
    }
    this.#client = options.client;
    this.#store = options.store;
    this.#targetResolver = options.targetResolver;
    this.#currentForMs = options.currentForMs;
    this.#expiresAfterMs = options.expiresAfterMs;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 5000;
    this.#feedLimit = options.feedLimit ?? 100;
    this.#now = options.now ?? Date.now;
  }

  async reconcile(
    target: ManagedServiceTarget
  ): Promise<RuntimeObservationReconcileOutcome> {
    const existing = await this.#store.get(target.serviceId);
    let current = existing;
    try {
      if (
        existing === undefined ||
        existing.schemaDigest !== target.capability.schemaDigest
      ) {
        return {
          kind: "initialized",
          projection: await this.#replaceFromSnapshot(target, existing),
        };
      }
      const feed = await this.#client.changes(
        target,
        existing.cursor,
        this.#feedLimit,
        this.#deadline()
      );
      if (
        feed.continuity === "continuous" &&
        feed.serviceRevision !== existing.serviceRevision
      ) {
        throw new SystemPlaneClientError(
          "contract",
          "Continuous observation feed changed Service revision without an Evidence Gap"
        );
      }
      if (feed.continuity === "reset_required") {
        const gap = feed.evidenceGap;
        if (gap === undefined) {
          throw new SystemPlaneClientError(
            "contract",
            "Reset-required feed omitted Evidence Gap"
          );
        }
        const gapProjection = await this.#store.recordGap(
          existing.version,
          target.serviceId,
          new Date(this.#now()).toISOString(),
          gap
        );
        current = gapProjection;
        const refreshedTarget = await this.#targetResolver.refresh(
          target,
          this.#deadline()
        );
        if (refreshedTarget.serviceId !== target.serviceId) {
          throw new SystemPlaneClientError(
            "contract",
            "Core target refresh returned a different managed Service"
          );
        }
        return {
          kind: "rebuilt_after_gap",
          gap,
          projection: await this.#replaceFromSnapshot(
            refreshedTarget,
            gapProjection,
            gap
          ),
        };
      }
      if (feed.changes.length > 0 || feed.hasMore) {
        return {
          kind: "refreshed",
          projection: await this.#replaceFromSnapshot(target, existing),
        };
      }
      return {
        kind: "unchanged",
        projection: await this.#store.markChecked(
          existing.version,
          target.serviceId,
          new Date(this.#now()).toISOString(),
          freshness(
            existing.observedAt,
            this.#now(),
            this.#currentForMs,
            this.#expiresAfterMs
          ),
          feed.nextCursor
        ),
      };
    } catch (error) {
      if (!(error instanceof SystemPlaneClientError)) {
        throw error;
      }
      const clientError = error;
      if (current === undefined) {
        return { kind: "unavailable", error: clientError };
      }
      const projection = await this.#store.recordUnavailable(
        current.version,
        target.serviceId,
        new Date(this.#now()).toISOString(),
        failureCode(clientError),
        freshness(
          current.observedAt,
          this.#now(),
          this.#currentForMs,
          this.#expiresAfterMs
        )
      );
      return { kind: "unavailable", error: clientError, projection };
    }
  }

  async reconcileMany(
    targets: readonly ManagedServiceTarget[]
  ): Promise<Map<string, RuntimeObservationReconcileOutcome>> {
    const results = await Promise.all(
      targets.map(async (target) => {
        try {
          return [target.serviceId, await this.reconcile(target)] as const;
        } catch (error) {
          return [
            target.serviceId,
            {
              kind: "coordinator_failed",
              error:
                error instanceof Error
                  ? error
                  : new Error("Unknown coordinator failure"),
            } satisfies RuntimeObservationReconcileOutcome,
          ] as const;
        }
      })
    );
    return new Map(results);
  }

  async #replaceFromSnapshot(
    target: ManagedServiceTarget,
    existing: RuntimeObservationProjection | undefined,
    lastEvidenceGap?: RuntimeObservationEvidenceGap
  ): Promise<RuntimeObservationProjection> {
    const snapshot = await this.#client.snapshot(target, this.#deadline());
    return this.#store.replace(existing?.version, {
      target,
      snapshot,
      collectedAt: new Date(this.#now()).toISOString(),
      freshness: freshness(
        snapshot.observedAt,
        this.#now(),
        this.#currentForMs,
        this.#expiresAfterMs
      ),
      ...(lastEvidenceGap === undefined ? {} : { lastEvidenceGap }),
    });
  }

  #deadline(): number {
    return this.#now() + this.#requestTimeoutMs;
  }
}

export function freshness(
  observedAt: string,
  nowUnixMs: number,
  currentForMs: number,
  expiresAfterMs: number
): RuntimeObservationFreshness {
  const age = Math.max(0, nowUnixMs - Date.parse(observedAt));
  if (age <= currentForMs) {
    return "current";
  }
  return age <= expiresAfterMs ? "stale" : "expired";
}

function failureCode(error: SystemPlaneClientError): string {
  return error.serviceCode ?? `system_plane_${error.kind}`;
}
