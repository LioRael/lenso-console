import {
  DataGrid,
  DataRow,
  PaneHeader,
  TableHeader,
  useConsoleLocale,
} from "@lenso/console-ui";
import { useState } from "react";

import {
  useRuntimeEvents,
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
import {
  runtimeDemoServices,
  type RuntimeServiceRow,
} from "./runtime-service-model";

export function RuntimePage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const serviceQuery = useRuntimeServices();
  const services: readonly RuntimeServiceRow[] =
    serviceQuery.mode === "demo" ? runtimeDemoServices : serviceQuery.rows;
  const [tabIndex, setTabIndex] = useState(0);
  const tab = copy.runtime.tabs[tabIndex]!;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = services.find((row) => row.id === selectedId) ?? services[0];
  const summary = useRuntimeSummary().data;
  const events = useRuntimeEvents().data ?? [];
  const healthyCount =
    serviceQuery.mode === "demo"
      ? 12
      : services.filter((item) => item.state === "ready").length;
  const totalCount = serviceQuery.mode === "demo" ? 12 : services.length;
  const observedCount =
    serviceQuery.mode === "demo"
      ? 12
      : (summary?.recentActivity.length ?? services.length);
  const liveRows =
    tabIndex === 1 || tabIndex === 2
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
        <span data-page-slot="runtime-page__meta">
          {healthyCount} / {totalCount} {copy.runtime.healthy}
        </span>
      }
      pageKind="runtime-page"
      title={copy.runtime.title}
    >
      <ProductTabs
        active={tab}
        items={copy.runtime.tabs}
        onChange={(item) =>
          setTabIndex(copy.runtime.tabs.indexOf(item as never))
        }
        pageSlot="runtime-page__tabs"
      />
      <SplitWorkspace
        inspector={
          <Inspector
            subtitle={
              selected
                ? `${selected.serviceId} · ${selected.region} · ${selected.version}`
                : "—"
            }
            title={selected?.providerName ?? copy.runtime.title}
            pageSlot="runtime-inspector"
          >
            <div data-page-slot="runtime-inspector__meta">
              <span>{selected?.replicas ?? "—"} replicas</span>
              <span>
                {selected?.p95Ms === null || selected?.p95Ms === undefined
                  ? "— p95"
                  : `${selected.p95Ms} ms p95`}
              </span>
              <span>
                {selected?.errorRate
                  ? `${selected.errorRate} error`
                  : "— error"}
              </span>
            </div>
            <div data-page-slot="runtime-inspector__divider" />
            <div data-page-slot="runtime-inspector__timeline">
              <p data-page-slot="runtime-inspector__label">
                {copy.runtime.timeline}
              </p>
              {selected?.timeline.length
                ? selected.timeline.map((event) => (
                    <Timeline
                      evidenceId={event.evidenceId}
                      key={event.evidenceId}
                      time={event.time}
                      title={event.title}
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
            <div data-page-slot="runtime-inspector__divider" />
            <div data-page-slot="runtime-inspector__boundary">
              <p>{copy.runtime.serviceOwns}</p>
              <p>{copy.runtime.consoleObserves}</p>
            </div>
          </Inspector>
        }
        inspectorWidth={406}
        pageSlot="runtime-page__workspace"
      >
        {tabIndex === 0 ? (
          <>
            <PaneHeader
              meta={`${observedCount} ${copy.runtime.observed}`}
              title={copy.runtime.tabs[0]}
            />
            <DataGrid>
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
                    <span data-page-slot="runtime-page__mono-cell" key="region">
                      {service.region}
                    </span>,
                    <span
                      data-page-slot="runtime-page__mono-cell"
                      key="version"
                    >
                      {service.version}
                    </span>,
                    <StatusDot
                      key="state"
                      label={runtimeStatusLabel(service.state)}
                      tone={runtimeStatusTone(service.state)}
                    />,
                    <span data-page-slot="runtime-page__mono-cell" key="p95">
                      {service.p95Ms === null ? "—" : `${service.p95Ms} ms`}
                    </span>,
                  ]}
                  interactive
                  key={service.id}
                  onActivate={() => setSelectedId(service.id)}
                  onClick={() => setSelectedId(service.id)}
                  primary={service.providerName}
                  secondary={service.serviceId}
                  selected={selected?.id === service.id}
                  variant="runtime"
                />
              ))}
            </DataGrid>
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
      <DataGrid>
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
                  data-page-slot="runtime-page__mono-cell"
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
          <div data-page-slot="runtime-page__stream-empty">
            No {title.toLowerCase()} evidence in this window.
          </div>
        )}
      </DataGrid>
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
    <div data-page-slot="runtime-inspector__event">
      <span aria-hidden="true" data-page-slot="runtime-inspector__rail" />
      <span data-page-slot="runtime-inspector__event-copy">
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
