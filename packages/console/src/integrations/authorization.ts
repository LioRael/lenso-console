import type { Actor, Policy, PolicyContext } from "@lenso/auth";
import {
  AuthorizationError,
  createAuthorization,
  rbacPolicy,
  type Authorization,
  type AuthorizationOptions,
  type Awaitable,
  type Request as AuthorizationRequest,
  type Resource,
  type RoleGraph,
  type RoleStore,
  type Scope,
} from "@lenso/authorization";
import type { AuthorizationInspection } from "@lenso/authorization/manage";
import { definePlugin, type Plugin } from "@lenso/core/plugin";
import type { EngineDiagnostic } from "@lenso/engine/diagnostics";
import { defineOperation } from "@lenso/engine/operations";
import { defineManage } from "@lenso/manage";
import { z } from "zod";

import type { ConsoleAuthentication, ConsoleResource } from "../types";
import {
  enforceConsoleSecurityInvocation,
  type ConsoleSecurityInvocation,
} from "./invocation";

export {
  enforceConsoleSecurityInvocation,
  type ConsoleSecurityInvocation,
} from "./invocation";

/** Auth calls this only after its existing actor, audience and membership enforcement. */
export function createConsoleAuthorizationPolicy<
  Realm extends string,
  Kind extends string,
  Audience extends string,
  M,
  A extends string,
  R extends Resource,
  C,
>(options: {
  readonly authorization: Authorization<A, R, C>;
  /** Host owns caller namespace, business subject, action and exact resource scope. */
  readonly map: (
    verified: PolicyContext<Actor<Realm, Kind, Audience>, ConsoleResource, M>
  ) => Awaitable<AuthorizationRequest<A, R, C>>;
}): Policy<PolicyContext<Actor<Realm, Kind, Audience>, ConsoleResource, M>> {
  return async (verified) => {
    verified.signal.throwIfAborted();
    const request = await options.map(
      Object.freeze({
        ...verified,
        resource: structuredClone(verified.resource),
        membership: structuredClone(verified.membership),
      })
    );
    verified.signal.throwIfAborted();
    return options.authorization.can(request, { signal: verified.signal });
  };
}

/** Exact-scope RBAC is the default allow source; extensions retain deny precedence. */
export function createConsoleScopedAuthorization<
  A extends string,
  R extends Resource,
  C,
>(
  options: AuthorizationOptions<A, R, C> & {
    readonly rbac:
      | { readonly store: RoleStore<A>; readonly graph?: never }
      | { readonly graph: RoleGraph<A>; readonly store?: never };
  }
): Authorization<A, R, C> {
  return createAuthorization({
    ...options,
    policies: [
      rbacPolicy<A, R, C>({ ...options.rbac, actions: options.actions }),
      ...(options.policies ?? []),
    ],
  });
}

export function consoleAuthorizationError(
  error: unknown
): EngineDiagnostic | undefined {
  if (!(error instanceof AuthorizationError)) {
    return undefined;
  }
  return {
    code: "denied",
    phase: "invoke",
    message: "Authorization operation denied",
  };
}

export function createConsoleAuthorizationManage<C, A extends string>(options: {
  readonly id: string;
  readonly inspection: Plugin<AuthorizationInspection<C, A>>;
  readonly authentication: Plugin<ConsoleAuthentication>;
  readonly map: (
    invocation: ConsoleSecurityInvocation
  ) => Awaitable<{ caller: C; scope: Scope }>;
}) {
  const plugin = definePlugin({
    id: options.id,
    requires: [options.inspection, options.authentication],
    setup(context) {
      const inspection = context.get(options.inspection);
      const auth = context.get(options.authentication);
      return {
        async inspect(
          _input: Record<string, never>,
          invocation: ConsoleSecurityInvocation
        ) {
          await enforceConsoleSecurityInvocation(
            auth,
            invocation,
            options.id,
            "inspect"
          );
          const bound = await options.map(invocation);
          await enforceConsoleSecurityInvocation(
            auth,
            invocation,
            options.id,
            "inspect"
          );
          return inspection.inspect(bound.scope, bound.caller, {
            now: Date.now(),
            signal: invocation.request.signal,
          });
        },
      };
    },
  });
  const operations = [
    defineOperation({
      plugin,
      method: "inspect",
      input: z.object({}).strict(),
      context: true,
      mapError: consoleAuthorizationError,
      effect: "read",
      retry: "safe",
      cancellation: "cooperative",
      description:
        "Read roles and bindings in the host-selected authorized scope.",
    }),
  ];
  return { plugin, operations, manage: defineManage({ plugin, operations }) };
}
