import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  ProductPage,
  ProductTabs,
  StatusDot,
} from "../console-design/components";

const plans = [
  {
    id: "chg_01J7Q9",
    name: "auth-policy-v7",
    detail: "Updates session and role policy",
    state: "Approval required",
    tone: "warning" as const,
  },
  {
    id: "chg_01J7PZ",
    name: "billing-sync",
    detail: "Roll out retry policy to 3 services",
    state: "Applying",
    tone: "neutral" as const,
  },
  {
    id: "chg_01J7PW",
    name: "customer-index",
    detail: "Rebuild search index with no downtime",
    state: "Draft",
    tone: "neutral" as const,
  },
  {
    id: "rel_01J7PX",
    name: "runtime-0.3.34",
    detail: "Release evidence is complete",
    state: "Verified",
    tone: "success" as const,
  },
];

export function ChangesPage() {
  const [tab, setTab] = useState("Active");
  const [selected, setSelected] = useState(plans[0]!);
  return (
    <ProductPage
      description="Review bounded plans, approve consequential actions, and follow verification evidence."
      meta={<span className="text-(--warning)">3 active · 1 awaiting you</span>}
      title="Changes"
    >
      <ProductTabs
        active={tab}
        items={["Active", "Drafts", "Completed", "Recovered"]}
        onChange={setTab}
      />
      <div className="grid min-h-[684px] grid-cols-[520px_minmax(0,1fr)]">
        <section className="border-r border-(--line) pr-6">
          <div className="flex h-[58px] items-center px-2 text-[11px] text-(--fg-tertiary)">
            Priority order
            <span className="ml-auto text-(--fg-secondary)">Filter⌄</span>
          </div>
          {plans.map((plan) => (
            <button
              className={`grid min-h-[109px] w-full grid-cols-[minmax(0,1fr)_auto] border-b border-(--line) px-2.5 py-4 text-left ${selected.id === plan.id ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
              key={plan.id}
              onClick={() => setSelected(plan)}
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
          <header className="flex items-start border-b border-(--line) pb-6">
            <div>
              <h2 className="text-[18px] font-semibold">{selected.name}</h2>
              <p className="font-mono text-[10px] text-(--fg-tertiary)">
                {selected.id} · proposed by agent policy-ops
              </p>
            </div>
            <Button className="ml-auto" variant="primary">
              Approve &amp; apply
            </Button>
          </header>
          <Detail title="Intent">
            Tighten session expiry and role escalation policy across the Auth
            boundary.
          </Detail>
          <Detail title="Plan">
            <ol>
              <li>1. Write policy v7</li>
              <li>2. Reload Auth binding</li>
              <li>3. Verify sessions and role checks</li>
              <li>4. Retain v6 as recovery point</li>
            </ol>
          </Detail>
          <Detail title="Blast radius">
            Auth API · session worker · admin revoke action
          </Detail>
          <Detail title="Approval">
            Human approval required because existing sessions may be revoked.
          </Detail>
          <Detail title="Verification contract">
            Policy checksum matches · 12 scenarios pass · session drift = 0
          </Detail>
          <Detail title="Recovery">
            Restore policy v6 and replay the previous session snapshot.
          </Detail>
        </article>
      </div>
    </ProductPage>
  );
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
