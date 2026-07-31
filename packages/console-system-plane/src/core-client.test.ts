import { describe, expect, it, vi } from "vitest";

import {
  SystemPlaneCoreClient,
  type ManagedServiceReference,
} from "./core-client.js";
import {
  systemPlaneCoreDiscoveryFeature,
  systemPlaneCoreProtocol,
} from "./core-contracts.js";
import type { SystemPlaneCredentialRequest } from "./transport.js";

const reference: ManagedServiceReference = {
  baseUrl: "https://support.internal/",
  serviceId: "support",
  servicePrincipal: "service:support",
};

const document = {
  capabilities: [],
  protocol: systemPlaneCoreProtocol,
  serviceId: "support",
  servicePrincipal: "service:support",
  serviceRevision: "release:one",
};

describe("SystemPlaneCoreClient", () => {
  it("discovers the exact Core endpoint with bound context and no retry", async () => {
    const credentials: SystemPlaneCredentialRequest[] = [];
    const fetchMock = vi.fn(async () => Response.json(document));
    const client = new SystemPlaneCoreClient({
      credentials: {
        issue: async (request) => {
          credentials.push(request);
          return "workload-token";
        },
      },
      fetch: fetchMock as typeof fetch,
      now: () => 1000,
    });

    await expect(client.discover(reference, 4000)).resolves.toEqual(document);
    expect(credentials).toEqual([
      {
        audience: "service:support",
        contractId: systemPlaneCoreProtocol,
        deadlineUnixMs: 4000,
        endpoint: "https://support.internal/system-plane/v1",
        featureId: systemPlaneCoreDiscoveryFeature,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when Core returns another Service identity", async () => {
    const client = new SystemPlaneCoreClient({
      credentials: { issue: async () => "workload-token" },
      fetch: (async () =>
        Response.json({ ...document, serviceId: "billing" })) as typeof fetch,
      now: () => 1000,
    });

    await expect(client.discover(reference, 4000)).rejects.toMatchObject({
      kind: "contract",
    });
  });
});
