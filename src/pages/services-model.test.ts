import { describe, expect, it } from "vitest";

import type { ServiceModuleLifecycleResponse } from "./available-modules-model";
import {
  serviceCenterRows,
  serviceRemoteCallsPath,
  serviceStateLabel,
} from "./services-model";

describe("service center model", () => {
  it("groups provider services with provided modules", () => {
    const response = {
      version: 1,
      status: "ready",
      modules: [
        {
          baseUrl: "http://127.0.0.1:4110/lenso/service/v1",
          configured: true,
          fixes: [],
          installed: true,
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-ticket",
          providerName: "support-suite-provider",
          restartPending: false,
          services: [
            {
              autoStart: true,
              name: "support-service",
              ready: true,
              readyUrl: "http://127.0.0.1:4110/lenso/service/v1/ready",
            },
          ],
          status: "ready",
        },
        {
          baseUrl: "http://127.0.0.1:4110/lenso/service/v1",
          configured: true,
          fixes: [],
          installed: true,
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-notification",
          providerName: "support-suite-provider",
          restartPending: false,
          services: [
            {
              autoStart: true,
              name: "support-service",
              ready: true,
              readyUrl: "http://127.0.0.1:4110/lenso/service/v1/ready",
            },
          ],
          status: "ready",
        },
      ],
    } satisfies ServiceModuleLifecycleResponse;

    const rows = serviceCenterRows(response);

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
    expect(serviceStateLabel("restart_pending")).toBe("restart pending");
  });

  it("keeps restart pending as a canonical state", () => {
    expect(
      serviceCenterRows({
        modules: [
          {
            moduleName: "support-ticket",
            providerName: "support-suite-provider",
            status: "restart_pending",
          },
        ],
      })[0]?.state
    ).toBe("restart_pending");
  });

  it("links to remote calls for a provider module", () => {
    expect(serviceRemoteCallsPath("support-ticket")).toContain(
      "module=support-ticket"
    );
  });
});
