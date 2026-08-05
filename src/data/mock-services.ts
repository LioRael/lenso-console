import type {
  ConsoleManagedService,
  ConsoleManagedServicePresentation,
} from "@lenso/console-ui";

const receiptDigest = `sha256:${"a".repeat(64)}`;

type DesignServiceId =
  | "audit-evidence"
  | "billing"
  | "customer-index"
  | "lenso-api"
  | "notification-gateway"
  | "webhook-relay";

const designPresentations: Record<
  DesignServiceId,
  ConsoleManagedServicePresentation
> = {
  "audit-evidence": {
    environment: "prod-eu1",
    owner: "Security",
    posture: { label: "Healthy", tone: "success" },
    secondary: "svc.audit-evidence · Security",
    version: "0.9.7",
  },
  billing: {
    environment: "prod-us1",
    owner: "Revenue",
    posture: { label: "Healthy", tone: "success" },
    secondary: "svc.billing · Revenue",
    version: "1.8.2",
  },
  "customer-index": {
    environment: "prod-eu1",
    owner: "Search",
    posture: { label: "Degraded", tone: "warning" },
    secondary: "svc.customer-index · Search",
    version: "2.4.0",
  },
  "lenso-api": {
    composition: [
      "4 Linked modules · 2 workloads",
      "Provides 7 capabilities",
      "Depends on auth + audit-evidence",
    ],
    environment: "prod-eu1",
    identity: [
      "principal: lenso.prod.lenso-api",
      "Enrollment active · epoch 7",
      "Endpoint verified · mTLS",
    ],
    nextSafeAction: [
      "Change requires plan + approval",
      "Latest receipt: rcpt_01J7R4",
      "Plan change →",
    ],
    observed: "Healthy · observed 18s ago",
    owner: "Core",
    posture: { label: "Healthy", tone: "success" },
    runtime: [
      "prod-eu1 · 3 / 3 replicas ready",
      "v0.3.34 · 86 ms p95 · 0.02% errors",
      "Desired = observed · no drift",
    ],
    secondary: "svc.lenso-api · Core",
    version: "0.3.34",
  },
  "notification-gateway": {
    environment: "prod-global",
    owner: "Messaging",
    posture: { label: "Drifted", tone: "warning" },
    secondary: "svc.notification-gateway · Messaging",
    version: "1.12.1",
  },
  "webhook-relay": {
    environment: "prod-ap1",
    owner: "Integrations",
    posture: { label: "Enrollment required", tone: "warning" },
    secondary: "svc.webhook-relay · Integrations",
    version: "1.3.1",
  },
};

const mockService = (
  service: Pick<
    ConsoleManagedService,
    "connectionState" | "enrollmentState" | "serviceId"
  > & { presentation?: ConsoleManagedServicePresentation }
): ConsoleManagedService => ({
  authorizationEpoch: 7,
  baseUrl: `https://${service.serviceId}.example.com`,
  connectionState: service.connectionState,
  enrollmentExpiresAtUnixMs: 4_000_000_000_000,
  enrollmentGrantRevision: 1,
  enrollmentReceiptDigest: receiptDigest,
  enrollmentState: service.enrollmentState,
  lastErrorCode: service.connectionState === "ready" ? null : "observed_drift",
  ...(service.presentation ? { presentation: service.presentation } : {}),
  serviceId: service.serviceId,
  servicePrincipal: `svc.${service.serviceId}`,
  version: 1,
});

export const mockManagedServices: ConsoleManagedService[] = [
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    presentation: designPresentations["lenso-api"],
    serviceId: "lenso-api",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    presentation: designPresentations.billing,
    serviceId: "billing",
  }),
  mockService({
    connectionState: "incompatible",
    enrollmentState: "active",
    presentation: designPresentations["customer-index"],
    serviceId: "customer-index",
  }),
  mockService({
    connectionState: "unavailable",
    enrollmentState: "active",
    presentation: designPresentations["notification-gateway"],
    serviceId: "notification-gateway",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    presentation: designPresentations["audit-evidence"],
    serviceId: "audit-evidence",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    presentation: designPresentations["webhook-relay"],
    serviceId: "webhook-relay",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    serviceId: "auth-service",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    serviceId: "config-store",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    serviceId: "metrics-ingest",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    serviceId: "policy-engine",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    serviceId: "release-coordinator",
  }),
  mockService({
    connectionState: "ready",
    enrollmentState: "active",
    serviceId: "workflow-runner",
  }),
];
