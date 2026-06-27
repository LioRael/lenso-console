import { describe, expect, it } from "vitest";

import {
  serviceCenterRows,
  serviceRemoteCallsPath,
  serviceStateLabel,
} from "./services-model";

describe("service center model", () => {
  it("groups provider services with provided modules", () => {
    const rows = serviceCenterRows({
      modules: [
        {
          moduleName: "support-ticket",
          providerName: "support-suite-provider",
          status: "ready",
          services: [{ name: "support-service", ready: true }],
        },
        {
          moduleName: "support-notification",
          providerName: "support-suite-provider",
          status: "ready",
          services: [{ name: "support-service", ready: true }],
        },
      ],
    });

    expect(rows).toEqual([
      {
        providerName: "support-suite-provider",
        state: "ready",
        modules: ["support-notification", "support-ticket"],
        managedServices: ["support-service"],
      },
    ]);
  });

  it("labels unhealthy services", () => {
    expect(serviceStateLabel("unhealthy")).toBe("unhealthy");
  });

  it("links to remote calls for a provider module", () => {
    expect(serviceRemoteCallsPath("support-ticket")).toContain(
      "module=support-ticket"
    );
  });
});
