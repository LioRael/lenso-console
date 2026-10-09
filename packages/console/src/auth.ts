import {
  AuthError,
  type Access,
  type Actor,
  type Policy,
  type PolicyContext,
} from "@lenso/auth";
import {
  definePlugin,
  type Plugin,
  type PluginContext,
} from "@lenso/core/plugin";

import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleResource,
} from "./types";

const errors = {
  bad_request: [400, "Invalid Console request"],
  unauthorized: [401, "Authentication required"],
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
  if (error instanceof AuthError) {
    if (error.code === "FORBIDDEN") {
      return new ConsoleRequestError("forbidden");
    }
    if (
      error.code === "UNAUTHORIZED" ||
      error.code === "REAUTHENTICATION_REQUIRED"
    ) {
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

export interface ConsoleRequestPolicy {
  readonly origin: string;
  readonly credentialMode: "bearer" | "cookie";
  readonly sessionCookieName?: `__Host-${string}`;
  readonly csrfCookieName?: `__Host-${string}`;
}

function cookie(request: Request, name: string): string | null {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.split("=")[0] === name);
  if (matches.length > 1) {
    throw new ConsoleRequestError("bad_request");
  }
  if (!matches.length) {
    return null;
  }
  const value = matches[0]!.slice(name.length + 1);
  if (
    !matches[0]!.startsWith(`${name}=`) ||
    !value ||
    /[\s,;]/u.test(value) ||
    hasControlCharacter(value)
  ) {
    throw new ConsoleRequestError("bad_request");
  }
  return value;
}

function singleHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  if (
    value !== null &&
    (!value || /[,]/u.test(value) || hasControlCharacter(value))
  ) {
    throw new ConsoleRequestError("bad_request");
  }
  return value;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || code === 0x7f;
  });
}

export function expectedConsoleSubject(request: Request): string | null {
  const subject = singleHeader(request, "x-lenso-expected-subject");
  if (subject !== null && (!subject.trim() || subject.length > 256)) {
    throw new ConsoleRequestError("bad_request");
  }
  return subject;
}

function names(policy: ConsoleRequestPolicy) {
  if (
    policy.credentialMode !== "bearer" &&
    policy.credentialMode !== "cookie"
  ) {
    throw new TypeError(
      "Console requires explicit bearer or cookie credential selection"
    );
  }
  const session = policy.sessionCookieName ?? "__Host-lenso-session";
  const csrf = policy.csrfCookieName ?? "__Host-lenso-csrf";
  if (
    ![session, csrf].every((name) => /^__Host-[A-Za-z0-9_-]+$/.test(name)) ||
    session === csrf
  ) {
    throw new TypeError("Console requires distinct __Host cookie names");
  }
  return { session, csrf };
}

/** Transport must also call this for matched public shell/assets before dispatch. */
export function requireConsoleRequest(
  request: Request,
  policy: ConsoleRequestPolicy
): void {
  request.signal.throwIfAborted();
  const configured = new URL(policy.origin);
  if (
    configured.origin !== policy.origin ||
    !["http:", "https:"].includes(configured.protocol)
  ) {
    throw new TypeError("Console requires an exact HTTP origin");
  }
  const url = new URL(request.url);
  const host = singleHeader(request, "host");
  const origin = singleHeader(request, "origin");
  if (
    url.origin !== configured.origin ||
    (host !== null && host !== configured.host) ||
    (origin !== null && origin !== configured.origin)
  ) {
    throw new ConsoleRequestError("forbidden");
  }
  const selected = names(policy);
  const session = cookie(request, selected.session);
  const csrf = cookie(request, selected.csrf);
  const authorization = singleHeader(request, "authorization");
  const csrfHeader = singleHeader(request, "x-csrf-token");
  expectedConsoleSubject(request);
  if (authorization !== null && !/^Bearer [^\s,]+$/i.test(authorization)) {
    throw new ConsoleRequestError("unauthorized");
  }
  if (
    (authorization !== null && session !== null) ||
    (policy.credentialMode === "cookie" && authorization !== null) ||
    (policy.credentialMode === "bearer" && session !== null)
  ) {
    throw new ConsoleRequestError("bad_request");
  }
  if (
    policy.credentialMode === "cookie" &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    (origin !== configured.origin ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      csrf === null ||
      csrfHeader === null ||
      csrf !== csrfHeader)
  ) {
    throw new ConsoleRequestError("forbidden");
  }
}

export interface ConsoleLoginMethod {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly action: string;
}

export interface ConsoleBrowserAuthAdapter {
  readonly methodsPath: string;
  readonly methods: readonly ConsoleLoginMethod[];
  /** Optional host discovery/bootstrap owner; its response, including cookies, is untouched. */
  readonly discover?: (request: Request) => Promise<Response>;
  /** Real host-owned login/logout/renew handlers, mounted explicitly, never synthesized. */
  readonly handlers: readonly {
    readonly path: string;
    readonly method: string;
    readonly authenticated?: boolean;
    readonly handle: (request: Request) => Promise<Response>;
  }[];
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
  readonly requestPolicy: ConsoleRequestPolicy;
  readonly evidence: (request: Request) => E | Promise<E>;
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
  readonly browser?: ConsoleBrowserAuthAdapter;
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
  const requestPolicy = Object.freeze({ ...options.requestPolicy });
  names(requestPolicy);
  const origin = new URL(requestPolicy.origin);
  if (
    origin.origin !== requestPolicy.origin ||
    !["http:", "https:"].includes(origin.protocol)
  ) {
    throw new TypeError("Console requires an exact HTTP origin");
  }
  const methodsPath =
    options.browser?.methodsPath ?? options.methodsPath ?? "/auth/methods";
  const handlers =
    options.browser?.handlers.map((handler) => Object.freeze({ ...handler })) ??
    [];
  const methods =
    options.browser?.methods.map((method) => Object.freeze({ ...method })) ??
    [];
  const paths = [methodsPath, ...handlers.map((handler) => handler.path)];
  if (
    paths.some(
      (path) =>
        !path.startsWith("/") ||
        path.startsWith("//") ||
        new URL(path, origin).pathname !== path
    )
  ) {
    throw new TypeError("Auth mounts require exact local paths");
  }
  if (
    handlers.some(
      (handler, index) =>
        handler.path === methodsPath ||
        handlers
          .slice(0, index)
          .some(
            (other) =>
              other.path === handler.path && other.method === handler.method
          )
    )
  ) {
    throw new TypeError("Duplicate auth mount");
  }
  if (
    methods.some(
      (method) => !handlers.some((handler) => handler.path === method.action)
    )
  ) {
    throw new TypeError("Login methods require a mounted host handler");
  }
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
    admit(request) {
      requireConsoleRequest(request, requestPolicy);
    },
    hasCredentials(request) {
      return (
        request.headers.has("authorization") ||
        cookie(request, names(requestPolicy).session) !== null
      );
    },
    async authenticate(request) {
      return guarded(request, async () => {
        requireConsoleRequest(request, requestPolicy);
        const actor = await options.access.required(
          await options.evidence(request),
          { signal: request.signal }
        );
        const expected = expectedConsoleSubject(request);
        if (expected !== null && expected !== actor.subjectId) {
          throw new ConsoleRequestError("session_changed");
        }
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
        const readScope = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("");
        const identity = Object.freeze({ actor, readScope });
        issued.set(identity, { actor, request });
        return identity;
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
    async session(identity) {
      let stored: ReturnType<typeof proof>;
      try {
        stored = proof(identity);
      } catch (error) {
        throw safeError(error);
      }
      return guarded(stored.request, async () => {
        const current = await options.access.required(
          await options.evidence(stored.request),
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
      const path = new URL(request.url).pathname;
      if (!paths.includes(path)) {
        return undefined;
      }
      return guarded(request, async () => {
        requireConsoleRequest(request, requestPolicy);
        if (path === methodsPath && request.method === "GET") {
          if (options.browser?.discover) {
            return options.browser.discover(request);
          }
          return Response.json(
            {
              methods,
              ...(requestPolicy.credentialMode === "cookie"
                ? {
                    csrf: {
                      cookie_name: names(requestPolicy).csrf,
                      header_name: "x-csrf-token",
                    },
                  }
                : {}),
            },
            { headers: { "cache-control": "no-store" } }
          );
        }
        const handler = handlers.find(
          (entry) => entry.path === path && entry.method === request.method
        );
        if (!handler) {
          return new Response(null, { status: 405 });
        }
        if (
          !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
          (request.headers.get("origin") !== requestPolicy.origin ||
            request.headers.get("sec-fetch-site") === "cross-site")
        ) {
          throw new ConsoleRequestError("forbidden");
        }
        // Even public login handlers must check an expected subject if the caller supplies one.
        if (handler.authenticated || expectedConsoleSubject(request) !== null) {
          await service.authenticate(request);
        }
        return handler.handle(request);
      });
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
