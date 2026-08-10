import type { ConsoleSystemConnection } from "@lenso/console-ui";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;

export const mockSystemConnection: ConsoleSystemConnection = {
  systemId: "support-desk",
  topologyDigest: digest("b"),
  status: "unavailable",
  reason: "support-worker is unavailable",
  managementBinding: {
    systemId: "support-desk",
    topologyDigest: digest("b"),
    serviceIds: ["support-api", "support-worker"],
    adapterIds: ["support-workload-control"],
    permissions: ["console.module.business.read"],
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
