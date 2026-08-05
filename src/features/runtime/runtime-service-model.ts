import type { ServiceCenterRow } from "../../pages/services-model";

export type RuntimeTimelineEvent = {
  evidenceId: string;
  time: string;
  title: string;
};

export type RuntimeServiceRow = {
  errorRate: string | null;
  id: string;
  p95Ms: number | null;
  providerName: string;
  region: string;
  replicas: number | null;
  serviceId: string;
  state: string;
  timeline: readonly RuntimeTimelineEvent[];
  version: string;
};

export const runtimeDemoServices: readonly RuntimeServiceRow[] = [
  {
    errorRate: "0.02%",
    id: "lenso-api",
    p95Ms: 86,
    providerName: "lenso-api",
    region: "iad1",
    replicas: 3,
    serviceId: "svc_lenso_api",
    state: "ready",
    timeline: [
      {
        evidenceId: "evi_01J7R4",
        time: "12:04:18",
        title: "Config checksum verified",
      },
      {
        evidenceId: "evt_01J7R2",
        time: "12:03:59",
        title: "Replica 3 became ready",
      },
      {
        evidenceId: "evt_01J7R1",
        time: "12:03:42",
        title: "Replica 2 became ready",
      },
      {
        evidenceId: "evt_01J7QZ",
        time: "12:03:27",
        title: "Replica 1 became ready",
      },
      {
        evidenceId: "op_01J7QX",
        time: "12:03:10",
        title: "Release operation started",
      },
    ],
    version: "0.3.34",
  },
  {
    errorRate: "0.01%",
    id: "lenso-worker",
    p95Ms: 41,
    providerName: "lenso-worker",
    region: "iad1",
    replicas: 3,
    serviceId: "svc_lenso_worker",
    state: "ready",
    timeline: [],
    version: "0.3.34",
  },
  {
    errorRate: "0.07%",
    id: "billing-sync",
    p95Ms: 129,
    providerName: "billing-sync",
    region: "iad1",
    replicas: 2,
    serviceId: "svc_billing_sync",
    state: "ready",
    timeline: [],
    version: "1.8.2",
  },
  {
    errorRate: "0.38%",
    id: "customer-index",
    p95Ms: 244,
    providerName: "customer-index",
    region: "fra1",
    replicas: 2,
    serviceId: "svc_customer_index",
    state: "restart_pending",
    timeline: [],
    version: "2.4.0",
  },
  {
    errorRate: "0.01%",
    id: "audit-evidence",
    p95Ms: 73,
    providerName: "audit-evidence",
    region: "iad1",
    replicas: 3,
    serviceId: "svc_audit_evidence",
    state: "ready",
    timeline: [],
    version: "0.9.7",
  },
  {
    errorRate: "0.04%",
    id: "webhook-relay",
    p95Ms: 111,
    providerName: "webhook-relay",
    region: "syd1",
    replicas: 2,
    serviceId: "svc_webhook_relay",
    state: "ready",
    timeline: [],
    version: "1.3.1",
  },
];

export function runtimeServiceRowsFromCenterRows(
  rows: readonly ServiceCenterRow[]
): RuntimeServiceRow[] {
  return rows.map((row) => ({
    errorRate: null,
    id: row.providerName,
    p95Ms: null,
    providerName: row.providerName,
    region: row.environments[0]?.name ?? "local",
    replicas: row.managedServices.length || null,
    serviceId: serviceIdFor(row.providerName),
    state: row.state,
    timeline: [],
    version:
      row.latestRelease?.candidateVersion ??
      row.latestRelease?.currentVersion ??
      "—",
  }));
}

function serviceIdFor(providerName: string) {
  return `svc_${providerName.replaceAll(/[^a-z0-9]+/gi, "_")}`;
}
