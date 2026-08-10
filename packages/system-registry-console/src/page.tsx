/* eslint-disable func-style, no-negated-condition, no-nested-ternary, no-use-before-define */

import {
  Button,
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
  ConsoleHostApi,
  ConsoleSystemConnection,
  ConsoleSystemConnectionService,
  ConsoleSystemTopologyWorkload,
  ConsoleWorkloadObservation,
  ConsoleWorkloadOperationRecord,
  ConsoleWorkloadOperationalState,
  ConsoleWorkloadReference,
} from "@lenso/console-ui";
import { Network, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  connectionStatusLabel,
  isRecoverableWorkloadOperationPollError,
  isTerminalWorkloadOperation,
  observationSupersedesMutationOperation,
  shouldClearOperationAuthorityRefresh,
  shouldRetireWorkloadOperation,
  statusTone,
  workloadOperationHandle,
} from "./model";

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
      <ControlAdapterSection connection={connection} zh={zh} />
      <WorkloadControlSection
        service={service}
        systemId={connection.systemId}
        zh={zh}
      />
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

function ControlAdapterSection({
  connection,
  zh,
}: {
  connection: ConsoleSystemConnection;
  zh: boolean;
}) {
  return (
    <Inspector.Section title={zh ? "控制 Adapter" : "Control Adapter"}>
      {connection.adapters.length === 0 ? (
        <p>{zh ? "未绑定控制 Adapter。" : "No Control Adapter is bound."}</p>
      ) : (
        connection.adapters.map((adapter) => (
          <p key={adapter.adapterId}>
            {adapter.adapterId} ·{" "}
            {adapter.workloadControl
              ? `${connectionStatusLabel(adapter.workloadControl.status)} · ${adapter.workloadControl.capabilities.join(", ")}`
              : zh
                ? "未声明 Workload Control"
                : "Workload Control not declared"}
          </p>
        ))
      )}
    </Inspector.Section>
  );
}

function WorkloadControlSection({
  service,
  systemId,
  zh,
}: {
  service: ConsoleSystemConnectionService | undefined;
  systemId: string;
  zh: boolean;
}) {
  if (!service || service.workloads.length === 0) {
    return (
      <Inspector.Section title={zh ? "Workload 运行状态" : "Operational state"}>
        <p>
          {zh
            ? "此 Service 未声明可控制的 Workload。"
            : "This Service declares no controllable Workloads."}
        </p>
      </Inspector.Section>
    );
  }
  return (
    <Inspector.Section title={zh ? "Workload 运行状态" : "Operational state"}>
      {service.workloads.map((workload) => (
        <WorkloadControl
          key={`${systemId}:${service.serviceId}:${workload.workloadId}`}
          serviceId={service.serviceId}
          systemId={systemId}
          workload={workload}
          zh={zh}
        />
      ))}
    </Inspector.Section>
  );
}

function WorkloadControl({
  serviceId,
  systemId,
  workload,
  zh,
}: {
  serviceId: string;
  systemId: string;
  workload: ConsoleSystemTopologyWorkload;
  zh: boolean;
}) {
  const reference = useMemo(
    () => ({ serviceId, systemId, workloadId: workload.workloadId }),
    [serviceId, systemId, workload.workloadId]
  );
  const accessQuery = consoleHostApi.systemRegistry.useWorkloadAccess(
    systemId,
    serviceId
  );
  const effectiveCapabilities = new Set(accessQuery.data);
  const canReadWorkload = hasEffectiveWorkloadCapability(
    effectiveCapabilities,
    "console.workload.read"
  );
  const canControlWorkload = hasEffectiveWorkloadCapability(
    effectiveCapabilities,
    "console.workload.control"
  );
  const canReadOperation = hasEffectiveWorkloadCapability(
    effectiveCapabilities,
    "console.workload.operation.read"
  );
  const observationQuery = consoleHostApi.systemRegistry.useWorkload(
    canReadWorkload ? reference : null
  );
  const mutation = consoleHostApi.systemRegistry.useMutateWorkload();
  const operationTracking = useTrackedWorkloadOperation({
    canReadOperation,
    mutation,
    observationQuery,
    reference,
  });
  const observation = observationQuery.data;

  if (accessQuery.isPending) {
    return (
      <p>{zh ? "正在核对 Workload 权限…" : "Checking Workload access…"}</p>
    );
  }

  if (accessQuery.isError) {
    return (
      <p>
        {zh
          ? "无法核对当前 Service 的 Workload 权限；控制已禁用。"
          : "Effective Workload access could not be verified; control is disabled."}
      </p>
    );
  }

  if (!canReadWorkload) {
    return (
      <p>
        {zh
          ? "没有读取 Workload 运行状态的权限；控制已禁用。"
          : "Workload state access is not authorized; control is disabled."}
      </p>
    );
  }

  if (observationQuery.isPending) {
    return <p>{zh ? "正在读取运行状态…" : "Reading operational state…"}</p>;
  }
  if (!observation) {
    return (
      <p>
        {zh
          ? "无法读取 Workload 运行状态；Adapter 不可用或访问被拒绝，控制已禁用。"
          : "Workload state could not be read; the Adapter is unavailable or access was denied, so control is disabled."}
      </p>
    );
  }

  return (
    <AvailableWorkloadControl
      mutation={mutation}
      observation={observation}
      observationRefreshFailed={observationQuery.isError}
      operationPollingFailed={operationTracking.operationPollingFailed}
      operationReadAuthorized={canReadOperation}
      operation={operationTracking.operation}
      reference={reference}
      workload={workload}
      workloadControlAuthorized={canControlWorkload}
      zh={zh}
    />
  );
}

type WorkloadMutation = ReturnType<
  ConsoleHostApi["systemRegistry"]["useMutateWorkload"]
>;

type WorkloadObservationQuery = ReturnType<
  ConsoleHostApi["systemRegistry"]["useWorkload"]
>;
type WorkloadObservationRefetch = WorkloadObservationQuery["refetch"];
type WorkloadObservationRefetchResult = Awaited<
  ReturnType<WorkloadObservationRefetch>
>;

const AUTHORITY_REFRESH_INITIAL_DELAY_MS = 1000;
const AUTHORITY_REFRESH_MAX_DELAY_MS = 30_000;

const authorityRefreshes = new WeakMap<
  WorkloadObservationRefetch,
  Promise<WorkloadObservationRefetchResult>
>();

async function refetchWorkloadAuthorityOnce(
  refetch: WorkloadObservationRefetch
): Promise<WorkloadObservationRefetchResult | null> {
  let refresh = authorityRefreshes.get(refetch);
  if (!refresh) {
    refresh = refetch();
    authorityRefreshes.set(refetch, refresh);
  }
  try {
    return await refresh;
  } catch {
    // The query owns error presentation; the periodic authority poll retries.
    return null;
  } finally {
    if (authorityRefreshes.get(refetch) === refresh) {
      authorityRefreshes.delete(refetch);
    }
  }
}

function useTrackedWorkloadOperation({
  canReadOperation,
  mutation,
  observationQuery,
  reference,
}: {
  canReadOperation: boolean;
  mutation: WorkloadMutation;
  observationQuery: WorkloadObservationQuery;
  reference: ConsoleWorkloadReference;
}) {
  const [authorityRefreshedOperationId, setAuthorityRefreshedOperationId] =
    useState<string | null>(null);
  const mutationOperation = mutation.data;
  const activeOperationId = workloadOperationHandle({
    mutationOperationId: mutationOperation?.operationId,
    observedActiveOperation: observationQuery.data?.activeOperation,
  });
  const operationQuery = consoleHostApi.systemRegistry.useWorkloadOperation(
    canReadOperation ? reference : null,
    canReadOperation ? activeOperationId : null
  );
  const recoverableOperationPollError =
    operationQuery.isError &&
    isRecoverableWorkloadOperationPollError(operationQuery.error);
  const mutationWasSuperseded =
    recoverableOperationPollError &&
    observationSupersedesMutationOperation({
      authorityRefreshedOperationId,
      mutationOperationId: mutationOperation?.operationId,
      observation: observationQuery.data,
    });
  const operationPollingFailed =
    operationQuery.isError && !mutationWasSuperseded;
  const authorityRefreshNeeded = Boolean(
    operationPollingFailed ||
    (observationQuery.data &&
      !shouldRetireWorkloadOperation(observationQuery.data))
  );
  const refetchObservation = observationQuery.refetch;

  useEffect(() => {
    if (
      shouldClearOperationAuthorityRefresh({
        authorityRefreshedOperationId,
        operation: operationQuery.data,
        operationPollingFailed: operationQuery.isError,
      })
    ) {
      setAuthorityRefreshedOperationId(null);
    }
  }, [
    authorityRefreshedOperationId,
    operationQuery.data,
    operationQuery.isError,
  ]);

  useEffect(() => {
    if (!authorityRefreshNeeded) {
      return;
    }
    const mutationOperationId = mutationOperation?.operationId;
    const operationFailed = recoverableOperationPollError;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout>;
    const refreshAuthority = async (delayMs: number) => {
      const result = await refetchWorkloadAuthorityOnce(refetchObservation);
      if (cancelled) {
        return;
      }
      if (result && !result.isError && result.data) {
        if (operationFailed && mutationOperationId) {
          setAuthorityRefreshedOperationId(mutationOperationId);
        }
        return;
      }
      refreshTimer = globalThis.setTimeout(() => {
        void refreshAuthority(
          Math.min(delayMs * 2, AUTHORITY_REFRESH_MAX_DELAY_MS)
        );
      }, delayMs);
    };
    void refreshAuthority(AUTHORITY_REFRESH_INITIAL_DELAY_MS);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(refreshTimer);
    };
  }, [
    authorityRefreshNeeded,
    mutationOperation?.operationId,
    operationQuery.isError,
    recoverableOperationPollError,
    refetchObservation,
  ]);

  const ignoredOperationId =
    mutationWasSuperseded && operationQuery.isError
      ? (mutationOperation?.operationId ?? null)
      : null;

  return {
    operation: currentWorkloadOperation({
      ignoredOperationId,
      mutationOperation,
      operation: operationQuery.data,
      operationPollingFailed,
    }),
    operationPollingFailed,
  };
}

function currentWorkloadOperation({
  ignoredOperationId,
  mutationOperation,
  operation,
  operationPollingFailed,
}: {
  ignoredOperationId: string | null;
  mutationOperation: ConsoleWorkloadOperationRecord | undefined;
  operation: ConsoleWorkloadOperationRecord | undefined;
  operationPollingFailed: boolean;
}): ConsoleWorkloadOperationRecord | undefined {
  if (operation && isTerminalWorkloadOperation(operation)) {
    return operation;
  }
  if (mutationOperation && isTerminalWorkloadOperation(mutationOperation)) {
    return mutationOperation;
  }
  if (operationPollingFailed) {
    return undefined;
  }
  if (operation && operation.operationId !== ignoredOperationId) {
    return operation;
  }
  return mutationOperation?.operationId === ignoredOperationId
    ? undefined
    : mutationOperation;
}

function AvailableWorkloadControl({
  mutation,
  observation,
  observationRefreshFailed,
  operation,
  operationPollingFailed,
  operationReadAuthorized,
  reference,
  workload,
  workloadControlAuthorized,
  zh,
}: {
  mutation: WorkloadMutation;
  observation: ConsoleWorkloadObservation;
  observationRefreshFailed: boolean;
  operation: ConsoleWorkloadOperationRecord | undefined;
  operationPollingFailed: boolean;
  operationReadAuthorized: boolean;
  reference: ConsoleWorkloadReference;
  workload: ConsoleSystemTopologyWorkload;
  workloadControlAuthorized: boolean;
  zh: boolean;
}) {
  return (
    <div data-workload-control={workload.workloadId}>
      <p>
        {workload.workloadId} · {workload.role}
      </p>
      <InlineStatus tone={workloadStateTone(observation.state)}>
        {workloadStateLabel(observation.state)}
      </InlineStatus>
      <ObservedRevision observation={observation} zh={zh} />
      <WorkloadActionButton
        mutation={mutation}
        observation={observation}
        operation={operation}
        operationReadAuthorized={
          operationReadAuthorized &&
          !observationRefreshFailed &&
          !operationPollingFailed
        }
        reference={reference}
        workloadControlAuthorized={workloadControlAuthorized}
        zh={zh}
      />
      <WorkloadProtectionNotice observation={observation} zh={zh} />
      <WorkloadOperationStatus operation={operation} zh={zh} />
      {observationRefreshFailed ? (
        <p>
          {zh
            ? "已保留最近的权威运行状态；当前状态刷新不可用，操作已禁用。"
            : "The last authoritative operational state is retained; current state refresh is unavailable. Actions are disabled."}
        </p>
      ) : null}
      {operationPollingFailed ? (
        <p>
          {isTerminalWorkloadOperation(operation)
            ? zh
              ? "已保留最近的终态操作记录；当前无法刷新 Adapter 权威状态。"
              : "The latest terminal operation record is retained; current authority refresh is unavailable."
            : zh
              ? "操作状态未知；正在刷新 Adapter 权威状态。"
              : "Operation status is unknown; refreshing authority state."}
        </p>
      ) : null}
      {!workloadControlAuthorized || !operationReadAuthorized ? (
        <p>
          {zh
            ? "缺少 Workload 控制或操作读取权限；操作已禁用。"
            : "Workload control or operation-read access is not authorized; actions are disabled."}
        </p>
      ) : null}
      {mutation.isError ? <p>{mutation.error.message}</p> : null}
    </div>
  );
}

function hasEffectiveWorkloadCapability(
  capabilities: ReadonlySet<string>,
  required: string
) {
  return capabilities.has("*") || capabilities.has(required);
}

function ObservedRevision({
  observation,
  zh,
}: {
  observation: ConsoleWorkloadObservation;
  zh: boolean;
}) {
  if (!observation.observedRevision) {
    return null;
  }
  return (
    <p>
      {zh ? "观察修订" : "Observed revision"}: {observation.observedRevision}
    </p>
  );
}

function WorkloadActionButton({
  mutation,
  observation,
  operation,
  operationReadAuthorized,
  reference,
  workloadControlAuthorized,
  zh,
}: {
  mutation: WorkloadMutation;
  observation: ConsoleWorkloadObservation;
  operation: ConsoleWorkloadOperationRecord | undefined;
  operationReadAuthorized: boolean;
  reference: ConsoleWorkloadReference;
  workloadControlAuthorized: boolean;
  zh: boolean;
}) {
  const action = primaryAction(observation.state);
  if (!action) {
    return null;
  }
  const canMutate = canMutateWorkload({
    action,
    authorized: workloadControlAuthorized && operationReadAuthorized,
    mutationPending: mutation.isPending,
    observation,
    operation,
  });
  const { observedRevision } = observation;
  return (
    <Button
      disabled={!canMutate}
      onClick={() => {
        if (!observedRevision) {
          return;
        }
        mutation.mutate({
          action,
          idempotencyKey: newIdempotencyKey(),
          observedRevision,
          workload: reference,
        });
      }}
      variant={action.kind === "suspend" ? "danger" : "primary"}
    >
      {workloadActionLabel(action.kind, zh)}
    </Button>
  );
}

function WorkloadProtectionNotice({
  observation,
  zh,
}: {
  observation: ConsoleWorkloadObservation;
  zh: boolean;
}) {
  if (observation.protection !== "control_plane") {
    return null;
  }
  return (
    <p>
      {zh
        ? "控制平面 Workload 受保护，不能通过 Console 控制自身。"
        : "Control-plane Workloads are protected from self-control."}
    </p>
  );
}

function WorkloadOperationStatus({
  operation,
  zh,
}: {
  operation: ConsoleWorkloadOperationRecord | undefined;
  zh: boolean;
}) {
  if (!operation) {
    return null;
  }
  const failure = operation.failure ? ` · ${operation.failure.message}` : "";
  return (
    <p>
      {zh ? "操作" : "Operation"} {operation.operationId} · {operation.phase}
      {failure}
    </p>
  );
}

function canMutateWorkload({
  action,
  authorized,
  mutationPending,
  observation,
  operation,
}: {
  action: { kind: "suspend" | "resume" };
  authorized: boolean;
  mutationPending: boolean;
  observation: ConsoleWorkloadObservation;
  operation: ConsoleWorkloadOperationRecord | undefined;
}) {
  const operationActive =
    operation !== undefined &&
    !["succeeded", "failed", "denied"].includes(operation.phase);
  return Boolean(
    observation.observedRevision &&
    observation.protection === "controllable" &&
    authorized &&
    (observation.capabilities ?? []).includes(action.kind) &&
    !observation.activeOperation &&
    !operationActive &&
    !mutationPending
  );
}

function workloadActionLabel(kind: "suspend" | "resume", zh: boolean) {
  if (kind === "suspend") {
    return zh ? "暂停" : "Suspend";
  }
  return zh ? "恢复" : "Resume";
}

function primaryAction(state: ConsoleWorkloadOperationalState | undefined) {
  if (state === "running") {
    return { kind: "suspend" } as const;
  }
  if (state === "suspended") {
    return { kind: "resume" } as const;
  }
  return null;
}

function workloadStateLabel(state: ConsoleWorkloadOperationalState) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function workloadStateTone(
  state: ConsoleWorkloadOperationalState
): "neutral" | "success" | "warning" | "danger" {
  switch (state) {
    case "running": {
      return "success";
    }
    case "suspended":
    case "transitioning":
    case "unknown": {
      return "warning";
    }
    case "failed": {
      return "danger";
    }
    default: {
      return "neutral";
    }
  }
}

function newIdempotencyKey() {
  return `workload-control-${globalThis.crypto.randomUUID()}`;
}
