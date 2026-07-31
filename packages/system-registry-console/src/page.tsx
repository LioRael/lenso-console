/* eslint-disable func-style, no-nested-ternary, no-use-before-define, unicorn/no-nested-ternary */

import {
  Badge,
  Button,
  ConsolePage,
  KeyValueList,
  Section,
  SplitView,
  StateView,
  SummaryStrip,
  Textarea,
  consoleHostApi,
} from "@lenso/console-package-api";
import type { ConsoleManagedService } from "@lenso/console-package-api";
import { Ban, Network, RefreshCw } from "lucide-react";
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
    <ConsolePage className="h-full">
      <ConsolePage.Header>
        <Network aria-hidden="true" className="text-(--accent)" size={14} />
        <ConsolePage.Heading>
          <ConsolePage.Title>Managed Services</ConsolePage.Title>
          <ConsolePage.Description>
            Enrollment authority and observed connection state
          </ConsolePage.Description>
        </ConsolePage.Heading>
        <ConsolePage.Actions>
          <Badge>{services.length} services</Badge>
        </ConsolePage.Actions>
      </ConsolePage.Header>

      <ConsolePage.Body className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <SummaryStrip>
          <SummaryStrip.Item label="Registered" value={summary.total} />
          <SummaryStrip.Item label="Active" value={summary.active} />
          <SummaryStrip.Item label="Connected" value={summary.ready} />
          <SummaryStrip.Item
            label="Attention"
            tone={summary.attention > 0 ? "warning" : "neutral"}
            value={summary.attention}
          />
        </SummaryStrip>

        <SplitView>
          <SplitView.Main>
            <Section>
              <Section.Header>
                <Network aria-hidden="true" size={13} />
                <Section.Title>Service connections</Section.Title>
                <Section.Meta>
                  authority and observation are reported independently
                </Section.Meta>
              </Section.Header>
              <RegistryContent
                error={servicesQuery.error}
                isError={servicesQuery.isError}
                isPending={servicesQuery.isPending}
                onSelect={setSelectedServiceId}
                selectedServiceId={selected?.serviceId}
                services={services}
              />
            </Section>
          </SplitView.Main>
          <SplitView.Inspector>
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
          </SplitView.Inspector>
        </SplitView>
      </ConsolePage.Body>
    </ConsolePage>
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
    <div className="divide-y divide-(--line-subtle)">
      {services.map((service) => {
        const state = registryState(service);
        const selected = service.serviceId === selectedServiceId;
        return (
          <button
            aria-label={`Inspect ${service.serviceId}`}
            aria-pressed={selected}
            className={`grid min-h-12 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-(--focus-ring) ${
              selected ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"
            }`}
            key={service.serviceId}
            onClick={() => onSelect(service.serviceId)}
            type="button"
          >
            <span
              className={`size-2 rounded-full ${
                state.tone === "success"
                  ? "bg-(--success)"
                  : state.tone === "warning"
                    ? "bg-(--warning)"
                    : state.tone === "error"
                      ? "bg-(--error)"
                      : "bg-(--fg-quaternary)"
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
              <span className="block truncate text-(--fg-secondary) text-[11px]">
                {service.servicePrincipal}
              </span>
            </span>
            <span className="grid justify-items-end gap-1">
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
      <StateView
        description="Select a Service row to inspect enrollment authority and the latest observed connection."
        icon={<Network size={15} />}
        title="No Service selected"
      />
    );
  }
  const state = registryState(service);
  const revocable = canRevoke && service.enrollmentState === "active";

  return (
    <div className="min-h-full bg-(--bg-panel)">
      <div className="border-(--line) border-b bg-(--bg-panel-header) px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 truncate font-medium text-[12px]">
            {service.serviceId}
          </h2>
          <Badge
            className="ml-auto"
            tone={
              state.tone === "error"
                ? "danger"
                : state.tone === "muted"
                  ? "neutral"
                  : state.tone
            }
          >
            {state.label}
          </Badge>
        </div>
        <div className="truncate font-mono text-(--fg-tertiary) text-[10px]">
          {service.servicePrincipal}
        </div>
      </div>

      <KeyValueList>
        <KeyValueList.Row label="Endpoint" value={service.baseUrl} />
        <KeyValueList.Row
          label="Enrollment"
          value={`revision ${service.enrollmentGrantRevision} · ${enrollmentExpiryLabel(
            service.enrollmentExpiresAtUnixMs
          )}`}
        />
        <KeyValueList.Row
          label="Authority"
          value={`epoch ${service.authorizationEpoch} · record v${service.version}`}
        />
        <KeyValueList.Row
          label="Last observed"
          value={service.coreObservedAt ?? "Never observed"}
        />
        {service.lastErrorCode ? (
          <KeyValueList.Row label="Last error" value={service.lastErrorCode} />
        ) : null}
        <KeyValueList.Row
          label="Receipt"
          value={`${service.enrollmentReceiptDigest.slice(0, 22)}…`}
        />
      </KeyValueList>

      <form
        className="border-(--line) border-t p-3"
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
        <div className="flex items-center gap-2 text-(--fg-secondary) text-[11px]">
          <Ban aria-hidden="true" size={14} />
          Enrollment authority
        </div>
        <p className="mt-1.5 text-(--fg-tertiary) text-[10px] leading-4">
          Revocation immediately advances the authorization epoch. It does not
          stop the Service business data plane.
        </p>
        {service.enrollmentState === "revoked" ? (
          <p className="mt-2 border border-(--line) px-2 py-1.5 text-(--fg-tertiary) text-[10px]">
            This enrollment is already revoked.
          </p>
        ) : canRevoke ? (
          <>
            <label
              className="mt-2 grid gap-1.5 text-(--fg-secondary) text-[11px]"
              htmlFor="service-revocation-reason"
            >
              Revocation reason
              <Textarea
                aria-label="Revocation reason"
                className="min-h-16"
                id="service-revocation-reason"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why should this Service lose authority?"
                value={reason}
              />
            </label>
            <Button
              aria-label={`Revoke ${service.serviceId} enrollment`}
              className="mt-2 w-full"
              disabled={mutationPending || reason.trim().length === 0}
              type="submit"
              variant="danger"
            >
              {mutationPending ? "Revoking enrollment…" : "Revoke enrollment"}
            </Button>
          </>
        ) : (
          <p className="mt-2 border border-(--line) px-2 py-1.5 text-(--fg-tertiary) text-[10px]">
            Your operator role can inspect this record but cannot revoke it.
          </p>
        )}
        {mutationError ? (
          <p className="mt-2 text-[var(--tone-error-fg)] text-[10px]">
            Revocation failed: {mutationError.message}
          </p>
        ) : null}
      </form>
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
  return <StateView description={text} icon={icon} title="Service registry" />;
}
