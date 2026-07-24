import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DeliveryConsolePanel,
  type DeliveryConsoleProjection,
} from "./delivery-console";

const projection: DeliveryConsoleProjection = {
  protocol: "lenso.delivery-console.v1",
  projectionDigest: "sha256:projection",
  state: "intervention_required",
  release: {
    serviceId: "service:support",
    releaseId: "release:support:5",
    releaseDigest: "sha256:release5",
  },
  supplyChain: [
    {
      workloadId: "support-api",
      artifactDigest: "sha256:api5",
      signatureStatus: "trusted",
      sbomReference: "sbom:api5",
      provenanceReference: "provenance:api5",
      provenanceSubjectMatches: true,
    },
  ],
  policy: {
    evidenceId: "policy:production:5",
    packId: "production-default",
    decision: "passed",
  },
  configuration: {
    desiredRevisionId: "config:5",
    activeRevisionId: "config:5",
    previousRevisionId: "config:4",
    drifted: false,
    secretReferences: [
      {
        referenceId: "secret:db:5",
        provider: "vault",
        purpose: "database",
        scope: "service",
        status: "resolved",
        rotationRevision: "7",
      },
    ],
  },
  deployments: [
    {
      environment: "production",
      desiredReleaseId: "release:support:5",
      observedReleaseId: "release:support:5",
      configRevisionId: "config:5",
      drifted: false,
      fresh: true,
    },
  ],
  edge: { contractId: "edge:support:5", publicRoutes: ["/v1/tickets"] },
  adapterDrift: [
    { environment: "production", drifted: false, fresh: true, nextActions: [] },
  ],
  promotionHistory: [],
  canaryTimeline: [
    {
      protocol: "lenso.canary-decision.v1",
      artifactId: "canary:5",
      state: "rollback",
      evidenceReferences: ["runtime-story:canary-5"],
    },
  ],
  canaryObservations: [
    {
      observationId: "reliability-observation:canary-5",
      observedRevision: 42,
      fresh: true,
      observationWindowSeconds: 600,
      sampleCount: 1000,
      genericProcessHealthy: true,
      workloadReadiness: { "support-api": true },
      workloadLiveness: { "support-api": true },
      availabilityBasisPoints: 9990,
      latencyP99Ms: 120,
      errorBudgetUsedBasisPoints: 40,
      queueBacklog: 4,
      workflowBacklog: 2,
      timerLagMs: 100,
      retryExhaustion: 0,
      compensationPressure: 0,
      dependencies: [{ dependencyId: "database", available: true }],
      failureDomains: { "zone-a": true, "zone-b": true },
      scalingCheckPassed: true,
      disruptionCheckPassed: true,
      availabilityCheckPassed: true,
      evidenceReferences: ["runtime-story:canary-5"],
    },
  ],
  rollbackTimeline: [
    {
      protocol: "lenso.rollback-receipt.v1",
      artifactId: "rollback:5",
      state: "intervention_required",
      evidenceReferences: ["runtime-story:rollback-5"],
    },
  ],
  issues: [
    {
      code: "rollback_incomplete",
      message: "migration is irreversible",
      evidenceReferences: ["migration:5"],
      remediation: "limit exposure",
      nextActions: ["request intervention approval"],
    },
  ],
  nextActions: ["request intervention approval"],
  runtimeStoryReferences: ["runtime-story:canary-5"],
  gaOperations: {
    supportManifest: {
      protocol: "lenso.ga-support-manifest.v1",
      evidenceId: "ga-support:m6",
      status: "candidate",
      stale: false,
      subjects: {},
      issueCodes: [],
      nextActions: [],
    },
    deliveryRecovery: [],
    restore: null,
    disasterRecovery: {
      protocol: "lenso.disaster-recovery-evidence.v1",
      evidenceId: "disaster-recovery:support",
      status: "passed",
      stale: false,
      subjects: {
        serviceId: "service:support",
        primaryRegion: "cn-east-1",
        passiveRegion: "cn-east-2",
      },
      issueCodes: [],
      nextActions: ["keep the prior primary fenced"],
    },
    performance: null,
    supportEnvelope: null,
    securityReview: {
      protocol: "lenso.security-review-evidence.v1",
      evidenceId: "security-review:m6",
      status: "blocked",
      stale: true,
      subjects: { supportManifestDigest: "sha256:manifest" },
      issueCodes: ["security_review_stale"],
      nextActions: ["refresh review"],
    },
    contractLifecycle: [],
  },
  readOnly: true,
  applyActions: [],
};

describe("delivery console", () => {
  it("renders explainable delivery evidence without production authority", () => {
    const html = renderToStaticMarkup(
      <DeliveryConsolePanel data={projection} />
    );
    expect(html).toContain("intervention required");
    expect(html).toContain("sha256:release5");
    expect(html).toContain("trusted");
    expect(html).toContain("secret:db:5");
    expect(html).toContain("rollback_incomplete");
    expect(html).toContain("request intervention approval");
    expect(html).toContain("runtime-story%3Acanary-5");
    expect(html).toContain("Canary reliability observations");
    expect(html).toContain("120 ms");
    expect(html).toContain('aria-label="Production delivery timeline"');
    expect(html).toContain('aria-label="Production delivery issues"');
    expect(html).toContain("GA support and operations");
    expect(html).toContain("disaster-recovery:support");
    expect(html).toContain("security_review_stale");
    expect(html).toContain("refresh review");
    expect(html).not.toContain("Apply");
    expect(html).not.toContain("secretValue");
  });

  it("has explicit loading, empty, and error states", () => {
    expect(renderToStaticMarkup(<DeliveryConsolePanel loading />)).toContain(
      "Loading production delivery evidence"
    );
    expect(renderToStaticMarkup(<DeliveryConsolePanel />)).toContain(
      "No production delivery evidence"
    );
    expect(
      renderToStaticMarkup(<DeliveryConsolePanel error="HTTP 503" />)
    ).toContain('role="alert"');
  });

  it("keeps every GA state distinct, deep-links Stories, and accepts legacy v1 payloads", () => {
    const states = ["unknown", "blocked", "partial", "failed", "passed"].map(
      (status, index) => ({
        protocol: "lenso.delivery-failure-recovery-evidence.v1",
        evidenceId: `recovery:${status}`,
        status,
        stale: status === "partial",
        subjects: index === 4 ? { storyId: "runtime-story:ga-1" } : {},
        issueCodes: status === "passed" ? [] : [`state_${status}`],
        nextActions: [],
      })
    );
    const html = renderToStaticMarkup(
      <DeliveryConsolePanel
        data={{
          ...projection,
          gaOperations: {
            ...projection.gaOperations!,
            deliveryRecovery: states,
          },
        }}
      />
    );
    for (const state of ["unknown", "blocked", "stale", "failed", "passed"]) {
      expect(html).toContain(`>${state}<`);
    }
    expect(html).toContain("/admin/runtime/stories/runtime-story%3Aga-1");

    const { gaOperations: _ignored, ...legacy } = projection;
    expect(
      renderToStaticMarkup(<DeliveryConsolePanel data={legacy} />)
    ).toContain("No GA support, recovery, performance");
  });
});
