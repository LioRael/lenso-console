import { ApiKeyError, createApiKeys, type KeyMetadata } from "@lenso/api-keys";
import type { AuditService } from "@lenso/audit";
import { SessionAdministrationError } from "@lenso/auth/sessions";
import {
  createAuthorization,
  rbacPolicy,
  effectivePermissions,
  AuthorizationError,
  type Principal,
} from "@lenso/authorization";
import { definePlugin, type Plugin } from "@lenso/core";
import type { Operation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import { z } from "zod";

import {
  administrationActions,
  matchesDirectoryFilter,
  type DirectoryFilter,
  readOnlyAdministrationActions,
  type AdministrationAction,
  type AdministrationInputs,
  type AdministrationOutputs,
  type AdministrationMethod,
  type DirectoryUser,
  type DirectoryListInput,
  type Page,
  type PageInput,
  type AdministrationSession,
  type PersonalToken,
  type CredentialDelivery,
} from "./administration-contracts";
import { AdministrationError } from "./administration-error";
import type { ConsoleAdministrationStore } from "./administration-store";

const readOnlyActions = readOnlyAdministrationActions;
const ownerRoleId = "instance-owner";

export * from "./administration-contracts";
export { AdministrationError } from "./administration-error";
export type { ConsoleAdministrationStore } from "./administration-store";

export interface AdministrationContext {
  readonly principal: Principal;
  readonly entry: "human" | "agent";
  readonly credentialScopes?: readonly AdministrationAction[];
  readonly signal?: AbortSignal;
}
export interface ConsoleAdministrationOptions {
  readonly id?: string;
  readonly consoleId: string;
  readonly tenantId: string;
  readonly realmId: string;
  readonly mcpUrl: string;
  readonly source?: string;
  readonly store: ConsoleAdministrationStore;
  readonly directory: {
    /** Opt in only when status is applied before paging and cursor calculation. */
    readonly statusFiltering?: boolean;
    /** Supports complete name predicates before pagination. */
    readonly nameFiltering?: boolean;
    /** Supports the complete bounded name/status AND/OR tree before paging. */
    readonly expressionFiltering?: boolean;
    list(
      input: DirectoryListInput,
      signal?: AbortSignal
    ): Promise<Page<DirectoryUser>>;
    read(
      subjectId: string,
      signal?: AbortSignal
    ): Promise<DirectoryUser | null>;
    /** Must atomically fence this access revision with the account-state write. */
    disable?(
      subjectId: string,
      expectedRevision: string,
      signal?: AbortSignal,
      guard?: { readonly subjectId: string }
    ): Promise<boolean>;
  };
  readonly sessions?: {
    /** Opt in only when the adapter preserves the Auth owner's agent actor provenance. */
    readonly agent?: boolean;
    list(
      subjectId: string,
      input: PageInput,
      context: AdministrationContext
    ): Promise<Page<AdministrationSession>>;
    revoke(
      id: string,
      subjectId: string,
      expectedRevision: number,
      context: AdministrationContext
    ): Promise<boolean>;
  };
  readonly audit: AuditService<AdministrationContext>;
  readonly assertManagementCaller: (
    context: AdministrationContext,
    phase?: "dispatch" | "disclosure"
  ) => void | Promise<void>;
  readonly tokenCeiling?: readonly AdministrationAction[];
  readonly tokenLifetimeDays?: 7 | 30;
}
const text = z.string().min(1).max(512);
const directoryStatus = z.enum(["active", "disabled", "external"]);
const directoryFilter: z.ZodType<DirectoryFilter> = z.lazy(() =>
  z.union([
    z.strictObject({
      operator: z.enum(["and", "or"]),
      children: z.array(directoryFilter).max(50),
    }),
    z.strictObject({
      field: z.literal("name"),
      operator: z.enum(["contains", "equals"]),
      value: text,
    }),
    z.strictObject({
      field: z.literal("status"),
      operator: z.literal("equals"),
      value: directoryStatus,
    }),
  ])
);
// Bound traversal before recursive schema parsing, including untrusted MCP input.
const boundedDirectoryFilter = z
  .unknown()
  .superRefine((value, context) => {
    const pending = [{ value, depth: 1 }];
    let count = 0;
    while (pending.length) {
      const next = pending.pop()!;
      count += 1;
      if (count > 50 || next.depth > 4) {
        context.addIssue({
          code: "custom",
          message: "Use at most 50 nodes and four group levels.",
        });
        return;
      }
      if (
        next.value &&
        typeof next.value === "object" &&
        "children" in next.value &&
        Array.isArray(next.value.children)
      ) {
        for (const child of next.value.children) {
          pending.push({
            value: child,
            depth:
              next.depth +
              (child && typeof child === "object" && "children" in child
                ? 1
                : 0),
          });
        }
      }
    }
  })
  .pipe(directoryFilter);
const revision = z.number().int().positive();
const keyRevision = z.number().int().nonnegative();
const accessRevision = z.string().regex(/^[1-9][0-9]*$/);
const actions = z
  .array(z.enum(administrationActions))
  .max(administrationActions.length);
const pageInput = z
  .object({
    search: z.string().max(512).optional(),
    cursor: text.optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
const empty = z.object({}).strict();
const subjectInput = z.object({ subjectId: text }).strict();
const memberInput = z
  .object({ subjectId: text, roleId: text, expectedRevision: accessRevision })
  .strict();
const inputSchemas = {
  info: empty,
  usersList: pageInput.extend({
    filter: boundedDirectoryFilter.optional(),
    status: directoryStatus.optional(),
    name: z
      .strictObject({ operator: z.enum(["contains", "equals"]), value: text })
      .optional(),
  }),
  usersRead: subjectInput,
  usersDisable: subjectInput.extend({ expectedRevision: accessRevision }),
  sessionsList: pageInput.extend({ subjectId: text }),
  sessionsRevoke: z
    .object({ id: text, subjectId: text, expectedRevision: revision })
    .strict(),
  accessRead: empty,
  membersSet: memberInput,
  membersRevoke: subjectInput.extend({ expectedRevision: accessRevision }),
  membersPromote: memberInput,
  rolesSave: z
    .object({
      id: text,
      label: text,
      permissions: actions,
      expectedRevision: accessRevision,
    })
    .strict(),
  permissionsRead: subjectInput,
  tokensList: pageInput,
  tokensRevoke: z.object({ id: text, expectedRevision: keyRevision }).strict(),
  auditList: pageInput,
} satisfies Record<AdministrationMethod, z.ZodType>;
const directorySchema = z.object({
  subjectId: text,
  realmId: text,
  label: text,
  source: text,
  status: directoryStatus,
});
const sessionSchema = z.object({
  id: text,
  subjectId: text,
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  revokedAt: z.number().int().nonnegative().nullable().optional(),
  revision,
});
const memberSchema = z.object({
  subjectId: text,
  realmId: text,
  roleId: text,
  status: z.enum(["active", "revoked"]),
});
const roleSchema = z.object({
  id: text,
  label: text,
  permissions: actions,
  preset: z.boolean(),
});
const accessSchema = z.object({
  revision: accessRevision,
  consoleId: text,
  tenantId: text,
  members: z.array(memberSchema).max(10000),
  roles: z.array(roleSchema).max(1000),
});
const tokenSchema = z.object({
  id: text,
  subjectId: text,
  consoleId: text,
  tenantId: text,
  scopes: actions,
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  revokedAt: z.number().int().nonnegative().nullable(),
  revision: keyRevision,
  overlapUntil: z.number().int().nonnegative().nullable(),
});
const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item).max(100), nextCursor: text.nullable() });
const outputSchemas = {
  info: z.object({
    consoleId: text,
    tenantId: text,
    realmId: text,
    source: text,
    mcpUrl: text,
    allowed: actions,
    supported: z.object({
      userDisable: z.boolean(),
      userStatusFilter: z.boolean().optional(),
      userNameFilter: z.boolean().optional(),
      userFilterGroups: z.boolean().optional(),
      sessions: z.boolean(),
      sessionRevoke: z.boolean(),
    }),
    authentication: z.literal("personal-token"),
    observedLastCallAt: z.number().int().nonnegative().nullable(),
  }),
  usersList: pageSchema(directorySchema),
  usersRead: directorySchema.nullable(),
  usersDisable: z.object({ changed: z.boolean(), intentId: text }),
  sessionsList: pageSchema(sessionSchema),
  sessionsRevoke: z.object({ revoked: z.boolean(), intentId: text }),
  accessRead: accessSchema,
  membersSet: accessSchema,
  membersRevoke: accessSchema,
  membersPromote: accessSchema,
  rolesSave: accessSchema,
  permissionsRead: z.object({
    subjectId: text,
    revision: accessRevision,
    allowed: actions,
    sources: z
      .array(z.object({ roleId: text, permissions: actions }))
      .max(1000),
  }),
  tokensList: pageSchema(tokenSchema),
  tokensRevoke: z.object({ revoked: z.boolean(), intentId: text }),
  auditList: pageSchema(
    z.object({
      id: text,
      occurredAt: z.number().int().nonnegative(),
      action: text,
      subjectId: text,
      result: text,
      targetId: text,
    })
  ),
} satisfies Record<AdministrationMethod, z.ZodType>;
export const administrationSchemas = Object.fromEntries(
  (Object.keys(inputSchemas) as AdministrationMethod[]).map((method) => [
    method,
    { input: inputSchemas[method], output: outputSchemas[method] },
  ])
) as {
  [M in AdministrationMethod]: {
    input: (typeof inputSchemas)[M];
    output: (typeof outputSchemas)[M];
  };
};
const humanOnly = new Set<AdministrationAction>([
  "members.promote",
  "roles.write",
  "tokens.issue",
  "tokens.rotate",
]);
const writeMethods = new Set<AdministrationMethod>([
  "usersDisable",
  "sessionsRevoke",
  "membersSet",
  "membersRevoke",
  "membersPromote",
  "rolesSave",
  "tokensRevoke",
]);
const deliverySchema = z.object({
  token: tokenSchema,
  credential: z.string().min(1).max(4096).nullable(),
  replayed: z.boolean(),
});
const snapshotMethods = new Set<AdministrationMethod>([
  "accessRead",
  "membersSet",
  "membersRevoke",
  "membersPromote",
  "rolesSave",
]);
const methodActions: Record<AdministrationMethod, AdministrationAction> = {
  info: "permissions.read",
  usersList: "users.list",
  usersRead: "users.read",
  usersDisable: "users.disable",
  sessionsList: "sessions.list",
  sessionsRevoke: "sessions.revoke",
  accessRead: "members.list",
  membersSet: "members.write",
  membersRevoke: "members.write",
  membersPromote: "members.promote",
  rolesSave: "roles.write",
  permissionsRead: "permissions.read",
  tokensList: "tokens.list",
  tokensRevoke: "tokens.revoke",
  auditList: "audit.list",
};
export const administrationRequirements = Object.fromEntries(
  (Object.keys(methodActions) as AdministrationMethod[]).map((method) => [
    method,
    method === "info"
      ? []
      : [
          ...new Set<AdministrationAction>([
            methodActions[method],
            ...(snapshotMethods.has(method)
              ? (["members.list", "roles.list"] as const)
              : []),
            ...(method === "rolesSave" ? (["members.promote"] as const) : []),
          ]),
        ],
  ])
) as unknown as Readonly<
  Record<AdministrationMethod, readonly AdministrationAction[]>
>;
type Methods = {
  [M in AdministrationMethod]: (
    input: AdministrationInputs[M],
    context: AdministrationContext
  ) => Promise<AdministrationOutputs[M]>;
};

export function createConsoleAdministrationService(
  options: ConsoleAdministrationOptions
) {
  const { store, directory, audit } = options;
  if (
    store.consoleId !== options.consoleId ||
    store.tenantId !== options.tenantId ||
    store.realmId !== options.realmId
  ) {
    throw new AdministrationError("INVALID_INPUT");
  }
  text.parse(options.mcpUrl);
  const resource = {
    type: "console",
    id: options.consoleId,
    scope: store.scope,
  };
  const authorization = createAuthorization({
    actions: administrationActions,
    policies: [
      rbacPolicy({ actions: administrationActions, store: store.roleStore }),
    ],
    identity: { required: true, realms: [options.realmId] },
  });
  async function active(subjectId: string) {
    const user = await directory.read(subjectId);
    return (
      user !== null &&
      user.subjectId === subjectId &&
      user.realmId === options.realmId &&
      user.status === "active" &&
      (await store.admission(subjectId)) !== null
    );
  }
  async function authorize(
    action: AdministrationAction,
    context: AdministrationContext
  ) {
    return authorizeMany([action], context);
  }
  // A finite read owns its facts. Every dispatch/disclosure phase starts fresh;
  // concurrent operations, credentials and requests never share this map entry.
  const readPhases = new WeakMap<
    AdministrationContext,
    {
      original: AdministrationContext;
      facts?: ReturnType<typeof loadCallerFacts>;
    }
  >();
  const originalCaller = (context: AdministrationContext) =>
    readPhases.get(context)?.original ?? context;
  async function assertCaller(
    context: AdministrationContext,
    phase?: "dispatch" | "disclosure"
  ) {
    const read = readPhases.get(context);
    if (
      read &&
      (read.original.principal.realmId !== context.principal.realmId ||
        read.original.principal.subjectId !== context.principal.subjectId ||
        read.original.principal.kind !== context.principal.kind ||
        read.original.entry !== context.entry ||
        read.original.signal !== context.signal)
    ) {
      throw new AdministrationError("DENIED");
    }
    if (phase && read) {
      delete read.facts;
    }
    await options.assertManagementCaller(originalCaller(context), phase);
    context.signal?.throwIfAborted();
  }
  async function callerFacts(context: AdministrationContext) {
    const read = readPhases.get(context);
    if (!read) {
      return loadCallerFacts(context);
    }
    await assertCaller(context);
    return (read.facts ??= loadCallerFacts(context));
  }
  async function loadCallerFacts(context: AdministrationContext) {
    await assertCaller(context);
    const signal = context.signal ?? new AbortController().signal;
    signal.throwIfAborted();
    const [user, snapshot] = await Promise.all([
      directory.read(context.principal.subjectId, signal),
      store.roleStore.read({ signal, now: Date.now() }),
    ]);
    if (
      context.principal.realmId !== options.realmId ||
      user?.status !== "active" ||
      user.subjectId !== context.principal.subjectId ||
      user.realmId !== options.realmId ||
      !snapshot.graph.bindings.some(
        (binding) =>
          binding.principal.realmId === context.principal.realmId &&
          binding.principal.subjectId === context.principal.subjectId &&
          binding.principal.kind === context.principal.kind
      ) ||
      (context.entry !== "human" && context.entry !== "agent")
    ) {
      throw new AdministrationError("DENIED");
    }
    const phaseAuthorization = createAuthorization({
      actions: administrationActions,
      policies: [
        rbacPolicy({ actions: administrationActions, graph: snapshot.graph }),
      ],
      identity: { required: true, realms: [options.realmId] },
    });
    return {
      signal,
      authorization: phaseAuthorization,
      request(action: AdministrationAction) {
        return {
          principal: context.principal,
          action,
          resource,
          context: {},
          ...(context.credentialScopes
            ? {
                credential: {
                  permissions: context.credentialScopes.map((scopeAction) => ({
                    action: scopeAction,
                    resourceType: "console",
                    scope: store.scope,
                  })),
                },
              }
            : {}),
        };
      },
    };
  }
  async function authorizeMany(
    required: readonly AdministrationAction[],
    context: AdministrationContext
  ) {
    const phase = await callerFacts(context);
    for (const action of required) {
      if (
        context.entry === "agent" &&
        (humanOnly.has(action) || !context.credentialScopes?.includes(action))
      ) {
        throw new AdministrationError("DENIED");
      }
      try {
        await phase.authorization.enforce(phase.request(action), {
          signal: phase.signal,
        });
      } catch (error) {
        if (error instanceof AuthorizationError) {
          throw new AdministrationError("DENIED");
        }
        throw error;
      }
    }
  }
  async function allowed(context: AdministrationContext) {
    // One fresh immutable graph per permission-enumeration phase, not a DB read
    // for every policy/action. Dispatch and disclosure obtain separate facts.
    const phase = await callerFacts(context);
    const result: AdministrationAction[] = [];
    for (const action of administrationActions) {
      if (
        (context.entry !== "agent" ||
          (!humanOnly.has(action) &&
            context.credentialScopes?.includes(action))) &&
        (await phase.authorization.can(phase.request(action), {
          signal: phase.signal,
        }))
      ) {
        result.push(action);
      }
    }
    return result;
  }
  async function audited<T>(
    action: string,
    targetId: string,
    context: AdministrationContext,
    write: () => Promise<T> | T
  ) {
    const intentId = crypto.randomUUID();
    const prepared = await audit.prepare(
      {
        id: intentId,
        occurredAt: Date.now(),
        scope: { tenantId: options.tenantId, scopeId: store.scope.id },
        action,
        target: {
          type: "console",
          id: `target:${Buffer.from(targetId).toString("base64url")}`,
        },
        result: "intent",
        reasonCode: "requested",
        summary: { agent: context.entry === "agent" },
        ...(context.entry === "agent" ? { correlationId: "console.mcp" } : {}),
      },
      originalCaller(context)
    );
    if (prepared.status !== "ready") {
      throw new AdministrationError("OUTCOME_UNKNOWN", intentId);
    }
    let value: T;
    try {
      await assertCaller(context, "dispatch");
      value = await write();
    } catch (error) {
      let failureCode: AdministrationError["code"] | undefined;
      if (error instanceof AdministrationError) {
        if (error.code !== "OUTCOME_UNKNOWN") {
          failureCode = error.code;
        }
      } else if (error instanceof ApiKeyError) {
        if (error.code === "CONFLICT" || error.code === "INVALID_INPUT") {
          failureCode = error.code;
        } else if (error.code === "FORBIDDEN") {
          failureCode = "DENIED";
        }
      } else if (error instanceof SessionAdministrationError) {
        if (error.code === "stale-revision") {
          failureCode = "CONFLICT";
        } else if (error.code === "invalid-input") {
          failureCode = "INVALID_INPUT";
        }
      }
      try {
        await audit.complete(prepared.receipt, {
          id: crypto.randomUUID(),
          occurredAt: Date.now(),
          result: failureCode ? "failure" : "unknown",
          reasonCode: "operation-failed",
        });
      } catch {
        throw new AdministrationError("OUTCOME_UNKNOWN", intentId);
      }
      if (error instanceof AdministrationError) {
        throw error;
      }
      if (failureCode) {
        throw new AdministrationError(failureCode);
      }
      throw new AdministrationError("OUTCOME_UNKNOWN", intentId);
    }
    try {
      await audit.complete(prepared.receipt, {
        id: crypto.randomUUID(),
        occurredAt: Date.now(),
        result: "success",
        reasonCode: "completed",
      });
    } catch {
      throw new AdministrationError("OUTCOME_UNKNOWN", intentId);
    }
    return { value, intentId };
  }
  const keySubject = (subjectId: string) => ({
    namespace: store.scope.id,
    tenantId: options.tenantId,
    subjectId,
  });
  const ceiling = actions.parse(options.tokenCeiling ?? readOnlyActions);
  const lifetimeDays = z
    .union([z.literal(7), z.literal(30)])
    .parse(options.tokenLifetimeDays ?? 7);
  const apiKeys = createApiKeys<
    AdministrationContext,
    { consoleId: string; tenantId: string; realmId: string }
  >({
    store: store.apiKeyStore,
    config: { maxLifetimeMs: lifetimeDays * 86400000, maxOverlapMs: 3600000 },
    authorizeManagement: async (context, action, target) => {
      await authorize(
        `tokens.${action === "read" ? "list" : action}` as AdministrationAction,
        context
      );
      return (
        target.subject.namespace === store.scope.id &&
        target.subject.tenantId === options.tenantId &&
        target.subject.subjectId === context.principal.subjectId
      );
    },
    grantScopes: async (context, _subject, requested) => {
      const rights = await allowed(context);
      return requested.filter(
        (scope) =>
          ceiling.includes(scope as AdministrationAction) &&
          rights.includes(scope as AdministrationAction) &&
          !humanOnly.has(scope as AdministrationAction)
      );
    },
    subjectActive: (subject) =>
      subject.namespace === store.scope.id &&
      subject.tenantId === options.tenantId
        ? active(subject.subjectId)
        : Promise.resolve(false),
    authorizeUse: async (key, action, target) => {
      if (
        target.consoleId !== options.consoleId ||
        target.tenantId !== options.tenantId ||
        target.realmId !== options.realmId ||
        !administrationActions.includes(action as AdministrationAction) ||
        humanOnly.has(action as AdministrationAction)
      ) {
        return false;
      }
      return authorization.can({
        principal: {
          realmId: options.realmId,
          subjectId: key.subject.subjectId,
          kind: "user",
        },
        action: action as AdministrationAction,
        resource,
        context: {},
      });
    },
  });
  function token(key: KeyMetadata): PersonalToken {
    if (
      key.subject.namespace !== store.scope.id ||
      key.subject.tenantId !== options.tenantId
    ) {
      throw new AdministrationError("DENIED");
    }
    return {
      id: text.parse(key.id),
      subjectId: text.parse(key.subject.subjectId),
      consoleId: options.consoleId,
      tenantId: options.tenantId,
      scopes: actions.parse(key.scopes),
      issuedAt: z.number().int().nonnegative().parse(key.issuedAt),
      expiresAt: z.number().int().nonnegative().parse(key.expiresAt),
      revokedAt: z.number().int().nonnegative().nullable().parse(key.revokedAt),
      revision: keyRevision.parse(key.revision),
      overlapUntil: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .parse(key.overlapUntil),
    };
  }
  function projectPage<T>(
    value: Page<T>,
    project: (item: T) => T,
    limit = 100
  ): Page<T> {
    if (!Array.isArray(value.items) || value.items.length > limit) {
      throw new AdministrationError("INVALID_INPUT");
    }
    return {
      items: value.items.map(project),
      nextCursor:
        value.nextCursor === null ? null : text.parse(value.nextCursor),
    };
  }
  async function targetUser(subjectId: string) {
    const raw = await directory.read(subjectId);
    if (!raw) {
      return null;
    }
    const user = directorySchema.parse(raw);
    if (user.realmId !== options.realmId || user.subjectId !== subjectId) {
      throw new AdministrationError("DENIED");
    }
    return user;
  }
  async function permissions(
    subjectId: string,
    context: AdministrationContext
  ) {
    const snapshot = await store.roleStore.read({
      signal: context.signal ?? new AbortController().signal,
      now: Date.now(),
    });
    const rights = (await active(subjectId))
      ? effectivePermissions(
          snapshot.graph,
          { realmId: options.realmId, subjectId, kind: "user" },
          store.scope,
          Date.now()
        ).map((p) => p.action)
      : [];
    const access = await store.read();
    return {
      subjectId,
      revision: snapshot.revision,
      allowed: [...new Set(rights)],
      sources: access.members
        .filter((m) => m.subjectId === subjectId)
        .map((m) => ({
          roleId: m.roleId,
          permissions:
            access.roles.find((r) => r.id === m.roleId)?.permissions ?? [],
        })),
    };
  }
  async function setMember(
    input: AdministrationInputs["membersSet"],
    context: AdministrationContext,
    promote: boolean
  ) {
    const user = await targetUser(input.subjectId);
    if (user?.status !== "active") {
      throw new AdministrationError("DENIED");
    }
    const snapshot = await store.read();
    const role = snapshot.roles.find((r) => r.id === input.roleId);
    if (!role) {
      throw new AdministrationError("INVALID_INPUT");
    }
    const rights = await allowed(context);
    const privileged = role.permissions.some(
      (action) => !readOnlyActions.includes(action)
    );
    if (
      (!promote && privileged) ||
      (promote && !rights.includes("members.promote")) ||
      role.permissions.some((action) => !rights.includes(action))
    ) {
      throw new AdministrationError("DENIED");
    }
    const { allowed: before } = await permissions(input.subjectId, context);
    if (
      input.subjectId === context.principal.subjectId &&
      role.permissions.some((action) => !before.includes(action))
    ) {
      throw new AdministrationError("DENIED");
    }
    return store.mutate(
      input.expectedRevision,
      (current) => ({
        ...current,
        graph: {
          ...current.graph,
          bindings: [
            ...current.graph.bindings.filter(
              (b) => b.principal.subjectId !== input.subjectId
            ),
            {
              id: input.subjectId,
              principal: {
                realmId: options.realmId,
                subjectId: input.subjectId,
                kind: "user",
              },
              roleId: input.roleId,
              scope: store.scope,
            },
          ],
        },
      }),
      undefined,
      { subjectId: context.principal.subjectId }
    );
  }
  const handlers: Methods = {
    async info(_input, context) {
      const observed = await audit.query(
        {
          scope: { tenantId: options.tenantId, scopeId: store.scope.id },
          correlationId: "console.mcp",
          result: "intent",
          limit: 1,
        },
        originalCaller(context)
      );
      return {
        consoleId: options.consoleId,
        tenantId: options.tenantId,
        realmId: options.realmId,
        source: options.source ?? "application-directory",
        mcpUrl: options.mcpUrl,
        allowed: await allowed(context),
        supported: {
          userDisable: !!directory.disable,
          userStatusFilter: directory.statusFiltering === true,
          userNameFilter: directory.nameFiltering === true,
          userFilterGroups: directory.expressionFiltering === true,
          sessions:
            !!options.sessions &&
            (context.entry === "human" || options.sessions.agent === true),
          sessionRevoke:
            !!options.sessions &&
            (context.entry === "human" || options.sessions.agent === true),
        },
        authentication: "personal-token",
        observedLastCallAt: observed.events
          .filter((e) => e.summary.agent === true && e.result === "intent")
          .reduce<number | null>(
            (last, e) => Math.max(last ?? 0, e.occurredAt),
            null
          ),
      };
    },
    async usersList(input, context) {
      if (
        input.filter !== undefined &&
        directory.expressionFiltering !== true
      ) {
        throw new AdministrationError("INVALID_INPUT");
      }
      if (input.status !== undefined && directory.statusFiltering !== true) {
        throw new AdministrationError("INVALID_INPUT");
      }
      if (input.name !== undefined && directory.nameFiltering !== true) {
        throw new AdministrationError("INVALID_INPUT");
      }
      return projectPage(
        await directory.list(input, context.signal),
        (item) => {
          const user = directorySchema.parse(item);
          if (user.realmId !== options.realmId) {
            throw new AdministrationError("DENIED");
          }
          if (input.filter && !matchesDirectoryFilter(input.filter, user)) {
            throw new AdministrationError("UNAVAILABLE");
          }
          if (input.status !== undefined && user.status !== input.status) {
            throw new AdministrationError("UNAVAILABLE");
          }
          if (
            input.name &&
            !(input.name.operator === "equals"
              ? user.label === input.name.value
              : user.label
                  .toLowerCase()
                  .includes(input.name.value.toLowerCase()))
          ) {
            throw new AdministrationError("UNAVAILABLE");
          }
          return user;
        },
        input.limit
      );
    },
    async usersRead(input) {
      return targetUser(input.subjectId);
    },
    async usersDisable(input, context) {
      if (!directory.disable) {
        throw new AdministrationError("UNAVAILABLE");
      }
      const access = await store.read();
      if (access.revision !== input.expectedRevision) {
        throw new AdministrationError("CONFLICT");
      }
      // External directory writes cannot join the access-state transaction.
      const { allowed: rights } = await permissions(input.subjectId, context);
      if (
        rights.includes("members.promote") ||
        rights.includes("roles.write")
      ) {
        throw new AdministrationError("DENIED");
      }
      if (!(await targetUser(input.subjectId))) {
        throw new AdministrationError("INVALID_INPUT");
      }
      const changed = await directory.disable(
        input.subjectId,
        input.expectedRevision,
        context.signal,
        { subjectId: context.principal.subjectId }
      );
      return { changed, intentId: "" };
    },
    async sessionsList(input, context) {
      if (
        !options.sessions ||
        (context.entry === "agent" && options.sessions.agent !== true)
      ) {
        throw new AdministrationError("UNAVAILABLE");
      }
      await targetUser(input.subjectId);
      return projectPage(
        await options.sessions.list(
          input.subjectId,
          input,
          originalCaller(context)
        ),
        (item) => {
          const session = sessionSchema.parse(item);
          if (session.subjectId !== input.subjectId) {
            throw new AdministrationError("DENIED");
          }
          return {
            id: session.id,
            subjectId: session.subjectId,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            revision: session.revision,
            ...(session.revokedAt === undefined
              ? {}
              : { revokedAt: session.revokedAt }),
          };
        },
        input.limit
      );
    },
    async sessionsRevoke(input, context) {
      if (
        !options.sessions ||
        (context.entry === "agent" && options.sessions.agent !== true)
      ) {
        throw new AdministrationError("UNAVAILABLE");
      }
      await targetUser(input.subjectId);
      return {
        revoked: await options.sessions.revoke(
          input.id,
          input.subjectId,
          input.expectedRevision,
          context
        ),
        intentId: "",
      };
    },
    async accessRead(_input, context) {
      await authorize("roles.list", context);
      return store.read();
    },
    async membersSet(input, context) {
      return setMember(input, context, false);
    },
    async membersPromote(input, context) {
      return setMember(input, context, true);
    },
    async membersRevoke(input, context) {
      return store.mutate(
        input.expectedRevision,
        (current) => ({
          ...current,
          graph: {
            ...current.graph,
            bindings: current.graph.bindings.filter(
              (b) => b.principal.subjectId !== input.subjectId
            ),
          },
        }),
        undefined,
        { subjectId: context.principal.subjectId }
      );
    },
    async rolesSave(input, context) {
      const access = await store.read();
      const existing = access.roles.find((r) => r.id === input.id);
      if (existing?.preset || input.id === ownerRoleId) {
        throw new AdministrationError("DENIED");
      }
      const rights = await allowed(context);
      if (
        !rights.includes("members.promote") ||
        input.permissions.some((action) => !rights.includes(action))
      ) {
        throw new AdministrationError("DENIED");
      }
      const membership = await store.admission(context.principal.subjectId);
      const ownRole = membership?.roleId;
      if (
        ownRole === input.id &&
        input.permissions.some((action) => !rights.includes(action))
      ) {
        throw new AdministrationError("DENIED");
      }
      return store.mutate(
        input.expectedRevision,
        (current) => ({
          ...current,
          graph: {
            ...current.graph,
            roles: [
              ...current.graph.roles.filter((r) => r.id !== input.id),
              {
                id: input.id,
                scope: store.scope,
                permissions: input.permissions.map((action) => ({
                  action,
                  resourceType: "console",
                  scope: store.scope,
                })),
              },
            ],
          },
        }),
        { [input.id]: input.label },
        { subjectId: context.principal.subjectId }
      );
    },
    async permissionsRead(input, context) {
      return permissions(input.subjectId, context);
    },
    async tokensList(input, context) {
      if (input.search) {
        throw new AdministrationError("INVALID_INPUT");
      }
      const items = await apiKeys.list(
        {
          subject: keySubject(context.principal.subjectId),
          ...(input.cursor ? { after: input.cursor } : {}),
          limit: input.limit ?? 100,
        },
        context
      );
      return {
        items: items.map(token),
        nextCursor:
          items.length === (input.limit ?? 100) ? items.at(-1)!.id : null,
      };
    },
    async tokensRevoke(input, context) {
      const subject = keySubject(context.principal.subjectId);
      const key = await apiKeys.read({ subject, id: input.id }, context);
      if (!key || key.revision !== input.expectedRevision) {
        throw new AdministrationError("CONFLICT");
      }
      await authorize("tokens.revoke", context);
      return {
        revoked: await store.revokeKey(
          context.principal.subjectId,
          input.id,
          input.expectedRevision
        ),
        intentId: "",
      };
    },
    async auditList(input, context) {
      if (input.search) {
        throw new AdministrationError("INVALID_INPUT");
      }
      const cursor = input.cursor
        ? z
            .object({ recordedAt: z.number().int().nonnegative(), id: text })
            .strict()
            .parse(JSON.parse(input.cursor))
        : undefined;
      const result = await audit.query(
        {
          scope: { tenantId: options.tenantId, scopeId: store.scope.id },
          limit: input.limit ?? 100,
          ...(cursor ? { cursor } : {}),
        },
        originalCaller(context)
      );
      return {
        items: result.events.map((event) => ({
          id: text.parse(event.id),
          occurredAt: z.number().int().nonnegative().parse(event.occurredAt),
          action: text.parse(event.action),
          subjectId:
            event.actor.kind === "system"
              ? event.actor.systemId
              : event.actor.subjectId,
          result: text.parse(event.result),
          targetId: text.parse(event.target.id),
        })),
        nextCursor: result.nextCursor
          ? JSON.stringify(result.nextCursor)
          : null,
      };
    },
  };
  const methods = Object.fromEntries(
    Object.keys(inputSchemas).map((name) => {
      const method = name as AdministrationMethod;
      return [
        method,
        async (raw: unknown, caller: AdministrationContext) => {
          const context = writeMethods.has(method)
            ? caller
            : Object.freeze({
                ...caller,
                principal: Object.freeze({ ...caller.principal }),
                ...(caller.credentialScopes
                  ? {
                      credentialScopes: Object.freeze([
                        ...caller.credentialScopes,
                      ]),
                    }
                  : {}),
              });
          if (context !== caller) {
            readPhases.set(context, { original: caller });
          }
          try {
            const input = inputSchemas[method].parse(raw);
            await authorizeMany(administrationRequirements[method], context);
            const result = await audited(
              methodActions[method],
              "subjectId" in input
                ? String(input.subjectId)
                : options.consoleId,
              context,
              async () => {
                await authorizeMany(
                  administrationRequirements[method],
                  context
                );
                const value = await (
                  handlers[method] as (
                    input: unknown,
                    context: AdministrationContext
                  ) => Promise<unknown>
                )(input, context);
                return value;
              }
            );
            const { value } = result;
            try {
              if (readPhases.has(context)) {
                await assertCaller(context, "disclosure");
                await authorizeMany(
                  administrationRequirements[method],
                  context
                );
              } else {
                await authorizeMany(
                  administrationRequirements[method],
                  context
                );
                await assertCaller(context, "disclosure");
              }
            } catch (error) {
              if (writeMethods.has(method)) {
                throw new AdministrationError(
                  "OUTCOME_UNKNOWN",
                  result.intentId
                );
              }
              throw error;
            }
            return outputSchemas[method].parse(
              value && typeof value === "object" && "intentId" in value
                ? { ...value, intentId: result.intentId }
                : value
            );
          } finally {
            readPhases.delete(context);
          }
        },
      ];
    })
  ) as unknown as Methods;
  return {
    ...methods,
    apiKeys,
    async issueToken(
      raw: {
        scopes: readonly AdministrationAction[];
        expiresAt: number;
        requestId: string;
      },
      context: AdministrationContext
    ): Promise<CredentialDelivery> {
      const input = z
        .object({
          scopes: actions,
          expiresAt: z.number().int().positive(),
          requestId: text,
        })
        .strict()
        .parse(raw);
      await authorize("tokens.issue", context);
      const result = await audited(
        "tokens.issue",
        context.principal.subjectId,
        context,
        () =>
          apiKeys.issue(
            {
              subject: keySubject(context.principal.subjectId),
              requestedScopes: input.scopes,
              expiresAt: input.expiresAt,
              requestId: input.requestId,
            },
            context
          )
      );
      await authorizeDelivery(
        "tokens.issue",
        result.value,
        context,
        result.intentId
      );
      return deliverySchema.parse({
        token: token(result.value.key),
        credential: result.value.credential,
        replayed: result.value.replayed,
      });
    },
    async rotateToken(
      raw: { id: string; expectedRevision: number; overlapMs: number },
      context: AdministrationContext
    ): Promise<CredentialDelivery> {
      const input = z
        .object({
          id: text,
          expectedRevision: keyRevision,
          overlapMs: z.number().int().min(0).max(3600000),
        })
        .strict()
        .parse(raw);
      await authorize("tokens.rotate", context);
      const result = await audited("tokens.rotate", input.id, context, () =>
        apiKeys.rotate(
          { ...input, subject: keySubject(context.principal.subjectId) },
          context
        )
      );
      await authorizeDelivery(
        "tokens.rotate",
        result.value,
        context,
        result.intentId
      );
      return deliverySchema.parse({
        token: token(result.value.key),
        credential: result.value.credential,
        replayed: result.value.replayed,
      });
    },
  };

  async function authorizeDelivery(
    action: "tokens.issue" | "tokens.rotate",
    value: { key: KeyMetadata; credential: string | null },
    context: AdministrationContext,
    intentId: string
  ) {
    try {
      const rights = await allowed(context);
      if (
        !rights.includes(action) ||
        value.key.scopes.some(
          (scope) => !rights.includes(scope as AdministrationAction)
        )
      ) {
        throw new AdministrationError("DENIED");
      }
      if (
        value.credential !== null &&
        !(await apiKeys.verify(value.credential))
      ) {
        throw new AdministrationError("DENIED");
      }
      await assertCaller(context, "disclosure");
    } catch {
      throw new AdministrationError("OUTCOME_UNKNOWN", intentId);
    }
  }
}
export type ConsoleAdministration = ReturnType<
  typeof createConsoleAdministrationService
>;
export function createConsoleAdministration(
  options: ConsoleAdministrationOptions
): Plugin<ConsoleAdministration> {
  return definePlugin({
    id: options.id ?? `console-administration:${options.consoleId}`,
    setup(context) {
      const service = createConsoleAdministrationService(options);
      context.onCleanup(() => service.apiKeys.close());
      return service;
    },
  });
}
export function createConsoleAdministrationManage(
  plugin: Plugin<ConsoleAdministration>
) {
  const operations: readonly Operation<AdministrationContext>[] = (
    Object.keys(inputSchemas) as AdministrationMethod[]
  ).map((method) => ({
    plugin,
    method,
    input: inputSchemas[method],
    context: true,
    description: `Console administration ${method}`,
    effect: writeMethods.has(method) ? "write" : "read",
    destructive: writeMethods.has(method),
    retry: writeMethods.has(method) ? "unsafe" : "safe",
    outputDescription: JSON.stringify(z.toJSONSchema(outputSchemas[method])),
    cancellation: "cooperative",
    mapError(error: unknown) {
      const code =
        error instanceof AdministrationError
          ? {
              DENIED: "denied",
              CONFLICT: "conflict",
              INVALID_INPUT: "invalid-input",
              UNAVAILABLE: "service-unavailable",
              OUTCOME_UNKNOWN: "outcome-unknown",
            }[error.code]
          : error instanceof AuthorizationError
            ? "denied"
            : error instanceof ApiKeyError
              ? {
                  FORBIDDEN: "denied",
                  CONFLICT: "conflict",
                  INVALID_INPUT: "invalid-input",
                  UNAVAILABLE: "service-unavailable",
                }[error.code]
              : error instanceof z.ZodError
                ? "invalid-input"
                : undefined;
      if (!code) {
        return undefined;
      }
      return {
        phase: "invoke",
        code,
        message: "Console administration request failed",
        ...(error instanceof AdministrationError && error.intentId
          ? { details: { intentId: error.intentId } }
          : {}),
      };
    },
  }));
  return { plugin, operations, manage: defineManage({ plugin, operations }) };
}
