/* eslint-disable func-style */

import type { ManagedServiceTarget } from "./client.js";
import {
  runtimeObservabilityFeatures,
  runtimeObservabilityProtocol,
} from "./contracts.js";
import type { SystemPlaneCoreClient } from "./core-client.js";
import type { CoreDocument } from "./core-contracts.js";
import type { ManagedServiceTargetResolver } from "./projection.js";
import { ManagedServiceRegistryError } from "./registry.js";
import type {
  ManagedServiceRegistry,
  ManagedServiceRegistryRecord,
} from "./registry.js";
import { SystemPlaneClientError } from "./transport.js";

export interface SystemPlaneCoreSource {
  discover(
    reference: {
      serviceId: string;
      servicePrincipal: string;
      baseUrl: string;
    },
    deadlineUnixMs: number
  ): Promise<CoreDocument>;
}

export class CoreRuntimeObservabilityTargetResolver implements ManagedServiceTargetResolver {
  readonly #registry: ManagedServiceRegistry;
  readonly #core: SystemPlaneCoreSource;

  constructor(options: {
    registry: ManagedServiceRegistry;
    core: SystemPlaneCoreSource | SystemPlaneCoreClient;
  }) {
    this.#registry = options.registry;
    this.#core = options.core;
  }

  async refresh(
    staleTarget: ManagedServiceTarget,
    deadlineUnixMs: number
  ): Promise<ManagedServiceTarget> {
    let registered: ManagedServiceRegistryRecord;
    try {
      registered = await this.#registry.active(staleTarget.serviceId);
    } catch (error) {
      if (error instanceof ManagedServiceRegistryError) {
        throw new SystemPlaneClientError("configuration", error.message, {
          cause: error,
          serviceCode: error.code,
        });
      }
      throw error;
    }
    assertStableReference(registered, staleTarget);

    let document: CoreDocument;
    try {
      document = await this.#core.discover(
        this.#registry.reference(registered),
        deadlineUnixMs
      );
    } catch (error) {
      if (!(error instanceof SystemPlaneClientError)) {
        throw error;
      }
      await this.#registry.recordFailure(
        registered,
        error.kind === "contract" ? "incompatible" : "unavailable",
        failureCode(error)
      );
      throw error;
    }

    const capability = document.capabilities.find(
      (candidate) => candidate.contractId === runtimeObservabilityProtocol
    );
    const missingFeatures = Object.values(runtimeObservabilityFeatures).filter(
      (featureId) => !capability?.featureIds.includes(featureId)
    );
    if (capability === undefined || capability.majorVersion !== 1) {
      await this.#registry.recordCore(
        registered,
        document,
        "incompatible",
        "runtime_observability_contract_missing"
      );
      throw new SystemPlaneClientError(
        "configuration",
        "Managed Service did not advertise Runtime Observability v1",
        { serviceCode: "runtime_observability_contract_missing" }
      );
    }
    if (missingFeatures.length > 0) {
      await this.#registry.recordCore(
        registered,
        document,
        "incompatible",
        "runtime_observability_features_missing"
      );
      throw new SystemPlaneClientError(
        "configuration",
        `Managed Service did not advertise required Runtime Observability features: ${missingFeatures.join(", ")}`,
        { serviceCode: "runtime_observability_features_missing" }
      );
    }

    await this.#registry.recordCore(registered, document, "ready");
    return {
      baseUrl: registered.baseUrl,
      capability: {
        contractId: runtimeObservabilityProtocol,
        endpoint: capability.endpoint,
        featureIds: capability.featureIds,
        schemaDigest: capability.schemaDigest,
      },
      serviceId: registered.serviceId,
      servicePrincipal: registered.servicePrincipal,
      serviceRevision: document.serviceRevision,
    };
  }
}

function assertStableReference(
  registered: ManagedServiceRegistryRecord,
  staleTarget: ManagedServiceTarget
): void {
  if (
    registered.servicePrincipal !== staleTarget.servicePrincipal ||
    registered.baseUrl !== staleTarget.baseUrl
  ) {
    throw new SystemPlaneClientError(
      "configuration",
      "Managed Service target does not match the registered Service Reference",
      { serviceCode: "managed_service_reference_changed" }
    );
  }
}

function failureCode(error: SystemPlaneClientError): string {
  return error.serviceCode ?? `system_plane_${error.kind}`;
}
