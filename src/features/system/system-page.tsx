import {
  DataRow,
  IconSlot,
  PaneHeader,
  Select,
  TableHeader,
  useConsoleLocale,
} from "@lenso/console-ui-internal";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { useSystemInventory } from "../console-data/use-console-product-data";
import {
  Inspector,
  InspectorSection,
  ProductPage,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";
import {
  filterSystemInventoryRows,
  type SystemInventoryFilters,
  type SystemInventoryFilterValue,
} from "./system-model";

type SystemFilterOption = {
  label: string;
  value: SystemInventoryFilterValue;
};

export function SystemPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const inventory = useSystemInventory();
  const capabilities = inventory.rows;
  const [filters, setFilters] = useState<SystemInventoryFilters>({
    kind: "all",
    owner: "all",
    state: "all",
  });
  const filteredCapabilities = useMemo(
    () => filterSystemInventoryRows(capabilities, filters),
    [capabilities, filters]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () =>
      filteredCapabilities.find((item) => item.id === selectedId) ??
      filteredCapabilities[0] ??
      capabilities.find((item) => item.id === selectedId) ??
      capabilities[0],
    [capabilities, filteredCapabilities, selectedId]
  );
  const serviceCount = useMemo(
    () => capabilities.filter((item) => item.kind === "Service").length,
    [capabilities]
  );
  const ownerOptions = useMemo<SystemFilterOption[]>(
    () => [
      { label: copy.system.allOwners, value: "all" },
      ...[...new Set(capabilities.map((item) => item.owner))].map((owner) => ({
        label: owner,
        value: owner,
      })),
    ],
    [capabilities, copy.system.allOwners]
  );

  const setFilter = (
    key: keyof SystemInventoryFilters,
    value: SystemInventoryFilterValue
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  if (!capabilities.length || !selected) {
    return (
      <ProductPage
        description={copy.system.description}
        title={copy.system.title}
      >
        <div className="py-8 text-[12px] text-(--fg-tertiary)">
          {copy.common.noData}
        </div>
      </ProductPage>
    );
  }

  return (
    <ProductPage
      description={copy.system.description}
      meta={`${capabilities.length} ${copy.system.capabilities.toLowerCase()} · ${serviceCount} ${copy.system.services.toLowerCase()}`}
      title={copy.system.title}
    >
      <div className="product-page__filters flex h-12 items-center gap-2">
        <SystemFilterSelect
          ariaLabel={copy.system.kind}
          onChange={(value) => setFilter("kind", value)}
          options={[
            { label: copy.system.allKinds, value: "all" },
            { label: copy.system.module, value: "Module" },
            { label: copy.system.service, value: "Service" },
          ]}
          value={filters.kind}
        />
        <SystemFilterSelect
          ariaLabel={copy.system.owner}
          onChange={(value) => setFilter("owner", value)}
          options={ownerOptions}
          value={filters.owner}
        />
        <SystemFilterSelect
          ariaLabel={copy.system.state}
          onChange={(value) => setFilter("state", value)}
          options={[
            { label: copy.system.healthyDegraded, value: "all" },
            { label: copy.system.healthy, value: "Healthy" },
            { label: copy.system.degraded, value: "Degraded" },
          ]}
          value={filters.state}
        />
      </div>
      <SplitWorkspace
        inspector={
          <Inspector
            status={
              <StatusDot
                label={`${selected.state} · evidence 18s ago`}
                tone={selected.state === "Healthy" ? "success" : "warning"}
              />
            }
            subtitle={selected.id}
            title={selected.name}
          >
            <InspectorSection title={copy.system.execution}>
              <p>{selected.kind}</p>
              <p>Compiled into lenso-api</p>
              <p>Manifest: v7</p>
            </InspectorSection>
            <InspectorSection title={copy.system.boundary}>
              <p>{selected.owner}</p>
              <p>
                {selected.dependencies.length
                  ? selected.dependencies.join(" · ")
                  : "No declared dependencies"}
              </p>
            </InspectorSection>
            <InspectorSection title={copy.system.surfaces}>
              <p>
                {selected.capabilities.length
                  ? selected.capabilities.join(" · ")
                  : "No declared capabilities"}
              </p>
            </InspectorSection>
            <InspectorSection title={copy.system.evidence}>
              <p>{selected.state}</p>
              <p>{inventory.data?.status ?? inventory.mode}</p>
            </InspectorSection>
          </Inspector>
        }
      >
        <PaneHeader
          meta={`${filteredCapabilities.length} total`}
          title={copy.system.capabilities}
        />
        <div className="lenso-ui-data-grid">
          <TableHeader
            columns={[
              copy.system.capability,
              copy.system.kind,
              copy.system.owner,
              copy.system.state,
            ]}
          />
          {filteredCapabilities.length === 0 ? (
            <div className="system-page__empty">{copy.system.noMatches}</div>
          ) : (
            filteredCapabilities.map((item) => (
              <DataRow
                cells={[
                  item.kind,
                  item.owner,
                  <StatusDot
                    label={item.state}
                    key={`${item.id}-status`}
                    tone={item.state === "Healthy" ? "success" : "warning"}
                  />,
                ]}
                interactive
                key={item.id}
                onActivate={() => setSelectedId(item.id)}
                onClick={() => setSelectedId(item.id)}
                primary={item.name}
                secondary={item.id}
                selected={selected.id === item.id}
              />
            ))
          )}
        </div>
      </SplitWorkspace>
    </ProductPage>
  );
}

function SystemFilterSelect({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (value: SystemInventoryFilterValue) => void;
  options: readonly SystemFilterOption[];
  value: SystemInventoryFilterValue;
}) {
  return (
    <label className="system-filter-control">
      <span className="sr-only">{ariaLabel}</span>
      <Select
        aria-label={ariaLabel}
        className="system-filter-control__select"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <IconSlot
        aria-hidden="true"
        className="system-filter-control__icon"
        size={12}
      >
        <ChevronDown size={12} strokeWidth={1.5} />
      </IconSlot>
    </label>
  );
}
