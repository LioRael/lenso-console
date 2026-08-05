import type { ConsoleManagedService } from "@lenso/console-ui-internal";
import { describe, expect, test } from "vitest";

import {
  enrollmentExpiryLabel,
  filterServiceRows,
  managedServiceRows,
  registryState,
  registrySummary,
  serviceEndpointLabel,
  servicePresentation,
} from "./model";

const service = (
  overrides: Partial<ConsoleManagedService> = {}
): ConsoleManagedService => ({
  authorizationEpoch: 0,
  baseUrl: "https://orders.example.com",
  connectionState: "ready",
  enrollmentExpiresAtUnixMs: 2_000_000,
  enrollmentGrantRevision: 1,
  enrollmentReceiptDigest: `sha256:${"a".repeat(64)}`,
  enrollmentState: "active",
  serviceId: "orders",
  servicePrincipal: "service:orders",
  version: 1,
  ...overrides,
});

describe("system registry console model", () => {
  test("places services needing attention before healthy and revoked records", () => {
    expect(
      managedServiceRows([
        service({ serviceId: "ready" }),
        service({ enrollmentState: "revoked", serviceId: "revoked" }),
        service({ connectionState: "unavailable", serviceId: "down" }),
      ]).map((item) => item.serviceId)
    ).toEqual(["down", "ready", "revoked"]);
  });

  test("summarizes authority and connection state separately", () => {
    const services = [
      service(),
      service({ connectionState: "incompatible", serviceId: "billing" }),
      service({ enrollmentState: "revoked", serviceId: "legacy" }),
    ];
    expect(registrySummary(services)).toEqual({
      active: 2,
      attention: 1,
      ready: 1,
      revoked: 1,
      total: 3,
    });
    const incompatible = services.at(1);
    expect(incompatible).toBeDefined();
    expect(registryState(incompatible as ConsoleManagedService)).toEqual({
      label: "Contract incompatible",
      tone: "error",
    });
  });

  test("formats operator-facing endpoint and expiry labels", () => {
    expect(serviceEndpointLabel("https://orders.example.com/v1")).toBe(
      "orders.example.com"
    );
    expect(enrollmentExpiryLabel(3_600_001, 1)).toBe("1h remaining");
    expect(enrollmentExpiryLabel(1, 1)).toBe("Expired");
  });

  test("projects the product inventory order and inspector details", () => {
    const lensoApi = service({
      presentation: {
        composition: [
          "4 Linked modules · 2 workloads",
          "Provides 7 capabilities",
          "Depends on auth + audit-evidence",
        ],
        environment: "prod-eu1",
        owner: "Core",
        posture: { label: "Healthy", tone: "success" },
        secondary: "svc.lenso-api · Core",
        version: "0.3.34",
      },
      serviceId: "lenso-api",
      servicePrincipal: "svc.lenso-api",
    });
    const billing = service({
      serviceId: "billing",
      servicePrincipal: "svc.billing",
    });
    const rows = [
      { presentation: servicePresentation(lensoApi), service: lensoApi },
      { presentation: servicePresentation(billing), service: billing },
    ];

    expect(
      managedServiceRows([
        service({ serviceId: "webhook-relay" }),
        lensoApi,
        service({ serviceId: "billing" }),
      ]).map((item) => item.serviceId)
    ).toEqual(["lenso-api", "billing", "webhook-relay"]);
    expect(servicePresentation(lensoApi)).toMatchObject({
      composition: [
        "4 Linked modules · 2 workloads",
        "Provides 7 capabilities",
        "Depends on auth + audit-evidence",
      ],
      environment: "prod-eu1",
      owner: "Core",
      version: "0.3.34",
    });
    expect(
      filterServiceRows(rows, {
        environment: "prod-eu1",
        owner: "Core",
        posture: "Healthy",
      })
    ).toHaveLength(1);
  });
});
