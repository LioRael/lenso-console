/* eslint-disable func-style */

import {
  parseCoreDocument,
  systemPlaneCoreDiscoveryFeature,
  systemPlaneCorePath,
  systemPlaneCoreProtocol,
  type CoreDocument,
} from "./core-contracts.js";
import {
  SystemPlaneClientError,
  SystemPlaneJsonTransport,
  type SystemPlaneCredentialProvider,
} from "./transport.js";

export interface ManagedServiceReference {
  serviceId: string;
  servicePrincipal: string;
  baseUrl: string;
}

export class SystemPlaneCoreClient {
  readonly #transport: SystemPlaneJsonTransport;

  constructor(options: {
    credentials: SystemPlaneCredentialProvider;
    fetch?: typeof fetch;
    now?: () => number;
  }) {
    this.#transport = new SystemPlaneJsonTransport(options);
  }

  async discover(
    reference: ManagedServiceReference,
    deadlineUnixMs: number
  ): Promise<CoreDocument> {
    const value = await this.#transport.get({
      baseUrl: reference.baseUrl,
      contractId: systemPlaneCoreProtocol,
      deadlineUnixMs,
      featureId: systemPlaneCoreDiscoveryFeature,
      path: systemPlaneCorePath,
      servicePrincipal: reference.servicePrincipal,
    });
    let document: CoreDocument;
    try {
      document = parseCoreDocument(value);
    } catch (error) {
      throw new SystemPlaneClientError(
        "contract",
        "Managed Service returned an invalid System Plane Core document",
        { cause: error }
      );
    }
    if (
      document.serviceId !== reference.serviceId ||
      document.servicePrincipal !== reference.servicePrincipal
    ) {
      throw new SystemPlaneClientError(
        "contract",
        "Core discovery identity does not match the enrolled Service Reference"
      );
    }
    return document;
  }
}
