import type { ConsoleSha256Digest } from "@lenso/console-module-api";
import type { ConsoleSystemConnection as ConsoleUiSystemConnection } from "@lenso/console-ui";

const digest = (letter: string): ConsoleSha256Digest =>
  `sha256:${letter.repeat(64)}`;

export const mockSystemConnection: ConsoleUiSystemConnection = {
  adapters: [
    {
      adapterId: "support-workload-control",
      capabilities: ["workload.control"],
      workload: {
        serviceId: "support-api",
        systemId: "support-desk",
        workloadId: "support-workload-control-adapter",
      },
      workloadControl: {
        capabilities: ["suspend", "resume"],
        protocol: "lenso.workload-control.v1",
        schemaDigest:
          "sha256:d3666bb1fd85576f9af4205dbcc70029acd81462678c47d2b315c40ef1a9161d",
        status: "connected",
      },
    },
  ],
  systemId: "support-desk",
  topologyDigest: digest("b"),
  status: "unavailable",
  reason: "support-worker is unavailable",
  managementBinding: {
    systemId: "support-desk",
    topologyDigest: digest("b"),
    serviceIds: ["support-api", "support-worker"],
    adapterIds: ["support-workload-control"],
    permissions: [
      "console.module.business.read",
      "console.module.business.write",
      "console.workload.read",
      "console.workload.control",
      "console.workload.operation.read",
    ],
    policy: {
      policyId: "support-desk-console",
      revision: 1,
      digest: digest("c"),
    },
  },
  services: [
    {
      serviceId: "support-api",
      servicePrincipal: "svc.support-api",
      status: "connected",
      reason: null,
      workloads: [
        { role: "api", workloadId: "support-api" },
        {
          role: "control_adapter",
          workloadId: "support-workload-control-adapter",
        },
      ],
    },
    {
      serviceId: "support-worker",
      servicePrincipal: "svc.support-worker",
      status: "unavailable",
      reason: "workload_absent",
      workloads: [{ role: "worker", workloadId: "support-worker" }],
    },
    {
      serviceId: "legacy-reporting",
      servicePrincipal: "svc.legacy-reporting",
      status: "unmanaged",
      reason: "Enrolled Service is not part of this Management Binding",
      workloads: [],
    },
  ],
  modules: [
    {
      moduleId: "lenso/platform-story",
      delivery: "linked",
      moduleReleaseDigest: digest("d"),
      consoleUiArtifactDigest: digest("e"),
      status: "connected",
      reason: null,
    },
    {
      moduleId: "support/tickets",
      delivery: "service",
      serviceId: "support-api",
      moduleReleaseDigest: digest("f"),
      consoleUiArtifactDigest: digest("1"),
      surfaceApiGrant: {
        artifactDigest: digest("1"),
        contractDigest:
          "sha256:5c95d669efa62fa3b423bc46a5e9be3af17393b6c97cb57a9966e3bb79be1155",
        moduleReleaseDigest: digest("f"),
        operationIds: [
          "support-ticket/http/GET:/tickets",
          "support-ticket/http/PATCH:/tickets/{id}",
          "support-ticket/http/POST:/tickets",
          "support-ticket/http/POST:/tickets/{id}/close",
        ],
      },
      status: "connected",
      reason: null,
    },
    {
      moduleId: "support/worker",
      delivery: "service",
      serviceId: "support-worker",
      moduleReleaseDigest: digest("2"),
      status: "unavailable",
      reason: "workload_absent",
    },
  ],
};
