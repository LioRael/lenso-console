/* eslint-disable func-style, no-nested-ternary, no-use-before-define */

import {
  ConsolePage,
  DataGrid,
  DataRow,
  FilterSelect,
  InlineStatus,
  Inspector,
  PaneHeader,
  SplitView,
  pageStyles,
  StateView,
  TableHeader,
  consoleHostApi,
  useConsoleLocale,
} from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { Ban, ChevronDown, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  filterServiceRows,
  managedServiceRows,
  registrySummary,
  servicePresentation,
} from "./model";
import type {
  RegistryStatePresentation,
  ServiceFilters,
  ServiceFilterValue,
  ServiceListRow,
} from "./model";

interface ServicesCopy {
  allEnvironments: string;
  allOwners: string;
  allPostures: string;
  attention: string;
  composition: string;
  description: string;
  environment: string;
  healthy: string;
  identityAuthority: string;
  nextSafeAction: string;
  noData: string;
  noMatches: string;
  posture: string;
  runtimePosture: string;
  service: string;
  title: string;
  total: string;
  version: string;
}

interface ServiceFilterOption {
  label: string;
  value: ServiceFilterValue;
}

export function SystemRegistryConsolePage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const copy = getServicesCopy(zh);
  const servicesQuery = consoleHostApi.systemRegistry.useServices();
  const services = useMemo(
    () => managedServiceRows(servicesQuery.data ?? []),
    [servicesQuery.data]
  );
  const rows = useMemo<ServiceListRow[]>(
    () =>
      services.map((service) => ({
        presentation: servicePresentation(service),
        service,
      })),
    [services]
  );
  const summary = registrySummary(services);
  const [filters, setFilters] = useState<ServiceFilters>({
    environment: "all",
    owner: "all",
    posture: "all",
  });
  const filteredRows = useMemo(
    () => filterServiceRows(rows, filters),
    [filters, rows]
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null
  );
  const selected = useMemo(
    () =>
      filteredRows.find((row) => row.service.serviceId === selectedServiceId) ??
      filteredRows[0] ??
      rows.find((row) => row.service.serviceId === selectedServiceId) ??
      rows[0],
    [filteredRows, rows, selectedServiceId]
  );
  const environmentOptions = useMemo<ServiceFilterOption[]>(
    () => [
      { label: copy.allEnvironments, value: "all" },
      ...uniqueValues(rows.map((row) => row.presentation.environment)).map(
        (value) => ({ label: value, value })
      ),
    ],
    [copy.allEnvironments, rows]
  );
  const ownerOptions = useMemo<ServiceFilterOption[]>(
    () => [
      { label: copy.allOwners, value: "all" },
      ...uniqueValues(rows.map((row) => row.presentation.owner)).map(
        (value) => ({ label: value, value })
      ),
    ],
    [copy.allOwners, rows]
  );
  const postureOptions = useMemo<ServiceFilterOption[]>(
    () => [
      { label: copy.allPostures, value: "all" },
      ...uniqueValues(rows.map((row) => row.presentation.posture.label)).map(
        (value) => ({ label: localizePosture(value, zh), value })
      ),
    ],
    [copy.allPostures, rows, zh]
  );

  const setFilter = (key: keyof ServiceFilters, value: ServiceFilterValue) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const pageFiltersStyleProps = stylex.props(pageStyles.pageFilters);

  return (
    <ConsolePage data-page="product-page services-page">
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>{copy.title}</ConsolePage.Title>
          <ConsolePage.Description>{copy.description}</ConsolePage.Description>
        </ConsolePage.Heading>
        <ConsolePage.Actions>
          {summary.total} {zh ? "个服务" : "services"} · {summary.ready}{" "}
          {copy.healthy.toLowerCase()} · {summary.attention} {copy.attention}
        </ConsolePage.Actions>
      </ConsolePage.Header>

      <ConsolePage.Body data-page-slot="product-page__body services-page__body">
        {servicesQuery.isPending ? (
          <RegistryMessage
            description={
              zh ? "正在加载服务注册表…" : "Loading Service registry…"
            }
            icon={<RefreshCw size={15} />}
            title={zh ? "服务注册表" : "Service registry"}
          />
        ) : servicesQuery.isError ? (
          <RegistryMessage
            description={`${zh ? "服务注册表加载失败：" : "Registry could not be loaded: "}${servicesQuery.error instanceof Error ? servicesQuery.error.message : String(servicesQuery.error)}`}
            icon={<Ban size={15} />}
            title={zh ? "服务注册表" : "Service registry"}
          />
        ) : (
          <>
            <div
              {...pageFiltersStyleProps}
              data-page-slot="product-page__filters services-page__filters"
            >
              <ServiceFilterSelect
                ariaLabel={copy.allEnvironments}
                onChange={(value) => setFilter("environment", value)}
                options={environmentOptions}
                value={filters.environment}
              />
              <ServiceFilterSelect
                ariaLabel={copy.allOwners}
                onChange={(value) => setFilter("owner", value)}
                options={ownerOptions}
                value={filters.owner}
              />
              <ServiceFilterSelect
                ariaLabel={copy.allPostures}
                onChange={(value) => setFilter("posture", value)}
                options={postureOptions}
                value={filters.posture}
              />
            </div>

            <SplitView
              data-page-slot="services-page__workspace"
              inspectorWidth={376}
            >
              <SplitView.Main>
                <PaneHeader
                  meta={`${services.length} ${copy.total}`}
                  title={copy.title}
                />
                <DataGrid>
                  <TableHeader
                    columns={[
                      copy.service,
                      copy.environment,
                      copy.version,
                      copy.posture,
                    ]}
                  />
                  {filteredRows.length === 0 ? (
                    <div data-page-slot="services-page__empty">
                      {services.length === 0 ? copy.noData : copy.noMatches}
                    </div>
                  ) : (
                    filteredRows.map((row) => (
                      <ServiceDataRow
                        key={row.service.serviceId}
                        onSelect={setSelectedServiceId}
                        row={row}
                        selected={
                          selected?.service.serviceId === row.service.serviceId
                        }
                        zh={zh}
                      />
                    ))
                  )}
                </DataGrid>
              </SplitView.Main>
              <SplitView.Inspector>
                <ServiceInspector copy={copy} row={selected} zh={zh} />
              </SplitView.Inspector>
            </SplitView>
          </>
        )}
      </ConsolePage.Body>
    </ConsolePage>
  );
}

function ServiceDataRow({
  onSelect,
  row,
  selected,
  zh,
}: {
  onSelect: (serviceId: string) => void;
  row: ServiceListRow;
  selected: boolean;
  zh: boolean;
}) {
  return (
    <DataRow
      cells={[
        row.presentation.environment,
        row.presentation.version,
        <InlineStatus
          key={`${row.service.serviceId}-posture`}
          tone={semanticStatusTone(row.presentation.posture)}
        >
          {localizePosture(row.presentation.posture.label, zh)}
        </InlineStatus>,
      ]}
      interactive
      onActivate={() => onSelect(row.service.serviceId)}
      primary={row.service.serviceId}
      secondary={row.presentation.secondary}
      selected={selected}
    />
  );
}

function ServiceFilterSelect({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (value: ServiceFilterValue) => void;
  options: readonly ServiceFilterOption[];
  value: ServiceFilterValue;
}) {
  return (
    <FilterSelect
      aria-label={ariaLabel}
      data-page-slot="services-filter-control"
      icon={<ChevronDown size={12} strokeWidth={1.5} />}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </FilterSelect>
  );
}

function ServiceInspector({
  copy,
  row,
  zh,
}: {
  copy: ServicesCopy;
  row: ServiceListRow | undefined;
  zh: boolean;
}) {
  if (!row) {
    return (
      <StateView
        description={
          zh
            ? "选择服务行查看身份、运行姿态与下一步安全操作。"
            : "Select a Service row to inspect identity, runtime posture, and the next safe action."
        }
        title={zh ? "未选择服务" : "No Service selected"}
      />
    );
  }

  const { presentation, service } = row;
  return (
    <Inspector
      data-page-slot="product-inspector services-inspector"
      status={
        <InlineStatus tone={semanticStatusTone(presentation.posture)}>
          {presentation.observed}
        </InlineStatus>
      }
      subtitle={presentation.secondary}
      title={service.serviceId}
    >
      <Inspector.Section title={copy.identityAuthority}>
        {presentation.identity.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Inspector.Section>
      <Inspector.Section title={copy.runtimePosture}>
        {presentation.runtime.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Inspector.Section>
      <Inspector.Section title={copy.composition}>
        {presentation.composition.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Inspector.Section>
      <Inspector.Section title={copy.nextSafeAction}>
        {presentation.nextSafeAction.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Inspector.Section>
    </Inspector>
  );
}

function RegistryMessage({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return <StateView description={description} icon={icon} title={title} />;
}

function semanticStatusTone(
  posture: RegistryStatePresentation
): "neutral" | "success" | "warning" | "danger" {
  return posture.tone === "error"
    ? "danger"
    : posture.tone === "muted"
      ? "neutral"
      : posture.tone;
}

function localizePosture(label: string, zh: boolean) {
  if (!zh) {
    return label;
  }
  return (
    {
      Degraded: "降级",
      Drifted: "漂移",
      "Enrollment required": "需要注册",
      Healthy: "健康",
    }[label] ?? label
  );
}

function uniqueValues(values: readonly string[]) {
  return [...new Set(values)];
}

function getServicesCopy(zh: boolean): ServicesCopy {
  return zh
    ? {
        allEnvironments: "全部环境",
        allOwners: "全部所有者",
        allPostures: "全部状态",
        attention: "需关注",
        composition: "组成",
        description: "独立运行单元、权责、姿态、组成与下一步安全操作。",
        environment: "环境",
        healthy: "健康",
        identityAuthority: "身份与权责",
        nextSafeAction: "下一步安全操作",
        noData: "暂无已注册服务。",
        noMatches: "没有符合这些筛选条件的服务。",
        posture: "状态",
        runtimePosture: "运行姿态",
        service: "服务",
        title: "服务",
        total: "总计",
        version: "版本",
      }
    : {
        allEnvironments: "All environments",
        allOwners: "All owners",
        allPostures: "All postures",
        attention: "attention",
        composition: "Composition",
        description:
          "Independent runtime units, their authority, posture, composition, and next safe action.",
        environment: "Environment",
        healthy: "Healthy",
        identityAuthority: "Identity & authority",
        nextSafeAction: "Next safe action",
        noData: "No Service is enrolled.",
        noMatches: "No services match these filters.",
        posture: "Posture",
        runtimePosture: "Runtime posture",
        service: "Service",
        title: "Services",
        total: "total",
        version: "Version",
      };
}
