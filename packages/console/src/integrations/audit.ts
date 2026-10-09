import { AuditError, type AuditScope, type AuditService } from "@lenso/audit";
import { createScopedAuditManage } from "@lenso/audit/manage";
import type { Plugin } from "@lenso/core";
import type { Operation } from "@lenso/engine/operations";

import type {
  ConsoleIdentity,
  ConsoleOptions,
  ConsoleResource,
} from "../types";

export interface ConsoleAuditOptions<P> {
  readonly id: string;
  readonly audit: Plugin<AuditService<P>>;
  /** Resolve an authorized target mapping. Business input is intentionally unavailable. */
  readonly resolve: (trusted: {
    readonly identity: ConsoleIdentity;
    readonly resource: ConsoleResource;
    readonly request: Request;
  }) =>
    | { readonly principal: P; readonly scope: AuditScope }
    | Promise<{ readonly principal: P; readonly scope: AuditScope }>;
}

/** Install the returned exact plugin and Manage declaration in the intended target/mount. */
export function createConsoleAuditIntegration<P>(
  options: ConsoleAuditOptions<P>
) {
  const companion = createScopedAuditManage({
    id: options.id,
    audit: options.audit,
  });
  const binding = async (
    operation: Operation,
    _input: unknown,
    request: Request,
    identity: ConsoleIdentity,
    resource: ConsoleResource
  ) => {
    if (
      !companion.operations.some((declared) => declared === operation) ||
      resource.action !== "invoke" ||
      resource.pluginId !== companion.plugin.id ||
      resource.operation !== operation.method
    ) {
      throw new AuditError("unauthorized");
    }
    request.signal.throwIfAborted();
    const resolved = await options.resolve({ identity, resource, request });
    request.signal.throwIfAborted();
    if (resolved.scope.tenantId !== resource.tenantId) {
      throw new AuditError("unauthorized");
    }
    return {
      context: {
        principal: resolved.principal,
        scope: { ...resolved.scope },
      },
      signal: request.signal,
    };
  };
  return { ...companion, binding: binding satisfies ConsoleOptions["binding"] };
}
