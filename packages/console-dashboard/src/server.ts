import type {
  DashboardDocument,
  DashboardSnapshot,
  DashboardStore,
} from "./contract";
import {
  canonicalJson,
  definitionKey,
  definitionMap,
  validateDocument,
  type DashboardConfigDefinition,
} from "./validation";

export type {
  DashboardConfigDefinition,
  DashboardConfigSchema,
} from "./validation";

type DashboardScopeBase = {
  applicationId: string;
  dashboardId: string;
  targetId?: string;
  tenantId?: string;
};
export type DashboardScope = DashboardScopeBase &
  (
    | { kind: "personal"; realmId: string; ownerSubject: string }
    | { kind: "organization"; organizationId: string }
  );

export function dashboardScopeKey(scope: DashboardScope): string {
  const owner =
    scope.kind === "personal" ? scope.ownerSubject : scope.organizationId;
  const dimensions = [
    scope.applicationId,
    scope.dashboardId,
    owner,
    ...(scope.kind === "personal" ? [scope.realmId] : []),
    ...(scope.targetId === undefined ? [] : [scope.targetId]),
    ...(scope.tenantId === undefined ? [] : [scope.tenantId]),
  ];
  if (
    !dimensions.every(
      (part) =>
        typeof part === "string" && part.length > 0 && part.length <= 512
    )
  ) {
    throw new Error("Invalid trusted dashboard scope");
  }
  return JSON.stringify([
    scope.applicationId,
    scope.dashboardId,
    scope.kind,
    scope.targetId ?? null,
    scope.tenantId ?? null,
    scope.kind === "personal" ? scope.realmId : null,
    owner,
  ]);
}

export class DashboardConflictError extends Error {
  constructor() {
    super("Dashboard changed. Reload explicitly to replace your draft.");
    this.name = "DashboardConflictError";
  }
}
export class DashboardMutationCollisionError extends Error {
  constructor() {
    super("Mutation ID was already used for different content");
    this.name = "DashboardMutationCollisionError";
  }
}
export class DashboardForbiddenError extends Error {
  constructor() {
    super("Dashboard access denied");
    this.name = "DashboardForbiddenError";
  }
}

export class DashboardCommitOutcomeUnknownError extends Error {
  readonly code = "commit-outcome-unknown";
  constructor(options?: ErrorOptions) {
    super(
      "Dashboard commit outcome is unknown. Inspect the saved revision before retrying.",
      options
    );
    this.name = "DashboardCommitOutcomeUnknownError";
  }
}

export interface DashboardTransactionOptions {
  mutationId?: string;
  signal?: AbortSignal;
  beforeCommit?: () => Promise<void>;
}

export interface DashboardTransaction {
  read(): DashboardSnapshot;
  mutation(
    id: string
  ): { fingerprint: string; snapshot: DashboardSnapshot } | undefined;
  /** Stages one CAS mutation; transaction persists it only after callback success. */
  commit(input: {
    expectedRevision: string;
    mutationId: string;
    fingerprint: string;
    document: DashboardDocument;
  }): DashboardSnapshot;
}

/**
 * The application supplies a transaction isolated by trusted scope. Durable
 * implementations finalize after callback and beforeCommit success, enforcing
 * CAS and unique (scope, mutationId) atomically. Durable mutation lookup needs
 * the matching options.mutationId hint, not an unbounded history preload.
 */
export interface DashboardRepository {
  transaction<T>(
    scopeKey: string,
    run: (transaction: DashboardTransaction) => Promise<T>,
    options?: DashboardTransactionOptions
  ): Promise<T>;
}

export interface DashboardAuthorization<Context> {
  resolveScope(context: Context): DashboardScope | Promise<DashboardScope>;
  /** Covers identity and all permission facts; never a persistent storage key. */
  revision(context: Context, scope: DashboardScope): string | Promise<string>;
  canRead(context: Context, scope: DashboardScope): boolean | Promise<boolean>;
  canWrite(context: Context, scope: DashboardScope): boolean | Promise<boolean>;
  canUseWidget(
    context: Context,
    scope: DashboardScope,
    ref: { bindingId: string; widgetId: string }
  ): boolean | Promise<boolean>;
}

export function createAuthorizedDashboardStore<Context>(options: {
  context: Context;
  authorization: DashboardAuthorization<Context>;
  repository: DashboardRepository;
  definitions: readonly DashboardConfigDefinition[];
}): DashboardStore {
  const definitions = definitionMap(options.definitions);
  const { context, authorization, repository } = options;
  async function permissionRevision(scope: DashboardScope) {
    const revision = await authorization.revision(context, scope);
    if (
      typeof revision !== "string" ||
      revision.length === 0 ||
      revision.length > 1024
    ) {
      throw new DashboardForbiddenError();
    }
    return revision;
  }
  async function authorize(
    scope: DashboardScope,
    write: boolean,
    expectedRevision: string
  ) {
    const currentScope = await authorization.resolveScope(context);
    if (
      dashboardScopeKey(currentScope) !== dashboardScopeKey(scope) ||
      !(await authorization.canRead(context, scope)) ||
      (write && !(await authorization.canWrite(context, scope)))
    ) {
      throw new DashboardForbiddenError();
    }
    if ((await permissionRevision(scope)) !== expectedRevision) {
      throw new DashboardForbiddenError();
    }
  }
  async function project(
    snapshot: DashboardSnapshot,
    scope: DashboardScope,
    permission: string
  ): Promise<DashboardSnapshot> {
    const document = structuredClone(snapshot.document);
    const restrictedInstanceIds: string[] = [];
    for (const instance of document.instances) {
      if (
        !(await authorization.canUseWidget(context, scope, instance.definition))
      ) {
        restrictedInstanceIds.push(instance.id);
        instance.config = {};
      }
    }
    await authorize(scope, false, permission);
    return { revision: snapshot.revision, document, restrictedInstanceIds };
  }
  return {
    async read({ signal } = {}) {
      signal?.throwIfAborted();
      const scope = await authorization.resolveScope(context);
      const permission = await permissionRevision(scope);
      await authorize(scope, false, permission);
      return repository.transaction(dashboardScopeKey(scope), async (tx) => {
        const result = await project(tx.read(), scope, permission);
        signal?.throwIfAborted();
        return result;
      });
    },
    async save(input, { signal } = {}) {
      signal?.throwIfAborted();
      // Copy before the first await, so caller mutation cannot alter admitted content.
      const request = structuredClone(input);
      validateDocument(request.document);
      if (
        typeof request.mutationId !== "string" ||
        !request.mutationId ||
        request.mutationId.length > 128
      ) {
        throw new Error("Invalid mutation ID");
      }
      if (
        typeof request.expectedRevision !== "string" ||
        !request.expectedRevision ||
        request.expectedRevision.length > 1024
      ) {
        throw new Error("Invalid expected revision");
      }
      const fingerprint = canonicalJson({
        expectedRevision: request.expectedRevision,
        document: request.document,
      });
      const scope = await authorization.resolveScope(context);
      const permission = await permissionRevision(scope);
      await authorize(scope, true, permission);
      return repository.transaction(
        dashboardScopeKey(scope),
        async (tx) => {
          const previous = tx.mutation(request.mutationId);
          if (previous) {
            if (previous.fingerprint !== fingerprint) {
              throw new DashboardMutationCollisionError();
            }
            await authorize(scope, true, permission);
            return project(previous.snapshot, scope, permission);
          }
          const current = tx.read();
          if (current.revision !== request.expectedRevision) {
            throw new DashboardConflictError();
          }
          const { document } = request;
          const hidden = new Set<string>();
          const immutable = new Set<string>();
          for (const original of current.document.instances) {
            const allowed = await authorization.canUseWidget(
              context,
              scope,
              original.definition
            );
            const definition = definitions.get(
              definitionKey(original.definition)
            );
            if (!allowed) {
              hidden.add(original.id);
            }
            if (
              !allowed ||
              !definition ||
              definition.configVersion !== original.configVersion
            ) {
              immutable.add(original.id);
              const index = document.instances.findIndex(
                (instance) => instance.id === original.id
              );
              if (index === -1) {
                document.instances.push(structuredClone(original));
              } else {
                document.instances[index] = structuredClone(original);
              }
              if (
                hidden.has(original.id) ||
                !document.placements.some(
                  (placement) => placement.instanceId === original.id
                )
              ) {
                document.placements = document.placements.filter(
                  (placement) => placement.instanceId !== original.id
                );
                const placement = current.document.placements.find(
                  (item) => item.instanceId === original.id
                );
                if (placement) {
                  document.placements.push(structuredClone(placement));
                }
              }
            }
          }
          for (const instance of document.instances) {
            if (immutable.has(instance.id)) {
              continue;
            }
            if (
              !(await authorization.canUseWidget(
                context,
                scope,
                instance.definition
              ))
            ) {
              throw new DashboardForbiddenError();
            }
            const definition = definitions.get(
              definitionKey(instance.definition)
            );
            if (
              !definition ||
              definition.configVersion !== instance.configVersion
            ) {
              throw new Error("Unavailable widget definition");
            }
            instance.config = structuredClone(
              definition.configSchema.parse(instance.config)
            );
            const placement = document.placements.find(
              (item) => item.instanceId === instance.id
            );
            if (
              definition.sizes &&
              placement &&
              (placement.width < definition.sizes.min.width ||
                placement.width > definition.sizes.max.width ||
                placement.height < definition.sizes.min.height ||
                placement.height > definition.sizes.max.height)
            ) {
              throw new Error("Widget size limit reached");
            }
          }
          validateDocument(document);
          for (const instance of document.instances) {
            if (
              !immutable.has(instance.id) &&
              !(await authorization.canUseWidget(
                context,
                scope,
                instance.definition
              ))
            ) {
              throw new DashboardForbiddenError();
            }
          }
          for (const original of current.document.instances) {
            if (
              !immutable.has(original.id) &&
              !document.instances.some(
                (instance) => instance.id === original.id
              ) &&
              !(await authorization.canUseWidget(
                context,
                scope,
                original.definition
              ))
            ) {
              throw new DashboardForbiddenError();
            }
          }
          await authorize(scope, true, permission);
          signal?.throwIfAborted();
          const saved = tx.commit({ ...request, document, fingerprint });
          return project(saved, scope, permission);
        },
        {
          mutationId: request.mutationId,
          ...(signal ? { signal } : {}),
          beforeCommit: async () => {
            await authorize(scope, true, permission);
            signal?.throwIfAborted();
          },
        }
      );
    },
  };
}

/** Single-process reference implementation; not a distributed or durable store. */
export function createMemoryDashboardRepository(
  defaults: DashboardDocument
): DashboardRepository {
  validateDocument(defaults);
  const seed = structuredClone(defaults);
  type State = {
    snapshot: DashboardSnapshot;
    mutations: Map<
      string,
      { fingerprint: string; snapshot: DashboardSnapshot }
    >;
  };
  const states = new Map<string, State>();
  const locks = new Map<string, Promise<void>>();
  return {
    async transaction(scope, run, options) {
      const prior = locks.get(scope) ?? Promise.resolve();
      let release!: () => void;
      const lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      const queued = (async () => {
        await prior;
        await lock;
      })();
      locks.set(scope, queued);
      await prior;
      const original = states.get(scope) ?? {
        snapshot: { revision: "0", document: structuredClone(seed) },
        mutations: new Map(),
      };
      const state: State = {
        snapshot: structuredClone(original.snapshot),
        mutations: new Map(original.mutations),
      };
      let staged = false;
      try {
        options?.signal?.throwIfAborted();
        const result = await run({
          read: () => structuredClone(state.snapshot),
          mutation: (id) => {
            const value = state.mutations.get(id);
            return value ? structuredClone(value) : undefined;
          },
          commit(input) {
            const previous = state.mutations.get(input.mutationId);
            if (previous) {
              if (previous.fingerprint !== input.fingerprint) {
                throw new DashboardMutationCollisionError();
              }
              return structuredClone(previous.snapshot);
            }
            if (state.snapshot.revision !== input.expectedRevision) {
              throw new DashboardConflictError();
            }
            state.snapshot = {
              revision: String(Number(state.snapshot.revision) + 1),
              document: structuredClone(input.document),
            };
            state.mutations.set(input.mutationId, {
              fingerprint: input.fingerprint,
              snapshot: structuredClone(state.snapshot),
            });
            staged = true;
            return structuredClone(state.snapshot);
          },
        });
        if (staged) {
          await options?.beforeCommit?.();
        }
        options?.signal?.throwIfAborted();
        states.set(scope, state);
        return result;
      } finally {
        release();
        if (locks.get(scope) === queued) {
          locks.delete(scope);
        }
      }
    },
  };
}
