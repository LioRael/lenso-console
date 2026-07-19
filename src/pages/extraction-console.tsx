import {
  AlertTriangle,
  CheckCircle2,
  GitPullRequestArrow,
  ShieldCheck,
} from "lucide-react";

export type ExtractionConsoleState =
  | "planned"
  | "preparing"
  | "blocked"
  | "quiesced"
  | "provisional"
  | "rolled_back"
  | "committed"
  | "post_commit_rollback_blocked";

export type ExtractionConsoleProjection = {
  protocol: "lenso.extraction-console.v1";
  projectionDigest: string;
  state: ExtractionConsoleState;
  planId?: string | null;
  readinessSummary: string;
  currentAuthority: { kind: string; ownerId: string; revision: string };
  timeline: Array<{
    phaseId: string;
    kind: string;
    state: string;
    artifactId: string;
  }>;
  blockers: Array<{
    code: string;
    subject: string;
    detail: string;
    nextActions: string[];
    artifactId: string;
  }>;
  evidence: Array<{
    kind: string;
    subject: string;
    digest: string;
    detail: string;
    artifactId: string;
  }>;
  approvalBoundaries: Array<{
    boundaryId: string;
    phaseId: string;
    action: string;
    reason: string;
    requiredPins: string[];
  }>;
  readOnly: boolean;
  applyActions: string[];
  protectedWorkflow: string;
};

export function ExtractionConsolePanel({
  data,
  error,
  loading,
}: {
  data?: ExtractionConsoleProjection | undefined;
  error?: string | null | undefined;
  loading?: boolean | undefined;
}) {
  if (loading) {
    return <ExtractionMessage text="Loading extraction evidence..." />;
  }
  if (error) {
    return (
      <ExtractionMessage
        role="alert"
        text={`Extraction evidence unavailable: ${error}`}
      />
    );
  }
  if (!data) {
    return (
      <ExtractionMessage text="No extraction plan or evidence has been recorded." />
    );
  }
  const StateIcon =
    data.state === "blocked" || data.state === "post_commit_rollback_blocked"
      ? AlertTriangle
      : data.state === "committed"
        ? CheckCircle2
        : GitPullRequestArrow;
  return (
    <section
      aria-labelledby="extraction-heading"
      className="border-b border-(--line) bg-(--bg-panel)"
    >
      <header className="flex items-center gap-2 border-b border-(--line) px-3 py-2">
        <StateIcon aria-hidden="true" className="text-(--accent)" size={14} />
        <h2
          className="font-mono text-[12px] font-semibold"
          id="extraction-heading"
        >
          Module extraction
        </h2>
        <span
          aria-label={`Extraction state: ${data.state}`}
          className="ml-auto font-mono text-[10px] uppercase text-(--fg-secondary)"
        >
          {data.state.replaceAll("_", " ")}
        </span>
      </header>
      <div className="grid gap-px bg-(--line) md:grid-cols-3">
        <Summary label="readiness" value={data.readinessSummary} />
        <Summary
          label="current authority"
          value={`${data.currentAuthority.kind}: ${data.currentAuthority.ownerId} @ ${data.currentAuthority.revision}`}
        />
        <Summary
          label="protected actions"
          value={`Read-only here. Continue with ${data.protectedWorkflow}.`}
        />
      </div>
      <ol
        aria-label="Extraction phase timeline"
        className="grid gap-2 p-3 md:grid-cols-4"
      >
        {data.timeline.length === 0 ? (
          <li className="text-[11px] text-(--fg-tertiary)">
            No phase evidence yet.
          </li>
        ) : (
          data.timeline.map((phase) => (
            <li
              className="border border-(--line) bg-(--bg-panel-muted) p-2"
              key={`${phase.phaseId}:${phase.artifactId}`}
            >
              <div className="font-mono text-[10px] uppercase text-(--fg-tertiary)">
                {phase.state}
              </div>
              <div className="mt-1 text-[11px] text-(--fg-primary)">
                {phase.phaseId}
              </div>
              <div className="mt-1 break-all font-mono text-[9px] text-(--fg-tertiary)">
                <ArtifactLink
                  artifactId={phase.artifactId}
                  planId={data.planId}
                />
              </div>
            </li>
          ))
        )}
      </ol>
      {data.blockers.length > 0 ? (
        <div
          aria-label="Extraction blockers"
          className="border-t border-(--line) p-3"
        >
          {data.blockers.map((blocker) => (
            <article
              className="mb-2 border-l-2 border-(--danger) pl-2"
              key={`${blocker.artifactId}:${blocker.code}:${blocker.subject}`}
            >
              <h3 className="font-mono text-[10px] font-semibold">
                {blocker.code} / {blocker.subject}
              </h3>
              <p className="text-[11px] text-(--fg-secondary)">
                {blocker.detail}
              </p>
              {blocker.nextActions.map((action) => (
                <p
                  className="font-mono text-[9px] text-(--fg-tertiary)"
                  key={action}
                >
                  next: {action}
                </p>
              ))}
            </article>
          ))}
        </div>
      ) : null}
      {data.approvalBoundaries.length > 0 ? (
        <div
          aria-label="Extraction approval boundaries"
          className="border-t border-(--line) p-3"
        >
          <h3 className="mb-2 font-mono text-[10px] uppercase">
            Approval boundaries
          </h3>
          {data.approvalBoundaries.map((boundary) => (
            <article
              className="mb-2 border border-(--line) bg-(--bg-panel-muted) p-2"
              key={boundary.boundaryId}
            >
              <div className="font-mono text-[10px]">
                {boundary.action} · {boundary.phaseId}
              </div>
              <p className="mt-1 text-[11px] text-(--fg-secondary)">
                {boundary.reason}
              </p>
              <p className="mt-1 font-mono text-[9px] text-(--fg-tertiary)">
                required pins: {boundary.requiredPins.join(", ") || "none"}
              </p>
            </article>
          ))}
        </div>
      ) : null}
      <details className="border-t border-(--line) p-3">
        <summary className="cursor-pointer font-mono text-[10px] uppercase">
          Evidence provenance ({data.evidence.length})
        </summary>
        {data.evidence.map((item) => (
          <div
            className="mt-2 text-[10px]"
            key={`${item.artifactId}:${item.kind}:${item.digest}`}
          >
            <span className="font-mono">
              {item.kind} / {item.subject}
            </span>
            <span className="ml-2 text-(--fg-tertiary)">{item.detail}</span>
            <span className="ml-2 font-mono text-(--accent)">
              <ArtifactLink artifactId={item.artifactId} planId={data.planId} />
            </span>
          </div>
        ))}
      </details>
      <footer className="flex items-center gap-2 border-t border-(--line) px-3 py-2 text-[10px] text-(--fg-tertiary)">
        <ShieldCheck aria-hidden="true" size={12} /> Runtime Console is
        read-only and does not evaluate or apply Cutover rules.
      </footer>
    </section>
  );
}

function ArtifactLink({
  artifactId,
  planId,
}: {
  artifactId: string;
  planId: string | null | undefined;
}) {
  if (!planId) {
    return <>{artifactId}</>;
  }
  return (
    <a
      href={`/admin/runtime/extractions/${encodeURIComponent(planId)}/artifacts/${encodeURIComponent(artifactId)}`}
    >
      {artifactId}
    </a>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-(--bg-panel) p-3">
      <div className="font-mono text-[9px] uppercase text-(--fg-tertiary)">
        {label}
      </div>
      <div className="mt-1 text-[11px]">{value}</div>
    </div>
  );
}
function ExtractionMessage({ role, text }: { role?: "alert"; text: string }) {
  return (
    <section
      aria-label="Module extraction"
      className="border-b border-(--line) bg-(--bg-panel) p-3 text-[11px] text-(--fg-tertiary)"
      role={role}
    >
      {text}
    </section>
  );
}
