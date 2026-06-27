import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Network } from "lucide-react";

import {
  fetchServiceModuleLifecycle,
  serviceModuleLifecycleQueryKey,
} from "../data/available-modules";
import { cn } from "../lib/cn";
import { runtimeConsoleDataSource } from "../lib/http-client";
import {
  type ServiceCenterRow,
  serviceCenterRows,
  serviceRemoteCallsPath,
  serviceStateLabel,
} from "./services-model";

export function ServicesPage() {
  const query = useQuery({
    queryKey: serviceModuleLifecycleQueryKey,
    queryFn: () => fetchServiceModuleLifecycle(),
  });
  const rows = serviceCenterRows(query.data ?? { modules: [] });

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-(--bg-canvas) text-(--fg-primary)">
      <header className="border-b border-(--line) bg-(--bg-panel) px-3 py-2">
        <div className="flex items-center gap-2">
          <Network className="text-(--accent)" size={14} />
          <h1 className="font-mono text-[13px] font-semibold">Services</h1>
          <span className="ml-auto font-mono text-[10px] text-(--fg-tertiary)">
            {rows.length} providers / {runtimeConsoleDataSource()}
          </span>
        </div>
      </header>

      <main className="min-h-0 overflow-auto">
        <div className="grid border-b border-(--line) bg-(--bg-panel) md:grid-cols-4">
          <Counter label="providers" value={rows.length} />
          <Counter
            label="modules"
            value={rows.reduce((total, row) => total + row.modules.length, 0)}
          />
          <Counter
            label="services"
            value={new Set(rows.flatMap((row) => row.managedServices)).size}
          />
          <Counter
            label="attention"
            tone={
              rows.some((row) => row.state === "unhealthy")
                ? "error"
                : "default"
            }
            value={rows.filter((row) => row.state === "unhealthy").length}
          />
        </div>

        <div className="min-w-[760px]">
          <div className="grid grid-cols-[minmax(180px,1fr)_120px_minmax(220px,1.2fr)_minmax(180px,1fr)_116px] gap-3 border-b border-(--line) bg-(--bg-panel-muted) px-3 py-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
            <span>provider</span>
            <span>state</span>
            <span>modules</span>
            <span>managed services</span>
            <span>operations</span>
          </div>
          {query.isLoading ? (
            <ServicesMessageRow message="Loading service center..." />
          ) : query.isError ? (
            <ServicesMessageRow
              message={errorMessage(query.error)}
              tone="error"
            />
          ) : rows.length === 0 ? (
            <ServicesMessageRow message="No service providers configured." />
          ) : (
            rows.map((row) => <ServiceRow key={row.providerName} row={row} />)
          )}
        </div>
      </main>
    </section>
  );
}

function ServiceRow({ row }: { row: ServiceCenterRow }) {
  const moduleName = row.modules[0] ?? row.providerName;
  return (
    <div className="grid min-h-14 grid-cols-[minmax(180px,1fr)_120px_minmax(220px,1.2fr)_minmax(180px,1fr)_116px] items-center gap-3 border-b border-(--line) px-3 py-2 font-mono text-[11px] hover:bg-(--bg-row-hover)">
      <span className="min-w-0 truncate font-semibold text-(--fg-primary)">
        {row.providerName}
      </span>
      <ServiceStateBadge state={row.state} />
      <InlineList items={row.modules} />
      <InlineList items={row.managedServices} empty="external" />
      <Link
        className="text-(--accent) hover:underline"
        to={serviceRemoteCallsPath(moduleName)}
      >
        Remote calls
      </Link>
    </div>
  );
}

function ServiceStateBadge({ state }: { state: string }) {
  return (
    <span
      className={cn(
        "w-fit border px-1.5 py-0.5 text-[10px]",
        state === "ready" &&
          "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-(--success)",
        state === "restart_pending" &&
          "border-[color-mix(in_srgb,var(--warning)_55%,transparent)] text-(--warning)",
        state === "unhealthy" &&
          "border-[color-mix(in_srgb,var(--error)_55%,transparent)] text-(--error)",
        state === "configured" && "border-(--line) text-(--fg-secondary)"
      )}
    >
      {serviceStateLabel(state)}
    </span>
  );
}

function InlineList({
  empty = "-",
  items,
}: {
  empty?: string;
  items: string[];
}) {
  if (items.length === 0) {
    return <span className="text-(--fg-tertiary)">{empty}</span>;
  }
  return (
    <span
      className="min-w-0 truncate text-(--fg-secondary)"
      title={items.join(", ")}
    >
      {items.join(", ")}
    </span>
  );
}

function Counter({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "error";
  value: number | string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] border-r border-(--line) px-3 py-2 font-mono text-[10px] last:border-r-0">
      <span className="text-(--fg-tertiary)">{label}</span>
      <span
        className={cn(
          "text-[13px] font-semibold text-(--fg-primary)",
          tone === "error" && "text-(--tone-error-fg)"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ServicesMessageRow({
  message,
  tone = "default",
}: {
  message: string;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={cn(
        "border-b border-(--line) px-3 py-3 font-mono text-[11px] text-(--fg-tertiary)",
        tone === "error" && "text-(--tone-error-fg)"
      )}
    >
      {message}
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Service center unavailable";
}
