import { stylexClassName } from "@lenso/console-ui";
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
          id="extraction-heading"
        >
          Module extraction
        </h2>
        <span
          aria-label={`Extraction state: ${data.state}`}
          className={stylexClassName(
            "ml-auto font-mono text-[10px] uppercase text-(--fg-secondary)"
          )}
        >
          {data.state.replaceAll("_", " ")}
        </span>
      </header>
      <div
        className={stylexClassName("grid gap-px bg-(--line) md:grid-cols-3")}
      >
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
        className={stylexClassName("grid")}
      >
        {data.timeline.length === 0 ? (
          <li className={stylexClassName("text-[11px] text-(--fg-tertiary)")}>
            No phase evidence yet.
          </li>
        ) : (
          data.timeline.map((phase) => (
            <li
              className={stylexClassName(
                "grid min-h-9 grid-cols-[96px_minmax(0,1fr)_minmax(140px,0.7fr)] items-center gap-3 border-t border-(--line) px-3 py-1.5 text-[10px] first:border-t-0 hover:bg-(--bg-row-hover)"
              )}
              key={`${phase.phaseId}:${phase.artifactId}`}
            >
              <div className={stylexClassName("text-(--fg-tertiary)")}>
                {phase.state}
              </div>
              <div
                className={stylexClassName(
                  "truncate text-[11px] text-(--fg-primary)"
                )}
              >
                {phase.phaseId}
              </div>
              <div
                className={stylexClassName(
                  "truncate font-mono text-[9px] text-(--fg-tertiary)"
                )}
              >
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
          className={stylexClassName("border-t border-(--line) p-3")}
        >
          {data.blockers.map((blocker) => (
            <article
              className={stylexClassName(
                "mb-2 border-l-2 border-(--danger) pl-2"
              )}
              key={`${blocker.artifactId}:${blocker.code}:${blocker.subject}`}
            >
              <h3
                className={stylexClassName(
                  "font-mono text-[10px] font-semibold"
                )}
              >
                {blocker.code} / {blocker.subject}
              </h3>
              <p
                className={stylexClassName("text-[11px] text-(--fg-secondary)")}
              >
                {blocker.detail}
              </p>
              {blocker.nextActions.map((action) => (
                <p
                  className={stylexClassName(
                    "font-mono text-[9px] text-(--fg-tertiary)"
                  )}
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
          className={stylexClassName("border-t border-(--line) p-3")}
        >
          <h3
            className={stylexClassName("mb-2 font-mono text-[10px] uppercase")}
          >
            Approval boundaries
          </h3>
          {data.approvalBoundaries.map((boundary) => (
            <article
              className={stylexClassName(
                "grid grid-cols-[minmax(140px,0.6fr)_minmax(0,1fr)_minmax(140px,0.7fr)] gap-3 border-b border-(--line) px-3 py-2 last:border-b-0"
              )}
              key={boundary.boundaryId}
            >
              <div className={stylexClassName("font-mono text-[10px]")}>
                {boundary.action} · {boundary.phaseId}
              </div>
              <p
                className={stylexClassName("text-[11px] text-(--fg-secondary)")}
              >
                {boundary.reason}
              </p>
              <p
                className={stylexClassName(
                  "font-mono text-[9px] text-(--fg-tertiary)"
                )}
              >
                required pins: {boundary.requiredPins.join(", ") || "none"}
              </p>
            </article>
          ))}
        </div>
      ) : null}
      <details className={stylexClassName("border-t border-(--line) p-3")}>
        <summary
          className={stylexClassName(
            "cursor-pointer font-mono text-[10px] uppercase"
          )}
        >
          Evidence provenance ({data.evidence.length})
        </summary>
        {data.evidence.map((item) => (
          <div
            className={stylexClassName("mt-2 text-[10px]")}
            key={`${item.artifactId}:${item.kind}:${item.digest}`}
          >
            <span className={stylexClassName("font-mono")}>
              {item.kind} / {item.subject}
            </span>
            <span className={stylexClassName("ml-2 text-(--fg-tertiary)")}>
              {item.detail}
            </span>
            <span className={stylexClassName("ml-2 font-mono text-(--accent)")}>
              <ArtifactLink artifactId={item.artifactId} planId={data.planId} />
            </span>
          </div>
        ))}
      </details>
      <footer
        className={stylexClassName(
          "flex items-center gap-2 border-t border-(--line) px-3 py-2 text-[10px] text-(--fg-tertiary)"
        )}
      >
        <ShieldCheck aria-hidden="true" size={12} /> Console is read-only and
        does not evaluate or apply Cutover rules.
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
    <div className={stylexClassName("bg-(--bg-panel) p-3")}>
      <div
        className={stylexClassName(
          "font-mono text-[9px] uppercase text-(--fg-tertiary)"
        )}
      >
        {label}
      </div>
      <div className={stylexClassName("mt-1 text-[11px]")}>{value}</div>
    </div>
  );
}
function ExtractionMessage({ role, text }: { role?: "alert"; text: string }) {
  return (
    <section
      aria-label="Module extraction"
      className={stylexClassName(
        "border-b border-(--line) bg-(--bg-panel) p-3 text-[11px] text-(--fg-tertiary)"
      )}
      role={role}
    >
      {text}
    </section>
  );
}
