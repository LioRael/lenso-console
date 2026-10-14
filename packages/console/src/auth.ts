import {
  AuthError,
  type Access,
  type Actor,
  type Policy,
  type PolicyContext,
  type ReadOnlyScope,
} from "@lenso/auth";
import {
  AuthHttpError,
  createAuthHttpBinding,
  expectedAuthSubject,
  requireAuthRequest,
  type AuthHttpBinding,
  type AuthRequestPolicy,
} from "@lenso/auth/http";
import {
  definePlugin,
  type Plugin,
  type PluginContext,
} from "@lenso/core/plugin";

import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleReadScope,
  ConsoleResource,
} from "./types";

export type { LoginMethod as ConsoleLoginMethod } from "@lenso/auth/browser";

const errors = {
  bad_request: [400, "Invalid Console request"],
  unauthorized: [401, "Authentication required"],
  session_expired: [401, "Session expired"],
  forbidden: [403, "Access denied"],
  session_changed: [412, "Session changed"],
  service_unavailable: [503, "Authentication unavailable"],
} as const;

export class ConsoleRequestError extends Error {
  readonly status: number;
  readonly code: keyof typeof errors;
  constructor(code: keyof typeof errors) {
    super(errors[code][1]);
    this.name = "ConsoleRequestError";
    this.code = code;
    const [status] = errors[code];
    this.status = status;
  }
}

function safeError(error: unknown): ConsoleRequestError {
  if (error instanceof ConsoleRequestError) {
    return error;
  }
  if (error instanceof AuthHttpError) {
    return new ConsoleRequestError(error.code);
  }
  if (error instanceof AuthError) {
    if (error.code === "FORBIDDEN") {
      return new ConsoleRequestError("forbidden");
    }
    if (error.code === "REAUTHENTICATION_REQUIRED") {
      return new ConsoleRequestError("session_expired");
    }
    if (error.code === "UNAUTHORIZED") {
      return new ConsoleRequestError("unauthorized");
    }
  }
  return new ConsoleRequestError("service_unavailable");
}

/** Cancellation remains the caller's reason, not an HTTP authentication failure. */
export function consoleRequestErrorResponse(
  error: unknown,
  signal?: AbortSignal
): Response {
  signal?.throwIfAborted();
  const safe = safeError(error);
  return Response.json(
    { code: safe.code, message: safe.message },
    {
      status: safe.status,
      headers: { "cache-control": "no-store" },
    }
  );
}

export type ConsoleRequestPolicy = AuthRequestPolicy;

export function expectedConsoleSubject(request: Request): string | null {
  try {
    return expectedAuthSubject(request);
  } catch (error) {
    throw safeError(error);
  }
}

/** Transport must also call this for matched public shell/assets before dispatch. */
export function requireConsoleRequest(
  request: Request,
  policy: ConsoleRequestPolicy
): void {
  try {
    requireAuthRequest(request, policy);
  } catch (error) {
    request.signal.throwIfAborted();
    throw safeError(error);
  }
}

export interface ConsoleAuthenticationOptions<
  R extends string,
  E,
  S extends string,
  A extends string,
  M,
> {
  readonly access: Access<R, E, S, A, ConsoleResource, M>;
  readonly policy: Policy<PolicyContext<Actor<R, S, A>, ConsoleResource, M>>;
  /** The designated Auth instance owns transport and interactive capabilities. */
  readonly binding?: AuthHttpBinding<R, E, A>;
  /** Verification-only compatibility configuration; no interactive host handlers. */
  readonly requestPolicy?: ConsoleRequestPolicy;
  readonly evidence?: (request: Request) => E | Promise<E>;
  /** Safe permission revision only. Never return credentials, session IDs or tokens. */
  readonly permissionRevision: (
    actor: Actor<R, S, A>,
    request: Request
  ) => string | Promise<string>;
  readonly session: (
    actor: Actor<R, S, A>,
    context: { signal: AbortSignal }
  ) =>
    | { administrator: boolean; workspace_ids: readonly string[] }
    | Promise<{ administrator: boolean; workspace_ids: readonly string[] }>;
  /** Strict entry-actor projection; exact session policies run through this scope. */
  readonly sessionRead?: (
    actor: Actor<R, S, A>,
    context: { signal: AbortSignal; scope: ConsoleReadScope }
  ) =>
    | { administrator: boolean; workspace_ids: readonly string[] }
    | Promise<{ administrator: boolean; workspace_ids: readonly string[] }>;
  /** Empty discovery still permits explicitly configured standalone bearer clients. */
  readonly methodsPath?: string;
}

export function createConsoleAuthentication<
  R extends string,
  E,
  S extends string,
  A extends string,
  M,
>(options: ConsoleAuthenticationOptions<R, E, S, A, M>): ConsoleAuthentication {
  const issued = new WeakMap<
    ConsoleIdentity,
    { actor: Actor<R, S, A>; request: Request }
  >();
  if (!options.binding && (!options.requestPolicy || !options.evidence)) {
    throw new TypeError("Console requires a designated Auth binding");
  }
  if (
    options.binding &&
    (options.requestPolicy || options.evidence || options.methodsPath)
  ) {
    throw new TypeError(
      "Configure credentials on the designated Auth binding only"
    );
  }
  const binding =
    options.binding ??
    createAuthHttpBinding({
      access: options.access,
      requestPolicy: options.requestPolicy!,
      evidence: options.evidence!,
      methodsPath: options.methodsPath ?? "/auth/methods",
      returnRoots: ["/console"],
    });
  binding.assertAccess(options.access);
  async function guarded<T>(
    request: Request,
    work: () => Promise<T>
  ): Promise<T> {
    try {
      request.signal.throwIfAborted();
      const value = await work();
      request.signal.throwIfAborted();
      return value;
    } catch (error) {
      request.signal.throwIfAborted();
      throw safeError(error);
    }
  }
  function proof(identity: ConsoleIdentity) {
    const stored = issued.get(identity);
    if (!stored || identity.actor !== stored.actor) {
      throw new AuthError("UNAUTHORIZED");
    }
    return stored;
  }
  const reads = new WeakMap<
    ConsoleReadScope,
    {
      identity: ConsoleIdentity;
      request: Request;
      authenticationScope: ReadOnlyScope<R, S, A>;
    }
  >();
  function readProof(scope: ConsoleReadScope, identity?: ConsoleIdentity) {
    const stored = reads.get(scope);
    if (!stored || (identity && stored.identity !== identity)) {
      throw new AuthError("UNAUTHORIZED");
    }
    stored.request.signal.throwIfAborted();
    return stored;
  }
  async function makeIdentity(
    actor: Actor<R, S, A>,
    request: Request
  ): Promise<ConsoleIdentity> {
    const revision = await options.permissionRevision(actor, request);
    if (typeof revision !== "string") {
      throw new ConsoleRequestError("service_unavailable");
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify([
          actor.realmId,
          actor.subjectId,
          actor.audience,
          revision,
        ])
      )
    );
    const identity = Object.freeze({
      actor,
      readScope: Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join(""),
    });
    issued.set(identity, { actor, request });
    return identity;
  }
  async function authorize(
    identity: ConsoleIdentity,
    resource: ConsoleResource
  ) {
    const { actor, request } = proof(identity);
    return options.access.enforce(actor, resource, options.policy, {
      signal: request.signal,
    });
  }
  const service: ConsoleAuthentication & { admit(request: Request): void } = {
    httpPaths: Object.freeze({
      discovery: binding.methodsPath,
      owned: Object.freeze(binding.routes.map((route) => route.path)),
    }),
    admit(request) {
      try {
        binding.admit(request);
      } catch (error) {
        throw safeError(error);
      }
    },
    hasCredentials(request) {
      return binding.hasCredentials(request);
    },
    async authenticate(request) {
      return guarded(request, async () => {
        binding.admit(request);
        const actor = await options.access.required(
          await binding.evidence(request),
          { signal: request.signal }
        );
        const expected = expectedConsoleSubject(request);
        if (expected !== null && expected !== actor.subjectId) {
          throw new ConsoleRequestError("session_changed");
        }
        return makeIdentity(actor, request);
      });
    },
    async enforce(identity, resource) {
      try {
        await authorize(identity, resource);
      } catch (error) {
        issued.get(identity)?.request.signal.throwIfAborted();
        throw safeError(error);
      }
    },
    async can(identity, resource) {
      try {
        await authorize(identity, resource);
        return true;
      } catch (error) {
        issued.get(identity)?.request.signal.throwIfAborted();
        if (
          error instanceof AuthError &&
          (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")
        ) {
          return false;
        }
        throw safeError(error);
      }
    },
    async canDispatch(identity, visibility, invocation) {
      try {
        const { actor, request } = proof(identity);
        if (
          visibility.action !== "list" ||
          invocation.action !== "invoke" ||
          (
            [
              "targetId",
              "tenantId",
              "pluginId",
              "operation",
              "mountId",
            ] as const
          ).some((key) => visibility[key] !== invocation[key])
        ) {
          throw new AuthError("FORBIDDEN");
        }
        const resources = Object.freeze([
          Object.freeze({ ...visibility }),
          Object.freeze({ ...invocation }),
        ]);
        const access = options.access as typeof options.access & {
          enforceAll?(
            principal: typeof actor,
            resources: readonly ConsoleResource[],
            policy: typeof options.policy,
            verification: { signal: AbortSignal }
          ): Promise<unknown>;
        };
        if (access.enforceAll) {
          await access.enforceAll(actor, resources, options.policy, {
            signal: request.signal,
          });
        } else {
          for (const resource of resources) {
            await authorize(identity, resource);
          }
        }
        return true;
      } catch (error) {
        issued.get(identity)?.request.signal.throwIfAborted();
        if (
          error instanceof AuthError &&
          (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")
        ) {
          return false;
        }
        throw safeError(error);
      }
    },
    ...(options.access.beginRead && options.access.enforceRead
      ? {
          async beginRead(identity: ConsoleIdentity, request: Request) {
            const stored = proof(identity);
            if (stored.request !== request) {
              throw new ConsoleRequestError("unauthorized");
            }
            return guarded(request, async () => {
              const authenticationScope = await options.access.beginRead!(
                stored.actor,
                { signal: request.signal }
              );
              const scope = Object.freeze({ authenticationScope });
              reads.set(scope, { identity, request, authenticationScope });
              return scope;
            });
          },
          async enforceRead(
            identity: ConsoleIdentity,
            resource: ConsoleResource,
            scope: ConsoleReadScope
          ) {
            const { request, authenticationScope } = readProof(scope, identity);
            await guarded(request, async () => {
              await options.access.enforceRead!(
                authenticationScope,
                Object.freeze({ ...resource }),
                options.policy,
                { signal: request.signal }
              );
            });
          },
          async canRead(
            identity: ConsoleIdentity,
            resource: ConsoleResource,
            scope: ConsoleReadScope
          ) {
            try {
              await service.enforceRead!(identity, resource, scope);
              return true;
            } catch (error) {
              if (
                error instanceof ConsoleRequestError &&
                (error.code === "unauthorized" || error.code === "forbidden")
              ) {
                return false;
              }
              throw error;
            }
          },
          async canDispatchRead(
            identity: ConsoleIdentity,
            visibility: ConsoleResource,
            invocation: ConsoleResource,
            scope: ConsoleReadScope
          ) {
            if (
              visibility.action !== "list" ||
              invocation.action !== "invoke" ||
              (
                [
                  "targetId",
                  "tenantId",
                  "pluginId",
                  "operation",
                  "mountId",
                ] as const
              ).some((key) => visibility[key] !== invocation[key])
            ) {
              return false;
            }
            if (!(await service.canRead!(identity, visibility, scope))) {
              return false;
            }
            return service.canRead!(identity, invocation, scope);
          },
          ...(options.sessionRead
            ? {
                async sessionRead(
                  identity: ConsoleIdentity,
                  scope: ConsoleReadScope
                ) {
                  const { request, authenticationScope } = readProof(
                    scope,
                    identity
                  );
                  if (
                    "consistency" in authenticationScope &&
                    authenticationScope.consistency !== "before-disclosure"
                  )
                    throw new ConsoleRequestError("service_unavailable");
                  return guarded(request, async () => {
                    const projection = await options.sessionRead!(
                      proof(identity).actor,
                      { signal: request.signal, scope }
                    );
                    readProof(scope, identity);
                    if (
                      typeof projection.administrator !== "boolean" ||
                      !Array.isArray(projection.workspace_ids) ||
                      projection.workspace_ids.some(
                        (id) => typeof id !== "string"
                      )
                    )
                      throw new ConsoleRequestError("service_unavailable");
                    return {
                      administrator: projection.administrator,
                      workspace_ids: [...projection.workspace_ids],
                    };
                  });
                },
              }
            : {}),
          async finishRead(scope: ConsoleReadScope) {
            const { request, authenticationScope } = readProof(scope);
            try {
              return await guarded(request, async () =>
                makeIdentity(await authenticationScope.finish(), request)
              );
            } finally {
              reads.delete(scope);
            }
          },
          closeRead(scope: ConsoleReadScope) {
            reads.get(scope)?.authenticationScope.close();
            reads.delete(scope);
          },
        }
      : {}),
    async session(identity) {
      let stored: ReturnType<typeof proof>;
      try {
        stored = proof(identity);
      } catch (error) {
        throw safeError(error);
      }
      return guarded(stored.request, async () => {
        const current = await options.access.required(
          await binding.evidence(stored.request),
          { signal: stored.request.signal }
        );
        if (
          current.subjectId !== stored.actor.subjectId ||
          current.kind !== stored.actor.kind
        ) {
          throw new ConsoleRequestError("session_changed");
        }
        const projection = await options.session(stored.actor, {
          signal: stored.request.signal,
        });
        if (
          typeof projection.administrator !== "boolean" ||
          !Array.isArray(projection.workspace_ids) ||
          projection.workspace_ids.some((id) => typeof id !== "string")
        ) {
          throw new ConsoleRequestError("service_unavailable");
        }
        return {
          administrator: projection.administrator,
          workspace_ids: [...projection.workspace_ids],
        };
      });
    },
    async fetch(request) {
      return guarded(request, () => binding.fetch(request));
    },
  };
  return Object.freeze(service);
}

export function createConsoleAuthPlugin<
  T,
  R extends string,
  E,
  S extends string,
  A extends string,
  M,
>(options: {
  readonly id: string;
  readonly auth: Plugin<T>;
  readonly configure: (
    auth: T,
    context: PluginContext
  ) =>
    | ConsoleAuthenticationOptions<R, E, S, A, M>
    | Promise<ConsoleAuthenticationOptions<R, E, S, A, M>>;
}): Plugin<ConsoleAuthentication> {
  return definePlugin({
    id: options.id,
    requires: [options.auth],
    async setup(context) {
      return createConsoleAuthentication(
        await options.configure(context.get(options.auth), context)
      );
    },
  });
}
