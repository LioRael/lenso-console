import type { DashboardDocument, DashboardSnapshot } from "../contract";
import {
  DashboardConflictError,
  DashboardMutationCollisionError,
  type DashboardRepository,
  type DashboardTransaction,
} from "../server";
import {
  canonicalJson,
  dashboardLimits,
  validateDocument,
} from "../validation";

export type TransactionOptions = {
  mutationId?: string;
  signal?: AbortSignal;
  beforeCommit?: () => Promise<void>;
};
export type Mutation = { fingerprint: string; snapshot: DashboardSnapshot };
export type StoredRow = { revision: string; document_json: string };
export type MutationRow = StoredRow & { fingerprint: string };
export type Write = Parameters<DashboardTransaction["commit"]>[0] & {
  snapshot: DashboardSnapshot;
};

export function decode(row: StoredRow): DashboardSnapshot {
  if (!/^(0|[1-9][0-9]*)$/.test(row.revision) || row.revision.length > 1024) {
    throw new Error("Invalid stored dashboard revision");
  }
  if (
    new TextEncoder().encode(row.document_json).length > dashboardLimits.bytes
  ) {
    throw new Error("Stored dashboard is too large");
  }
  const document = JSON.parse(row.document_json) as DashboardDocument;
  validateDocument(document);
  return { revision: row.revision, document };
}

function validateId(id: string) {
  if (typeof id !== "string" || !id || id.length > 128) {
    throw new Error("Invalid mutation ID");
  }
}

export function decodeMutation(
  row: MutationRow | undefined
): Mutation | undefined {
  if (!row) {
    return undefined;
  }
  validateFingerprint(row.fingerprint);
  return { fingerprint: row.fingerprint, snapshot: decode(row) };
}

function validateFingerprint(value: string) {
  if (
    typeof value !== "string" ||
    !value ||
    new TextEncoder().encode(value).length > dashboardLimits.bytes * 2
  ) {
    throw new Error("Invalid dashboard mutation fingerprint");
  }
}

export function verifyWrite(write: Write, previous: Mutation | undefined) {
  if (!previous) {
    throw new DashboardConflictError();
  }
  if (previous.fingerprint !== write.fingerprint) {
    throw new DashboardMutationCollisionError();
  }
  // A concurrent same-ID request can only acknowledge the snapshot the callback
  // already projected. Otherwise the caller must retry and project the winner.
  if (canonicalJson(previous.snapshot) !== canonicalJson(write.snapshot)) {
    throw new DashboardConflictError();
  }
}

export function durableRepository(
  defaults: DashboardDocument,
  load: (
    scope: string,
    mutationId?: string
  ) => Promise<{
    snapshot: DashboardSnapshot | undefined;
    mutation: Mutation | undefined;
  }>,
  persist: (
    scope: string,
    write: Write,
    options: TransactionOptions
  ) => Promise<void>
): DashboardRepository {
  validateDocument(defaults);
  const seed = structuredClone(defaults);
  return {
    async transaction<T>(
      scope: string,
      run: (tx: DashboardTransaction) => Promise<T>,
      options: TransactionOptions = {}
    ): Promise<T> {
      if (typeof scope !== "string" || !scope || scope.length > 8192) {
        throw new Error("Invalid trusted dashboard scope key");
      }
      if (options.mutationId !== undefined) {
        validateId(options.mutationId);
      }
      options.signal?.throwIfAborted();
      const loaded = await load(scope, options.mutationId);
      const current = loaded.snapshot ?? {
        revision: "0",
        document: structuredClone(seed),
      };
      let staged: Write | undefined;
      let active = true;
      const checkActive = () => {
        if (!active) {
          throw new Error("Dashboard transaction callback has finished");
        }
      };
      try {
        const result = await run({
          read() {
            checkActive();
            return structuredClone(staged?.snapshot ?? current);
          },
          mutation(id) {
            checkActive();
            if (id !== options.mutationId) {
              throw new Error(
                "Durable mutation lookup requires the transaction mutationId hint"
              );
            }
            return loaded.mutation
              ? structuredClone(loaded.mutation)
              : undefined;
          },
          commit(input) {
            checkActive();
            if (staged) {
              throw new Error(
                "Only one dashboard commit is allowed per transaction"
              );
            }
            validateId(input.mutationId);
            if (input.mutationId !== options.mutationId) {
              throw new Error(
                "Dashboard commit requires the transaction mutationId hint"
              );
            }
            validateFingerprint(input.fingerprint);
            validateDocument(input.document);
            if (loaded.mutation) {
              if (loaded.mutation.fingerprint !== input.fingerprint) {
                throw new DashboardMutationCollisionError();
              }
              return structuredClone(loaded.mutation.snapshot);
            }
            if (current.revision !== input.expectedRevision) {
              throw new DashboardConflictError();
            }
            const snapshot = {
              revision: String(BigInt(current.revision) + 1n),
              document: structuredClone(input.document),
            };
            if (snapshot.revision.length > 1024) {
              throw new Error("Dashboard revision limit reached");
            }
            staged = structuredClone({ ...input, snapshot });
            return structuredClone(snapshot);
          },
        });
        active = false;
        if (staged) {
          await persist(scope, staged, options);
        } else {
          options.signal?.throwIfAborted();
        }
        return result;
      } finally {
        active = false;
      }
    },
  };
}

export async function beforeDispatch(options: TransactionOptions) {
  options.signal?.throwIfAborted();
  await options.beforeCommit?.();
  options.signal?.throwIfAborted();
}
