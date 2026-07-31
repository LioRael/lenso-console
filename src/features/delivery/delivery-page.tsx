import { useState } from "react";

import { Button } from "../../components/ui/button";
import { ProductPage, StatusDot } from "../console-design/components";

const releases = [
  {
    gates: "12 / 12",
    id: "rel_01J7V4",
    name: "lenso 0.3.35",
    state: "Ready for handoff",
    tone: "success" as const,
  },
  {
    gates: "9 / 11",
    id: "rel_01J7V1",
    name: "console 0.8.0",
    state: "Evidence pending",
    tone: "warning" as const,
  },
  {
    gates: "4 / 10",
    id: "rel_01J7UZ",
    name: "billing-sync 1.8.3",
    state: "Draft",
    tone: "neutral" as const,
  },
  {
    gates: "12 / 12",
    id: "rel_01J7PX",
    name: "lenso 0.3.34",
    state: "Verified",
    tone: "success" as const,
  },
];

const gates = [
  "Contracts generated and clean",
  "Workspace quality gate",
  "Fresh Cargo install proof",
  "Fresh npm install proof",
  "Acceptance in published mode",
  "Reviewed release plan",
];

export function DeliveryPage() {
  const [selected, setSelected] = useState(releases[0]!);
  return (
    <ProductPage
      description="Prepare reviewed release handoffs and verify deployments without claiming production authority."
      meta="Production authority: external"
      title="Delivery"
    >
      <div className="grid min-h-[744px] grid-cols-[420px_minmax(0,1fr)]">
        <section className="border-r border-(--line) pr-6 pt-2">
          <header className="flex h-[58px] items-center px-2.5">
            <h2 className="text-[14px] font-medium">Release candidates</h2>
            <span className="ml-auto text-[11px] text-(--fg-tertiary)">
              4 open
            </span>
          </header>
          {releases.map((release) => (
            <button
              className={`grid min-h-[111px] w-full grid-cols-[minmax(0,1fr)_auto] border-b border-(--line) px-2.5 py-4 text-left ${selected.id === release.id ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
              key={release.id}
              onClick={() => setSelected(release)}
              type="button"
            >
              <span>
                <strong className="text-[13px] font-medium">
                  {release.name}
                </strong>
                <span className="mt-2 block">
                  <StatusDot label={release.state} tone={release.tone} />
                </span>
                <span className="mt-1 block font-mono text-[10px] text-(--fg-tertiary)">
                  {release.id}
                </span>
              </span>
              <span className="font-mono text-[10px]">
                {release.gates} gates
              </span>
            </button>
          ))}
        </section>
        <article className="pl-7 pt-7">
          <header className="flex items-start border-b border-(--line) pb-6">
            <div>
              <h2 className="text-[18px] font-semibold">{selected.name}</h2>
              <p className="mt-1 font-mono text-[10px] text-(--fg-tertiary)">
                {selected.id} · commit 6e41d3a
              </p>
            </div>
            <Button className="ml-auto" variant="primary">
              Prepare handoff
            </Button>
          </header>
          <div className="grid h-[70px] grid-cols-4 border-b border-(--line)">
            <Metric label="Readiness" value={selected.gates} />
            <Metric label="Artifacts" value="8" />
            <Metric label="Approvals" value="2" />
            <Metric label="Evidence age" value="31s" />
          </div>
          <h3 className="py-3 text-[11px] text-(--fg-tertiary)">
            Readiness gates
          </h3>
          {gates.map((gate, index) => (
            <div
              className="flex h-12 items-center border-b border-(--line) text-[12px]"
              key={gate}
            >
              <span>{gate}</span>
              <span className="ml-auto">
                <StatusDot
                  label={index === 5 ? "Approved · Leo + Mina" : "Passed"}
                  tone="success"
                />
              </span>
            </div>
          ))}
          <section className="pt-4 text-[12px] leading-6">
            <h3 className="text-[11px] text-(--fg-tertiary)">
              Authority handoff
            </h3>
            <p>
              Console packages the reviewed plan, receipts, and verification
              contract.
            </p>
            <p>
              A separate release authority decides and executes the production
              release.
            </p>
          </section>
        </article>
      </div>
    </ProductPage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-3">
      <strong className="block text-[15px] font-medium">{value}</strong>
      <span className="text-[10px] text-(--fg-tertiary)">{label}</span>
    </div>
  );
}
