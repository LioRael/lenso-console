import { useConsoleLocale } from "@lenso/console-package-api";
import { ArrowRight } from "lucide-react";

import { useHomeEvidence } from "../console-data/use-console-product-data";
import { ProductPage, StatusDot } from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

export function HomePage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const { changes, evidence, mode, summary: summaryQuery } = useHomeEvidence();
  const summary = summaryQuery.data;
  const decisions = changes.rows.slice(0, 4);
  const healthy = summary?.status === "healthy";
  const activeRuntime = summary
    ? summary.outbox.pending +
      summary.outbox.processing +
      summary.functions.pending +
      summary.functions.running
    : 0;
  const attention = decisions.filter((item) => item.tone !== "success").length;

  return (
    <ProductPage
      description={copy.home.description}
      meta={
        <StatusDot
          label={mode === "live" ? copy.common.live : copy.common.demo}
          tone={mode === "live" ? "success" : "neutral"}
        />
      }
      title={copy.home.title}
    >
      <div className="grid h-[72px] grid-cols-4 border-b border-(--line)">
        <Metric
          label={copy.home.runtime}
          note={healthy ? "healthy" : (summary?.status ?? "loading")}
          value={String(activeRuntime)}
        />
        <Metric
          label={copy.home.activeChanges}
          note={`${attention} need review`}
          value={String(decisions.length)}
        />
        <Metric
          label={copy.home.awaitingApproval}
          note="bounded action"
          value={String(attention)}
        />
        <Metric
          label={copy.home.evidenceLag}
          note="latest observation"
          value={
            mode === "live" && evidence[0]
              ? relativeSeconds(evidence[0].occurredAt)
              : "—"
          }
        />
      </div>
      <div className="grid min-h-[620px] grid-cols-[minmax(0,1fr)_374px]">
        <section className="pr-7 pt-8">
          <header className="flex h-9 items-start border-b border-(--line)">
            <h2 className="text-[14px] font-medium">
              {copy.home.decisionQueue}
            </h2>
            <a
              className="ml-auto inline-flex items-center gap-1 text-[12px] text-(--fg-secondary) hover:text-(--fg-primary)"
              href="/changes"
            >
              {copy.home.viewAll} <ArrowRight size={12} />
            </a>
          </header>
          {decisions.map((item) => (
            <article
              className="grid min-h-[88px] grid-cols-[minmax(0,1fr)_auto] border-b border-(--line) py-4"
              key={item.id}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="pt-[5px]">
                  <StatusDot label="" tone={item.tone} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-medium">{item.name}</h3>
                  <p className="mt-1 text-[12px] text-(--fg-secondary)">
                    {item.detail}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-(--fg-tertiary)">
                    {item.id}
                  </p>
                </div>
              </div>
              <a
                className="flex items-center gap-1 self-center text-[12px] text-(--fg-secondary) hover:text-(--fg-primary)"
                href="/changes"
              >
                {copy.home.viewAll} <ArrowRight size={12} />
              </a>
            </article>
          ))}
        </section>
        <aside className="border-l border-(--line) px-7 pt-8">
          <header className="flex h-9 items-start border-b border-(--line)">
            <h2 className="text-[14px] font-medium">
              {copy.home.liveEvidence}
            </h2>
            <span className="ml-auto text-[11px] text-(--success)">
              {copy.home.streaming}
            </span>
          </header>
          <ol>
            {evidence.map((item) => (
              <li
                className="relative grid grid-cols-[10px_minmax(0,1fr)] gap-3 py-3"
                key={item.id}
              >
                <span className="mt-1.5 size-1.5 rounded-full bg-(--fg-tertiary)" />
                <div>
                  <time className="font-mono text-[10px] text-(--fg-tertiary)">
                    {timeLabel(item.occurredAt)}
                  </time>
                  <div className="mt-0.5 text-[12px] font-medium">
                    {item.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-(--fg-secondary)">
                    {item.detail}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-(--line) pt-4 text-[11px] leading-5 text-(--fg-secondary)">
            <p className="text-(--fg-primary)">
              Console coordinates intent and evidence.
            </p>
            <p className="mt-1">
              Services remain authoritative for state and effects.
            </p>
          </div>
        </aside>
      </div>
    </ProductPage>
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
    <div className="border-r border-(--line) px-4 pt-3 last:border-r-0">
      <div className="flex items-baseline gap-2">
        <strong className="text-[15px] font-medium">{value}</strong>
        <span className="text-[11px] text-(--fg-tertiary)">{label}</span>
      </div>
      <div
        className={`mt-1 text-[11px] ${note.includes("review") ? "text-(--warning)" : "text-(--fg-secondary)"}`}
      >
        {note}
      </div>
    </div>
  );
}
