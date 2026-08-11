import type {
  ConsoleSha256Digest,
  ManagedServiceContext,
} from "@lenso/console-module-api";
import type { ConsoleManagedService } from "@lenso/console-ui";

import type { ConsoleAdminActor } from "./console-admin-context";

export const DEFAULT_MANAGED_SERVICE_ENVIRONMENT = "default";

export function managedServiceContextKey(
  context: ManagedServiceContext
): string {
  return [
    context.systemId,
    context.serviceId,
    context.environmentId,
    context.targetServicePrincipal,
    context.callerModuleId,
    context.delegatedActorSubject,
    context.delegatedAuthorityDigest,
    canonicalCapabilities(context.capabilities).join(","),
  ]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

export function createManagedServiceContext({
  actor,
  callerModuleId,
  capabilities,
  service,
  systemId,
}: {
  actor: ConsoleAdminActor;
  callerModuleId: string;
  capabilities: readonly string[];
  service: ConsoleManagedService;
  systemId: string;
}): ManagedServiceContext {
  return {
    systemId,
    serviceId: service.serviceId,
    environmentId:
      service.presentation?.environment ?? DEFAULT_MANAGED_SERVICE_ENVIRONMENT,
    targetServicePrincipal: service.servicePrincipal,
    callerModuleId,
    delegatedActorSubject: actorSubject(actor),
    // The registry receipt digest is the Console's current enrollment-bound
    // authority reference. The Service rechecks its current epoch and grant
    // on every operation instead of trusting this browser value.
    delegatedAuthorityDigest:
      service.enrollmentReceiptDigest as ConsoleSha256Digest,
    capabilities: canonicalCapabilities(capabilities),
  };
}

export function sameManagedServiceContext(
  left: ManagedServiceContext,
  right: ManagedServiceContext
): boolean {
  return (
    managedServiceContextKey(left) === managedServiceContextKey(right) &&
    left.systemId === right.systemId &&
    left.callerModuleId === right.callerModuleId &&
    left.delegatedActorSubject === right.delegatedActorSubject &&
    left.delegatedAuthorityDigest === right.delegatedAuthorityDigest &&
    JSON.stringify(canonicalCapabilities(left.capabilities)) ===
      JSON.stringify(canonicalCapabilities(right.capabilities))
  );
}

function canonicalCapabilities(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function actorSubject(actor: ConsoleAdminActor): string {
  switch (actor.kind) {
    case "user": {
      return actor.user_id;
    }
    case "service": {
      return actor.service_id;
    }
    case "system": {
      return "system";
    }
    default: {
      return "unknown";
    }
  }
}
