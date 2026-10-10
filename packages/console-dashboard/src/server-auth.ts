import type { Access, Actor, PolicyContext } from "@lenso/auth";

import type { DashboardStore } from "./contract";
import {
  createAuthorizedDashboardStore,
  DashboardForbiddenError,
  dashboardScopeKey,
  type DashboardAuthorization,
  type DashboardConfigDefinition,
  type DashboardRepository,
  type DashboardScope,
} from "./server";

export type DashboardOwnership = {
  applicationId: string;
  dashboardId: string;
  targetId?: string;
  tenantId?: string;
} & ({ kind: "personal" } | { kind: "organization"; organizationId: string });

export interface DashboardAuthResource {
  readonly scope: DashboardScope;
  readonly operation: "identity" | "read" | "write" | "widget" | "revision";
  readonly widget?: { readonly bindingId: string; readonly widgetId: string };
}

export interface DashboardAuthOptions<
  R extends string,
  E,
  S extends string,
  A extends string,
  M,
> {
  /** The exact audience-bound instance that issued the verified actor. */
  access: Access<R, E, S, A, DashboardAuthResource, M>;
  ownership: DashboardOwnership;
  policies: {
    read(
      context: PolicyContext<Actor<R, S, A>, DashboardAuthResource, M>
    ): boolean | Promise<boolean>;
    write(
      context: PolicyContext<Actor<R, S, A>, DashboardAuthResource, M>
    ): boolean | Promise<boolean>;
    widget(
      context: PolicyContext<Actor<R, S, A>, DashboardAuthResource, M>
    ): boolean | Promise<boolean>;
  };
  /** Trusted versions of every session, membership, graph and policy fact used above. */
  revision(
    context: PolicyContext<Actor<R, S, A>, DashboardAuthResource, M>
  ): string | Promise<string>;
}

export function createDashboardAuthAuthorization<
  R extends string,
  E,
  S extends string,
  A extends string,
  M,
>(
  options: DashboardAuthOptions<R, E, S, A, M>
): DashboardAuthorization<Actor<R, S, A> | null> {
  const ownership = Object.freeze({ ...options.ownership });
  const { access, revision: revisionProvider } = options;
  const policies = { ...options.policies };
  function scopeFor(actor: Actor<R, S, A>): DashboardScope {
    return ownership.kind === "personal"
      ? { ...ownership, realmId: actor.realmId, ownerSubject: actor.subjectId }
      : { ...ownership };
  }
  async function enforce(
    actor: Actor<R, S, A> | null,
    operation: DashboardAuthResource["operation"],
    scope?: DashboardScope,
    widget?: DashboardAuthResource["widget"],
    policy: (
      context: PolicyContext<Actor<R, S, A>, DashboardAuthResource, M>
    ) => boolean | Promise<boolean> = () => true
  ) {
    try {
      // Fields form only a candidate resource. Access validates the private
      // actor proof and revalidates evidence before admitting any policy.
      if (!actor) {
        throw new DashboardForbiddenError();
      }
      const candidate = scopeFor(actor);
      dashboardScopeKey(candidate);
      if (scope && dashboardScopeKey(scope) !== dashboardScopeKey(candidate)) {
        throw new DashboardForbiddenError();
      }
      return await access.enforce(
        actor,
        { scope: candidate, operation, ...(widget ? { widget } : {}) },
        policy
      );
    } catch {
      throw new DashboardForbiddenError();
    }
  }
  return {
    async resolveScope(actor) {
      return scopeFor(await enforce(actor, "identity"));
    },
    async revision(actor, scope) {
      let version: string | undefined;
      const verified = await enforce(
        actor,
        "revision",
        scope,
        undefined,
        async (context) => {
          version = await revisionProvider(context);
          return (
            typeof version === "string" &&
            version.length > 0 &&
            version.length <= 512
          );
        }
      );
      return JSON.stringify([
        verified.realmId,
        verified.subjectId,
        verified.audience,
        verified.kind,
        version,
      ]);
    },
    async canRead(actor, scope) {
      await enforce(actor, "read", scope, undefined, policies.read);
      return true;
    },
    async canWrite(actor, scope) {
      await enforce(actor, "write", scope, undefined, policies.write);
      return true;
    },
    async canUseWidget(actor, scope, widget) {
      // Widget denial redacts config; identity failure must still reject.
      let allowed = false;
      await enforce(actor, "widget", scope, widget, async (context) => {
        allowed = (await policies.widget(context)) === true;
        return true;
      });
      return allowed;
    },
  };
}

export function createAuthDashboardStore<
  R extends string,
  E,
  S extends string,
  A extends string,
  M,
>(
  options: DashboardAuthOptions<R, E, S, A, M> & {
    principal: Actor<R, S, A> | null;
    repository: DashboardRepository;
    definitions: readonly DashboardConfigDefinition[];
  }
): DashboardStore {
  return createAuthorizedDashboardStore({
    context: options.principal,
    authorization: createDashboardAuthAuthorization(options),
    repository: options.repository,
    definitions: options.definitions,
  });
}
