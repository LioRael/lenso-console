import { useConsoleLocale } from "@lenso/console-package-api";
import { useState } from "react";

import {
  useRuntimeEvents,
  useRuntimeFunctions,
  useRuntimeSummary,
} from "../../hooks/use-runtime-queries";
import { useRuntimeServices } from "../console-data/use-console-product-data";
import {
  Inspector,
  InspectorSection,
  ProductPage,
  ProductTabs,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

export function RuntimePage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const serviceQuery = useRuntimeServices();
  const services = serviceQuery.rows;
  const [tabIndex, setTabIndex] = useState(0);
  const tab = copy.runtime.tabs[tabIndex]!;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    services.find((row) => row.providerName === selectedId) ?? services[0];
  const summary = useRuntimeSummary().data;
  const events = useRuntimeEvents().data ?? [];
  const functions = useRuntimeFunctions().data ?? [];
  const liveRows =
    tabIndex === 1
      ? functions
          .slice(0, 8)
          .map(
            (item) =>
              [item.functionName, item.id, item.status, item.createdAt] as const
          )
      : tabIndex === 2 || tabIndex === 3
        ? events
            .slice(0, 8)
            .map(
              (item) =>
                [item.eventName, item.id, item.status, item.createdAt] as const
            )
        : [];

  return (
    <ProductPage
      description={copy.runtime.description}
      meta={
        <span className="text-(--success)">
          {services.filter((item) => item.state === "ready").length} /{" "}
          {services.length} healthy ·{" "}
          {serviceQuery.mode === "live" ? copy.common.live : copy.common.demo}
        </span>
      }
      title={copy.runtime.title}
    >
      <ProductTabs
        active={tab}
        items={copy.runtime.tabs}
        onChange={(item) =>
          setTabIndex(copy.runtime.tabs.indexOf(item as never))
        }
      />
      <SplitWorkspace
        inspector={
          <Inspector
            subtitle={
              selected
                ? `${selected.providerName} · ${selected.environments.map((item) => item.name).join(", ") || "local"}`
                : "—"
            }
            title={selected?.providerName ?? copy.runtime.title}
          >
            <div className="mt-4 flex gap-5 text-[11px]">
              <span>{selected?.managedServices.length ?? 0} services</span>
              <span>{selected?.modules.length ?? 0} modules</span>
              <span>{selected?.state ?? "unknown"}</span>
            </div>
            <InspectorSection title={copy.runtime.timeline}>
              {(selected?.deployments ?? []).slice(0, 5).map((deployment) => (
                <Timeline
                  key={`${deployment.serviceName}:${deployment.environment}`}
                  time={
                    deployment.observedAtUnixMs
                      ? new Date(
                          deployment.observedAtUnixMs
                        ).toLocaleTimeString([], { hour12: false })
                      : "—"
                  }
                  title={`${deployment.serviceName} · ${deployment.state}`}
                />
              ))}
            </InspectorSection>
            <InspectorSection title={copy.runtime.authority}>
              <p>Service owns runtime state and effects.</p>
              <p className="text-(--fg-secondary)">
                Console observes, coordinates, and retains evidence.
              </p>
            </InspectorSection>
          </Inspector>
        }
      >
        {tabIndex === 0 ? (
          <>
            <header className="flex h-[50px] items-center px-2.5">
              <h2 className="text-[14px] font-medium">
                {copy.runtime.tabs[0]}
              </h2>
              <span className="ml-auto text-[11px] text-(--fg-tertiary)">
                {summary
                  ? `${summary.recentActivity.length} observed`
                  : "12 observed"}
              </span>
            </header>
            <div className="grid h-[40px] grid-cols-[minmax(220px,1fr)_110px_140px_120px_90px] items-center border-b border-(--line) px-2.5 text-[11px] text-(--fg-tertiary)">
              <span>{copy.runtime.service}</span>
              <span>{copy.runtime.region}</span>
              <span>{copy.runtime.version}</span>
              <span>{copy.runtime.state}</span>
              <span>P95</span>
            </div>
            {services.map((service) => (
              <button
                className={`grid h-[65px] w-full grid-cols-[minmax(220px,1fr)_110px_140px_120px_90px] items-center border-b border-(--line) px-2.5 text-left text-[12px] ${selected?.providerName === service.providerName ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
                key={service.providerName}
                onClick={() => setSelectedId(service.providerName)}
                type="button"
              >
                <span>
                  <strong className="block font-medium">
                    {service.providerName}
                  </strong>
                  <span className="font-mono text-[10px] text-(--fg-tertiary)">
                    {service.modules.join(" · ") || service.providerName}
                  </span>
                </span>
                <span>{service.environments[0]?.name ?? "local"}</span>
                <span className="font-mono">
                  {service.latestRelease?.candidateVersion ??
                    service.latestRelease?.currentVersion ??
                    "—"}
                </span>
                <StatusDot
                  label={service.state}
                  tone={service.state === "ready" ? "success" : "warning"}
                />
                <span>{service.healthChecks} checks</span>
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
