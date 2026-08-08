import type {
  ExecutionNode,
  FederatedReliabilityEvidence,
  FederatedStoryGap,
  FederatedWorkflowEntity,
  RuntimeStory,
} from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

const localStyles = stylex.create({
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgPanelMuted: {
    backgroundColor: "var(--bg-panel-muted)",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityPy2: {
    paddingBlock: "calc(0.25rem * 2)",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityFlex1: {
    flex: "1",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityUppercase: {
    textTransform: "uppercase",
  },
  utilityTracking008em: {
    letterSpacing: "0.08em",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityMt05: {
    marginTop: "calc(0.25rem * 0.5)",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBgBgControl: {
    backgroundColor: "var(--bg-control)",
  },
  utilityPx15: {
    paddingInline: "calc(0.25rem * 1.5)",
  },
  utilityPy05: {
    paddingBlock: "calc(0.25rem * 0.5)",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityMt2: {
    marginTop: "calc(0.25rem * 2)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityMaxH52: {
    maxHeight: "calc(0.25rem * 52)",
  },
  utilityGridCols3: {
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityMaxXlGridCols1: {
    "@media (max-width: 1279px)": {
      gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    },
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
  },
  utilityText9px: {
    fontSize: "9px",
  },
  utilityTextFgQuaternary: {
    color: "var(--fg-quaternary)",
  },
  utilityGridColsMinmax01frAuto: {
    gridTemplateColumns: "minmax(0,1fr) auto",
  },
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityPx2: {
    paddingInline: "calc(0.25rem * 2)",
  },
  utilityPy15: {
    paddingBlock: "calc(0.25rem * 1.5)",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilityTransition: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityHoverBorderLineStrong: {
    ":hover": {
      borderColor: "var(--line-strong)",
    },
  },
  utilityDisabledCursorDefault: {
    ":disabled": {
      cursor: "default",
    },
  },
  utilityBlock: {
    display: "block",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityTextToneSuccessFg: {
    color: "var(--tone-success-fg)",
  },
  utilityBgBgPanel: {
    backgroundColor: "var(--bg-panel)",
  },
  utilityCursorPointer: {
    cursor: "pointer",
  },
  utilityListNone: {
    listStyleType: "none",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityTracking006em: {
    letterSpacing: "0.06em",
  },
  utilityFocusVisibleOutline2: {
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "2px",
    },
  },
  utilityFocusVisibleOutlineFocusRing: {
    ":focus-visible": {
      outlineColor: "var(--focus-ring)",
    },
  },
  utilityPx1: {
    paddingInline: "calc(0.25rem * 1)",
  },
  utilityP2: {
    padding: "calc(0.25rem * 2)",
  },
  utilityBorderVarToneWarningBorder: {
    borderColor: "var(--tone-warning-border)",
  },
  utilityBgVarToneWarningBg: {
    backgroundColor: "var(--tone-warning-bg)",
  },
  utilityMt1: {
    marginTop: "calc(0.25rem * 1)",
  },
  utilityTextToneWarningFg: {
    color: "var(--tone-warning-fg)",
  },
  utilityFlexWrap: {
    flexWrap: "wrap",
  },
  utilityLineClamp2: {
    overflow: "hidden",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: "2",
  },
  utilityTracking004em: {
    letterSpacing: "0.04em",
  },
});

const workflowKindOrder: FederatedWorkflowEntity["kind"][] = [
  "instance",
  "step",
  "attempt",
  "timer",
  "child",
  "compensation",
  "intervention",
];

export function FederatedStoryEvidencePanel({
  onSelectNode,
  story,
}: {
  onSelectNode: (node: ExecutionNode) => void;
  story: RuntimeStory;
}) {
  const evidence = story.federation;
  if (!evidence) {
    return null;
  }

  const nodeById = new Map(story.nodes.map((node) => [node.id, node]));
  const entitiesByKind = new Map(
    workflowKindOrder.map((kind) => [
      kind,
      evidence.workflowEntities.filter((entity) => entity.kind === kind),
    ])
  );

  return (
    <section
      aria-label="Federated workflow evidence"
      {...stylex.props([
        localStyles.utilityBorderB,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgPanelMuted,
        localStyles.utilityPx3,
        localStyles.utilityPy2,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityMinW0,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap3,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityMinW0,
            localStyles.utilityFlex1,
          ])}
        >
          <h2
            {...stylex.props([
              localStyles.utilityTruncate,
              localStyles.utilityFontMono,
              localStyles.utilityText11px,
              localStyles.utilityFontSemibold,
              localStyles.utilityUppercase,
              localStyles.utilityTracking008em,
              localStyles.utilityTextFgPrimary,
            ])}
          >
            Federated Runtime Story
          </h2>
          <p
            {...stylex.props([
              localStyles.utilityMt05,
              localStyles.utilityTruncate,
              localStyles.utilityFontMono,
              localStyles.utilityText10px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {evidence.protocol} · {story.nodes.length} cross-Service nodes ·{" "}
            {evidence.gaps.length} Segment gaps
          </p>
        </div>
        {evidence.tenantId ? (
          <span
            {...stylex.props([
              localStyles.utilityShrink0,
              localStyles.utilityBorder,
              localStyles.utilityBorderLine,
              localStyles.utilityBgBgControl,
              localStyles.utilityPx15,
              localStyles.utilityPy05,
              localStyles.utilityFontMono,
              localStyles.utilityText10px,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            tenant {evidence.tenantId}
          </span>
        ) : null}
      </div>

      <div
        {...stylex.props([
          localStyles.utilityMt2,
          localStyles.utilityGrid,
          localStyles.utilityMaxH52,
          localStyles.utilityGridCols3,
          localStyles.utilityGap2,
          localStyles.utilityOverflowAuto,
          localStyles.utilityMaxXlGridCols1,
        ])}
      >
        <EvidenceDisclosure
          count={evidence.workflowEntities.length}
          label="Workflow states"
        >
          {workflowKindOrder.map((kind) => {
            const entities = entitiesByKind.get(kind) ?? [];
            if (entities.length === 0) {
              return null;
            }
            return (
              <div
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilityGap1,
                ])}
                key={kind}
              >
                <h3
                  {...stylex.props([
                    localStyles.utilityFontMono,
                    localStyles.utilityText9px,
                    localStyles.utilityFontSemibold,
                    localStyles.utilityUppercase,
                    localStyles.utilityTracking008em,
                    localStyles.utilityTextFgQuaternary,
                  ])}
                >
                  {workflowKindLabel(kind)}
                </h3>
                <ul
                  {...stylex.props([
                    localStyles.utilityGrid,
                    localStyles.utilityGap1,
                  ])}
                >
                  {entities.map((entity) => {
                    const node = nodeById.get(entity.nodeId);
                    return (
                      <li key={`${entity.kind}:${entity.id}`}>
                        <button
                          aria-label={`Inspect ${entity.kind} ${entity.label} in ${entity.state} state`}
                          {...stylex.props([
                            localStyles.utilityGrid,
                            localStyles.utilityMinW0,
                            localStyles.utilityGridColsMinmax01frAuto,
                            localStyles.utilityGap2,
                            localStyles.utilityBorder,
                            localStyles.utilityBorderLine,
                            localStyles.utilityBgBgCanvas,
                            localStyles.utilityPx2,
                            localStyles.utilityPy15,
                            localStyles.utilityTextLeft,
                            localStyles.utilityTransition,
                            localStyles.utilityHoverBorderLineStrong,
                            localStyles.utilityDisabledCursorDefault,
                          ])}
                          disabled={!node}
                          onClick={() => {
                            if (node) {
                              onSelectNode(node);
                            }
                          }}
                          type="button"
                        >
                          <span {...stylex.props([localStyles.utilityMinW0])}>
                            <span
                              {...stylex.props([
                                localStyles.utilityBlock,
                                localStyles.utilityTruncate,
                                localStyles.utilityText11px,
                                localStyles.utilityFontMedium,
                                localStyles.utilityTextFgPrimary,
                              ])}
                            >
                              {entity.label}
                            </span>
                            <span
                              {...stylex.props([
                                localStyles.utilityBlock,
                                localStyles.utilityTruncate,
                                localStyles.utilityFontMono,
                                localStyles.utilityText9px,
                                localStyles.utilityTextFgQuaternary,
                              ])}
                            >
                              {entity.serviceId} · attempt {entity.attempt}
                            </span>
                          </span>
                          <EvidenceState state={entity.state} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </EvidenceDisclosure>

        <EvidenceDisclosure count={evidence.gaps.length} label="Segment gaps">
          {evidence.gaps.length === 0 ? (
            <p
              {...stylex.props([
                localStyles.utilityFontMono,
                localStyles.utilityText10px,
                localStyles.utilityTextToneSuccessFg,
              ])}
            >
              No missing Segment evidence is currently reported.
            </p>
          ) : (
            <ul
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityGap1,
              ])}
            >
              {evidence.gaps.map((gap) => (
                <GapEvidence
                  gap={gap}
                  key={`${gap.sourceServiceId}:${gap.kind}`}
                />
              ))}
            </ul>
          )}
        </EvidenceDisclosure>

        <EvidenceDisclosure
          count={evidence.reliability.length}
          label="Reliability evidence"
        >
          {evidence.reliability.length === 0 ? (
            <p
              {...stylex.props([
                localStyles.utilityFontMono,
                localStyles.utilityText10px,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              No Reliability Report was collected with this story.
            </p>
          ) : (
            <ul
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityGap1,
              ])}
            >
              {evidence.reliability.map((reliability) => (
                <ReliabilityEvidence
                  evidence={reliability}
                  key={reliability.sourceServiceId}
                />
              ))}
            </ul>
          )}
        </EvidenceDisclosure>
      </div>
    </section>
  );
}

function EvidenceDisclosure({
  children,
  count,
  label,
}: {
  children: ReactNode;
  count: number;
  label: string;
}) {
  return (
    <details
      {...stylex.props([
        localStyles.utilityBorder,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgPanel,
      ])}
      open
    >
      <summary
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityCursorPointer,
          localStyles.utilityListNone,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityGap2,
          localStyles.utilityBorderB,
          localStyles.utilityBorderLine,
          localStyles.utilityPx2,
          localStyles.utilityPy15,
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
          localStyles.utilityFontSemibold,
          localStyles.utilityUppercase,
          localStyles.utilityTracking006em,
          localStyles.utilityTextFgSecondary,
          localStyles.utilityFocusVisibleOutline2,
          localStyles.utilityFocusVisibleOutlineFocusRing,
        ])}
      >
        <span>{label}</span>
        <span
          {...stylex.props([
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityBgBgControl,
            localStyles.utilityPx1,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          {count}
        </span>
      </summary>
      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityGap2,
          localStyles.utilityP2,
        ])}
      >
        {children}
      </div>
    </details>
  );
}

function GapEvidence({ gap }: { gap: FederatedStoryGap }) {
  return (
    <li
      aria-label={`${gapKindLabel(gap.kind)} Segment gap from ${gap.sourceServiceId}`}
      {...stylex.props([
        localStyles.utilityBorder,
        localStyles.utilityBorderVarToneWarningBorder,
        localStyles.utilityBgVarToneWarningBg,
        localStyles.utilityPx2,
        localStyles.utilityPy15,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityGap2,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityTruncate,
            localStyles.utilityText11px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgPrimary,
          ])}
        >
          {gap.sourceServiceId}
        </span>
        <EvidenceState state={gap.kind} />
      </div>
      <p
        {...stylex.props([
          localStyles.utilityMt1,
          localStyles.utilityText10px,
          localStyles.utilityTextFgSecondary,
        ])}
      >
        {gap.detail}
      </p>
      <p
        {...stylex.props([
          localStyles.utilityMt1,
          localStyles.utilityFontMono,
          localStyles.utilityText9px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        Next: {humanize(gap.nextAction)}
      </p>
    </li>
  );
}

function ReliabilityEvidence({
  evidence,
}: {
  evidence: FederatedReliabilityEvidence;
}) {
  const { report } = evidence;
  return (
    <li
      aria-label={`Reliability evidence for ${evidence.sourceServiceId}`}
      {...stylex.props([
        localStyles.utilityBorder,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgCanvas,
        localStyles.utilityPx2,
        localStyles.utilityPy15,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityGap2,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityTruncate,
            localStyles.utilityText11px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgPrimary,
          ])}
        >
          {evidence.sourceServiceId}
        </span>
        <EvidenceState state={report?.state ?? evidence.status} />
      </div>
      {report ? (
        <>
          <p
            {...stylex.props([
              localStyles.utilityMt1,
              localStyles.utilityFontMono,
              localStyles.utilityText9px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {report.profile} profile · {report.contractId}@
            {report.contractVersion}
          </p>
          <EvidenceValues label="Overrides" values={report.overrides} />
          <EvidenceValues label="Effective" values={report.effectiveValues} />
          {report.activeDegradedModes.map((mode) => (
            <p
              {...stylex.props([
                localStyles.utilityMt1,
                localStyles.utilityText10px,
                localStyles.utilityTextToneWarningFg,
              ])}
              key={`${mode.dependencyId}:${mode.mode}`}
            >
              {mode.dependencyId}: {humanize(mode.mode)}
            </p>
          ))}
          <div
            {...stylex.props([
              localStyles.utilityMt1,
              localStyles.utilityFlex,
              localStyles.utilityFlexWrap,
              localStyles.utilityGap1,
            ])}
          >
            {report.checks.map((check) => (
              <span
                {...stylex.props([
                  localStyles.utilityBorder,
                  localStyles.utilityBorderLine,
                  localStyles.utilityBgBgControl,
                  localStyles.utilityPx1,
                  localStyles.utilityPy05,
                  localStyles.utilityFontMono,
                  localStyles.utilityText9px,
                  localStyles.utilityTextFgTertiary,
                ])}
                key={check.code}
                title={check.nextActions.map(humanize).join(", ")}
              >
                {humanize(check.code)}: {check.state}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p
          {...stylex.props([
            localStyles.utilityMt1,
            localStyles.utilityText10px,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          {evidence.detail ?? "Reliability evidence is not declared."}
        </p>
      )}
    </li>
  );
}

function EvidenceValues({
  label,
  values,
}: {
  label: string;
  values: Record<string, unknown>;
}) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return null;
  }
  return (
    <p
      {...stylex.props([
        localStyles.utilityMt1,
        localStyles.utilityLineClamp2,
        localStyles.utilityFontMono,
        localStyles.utilityText9px,
        localStyles.utilityTextFgQuaternary,
      ])}
    >
      {label}:{" "}
      {entries
        .map(([key, value]) => `${humanize(key)} ${String(value)}`)
        .join(" · ")}
    </p>
  );
}

function EvidenceState({ state }: { state: string }) {
  return (
    <span
      {...stylex.props([
        localStyles.utilityShrink0,
        localStyles.utilityBorder,
        localStyles.utilityBorderLine,
        localStyles.utilityBgBgControl,
        localStyles.utilityPx1,
        localStyles.utilityPy05,
        localStyles.utilityFontMono,
        localStyles.utilityText9px,
        localStyles.utilityFontSemibold,
        localStyles.utilityUppercase,
        localStyles.utilityTracking004em,
        localStyles.utilityTextFgSecondary,
      ])}
    >
      {humanize(state)}
    </span>
  );
}

function workflowKindLabel(kind: FederatedWorkflowEntity["kind"]) {
  return kind === "child" ? "Children" : `${humanize(kind)}s`;
}

function gapKindLabel(kind: FederatedStoryGap["kind"]) {
  switch (kind) {
    case "retention_expired": {
      return "Retention expired";
    }
    default: {
      return humanize(kind);
    }
  }
}

function humanize(value: string) {
  return value
    .split(/[._-]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
