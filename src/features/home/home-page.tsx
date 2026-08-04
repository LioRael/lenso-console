import { useConsoleLocale } from "@lenso/console-ui-internal";
import { ArrowRight } from "lucide-react";

import {
  type HomeEvidenceItem,
  useHomeEvidence,
} from "../console-data/use-console-product-data";
import { ProductPage } from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

type HomeDecision = {
  action: string;
  detail: string;
  id: string;
  name: string;
  tone: HomeEvidenceItem["tone"] | "primary";
};

type HomeEvidenceRow = HomeEvidenceItem & {
  displayTime?: string;
};

const demoDecisions: HomeDecision[] = [
  {
    action: "Review",
    detail: "Permission policy change requires approval",
    id: "chg_01J7Q9",
    name: "auth-policy-v7",
    tone: "warning",
  },
  {
    action: "Inspect",
    detail: "Agent plan is applying across 3 services",
    id: "chg_01J7PZ",
    name: "billing-sync",
    tone: "neutral",
  },
  {
    action: "Open",
    detail: "Release verified; evidence bundle complete",
    id: "rel_01J7PX",
    name: "runtime-0.3.34",
    tone: "success",
  },
  {
    action: "Open",
    detail: "Draft plan has no material risk delta",
    id: "chg_01J7PW",
    name: "customer-index",
    tone: "primary",
  },
];

const demoEvidence: HomeEvidenceRow[] = [
  {
    detail: "auth-policy-v7 · Leo",
    displayTime: "12:04:18",
    id: "approval-recorded",
    occurredAt: "2026-08-04T04:04:18.000Z",
    title: "Approval recorded",
    tone: "success",
  },
  {
    detail: "billing-sync · 3/3 services",
    displayTime: "12:03:51",
    id: "verification-passed",
    occurredAt: "2026-08-04T04:03:51.000Z",
    title: "Verification passed",
    tone: "success",
  },
  {
    detail: "scope: runtime.config",
    displayTime: "12:02:09",
    id: "agent-plan-bounded",
    occurredAt: "2026-08-04T04:02:09.000Z",
    title: "Agent plan bounded",
    tone: "neutral",
  },
  {
    detail: "rel_01J7PX · 14 artifacts",
    displayTime: "11:58:44",
    id: "evidence-attached",
    occurredAt: "2026-08-04T03:58:44.000Z",
    title: "Evidence attached",
    tone: "success",
  },
  {
    detail: "customer-index · pre-apply",
    displayTime: "11:54:12",
    id: "recovery-point-stored",
    occurredAt: "2026-08-04T03:54:12.000Z",
    title: "Recovery point stored",
    tone: "neutral",
  },
];

export function HomePage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const { changes, evidence, mode, summary: summaryQuery } = useHomeEvidence();
  const summary = summaryQuery.data;
  const decisions: HomeDecision[] =
    mode === "demo"
      ? demoDecisions
      : changes.rows.slice(0, 4).map((item) => ({
          action: copy.home.viewAll,
          detail: item.detail,
          id: item.id,
          name: item.name,
          tone: item.tone,
        }));
  const displayedEvidence: HomeEvidenceRow[] =
    mode === "demo" ? demoEvidence : evidence.slice(0, 5);
  const healthy = mode === "demo" || summary?.status === "healthy";
  const activeRuntime =
    mode === "demo"
      ? "12 / 12"
      : String(
          summary
            ? summary.outbox.pending +
                summary.outbox.processing +
                summary.functions.pending +
                summary.functions.running
            : 0
        );
  const attention = decisions.filter(
    (item) => item.tone === "warning" || item.tone === "error"
  ).length;
  const activeChangesNote = `${attention} ${attention === 1 ? "needs" : "need"} review`;

  return (
    <ProductPage
      description={copy.home.description}
      meta={<ScopeBadge label="Production" mode={mode} tone="success" />}
      pageClassName="home-page"
      title={copy.home.title}
    >
      <div className="grid h-[74px] grid-cols-4 items-center border-y border-(--line-subtle)">
        <Metric
          label={copy.home.runtime}
          note={
            mode === "demo"
              ? "healthy"
              : healthy
                ? "healthy"
                : (summary?.status ?? "loading")
          }
          value={activeRuntime}
        />
        <Metric
          label={copy.home.activeChanges}
          note={activeChangesNote}
          value={mode === "demo" ? "3" : String(decisions.length)}
        />
        <Metric
          label={copy.home.awaitingApproval}
          note="bounded action"
          value={String(mode === "demo" ? 1 : attention)}
        />
        <Metric
          label={copy.home.evidenceLag}
          note={mode === "demo" ? "within target" : "latest observation"}
          value={
            mode === "live" && displayedEvidence[0]
              ? relativeSeconds(displayedEvidence[0].occurredAt)
              : mode === "demo"
                ? "42s"
                : "—"
          }
        />
      </div>
      <div className="grid h-[618px] min-h-0 grid-cols-[minmax(0,1fr)_376px] overflow-hidden">
        <section className="h-[618px] min-h-0 overflow-hidden pr-7 pt-7">
          <header className="flex h-[38px] items-center border-b border-(--line-subtle)">
            <h2 className="text-[15px] font-medium leading-[22px]">
              {copy.home.decisionQueue}
            </h2>
            <a
              className="ml-auto inline-flex items-center gap-1 text-[11px] leading-4 text-(--fg-secondary) hover:text-(--fg-primary)"
              href="/changes"
            >
              {copy.home.viewAll} <ArrowRight size={12} />
            </a>
          </header>
          {decisions.map((item) => (
            <article
              className="grid h-[88px] min-h-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-(--line-subtle)"
              key={item.id}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className="relative h-[18px] w-[7px] shrink-0"
                >
                  <span
                    className={`absolute left-0 top-[5.5px] size-[7px] rounded-full ${decisionToneClass(item.tone)}`}
                  />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-medium leading-[18px]">
                    {item.name}
                  </h3>
                  <p className="mt-[3px] text-[11px] leading-4 text-(--fg-secondary)">
                    {item.detail}
                  </p>
                  <p className="mt-[3px] font-mono text-[10px] leading-[14px] text-(--fg-tertiary)">
                    {item.id}
                  </p>
                </div>
              </div>
              <a
                className="flex items-center gap-1 self-center text-[11px] leading-4 text-(--fg-secondary) hover:text-(--fg-primary)"
                href="/changes"
              >
                {item.action} <ArrowRight size={12} />
              </a>
            </article>
          ))}
        </section>
        <aside className="home-page__evidence-pane h-[618px] min-h-0 overflow-hidden pl-7 pt-7">
          <header className="flex h-[38px] items-center border-b border-(--line-subtle)">
            <h2 className="text-[15px] font-medium leading-[22px]">
              {copy.home.liveEvidence}
            </h2>
            <span className="ml-auto text-[11px] leading-4 text-(--success)">
              {copy.home.streaming}
            </span>
          </header>
          <ol>
            {displayedEvidence.map((item) => (
              <li
                className="grid h-[72px] min-h-0 grid-cols-[8px_minmax(0,1fr)] gap-3 overflow-hidden pt-4"
                key={item.id}
              >
                <span aria-hidden="true" className="relative h-12 w-2">
                  <span className="absolute left-0 top-1 size-[6px] rounded-full bg-(--fg-tertiary)" />
                </span>
                <div className="min-w-0 overflow-hidden whitespace-nowrap">
                  <time className="block font-mono text-[10px] leading-[14px] text-(--fg-tertiary)">
                    {item.displayTime ?? timeLabel(item.occurredAt)}
                  </time>
                  <div className="mt-[2px] overflow-hidden text-ellipsis text-[12px] font-medium leading-4">
                    {item.title}
                  </div>
                  <div className="mt-[2px] overflow-hidden text-ellipsis text-[11px] leading-4 text-(--fg-secondary)">
                    {item.detail}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-(--line-subtle) pt-[14px] text-[11px] leading-4 text-(--fg-secondary)">
            <p className="font-medium leading-4 text-(--fg-primary)">
              Console coordinates intent and evidence.
            </p>
            <p className="mt-1 leading-4">
              Services remain authoritative for state and effects.
            </p>
          </div>
        </aside>
      </div>
    </ProductPage>
  );
}

function decisionToneClass(tone: HomeDecision["tone"]) {
  switch (tone) {
    case "error": {
      return "bg-(--error)";
    }
    case "success": {
      return "bg-(--success)";
    }
    case "warning": {
      return "bg-(--warning)";
    }
    case "primary": {
      return "bg-(--fg-primary)";
    }
    default: {
      return "bg-(--fg-secondary)";
    }
  }
}

function ScopeBadge({
  label,
  mode,
  tone,
}: {
  label: string;
  mode: "demo" | "live";
  tone: "neutral" | "success";
}) {
  return (
    <span
      aria-label={mode === "demo" ? `${label}, demo projection` : label}
      className="inline-flex h-[30px] items-center gap-2 rounded-[var(--radius-control)] border border-(--line) px-[10px] text-[11px] font-medium leading-4 text-(--fg-secondary)"
      data-console-data-mode={mode}
      title={mode === "demo" ? "Demo projection" : undefined}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${tone === "success" ? "bg-(--success)" : "bg-(--fg-tertiary)"}`}
      />
      {label}
    </span>
  );
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour12: false });
}

function relativeSeconds(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))}s`;
}

function Metric({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="flex h-12 flex-col justify-between border-r border-(--line-subtle) px-4 first:pl-0 last:border-r-0">
      <div className="flex h-5 items-baseline gap-2">
        <strong className="text-[15px] font-medium leading-5">{value}</strong>
        <span className="text-[11px] leading-4 text-(--fg-tertiary)">
          {label}
        </span>
      </div>
      <div
        className={`text-[11px] leading-4 ${note.includes("review") ? "text-(--warning)" : "text-(--fg-secondary)"}`}
      >
        {note}
      </div>
    </div>
  );
}
