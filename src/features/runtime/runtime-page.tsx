import { useState } from "react";

import {
  useRuntimeEvents,
  useRuntimeFunctions,
  useRuntimeSummary,
} from "../../hooks/use-runtime-queries";
import {
  Inspector,
  InspectorSection,
  ProductPage,
  ProductTabs,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";

type ServiceRow = readonly [string, string, string, string, string, string];

const services: readonly ServiceRow[] = [
  ["lenso-api", "svc_lenso_api", "iad1", "0.3.34", "Healthy", "86 ms"],
  ["lenso-worker", "svc_lenso_worker", "iad1", "0.3.34", "Healthy", "41 ms"],
  ["billing-sync", "svc_billing_sync", "iad1", "1.8.2", "Healthy", "129 ms"],
  [
    "customer-index",
    "svc_customer_index",
    "fra1",
    "2.4.0",
    "Degraded",
    "244 ms",
  ],
  ["audit-evidence", "svc_audit_evidence", "iad1", "0.9.7", "Healthy", "73 ms"],
  ["webhook-relay", "svc_webhook_relay", "syd1", "1.3.1", "Healthy", "111 ms"],
] as const;

export function RuntimePage() {
  const [tab, setTab] = useState("Services");
  const [selected, setSelected] = useState<ServiceRow>(services[0]!);
  const summary = useRuntimeSummary().data;
  const events = useRuntimeEvents().data ?? [];
  const functions = useRuntimeFunctions().data ?? [];
  const liveRows =
    tab === "Operations"
      ? functions
          .slice(0, 8)
          .map(
            (item) =>
              [item.functionName, item.id, item.status, item.createdAt] as const
          )
      : tab === "Outbox" || tab === "Events"
        ? events
            .slice(0, 8)
            .map(
              (item) =>
                [item.eventName, item.id, item.status, item.createdAt] as const
            )
        : [];

  return (
    <ProductPage
      description="Observe live services, operations, queues, and the evidence each transition emits."
      meta={<span className="text-(--success)">12 / 12 healthy</span>}
      title="Runtime"
    >
      <ProductTabs
        active={tab}
        items={["Services", "Operations", "Outbox", "Events"]}
        onChange={setTab}
      />
      <SplitWorkspace
        inspector={
          <Inspector
            subtitle={`${selected[1]} · ${selected[2]} · ${selected[3]}`}
            title={selected[0]}
          >
            <div className="mt-4 flex gap-5 text-[11px]">
              <span>3 replicas</span>
              <span>{selected[5]} p95</span>
              <span>0.02% error</span>
            </div>
            <InspectorSection title="Execution timeline">
              <Timeline time="12:04:18" title="Config checksum verified" />
              <Timeline time="12:03:59" title="Replica 3 became ready" />
              <Timeline time="12:03:42" title="Replica 2 became ready" />
              <Timeline time="12:03:27" title="Replica 1 became ready" />
              <Timeline time="12:03:10" title="Release operation started" />
            </InspectorSection>
            <InspectorSection title="Authority">
              <p>Service owns runtime state and effects.</p>
              <p className="text-(--fg-secondary)">
                Console observes, coordinates, and retains evidence.
              </p>
            </InspectorSection>
          </Inspector>
        }
      >
        {tab === "Services" ? (
          <>
            <header className="flex h-[50px] items-center px-2.5">
              <h2 className="text-[14px] font-medium">Services</h2>
              <span className="ml-auto text-[11px] text-(--fg-tertiary)">
                {summary
                  ? `${summary.recentActivity.length} observed`
                  : "12 observed"}
              </span>
            </header>
            <div className="grid h-[40px] grid-cols-[minmax(220px,1fr)_110px_140px_120px_90px] items-center border-b border-(--line) px-2.5 text-[11px] text-(--fg-tertiary)">
              <span>Service</span>
              <span>Region</span>
              <span>Version</span>
              <span>State</span>
              <span>P95</span>
            </div>
            {services.map((service) => (
              <button
                className={`grid h-[65px] w-full grid-cols-[minmax(220px,1fr)_110px_140px_120px_90px] items-center border-b border-(--line) px-2.5 text-left text-[12px] ${selected[1] === service[1] ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
                key={service[1]}
                onClick={() => setSelected(service)}
                type="button"
              >
                <span>
                  <strong className="block font-medium">{service[0]}</strong>
                  <span className="font-mono text-[10px] text-(--fg-tertiary)">
                    {service[1]}
                  </span>
                </span>
                <span>{service[2]}</span>
                <span className="font-mono">{service[3]}</span>
                <StatusDot
                  label={service[4]}
                  tone={service[4] === "Healthy" ? "success" : "warning"}
                />
                <span>{service[5]}</span>
              </button>
            ))}
          </>
        ) : (
          <RuntimeStream rows={liveRows} title={tab} />
        )}
      </SplitWorkspace>
    </ProductPage>
  );
}

function RuntimeStream({
  rows,
  title,
}: {
  rows: readonly (readonly [string, string, string, string])[];
  title: string;
}) {
  return (
    <>
      <header className="flex h-[50px] items-center px-2.5">
        <h2 className="text-[14px] font-medium">{title}</h2>
        <span className="ml-auto text-[11px] text-(--fg-tertiary)">
          live evidence
        </span>
      </header>
      <div className="grid h-10 grid-cols-[minmax(240px,1fr)_150px_120px] items-center border-b border-(--line) px-2.5 text-[11px] text-(--fg-tertiary)">
        <span>Name</span>
        <span>State</span>
        <span>Observed</span>
      </div>
      {rows.length ? (
        rows.map(([name, id, status, time]) => (
          <div
            className="grid min-h-16 grid-cols-[minmax(240px,1fr)_150px_120px] items-center border-b border-(--line) px-2.5 text-[12px]"
            key={id}
          >
            <span>
              <strong className="block font-medium">{name}</strong>
              <span className="font-mono text-[10px] text-(--fg-tertiary)">
                {id}
              </span>
            </span>
            <StatusDot
              label={status}
              tone={
                status === "completed" || status === "published"
                  ? "success"
                  : status === "failed" || status === "dead"
                    ? "error"
                    : "neutral"
              }
            />
            <time className="font-mono text-[10px] text-(--fg-tertiary)">
              {time.slice(11, 19)}
            </time>
          </div>
        ))
      ) : (
        <div className="p-6 text-[12px] text-(--fg-tertiary)">
          No {title.toLowerCase()} evidence in this window.
        </div>
      )}
    </>
  );
}

function Timeline({ time, title }: { time: string; title: string }) {
  return (
    <div className="grid grid-cols-[8px_minmax(0,1fr)] gap-2 py-2">
      <span className="mt-1.5 size-1.5 rounded-full bg-(--fg-tertiary)" />
      <span>
        <time className="block font-mono text-[10px] text-(--fg-tertiary)">
          {time}
        </time>
        {title}
      </span>
    </div>
  );
}
