import { ApiKeyError, type ApiKeys, type KeySubject } from "@lenso/api-keys";
import { definePlugin, type Plugin } from "@lenso/core/plugin";
import type { EngineDiagnostic } from "@lenso/engine/diagnostics";
import { defineOperation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import { z } from "zod";

import { ConsoleRequestError, consoleRequestErrorResponse } from "../auth";
import { readRequestBytes } from "../request-body";
import type {
  ConsoleAuthentication,
  ConsoleIdentity,
  ConsoleResource,
} from "../types";
import {
  enforceConsoleSecurityInvocation,
  type ConsoleSecurityInvocation,
} from "./invocation";

const identifier = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !!value.trim());
const query = z.object({ id: identifier }).strict();
const list = z
  .object({
    after: identifier.optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export const consoleIssueKeySchema = z
  .object({
    requestedScopes: z.array(identifier).max(128),
    expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    requestId: identifier,
  })
  .strict();
export const consoleRotateKeySchema = z
  .object({
    id: identifier,
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    overlapMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export interface ConsoleApiKeyBinding<C> {
  readonly caller: C;
  readonly subject: KeySubject;
}

export function consoleApiKeyError(
  error: unknown
): EngineDiagnostic | undefined {
  if (!(error instanceof ApiKeyError)) {
    return undefined;
  }
  return {
    code: {
      INVALID_INPUT: "invalid-input",
      FORBIDDEN: "forbidden",
      CONFLICT: "conflict",
      UNAVAILABLE: "service-unavailable",
    }[error.code],
    phase: "invoke",
    message: "API key operation failed",
  };
}

/** Scoped thin adapter: the browser can select a key, never its subject partition. */
export function createConsoleApiKeyManage<C, R>(options: {
  readonly id: string;
  readonly keys: Plugin<ApiKeys<C, R>>;
  readonly authentication: Plugin<ConsoleAuthentication>;
  readonly map: (
    invocation: ConsoleSecurityInvocation
  ) => ConsoleApiKeyBinding<C> | Promise<ConsoleApiKeyBinding<C>>;
  /** Service safety only, not a permission grant. Also select this revoke in Console.canWrite. */
  readonly canRevoke: (resource: ConsoleResource) => boolean;
}) {
  const plugin = definePlugin({
    id: options.id,
    requires: [options.keys, options.authentication],
    setup(context) {
      const keys = context.get(options.keys);
      const auth = context.get(options.authentication);
      async function bind(
        invocation: ConsoleSecurityInvocation,
        operation: string
      ) {
        await enforceConsoleSecurityInvocation(
          auth,
          invocation,
          options.id,
          operation
        );
        if (
          operation === "revoke" &&
          options.canRevoke(invocation.resource) !== true
        ) {
          throw new ConsoleRequestError("forbidden");
        }
        const binding = await options.map(invocation);
        await enforceConsoleSecurityInvocation(
          auth,
          invocation,
          options.id,
          operation
        );
        if (
          operation === "revoke" &&
          options.canRevoke(invocation.resource) !== true
        ) {
          throw new ConsoleRequestError("forbidden");
        }
        return binding;
      }
      return {
        async list(
          input: z.infer<typeof list>,
          invocation: ConsoleSecurityInvocation
        ) {
          const { subject, caller } = await bind(invocation, "list");
          return keys.list({ ...input, subject }, caller);
        },
        async read(
          input: z.infer<typeof query>,
          invocation: ConsoleSecurityInvocation
        ) {
          const { subject, caller } = await bind(invocation, "read");
          return keys.read({ ...input, subject }, caller);
        },
        async revoke(
          input: z.infer<typeof query>,
          invocation: ConsoleSecurityInvocation
        ) {
          const { subject, caller } = await bind(invocation, "revoke");
          return keys.revoke({ ...input, subject }, caller);
        },
      };
    },
  });
  const operations = [
    defineOperation({
      plugin,
      method: "list",
      input: list,
      context: true,
      effect: "read",
      mapError: consoleApiKeyError,
      retry: "safe",
      cancellation: "none",
      description: "List authorized API key metadata.",
    }),
    defineOperation({
      plugin,
      method: "read",
      input: query,
      context: true,
      effect: "read",
      mapError: consoleApiKeyError,
      retry: "safe",
      cancellation: "none",
      description: "Read authorized API key metadata.",
    }),
    defineOperation({
      plugin,
      method: "revoke",
      input: query,
      context: true,
      effect: "write",
      mapError: consoleApiKeyError,
      destructive: true,
      retry: "safe",
      cancellation: "none",
      description: "Revoke an authorized key and its overlapping predecessor.",
    }),
  ];
  return { plugin, operations, manage: defineManage({ plugin, operations }) };
}

/** No default path: the host owns and mounts these two exact routes before Console dispatch. */
export function createConsoleApiKeyCredentials<C, R>(options: {
  readonly keys: ApiKeys<C, R>;
  readonly authentication: ConsoleAuthentication;
  readonly issuePath: string;
  readonly rotatePath: string;
  readonly resource: (operation: "issue" | "rotate") => ConsoleResource;
  /** Resolve only trusted host facts; the request body is deliberately not provided. */
  readonly map: (
    identity: ConsoleIdentity,
    resource: ConsoleResource,
    request: Request
  ) => ConsoleApiKeyBinding<C> | Promise<ConsoleApiKeyBinding<C>>;
}) {
  const { issuePath, rotatePath } = options;
  const resources = Object.freeze({
    issue: Object.freeze({ ...options.resource("issue") }),
    rotate: Object.freeze({ ...options.resource("rotate") }),
  });
  for (const path of [issuePath, rotatePath]) {
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(path)) {
      throw new TypeError("Credential routes require exact local paths");
    }
  }
  if (issuePath === rotatePath) {
    throw new TypeError("Credential routes must be distinct");
  }
  const matches = (request: Request) =>
    [issuePath, rotatePath].includes(new URL(request.url).pathname);
  return Object.freeze({
    issuePath,
    rotatePath,
    resources,
    matches,
    async fetch(request: Request): Promise<Response | undefined> {
      if (!matches(request)) {
        return undefined;
      }
      try {
        const auth = options.authentication;
        auth.admit(request);
        if (request.method !== "POST") {
          return new Response(null, {
            status: 405,
            headers: { allow: "POST", "cache-control": "no-store" },
          });
        }
        const identity = await auth.authenticate(request);
        const operation =
          new URL(request.url).pathname === issuePath ? "issue" : "rotate";
        const resource = resources[operation];
        if (resource.action !== "invoke" || resource.operation !== operation) {
          throw new ConsoleRequestError("forbidden");
        }
        await auth.enforce(identity, resource);
        if (
          request.headers.get("content-type")?.split(";")[0]?.trim() !==
          "application/json"
        ) {
          throw new ConsoleRequestError("bad_request");
        }
        const body = await credentialInput(request);
        const schema =
          operation === "issue"
            ? consoleIssueKeySchema
            : consoleRotateKeySchema;
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          throw new ConsoleRequestError("bad_request");
        }
        const { caller, subject } = await options.map(
          identity,
          resource,
          request
        );
        await auth.enforce(identity, resource);
        request.signal.throwIfAborted();
        // ApiKeys enforces current management and delegation authority again in the service.
        const result =
          operation === "issue"
            ? await options.keys.issue(
                { ...consoleIssueKeySchema.parse(parsed.data), subject },
                caller
              )
            : await options.keys.rotate(
                { ...consoleRotateKeySchema.parse(parsed.data), subject },
                caller
              );
        request.signal.throwIfAborted();
        return Response.json(result, {
          headers: {
            "cache-control": "no-store",
            "x-lenso-read-scope": identity.readScope,
          },
        });
      } catch (error) {
        request.signal.throwIfAborted();
        if (error instanceof ApiKeyError) {
          return Response.json(
            { code: error.code },
            {
              status: {
                INVALID_INPUT: 400,
                FORBIDDEN: 403,
                CONFLICT: 409,
                UNAVAILABLE: 503,
              }[error.code],
              headers: { "cache-control": "no-store" },
            }
          );
        }
        return consoleRequestErrorResponse(error, request.signal);
      }
    },
  });
}

async function credentialInput(request: Request): Promise<unknown> {
  if (!request.body) {
    throw new ConsoleRequestError("bad_request");
  }
  const bytes = await readRequestBytes(
    request,
    32_768,
    () => new ConsoleRequestError("bad_request")
  );
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ConsoleRequestError("bad_request");
  }
}
