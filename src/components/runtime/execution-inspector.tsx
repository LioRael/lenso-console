import { useConsoleLocale } from "@lenso/console-ui-internal";
import { Copy, ExternalLink, Network, RotateCcw, X } from "lucide-react";

import type {
  RuntimeStory,
  ExecutionNode,
  ExecutionLogEntry,
  ExecutionPayload,
  TechnicalOperation,
} from "../../data/mock-runtime";
import { retryTargetForNode } from "../../data/mock-runtime";
import {
  useExecutionLogs,
  useExecutionPayload,
  useExecutionTechnicalOperations,
  useStoryTechnicalOperations,
} from "../../hooks/use-runtime-queries";
import { cn } from "../../lib/cn";
import { formatRuntimeDuration } from "../../lib/runtime-style";
import {
  buildExecutionActivity,
  buildExecutionContext,
  buildExecutionFailures,
  buildRemoteProxyInspectorDetail,
  executionInspectorTabs,
  getExecutionInspectorTabCounts,
  type ExecutionActivityItem,
  type ExecutionInspectorTab,
} from "./execution-inspector-model";
import { HorizontalTabScroll } from "./horizontal-tab-scroll";
import { JsonViewer } from "./json-viewer";
import { useRuntimeConsole } from "./runtime-console-context";
import {
  buildTechnicalOperationGroups,
  technicalOperationOperationsTarget,
  technicalOperationsStateLabel,
  type TechnicalOperationGroup,
  type TechnicalOperationView,
} from "./technical-operations-model";

export function ExecutionInspector({
  activeTab,
  onClearSelection,
  selectedNode,
  setActiveTab,
  story,
}: {
  story: RuntimeStory;
  selectedNode: ExecutionNode;
  activeTab: ExecutionInspectorTab;
  onClearSelection: () => void;
  setActiveTab: (tab: ExecutionInspectorTab) => void;
}) {
  const { locale } = useConsoleLocale();
  const { openRetry } = useRuntimeConsole();
  const zh = locale === "zh-CN";
  const node = selectedNode;
  const tabCounts = getExecutionInspectorTabCounts(story, node);
  const retryTarget = retryTargetForNode(node);
  const routeLabel = buildInspectorPath(story, node);

  return (
    <aside className="grid h-full min-h-0 w-full min-w-0 max-w-full grid-rows-[94px_36px_minmax(0,1fr)] overflow-hidden border-l border-(--line-subtle) bg-(--bg-canvas)">
      <div className="relative min-w-0 overflow-hidden border-b border-(--line-subtle) pt-7">
        <div className="flex h-4 items-center justify-between px-3 text-[9px] leading-none text-(--fg-tertiary)">
          <span className="truncate font-medium capitalize">
            {typeLabel(node)}&nbsp; / &nbsp;{node.service}
          </span>
          <button
            aria-label="Clear inspector selection"
            className="group flex min-w-0 items-center gap-1 font-mono text-[9px] text-(--fg-tertiary) hover:text-(--fg-primary)"
            onClick={onClearSelection}
            type="button"
          >
            <span className="max-w-22 truncate">{node.id}</span>
            <X className="size-2.5 opacity-0 group-hover:opacity-100" />
          </button>
        </div>
        <div className="flex h-8 min-w-0 items-center gap-2 px-3">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: statusColorForInspector(node.status) }}
          />
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-(--fg-primary)">
            {node.canonicalName ?? node.name}
          </h2>
          {retryTarget ? (
            <button
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-3 text-[12px] font-medium text-(--fg-primary) hover:bg-(--bg-control-hover)"
              onClick={() => openRetry(retryTarget)}
              type="button"
            >
              <RotateCcw size={12} />
              {zh ? "重试" : "Retry"}
            </button>
          ) : null}
        </div>
        <div className="flex h-[17px] min-w-0 items-center gap-1.5 overflow-hidden px-3 text-[9px] leading-none">
          <span className="shrink-0 font-medium text-(--fg-tertiary)">
            {zh ? "路径" : "Path"}
          </span>
          <span
            className="truncate font-mono text-(--fg-secondary)"
            title={routeLabel}
          >
            {routeLabel}
          </span>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden border-b border-(--line-subtle) bg-(--bg-canvas)">
        <HorizontalTabScroll>
          <div
            aria-label={zh ? "执行详情标签" : "Execution detail tabs"}
            className="flex h-9 w-max min-w-full items-start gap-1 px-3"
            role="tablist"
          >
            {executionInspectorTabs.map((tab, index) => (
              <button
                aria-controls="execution-inspector-panel"
                aria-selected={activeTab === tab.id}
                className={cn(
                  "relative flex h-[33px] shrink-0 items-center justify-center gap-1 px-1 text-[12px] text-(--fg-tertiary)",
                  activeTab === tab.id && "font-medium text-(--fg-primary)"
                )}
                id={`execution-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key
                    )
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? executionInspectorTabs.length - 1
                        : event.key === "ArrowRight"
                          ? (index + 1) % executionInspectorTabs.length
                          : (index - 1 + executionInspectorTabs.length) %
                            executionInspectorTabs.length;
                  const next = executionInspectorTabs[nextIndex];
                  if (next) {
                    setActiveTab(next.id);
                    document
                      .getElementById(`execution-tab-${next.id}`)
                      ?.focus();
                  }
                }}
                role="tab"
                tabIndex={activeTab === tab.id ? 0 : -1}
                type="button"
              >
                <span>
                  {zh ? inspectorTabZh[tab.id] : tab.label}
                  {tabCounts[tab.id] > 0 ? ` ${tabCounts[tab.id]}` : ""}
                </span>
                {tabCounts[tab.id] > 0 ? (
                  <span className="sr-only">items</span>
                ) : null}
                <span
                  className={cn(
                    "absolute right-1 bottom-0 left-1 h-px bg-(--accent) transition-opacity",
                    activeTab === tab.id ? "opacity-100" : "opacity-0"
                  )}
                />
              </button>
            ))}
          </div>
        </HorizontalTabScroll>
      </div>

      <div
        aria-labelledby={`execution-tab-${activeTab}`}
        className="min-h-0 min-w-0 overflow-auto bg-(--bg-canvas) [scrollbar-width:thin]"
        id="execution-inspector-panel"
        role="tabpanel"
      >
        <InspectorBody activeTab={activeTab} node={node} story={story} />
      </div>
    </aside>
  );
}

const inspectorTabZh: Record<ExecutionInspectorTab, string> = {
  overview: "概览",
  payload: "载荷",
  logs: "日志",
  events: "事件",
  operations: "操作",
};

function InspectorBody({
  activeTab,
  node,
  story,
}: {
  story: RuntimeStory;
  node: ExecutionNode;
  activeTab: ExecutionInspectorTab;
}) {
  const { openRemoteCalls, openRetry } = useRuntimeConsole();
  const payloadQuery = useExecutionPayload(
    story,
    node.id,
    activeTab === "payload" || activeTab === "overview"
  );
  const logsQuery = useExecutionLogs(story, node.id, activeTab === "logs");
  const executionOperationsQuery = useExecutionTechnicalOperations(
    node.id,
    !story.federation
  );
  const storyOperationsQuery = useStoryTechnicalOperations(story.correlationId);

  if (activeTab === "overview") {
    const retryTarget = retryTargetForNode(node);
    const remoteProxyDetail = buildRemoteProxyInspectorDetail(node);
    const technicalGroups = buildTechnicalOperationGroups({
      executionOperations: executionOperationsQuery.data ?? [],
      selectedNodeId: node.id,
      storyOperations: storyOperationsQuery.data ?? [],
      storyTimestamp: story.timestamp,
    });
    return (
      <OverviewDocument
        executionOperationsCount={technicalGroups.reduce(
          (count, group) => count + group.operations.length,
          0
        )}
        logsCount={node.logs.length}
        node={node}
        payload={payloadQuery.data}
        story={story}
      >
        {remoteProxyDetail ? (
          <RemoteProxyDetail
            detail={remoteProxyDetail}
            onOpenRemoteCalls={() => openRemoteCalls(story.correlationId)}
          />
        ) : null}
        {retryTarget && (node.status === "failed" || node.status === "dead") ? (
          <button
            className="mx-3 mb-3 inline-flex h-7 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--tone-error-border)] bg-(--bg-control) px-2 text-[11px] font-medium text-(--tone-error-fg) hover:bg-(--bg-control-hover)"
            onClick={() => openRetry(retryTarget)}
            type="button"
          >
            <RotateCcw size={12} />
            Retry execution
          </button>
        ) : null}
      </OverviewDocument>
    );
  }

  if (activeTab === "payload") {
    return (
      <PayloadDocument
        error={payloadQuery.error}
        isError={payloadQuery.isError}
        isLoading={payloadQuery.isLoading}
        payload={payloadQuery.data}
      />
    );
  }

  if (activeTab === "events") {
    return (
      <EventsDocument
        activity={buildExecutionActivity(story, node)}
        failures={buildExecutionFailures(node)}
        node={node}
      />
    );
  }

  if (activeTab === "logs") {
    return (
      <LogList
        error={logsQuery.error}
        isError={logsQuery.isError}
        isLoading={logsQuery.isLoading}
        logs={logsQuery.data ?? []}
        story={story}
      />
    );
  }

  const context = buildExecutionContext(story, node);
  return (
    <OperationsDocument
      context={context}
      executionOperations={executionOperationsQuery.data ?? []}
      error={executionOperationsQuery.error ?? storyOperationsQuery.error}
      isError={executionOperationsQuery.isError || storyOperationsQuery.isError}
      isLoading={
        executionOperationsQuery.isLoading || storyOperationsQuery.isLoading
      }
      node={node}
      story={story}
      storyOperations={storyOperationsQuery.data ?? []}
    />
  );
}

function EventsDocument({
  activity,
  failures,
  node,
}: {
  activity: ExecutionActivityItem[];
  failures: ReturnType<typeof buildExecutionFailures>;
  node: ExecutionNode;
}) {
  return (
    <div className="grid min-w-full">
      <InspectorSectionLabel label="Activity" />
      <ActivityList activity={activity} />
      {failures.length > 0 ? (
        <>
          <InspectorSectionLabel label="Failure evidence" />
          <FailurePanel failures={failures} node={node} />
        </>
      ) : null}
    </div>
  );
}

function OperationsDocument({
  context,
  error,
  executionOperations,
  isError,
  isLoading,
  node,
  story,
  storyOperations,
}: {
  context: ReturnType<typeof buildExecutionContext>;
  executionOperations: TechnicalOperation[];
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  node: ExecutionNode;
  story: RuntimeStory;
  storyOperations: TechnicalOperation[];
}) {
  return (
    <div className="grid min-w-full">
      <KeyValueTable rows={context.rows} />
      <RelatedExecutionList
        label="upstream references"
        nodes={context.upstream}
      />
      <RelatedExecutionList
        label="downstream references"
        nodes={context.downstream}
      />
      <TechnicalPanel
        executionOperations={executionOperations}
        error={error}
        isError={isError}
        isLoading={isLoading}
        node={node}
        story={story}
        storyOperations={storyOperations}
      />
      <JsonViewer
        title="execution context"
        value={{ attributes: node.attributes, context: node.context }}
      />
    </div>
  );
}

function InspectorSectionLabel({ label }: { label: string }) {
  return (
    <div className="flex h-[30px] items-center border-b border-(--line) bg-(--bg-panel-header) px-3 text-[10px] font-medium uppercase tracking-[0.04em] text-(--fg-tertiary)">
      {label}
    </div>
  );
}

function OverviewDocument({
  children,
  executionOperationsCount,
  logsCount,
  node,
  payload,
  story,
}: {
  children?: React.ReactNode;
  executionOperationsCount: number;
  logsCount: number;
  node: ExecutionNode;
  payload: ExecutionPayload | undefined;
  story: RuntimeStory;
}) {
  const context = buildExecutionContext(story, node);
  const parent = context.upstream.at(-1);
  const [child] = context.downstream;
  const signal = executionSignal(node);
  const stableEffect = firstString(
    node.attributes.stable_effect,
    node.attributes.stableEffect,
    node.attributes.effect_id,
    node.attributes.effectId
  );
  const traceId = firstString(
    node.context.trace_id,
    node.context.traceId,
    node.attributes.trace_id,
    node.attributes.traceId
  );
  const payloadCount = [
    payload?.input,
    payload?.output,
    payload?.metadata,
  ].filter(hasPanelValue).length;
  const attempt = `${node.attempts ?? 1} / ${node.maxAttempts ?? 1}`;
  const properties: Array<
    | { label: string; value: string }
    | { left: [string, string]; right: [string, string] }
  > = [
    { label: "canonical name", value: node.canonicalName ?? node.name },
    { label: "stable effect", value: stableEffect ?? "—" },
    {
      left: ["service", node.service],
      right: ["kind", typeLabel(node)],
    },
    {
      left: ["started", inspectorClock(story, node.startMs)],
      right: [
        "completed",
        inspectorClock(story, node.startMs + node.durationMs),
      ],
    },
    {
      left: ["status", node.status],
      right: ["attempt", attempt],
    },
    {
      left: ["parent", parent?.name ?? "—"],
      right: ["children", String(context.downstream.length)],
    },
  ];

  return (
    <div className="min-w-full text-xs">
      <section className="h-[104px] border-b border-(--line-subtle) px-3 pt-[11px] pb-2.5">
        <div className="flex h-4 items-center justify-between text-[9.5px] font-medium text-(--fg-tertiary)">
          <span>Execution</span>
          <span className={statusTone(node.status)}>
            {statusLabel(node.status)}
          </span>
        </div>
        <h3 className="mt-1.5 truncate text-[13px] font-medium text-(--fg-primary)">
          {signal.title}
        </h3>
        <p className="mt-1 max-w-full text-[10px] leading-[15px] text-(--fg-secondary)">
          {signal.description}
        </p>
      </section>

      <section className="grid h-[58px] grid-cols-3 gap-4 border-b border-(--line-subtle) px-3 py-2.5">
        <InspectorMetric
          accent
          label="Duration"
          value={formatRuntimeDuration(node.durationMs)}
        />
        <InspectorMetric label="Attempt" value={attempt} />
        <InspectorMetric
          label="Children"
          value={String(context.downstream.length)}
        />
      </section>

      <ExecutionRoute
        child={child}
        node={node}
        parent={parent}
        stable={Boolean(stableEffect) || node.status === "completed"}
      />

      <section className="border-b border-(--line-subtle)">
        <div className="flex h-[30px] items-center justify-between px-3 text-[9.5px] font-medium text-(--fg-tertiary)">
          <span>Properties</span>
          <button
            className="inline-flex items-center gap-1 text-[9px] text-(--fg-secondary) hover:text-(--fg-primary)"
            type="button"
          >
            <Copy size={12} />
            Copy all
          </button>
        </div>
        {properties.map((property, index) =>
          "label" in property ? (
            <div
              className="grid h-9 grid-cols-[92px_minmax(0,1fr)] items-center border-b border-(--line-subtle) px-3 font-mono last:border-b-0"
              key={property.label}
            >
              <span className="text-[8.5px] text-(--fg-tertiary)">
                {property.label}
              </span>
              <span className="truncate text-[9px] text-(--fg-primary)">
                {property.value}
              </span>
            </div>
          ) : (
            <div
              className="grid h-9 grid-cols-[60px_102px_62px_minmax(0,1fr)] items-center border-b border-(--line-subtle) px-3 font-mono last:border-b-0"
              key={`${property.left[0]}-${index}`}
            >
              <span className="text-[8.5px] text-(--fg-tertiary)">
                {property.left[0]}
              </span>
              <span
                className={cn(
                  "truncate text-[9px] text-(--fg-primary)",
                  property.left[0] === "status" && statusTone(node.status)
                )}
              >
                {property.left[1]}
              </span>
              <span className="text-[8.5px] text-(--fg-tertiary)">
                {property.right[0]}
              </span>
              <span className="truncate text-[9px] text-(--fg-primary)">
                {property.right[1]}
              </span>
            </div>
          )
        )}
      </section>

      <section className="border-b border-(--line-subtle)">
        <div className="flex h-[30px] items-center justify-between px-3 text-[9.5px] font-medium text-(--fg-tertiary)">
          <span>Evidence</span>
          <span className="font-mono text-[8.5px]">
            {Number(payloadCount > 0) +
              Number(logsCount > 0) +
              Number(executionOperationsCount > 0)}{" "}
            sources
          </span>
        </div>
        <EvidenceRow
          count={payloadCount}
          description="request + response"
          label="Payload"
        />
        <EvidenceRow
          count={logsCount}
          description="structured entries"
          label="Logs"
          muted
        />
        <EvidenceRow
          count={executionOperationsCount}
          description="trace + correlation"
          label="Technical"
          muted
        />
        <div className="h-[60px] bg-(--bg-panel-muted) px-3 py-1.5">
          <div className="text-[9.5px] font-medium text-(--fg-tertiary)">
            Trace context
          </div>
          <div className="mt-0.5 font-mono text-[9px] leading-[14px] text-(--fg-secondary)">
            <div className="truncate">
              trace&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{traceId ?? "—"}
            </div>
            <div className="truncate">
              correlation&nbsp;&nbsp;{story.correlationId}
            </div>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

function InspectorMetric({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "truncate font-mono text-[13px] leading-[17px] text-(--fg-primary)",
          accent && "text-(--tone-success-fg)"
        )}
      >
        {value}
      </div>
      <div className="mt-[3px] text-[9px] font-medium text-(--fg-tertiary)">
        {label}
      </div>
    </div>
  );
}

function ExecutionRoute({
  child,
  node,
  parent,
  stable,
}: {
  child: ExecutionNode | undefined;
  node: ExecutionNode;
  parent: ExecutionNode | undefined;
  stable: boolean;
}) {
  const route = [parent, node, child];
  return (
    <section className="relative h-[122px] overflow-hidden border-b border-(--line-subtle)">
      <div className="flex items-center justify-between px-3 pt-2.5 text-[9.5px] font-medium text-(--fg-tertiary)">
        <span>Execution route</span>
        <span className="font-mono text-[8.5px] font-normal">
          {parent ? 1 : 0} upstream&nbsp; · &nbsp;{child ? 1 : 0} downstream
        </span>
      </div>
      <div className="absolute top-[60px] right-7 left-7 h-px bg-(--line-subtle)" />
      <div className="absolute top-[37px] right-3 left-3 grid grid-cols-3">
        {route.map((item, index) => {
          const selected = index === 1;
          return (
            <div className="min-w-0 text-center" key={item?.id ?? index}>
              <div
                className={cn(
                  "truncate px-1 text-[10px] text-(--fg-secondary)",
                  selected && "font-medium text-(--fg-primary)"
                )}
                title={item?.name}
              >
                {item?.name ?? "—"}
              </div>
              <span
                className={cn(
                  "mx-auto mt-3 block size-1.5 rounded-full bg-(--fg-tertiary)",
                  selected && "size-2 -translate-y-px bg-(--tone-success-fg)"
                )}
              />
              <div
                className={cn(
                  "mt-2 truncate px-1 font-mono text-[8.5px] text-(--fg-tertiary)",
                  selected &&
                    "font-sans text-[9px] font-medium text-(--tone-success-fg)"
                )}
              >
                {selected
                  ? `${node.service} · selected`
                  : item
                    ? `${item.service} · ${index === 0 ? formatRuntimeDuration(item.durationMs) : "next"}`
                    : "—"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute right-3 bottom-3 left-3 truncate font-mono text-[9px] text-(--fg-secondary)">
        {stable
          ? "selected effect is stable; completion evidence received"
          : "selected execution is awaiting stable completion evidence"}
      </div>
    </section>
  );
}

function EvidenceRow({
  count,
  description,
  label,
  muted = false,
}: {
  count: number;
  description: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className="mx-3 flex h-[34px] items-center gap-2 border-b border-(--line-subtle)">
      <span
        className={cn(
          "size-[5px] shrink-0 bg-(--accent)",
          muted && "bg-(--fg-tertiary)"
        )}
      />
      <span className="text-[10px] font-medium text-(--fg-primary)">
        {label}
      </span>
      <span className="font-mono text-[9px] text-(--fg-tertiary)">
        {description}
      </span>
      <span className="ml-auto font-mono text-[9px] text-(--fg-secondary)">
        {count}
      </span>
    </div>
  );
}

function executionSignal(node: ExecutionNode) {
  const title = `${node.name} ${statusLabel(node.status).toLowerCase()}`;
  const description =
    node.status === "failed" || node.status === "dead"
      ? `Execution stopped in ${node.service}; failure evidence is available for operator review.`
      : `Recorded by ${node.service} after ${formatRuntimeDuration(node.durationMs)} with its execution evidence attached.`;
  return { description, title };
}

function buildInspectorPath(story: RuntimeStory, node: ExecutionNode) {
  return buildBreadcrumb(story, node)
    .map((item) => item.name)
    .join("  →  ");
}

function statusColorForInspector(status: ExecutionNode["status"]) {
  if (status === "failed" || status === "dead") {
    return "var(--tone-error-fg)";
  }
  if (status === "pending" || status === "processing" || status === "running") {
    return "var(--tone-warning-fg)";
  }
  return "var(--tone-success-fg)";
}

function statusTone(status: ExecutionNode["status"]) {
  if (status === "failed" || status === "dead") {
    return "text-(--tone-error-fg)";
  }
  if (status === "pending" || status === "processing" || status === "running") {
    return "text-(--tone-warning-fg)";
  }
  return "text-(--tone-success-fg)";
}

function statusLabel(status: ExecutionNode["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function firstString(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

function inspectorClock(story: RuntimeStory, offsetMs: number) {
  const startedAt = Date.parse(story.timestamp);
  if (!Number.isFinite(startedAt)) {
    return formatRuntimeDuration(offsetMs);
  }
  const date = new Date(startedAt + offsetMs);
  return `${date.toISOString().slice(11, 19)}.${String(date.getUTCMilliseconds()).padStart(3, "0")}`;
}

function RemoteProxyDetail({
  detail,
  onOpenRemoteCalls,
}: {
  detail: ReturnType<typeof buildRemoteProxyInspectorDetail>;
  onOpenRemoteCalls: () => void;
}) {
  if (!detail) {
    return null;
  }

  return (
    <section className="grid min-w-full border-b border-(--line)">
      <div className="flex items-center gap-2 bg-(--bg-panel-header) px-3 py-1.5 text-[11px] text-(--fg-tertiary)">
        <span className="font-medium text-(--fg-secondary)">Remote proxy</span>
        <button
          className="ml-auto inline-flex h-5 items-center gap-1 border border-(--line) bg-(--bg-control) px-1.5 text-[10px] text-(--fg-secondary) hover:text-(--fg-primary)"
          onClick={onOpenRemoteCalls}
          type="button"
        >
          <Network size={11} />
          Remote Calls
        </button>
      </div>
      <KeyValueTable rows={detail.rows} />
      {hasPanelValue(detail.pathParams) ? (
        <JsonViewer title="path params" value={detail.pathParams} />
      ) : null}
      {hasPanelValue(detail.errorDetails) ? (
        <JsonViewer title="error details" value={detail.errorDetails} />
      ) : null}
    </section>
  );
}

function TechnicalPanel({
  executionOperations,
  error,
  isError,
  isLoading,
  node,
  story,
  storyOperations,
}: {
  executionOperations: TechnicalOperation[];
  storyOperations: TechnicalOperation[];
  story: RuntimeStory;
  node: ExecutionNode;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const groups = buildTechnicalOperationGroups({
    executionOperations,
    selectedNodeId: node.id,
    storyOperations,
    storyTimestamp: story.timestamp,
  });
  if (groups.length === 0 || isLoading || isError) {
    return (
      <div className="grid min-w-full">
        <EmptyRows
          label={technicalOperationsStateLabel({ error, isError, isLoading })}
        />
      </div>
    );
  }

  return (
    <div className="grid min-w-full">
      {groups.map((group) => (
        <TechnicalOperationGroupView group={group} key={group.id} />
      ))}
    </div>
  );
}

function TechnicalOperationGroupView({
  group,
}: {
  group: TechnicalOperationGroup;
}) {
  return (
    <section className="border-b border-(--line)">
      <div className="flex items-center gap-2 bg-(--bg-panel-header) px-3 py-1.5 text-[11px] text-(--fg-tertiary)">
        <span className="font-medium text-(--fg-secondary)">{group.label}</span>
        <span className="rounded-xs border border-(--line) bg-(--bg-canvas) px-1.5 py-0.5 text-[10px] text-(--fg-tertiary)">
          {group.operations.length}
        </span>
      </div>
      {group.operations.map((operation) => (
        <TechnicalOperationRow operation={operation} key={operation.id} />
      ))}
    </section>
  );
}

function TechnicalOperationRow({
  operation,
}: {
  operation: TechnicalOperationView;
}) {
  const { openAdminActions, openRemoteCalls } = useRuntimeConsole();
  const operationsTarget = technicalOperationOperationsTarget(operation);
  return (
    <div className="border-t border-(--line) bg-(--bg-canvas)">
      <div className="grid min-w-full grid-cols-[72px_82px_minmax(180px,1fr)_72px_64px_58px_24px] items-start gap-2 px-3 py-2 text-xs">
        <span className="w-fit border-r border-(--line) pr-1.5 text-[10px] font-medium text-(--fg-secondary)">
          {operation.category}
        </span>
        <span
          className={cn(
            "w-fit text-[10px] font-medium",
            operationSourceTone(operation)
          )}
        >
          {operation.sourceLabel}
        </span>
        <div className="min-w-0">
          <div
            className="truncate font-mono text-(--fg-primary)"
            title={operation.name}
          >
            {operation.name}
          </div>
          {operation.summary ? (
            <div
              className="mt-1 truncate text-[11px] text-(--fg-tertiary)"
              title={operation.summary}
            >
              {operation.summary}
            </div>
          ) : null}
        </div>
        <span
          className={cn(
            "text-[11px] leading-5",
            operation.status === "error"
              ? "text-(--tone-error-fg)"
              : "text-(--fg-tertiary)"
          )}
        >
          {operation.status}
        </span>
        <span className="text-right text-[11px] leading-5 text-(--fg-tertiary)">
          {formatRuntimeDuration(operation.durationMs)}
        </span>
        <span className="text-right text-[11px] leading-5 text-(--fg-tertiary)">
          +{formatRuntimeDuration(operation.relativeStartMs)}
        </span>
        {operationsTarget ? (
          <button
            aria-label={`Open ${operation.sourceLabel} operations`}
            className="grid size-5 place-items-center rounded-xs border border-(--line) bg-(--bg-control) text-(--fg-tertiary) hover:text-(--fg-primary)"
            onClick={() => {
              if (operationsTarget.kind === "remote_calls") {
                openRemoteCalls(
                  operationsTarget.correlationId,
                  operationsTarget.selectedId
                );
                return;
              }
              openAdminActions(
                operationsTarget.correlationId,
                operationsTarget.selectedId
              );
            }}
            title={`Open ${operation.sourceLabel} operations`}
            type="button"
          >
            <ExternalLink size={11} />
          </button>
        ) : (
          <span />
        )}
      </div>
      <JsonViewer title="safe attributes" value={operation.safeAttributes} />
    </div>
  );
}

function operationSourceTone(operation: TechnicalOperationView) {
  if (operation.source === "remote_proxy") {
    return "text-(--tone-warning-fg)";
  }
  if (operation.source === "remote_runtime") {
    return "text-(--tone-info-fg)";
  }
  if (operation.source === "admin_action") {
    return "text-(--tone-info-fg)";
  }
  return "text-(--fg-tertiary)";
}

function KeyValueTable({ rows }: { rows: Array<[string, unknown]> }) {
  if (rows.length === 0) {
    return <EmptyRows label="No execution details recorded" />;
  }

  return (
    <div className="w-max min-w-full border-b border-(--line) text-xs">
      {rows.map(([key, value]) => (
        <div
          className="grid w-max min-w-full grid-cols-[124px_minmax(220px,max-content)] border-b border-(--line) last:border-b-0"
          key={key}
        >
          <div className="bg-(--bg-panel-header) px-3 py-1.5 text-[11px] font-medium text-(--fg-tertiary)">
            {key}
          </div>
          <div className="whitespace-pre-wrap px-3 py-1.5 font-mono text-[11px] text-(--fg-secondary)">
            {formatCell(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ activity }: { activity: ExecutionActivityItem[] }) {
  if (activity.length === 0) {
    return <EmptyRows label="No activity recorded" />;
  }
  return (
    <div className="w-max min-w-full text-xs">
      {activity.map((item) => (
        <div
          className="grid w-max min-w-full grid-cols-[58px_minmax(220px,max-content)] gap-2 border-b border-(--line) px-3 py-2"
          key={item.id}
        >
          <span className="whitespace-nowrap font-mono text-(--fg-tertiary)">
            +{formatRuntimeDuration(item.timestampMs)}
          </span>
          <div>
            <div className="whitespace-nowrap text-(--fg-primary)">
              {item.label}
            </div>
            <div className="whitespace-nowrap font-mono text-[11px] text-(--fg-tertiary)">
              {item.detail ?? `${item.kind} · ${item.status}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FailurePanel({
  failures,
  node,
}: {
  failures: ReturnType<typeof buildExecutionFailures>;
  node: ExecutionNode;
}) {
  if (failures.length === 0) {
    return <EmptyRows label="No failures recorded" />;
  }

  return (
    <div className="grid min-w-full">
      <KeyValueTable rows={failures.map((item) => [item.label, item.value])} />
      <KeyValueTable
        rows={[
          ["dead letter state", node.status === "dead" ? "dead" : "-"],
          ["retryability", node.retryable ? "retryable" : "not retryable"],
          ["failure timeline", node.logs.join("\n") || "-"],
        ]}
      />
    </div>
  );
}

function PayloadDocument({
  error,
  isError,
  isLoading,
  payload,
}: {
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  payload: ExecutionPayload | undefined;
}) {
  if (isLoading) {
    return <EmptyRows label="Loading captured execution payload..." />;
  }
  if (isError) {
    return (
      <EmptyRows
        label={`Execution payload could not be loaded. ${errorMessage(error)}`}
      />
    );
  }

  const sections = [
    ["input", payload?.input],
    ["output", payload?.output],
    ["metadata", payload?.metadata],
  ] as const;
  if (!sections.some(([, value]) => hasPanelValue(value))) {
    return (
      <EmptyRows label="No payload or metadata was captured for this execution." />
    );
  }

  return (
    <div className="grid min-w-full">
      {payload && payload.redactedFields.length > 0 ? (
        <div className="border-b border-(--line) tint-soft tint-warning px-3 py-2 font-mono text-[11px] leading-5 tint-text">
          Redacted {payload.redactedFields.length} sensitive field
          {payload.redactedFields.length === 1 ? "" : "s"}:{" "}
          {payload.redactedFields.join(", ")}
        </div>
      ) : null}
      {sections.map(([section, value]) =>
        hasPanelValue(value) ? (
          <JsonViewer
            defaultExpanded={section === "input"}
            key={section}
            title={section}
            value={value}
          />
        ) : null
      )}
    </div>
  );
}

function LogList({
  error,
  isError,
  isLoading,
  logs,
  story,
}: {
  story: RuntimeStory;
  logs: ExecutionLogEntry[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  if (isLoading) {
    return <EmptyRows label="Loading execution logs..." />;
  }
  if (isError) {
    return (
      <EmptyRows
        label={`Execution logs could not be loaded. ${errorMessage(error)}`}
      />
    );
  }
  if (logs.length === 0) {
    return (
      <EmptyRows label="No runtime logs recorded for this execution yet. Runtime lifecycle logs are recorded for work processed after execution logging was enabled." />
    );
  }
  return (
    <div className="w-max min-w-full font-mono text-xs">
      {logs.map((log) => (
        <div
          className="grid w-max min-w-full grid-cols-[58px_58px_minmax(220px,max-content)_minmax(180px,max-content)] gap-2 border-b border-(--line) px-3 py-1.5"
          key={log.id}
        >
          <span className="whitespace-nowrap text-(--fg-tertiary)">
            +
            {formatRuntimeDuration(
              logOffsetMs(story.timestamp, log.occurredAt)
            )}
          </span>
          <span className={cn("uppercase", logSeverityClass(log.severity))}>
            {log.severity}
          </span>
          <span className="whitespace-nowrap text-(--fg-secondary)">
            {log.body || "-"}
          </span>
          <span className="whitespace-nowrap text-[11px] text-(--fg-tertiary)">
            {log.serviceName}
            {log.traceId ? ` · trace ${log.traceId.slice(0, 12)}` : ""}
          </span>
          {Object.keys(log.attributes).length > 0 ||
          log.redactedFields.length > 0 ? (
            <div className="col-span-4 -mx-3 mt-1 border-t border-(--line)">
              <JsonViewer
                title={
                  log.redactedFields.length > 0
                    ? `attributes · redacted ${log.redactedFields.length}`
                    : "attributes"
                }
                value={{
                  attributes: log.attributes,
                  ...(log.redactedFields.length > 0
                    ? { redacted_fields: log.redactedFields }
                    : {}),
                  ...(log.spanId ? { span_id: log.spanId } : {}),
                  ...(log.traceId ? { trace_id: log.traceId } : {}),
                }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function logOffsetMs(baseTimestamp: string, occurredAt: string) {
  const base = Date.parse(baseTimestamp);
  const occurred = Date.parse(occurredAt);
  return Number.isFinite(base) && Number.isFinite(occurred)
    ? Math.max(0, occurred - base)
    : 0;
}

function logSeverityClass(severity: string) {
  switch (severity) {
    case "error": {
      return "text-(--tone-error-fg)";
    }
    case "warn": {
      return "tint-text tint-warning";
    }
    case "debug":
    case "trace": {
      return "text-(--fg-tertiary)";
    }
    default: {
      return "text-(--tone-success-fg)";
    }
  }
}

function EmptyRows({ label }: { label: string }) {
  return (
    <div className="p-4 font-mono text-xs text-(--fg-tertiary)">{label}</div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function hasPanelValue(value: unknown) {
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

function RelatedExecutionList({
  label,
  nodes,
}: {
  label: string;
  nodes: ExecutionNode[];
}) {
  return (
    <div className="w-max min-w-full border-b border-(--line) font-mono text-xs">
      <div className="bg-(--bg-panel-header) px-3 py-1.5 text-(--fg-tertiary)">
        {label}
      </div>
      {nodes.length === 0 ? (
        <div className="border-t border-(--line) px-3 py-1.5 text-(--fg-tertiary)">
          None
        </div>
      ) : (
        nodes.map((node) => (
          <div
            className="grid w-max min-w-full grid-cols-[124px_minmax(220px,max-content)] border-t border-(--line)"
            key={node.id}
          >
            <div className="px-3 py-1.5 text-(--fg-tertiary)">
              {typeLabel(node)}
            </div>
            <div className="whitespace-pre-wrap px-3 py-1.5 text-(--fg-secondary)">
              {node.name}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function formatCell(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function buildBreadcrumb(story: RuntimeStory, node: ExecutionNode) {
  const path: ExecutionNode[] = [];
  const nodeById = new Map(story.nodes.map((item) => [item.id, item]));
  let current: ExecutionNode | undefined = node;
  while (current) {
    path.unshift(current);
    const currentParentId: string | undefined = current.parentId;
    current = currentParentId ? nodeById.get(currentParentId) : undefined;
  }
  return path;
}

function typeLabel(node: ExecutionNode) {
  if (node.kind === "external") {
    return "provider";
  }
  if (node.kind === "function") {
    return "function";
  }
  if (node.kind === "http") {
    return "http";
  }
  if (node.kind === "event") {
    return "outbox";
  }
  return "node";
}
