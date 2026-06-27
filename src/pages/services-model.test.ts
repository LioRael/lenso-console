import { describe, expect, it } from "vitest";

import type { ServiceModuleLifecycleResponse } from "./available-modules-model";
import {
  serviceCenterProviderDetail,
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

    expect(rows).toMatchObject([
      {
        providerName: "support-suite-provider",
        state: "ready",
        modules: ["support-notification", "support-ticket"],
        managedServices: ["support-service"],
        nextAction: "monitor remote calls and Runtime Story",
      },
    ]);
    expect(rows[0]?.remoteCallsPath).toContain("support-notification");
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

  it("builds provider detail with next action and lifecycle links", () => {
    const detail = serviceCenterProviderDetail(
      {
        modules: [
          {
            configured: true,
            fixes: ["restart API and worker"],
            healthHistory: [
              {
                checkedAtUnixMs: 1,
                moduleName: "support-ticket",
                state: "ready",
                statusUrl: "http://127.0.0.1/status",
              },
            ],
            installed: true,
            loaded: false,
            manifestStatus: "reachable",
            moduleName: "support-ticket",
            providerName: "support-suite-provider",
            restartPending: true,
            services: [],
            status: "restart_pending",
          },
        ],
      },
      "support-suite-provider"
    );

    expect(detail).toMatchObject({
      healthChecks: 1,
      nextAction: "restart API and worker to load the latest service state",
      providerName: "support-suite-provider",
      state: "restart_pending",
    });
    expect(detail?.operationsPath).toContain("/operations");
    expect(detail?.storyPath).toContain("support-suite-provider");
  });
});
