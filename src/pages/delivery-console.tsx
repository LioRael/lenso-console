import * as stylex from "@stylexjs/stylex";
import {
  AlertTriangle,
  CheckCircle2,
  GitCompareArrows,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";

const localStyles = stylex.create({
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgPanel: {
    backgroundColor: "var(--bg-panel)",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPy2: {
    paddingBlock: "calc(0.25rem * 2)",
  },
  utilityTextAccent: {
    color: "var(--accent)",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText12px: {
    fontSize: "12px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityUppercase: {
    textTransform: "uppercase",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityGapPx: {
    gap: "1px",
  },
  utilityBgLine: {
    backgroundColor: "var(--line)",
  },
  utilityMdGridCols4: {
    "@media (min-width: 768px)": {
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    },
  },
  utilityBorderT: {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
  },
  utilityLgGridCols2: {
    "@media (min-width: 1024px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBgBgPanelMuted: {
    backgroundColor: "var(--bg-panel-muted)",
  },
  utilityP2: {
    padding: "calc(0.25rem * 2)",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityMt1: {
    marginTop: "calc(0.25rem * 1)",
  },
  utilityBreakAll: {
    wordBreak: "break-all",
  },
  utilityText9px: {
    fontSize: "9px",
  },
  utilityMt2: {
    marginTop: "calc(0.25rem * 2)",
  },
  utilityGridCols80pxMinmax01fr: {
    gridTemplateColumns: "80px minmax(0,1fr)",
  },
  utilityGapX2: {
    columnGap: "calc(0.25rem * 2)",
  },
  utilityGridCols90pxMinmax01fr: {
    gridTemplateColumns: "90px minmax(0,1fr)",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityMdGridCols2: {
    "@media (min-width: 768px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  },
  utilityGridCols110pxMinmax01fr: {
    gridTemplateColumns: "110px minmax(0,1fr)",
  },
  utilityGridCols150pxMinmax01fr: {
    gridTemplateColumns: "150px minmax(0,1fr)",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityFirstBorderT0: {
    ":first-child": {
      borderTopWidth: "0px",
    },
  },
  utilityHoverBgBgRowHover: {
    ":hover": {
      backgroundColor: "var(--bg-row-hover)",
    },
  },
  utilityContentStart: {
    alignContent: "flex-start",
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
  },
  utilityContents: {
    display: "contents",
  },
  utilityCursorPointer: {
    cursor: "pointer",
  },
  utilityMaxH48: {
    maxHeight: "calc(0.25rem * 48)",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityWhitespacePreWrap: {
    whiteSpace: "pre-wrap",
  },
  utilityTextDanger: {
    color: "var(--danger)",
  },
  utilityP3: {
    padding: "calc(0.25rem * 3)",
  },
  utilityMb2: {
    marginBottom: "calc(0.25rem * 2)",
  },
  utilityGridCols96pxMinmax01frMinmax120px07fr: {
    gridTemplateColumns: "96px minmax(0,1fr) minmax(120px,0.7fr)",
  },
  utilityGridColsMinmax140px05frMinmax01fr: {
    gridTemplateColumns: "minmax(140px,0.5fr) minmax(0,1fr)",
  },
  utilityLastBorderB0: {
    ":last-child": {
      borderBottomWidth: "0px",
    },
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityFlexWrap: {
    flexWrap: "wrap",
  },
  gaStatus: (color: string) => ({ color }),
});

export type DeliveryConsoleState =
  | "planned"
  | "blocked"
  | "staged"
  | "approved"
  | "canary"
  | "converging"
  | "ready"
  | "rolling_back"
  | "rolled_back"
  | "paused"
  | "intervention_required";

export type DeliveryConsoleTimelineEntry = {
  protocol: string;
  artifactId: string;
  state: string;
  evidenceReferences: string[];
};

export type DeliveryConsoleGaEvidence = {
  protocol: string;
  evidenceId: string;
  status: string;
  stale: boolean;
  subjects: Record<string, string>;
  details?: Record<string, unknown>;
  issueCodes: string[];
  nextActions: string[];
};

export type DeliveryConsoleProjection = {
  protocol: "lenso.delivery-console.v1";
  projectionDigest: string;
  state: DeliveryConsoleState;
  release?: {
    serviceId: string;
    releaseId: string;
    releaseDigest: string;
  } | null;
  supplyChain: Array<{
    workloadId: string;
    artifactDigest: string;
    signatureStatus: string;
    sbomReference: string;
    provenanceReference: string;
    provenanceSubjectMatches: boolean;
  }>;
  policy?: {
    evidenceId: string;
    packId: string;
    decision: string;
  } | null;
  configuration: {
    desiredRevisionId?: string | null;
    activeRevisionId?: string | null;
    previousRevisionId?: string | null;
    drifted: boolean;
    secretReferences: Array<{
      referenceId: string;
      provider: string;
      purpose: string;
      scope: string;
      status: string;
      rotationRevision?: string | null;
    }>;
  };
  deployments: Array<{
    environment: string;
    desiredReleaseId: string;
    observedReleaseId: string;
    configRevisionId: string;
    drifted: boolean;
    fresh: boolean;
  }>;
  edge?: { contractId: string; publicRoutes: string[] } | null;
  adapterDrift: Array<{
    environment: string;
    drifted: boolean;
    fresh: boolean;
    nextActions: string[];
  }>;
  promotionHistory: DeliveryConsoleTimelineEntry[];
  canaryTimeline: DeliveryConsoleTimelineEntry[];
  canaryObservations: Array<{
    observationId: string;
    observedRevision: number;
    fresh: boolean;
    observationWindowSeconds: number;
    sampleCount: number;
    genericProcessHealthy: boolean;
    workloadReadiness: Record<string, boolean>;
    workloadLiveness: Record<string, boolean>;
    availabilityBasisPoints?: number | null;
    latencyP99Ms?: number | null;
    errorBudgetUsedBasisPoints?: number | null;
    queueBacklog?: number | null;
    workflowBacklog?: number | null;
    timerLagMs?: number | null;
    retryExhaustion?: number | null;
    compensationPressure?: number | null;
    dependencies: Array<{
      dependencyId: string;
      available: boolean;
      activeDegradedMode?: string | null;
    }>;
    failureDomains: Record<string, boolean>;
    scalingCheckPassed?: boolean | null;
    disruptionCheckPassed?: boolean | null;
    availabilityCheckPassed?: boolean | null;
    evidenceReferences: string[];
  }>;
  rollbackTimeline: DeliveryConsoleTimelineEntry[];
  issues: Array<{
    code: string;
    message: string;
    evidenceReferences: string[];
    remediation: string;
    nextActions: string[];
  }>;
  nextActions: string[];
  runtimeStoryReferences: string[];
  gaOperations?: {
    supportManifest?: DeliveryConsoleGaEvidence | null;
    deliveryRecovery: DeliveryConsoleGaEvidence[];
    restore?: DeliveryConsoleGaEvidence | null;
    disasterRecovery?: DeliveryConsoleGaEvidence | null;
    performance?: DeliveryConsoleGaEvidence | null;
    supportEnvelope?: DeliveryConsoleGaEvidence | null;
    securityReview?: DeliveryConsoleGaEvidence | null;
    contractLifecycle: DeliveryConsoleGaEvidence[];
  };
  readOnly: boolean;
  applyActions: string[];
};

export function DeliveryConsolePanel({
  data,
  error,
  loading,
}: {
  data?: DeliveryConsoleProjection | undefined;
  error?: string | null | undefined;
  loading?: boolean | undefined;
}) {
  if (loading) {
    return <DeliveryMessage text="Loading production delivery evidence..." />;
  }
  if (error) {
    return (
      <DeliveryMessage
        role="alert"
        text={`Production delivery evidence unavailable: ${error}`}
      />
    );
  }
  if (!data) {
    return (
      <DeliveryMessage text="No production delivery evidence has been recorded." />
    );
  }
  const StateIcon = stateIcon(data.state);
  const timeline = [
    ...data.promotionHistory,
    ...data.canaryTimeline,
    ...data.rollbackTimeline,
  ];

  return (
    <section
      aria-labelledby="delivery-heading"
      {...stylex.props([
        localStyles.utilityBorderB,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgPanel,
      ])}
    >
      <header
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap2,
          localStyles.utilityBorderB,
          localStyles.utilityBorderLine,
          localStyles.utilityPx3,
          localStyles.utilityPy2,
        ])}
      >
        <StateIcon
          aria-hidden="true"
          {...stylex.props([localStyles.utilityTextAccent])}
          size={14}
        />
        <h2
          {...stylex.props([
            localStyles.utilityFontMono,
            localStyles.utilityText12px,
            localStyles.utilityFontSemibold,
          ])}
          id="delivery-heading"
        >
          Production delivery
        </h2>
        <span
          aria-label={`Production delivery state: ${data.state}`}
          {...stylex.props([
            localStyles.utilityMlAuto,
            localStyles.utilityFontMono,
            localStyles.utilityText10px,
            localStyles.utilityUppercase,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          {data.state.replaceAll("_", " ")}
        </span>
      </header>

      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityGapPx,
          localStyles.utilityBgLine,
          localStyles.utilityMdGridCols4,
        ])}
      >
        <Summary
          label="release"
          value={
            data.release
              ? `${data.release.releaseId} · ${data.release.releaseDigest}`
              : "No Service Release recorded"
          }
        />
        <Summary
          label="policy"
          value={
            data.policy
              ? `${data.policy.packId} · ${data.policy.decision}`
              : "No Policy Evidence recorded"
          }
        />
        <Summary
          label="configuration"
          value={`desired ${data.configuration.desiredRevisionId ?? "unknown"} · active ${data.configuration.activeRevisionId ?? "unknown"}`}
        />
        <Summary
          label="authority"
          value="Read-only evidence. Protected changes remain outside Console."
        />
      </div>

      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityGapPx,
          localStyles.utilityBorderT,
          localStyles.utilityBorderLine,
          localStyles.utilityBgLine,
          localStyles.utilityLgGridCols2,
        ])}
      >
        <EvidenceSection label="Supply-chain evidence">
          {data.supplyChain.length === 0 ? (
            <EmptyLine text="No Workload trust evidence recorded." />
          ) : (
            data.supplyChain.map((workload) => (
              <article
                {...stylex.props([
                  localStyles.utilityBorder,
                  localStyles.utilityBorderLine,
                  localStyles.utilityBgBgPanelMuted,
                  localStyles.utilityP2,
                ])}
                key={workload.workloadId}
              >
                <div
                  {...stylex.props([
                    localStyles.utilityFlex,
                    localStyles.utilityItemsCenter,
                    localStyles.utilityGap2,
                    localStyles.utilityFontMono,
                    localStyles.utilityText10px,
                  ])}
                >
                  <PackageCheck aria-hidden="true" size={12} />
                  <span>{workload.workloadId}</span>
                  <span
                    {...stylex.props([
                      localStyles.utilityMlAuto,
                      localStyles.utilityUppercase,
                      localStyles.utilityTextFgTertiary,
                    ])}
                  >
                    {workload.signatureStatus}
                  </span>
                </div>
                <div
                  {...stylex.props([
                    localStyles.utilityMt1,
                    localStyles.utilityBreakAll,
                    localStyles.utilityFontMono,
                    localStyles.utilityText9px,
                    localStyles.utilityTextFgTertiary,
                  ])}
                >
                  {workload.artifactDigest}
                </div>
                <dl
                  {...stylex.props([
                    localStyles.utilityMt2,
                    localStyles.utilityGrid,
                    localStyles.utilityGridCols80pxMinmax01fr,
                    localStyles.utilityGapX2,
                    localStyles.utilityText10px,
                  ])}
                >
                  <dt>SBOM</dt>
                  <dd {...stylex.props([localStyles.utilityBreakAll])}>
                    {workload.sbomReference}
                  </dd>
                  <dt>provenance</dt>
                  <dd {...stylex.props([localStyles.utilityBreakAll])}>
                    {workload.provenanceReference} · subject{" "}
                    {workload.provenanceSubjectMatches ? "matches" : "mismatch"}
                  </dd>
                </dl>
              </article>
            ))
          )}
        </EvidenceSection>

        <EvidenceSection label="Configuration and references">
          <dl
            {...stylex.props([
              localStyles.utilityGrid,
              localStyles.utilityGridCols90pxMinmax01fr,
              localStyles.utilityGapX2,
              localStyles.utilityText10px,
            ])}
          >
            <dt>desired</dt>
            <dd>{data.configuration.desiredRevisionId ?? "unknown"}</dd>
            <dt>active</dt>
            <dd>{data.configuration.activeRevisionId ?? "unknown"}</dd>
            <dt>previous</dt>
            <dd>{data.configuration.previousRevisionId ?? "none"}</dd>
            <dt>drift</dt>
            <dd>{data.configuration.drifted ? "detected" : "none"}</dd>
          </dl>
          <div
            {...stylex.props([
              localStyles.utilityMt2,
              localStyles.utilityFlex,
              localStyles.utilityFlexCol,
              localStyles.utilityGap2,
            ])}
          >
            {data.configuration.secretReferences.length === 0 ? (
              <EmptyLine text="No Secret References recorded." />
            ) : (
              data.configuration.secretReferences.map((reference) => (
                <article
                  {...stylex.props([
                    localStyles.utilityBorder,
                    localStyles.utilityBorderLine,
                    localStyles.utilityBgBgPanelMuted,
                    localStyles.utilityP2,
                    localStyles.utilityText10px,
                  ])}
                  key={reference.referenceId}
                >
                  <div {...stylex.props([localStyles.utilityFontMono])}>
                    {reference.referenceId}
                  </div>
                  <div {...stylex.props([localStyles.utilityTextFgTertiary])}>
                    {reference.provider} · {reference.purpose} ·{" "}
                    {reference.scope} · {reference.status}
                    {reference.rotationRevision
                      ? ` · rotation ${reference.rotationRevision}`
                      : ""}
                  </div>
                </article>
              ))
            )}
          </div>
        </EvidenceSection>
      </div>

      <EvidenceSection label="Environment Deployments">
        <div
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilityGap2,
            localStyles.utilityMdGridCols2,
          ])}
        >
          {data.deployments.length === 0 ? (
            <EmptyLine text="No environment Deployment observation recorded." />
          ) : (
            data.deployments.map((deployment) => (
              <article
                {...stylex.props([
                  localStyles.utilityBorder,
                  localStyles.utilityBorderLine,
                  localStyles.utilityBgBgPanelMuted,
                  localStyles.utilityP2,
                  localStyles.utilityText10px,
                ])}
                key={`${deployment.environment}:${deployment.observedReleaseId}`}
              >
                <div
                  {...stylex.props([
                    localStyles.utilityFlex,
                    localStyles.utilityFontMono,
                  ])}
                >
                  <span>{deployment.environment}</span>
                  <span
                    {...stylex.props([
                      localStyles.utilityMlAuto,
                      localStyles.utilityUppercase,
                      localStyles.utilityTextFgTertiary,
                    ])}
                  >
                    {deployment.drifted
                      ? "drifted"
                      : deployment.fresh
                        ? "current"
                        : "stale"}
                  </span>
                </div>
                <div
                  {...stylex.props([
                    localStyles.utilityMt1,
                    localStyles.utilityBreakAll,
                    localStyles.utilityTextFgTertiary,
                  ])}
                >
                  desired {deployment.desiredReleaseId}
                  <br />
                  observed {deployment.observedReleaseId}
                  <br />
                  config {deployment.configRevisionId}
                </div>
              </article>
            ))
          )}
        </div>
        {data.edge ? (
          <p
            {...stylex.props([
              localStyles.utilityMt2,
              localStyles.utilityText10px,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            Edge {data.edge.contractId}:{" "}
            {data.edge.publicRoutes.join(", ") || "no public routes"}
          </p>
        ) : null}
      </EvidenceSection>

      <EvidenceSection label="Canary reliability observations">
        {data.canaryObservations.length === 0 ? (
          <EmptyLine text="No content-addressed canary Reliability Observation recorded." />
        ) : (
          <div
            {...stylex.props([
              localStyles.utilityGrid,
              localStyles.utilityGap2,
              localStyles.utilityMdGridCols2,
            ])}
          >
            {data.canaryObservations.map((observation) => (
              <article
                {...stylex.props([
                  localStyles.utilityBorder,
                  localStyles.utilityBorderLine,
                  localStyles.utilityBgBgPanelMuted,
                  localStyles.utilityP2,
                  localStyles.utilityText10px,
                ])}
                key={observation.observationId}
              >
                <div
                  {...stylex.props([
                    localStyles.utilityFlex,
                    localStyles.utilityFontMono,
                  ])}
                >
                  <span>revision {observation.observedRevision}</span>
                  <span
                    {...stylex.props([
                      localStyles.utilityMlAuto,
                      localStyles.utilityUppercase,
                      localStyles.utilityTextFgTertiary,
                    ])}
                  >
                    {observation.fresh ? "fresh" : "stale"}
                  </span>
                </div>
                <dl
                  {...stylex.props([
                    localStyles.utilityMt2,
                    localStyles.utilityGrid,
                    localStyles.utilityGridCols110pxMinmax01fr,
                    localStyles.utilityGapX2,
                  ])}
                >
                  <dt>window / samples</dt>
                  <dd>
                    {observation.observationWindowSeconds}s /{" "}
                    {observation.sampleCount}
                  </dd>
                  <dt>availability</dt>
                  <dd>{observation.availabilityBasisPoints ?? "missing"} bp</dd>
                  <dt>latency p99</dt>
                  <dd>{observation.latencyP99Ms ?? "missing"} ms</dd>
                  <dt>error budget</dt>
                  <dd>
                    {observation.errorBudgetUsedBasisPoints ?? "missing"} bp
                  </dd>
                  <dt>queue / workflow</dt>
                  <dd>
                    {observation.queueBacklog ?? "missing"} /{" "}
                    {observation.workflowBacklog ?? "missing"}
                  </dd>
                  <dt>timer / retries</dt>
                  <dd>
                    {observation.timerLagMs ?? "missing"} ms /{" "}
                    {observation.retryExhaustion ?? "missing"}
                  </dd>
                  <dt>compensation</dt>
                  <dd>{observation.compensationPressure ?? "missing"}</dd>
                  <dt>safety checks</dt>
                  <dd>
                    scale {String(observation.scalingCheckPassed)} · disruption{" "}
                    {String(observation.disruptionCheckPassed)} · availability{" "}
                    {String(observation.availabilityCheckPassed)}
                  </dd>
                </dl>
                <p
                  {...stylex.props([
                    localStyles.utilityMt2,
                    localStyles.utilityTextFgTertiary,
                  ])}
                >
                  workloads{" "}
                  {Object.entries(observation.workloadReadiness)
                    .map(
                      ([id, ready]) => `${id}:${ready ? "ready" : "not-ready"}`
                    )
                    .join(", ") || "none"}
                </p>
                <p {...stylex.props([localStyles.utilityTextFgTertiary])}>
                  dependencies{" "}
                  {observation.dependencies
                    .map(
                      (dependency) =>
                        `${dependency.dependencyId}:${dependency.available ? "available" : (dependency.activeDegradedMode ?? "unavailable")}`
                    )
                    .join(", ") || "none"}
                </p>
                <EvidenceLinks references={observation.evidenceReferences} />
              </article>
            ))}
          </div>
        )}
      </EvidenceSection>

      <EvidenceSection label="GA support and operations">
        <div {...stylex.props([localStyles.utilityGrid])}>
          {gaEvidenceItems(data.gaOperations).length === 0 ? (
            <EmptyLine text="No GA support, recovery, performance, disaster, Contract, or security evidence recorded." />
          ) : (
            gaEvidenceItems(data.gaOperations).map(({ label, evidence }) => (
              <article
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilityGridCols150pxMinmax01fr,
                  localStyles.utilityGap3,
                  localStyles.utilityBorderT,
                  localStyles.utilityBorderLine,
                  localStyles.utilityPx3,
                  localStyles.utilityPy2,
                  localStyles.utilityText10px,
                  localStyles.utilityFirstBorderT0,
                  localStyles.utilityHoverBgBgRowHover,
                ])}
                key={`${label}:${evidence.protocol}:${evidence.evidenceId}`}
              >
                <div
                  {...stylex.props([
                    localStyles.utilityGrid,
                    localStyles.utilityContentStart,
                    localStyles.utilityGap1,
                    localStyles.utilityFontMono,
                  ])}
                >
                  <span>{label}</span>
                  <span
                    {...stylex.props(
                      localStyles.gaStatus(gaStatusColor(evidence))
                    )}
                  >
                    {evidence.stale ? "stale" : evidence.status}
                  </span>
                </div>
                <div
                  {...stylex.props([
                    localStyles.utilityBreakAll,
                    localStyles.utilityFontMono,
                    localStyles.utilityText9px,
                    localStyles.utilityTextFgTertiary,
                  ])}
                >
                  {evidence.evidenceId}
                </div>
                <dl
                  {...stylex.props([
                    localStyles.utilityGrid,
                    localStyles.utilityGridCols90pxMinmax01fr,
                    localStyles.utilityGapX2,
                  ])}
                >
                  {Object.entries(evidence.subjects).map(([key, value]) => (
                    <div
                      {...stylex.props([localStyles.utilityContents])}
                      key={key}
                    >
                      <dt>{key}</dt>
                      <dd {...stylex.props([localStyles.utilityBreakAll])}>
                        {key === "storyId" ? (
                          <a
                            {...stylex.props([localStyles.utilityTextAccent])}
                            href={`/api/console/v1/stories/${encodeURIComponent(value)}`}
                          >
                            {value}
                          </a>
                        ) : (
                          value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {Object.keys(evidence.details ?? {}).length > 0 ? (
                  <details {...stylex.props([localStyles.utilityMt2])}>
                    <summary
                      {...stylex.props([
                        localStyles.utilityCursorPointer,
                        localStyles.utilityTextAccent,
                      ])}
                    >
                      exact evidence
                    </summary>
                    <pre
                      {...stylex.props([
                        localStyles.utilityMt1,
                        localStyles.utilityMaxH48,
                        localStyles.utilityOverflowAuto,
                        localStyles.utilityWhitespacePreWrap,
                        localStyles.utilityBreakAll,
                        localStyles.utilityBorder,
                        localStyles.utilityBorderLine,
                        localStyles.utilityP2,
                        localStyles.utilityText9px,
                        localStyles.utilityTextFgTertiary,
                      ])}
                    >
                      {JSON.stringify(evidence.details, null, 2)}
                    </pre>
                  </details>
                ) : null}
                {evidence.issueCodes.length > 0 ? (
                  <p
                    {...stylex.props([
                      localStyles.utilityMt2,
                      localStyles.utilityFontMono,
                      localStyles.utilityText9px,
                      localStyles.utilityTextDanger,
                    ])}
                  >
                    {evidence.issueCodes.join(", ")}
                  </p>
                ) : null}
                {evidence.nextActions.map((action) => (
                  <p
                    {...stylex.props([
                      localStyles.utilityMt1,
                      localStyles.utilityTextAccent,
                    ])}
                    key={action}
                  >
                    next: {action}
                  </p>
                ))}
              </article>
            ))
          )}
        </div>
      </EvidenceSection>

      <div
        aria-label="Production delivery timeline"
        {...stylex.props([
          localStyles.utilityBorderT,
          localStyles.utilityBorderLine,
          localStyles.utilityP3,
        ])}
      >
        <h3
          {...stylex.props([
            localStyles.utilityMb2,
            localStyles.utilityFontMono,
            localStyles.utilityText10px,
            localStyles.utilityUppercase,
          ])}
        >
          Promotion, canary, and rollback timeline
        </h3>
        {timeline.length === 0 ? (
          <EmptyLine text="No rollout timeline evidence recorded." />
        ) : (
          <ol {...stylex.props([localStyles.utilityGrid])}>
            {timeline.map((entry) => (
              <li
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilityGridCols96pxMinmax01frMinmax120px07fr,
                  localStyles.utilityGap3,
                  localStyles.utilityBorderT,
                  localStyles.utilityBorderLine,
                  localStyles.utilityPx3,
                  localStyles.utilityPy2,
                  localStyles.utilityFirstBorderT0,
                ])}
                key={`${entry.protocol}:${entry.artifactId}`}
              >
                <div
                  {...stylex.props([
                    localStyles.utilityFontMono,
                    localStyles.utilityText9px,
                    localStyles.utilityTextFgTertiary,
                  ])}
                >
                  {entry.state}
                </div>
                <div
                  {...stylex.props([
                    localStyles.utilityBreakAll,
                    localStyles.utilityText10px,
                  ])}
                >
                  {entry.protocol}
                </div>
                <div
                  {...stylex.props([
                    localStyles.utilityFontMono,
                    localStyles.utilityText9px,
                    localStyles.utilityTextFgTertiary,
                  ])}
                >
                  {entry.artifactId}
                </div>
                <EvidenceLinks references={entry.evidenceReferences} />
              </li>
            ))}
          </ol>
        )}
      </div>

      {data.issues.length > 0 ? (
        <div
          aria-label="Production delivery issues"
          {...stylex.props([
            localStyles.utilityBorderT,
            localStyles.utilityBorderLine,
            localStyles.utilityP3,
          ])}
        >
          {data.issues.map((issue) => (
            <article
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityGridColsMinmax140px05frMinmax01fr,
                localStyles.utilityGap3,
                localStyles.utilityBorderB,
                localStyles.utilityBorderLine,
                localStyles.utilityPx3,
                localStyles.utilityPy2,
                localStyles.utilityLastBorderB0,
              ])}
              key={`${issue.code}:${issue.message}`}
            >
              <h3
                {...stylex.props([
                  localStyles.utilityFontMono,
                  localStyles.utilityText10px,
                  localStyles.utilityFontSemibold,
                ])}
              >
                {issue.code}
              </h3>
              <p
                {...stylex.props([
                  localStyles.utilityText11px,
                  localStyles.utilityTextFgSecondary,
                ])}
              >
                {issue.message}
              </p>
              <p
                {...stylex.props([
                  localStyles.utilityText10px,
                  localStyles.utilityTextFgTertiary,
                ])}
              >
                remediation: {issue.remediation}
              </p>
              {issue.nextActions.map((action) => (
                <p
                  {...stylex.props([
                    localStyles.utilityFontMono,
                    localStyles.utilityText9px,
                    localStyles.utilityTextAccent,
                  ])}
                  key={action}
                >
                  next: {action}
                </p>
              ))}
              <EvidenceLinks references={issue.evidenceReferences} />
            </article>
          ))}
        </div>
      ) : null}

      <footer
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap2,
          localStyles.utilityBorderT,
          localStyles.utilityBorderLine,
          localStyles.utilityPx3,
          localStyles.utilityPy2,
          localStyles.utilityText10px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        <ShieldCheck aria-hidden="true" size={12} /> Console only reads redacted
        delivery evidence and holds no cluster, signing, or Secret Provider
        authority.
      </footer>
    </section>
  );
}

function gaStatusColor(evidence: DeliveryConsoleGaEvidence): string {
  if (evidence.stale || evidence.status === "partial") {
    return "var(--warning)";
  }
  if (
    ["passed", "supported", "general_availability"].includes(evidence.status)
  ) {
    return "var(--success)";
  }
  if (["unknown", "unavailable"].includes(evidence.status)) {
    return "var(--fg-tertiary)";
  }
  return "var(--danger)";
}

function gaEvidenceItems(
  operations: DeliveryConsoleProjection["gaOperations"]
): Array<{ label: string; evidence: DeliveryConsoleGaEvidence }> {
  if (!operations) {
    return [];
  }
  return [
    operations.supportManifest
      ? { label: "support manifest", evidence: operations.supportManifest }
      : null,
    ...(operations.deliveryRecovery ?? []).map((evidence) => ({
      label: "delivery recovery",
      evidence,
    })),
    operations.restore
      ? { label: "restore", evidence: operations.restore }
      : null,
    operations.disasterRecovery
      ? { label: "disaster recovery", evidence: operations.disasterRecovery }
      : null,
    operations.performance
      ? { label: "performance", evidence: operations.performance }
      : null,
    operations.supportEnvelope
      ? { label: "support envelope", evidence: operations.supportEnvelope }
      : null,
    operations.securityReview
      ? { label: "security review", evidence: operations.securityReview }
      : null,
    ...(operations.contractLifecycle ?? []).map((evidence) => ({
      label: "Contract lifecycle",
      evidence,
    })),
  ].filter(
    (item): item is { label: string; evidence: DeliveryConsoleGaEvidence } =>
      item !== null
  );
}

function stateIcon(state: DeliveryConsoleState) {
  if (
    state === "blocked" ||
    state === "paused" ||
    state === "intervention_required"
  ) {
    return AlertTriangle;
  }
  if (state === "ready" || state === "rolled_back") {
    return CheckCircle2;
  }
  return GitCompareArrows;
}

function EvidenceSection({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section
      {...stylex.props([localStyles.utilityBgBgPanel, localStyles.utilityP3])}
    >
      <h3
        {...stylex.props([
          localStyles.utilityMb2,
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
          localStyles.utilityUppercase,
        ])}
      >
        {label}
      </h3>
      {children}
    </section>
  );
}

function EvidenceLinks({ references }: { references: string[] }) {
  if (references.length === 0) {
    return null;
  }
  return (
    <div
      {...stylex.props([
        localStyles.utilityMt1,
        localStyles.utilityFlex,
        localStyles.utilityFlexWrap,
        localStyles.utilityGap2,
        localStyles.utilityFontMono,
        localStyles.utilityText9px,
      ])}
    >
      {references.map((reference) => (
        <a
          {...stylex.props([localStyles.utilityTextAccent])}
          href={`/api/console/v1/stories/${encodeURIComponent(reference)}`}
          key={reference}
        >
          {reference}
        </a>
      ))}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div
      {...stylex.props([localStyles.utilityBgBgPanel, localStyles.utilityP3])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFontMono,
          localStyles.utilityText9px,
          localStyles.utilityUppercase,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        {label}
      </div>
      <div
        {...stylex.props([
          localStyles.utilityMt1,
          localStyles.utilityBreakAll,
          localStyles.utilityText11px,
        ])}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p
      {...stylex.props([
        localStyles.utilityText10px,
        localStyles.utilityTextFgTertiary,
      ])}
    >
      {text}
    </p>
  );
}

function DeliveryMessage({ role, text }: { role?: "alert"; text: string }) {
  return (
    <section
      aria-label="Production delivery"
      {...stylex.props([
        localStyles.utilityBorderB,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgPanel,
        localStyles.utilityP3,
        localStyles.utilityText11px,
        localStyles.utilityTextFgTertiary,
      ])}
      role={role}
    >
      {text}
    </section>
  );
}
