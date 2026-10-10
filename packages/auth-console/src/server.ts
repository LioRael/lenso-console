import type { Access, Actor } from "@lenso/auth";
import type { Plugin } from "@lenso/core/plugin";

import type {
  AuthConsoleCapabilities,
  AuthInfoDTO,
  SessionPageInput,
  SessionDTO,
  SubjectDTO,
} from "./contracts";

export type AuthConsoleAction =
  | "info"
  | "sessions.list"
  | "sessions.read"
  | "sessions.revoke"
  | "subjects.list";

export interface AuthConsoleTarget {
  readonly plugin: Plugin<unknown>;
  readonly access: Pick<
    Access<string, unknown, string, string>,
    "realmId" | "audience"
  >;
}

export interface AdminContext<P, T> {
  readonly actor: P;
  readonly target: T;
  readonly signal: AbortSignal;
}

/** An explicit application admin seam. Auth's raw SessionStore is not this API. */
export interface AdminSessionRepository<P, T> {
  list?(context: AdminContext<P, T>): Promise<readonly unknown[]>;
  read?(id: string, context: AdminContext<P, T>): Promise<unknown | null>;
  revoke?(id: string, context: AdminContext<P, T>): Promise<boolean>;
}

/** Structural domain seam, with no unpublished Auth runtime import. */
export interface SessionAdministration<P> {
  list(
    input: SessionPageInput,
    actor: P,
    options?: { signal?: AbortSignal }
  ): Promise<{ sessions: readonly unknown[]; nextCursor: string | null }>;
  get(
    input: { id: string },
    actor: P,
    options?: { signal?: AbortSignal }
  ): Promise<unknown | null>;
  revoke(
    input: { id: string; expectedRevision: number },
    actor: P,
    options?: { signal?: AbortSignal }
  ): Promise<{ revoked: boolean; intentId: string }>;
}

export interface SubjectDirectory<P, T> {
  list(context: AdminContext<P, T>): Promise<readonly unknown[]>;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Auth Console output");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1024) {
    throw new Error("Invalid Auth Console output");
  }
  return value;
}

function time(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 8_640_000_000_000_000
  ) {
    throw new Error("Invalid Auth Console output");
  }
  return value;
}

function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Invalid Auth Console revision");
  }
  return value;
}

/** Reconstruct allowlisted fields; never spread repository records onto the wire. */
export function sessionDTO(value: unknown, domain = false): SessionDTO {
  const row = record(value);
  if (domain) {
    if (!["user", "guest", "service"].includes(text(row.kind))) {
      throw new Error("Invalid Auth Console session kind");
    }
    if (row.revokedAt !== null) {
      time(row.revokedAt);
    }
  }
  return Object.freeze({
    id: text(row.id),
    realmId: text(row.realmId),
    subjectId: text(row.subjectId),
    createdAt: time(domain ? row.issuedAt : row.createdAt),
    expiresAt: time(row.expiresAt),
    ...(domain || row.revision !== undefined
      ? { revision: revision(row.revision) }
      : {}),
    ...(domain
      ? { kind: text(row.kind), lastActiveAt: time(row.lastActiveAt) }
      : {}),
    ...(row.revokedAt === null || row.revokedAt === undefined
      ? {}
      : { revokedAt: time(row.revokedAt) }),
  });
}

export function subjectDTO(value: unknown): SubjectDTO {
  const row = record(value);
  return Object.freeze({
    realmId: text(row.realmId),
    subjectId: text(row.subjectId),
    ...(row.label === undefined ? {} : { label: text(row.label) }),
  });
}

export function createAuthConsoleServer<
  R extends string,
  E,
  S extends string,
  A extends string,
  T extends AuthConsoleTarget,
>(options: {
  readonly target: T;
  readonly staff: Access<R, E, S, A>;
  readonly policy: (
    context: AdminContext<Actor<R, S, A>, T> & {
      readonly action: AuthConsoleAction;
      readonly sessionId?: string;
    }
  ) => boolean | Promise<boolean>;
  readonly sessions?: AdminSessionRepository<Actor<R, S, A>, T>;
  readonly administration?: SessionAdministration<Actor<R, S, A>>;
  readonly subjects?: SubjectDirectory<Actor<R, S, A>, T>;
  readonly info?: AuthInfoDTO;
  readonly maxResults?: number;
}) {
  // Capture exact references, not mutable caller options or an ID-based lookup.
  const { staff, policy, sessions, administration, subjects } = options;
  if (sessions && administration) {
    throw new Error("Choose administration or legacy sessions, not both");
  }
  const target = Object.freeze({ ...options.target }) as T;
  const targetRealm = text(target.access.realmId);
  const maxResults = options.maxResults ?? 100;
  if (
    !Number.isSafeInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > 1000
  ) {
    throw new Error("Invalid Auth Console result limit");
  }
  const info =
    options.info === undefined
      ? undefined
      : Object.freeze({
          realm: text(options.info.realm),
          source: text(options.info.source),
          policy: text(options.info.policy),
        });
  const list = sessions?.list?.bind(sessions);
  const read = sessions?.read?.bind(sessions);
  const revoke = sessions?.revoke?.bind(sessions);
  const page = administration?.list.bind(administration);
  const get = administration?.get.bind(administration);
  const adminRevoke = administration?.revoke.bind(administration);
  const directory = subjects?.list.bind(subjects);
  const capabilities: AuthConsoleCapabilities = Object.freeze({
    info: info !== undefined,
    sessionList: list !== undefined || page !== undefined,
    sessionDetail: read !== undefined || get !== undefined,
    sessionRevoke: revoke !== undefined || adminRevoke !== undefined,
    subjects: directory !== undefined,
  });
  async function authorize(
    evidence: E,
    action: AuthConsoleAction,
    signal = new AbortController().signal,
    sessionId?: string
  ) {
    signal.throwIfAborted();
    const actor = await staff.required(evidence, { signal });
    const resource = {
      target,
      action,
      ...(sessionId === undefined ? {} : { sessionId }),
    };
    await staff.enforce(
      actor,
      resource,
      ({ principal, signal: policySignal }) =>
        policy({ actor: principal, ...resource, signal: policySignal }),
      { signal }
    );
    signal.throwIfAborted();
    return { actor, target, signal };
  }
  function bounded(value: readonly unknown[]): readonly unknown[] {
    if (!Array.isArray(value) || value.length > maxResults) {
      throw new Error("Auth Console result limit exceeded");
    }
    return value;
  }
  function validateSession(value: unknown, id?: string) {
    const dto = sessionDTO(value, administration !== undefined);
    if (dto.realmId !== targetRealm || (id !== undefined && dto.id !== id)) {
      throw new Error("Invalid Auth Console target output");
    }
    return dto;
  }
  return Object.freeze({
    capabilities,
    ...(info === undefined
      ? {}
      : {
          async info(evidence: E, signal?: AbortSignal) {
            await authorize(evidence, "info", signal);
            return info;
          },
        }),
    ...(list === undefined
      ? {}
      : {
          async listSessions(evidence: E, signal?: AbortSignal) {
            const context = await authorize(evidence, "sessions.list", signal);
            const rows = await list(context);
            context.signal.throwIfAborted();
            const result = bounded(rows).map((row) => validateSession(row));
            await authorize(evidence, "sessions.list", context.signal);
            return result;
          },
        }),
    ...(page === undefined
      ? {}
      : {
          async listSessionPage(
            evidence: E,
            input: SessionPageInput = {},
            signal?: AbortSignal
          ) {
            const limit = input.limit ?? maxResults;
            if (
              !Number.isSafeInteger(limit) ||
              limit < 1 ||
              limit > maxResults
            ) {
              throw new Error("Invalid Auth Console page limit");
            }
            const cursor =
              input.cursor === undefined ? undefined : text(input.cursor);
            const context = await authorize(evidence, "sessions.list", signal);
            const result = await page(
              { limit, ...(cursor === undefined ? {} : { cursor }) },
              context.actor,
              { signal: context.signal }
            );
            context.signal.throwIfAborted();
            const rows = bounded(result.sessions);
            if (rows.length > limit) {
              throw new Error("Auth Console result limit exceeded");
            }
            const nextCursor =
              result.nextCursor === null ? null : text(result.nextCursor);
            const dto = {
              sessions: rows.map((row) => validateSession(row)),
              nextCursor,
            };
            await authorize(evidence, "sessions.list", context.signal);
            return dto;
          },
        }),
    ...(read === undefined && get === undefined
      ? {}
      : {
          async readSession(evidence: E, id: string, signal?: AbortSignal) {
            text(id);
            const context = await authorize(
              evidence,
              "sessions.read",
              signal,
              id
            );
            const row = get
              ? await get({ id }, context.actor, { signal: context.signal })
              : await read!(id, context);
            context.signal.throwIfAborted();
            const result = row === null ? null : validateSession(row, id);
            await authorize(evidence, "sessions.read", context.signal, id);
            return result;
          },
        }),
    ...(revoke === undefined && adminRevoke === undefined
      ? {}
      : {
          async revokeSession(
            evidence: E,
            id: string,
            signal?: AbortSignal,
            expectedRevision?: number
          ) {
            text(id);
            const expected = adminRevoke
              ? revision(expectedRevision)
              : undefined;
            const context = await authorize(
              evidence,
              "sessions.revoke",
              signal,
              id
            );
            const result = adminRevoke
              ? await adminRevoke(
                  { id, expectedRevision: expected! },
                  context.actor,
                  { signal: context.signal }
                )
              : { revoked: await revoke!(id, context) };
            const { revoked } = result;
            if (typeof revoked !== "boolean") {
              throw new TypeError("Invalid Auth Console output");
            }
            return {
              revoked,
              ...("intentId" in result
                ? { intentId: text(result.intentId) }
                : {}),
            };
          },
        }),
    ...(directory === undefined
      ? {}
      : {
          async listSubjects(evidence: E, signal?: AbortSignal) {
            const context = await authorize(evidence, "subjects.list", signal);
            const rows = await directory(context);
            context.signal.throwIfAborted();
            const result = bounded(rows).map((row) => {
              const dto = subjectDTO(row);
              if (dto.realmId !== targetRealm) {
                throw new Error("Invalid Auth Console target output");
              }
              return dto;
            });
            await authorize(evidence, "subjects.list", context.signal);
            return result;
          },
        }),
  });
}
