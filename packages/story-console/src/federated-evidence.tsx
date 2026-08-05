import type {
  ExecutionNode,
  FederatedReliabilityEvidence,
  FederatedStoryGap,
  FederatedWorkflowEntity,
  RuntimeStory,
} from "@lenso/console-ui";
import type { ReactNode } from "react";

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
      className="border-b border-(--line) bg-(--bg-panel-muted) px-3 py-2"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-(--fg-primary)">
            Federated Runtime Story
          </h2>
          <p className="mt-0.5 truncate font-mono text-[10px] text-(--fg-tertiary)">
            {evidence.protocol} · {story.nodes.length} cross-Service nodes ·{" "}
            {evidence.gaps.length} Segment gaps
          </p>
        </div>
        {evidence.tenantId ? (
          <span className="shrink-0 border border-(--line) bg-(--bg-control) px-1.5 py-0.5 font-mono text-[10px] text-(--fg-secondary)">
            tenant {evidence.tenantId}
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid max-h-52 grid-cols-3 gap-2 overflow-auto max-xl:grid-cols-1">
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
              <div className="grid gap-1" key={kind}>
                <h3 className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-(--fg-quaternary)">
                  {workflowKindLabel(kind)}
                </h3>
                <ul className="grid gap-1">
                  {entities.map((entity) => {
                    const node = nodeById.get(entity.nodeId);
                    return (
                      <li key={`${entity.kind}:${entity.id}`}>
                        <button
                          aria-label={`Inspect ${entity.kind} ${entity.label} in ${entity.state} state`}
                          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border border-(--line) bg-(--bg-canvas) px-2 py-1.5 text-left transition hover:border-(--line-strong) disabled:cursor-default"
                          disabled={!node}
                          onClick={() => {
                            if (node) {
                              onSelectNode(node);
                            }
                          }}
                          type="button"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-medium text-(--fg-primary)">
                              {entity.label}
                            </span>
                            <span className="block truncate font-mono text-[9px] text-(--fg-quaternary)">
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
            <p className="font-mono text-[10px] text-(--tone-success-fg)">
              No missing Segment evidence is currently reported.
            </p>
          ) : (
            <ul className="grid gap-1">
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
            <p className="font-mono text-[10px] text-(--fg-tertiary)">
              No Reliability Report was collected with this story.
            </p>
          ) : (
            <ul className="grid gap-1">
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
    <details className="group border border-(--line) bg-(--bg-panel)" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-(--line) px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-(--fg-secondary) focus-visible:outline-2 focus-visible:outline-(--focus-ring)">
        <span>{label}</span>
        <span className="border border-(--line) bg-(--bg-control) px-1 text-(--fg-tertiary)">
          {count}
        </span>
      </summary>
      <div className="grid gap-2 p-2">{children}</div>
    </details>
  );
}

function GapEvidence({ gap }: { gap: FederatedStoryGap }) {
  return (
    <li
      aria-label={`${gapKindLabel(gap.kind)} Segment gap from ${gap.sourceServiceId}`}
      className="border border-[var(--tone-warning-border)] bg-[var(--tone-warning-bg)] px-2 py-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium text-(--fg-primary)">
          {gap.sourceServiceId}
        </span>
        <EvidenceState state={gap.kind} />
      </div>
      <p className="mt-1 text-[10px] text-(--fg-secondary)">{gap.detail}</p>
      <p className="mt-1 font-mono text-[9px] text-(--fg-tertiary)">
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
      className="border border-(--line) bg-(--bg-canvas) px-2 py-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium text-(--fg-primary)">
          {evidence.sourceServiceId}
        </span>
        <EvidenceState state={report?.state ?? evidence.status} />
      </div>
      {report ? (
        <>
          <p className="mt-1 font-mono text-[9px] text-(--fg-tertiary)">
            {report.profile} profile · {report.contractId}@
            {report.contractVersion}
          </p>
          <EvidenceValues label="Overrides" values={report.overrides} />
          <EvidenceValues label="Effective" values={report.effectiveValues} />
          {report.activeDegradedModes.map((mode) => (
            <p
              className="mt-1 text-[10px] text-(--tone-warning-fg)"
              key={`${mode.dependencyId}:${mode.mode}`}
            >
              {mode.dependencyId}: {humanize(mode.mode)}
            </p>
          ))}
          <div className="mt-1 flex flex-wrap gap-1">
            {report.checks.map((check) => (
              <span
                className="border border-(--line) bg-(--bg-control) px-1 py-0.5 font-mono text-[9px] text-(--fg-tertiary)"
                key={check.code}
                title={check.nextActions.map(humanize).join(", ")}
              >
                {humanize(check.code)}: {check.state}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-1 text-[10px] text-(--fg-secondary)">
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
    <p className="mt-1 line-clamp-2 font-mono text-[9px] text-(--fg-quaternary)">
      {label}:{" "}
      {entries
        .map(([key, value]) => `${humanize(key)} ${String(value)}`)
        .join(" · ")}
    </p>
  );
}

function EvidenceState({ state }: { state: string }) {
  return (
    <span className="shrink-0 border border-(--line) bg-(--bg-control) px-1 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.04em] text-(--fg-secondary)">
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
