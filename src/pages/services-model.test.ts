import { describe, expect, it } from "vitest";

import type { ServiceModuleLifecycleResponse } from "./available-modules-model";
import {
  serviceCenterProviderDetail,
  serviceCenterRows,
  serviceRemoteCallsPath,
  serviceStateLabel,
  serviceSystemSummary,
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

  it("summarizes the service system plane", () => {
    expect(
      serviceSystemSummary({
        dependencies: [
          {
            capability: "billing.invoice.read",
            from: "support",
            state: "resolved",
            to: "billing",
          },
        ],
        environments: ["local", "prod"],
        issues: [{ code: "dependency_unresolved", message: "missing billing" }],
        modules: [
          {
            capabilities: ["support.ticket.read"],
            dependencies: ["billing.invoice.read"],
            name: "support-ticket",
            owner: "support",
          },
        ],
        name: "support-platform",
        services: [
          { modules: ["support-ticket"], name: "support", target: "local" },
          { modules: [], name: "billing", target: "kubernetes" },
        ],
        status: "needs_attention",
        systemFile: "lenso.system.json",
        version: 1,
      })
    ).toMatchObject({
      dependencies: 1,
      modules: 1,
      name: "support-platform",
      services: 2,
      status: "needs_attention",
      targets: ["kubernetes", "local"],
    });
  });

  it("surfaces the latest service release for a provider", () => {
    const response = {
      version: 1,
      status: "ready",
      modules: [
        {
          configured: true,
          fixes: [],
          installed: true,
          latestRelease: {
            appliedAtUnixMs: 300,
            candidateManifestReference: "./support/v3/lenso.service.json",
            candidateVersion: "0.3.0",
            currentVersion: "0.2.0",
            id: "rel_new",
            risk: "breaking",
            serviceName: "support-suite-provider",
          },
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-ticket",
          providerName: "support-suite-provider",
          releaseHistory: [
            {
              appliedAtUnixMs: 100,
              candidateManifestReference: "./support/v2/lenso.service.json",
              candidateVersion: "0.2.0",
              currentVersion: "0.1.0",
              id: "rel_old",
              risk: "safe",
              serviceName: "support-suite-provider",
            },
            {
              appliedAtUnixMs: 300,
              candidateManifestReference: "./support/v3/lenso.service.json",
              candidateVersion: "0.3.0",
              currentVersion: "0.2.0",
              id: "rel_new",
              risk: "breaking",
              serviceName: "support-suite-provider",
            },
          ],
          restartPending: false,
          services: [],
          status: "ready",
        },
      ],
    } satisfies ServiceModuleLifecycleResponse;

    const [row] = serviceCenterRows(response);

    expect(row?.latestRelease?.id).toBe("rel_new");
    expect(row?.latestRelease?.risk).toBe("breaking");
    expect(row?.releaseHistory.map((release) => release.id)).toEqual([
      "rel_new",
      "rel_old",
    ]);
  });

  it("surfaces deployment environments and operator commands", () => {
    const response = {
      version: 1,
      status: "ready",
      modules: [
        {
          configured: true,
          deploymentDrift: "in_sync",
          deploymentNextAction: "monitor rollout and Remote Calls",
          deployments: [
            {
              serviceName: "support-suite-provider",
              environment: "staging",
              target: "kubernetes",
              observedAtUnixMs: 300,
              state: "ready",
              drift: "in_sync",
              cluster: {
                namespace: "lenso-staging",
                readyReplicas: 2,
                desiredReplicas: 2,
                image: "ghcr.io/acme/support-suite-provider:0.4.0",
              },
            },
          ],
          environments: [
            {
              name: "staging",
              serviceName: "support-suite-provider",
              target: "kubernetes",
              namespace: "lenso-staging",
              image: "ghcr.io/acme/support-suite-provider:0.4.0",
            },
          ],
          fixes: [],
          installed: true,
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-ticket",
          providerName: "support-suite-provider",
          restartPending: false,
          services: [],
          status: "ready",
        },
      ],
    } satisfies ServiceModuleLifecycleResponse;

    const [row] = serviceCenterRows(response);

    expect(row?.deploymentDrift).toBe("in_sync");
    expect(row?.deploymentNextAction).toBe("monitor rollout and Remote Calls");
    expect(row?.environments[0]?.namespace).toBe("lenso-staging");
    expect(row?.deployments[0]?.state).toBe("ready");
    expect(row?.operatorCommands).toContain(
      "lenso service deploy status support-suite-provider --env staging --write-state"
    );
  });

  it("surfaces operator-managed deployment conditions and commands", () => {
    const response = {
      version: 1,
      status: "ready",
      modules: [
        {
          configured: true,
          deploymentDrift: "in_sync",
          deploymentNextAction:
            "monitor operator conditions, Remote Calls, and Runtime Story",
          deploymentHistory: [
            {
              serviceName: "support-suite-provider",
              environment: "staging",
              target: "operator",
              observedAtUnixMs: 100,
              state: "progressing",
              drift: "host_ahead",
            },
            {
              serviceName: "support-suite-provider",
              environment: "staging",
              target: "operator",
              observedAtUnixMs: 300,
              state: "ready",
              drift: "in_sync",
            },
          ],
          deployments: [
            {
              serviceName: "support-suite-provider",
              environment: "staging",
              target: "operator",
              observedAtUnixMs: 300,
              state: "ready",
              drift: "in_sync",
              operator: {
                resource: "support-suite-provider",
                namespace: "lenso-staging",
                observedGeneration: 3,
                conditions: [
                  {
                    type: "Ready",
                    status: "True",
                    reason: "DeploymentAvailable",
                    message: "2/2 replicas are ready.",
                    lastTransitionTime: "2026-06-29T00:00:00Z",
                  },
                ],
              },
              cluster: {
                namespace: "lenso-staging",
                readyReplicas: 2,
                desiredReplicas: 2,
                availableReplicas: 2,
                image: "ghcr.io/acme/support-suite-provider:0.4.0",
              },
            },
          ],
          environments: [
            {
              name: "prod",
              serviceName: "support-suite-provider",
              target: "operator",
              namespace: "lenso-prod",
              image: "ghcr.io/acme/support-suite-provider:0.4.0",
            },
            {
              name: "staging",
              serviceName: "support-suite-provider",
              target: "operator",
              namespace: "lenso-staging",
              image: "ghcr.io/acme/support-suite-provider:0.4.0",
            },
          ],
          fixes: [],
          installed: true,
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-ticket",
          providerName: "support-suite-provider",
          restartPending: false,
          services: [],
          status: "ready",
        },
      ],
    } satisfies ServiceModuleLifecycleResponse;

    const [row] = serviceCenterRows(response);

    expect(row?.operatorManaged).toBe(true);
    expect(row?.operatorConditions).toEqual([
      "Ready=True DeploymentAvailable: 2/2 replicas are ready.",
    ]);
    expect(
      row?.deploymentHistory.map((deployment) => deployment.state)
    ).toEqual(["ready", "progressing"]);
    expect(row?.operatorCommands).toContain(
      "lenso service deploy export support-suite-provider --env staging --target operator --output-dir dist/lenso-service/support-suite-provider/operator/staging"
    );
    expect(row?.operatorCommands).toContain(
      "lenso service deploy status support-suite-provider --env staging --source operator --write-state"
    );
    expect(row?.operatorCommands).toContain(
      "lenso service deploy wait support-suite-provider --env staging --source operator --write-state"
    );
    expect(row?.operatorCommands).toContain(
      "lenso service release promote support-suite-provider --from staging --to prod --output .lenso/support-suite-provider.prod.release-plan.json"
    );
    expect(row?.operatorCommands).toContain(
      "lenso service release apply .lenso/support-suite-provider.prod.release-plan.json --env prod"
    );
  });

  it("keeps operator rollout state from being hidden by ready modules", () => {
    const progressingResponse = {
      version: 1,
      status: "ready",
      modules: [
        {
          configured: true,
          deploymentNextAction: "wait for operator rollout to become ready",
          deployments: [
            {
              serviceName: "support-suite-provider",
              environment: "staging",
              target: "operator",
              observedAtUnixMs: 300,
              state: "progressing",
              drift: "image_drift",
              operator: {
                resource: "support-suite-provider",
                namespace: "lenso-staging",
                conditions: [
                  {
                    type: "Available",
                    status: "False",
                    reason: "DeploymentProgressing",
                    message: "1/2 replicas are ready.",
                  },
                ],
              },
              cluster: {
                namespace: "lenso-staging",
                readyReplicas: 1,
                desiredReplicas: 2,
              },
            },
          ],
          fixes: [],
          installed: true,
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-ticket",
          providerName: "support-suite-provider",
          restartPending: false,
          services: [],
          status: "ready",
        },
      ],
    } satisfies ServiceModuleLifecycleResponse;
    const [progressing] = serviceCenterRows(progressingResponse);

    expect(progressing?.state).toBe("configured");
    expect(progressing?.nextAction).toBe(
      "wait for operator rollout to become ready"
    );

    const failedResponse = {
      version: 1,
      status: "ready",
      modules: [
        {
          configured: true,
          deployments: [
            {
              serviceName: "support-suite-provider",
              environment: "staging",
              target: "operator",
              observedAtUnixMs: 300,
              state: "failed",
              drift: "in_sync",
            },
          ],
          fixes: [],
          installed: true,
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-ticket",
          providerName: "support-suite-provider",
          restartPending: false,
          services: [],
          status: "ready",
        },
      ],
    } satisfies ServiceModuleLifecycleResponse;
    const [failed] = serviceCenterRows(failedResponse);

    expect(failed?.state).toBe("unhealthy");
  });

  it("groups provider operations from provided modules by operation id", () => {
    const response = {
      version: 1,
      status: "ready",
      modules: [
        {
          configured: true,
          fixes: [],
          installed: true,
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-ticket",
          operations: [
            {
              capability: "support_ticket.tickets.write",
              kind: "admin_action",
              links: {
                remoteCalls: "/operations/remote-calls?module=support-ticket",
                runtime: "/operations/functions?module=support-ticket",
                story: "/?q=support-suite-provider",
                technicalOperations: "/operations?q=support-suite-provider",
              },
              method: null,
              moduleName: "support-ticket",
              name: "assign_ticket",
              nextAction: "add safeProbe metadata before active checks",
              operationId: "support-ticket/action/assign_ticket",
              path: null,
              providerName: "support-suite-provider",
              safeProbe: false,
              summary: "Assign ticket",
            },
          ],
          providerName: "support-suite-provider",
          restartPending: false,
          services: [],
          status: "ready",
        },
        {
          configured: true,
          fixes: [],
          installed: true,
          loaded: true,
          manifestStatus: "reachable",
          moduleName: "support-notification",
          operations: [
            {
              capability: null,
              kind: "event_handler",
              links: {
                remoteCalls:
                  "/operations/remote-calls?module=support-notification",
                runtime: "/operations/functions?module=support-notification",
                story: "/?q=support-suite-provider",
                technicalOperations: "/operations?q=support-suite-provider",
              },
              method: null,
              moduleName: "support-notification",
              name: "ticket-created-handler",
              nextAction: "add safeProbe metadata before active checks",
              operationId: "support-notification/event/ticket-created-handler",
              path: null,
              providerName: "support-suite-provider",
              safeProbe: false,
              summary: "Ticket created",
            },
          ],
          providerName: "support-suite-provider",
          restartPending: false,
          services: [],
          status: "ready",
        },
      ],
    } satisfies ServiceModuleLifecycleResponse;

    const rows = serviceCenterRows(response);

    expect(
      rows[0]?.operations.map((operation) => operation.operationId)
    ).toEqual([
      "support-notification/event/ticket-created-handler",
      "support-ticket/action/assign_ticket",
    ]);
    expect(rows[0]?.operations[0]?.links.story).toBe(
      "/?q=support-suite-provider"
    );
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

  it("treats missing config as provider attention", () => {
    const [row] = serviceCenterRows({
      modules: [
        {
          config: {
            configuredEnv: [],
            envFile: ".env",
            missingEnv: ["BILLING_API_KEY"],
            requiredEnv: ["BILLING_API_KEY"],
          },
          fixes: ["set missing service env in .env: BILLING_API_KEY"],
          moduleName: "billing",
          providerName: "billing",
          status: "missing_config",
        },
      ],
    });

    expect(row).toMatchObject({
      nextAction: "set missing service env in .env: BILLING_API_KEY",
      state: "unhealthy",
    });
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
