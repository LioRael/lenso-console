import {
  DataRow,
  PaneHeader,
  TableHeader,
  useConsoleLocale,
} from "@lenso/console-ui-internal";
import { useState } from "react";

import {
  useRuntimeEvents,
  useRuntimeFunctions,
  useRuntimeSummary,
} from "../../hooks/use-runtime-queries";
import { useRuntimeServices } from "../console-data/use-console-product-data";
import {
  Inspector,
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
  const healthyCount = services.filter((item) => item.state === "ready").length;
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
        <span className="runtime-page__meta">
          {healthyCount} / {services.length} {copy.runtime.healthy}
        </span>
      }
      title={copy.runtime.title}
    >
      <ProductTabs
        active={tab}
        className="runtime-page__tabs"
        items={copy.runtime.tabs}
        onChange={(item) =>
          setTabIndex(copy.runtime.tabs.indexOf(item as never))
        }
      />
      <SplitWorkspace
        className="runtime-page__workspace"
        inspector={
          <Inspector
            className="runtime-inspector"
            subtitle={
              selected
                ? `${selected.providerName} · ${selected.environments.map((item) => item.name).join(", ") || "local"}`
                : "—"
            }
            title={selected?.providerName ?? copy.runtime.title}
          >
            <div className="runtime-inspector__meta">
              <span>
                {selected?.managedServices.length ?? 0} {copy.runtime.services}
              </span>
              <span>
                {selected?.modules.length ?? 0} {copy.runtime.modules}
              </span>
              <span>{runtimeStatusLabel(selected?.state)}</span>
            </div>
            <div className="runtime-inspector__divider" />
            <div className="runtime-inspector__timeline">
              <p className="runtime-inspector__label">
                {copy.runtime.timeline}
              </p>
              {selected?.deployments?.length
                ? selected.deployments
                    .slice(0, 5)
                    .map((deployment) => (
                      <Timeline
                        key={`${deployment.serviceName}:${deployment.environment}`}
                        time={
                          deployment.observedAtUnixMs
                            ? new Date(
                                deployment.observedAtUnixMs
                              ).toLocaleTimeString([], { hour12: false })
                            : "—"
                        }
                        title={`${deployment.serviceName} · ${runtimeStatusLabel(deployment.state)}`}
                      />
                    ))
                : events
                    .slice(0, 5)
                    .map((event) => (
                      <Timeline
                        key={event.id}
                        evidenceId={event.id}
                        time={event.createdAt.slice(11, 19)}
                        title={event.eventName}
                      />
                    ))}
            </div>
            <div className="runtime-inspector__divider" />
            <div className="runtime-inspector__boundary">
              <p>{copy.runtime.serviceOwns}</p>
              <p>{copy.runtime.consoleObserves}</p>
            </div>
          </Inspector>
        }
        inspectorWidth={406}
      >
        {tabIndex === 0 ? (
          <>
            <PaneHeader
              meta={`${summary?.recentActivity.length ?? services.length} ${copy.runtime.observed}`}
              title={copy.runtime.tabs[0]}
            />
            <div className="lenso-ui-data-grid">
              <TableHeader
                columns={[
                  copy.runtime.service,
                  copy.runtime.region,
                  copy.runtime.version,
                  copy.runtime.state,
                  "P95",
                ]}
                variant="runtime"
              />
              {services.map((service) => (
                <DataRow
                  cells={[
                    <span className="runtime-page__mono-cell" key="region">
                      {service.environments[0]?.name ?? "local"}
                    </span>,
                    <span className="runtime-page__mono-cell" key="version">
                      {service.latestRelease?.candidateVersion ??
                        service.latestRelease?.currentVersion ??
                        "—"}
                    </span>,
                    <StatusDot
                      key="state"
                      label={runtimeStatusLabel(service.state)}
                      tone={runtimeStatusTone(service.state)}
                    />,
                    <span className="runtime-page__mono-cell" key="checks">
                      {service.healthChecks} {copy.runtime.checks}
                    </span>,
                  ]}
                  interactive
                  key={service.providerName}
                  onActivate={() => setSelectedId(service.providerName)}
                  onClick={() => setSelectedId(service.providerName)}
                  primary={service.providerName}
                  secondary={
                    service.modules.join(" · ") || service.providerName
                  }
                  selected={selected?.providerName === service.providerName}
                  variant="runtime"
                />
              ))}
            </div>
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
      <PaneHeader meta="live evidence" title={title} />
      <div className="lenso-ui-data-grid">
        <TableHeader columns={["Name", "State", "Observed", ""]} />
        {rows.length ? (
          rows.map(([name, id, status, time]) => (
            <DataRow
              cells={[
                <StatusDot
                  key="status"
                  label={status}
                  tone={runtimeStatusTone(status)}
                />,
                <time
                  className="runtime-page__mono-cell"
                  key="time"
                  dateTime={time}
                >
                  {time.slice(11, 19)}
                </time>,
              ]}
              key={id}
              primary={name}
              secondary={id}
            />
          ))
        ) : (
          <div className="runtime-page__stream-empty">
            No {title.toLowerCase()} evidence in this window.
          </div>
        )}
      </div>
    </>
  );
}

function Timeline({
  evidenceId,
  time,
  title,
}: {
  evidenceId?: string;
  time: string;
  title: string;
}) {
  return (
    <div className="runtime-inspector__event">
      <span aria-hidden="true" className="runtime-inspector__rail" />
      <span className="runtime-inspector__event-copy">
        <time>{time}</time>
        <strong>{title}</strong>
        <small>{evidenceId ?? "runtime evidence"}</small>
      </span>
    </div>
  );
}

function runtimeStatusLabel(value: string | undefined) {
  if (value === "ready" || value === "completed" || value === "published") {
    return "Healthy";
  }
  if (value === undefined || value === "") {
    return "Unknown";
  }
  return value === "restart_pending" ? "Degraded" : value;
}

function runtimeStatusTone(value: string) {
  if (value === "ready" || value === "completed" || value === "published") {
    return "success" as const;
  }
  if (value === "failed" || value === "dead") {
    return "error" as const;
  }
  return "warning" as const;
}
