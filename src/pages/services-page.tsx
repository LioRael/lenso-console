import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Network } from "lucide-react";
import { type ReactNode, useState } from "react";

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
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const query = useQuery({
    queryKey: serviceModuleLifecycleQueryKey,
    queryFn: () => fetchServiceModuleLifecycle(),
  });
  const rows = serviceCenterRows(query.data ?? { modules: [] });
  const selectedRow =
    rows.find((row) => row.providerName === selectedProvider) ?? rows[0];
  const attentionCount = rows.filter((row) => row.state !== "ready").length;

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
                : attentionCount > 0
                  ? "warning"
                  : "default"
            }
            value={attentionCount}
          />
        </div>

        <div className="grid min-h-0 min-w-[980px] lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[minmax(180px,1fr)_120px_minmax(220px,1.2fr)_minmax(180px,1fr)_minmax(160px,0.8fr)] gap-3 border-b border-(--line) bg-(--bg-panel-muted) px-3 py-1.5 font-mono text-[10px] uppercase text-(--fg-tertiary)">
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
              rows.map((row) => (
                <ServiceRow
                  key={row.providerName}
                  onSelect={() => setSelectedProvider(row.providerName)}
                  row={row}
                  selected={row.providerName === selectedRow?.providerName}
                />
              ))
            )}
          </div>
          <ServiceDetail row={selectedRow} />
        </div>
      </main>
    </section>
  );
}

function ServiceRow({
  onSelect,
  row,
  selected,
}: {
  onSelect: () => void;
  row: ServiceCenterRow;
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        "grid min-h-14 w-full grid-cols-[minmax(180px,1fr)_120px_minmax(220px,1.2fr)_minmax(180px,1fr)_minmax(160px,0.8fr)] items-center gap-3 border-b border-(--line) px-3 py-2 text-left font-mono text-[11px] hover:bg-(--bg-row-hover)",
        selected && "bg-(--bg-row-hover)"
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="min-w-0 truncate font-semibold text-(--fg-primary)">
        {row.providerName}
      </span>
      <ServiceStateBadge state={row.state} />
      <InlineList items={row.modules} />
      <InlineList items={row.managedServices} empty="external" />
      <div className="flex min-w-0 flex-wrap gap-1">
        {row.modules.map((moduleName) => (
          <Link
            className="border border-(--line) px-1.5 py-0.5 text-[10px] text-(--accent) hover:bg-(--bg-control-hover)"
            key={moduleName}
            onClick={(event) => event.stopPropagation()}
            to={serviceRemoteCallsPath(moduleName)}
          >
            {moduleName}
          </Link>
        ))}
      </div>
    </button>
  );
}

function ServiceDetail({ row }: { row: ServiceCenterRow | undefined }) {
  if (!row) {
    return (
      <aside className="border-l border-(--line) bg-(--bg-panel) px-3 py-3 font-mono text-[11px] text-(--fg-tertiary)">
        No service selected.
      </aside>
    );
  }

  return (
    <aside className="border-l border-(--line) bg-(--bg-panel) font-mono text-[11px]">
      <div className="border-b border-(--line) px-3 py-2">
        <div className="truncate text-[12px] font-semibold text-(--fg-primary)">
          {row.providerName}
        </div>
        <div className="mt-1">
          <ServiceStateBadge state={row.state} />
        </div>
      </div>
      <DetailSection title="next action">
        <span className="text-(--fg-primary)">{row.nextAction}</span>
      </DetailSection>
      <DetailSection title="modules">
        <InlineList items={row.modules} />
      </DetailSection>
      <DetailSection title="lifecycle">
        <DetailList
          items={row.moduleDetails.map(
            (module) =>
              `${module.moduleName}: installed=${String(module.installed)} configured=${String(module.configured)} loaded=${String(module.loaded)} manifest=${module.manifestStatus ?? "unknown"}`
          )}
        />
      </DetailSection>
      <DetailSection title="managed services">
        <DetailList
          items={nonEmpty(
            row.moduleDetails.flatMap(
              (module) =>
                module.services?.map(
                  (service) =>
                    `${module.moduleName}/${service.name}: ${service.ready ? "ready" : "not ready"} @ ${service.readyUrl ?? "-"}`
                ) ?? []
            ),
            ["external"]
          )}
        />
      </DetailSection>
      <DetailSection title="provider endpoints">
        <DetailList
          items={nonEmpty(
            compactStrings([
              ...row.baseUrls,
              ...row.manifestUrls,
              ...row.moduleDetails.map((module) => module.statusUrl),
            ]),
            ["-"]
          )}
        />
      </DetailSection>
      <DetailSection title="deployment">
        <DetailList
          items={nonEmpty(
            row.moduleDetails.flatMap((module) =>
              compactStrings([
                module.deployment?.target
                  ? `${module.moduleName}: target=${module.deployment.target}`
                  : undefined,
                module.deployment?.composeService
                  ? `${module.moduleName}: compose=${module.deployment.composeService}`
                  : undefined,
                ...(module.deployment?.commands ?? []).map(
                  (command) => `${module.moduleName}: ${command}`
                ),
              ])
            ),
            ["-"]
          )}
        />
      </DetailSection>
      <DetailSection title="health">
        <DetailList
          items={[
            `${row.healthChecks} checks recorded`,
            ...row.moduleDetails.flatMap((module) =>
              (module.healthHistory ?? []).slice(-2).map(
                (check) =>
                  `${module.moduleName}: ${check.state} @ ${check.statusUrl}`
              )
            ),
          ]}
        />
      </DetailSection>
      <DetailSection title="service checks">
        <DetailList
          items={nonEmpty(
            row.moduleDetails.flatMap(
              (module) =>
                module.serviceStatus?.checks.map(
                  (check) =>
                    `${module.moduleName}/${check.name}: ${check.status}${check.detail ? ` (${check.detail})` : ""}`
                ) ?? []
            ),
            ["-"]
          )}
        />
      </DetailSection>
      <DetailSection title="compatibility">
        <DetailList
          items={
            row.compatibilityStates.length > 0
              ? row.compatibilityStates
              : ["unknown"]
          }
        />
      </DetailSection>
      <DetailSection title="links">
        <div className="flex flex-wrap gap-1">
          <DetailLink label="calls" to={row.remoteCallsPath} />
          <DetailLink label="runtime" to={row.runtimePath} />
          <DetailLink label="story" to={row.storyPath} />
          <DetailLink label="ops" to={row.operationsPath} />
        </div>
      </DetailSection>
      <DetailSection title="fixes">
        <DetailList items={row.fixes.length > 0 ? row.fixes : ["-"]} />
      </DetailSection>
    </aside>
  );
}

function compactStrings(values: Array<null | string | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

function nonEmpty(items: string[], fallback: string[]) {
  return items.length > 0 ? items : fallback;
}

function DetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="border-b border-(--line) px-3 py-2">
      <div className="mb-1 text-[10px] uppercase text-(--fg-tertiary)">
        {title}
      </div>
      {children}
    </section>
  );
}

function DetailList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-1 text-(--fg-secondary)">
      {items.map((item) => (
        <span className="min-w-0 truncate" key={item} title={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

function DetailLink({ label, to }: { label: string; to: string }) {
  return (
    <Link
      className="border border-(--line) px-1.5 py-0.5 text-[10px] text-(--accent) hover:bg-(--bg-control-hover)"
      to={to}
    >
      {label}
    </Link>
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
  tone?: "default" | "error" | "warning";
  value: number | string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] border-r border-(--line) px-3 py-2 font-mono text-[10px] last:border-r-0">
      <span className="text-(--fg-tertiary)">{label}</span>
      <span
        className={cn(
          "text-[13px] font-semibold text-(--fg-primary)",
          tone === "error" && "text-(--tone-error-fg)",
          tone === "warning" && "text-(--warning)"
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
