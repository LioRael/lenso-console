/* eslint-disable func-style, no-nested-ternary, no-use-before-define, unicorn/no-nested-ternary */

import {
  Badge,
  ConsolePage,
  DataRow,
  InlineStatus,
  KeyValueList,
  Section,
  SplitView,
  StateView,
  SummaryStrip,
  TableHeader,
  consoleHostApi,
  useConsoleLocale,
} from "@lenso/console-ui-internal";
import type { ConsoleManagedService } from "@lenso/console-ui-internal";
import { Ban, Network, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import {
  enrollmentExpiryLabel,
  managedServiceRows,
  registryState,
  registrySummary,
  serviceEndpointLabel,
} from "./model";

export function SystemRegistryConsolePage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const servicesQuery = consoleHostApi.systemRegistry.useServices();
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
          <ConsolePage.Title>
            {zh ? "托管服务" : "Managed Services"}
          </ConsolePage.Title>
          <ConsolePage.Description>
            {zh
              ? "注册权限与观测到的连接状态"
              : "Enrollment authority and observed connection state"}
          </ConsolePage.Description>
        </ConsolePage.Heading>
        <ConsolePage.Actions>
          <Badge>
            {services.length} {zh ? "个服务" : "services"}
          </Badge>
        </ConsolePage.Actions>
      </ConsolePage.Header>

      <ConsolePage.Body className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <SummaryStrip>
          <SummaryStrip.Item
            label={zh ? "已注册" : "Registered"}
            value={summary.total}
          />
          <SummaryStrip.Item
            label={zh ? "活跃" : "Active"}
            value={summary.active}
          />
          <SummaryStrip.Item
            label={zh ? "已连接" : "Connected"}
            value={summary.ready}
          />
          <SummaryStrip.Item
            label={zh ? "需关注" : "Attention"}
            tone={summary.attention > 0 ? "warning" : "neutral"}
            value={summary.attention}
          />
        </SummaryStrip>

        <SplitView>
          <SplitView.Main>
            <Section>
              <Section.Header>
                <Network aria-hidden="true" size={13} />
                <Section.Title>
                  {zh ? "服务连接" : "Service connections"}
                </Section.Title>
                <Section.Meta>
                  {zh
                    ? "权限与观测状态分别报告"
                    : "authority and observation are reported independently"}
                </Section.Meta>
              </Section.Header>
              <RegistryContent
                error={servicesQuery.error}
                isError={servicesQuery.isError}
                isPending={servicesQuery.isPending}
                onSelect={setSelectedServiceId}
                selectedServiceId={selected?.serviceId}
                services={services}
                zh={zh}
              />
            </Section>
          </SplitView.Main>
          <SplitView.Inspector>
            <ServiceInspector service={selected} zh={zh} />
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
  zh,
}: {
  error: unknown;
  isError: boolean;
  isPending: boolean;
  onSelect: (serviceId: string) => void;
  selectedServiceId: string | undefined;
  services: ConsoleManagedService[];
  zh: boolean;
}) {
  if (isPending) {
    return (
      <RegistryMessage
        icon={<RefreshCw size={15} />}
        text={zh ? "正在加载服务注册表…" : "Loading Service registry…"}
        zh={zh}
      />
    );
  }
  if (isError) {
    return (
      <RegistryMessage
        icon={<Ban size={15} />}
        text={`${zh ? "服务注册表加载失败：" : "Registry could not be loaded: "}${error instanceof Error ? error.message : String(error)}`}
        zh={zh}
      />
    );
  }
  if (services.length === 0) {
    return (
      <RegistryMessage
        icon={<Network size={15} />}
        text={
          zh
            ? "暂无已注册服务。请从 Console 安装权威创建带签名的注册提议。"
            : "No Service is enrolled. Create a signed enrollment offer from the Console installation authority."
        }
        zh={zh}
      />
    );
  }

  return (
    <div className="lenso-ui-data-grid">
      <TableHeader
        columns={
          zh
            ? ["服务", "端点", "状态", "权限"]
            : ["Service", "Endpoint", "State", "Authority"]
        }
        variant="generic"
      />
      {services.map((service) => {
        const state = registryState(service);
        const selected = service.serviceId === selectedServiceId;
        return (
          <DataRow
            cells={[
              <span className="font-mono text-[10px]" key="endpoint">
                {serviceEndpointLabel(service.baseUrl)}
              </span>,
              <InlineStatus key="state" tone={semanticStatusTone(state.tone)}>
                {registryStateLabel(state.label, zh)}
              </InlineStatus>,
              <span className="font-mono text-[10px]" key="authority">
                {zh ? "epoch" : "epoch"} {service.authorizationEpoch} ·{" "}
                {zh ? "修订" : "rev"} {service.enrollmentGrantRevision}
              </span>,
            ]}
            interactive
            key={service.serviceId}
            onActivate={() => onSelect(service.serviceId)}
            primary={service.serviceId}
            secondary={service.servicePrincipal}
            selected={selected}
            variant="generic"
          />
        );
      })}
    </div>
  );
}

function semanticStatusTone(tone: ReturnType<typeof registryState>["tone"]) {
  return tone === "error" ? "danger" : tone === "muted" ? "neutral" : tone;
}

function ServiceInspector({
  service,
  zh,
}: {
  service: ConsoleManagedService | undefined;
  zh: boolean;
}) {
  if (!service) {
    return (
      <StateView
        description={
          zh
            ? "选择服务行查看注册权限与最近一次观测到的连接。"
            : "Select a Service row to inspect enrollment authority and the latest observed connection."
        }
        icon={<Network size={15} />}
        title={zh ? "未选择服务" : "No Service selected"}
      />
    );
  }
  const state = registryState(service);

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
            {registryStateLabel(state.label, zh)}
          </Badge>
        </div>
        <div className="truncate font-mono text-(--fg-tertiary) text-[10px]">
          {service.servicePrincipal}
        </div>
      </div>

      <KeyValueList>
        <KeyValueList.Row
          label={zh ? "端点" : "Endpoint"}
          value={service.baseUrl}
        />
        <KeyValueList.Row
          label={zh ? "注册" : "Enrollment"}
          value={`${zh ? "修订" : "revision"} ${service.enrollmentGrantRevision} · ${enrollmentExpiryLabel(
            service.enrollmentExpiresAtUnixMs
          )}`}
        />
        <KeyValueList.Row
          label={zh ? "权限" : "Authority"}
          value={`${zh ? "epoch" : "epoch"} ${service.authorizationEpoch} · ${zh ? "记录" : "record"} v${service.version}`}
        />
        <KeyValueList.Row
          label={zh ? "最后观测" : "Last observed"}
          value={service.coreObservedAt ?? (zh ? "从未观测" : "Never observed")}
        />
        {service.lastErrorCode ? (
          <KeyValueList.Row
            label={zh ? "最后错误" : "Last error"}
            value={service.lastErrorCode}
          />
        ) : null}
        <KeyValueList.Row
          label={zh ? "收据" : "Receipt"}
          value={`${service.enrollmentReceiptDigest.slice(0, 22)}…`}
        />
      </KeyValueList>

      <div className="border-(--line) border-t p-3">
        <div className="flex items-center gap-2 text-(--fg-secondary) text-[11px]">
          <Ban aria-hidden="true" size={14} />
          {zh ? "注册权限" : "Enrollment authority"}
        </div>
        <p className="mt-1.5 text-(--fg-tertiary) text-[10px] leading-4">
          {zh
            ? "变更注册权限必须通过计划、审批、提交和终态证据流程；此视图只读。"
            : "Enrollment authority changes require plan, approval, submission, and terminal evidence; this view is read-only."}
        </p>
      </div>
    </div>
  );
}

function RegistryMessage({
  icon,
  text,
  zh,
}: {
  icon: React.ReactNode;
  text: string;
  zh: boolean;
}) {
  return (
    <StateView
      description={text}
      icon={icon}
      title={zh ? "服务注册表" : "Service registry"}
    />
  );
}

function registryStateLabel(label: string, zh: boolean) {
  if (!zh) {
    return label;
  }
  return (
    {
      Active: "活跃",
      Connected: "已连接",
      Degraded: "降级",
      Incompatible: "不兼容",
      Revoked: "已撤销",
      Unavailable: "不可用",
    }[label] ?? label
  );
}
