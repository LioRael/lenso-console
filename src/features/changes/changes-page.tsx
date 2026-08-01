import { useConsoleLocale } from "@lenso/console-package-api";
import { ArrowUpDown, ListFilter } from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { useChangeEvidence } from "../console-data/use-console-product-data";
import {
  ProductPage,
  ProductTabs,
  StatusDot,
} from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

export function ChangesPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const changes = useChangeEvidence();
  const plans = changes.rows;
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = plans.find((plan) => plan.id === selectedId) ?? plans[0];
  return (
    <ProductPage
      description={copy.changes.description}
      meta={
        <span className="text-(--fg-tertiary)">
          {plans.length} evidence records ·{" "}
          {changes.mode === "live" ? copy.common.live : copy.common.demo}
        </span>
      }
      title={copy.changes.title}
    >
      <ProductTabs
        active={copy.changes.tabs[tabIndex]!}
        items={copy.changes.tabs}
        onChange={(item) =>
          setTabIndex(copy.changes.tabs.indexOf(item as never))
        }
      />
      <div className="grid min-h-[684px] grid-cols-[520px_minmax(0,1fr)]">
        <section className="border-r border-(--line) pr-6">
          <div className="flex h-[58px] items-center px-2 text-[11px] text-(--fg-tertiary)">
            <span className="inline-flex items-center gap-1.5">
              {copy.changes.priority}
              <span className="grid size-4 place-items-center">
                <ArrowUpDown size={12} />
              </span>
            </span>
            <span className="ml-auto inline-flex h-5 items-center gap-1.5">
              {copy.changes.filter}
              <span className="grid size-4 place-items-center">
                <ListFilter size={12} />
              </span>
            </span>
          </div>
          {plans.map((plan) => (
            <button
              className={`grid min-h-[109px] w-full grid-cols-[minmax(0,1fr)_auto] border-b border-(--line) px-2.5 py-4 text-left ${selected?.id === plan.id ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
              key={plan.id}
              onClick={() => setSelectedId(plan.id)}
              type="button"
            >
              <span>
                <strong className="text-[13px] font-medium">{plan.name}</strong>
                <span className="mt-1 block text-[12px] text-(--fg-secondary)">
                  {plan.detail}
                </span>
                <span className="mt-1 block font-mono text-[10px] text-(--fg-tertiary)">
                  {plan.id}
                </span>
              </span>
              <StatusDot label={plan.state} tone={plan.tone} />
            </button>
          ))}
        </section>
        <article className="pl-7 pt-7">
          {selected ? (
            <>
              <header className="flex items-start border-b border-(--line) pb-6">
                <div>
                  <h2 className="text-[18px] font-semibold">{selected.name}</h2>
                  <p className="font-mono text-[10px] text-(--fg-tertiary)">
                    {selected.id} · {selected.module} ·{" "}
                    {timeLabel(selected.occurredAt)}
                  </p>
                </div>
                <Button className="ml-auto" disabled variant="primary">
                  {copy.changes.approve}
                </Button>
              </header>
              <Detail title={copy.changes.intent}>{selected.detail}</Detail>
              <Detail title={copy.changes.plan}>
                {selected.name} · {selected.state}
              </Detail>
              <Detail title={copy.changes.blast}>{selected.module}</Detail>
              <Detail title={copy.changes.approval}>
                Historical invocation evidence is read-only.
              </Detail>
              <Detail title={copy.changes.verification}>
                {selected.state}
              </Detail>
              <Detail title={copy.changes.recovery}>
                Open the owning module surface to start a new protected action.
              </Detail>
            </>
          ) : (
            <p className="text-[12px] text-(--fg-tertiary)">
              {copy.common.noData}
            </p>
          )}
        </article>
      </div>
    </ProductPage>
  );
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Detail({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="border-b border-(--line) py-4">
      <h3 className="mb-2 text-[11px] text-(--fg-tertiary)">{title}</h3>
      <div className="text-[12px] leading-5">{children}</div>
    </section>
  );
}
