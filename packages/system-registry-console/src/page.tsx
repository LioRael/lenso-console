/* eslint-disable func-style, no-negated-condition, no-nested-ternary, no-use-before-define */

import {
  ConsolePage,
  DataGrid,
  DataRow,
  InlineStatus,
  Inspector,
  PaneHeader,
  SplitView,
  StateView,
  TableHeader,
  consoleHostApi,
  useConsoleLocale,
} from "@lenso/console-ui";
import type {
  ConsoleSystemConnection,
  ConsoleSystemConnectionService,
} from "@lenso/console-ui";
import { Network, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { connectionStatusLabel, statusTone } from "./model";

export function SystemRegistryConsolePage() {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const connectionQuery = consoleHostApi.systemRegistry.useConnection();
  const connection = connectionQuery.data;
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null
  );
  const selectedService = useMemo(
    () =>
      connection?.services.find(
        (service) => service.serviceId === selectedServiceId
      ) ?? connection?.services[0],
    [connection?.services, selectedServiceId]
  );

  return (
    <ConsolePage data-page="system-connection-page services-page">
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>{zh ? "服务" : "Services"}</ConsolePage.Title>
          <ConsolePage.Description>
            {zh
              ? "连接一个精确的 System 拓扑，并从已连接的 Module 自动组合 Console Surface。"
              : "Connect an exact System topology and auto-compose Console Surfaces from its connected Modules."}
          </ConsolePage.Description>
        </ConsolePage.Heading>
        {connection ? (
          <ConsolePage.Actions>
            <InlineStatus tone={statusTone(connection.status)}>
              {connectionStatusLabel(connection.status)}
            </InlineStatus>
          </ConsolePage.Actions>
        ) : null}
      </ConsolePage.Header>

      <ConsolePage.Body data-page-slot="system-connection-page__body">
        {connectionQuery.isPending ? (
          <StateView
            description={
              zh ? "正在读取 System Connection…" : "Reading System Connection…"
            }
            icon={<RefreshCw size={15} />}
            title={zh ? "正在连接 System" : "Loading System Connection"}
          />
        ) : connectionQuery.isError ? (
          <StateView
            description={
              zh
                ? `System Connection 加载失败：${connectionQuery.error instanceof Error ? connectionQuery.error.message : String(connectionQuery.error)}`
                : `System Connection could not be loaded: ${connectionQuery.error instanceof Error ? connectionQuery.error.message : String(connectionQuery.error)}`
            }
            icon={<Network size={15} />}
            title={zh ? "无法读取 System" : "System Connection unavailable"}
          />
        ) : !connection ? (
          <StateView
            description={
              zh
                ? "请先通过 Console Service 的 Connect System 接口提交精确拓扑和 Management Binding。Console 不会创建、部署或接管 workload。"
                : "Submit an exact topology and Management Binding through the Console Service Connect System API. Console never creates, deploys, or adopts workloads."
            }
            icon={<Network size={15} />}
            title={zh ? "连接一个 System" : "Connect a System"}
          />
        ) : (
          <ConnectionWorkspace
            connection={connection}
            onSelectService={(serviceId) => {
              setSelectedServiceId(serviceId);
              consoleHostApi.systemRegistry.selectService(serviceId);
            }}
            selectedService={selectedService}
            zh={zh}
          />
        )}
      </ConsolePage.Body>
    </ConsolePage>
  );
}

function ConnectionWorkspace({
  connection,
  onSelectService,
  selectedService,
  zh,
}: {
  connection: ConsoleSystemConnection;
  onSelectService: (serviceId: string) => void;
  selectedService: ConsoleSystemConnectionService | undefined;
  zh: boolean;
}) {
  return (
    <SplitView
      data-page-slot="system-connection-page__workspace"
      inspectorWidth={400}
    >
      <SplitView.Main>
        <PaneHeader
          meta={`${connection.services.length} ${zh ? "个 Service" : "Services"}`}
          title={`${connection.systemId} · ${zh ? "System Connection" : "System Connection"}`}
        />
        <DataGrid>
          <TableHeader
            columns={[
              zh ? "Service" : "Service",
              zh ? "身份" : "Principal",
              zh ? "状态" : "Status",
            ]}
          />
          {connection.services.map((service) => (
            <DataRow
              key={service.serviceId}
              cells={[
                service.servicePrincipal,
                <InlineStatus
                  key={`${service.serviceId}-status`}
                  tone={statusTone(service.status)}
                >
                  {connectionStatusLabel(service.status)}
                </InlineStatus>,
              ]}
              interactive
              onActivate={() => onSelectService(service.serviceId)}
              primary={service.serviceId}
              secondary={service.reason ?? undefined}
              selected={selectedService?.serviceId === service.serviceId}
            />
          ))}
        </DataGrid>
      </SplitView.Main>
      <SplitView.Inspector>
        <ConnectionInspector
          connection={connection}
          service={selectedService}
          zh={zh}
        />
      </SplitView.Inspector>
    </SplitView>
  );
}

function ConnectionInspector({
  connection,
  service,
  zh,
}: {
  connection: ConsoleSystemConnection;
  service: ConsoleSystemConnectionService | undefined;
  zh: boolean;
}) {
  return (
    <Inspector
      data-page-slot="system-connection-page__inspector"
      status={
        <InlineStatus tone={statusTone(service?.status ?? connection.status)}>
          {connectionStatusLabel(service?.status ?? connection.status)}
        </InlineStatus>
      }
      subtitle={service?.servicePrincipal ?? connection.topologyDigest}
      title={service?.serviceId ?? connection.systemId}
    >
      {service?.reason ? (
        <Inspector.Section title={zh ? "直接原因" : "Direct reason"}>
          <p>{service.reason}</p>
        </Inspector.Section>
      ) : null}
      <Inspector.Section
        title={zh ? "Management Binding" : "Management Binding"}
      >
        <p>{connection.managementBinding.policy.policyId}</p>
        <p>
          {connection.managementBinding.serviceIds.length}{" "}
          {zh ? "个绑定 Service" : "bound Services"}
        </p>
        <p>{connection.managementBinding.permissions.join(", ")}</p>
      </Inspector.Section>
      <Inspector.Section title={zh ? "Module Surface" : "Module Surfaces"}>
        {connection.modules
          .filter(
            (module) => module.serviceId === service?.serviceId || !service
          )
          .map((module) => (
            <p key={module.moduleId}>
              {module.moduleId} · {connectionStatusLabel(module.status)}
              {module.reason ? ` · ${module.reason}` : ""}
            </p>
          ))}
      </Inspector.Section>
      <Inspector.Section title={zh ? "Console 边界" : "Console boundary"}>
        <p>
          {zh
            ? "仅加载该 System 已授权且摘要精确匹配的 Module release。"
            : "Only authorized Module releases with exact digests are loaded."}
        </p>
        <p>
          {zh
            ? "发布、升级、回滚、部署和 workload 替换由 Console 明确禁止。"
            : "Release, upgrade, rollback, deploy, and workload replacement are forbidden to Console."}
        </p>
      </Inspector.Section>
    </Inspector>
  );
}
