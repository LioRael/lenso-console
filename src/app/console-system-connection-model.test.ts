import { describe, expect, it } from "vitest";

import {
  connectionModuleForArtifact,
  connectionModuleState,
  isConnectedModule,
} from "./console-system-connection-model";

const connection = {
  systemId: "support-desk",
  topologyDigest: "sha256:topology",
  status: "connected" as const,
  reason: null,
  managementBinding: {
    systemId: "support-desk",
    topologyDigest: "sha256:topology",
    serviceIds: [],
    adapterIds: [],
    permissions: [],
    policy: { policyId: "policy", revision: 1, digest: "sha256:policy" },
  },
  services: [],
  modules: [
    {
      moduleId: "support/tickets",
      delivery: "service" as const,
      serviceId: "support-api",
      moduleReleaseDigest: "sha256:release",
      consoleUiArtifactDigest: "sha256:artifact",
      status: "connected" as const,
      reason: null,
    },
    {
      moduleId: "support/worker",
      delivery: "service" as const,
      serviceId: "support-worker",
      moduleReleaseDigest: "sha256:worker",
      consoleUiArtifactDigest: null,
      status: "unavailable" as const,
      reason: "workload_absent",
    },
  ],
};

describe("System Connection module projection", () => {
  it("requires the exact Module release and Console UI artifact", () => {
    expect(
      connectionModuleForArtifact(connection, {
        artifactDigest: "sha256:artifact",
        moduleId: "support/tickets",
        moduleReleaseDigest: "sha256:release",
      })?.status
    ).toBe("connected");
    expect(
      connectionModuleForArtifact(connection, {
        artifactDigest: "sha256:other",
        moduleId: "support/tickets",
        moduleReleaseDigest: "sha256:release",
      })
    ).toBeUndefined();
  });

  it("keeps unavailable workloads visible with their direct reason", () => {
    const module = connectionModuleState(connection, "support/worker");
    expect(isConnectedModule(module)).toBe(false);
    expect(module?.reason).toBe("workload_absent");
  });
});
