import type { ServiceSystemResponse } from "../pages/available-modules-model";

// Backend-shaped projection of lenso's committed
// contracts/services/lenso-system.v2.fixture.json plus its compatibility result.
export const m0ServiceSystemResponse = {
  compatibilityResults: [
    {
      affectedReferences: ["consumer:analytics"],
      category: "breaking",
      changedVersion: "v2",
      contractId: "notification-events.v1",
      contractKind: "event_contract",
      reasons: [
        {
          code: "event_field_removed",
          message: "required event field `channel` was removed",
          nextAction: "coordinate the analytics consumer upgrade",
          path: "$.payload.channel",
        },
      ],
    },
  ],
  dependencies: [],
  environments: [],
  issues: [],
  modules: [
    { capabilities: [], dependencies: [], name: "auth", owner: "support-host" },
    {
      capabilities: [],
      dependencies: [],
      name: "notification-gateway",
      owner: "notification-provider",
    },
    {
      capabilities: [],
      dependencies: [],
      name: "support-sla",
      owner: "support",
    },
    {
      capabilities: [],
      dependencies: [],
      name: "support-ticket",
      owner: "support",
    },
  ],
  name: "support-platform",
  nodes: [
    { id: "support-host", kind: "host", owner: null },
    { id: "auth", kind: "module", owner: "support-host" },
    { id: "notification-provider", kind: "provider", owner: null },
    {
      id: "notification-gateway",
      kind: "module",
      owner: "notification-provider",
    },
    { id: "support", kind: "autonomous_service", owner: null },
    { id: "support-sla", kind: "module", owner: "support" },
    { id: "support-ticket", kind: "module", owner: "support" },
    { id: "support-api", kind: "workload", owner: "support" },
    { id: "support-worker", kind: "workload", owner: "support" },
    {
      id: "producer:notification-events.v1",
      kind: "producer",
      owner: "notification-provider",
    },
    {
      id: "producer:support-http.v1",
      kind: "producer",
      owner: "support",
    },
    {
      id: "consumer:support-host-support-api",
      kind: "consumer",
      owner: "support-host",
    },
    {
      id: "consumer:support-notifications",
      kind: "consumer",
      owner: "support",
    },
  ],
  protocolVersion: "lenso.system.v2",
  relationships: [
    {
      contractId: null,
      contractVersion: null,
      from: "support-host",
      kind: "owns",
      to: "auth",
    },
    {
      contractId: null,
      contractVersion: null,
      from: "notification-provider",
      kind: "owns",
      to: "notification-gateway",
    },
    {
      contractId: null,
      contractVersion: null,
      from: "support",
      kind: "owns",
      to: "support-sla",
    },
    {
      contractId: null,
      contractVersion: null,
      from: "support",
      kind: "owns",
      to: "support-ticket",
    },
    {
      contractId: null,
      contractVersion: null,
      from: "support",
      kind: "owns",
      to: "support-api",
    },
    {
      contractId: null,
      contractVersion: null,
      from: "support",
      kind: "owns",
      to: "support-worker",
    },
    {
      contractId: "notification-events.v1",
      contractVersion: "v1",
      from: "notification-provider",
      kind: "produces",
      to: "producer:notification-events.v1",
    },
    {
      contractId: "support-http.v1",
      contractVersion: "v1",
      from: "support",
      kind: "produces",
      to: "producer:support-http.v1",
    },
    {
      contractId: "support-http.v1",
      contractVersion: "v1",
      from: "consumer:support-host-support-api",
      kind: "consumes",
      to: "producer:support-http.v1",
    },
    {
      contractId: "notification-events.v1",
      contractVersion: "v1",
      from: "consumer:support-notifications",
      kind: "consumes",
      to: "producer:notification-events.v1",
    },
  ],
  semanticKind: "mixed_system",
  services: [
    { modules: [], name: "notification-provider", target: "provider" },
    { modules: [], name: "support", target: "autonomous_service" },
  ],
  status: "needs_attention",
  systemFile: "lenso.system.json",
  version: 2,
} satisfies ServiceSystemResponse;
