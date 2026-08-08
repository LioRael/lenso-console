import * as stylex from "@stylexjs/stylex";
import {
  AlertTriangle,
  CheckCircle2,
  GitPullRequestArrow,
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
  utilityMdGridCols3: {
    "@media (min-width: 768px)": {
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    },
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityMinH9: {
    minHeight: "calc(0.25rem * 9)",
  },
  utilityGridCols96pxMinmax01frMinmax140px07fr: {
    gridTemplateColumns: "96px minmax(0,1fr) minmax(140px,0.7fr)",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityBorderT: {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
  },
  utilityPy15: {
    paddingBlock: "calc(0.25rem * 1.5)",
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
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityText9px: {
    fontSize: "9px",
  },
  utilityP3: {
    padding: "calc(0.25rem * 3)",
  },
  utilityMb2: {
    marginBottom: "calc(0.25rem * 2)",
  },
  utilityBorderL2: {
    borderLeftStyle: "solid",
    borderLeftWidth: "2px",
  },
  utilityBorderDanger: {
    borderColor: "var(--danger)",
  },
  utilityPl2: {
    paddingLeft: "calc(0.25rem * 2)",
  },
  utilityGridColsMinmax140px06frMinmax01frMinmax140px07fr: {
    gridTemplateColumns:
      "minmax(140px,0.6fr) minmax(0,1fr) minmax(140px,0.7fr)",
  },
  utilityLastBorderB0: {
    ":last-child": {
      borderBottomWidth: "0px",
    },
  },
  utilityCursorPointer: {
    cursor: "pointer",
  },
  utilityMt2: {
    marginTop: "calc(0.25rem * 2)",
  },
  utilityMl2: {
    marginLeft: "calc(0.25rem * 2)",
  },
  utilityMt1: {
    marginTop: "calc(0.25rem * 1)",
  },
});

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
          id="extraction-heading"
        >
          Module extraction
        </h2>
        <span
          aria-label={`Extraction state: ${data.state}`}
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
          localStyles.utilityMdGridCols3,
        ])}
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
        {...stylex.props([localStyles.utilityGrid])}
      >
        {data.timeline.length === 0 ? (
          <li
            {...stylex.props([
              localStyles.utilityText11px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            No phase evidence yet.
          </li>
        ) : (
          data.timeline.map((phase) => (
            <li
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityMinH9,
                localStyles.utilityGridCols96pxMinmax01frMinmax140px07fr,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap3,
                localStyles.utilityBorderT,
                localStyles.utilityBorderLine,
                localStyles.utilityPx3,
                localStyles.utilityPy15,
                localStyles.utilityText10px,
                localStyles.utilityFirstBorderT0,
                localStyles.utilityHoverBgBgRowHover,
              ])}
              key={`${phase.phaseId}:${phase.artifactId}`}
            >
              <div {...stylex.props([localStyles.utilityTextFgTertiary])}>
                {phase.state}
              </div>
              <div
                {...stylex.props([
                  localStyles.utilityTruncate,
                  localStyles.utilityText11px,
                  localStyles.utilityTextFgPrimary,
                ])}
              >
                {phase.phaseId}
              </div>
              <div
                {...stylex.props([
                  localStyles.utilityTruncate,
                  localStyles.utilityFontMono,
                  localStyles.utilityText9px,
                  localStyles.utilityTextFgTertiary,
                ])}
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
          {...stylex.props([
            localStyles.utilityBorderT,
            localStyles.utilityBorderLine,
            localStyles.utilityP3,
          ])}
        >
          {data.blockers.map((blocker) => (
            <article
              {...stylex.props([
                localStyles.utilityMb2,
                localStyles.utilityBorderL2,
                localStyles.utilityBorderDanger,
                localStyles.utilityPl2,
              ])}
              key={`${blocker.artifactId}:${blocker.code}:${blocker.subject}`}
            >
              <h3
                {...stylex.props([
                  localStyles.utilityFontMono,
                  localStyles.utilityText10px,
                  localStyles.utilityFontSemibold,
                ])}
              >
                {blocker.code} / {blocker.subject}
              </h3>
              <p
                {...stylex.props([
                  localStyles.utilityText11px,
                  localStyles.utilityTextFgSecondary,
                ])}
              >
                {blocker.detail}
              </p>
              {blocker.nextActions.map((action) => (
                <p
                  {...stylex.props([
                    localStyles.utilityFontMono,
                    localStyles.utilityText9px,
                    localStyles.utilityTextFgTertiary,
                  ])}
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
            Approval boundaries
          </h3>
          {data.approvalBoundaries.map((boundary) => (
            <article
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityGridColsMinmax140px06frMinmax01frMinmax140px07fr,
                localStyles.utilityGap3,
                localStyles.utilityBorderB,
                localStyles.utilityBorderLine,
                localStyles.utilityPx3,
                localStyles.utilityPy2,
                localStyles.utilityLastBorderB0,
              ])}
              key={boundary.boundaryId}
            >
              <div
                {...stylex.props([
                  localStyles.utilityFontMono,
                  localStyles.utilityText10px,
                ])}
              >
                {boundary.action} · {boundary.phaseId}
              </div>
              <p
                {...stylex.props([
                  localStyles.utilityText11px,
                  localStyles.utilityTextFgSecondary,
                ])}
              >
                {boundary.reason}
              </p>
              <p
                {...stylex.props([
                  localStyles.utilityFontMono,
                  localStyles.utilityText9px,
                  localStyles.utilityTextFgTertiary,
                ])}
              >
                required pins: {boundary.requiredPins.join(", ") || "none"}
              </p>
            </article>
          ))}
        </div>
      ) : null}
      <details
        {...stylex.props([
          localStyles.utilityBorderT,
          localStyles.utilityBorderLine,
          localStyles.utilityP3,
        ])}
      >
        <summary
          {...stylex.props([
            localStyles.utilityCursorPointer,
            localStyles.utilityFontMono,
            localStyles.utilityText10px,
            localStyles.utilityUppercase,
          ])}
        >
          Evidence provenance ({data.evidence.length})
        </summary>
        {data.evidence.map((item) => (
          <div
            {...stylex.props([
              localStyles.utilityMt2,
              localStyles.utilityText10px,
            ])}
            key={`${item.artifactId}:${item.kind}:${item.digest}`}
          >
            <span {...stylex.props([localStyles.utilityFontMono])}>
              {item.kind} / {item.subject}
            </span>
            <span
              {...stylex.props([
                localStyles.utilityMl2,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              {item.detail}
            </span>
            <span
              {...stylex.props([
                localStyles.utilityMl2,
                localStyles.utilityFontMono,
                localStyles.utilityTextAccent,
              ])}
            >
              <ArtifactLink artifactId={item.artifactId} planId={data.planId} />
            </span>
          </div>
        ))}
      </details>
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
        {...stylex.props([localStyles.utilityMt1, localStyles.utilityText11px])}
      >
        {value}
      </div>
    </div>
  );
}
function ExtractionMessage({ role, text }: { role?: "alert"; text: string }) {
  return (
    <section
      aria-label="Module extraction"
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
