import { ArrowRight } from "lucide-react";

import { useRuntimeSummary } from "../../hooks/use-runtime-queries";
import { ProductPage, StatusDot } from "../console-design/components";

const decisions = [
  {
    action: "Review",
    detail: "Permission policy change requires approval",
    id: "chg_01J7Q9",
    name: "auth-policy-v7",
    tone: "warning" as const,
  },
  {
    action: "Inspect",
    detail: "Agent plan is applying across 3 services",
    id: "chg_01J7PZ",
    name: "billing-sync",
    tone: "neutral" as const,
  },
  {
    action: "Open",
    detail: "Release verified; evidence bundle complete",
    id: "rel_01J7PX",
    name: "runtime-0.3.34",
    tone: "success" as const,
  },
  {
    action: "Open",
    detail: "Draft plan has no material risk delta",
    id: "chg_01J7PW",
    name: "customer-index",
    tone: "neutral" as const,
  },
];

const evidence = [
  ["12:04:18", "Approval recorded", "auth-policy-v7 · Leo"],
  ["12:03:51", "Verification passed", "billing-sync · 3/3 services"],
  ["12:02:09", "Agent plan bounded", "scope: runtime.config"],
  ["11:58:44", "Evidence attached", "rel_01J7PX · 14 artifacts"],
  ["11:54:12", "Recovery point stored", "customer-index · pre-apply"],
];

export function HomePage() {
  const summary = useRuntimeSummary().data;
  const healthy = summary?.status === "healthy";
  const runtimeCount = summary
    ? summary.outbox.published + summary.functions.completed
    : 12;

  return (
    <ProductPage
      description="Understand what changed, decide what needs action, and verify the result."
      meta={<StatusDot label="Production" tone="success" />}
      title="Operations"
    >
      <div className="grid h-[72px] grid-cols-4 border-b border-(--line)">
        <Metric
          label="Runtime"
          note={healthy ? "healthy" : "observed"}
          value={`${Math.min(runtimeCount, 12)} / 12`}
        />
        <Metric label="Active changes" note="1 needs review" value="3" />
        <Metric label="Awaiting approval" note="bounded action" value="1" />
        <Metric label="Evidence lag" note="within target" value="42s" />
      </div>
      <div className="grid min-h-[620px] grid-cols-[minmax(0,1fr)_374px]">
        <section className="pr-7 pt-8">
          <header className="flex h-9 items-start border-b border-(--line)">
            <h2 className="text-[14px] font-medium">Decision queue</h2>
            <a
              className="ml-auto inline-flex items-center gap-1 text-[12px] text-(--fg-secondary) hover:text-(--fg-primary)"
              href="/changes"
            >
              View all <ArrowRight size={12} />
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
                {item.action} <ArrowRight size={12} />
              </a>
            </article>
          ))}
        </section>
        <aside className="border-l border-(--line) px-7 pt-8">
          <header className="flex h-9 items-start border-b border-(--line)">
            <h2 className="text-[14px] font-medium">Live evidence</h2>
            <span className="ml-auto text-[11px] text-(--success)">
              Streaming
            </span>
          </header>
          <ol>
            {evidence.map(([time, title, detail]) => (
              <li
                className="relative grid grid-cols-[10px_minmax(0,1fr)] gap-3 py-3"
                key={`${time}-${title}`}
              >
                <span className="mt-1.5 size-1.5 rounded-full bg-(--fg-tertiary)" />
                <div>
                  <time className="font-mono text-[10px] text-(--fg-tertiary)">
                    {time}
                  </time>
                  <div className="mt-0.5 text-[12px] font-medium">{title}</div>
                  <div className="mt-0.5 text-[11px] text-(--fg-secondary)">
                    {detail}
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
