/* eslint-disable func-style, no-nested-ternary, no-use-before-define, unicorn/no-nested-ternary */

import { consoleHostApi } from "@lenso/console-package-api";
import type { ConsoleManagedService } from "@lenso/console-package-api";
import { Ban, Network, RefreshCw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  enrollmentExpiryLabel,
  managedServiceRows,
  registryState,
  registrySummary,
  serviceEndpointLabel,
} from "./model";

const toneClasses = {
  error: "border-[var(--tone-error-border)] text-[var(--tone-error-fg)]",
  muted: "border-(--line) text-(--fg-tertiary)",
  success: "border-[var(--tone-success-border)] text-[var(--tone-success-fg)]",
  warning: "border-[var(--tone-warning-border)] text-[var(--tone-warning-fg)]",
} as const;

export function SystemRegistryConsolePage() {
  const servicesQuery = consoleHostApi.systemRegistry.useServices();
  const revokeEnrollment = consoleHostApi.systemRegistry.useRevokeEnrollment();
  const capabilities = consoleHostApi.capabilities.useAvailable();
  const canRevoke =
    capabilities.includes("*") ||
    capabilities.includes("console.system-registry.revoke");
  const services = useMemo(
    () => managedServiceRows(servicesQuery.data ?? []),
    [servicesQuery.data]
  );
  const summary = registrySummary(services);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null
  );
  const selected =
    services.find((service) => service.serviceId === selectedServiceId) ??
    services[0];

  return (
    <main className="min-h-full overflow-auto bg-(--bg-canvas) text-(--fg-primary)">
      <header className="border-(--line) border-b px-4 py-5 md:px-6">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-end gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-(--fg-tertiary) text-xs uppercase tracking-[0.16em]">
              <ShieldCheck aria-hidden="true" size={14} />
              System authority
            </div>
            <h1 className="font-semibold text-2xl tracking-[-0.03em]">
              Managed Services
            </h1>
            <p className="mt-1 max-w-2xl text-(--fg-secondary) text-sm">
              Enrollment authority and last known connection state for every
              Service managed by this Console.
            </p>
          </div>
          <div className="ml-auto grid grid-cols-4 divide-x divide-(--line) border border-(--line) text-xs">
            <SummaryCell label="Registered" value={summary.total} />
            <SummaryCell label="Active" value={summary.active} />
            <SummaryCell label="Connected" value={summary.ready} />
            <SummaryCell
              alert={summary.attention > 0}
              label="Attention"
              value={summary.attention}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] gap-4 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 border border-(--line) bg-(--bg-panel)">
          <div className="flex items-center gap-3 border-(--line) border-b bg-(--bg-panel-header) px-4 py-2.5">
            <Network
              aria-hidden="true"
              className="text-(--fg-tertiary)"
              size={15}
            />
            <h2 className="font-medium text-sm">Service connections</h2>
            <span className="ml-auto text-(--fg-tertiary) text-xs">
              authorization and observation are reported independently
            </span>
          </div>
          <RegistryContent
            error={servicesQuery.error}
            isError={servicesQuery.isError}
            isPending={servicesQuery.isPending}
            onSelect={setSelectedServiceId}
            selectedServiceId={selected?.serviceId}
            services={services}
          />
        </section>

        <ServiceInspector
          canRevoke={canRevoke}
          mutationError={revokeEnrollment.error}
          mutationPending={revokeEnrollment.isPending}
          onRevoke={(service, reason) => {
            revokeEnrollment.mutate({
              expectedVersion: service.version,
              reason,
              serviceId: service.serviceId,
            });
          }}
          service={selected}
        />
      </div>
    </main>
  );
}

function RegistryContent({
  error,
  isError,
  isPending,
  onSelect,
  selectedServiceId,
  services,
}: {
  error: unknown;
  isError: boolean;
  isPending: boolean;
  onSelect: (serviceId: string) => void;
  selectedServiceId: string | undefined;
  services: ConsoleManagedService[];
}) {
  if (isPending) {
    return (
      <RegistryMessage
        icon={<RefreshCw size={15} />}
        text="Loading Service registry…"
      />
    );
  }
  if (isError) {
    return (
      <RegistryMessage
        icon={<Ban size={15} />}
        text={`Registry could not be loaded: ${error instanceof Error ? error.message : String(error)}`}
      />
    );
  }
  if (services.length === 0) {
    return (
      <RegistryMessage
        icon={<Network size={15} />}
        text="No Service is enrolled. Create a signed enrollment offer from the Console installation authority."
      />
    );
  }

  return (
    <div className="relative divide-y divide-(--line-subtle) before:absolute before:top-0 before:bottom-0 before:left-[27px] before:w-px before:bg-(--line)">
      {services.map((service) => {
        const state = registryState(service);
        const selected = service.serviceId === selectedServiceId;
        return (
          <button
            aria-label={`Inspect ${service.serviceId}`}
            aria-pressed={selected}
            className={`relative grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-(--focus-ring) ${
              selected ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"
            }`}
            key={service.serviceId}
            onClick={() => onSelect(service.serviceId)}
            type="button"
          >
            <span
              className={`relative z-10 size-3 rounded-full border-2 bg-(--bg-panel) ${
                state.tone === "success"
                  ? "border-(--success)"
                  : state.tone === "warning"
                    ? "border-(--warning)"
                    : state.tone === "error"
                      ? "border-(--error)"
                      : "border-(--fg-quaternary)"
              }`}
            />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <strong className="truncate font-medium text-sm">
                  {service.serviceId}
                </strong>
                <span className="truncate font-mono text-(--fg-tertiary) text-[11px]">
                  {serviceEndpointLabel(service.baseUrl)}
                </span>
              </span>
              <span className="mt-1 block truncate text-(--fg-secondary) text-xs">
                {service.servicePrincipal}
              </span>
            </span>
            <span className="grid justify-items-end gap-1.5">
              <span
                className={`border px-2 py-0.5 text-[11px] ${toneClasses[state.tone]}`}
              >
                {state.label}
              </span>
              <span className="font-mono text-(--fg-tertiary) text-[10px]">
                epoch {service.authorizationEpoch} · rev{" "}
                {service.enrollmentGrantRevision}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ServiceInspector({
  canRevoke,
  mutationError,
  mutationPending,
  onRevoke,
  service,
}: {
  canRevoke: boolean;
  mutationError: Error | null;
  mutationPending: boolean;
  onRevoke: (service: ConsoleManagedService, reason: string) => void;
  service: ConsoleManagedService | undefined;
}) {
  const [reason, setReason] = useState("");
  if (!service) {
    return (
      <aside className="grid min-h-64 place-items-center border border-(--line) bg-(--bg-panel) p-6 text-center text-(--fg-tertiary) text-sm">
        Select an enrolled Service to inspect its authority record.
      </aside>
    );
  }
  const state = registryState(service);
  const revocable = canRevoke && service.enrollmentState === "active";

  return (
    <aside className="h-fit border border-(--line) bg-(--bg-panel) xl:sticky xl:top-6">
      <div className="border-(--line) border-b bg-(--bg-panel-header) px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 truncate font-medium text-sm">
            {service.serviceId}
          </h2>
          <span
            className={`ml-auto border px-2 py-0.5 text-[11px] ${toneClasses[state.tone]}`}
          >
            {state.label}
          </span>
        </div>
        <div className="mt-1 truncate font-mono text-(--fg-tertiary) text-[11px]">
          {service.servicePrincipal}
        </div>
      </div>

      <dl className="divide-y divide-(--line-subtle)">
        <InspectorRow label="Endpoint" value={service.baseUrl} />
        <InspectorRow
          label="Enrollment"
          value={`revision ${service.enrollmentGrantRevision} · ${enrollmentExpiryLabel(
            service.enrollmentExpiresAtUnixMs
          )}`}
        />
        <InspectorRow
          label="Authority"
          value={`epoch ${service.authorizationEpoch} · record v${service.version}`}
        />
        <InspectorRow
          label="Last observed"
          value={service.coreObservedAt ?? "Never observed"}
        />
        {service.lastErrorCode ? (
          <InspectorRow label="Last error" value={service.lastErrorCode} />
        ) : null}
        <InspectorRow
          label="Receipt"
          value={`${service.enrollmentReceiptDigest.slice(0, 22)}…`}
        />
      </dl>

      <form
        className="border-(--line) border-t p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedReason = reason.trim();
          if (!(revocable && trimmedReason)) {
            return;
          }
          onRevoke(service, trimmedReason);
          setReason("");
        }}
      >
        <div className="flex items-center gap-2 text-(--fg-secondary) text-xs">
          <Ban aria-hidden="true" size={14} />
          Enrollment authority
        </div>
        <p className="mt-2 text-(--fg-tertiary) text-xs leading-5">
          Revocation immediately advances the authorization epoch. It does not
          stop the Service business data plane.
        </p>
        {service.enrollmentState === "revoked" ? (
          <p className="mt-3 border border-(--line) px-3 py-2 text-(--fg-tertiary) text-xs">
            This enrollment is already revoked.
          </p>
        ) : canRevoke ? (
          <>
            <label className="mt-3 grid gap-1.5 text-(--fg-secondary) text-xs">
              Revocation reason
              <textarea
                aria-label="Revocation reason"
                className="min-h-20 resize-y border border-(--line) bg-(--bg-control) px-3 py-2 text-(--fg-primary) outline-none placeholder:text-(--fg-quaternary) focus:border-(--line-strong) focus:ring-1 focus:ring-(--focus-ring-muted)"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why should this Service lose authority?"
                value={reason}
              />
            </label>
            <button
              aria-label={`Revoke ${service.serviceId} enrollment`}
              className="mt-3 w-full border border-[var(--tone-error-border)] bg-[var(--tone-error-bg)] px-3 py-2 font-medium text-[var(--tone-error-fg)] text-xs transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={mutationPending || reason.trim().length === 0}
              type="submit"
            >
              {mutationPending ? "Revoking enrollment…" : "Revoke enrollment"}
            </button>
          </>
        ) : (
          <p className="mt-3 border border-(--line) px-3 py-2 text-(--fg-tertiary) text-xs">
            Your operator role can inspect this record but cannot revoke it.
          </p>
        )}
        {mutationError ? (
          <p className="mt-2 text-[var(--tone-error-fg)] text-xs">
            Revocation failed: {mutationError.message}
          </p>
        ) : null}
      </form>
    </aside>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-3 text-xs">
      <dt className="text-(--fg-tertiary)">{label}</dt>
      <dd className="break-all font-mono text-(--fg-secondary)">{value}</dd>
    </div>
  );
}

function RegistryMessage({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="grid min-h-64 place-items-center p-6 text-center">
      <div className="max-w-md text-(--fg-tertiary) text-sm">
        <span className="mx-auto mb-3 grid size-8 place-items-center border border-(--line)">
          {icon}
        </span>
        {text}
      </div>
    </div>
  );
}

function SummaryCell({
  alert = false,
  label,
  value,
}: {
  alert?: boolean;
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-20 px-3 py-2">
      <div className="text-(--fg-tertiary) text-[10px] uppercase tracking-[0.12em]">
        {label}
      </div>
      <div
        className={`mt-0.5 font-mono text-base ${
          alert ? "text-[var(--tone-warning-fg)]" : "text-(--fg-primary)"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
