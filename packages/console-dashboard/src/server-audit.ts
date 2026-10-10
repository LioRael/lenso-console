import type { AuditService, AuditScope } from "@lenso/audit";

import type { DashboardSnapshot, DashboardStore } from "./contract";
import {
  createAuthorizedDashboardStore,
  DashboardConflictError,
  DashboardForbiddenError,
  DashboardMutationCollisionError,
  type DashboardAuthorization,
  type DashboardConfigDefinition,
  type DashboardRepository,
} from "./server";
import { canonicalJson, validateDocument } from "./validation";

/** Keeps the published branded receipt intact; there is no Auth runtime import. */
export type DashboardAuditPort<P> = Pick<
  AuditService<P>,
  "get" | "prepare" | "complete"
>;
type SaveInput = Parameters<DashboardStore["save"]>[0];

export class DashboardAuditOutcomeUnknownError extends Error {
  readonly code = "outcome-unknown";
  readonly intentId: string;
  constructor(intentId: string) {
    super(
      "Dashboard effect or audit outcome is unknown; reconcile before retrying"
    );
    this.intentId = intentId;
    this.name = "DashboardAuditOutcomeUnknownError";
  }
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function eventId(value: string): Promise<string> {
  const hex = await digest(value);
  // RFC 9562 version 8 UUID, with an application-defined SHA-256 namespace.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Reads the committed mutation, never invokes save, and projects it under the
 * current read/write/widget policies. The repository retains retry records.
 */
export function createDashboardMutationReplayReader<Context>(options: {
  context: Context;
  authorization: DashboardAuthorization<Context>;
  repository: DashboardRepository;
  definitions: readonly DashboardConfigDefinition[];
}): (input: SaveInput) => Promise<DashboardSnapshot | null> {
  return async (input) => {
    const request = structuredClone(input);
    let found = false;
    const fingerprint = canonicalJson({
      expectedRevision: request.expectedRevision,
      document: request.document,
    });
    const { authorization } = options;
    const store = createAuthorizedDashboardStore({
      ...options,
      authorization: {
        resolveScope: (context) => authorization.resolveScope(context),
        revision: (context, scope) => authorization.revision(context, scope),
        canWrite: (context, scope) => authorization.canWrite(context, scope),
        canUseWidget: (context, scope, ref) =>
          authorization.canUseWidget(context, scope, ref),
        async canRead(context, scope) {
          return (
            (await authorization.canRead(context, scope)) &&
            (await authorization.canWrite(context, scope))
          );
        },
      },
      repository: {
        transaction: (scope, run) =>
          options.repository.transaction(
            scope,
            async (tx) => {
              const previous = tx.mutation(request.mutationId);
              if (!previous) {
                return run(tx);
              }
              if (previous.fingerprint !== fingerprint) {
                throw new DashboardMutationCollisionError();
              }
              found = true;
              return run({
                read: () => structuredClone(previous.snapshot),
                mutation: (id) => tx.mutation(id),
                commit: () => {
                  throw new Error("Replay is read-only");
                },
              });
            },
            { mutationId: request.mutationId }
          ),
      },
    });
    const snapshot = await store.read();
    return found ? snapshot : null;
  };
}

export function createAuditedDashboardStore<P>(options: {
  store: DashboardStore;
  audit: DashboardAuditPort<P>;
  principal: P;
  /** Fixed server-owned audit selection, never browser actor/tenant input. */
  scope: AuditScope;
  targetId: string;
  replay: (input: SaveInput) => Promise<DashboardSnapshot | null>;
  clock?: () => number;
}): DashboardStore {
  const scope = Object.freeze({ ...options.scope });
  const { store, audit, principal, targetId, replay } = options;
  const clock = options.clock ?? Date.now;
  return {
    read: (readOptions) => store.read(readOptions),
    async save(input, saveOptions) {
      saveOptions?.signal?.throwIfAborted();
      const request = structuredClone(input);
      validateDocument(request.document);
      if (
        typeof request.mutationId !== "string" ||
        !request.mutationId ||
        request.mutationId.length > 128 ||
        typeof request.expectedRevision !== "string" ||
        !request.expectedRevision ||
        request.expectedRevision.length > 1024
      ) {
        throw new Error("Invalid dashboard mutation");
      }
      const namespace = canonicalJson({
        scope,
        targetId,
        mutationId: request.mutationId,
      });
      const intentId = await eventId(`dashboard-intent:${namespace}`);
      const outcomeId = await eventId(`dashboard-outcome:${namespace}`);
      const fingerprint = await digest(
        canonicalJson({
          expectedRevision: request.expectedRevision,
          document: request.document,
        })
      );
      const target = { type: "dashboard", id: targetId };
      const previous = await audit.get({ scope, id: intentId }, principal);
      const makeIntent = (occurredAt: number) => ({
        id: intentId,
        occurredAt,
        scope,
        action: "dashboard.save",
        target,
        // sameEvent binds this commitment without recording request JSON.
        correlationId: fingerprint,
        result: "intent" as const,
        reasonCode: "requested",
        summary: {
          instanceCount: request.document.instances.length,
          placementCount: request.document.placements.length,
        },
      });
      const intent = makeIntent(previous?.occurredAt ?? clock());
      let prepared;
      try {
        prepared = await audit.prepare(intent, principal);
      } catch (error) {
        // A concurrent first attempt may win with a different timestamp.
        // Reuse only its time; prepare still checks actor and full content.
        if ((error as { code?: unknown })?.code !== "duplicate-conflict") {
          throw error;
        }
        const original = await audit.get({ scope, id: intentId }, principal);
        if (!original || original.occurredAt === intent.occurredAt) {
          throw error;
        }
        prepared = await audit.prepare(
          makeIntent(original.occurredAt),
          principal
        );
      }
      if (prepared.status === "already-recorded") {
        const outcome = await audit.get({ scope, id: outcomeId }, principal);
        if (
          outcome?.relation?.eventId !== intentId ||
          outcome.target.id !== target.id ||
          outcome.correlationId !== fingerprint ||
          outcome.action !== "dashboard.save"
        ) {
          throw new DashboardAuditOutcomeUnknownError(intentId);
        }
        if (outcome.result === "denied") {
          throw new DashboardForbiddenError();
        }
        if (
          outcome.result === "failure" &&
          outcome.reasonCode === "revision-conflict"
        ) {
          throw new DashboardConflictError();
        }
        if (
          outcome.result === "failure" &&
          outcome.reasonCode === "mutation-collision"
        ) {
          throw new DashboardMutationCollisionError();
        }
        if (outcome.result !== "success") {
          throw new DashboardAuditOutcomeUnknownError(intentId);
        }
        const snapshot = await replay(request);
        if (!snapshot) {
          throw new DashboardAuditOutcomeUnknownError(intentId);
        }
        return snapshot;
      }
      let snapshot: DashboardSnapshot;
      try {
        snapshot = await store.save(request, saveOptions);
      } catch (error) {
        const denied = error instanceof DashboardForbiddenError;
        const conflict = error instanceof DashboardConflictError;
        const collision = error instanceof DashboardMutationCollisionError;
        const known = denied || conflict || collision;
        try {
          await audit.complete(prepared.receipt, {
            id: outcomeId,
            occurredAt: clock(),
            result: denied ? "denied" : known ? "failure" : "unknown",
            reasonCode: denied
              ? "forbidden"
              : conflict
                ? "revision-conflict"
                : collision
                  ? "mutation-collision"
                  : "effect-unknown",
          });
        } catch {
          throw new DashboardAuditOutcomeUnknownError(intentId);
        }
        if (!known) {
          throw new DashboardAuditOutcomeUnknownError(intentId);
        }
        throw error;
      }
      try {
        await audit.complete(prepared.receipt, {
          id: outcomeId,
          occurredAt: clock(),
          result: "success",
          reasonCode: "saved",
        });
      } catch {
        throw new DashboardAuditOutcomeUnknownError(intentId);
      }
      return snapshot;
    },
  };
}
