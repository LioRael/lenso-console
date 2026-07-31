import type {
  FederatedStoryEvidence,
  RuntimeStory,
} from "@lenso/console-package-api";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { FederatedStoryEvidencePanel } from "./federated-evidence";

const observedAt = "2026-07-18T08:05:00.000Z";

function storyWith(evidence: FederatedStoryEvidence): RuntimeStory {
  return {
    correlationId: "story-support",
    durationMs: 5000,
    edges: [],
    federation: evidence,
    id: "story-support",
    name: "Support SLA Federated Workflow",
    nodes: [
      {
        attributes: {},
        context: {},
        durationMs: 10,
        events: [],
        id: "node-workflow",
        kind: "runtime",
        logs: [],
        name: "support.sla",
        service: "support-sla",
        startMs: 0,
        status: "running",
      },
    ],
    service: "support-sla",
    source: "federated-runtime-story",
    status: "running",
    timestamp: observedAt,
  };
}

function baseEvidence(): FederatedStoryEvidence {
  return {
    assembledAt: observedAt,
    gaps: [],
    protocol: "lenso.federated-runtime-story.v1",
    reliability: [],
    tenantId: "tenant_a",
    workflowEntities: [
      "instance",
      "step",
      "attempt",
      "timer",
      "child",
      "compensation",
      "intervention",
    ].map((kind, index) => ({
      attempt: index + 1,
      id: `${kind}-${index + 1}`,
      instanceId: "workflow-1",
      kind: kind as FederatedStoryEvidence["workflowEntities"][number]["kind"],
      label: `${kind} evidence`,
      nodeId: "node-workflow",
      observedAt,
      serviceId: "support-sla",
      state:
        kind === "compensation"
          ? "compensating"
          : kind === "intervention"
            ? "intervention_recorded"
            : kind === "timer"
              ? "retry_scheduled"
              : "running",
    })),
  };
}

function render(evidence: FederatedStoryEvidence) {
  return renderToStaticMarkup(
    <FederatedStoryEvidencePanel
      onSelectNode={() => undefined}
      story={storyWith(evidence)}
    />
  );
}

describe("federated Runtime Story evidence", () => {
  test("exposes every workflow entity as a labelled drill-in control", () => {
    const markup = render(baseEvidence());

    expect(markup).toContain('aria-label="Federated workflow evidence"');
    expect(markup).toContain(
      'aria-label="Inspect timer timer evidence in retry_scheduled state"'
    );
    expect(markup).toContain(
      'aria-label="Inspect compensation compensation evidence in compensating state"'
    );
    expect(markup).toContain(
      'aria-label="Inspect intervention intervention evidence in intervention_recorded state"'
    );
    expect(markup).toContain("No missing Segment evidence");
  });

  test("keeps delayed evidence visible as a stale Segment gap", () => {
    const evidence = baseEvidence();
    evidence.gaps = [
      {
        detectedAt: observedAt,
        detail: "feed is outside its freshness window",
        kind: "stale",
        lastObservedAt: observedAt,
        nextAction: "inspect_story_segment_feed_freshness",
        sourceServiceId: "support-ticket",
      },
    ];

    const markup = render(evidence);
    expect(markup).toContain(
      'aria-label="Stale Segment gap from support-ticket"'
    );
    expect(markup).toContain("feed is outside its freshness window");
  });

  test("shows effective profile, explicit overrides, degraded dependencies, and pressure", () => {
    const evidence = baseEvidence();
    evidence.reliability = [
      {
        observedAt,
        report: {
          activeDegradedModes: [
            {
              dependencyId: "notification-gateway",
              evidenceReferences: ["probe:notification-gateway"],
              mode: "queue_notifications",
            },
          ],
          checks: [
            {
              code: "workflow_backlog",
              evidenceReferences: ["service-store:workflow"],
              expected: { maximum: 5 },
              issueCode: "workflow_backlog_limit_exceeded",
              nextActions: ["drain_workflow_backlog"],
              observed: 8,
              state: "breached",
            },
            {
              code: "timer_lag_ms",
              evidenceReferences: ["service-store:timers"],
              expected: { maximum: 1000 },
              nextActions: ["restore_workflow_timer_processing"],
              observed: 2500,
              state: "breached",
            },
            {
              code: "compensation_pressure",
              evidenceReferences: ["service-store:compensations"],
              expected: { maximum: 1 },
              nextActions: ["inspect_workflow_compensations"],
              observed: 2,
              state: "breached",
            },
            {
              code: "error_budget_consumed_basis_points",
              evidenceReferences: ["slo:error-budget"],
              expected: { maximum: 8000 },
              nextActions: ["protect_remaining_error_budget"],
              observed: 9000,
              state: "breached",
            },
          ],
          contractId: "support-reliability",
          contractVersion: "v1",
          effectiveValues: {
            compensationPressureLimit: 1,
            timerLagLimitMs: 1000,
            workflowBacklogLimit: 5,
          },
          overrides: { workflowBacklogLimit: 5 },
          profile: "critical",
          protocol: "lenso.reliability-report.v1",
          serviceId: "support-sla",
          state: "degraded",
        },
        sourceServiceId: "support-sla",
        status: "available",
      },
    ];

    const markup = render(evidence);
    expect(markup).toContain("critical profile");
    expect(markup).toContain("Overrides: WorkflowBacklogLimit 5");
    expect(markup).toContain("notification-gateway: Queue Notifications");
    expect(markup).toContain("Workflow Backlog: breached");
    expect(markup).toContain("Timer Lag Ms: breached");
    expect(markup).toContain("Compensation Pressure: breached");
    expect(markup).toContain("Error Budget Consumed Basis Points: breached");
  });

  test("names unauthorized evidence separately from successful completion", () => {
    const evidence = baseEvidence();
    evidence.gaps = [
      {
        detectedAt: observedAt,
        detail: "reader forbidden",
        kind: "unauthorized",
        lastObservedAt: observedAt,
        nextAction: "refresh_story_segment_feed_authorization",
        sourceServiceId: "support-identity",
      },
    ];

    expect(render(evidence)).toContain(
      'aria-label="Unauthorized Segment gap from support-identity"'
    );
  });

  test("retains every typed gap in gap-heavy stories", () => {
    const evidence = baseEvidence();
    evidence.gaps = [
      "unreachable",
      "stale",
      "unauthorized",
      "truncated",
      "retention_expired",
    ].map((kind, index) => ({
      detectedAt: observedAt,
      detail: `${kind} evidence`,
      kind: kind as FederatedStoryEvidence["gaps"][number]["kind"],
      lastObservedAt: observedAt,
      nextAction: "inspect_story_segment_source",
      sourceServiceId: `service-${index + 1}`,
    }));

    const markup = render(evidence);
    expect(markup).toContain("Unreachable Segment gap from service-1");
    expect(markup).toContain("Stale Segment gap from service-2");
    expect(markup).toContain("Unauthorized Segment gap from service-3");
    expect(markup).toContain("Truncated Segment gap from service-4");
    expect(markup).toContain("Retention expired Segment gap from service-5");
  });
});
