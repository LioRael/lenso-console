import type {
  ConsoleOperationInspector,
  ConsoleOperationInspectionRequest,
} from "@lenso/console";
import { consoleOperationInspectionSchema } from "@lenso/console-sdk/protocol";
import type { ConsoleSecurityInvocation } from "@lenso/console/invocation";
import { definePlugin, type Plugin } from "@lenso/core/plugin";

import {
  projectRuntimeSnapshot,
  runtimeCatalogueSchema,
  type RuntimeCatalogue,
  type RuntimeSnapshot,
} from "./client";

interface InspectionService {
  status(
    input: Record<string, never>,
    trusted: { evidence: ConsoleSecurityInvocation }
  ): Promise<RuntimeSnapshot>;
  catalogue(
    input: Record<string, never>,
    trusted: { evidence: ConsoleSecurityInvocation }
  ): Promise<RuntimeCatalogue>;
}
export interface ConsoleRuntimeOperationBinding {
  targetId: string;
  mountId: string;
  revision: string;
  serviceId: string;
  operationName: string;
  ownerPluginId: string;
  ownerMethod: string;
  namespace: string;
  service: string;
  method: string;
  contractVersion: string;
  inspectionMountId?: string;
}

const unavailable = (reason: "binding-mismatch" | "contract-mismatch") =>
  consoleOperationInspectionSchema.parse({
    runtime: { availability: "unavailable", reason },
    recentFailures: {
      availability: "unavailable",
      reason: "collector-not-configured",
    },
  });

/** Explicit association only. Existing Runtime inspection retains its final administrator checks. */
export function createConsoleRuntimeOperationInspector(options: {
  id: string;
  inspection: Plugin<InspectionService>;
  bindings: readonly ConsoleRuntimeOperationBinding[];
}): Plugin<ConsoleOperationInspector> {
  if (options.bindings.length > 256) {
    throw new Error("Too many operation bindings.");
  }
  const bindings = options.bindings.map((binding) =>
    Object.freeze({ ...binding })
  );
  const keys = bindings.map((binding) =>
    JSON.stringify([
      binding.targetId,
      binding.mountId,
      binding.revision,
      binding.serviceId,
      binding.operationName,
      binding.ownerPluginId,
      binding.ownerMethod,
    ])
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("Duplicate operation binding.");
  }
  return definePlugin({
    id: options.id,
    requires: [options.inspection],
    setup(context) {
      const inspection = context.get(options.inspection);
      return {
        async read(query: ConsoleOperationInspectionRequest) {
          query.request.signal.throwIfAborted();
          const binding = bindings.find(
            (candidate) =>
              candidate.targetId === query.targetId &&
              candidate.mountId === query.mountId &&
              candidate.revision === query.revision &&
              candidate.serviceId === query.service &&
              candidate.operationName === query.name &&
              candidate.ownerPluginId === query.operation.plugin.id &&
              candidate.ownerMethod === query.operation.method
          );
          if (!binding) {
            return unavailable("binding-mismatch");
          }
          const evidence = (operation: string): ConsoleSecurityInvocation => ({
            identity: query.identity,
            request: query.request,
            resource: {
              action: "invoke",
              targetId: query.resource.targetId,
              tenantId: query.resource.tenantId,
              pluginId: options.inspection.id,
              operation,
              ...(binding.inspectionMountId
                ? { mountId: binding.inspectionMountId }
                : {}),
            },
          });
          const catalogue = runtimeCatalogueSchema.parse(
            await inspection.catalogue({}, { evidence: evidence("catalogue") })
          );
          const declaration = catalogue.services.find(
            (service) =>
              service.namespace === binding.namespace &&
              service.service === binding.service &&
              service.contract.version === binding.contractVersion
          )?.contract.methods[binding.method];
          const snapshot = projectRuntimeSnapshot(
            await inspection.status({}, { evidence: evidence("status") })
          );
          query.request.signal.throwIfAborted();
          const matching = snapshot.services.filter(
            (service) =>
              service.namespace === binding.namespace &&
              service.service === binding.service
          );
          if (
            matching.some(
              (service) => service.contract_version !== binding.contractVersion
            )
          ) {
            return unavailable("contract-mismatch");
          }
          return consoleOperationInspectionSchema.parse({
            runtime: {
              availability: "measured",
              source: "runtime-status",
              namespace: binding.namespace,
              service: binding.service,
              method: binding.method,
              contractVersion: binding.contractVersion,
              instances: matching
                .filter((service) =>
                  service.capabilities.some(
                    (capability) =>
                      capability.method === binding.method &&
                      (!declaration || capability.mode === declaration.mode)
                  )
                )
                .map((service) => ({
                  id: service.instance,
                  generation: service.generation,
                  state: service.state,
                })),
              declaration: {
                availability: "unverified",
                source: "static-build-manifest",
                outputSchema: declaration?.output ?? null,
                errorSchema: declaration?.error ?? null,
              },
            },
            // Runtime recent entries lack invocation-time instance/generation. Never guess a join.
            recentFailures: {
              availability: "unavailable",
              reason: "collector-not-configured",
            },
          });
        },
      };
    },
  });
}
