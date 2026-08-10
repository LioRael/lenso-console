import type { ConsoleSha256Digest } from "@lenso/console-module-api";
import type { ConsoleSystemConnection as ConsoleUiSystemConnection } from "@lenso/console-ui";

const digest = (letter: string): ConsoleSha256Digest =>
  `sha256:${letter.repeat(64)}`;

export const mockSystemConnection: ConsoleUiSystemConnection = {
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
    },
    {
      serviceId: "support-worker",
      servicePrincipal: "svc.support-worker",
      status: "unavailable",
      reason: "workload_absent",
    },
    {
      serviceId: "legacy-reporting",
      servicePrincipal: "svc.legacy-reporting",
      status: "unmanaged",
      reason: "Enrolled Service is not part of this Management Binding",
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
          "sha256:5b319cc7b4dbfe965cca4f770d5dc32c7d5cac984b2f374286d62ce1b5d6f1f9",
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
