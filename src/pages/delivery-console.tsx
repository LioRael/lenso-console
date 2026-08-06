import { stylexClassName } from "@lenso/console-ui";
import {
  AlertTriangle,
  CheckCircle2,
  GitCompareArrows,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";

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
      className={stylexClassName("border-b border-(--line) bg-(--bg-panel)")}
    >
      <header
        className={stylexClassName(
          "flex items-center gap-2 border-b border-(--line) px-3 py-2"
        )}
      >
        <StateIcon
          aria-hidden="true"
          className={stylexClassName("text-(--accent)")}
          size={14}
        />
        <h2
          className={stylexClassName("font-mono text-[12px] font-semibold")}
          id="delivery-heading"
        >
          Production delivery
        </h2>
        <span
          aria-label={`Production delivery state: ${data.state}`}
          className={stylexClassName(
            "ml-auto font-mono text-[10px] uppercase text-(--fg-secondary)"
          )}
        >
          {data.state.replaceAll("_", " ")}
        </span>
      </header>

      <div
        className={stylexClassName("grid gap-px bg-(--line) md:grid-cols-4")}
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
        className={stylexClassName(
          "grid gap-px border-t border-(--line) bg-(--line) lg:grid-cols-2"
        )}
      >
        <EvidenceSection label="Supply-chain evidence">
          {data.supplyChain.length === 0 ? (
            <EmptyLine text="No Workload trust evidence recorded." />
          ) : (
            data.supplyChain.map((workload) => (
              <article
                className={stylexClassName(
                  "border border-(--line) bg-(--bg-panel-muted) p-2"
                )}
                key={workload.workloadId}
              >
                <div
                  className={stylexClassName(
                    "flex items-center gap-2 font-mono text-[10px]"
                  )}
                >
                  <PackageCheck aria-hidden="true" size={12} />
                  <span>{workload.workloadId}</span>
                  <span
                    className={stylexClassName(
                      "ml-auto uppercase text-(--fg-tertiary)"
                    )}
                  >
                    {workload.signatureStatus}
                  </span>
                </div>
                <div
                  className={stylexClassName(
                    "mt-1 break-all font-mono text-[9px] text-(--fg-tertiary)"
                  )}
                >
                  {workload.artifactDigest}
                </div>
                <dl
                  className={stylexClassName(
                    "mt-2 grid grid-cols-[80px_minmax(0,1fr)] gap-x-2 text-[10px]"
                  )}
                >
                  <dt>SBOM</dt>
                  <dd className={stylexClassName("break-all")}>
                    {workload.sbomReference}
                  </dd>
                  <dt>provenance</dt>
                  <dd className={stylexClassName("break-all")}>
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
            className={stylexClassName(
              "grid grid-cols-[90px_minmax(0,1fr)] gap-x-2 text-[10px]"
            )}
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
          <div className={stylexClassName("mt-2 flex flex-col gap-2")}>
            {data.configuration.secretReferences.length === 0 ? (
              <EmptyLine text="No Secret References recorded." />
            ) : (
              data.configuration.secretReferences.map((reference) => (
                <article
                  className={stylexClassName(
                    "border border-(--line) bg-(--bg-panel-muted) p-2 text-[10px]"
                  )}
                  key={reference.referenceId}
                >
                  <div className={stylexClassName("font-mono")}>
                    {reference.referenceId}
                  </div>
                  <div className={stylexClassName("text-(--fg-tertiary)")}>
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
        <div className={stylexClassName("grid gap-2 md:grid-cols-2")}>
          {data.deployments.length === 0 ? (
            <EmptyLine text="No environment Deployment observation recorded." />
          ) : (
            data.deployments.map((deployment) => (
              <article
                className={stylexClassName(
                  "border border-(--line) bg-(--bg-panel-muted) p-2 text-[10px]"
                )}
                key={`${deployment.environment}:${deployment.observedReleaseId}`}
              >
                <div className={stylexClassName("flex font-mono")}>
                  <span>{deployment.environment}</span>
                  <span
                    className={stylexClassName(
                      "ml-auto uppercase text-(--fg-tertiary)"
                    )}
                  >
                    {deployment.drifted
                      ? "drifted"
                      : deployment.fresh
                        ? "current"
                        : "stale"}
                  </span>
                </div>
                <div
                  className={stylexClassName(
                    "mt-1 break-all text-(--fg-tertiary)"
                  )}
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
            className={stylexClassName(
              "mt-2 text-[10px] text-(--fg-secondary)"
            )}
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
          <div className={stylexClassName("grid gap-2 md:grid-cols-2")}>
            {data.canaryObservations.map((observation) => (
              <article
                className={stylexClassName(
                  "border border-(--line) bg-(--bg-panel-muted) p-2 text-[10px]"
                )}
                key={observation.observationId}
              >
                <div className={stylexClassName("flex font-mono")}>
                  <span>revision {observation.observedRevision}</span>
                  <span
                    className={stylexClassName(
                      "ml-auto uppercase text-(--fg-tertiary)"
                    )}
                  >
                    {observation.fresh ? "fresh" : "stale"}
                  </span>
                </div>
                <dl
                  className={stylexClassName(
                    "mt-2 grid grid-cols-[110px_minmax(0,1fr)] gap-x-2"
                  )}
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
                <p className={stylexClassName("mt-2 text-(--fg-tertiary)")}>
                  workloads{" "}
                  {Object.entries(observation.workloadReadiness)
                    .map(
                      ([id, ready]) => `${id}:${ready ? "ready" : "not-ready"}`
                    )
                    .join(", ") || "none"}
                </p>
                <p className={stylexClassName("text-(--fg-tertiary)")}>
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
        <div className={stylexClassName("grid")}>
          {gaEvidenceItems(data.gaOperations).length === 0 ? (
            <EmptyLine text="No GA support, recovery, performance, disaster, Contract, or security evidence recorded." />
          ) : (
            gaEvidenceItems(data.gaOperations).map(({ label, evidence }) => (
              <article
                className={stylexClassName(
                  "grid grid-cols-[150px_minmax(0,1fr)] gap-3 border-t border-(--line) px-3 py-2 text-[10px] first:border-t-0 hover:bg-(--bg-row-hover)"
                )}
                key={`${label}:${evidence.protocol}:${evidence.evidenceId}`}
              >
                <div
                  className={stylexClassName(
                    "grid content-start gap-1 font-mono"
                  )}
                >
                  <span>{label}</span>
                  <span className={gaStatusClass(evidence)}>
                    {evidence.stale ? "stale" : evidence.status}
                  </span>
                </div>
                <div
                  className={stylexClassName(
                    "break-all font-mono text-[9px] text-(--fg-tertiary)"
                  )}
                >
                  {evidence.evidenceId}
                </div>
                <dl
                  className={stylexClassName(
                    "grid grid-cols-[90px_minmax(0,1fr)] gap-x-2"
                  )}
                >
                  {Object.entries(evidence.subjects).map(([key, value]) => (
                    <div className={stylexClassName("contents")} key={key}>
                      <dt>{key}</dt>
                      <dd className={stylexClassName("break-all")}>
                        {key === "storyId" ? (
                          <a
                            className={stylexClassName("text-(--accent)")}
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
                  <details className={stylexClassName("mt-2")}>
                    <summary
                      className={stylexClassName(
                        "cursor-pointer text-(--accent)"
                      )}
                    >
                      exact evidence
                    </summary>
                    <pre
                      className={stylexClassName(
                        "mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all border border-(--line) p-2 text-[9px] text-(--fg-tertiary)"
                      )}
                    >
                      {JSON.stringify(evidence.details, null, 2)}
                    </pre>
                  </details>
                ) : null}
                {evidence.issueCodes.length > 0 ? (
                  <p
                    className={stylexClassName(
                      "mt-2 font-mono text-[9px] text-(--danger)"
                    )}
                  >
                    {evidence.issueCodes.join(", ")}
                  </p>
                ) : null}
                {evidence.nextActions.map((action) => (
                  <p
                    className={stylexClassName("mt-1 text-(--accent)")}
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
        className={stylexClassName("border-t border-(--line) p-3")}
      >
        <h3 className={stylexClassName("mb-2 font-mono text-[10px] uppercase")}>
          Promotion, canary, and rollback timeline
        </h3>
        {timeline.length === 0 ? (
          <EmptyLine text="No rollout timeline evidence recorded." />
        ) : (
          <ol className={stylexClassName("grid")}>
            {timeline.map((entry) => (
              <li
                className={stylexClassName(
                  "grid grid-cols-[96px_minmax(0,1fr)_minmax(120px,0.7fr)] gap-3 border-t border-(--line) px-3 py-2 first:border-t-0"
                )}
                key={`${entry.protocol}:${entry.artifactId}`}
              >
                <div
                  className={stylexClassName(
                    "font-mono text-[9px] text-(--fg-tertiary)"
                  )}
                >
                  {entry.state}
                </div>
                <div className={stylexClassName("break-all text-[10px]")}>
                  {entry.protocol}
                </div>
                <div
                  className={stylexClassName(
                    "font-mono text-[9px] text-(--fg-tertiary)"
                  )}
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
          className={stylexClassName("border-t border-(--line) p-3")}
        >
          {data.issues.map((issue) => (
            <article
              className={stylexClassName(
                "grid grid-cols-[minmax(140px,0.5fr)_minmax(0,1fr)] gap-3 border-b border-(--line) px-3 py-2 last:border-b-0"
              )}
              key={`${issue.code}:${issue.message}`}
            >
              <h3
                className={stylexClassName(
                  "font-mono text-[10px] font-semibold"
                )}
              >
                {issue.code}
              </h3>
              <p
                className={stylexClassName("text-[11px] text-(--fg-secondary)")}
              >
                {issue.message}
              </p>
              <p
                className={stylexClassName("text-[10px] text-(--fg-tertiary)")}
              >
                remediation: {issue.remediation}
              </p>
              {issue.nextActions.map((action) => (
                <p
                  className={stylexClassName(
                    "font-mono text-[9px] text-(--accent)"
                  )}
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
        className={stylexClassName(
          "flex items-center gap-2 border-t border-(--line) px-3 py-2 text-[10px] text-(--fg-tertiary)"
        )}
      >
        <ShieldCheck aria-hidden="true" size={12} /> Console only reads redacted
        delivery evidence and holds no cluster, signing, or Secret Provider
        authority.
      </footer>
    </section>
  );
}

function gaStatusClass(evidence: DeliveryConsoleGaEvidence): string {
  if (evidence.stale || evidence.status === "partial") {
    return "text-(--warning)";
  }
  if (
    ["passed", "supported", "general_availability"].includes(evidence.status)
  ) {
    return "text-(--success)";
  }
  if (["unknown", "unavailable"].includes(evidence.status)) {
    return "text-(--fg-tertiary)";
  }
  return "text-(--danger)";
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
    <section className={stylexClassName("bg-(--bg-panel) p-3")}>
      <h3 className={stylexClassName("mb-2 font-mono text-[10px] uppercase")}>
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
      className={stylexClassName(
        "mt-1 flex flex-wrap gap-2 font-mono text-[9px]"
      )}
    >
      {references.map((reference) => (
        <a
          className={stylexClassName("text-(--accent)")}
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
    <div className={stylexClassName("bg-(--bg-panel) p-3")}>
      <div
        className={stylexClassName(
          "font-mono text-[9px] uppercase text-(--fg-tertiary)"
        )}
      >
        {label}
      </div>
      <div className={stylexClassName("mt-1 break-all text-[11px]")}>
        {value}
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className={stylexClassName("text-[10px] text-(--fg-tertiary)")}>
      {text}
    </p>
  );
}

function DeliveryMessage({ role, text }: { role?: "alert"; text: string }) {
  return (
    <section
      aria-label="Production delivery"
      className={stylexClassName(
        "border-b border-(--line) bg-(--bg-panel) p-3 text-[11px] text-(--fg-tertiary)"
      )}
      role={role}
    >
      {text}
    </section>
  );
}
