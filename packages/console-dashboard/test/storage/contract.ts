import { expect } from "bun:test";

import type { DashboardDocument, DashboardSnapshot } from "../../src/contract";
import {
  DashboardConflictError,
  DashboardMutationCollisionError,
  type DashboardRepository,
} from "../../src/server";
import { canonicalJson } from "../../src/validation";

export const empty: DashboardDocument = {
  schemaVersion: 1,
  instances: [],
  placements: [],
};

export function save(
  repository: DashboardRepository,
  scope: string,
  id: string,
  expected = "0",
  document = empty
) {
  return repository.transaction(
    scope,
    async (tx) => {
      const fingerprint = canonicalJson({
        expectedRevision: expected,
        document,
      });
      const previous = tx.mutation(id);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new DashboardMutationCollisionError();
        }
        return previous.snapshot;
      }
      return tx.commit({
        expectedRevision: expected,
        mutationId: id,
        fingerprint,
        document,
      });
    },
    { mutationId: id }
  );
}

// Existing memory tests cannot catch cross-connection CAS or durable rollback.
// Each backend runs this proof using two independent clients to the same database.
export async function durableContract(
  first: DashboardRepository,
  second: DashboardRepository
) {
  const scope = crypto.randomUUID();
  expect(await first.transaction(scope, async (tx) => tx.read())).toEqual({
    revision: "0",
    document: empty,
  });
  const firstSave = await save(first, scope, "one");
  expect(firstSave.revision).toBe("1");
  expect(await save(second, scope, "one")).toEqual({
    revision: "1",
    document: empty,
  });
  await expect(save(second, scope, "one", "1")).rejects.toBeInstanceOf(
    DashboardMutationCollisionError
  );
  await expect(save(second, scope, "stale")).rejects.toBeInstanceOf(
    DashboardConflictError
  );
  const otherScopeSave = await save(second, `${scope}-other`, "one");
  expect(otherScopeSave.revision).toBe("1");

  const rollbackId = "rollback";
  await expect(
    first.transaction(
      scope,
      async (tx) => {
        tx.commit({
          expectedRevision: "1",
          mutationId: rollbackId,
          fingerprint: "rollback",
          document: empty,
        });
        await Promise.resolve();
        throw new Error("Projection denied after staging");
      },
      { mutationId: rollbackId }
    )
  ).rejects.toThrow("Projection denied");
  const afterRollback = await second.transaction(scope, async (tx) =>
    tx.read()
  );
  expect(afterRollback.revision).toBe("1");
  const rollbackRetry = await save(second, scope, rollbackId, "1");
  expect(rollbackRetry.revision).toBe("2");

  await expect(
    first.transaction(
      scope,
      async (tx) =>
        tx.commit({
          expectedRevision: "2",
          mutationId: "revoked",
          fingerprint: "revoked",
          document: empty,
        }),
      {
        mutationId: "revoked",
        beforeCommit: async () => {
          throw new Error("Authorization revoked");
        },
      }
    )
  ).rejects.toThrow("Authorization revoked");
  const afterRevocation = await second.transaction(scope, async (tx) =>
    tx.read()
  );
  expect(afterRevocation.revision).toBe("2");

  const controller = new AbortController();
  await expect(
    first.transaction(
      scope,
      async (tx) =>
        tx.commit({
          expectedRevision: "2",
          mutationId: "aborted",
          fingerprint: "aborted",
          document: empty,
        }),
      {
        mutationId: "aborted",
        signal: controller.signal,
        beforeCommit: async () => controller.abort(),
      }
    )
  ).rejects.toThrow();
  const afterAbort = await second.transaction(scope, async (tx) => tx.read());
  expect(afterAbort.revision).toBe("2");

  const raceScope = `${scope}-race`;
  let waiting = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  function contender(repository: DashboardRepository, id: string) {
    return repository.transaction(
      raceScope,
      async (tx) => {
        const { revision } = tx.read();
        waiting += 1;
        if (waiting === 2) {
          release();
        }
        await ready;
        return tx.commit({
          expectedRevision: revision,
          mutationId: id,
          fingerprint: id,
          document: empty,
        });
      },
      { mutationId: id }
    );
  }
  const results = await Promise.allSettled([
    contender(first, "a"),
    contender(second, "b"),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled")
  ).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(
    DashboardConflictError
  );
  const afterRace = await second.transaction(raceScope, async (tx) =>
    tx.read()
  );
  expect(afterRace.revision).toBe("1");

  const collisionScope = `${scope}-collision`;
  waiting = 0;
  let releaseCollision!: () => void;
  const collisionReady = new Promise<void>((resolve) => {
    releaseCollision = resolve;
  });
  function colliding(repository: DashboardRepository, fingerprint: string) {
    return repository.transaction(
      collisionScope,
      async (tx) => {
        waiting += 1;
        if (waiting === 2) {
          releaseCollision();
        }
        await collisionReady;
        return tx.commit({
          expectedRevision: "0",
          mutationId: "same-id",
          fingerprint,
          document: empty,
        });
      },
      { mutationId: "same-id" }
    );
  }
  const collision = await Promise.allSettled([
    colliding(first, "a"),
    colliding(second, "b"),
  ]);
  expect(
    collision.filter((result) => result.status === "fulfilled")
  ).toHaveLength(1);
  const collisionRejected = collision.find(
    (result) => result.status === "rejected"
  );
  expect(
    collisionRejected?.status === "rejected" && collisionRejected.reason
  ).toBeInstanceOf(DashboardMutationCollisionError);

  await expect(
    first.transaction(scope, async (tx) => tx.mutation("not-hinted"), {
      mutationId: "hint",
    })
  ).rejects.toThrow("requires");
  await expect(
    first.transaction(
      scope,
      async (tx) =>
        tx.commit({
          expectedRevision: "2",
          mutationId: "not-hinted",
          fingerprint: "x",
          document: empty,
        }),
      { mutationId: "hint" }
    )
  ).rejects.toThrow("requires");

  // A driver error after successful dispatch is ambiguous, not permission to
  // write twice. Repeating the same scope/ID resolves the durable outcome.
  const saved = await save(first, scope, "lost-response", "2");
  expect(await save(second, scope, "lost-response", "2")).toEqual(saved);

  const mutable = structuredClone(empty);
  let snapshot!: DashboardSnapshot;
  await first.transaction(
    scope,
    async (tx) => {
      snapshot = tx.commit({
        expectedRevision: "3",
        mutationId: "immutable",
        fingerprint: "immutable",
        document: mutable,
      });
      mutable.schemaVersion = 9 as 1;
      snapshot.document.schemaVersion = 8 as 1;
    },
    { mutationId: "immutable" }
  );
  const immutableSnapshot = await second.transaction(scope, async (tx) =>
    tx.read()
  );
  expect(immutableSnapshot.document).toEqual(empty);
  await expect(
    first.transaction(
      scope,
      async (tx) =>
        tx.commit({
          expectedRevision: "4",
          mutationId: "invalid",
          fingerprint: "invalid",
          document: mutable,
        }),
      { mutationId: "invalid" }
    )
  ).rejects.toThrow("Invalid dashboard document");
  const originalReplay = await save(second, scope, "one");
  expect(originalReplay.revision).toBe("1");
}
