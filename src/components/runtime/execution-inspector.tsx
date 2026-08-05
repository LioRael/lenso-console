import { Tabs } from "@base-ui/react/tabs";
import { useConsoleLocale } from "@lenso/console-ui-internal";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Network,
  RotateCcw,
  X,
} from "lucide-react";
import { useState } from "react";

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
import { prettyJson } from "../../lib/format";
import { formatRuntimeDuration } from "../../lib/runtime-style";
import { useConsole } from "./console-context";
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
  const { openRetry } = useConsole();
  const zh = locale === "zh-CN";
  const node = selectedNode;
  const tabCounts = getExecutionInspectorTabCounts(story, node);
  const retryTarget = retryTargetForNode(node);
  const routeLabel = buildInspectorPath(story, node);

  return (
    <aside className="grid h-full min-h-0 w-full min-w-0 max-w-full grid-rows-[94px_minmax(0,1fr)] overflow-hidden border-l border-(--line-subtle) bg-(--bg-canvas)">
      <div className="relative min-w-0 overflow-hidden border-b border-(--line-subtle) pt-3">
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
        <div className="flex h-10 min-w-0 items-center gap-2 px-3">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: statusColorForInspector(node.status) }}
          />
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-(--fg-primary)">
            {node.canonicalName ?? node.name}
          </h2>
          {retryTarget ? (
            <button
              className="inline-flex h-7 w-[68px] shrink-0 items-center justify-center gap-1 rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-2.5 text-[12px] font-medium text-(--fg-primary) hover:bg-(--bg-control-hover)"
              onClick={() => openRetry(retryTarget)}
              type="button"
            >
              <RotateCcw size={12} />
              {zh ? "重试" : "Retry"}
            </button>
          ) : null}
        </div>
        <div className="flex h-[25px] min-w-0 items-center gap-1.5 overflow-hidden px-3 text-[9px] leading-none">
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

      <Tabs.Root
        className="grid h-full min-h-0 min-w-0 grid-rows-[42px_minmax(0,1fr)] overflow-hidden"
        onValueChange={(value) => {
          if (typeof value === "string") {
            setActiveTab(value as ExecutionInspectorTab);
          }
        }}
        value={activeTab}
      >
        <div className="h-full min-w-0 overflow-hidden border-b border-(--line-subtle) bg-(--bg-canvas)">
          <HorizontalTabScroll>
            <Tabs.List
              aria-label={zh ? "执行详情标签" : "Execution detail tabs"}
              className="flex h-[42px] w-max min-w-full items-start gap-1 px-1.5"
            >
              {executionInspectorTabs.map((tab) => (
                <Tabs.Tab
                  className={cn(
                    "relative flex h-10 shrink-0 items-center justify-center gap-1 px-1 font-sans text-[11px] text-(--fg-tertiary)",
                    "data-[active]:border-b data-[active]:border-(--accent) data-[active]:font-medium data-[active]:text-(--fg-primary)"
                  )}
                  id={`execution-tab-${tab.id}`}
                  key={tab.id}
                  value={tab.id}
                >
                  <span>{zh ? inspectorTabZh[tab.id] : tab.label}</span>
                  {tabCounts[tab.id] > 0 ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-[3px] font-sans text-[9px] font-medium",
                        activeTab === tab.id
                          ? "text-(--fg-secondary)"
                          : "text-(--fg-tertiary)"
                      )}
                    >
                      <span
                        className={cn(
                          "size-[2px] rounded-full",
                          activeTab === tab.id
                            ? "bg-(--fg-secondary)"
                            : "bg-(--fg-tertiary)"
                        )}
                      />
                      {tabCounts[tab.id]}
                    </span>
                  ) : null}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </HorizontalTabScroll>
        </div>

        {executionInspectorTabs.map((tab) => (
          <Tabs.Panel
            className="min-h-0 min-w-0 overflow-auto bg-(--bg-canvas) [scrollbar-width:thin]"
            id={`execution-inspector-panel-${tab.id}`}
            key={`${node.id}-${tab.id}`}
            keepMounted
            value={tab.id}
          >
            {activeTab === tab.id ? (
              <InspectorBody activeTab={tab.id} node={node} story={story} />
            ) : null}
          </Tabs.Panel>
        ))}
      </Tabs.Root>
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
  const { openRemoteCalls, openRetry } = useConsole();
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
    return (
      <OverviewDocument
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
        node={node}
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
    <div className="min-w-full">
      <InspectorDocumentToolbar
        bordered={false}
        count={`${activity.length} events`}
        title="Activity"
      />
      <ActivityList activity={activity} />
      <CompletionEvidence activity={activity} node={node} />
      {failures.length > 0 ? (
        <>
          <InspectorDocumentToolbar
            count={`${failures.length} items`}
            title="Failure evidence"
          />
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
  const operationCount = executionOperations.length + storyOperations.length;
  return (
    <div className="min-w-full">
      <InspectorDocumentToolbar
        count={`${operationCount} operations`}
        title="Technical execution"
      />
      <ExecutionContextPanel rows={context.rows} />
      <ExecutionLineagePanel
        downstream={context.downstream}
        upstream={context.upstream}
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
        bordered={false}
        countLabel={`${context.rows.length + 3} fields`}
        title="Execution context JSON"
        value={{ attributes: node.attributes, context: node.context }}
      />
    </div>
  );
}

function InspectorDocumentToolbar({
  bordered = true,
  count,
  title,
}: {
  bordered?: boolean;
  count: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 items-center justify-between px-3 pt-2.5 pb-[9px]",
        bordered && "border-b border-(--line-subtle)"
      )}
    >
      <span className="text-[13px] font-medium text-(--fg-primary)">
        {title}
      </span>
      <span className="font-mono text-[10px] text-(--fg-tertiary)">
        {count}
      </span>
    </div>
  );
}

function CompletionEvidence({
  activity,
  node,
}: {
  activity: ExecutionActivityItem[];
  node: ExecutionNode;
}) {
  const stableEffect = firstString(
    node.attributes.stable_effect,
    node.attributes.stableEffect,
    node.attributes.effect_id,
    node.attributes.effectId
  );
  const completion = activity.at(-1);
  const completionId = firstString(
    node.context.completion_id,
    node.context.completionId,
    node.attributes.completion_id,
    node.attributes.completionId,
    completion?.id
  );
  const stable = node.status === "completed" || node.status === "published";

  return (
    <section className="flex h-[348px] flex-col gap-3 overflow-hidden px-3 py-[14px]">
      <InspectorEyebrow>Completion evidence</InspectorEyebrow>
      <h3 className="text-[13px] font-medium text-(--fg-primary)">
        {stable ? "Stable effect confirmed" : "Completion evidence pending"}
      </h3>
      <InspectorEvidenceField
        label="Completion identity"
        value={completionId ?? "—"}
      />
      <InspectorEvidenceField
        label="Stable effect"
        value={stableEffect ?? "—"}
      />
      <InspectorEvidenceField
        label="Publisher"
        value={`${node.service} / ${typeLabel(node)}`}
      />
      <p className="text-[10px] leading-[15px] text-(--fg-secondary)">
        {stable
          ? "Published after the execution completed; this evidence confirms the terminal state."
          : "The execution has not published terminal evidence yet."}
      </p>
    </section>
  );
}

function InspectorEvidenceField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex h-11 flex-col gap-1 overflow-hidden">
      <InspectorEyebrow>{label}</InspectorEyebrow>
      <span className="truncate font-mono text-[10px] text-(--fg-secondary)">
        {value}
      </span>
    </div>
  );
}

function InspectorEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9.5px] font-medium uppercase text-(--fg-tertiary)">
      {children}
    </span>
  );
}

function ExecutionContextPanel({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <section className="h-[210px] overflow-hidden border-b border-(--line-subtle) px-3 py-3">
      <InspectorEyebrow>Execution context</InspectorEyebrow>
      <div>
        {rows
          .filter(([key]) => key !== "related executions")
          .map(([key, value]) => (
            <div
              className="flex h-8 items-center justify-between gap-3 overflow-hidden"
              key={key}
            >
              <span className="shrink-0 text-[9px] text-(--fg-tertiary)">
                {executionContextLabel(key)}
              </span>
              <span className="min-w-0 truncate text-right font-mono text-[10px] text-(--fg-secondary)">
                {formatCell(value)}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}

function executionContextLabel(key: string) {
  return key.endsWith(" id") ? key.slice(0, -3) : key;
}

function ExecutionLineagePanel({
  downstream,
  upstream,
}: {
  downstream: ExecutionNode[];
  upstream: ExecutionNode[];
}) {
  return (
    <section className="flex h-[132px] flex-col gap-[6px] overflow-hidden border-b border-(--line-subtle) px-3 py-2">
      <InspectorEyebrow>Related executions</InspectorEyebrow>
      <LineageRow direction="Upstream" node={upstream.at(-1)} />
      <LineageRow direction="Downstream" node={downstream[0]} />
    </section>
  );
}

function LineageRow({
  direction,
  node,
}: {
  direction: string;
  node: ExecutionNode | undefined;
}) {
  return (
    <div className="flex h-[42px] items-center justify-between gap-3 overflow-hidden">
      <div className="flex h-9 w-[220px] shrink-0 flex-col gap-0.5 overflow-hidden">
        <span className="text-[9px] font-medium uppercase text-(--fg-tertiary)">
          {direction}
        </span>
        <span className="truncate font-mono text-[11px] text-(--fg-primary)">
          {node?.name ?? "—"}
        </span>
      </div>
      <span className="shrink-0 font-mono text-[9px] text-(--fg-secondary)">
        {node ? typeLabel(node) : "—"}
      </span>
    </div>
  );
}

function OverviewDocument({
  children,
  logsCount,
  node,
  payload,
  story,
}: {
  children?: React.ReactNode;
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
      <section className="h-[98px] border-b border-(--line-subtle) px-3 pt-[11px] pb-2.5">
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

      <section>
        <div className="flex h-[30px] items-center justify-between px-3 text-[9.5px] font-medium text-(--fg-tertiary)">
          <span>Properties</span>
          <button
            className="inline-flex items-center gap-1 text-[9.5px] font-medium text-(--fg-secondary) hover:text-(--fg-primary)"
            type="button"
          >
            <Copy size={12} />
            Copy all
          </button>
        </div>
        {properties.map((property, index) =>
          "label" in property ? (
            <div
              className={cn(
                "grid h-9 grid-cols-[92px_minmax(0,1fr)] items-center px-3 font-mono",
                index === properties.length - 1 &&
                  "border-b border-(--line-subtle)"
              )}
              key={property.label}
            >
              <span className="text-[9px] text-(--fg-tertiary)">
                {property.label}
              </span>
              <span className="truncate text-[9.5px] text-(--fg-primary)">
                {property.value}
              </span>
            </div>
          ) : (
            <div
              className={cn(
                "grid h-9 grid-cols-[60px_102px_62px_minmax(0,1fr)] items-center px-3 font-mono",
                index === properties.length - 1 &&
                  "border-b border-(--line-subtle)"
              )}
              key={`${property.left[0]}-${index}`}
            >
              <span className="text-[9px] text-(--fg-tertiary)">
                {property.left[0]}
              </span>
              <span
                className={cn(
                  "truncate text-[9.5px] text-(--fg-primary)",
                  property.left[0] === "status" && statusTone(node.status)
                )}
              >
                {property.left[1]}
              </span>
              <span className="text-[9px] text-(--fg-tertiary)">
                {property.right[0]}
              </span>
              <span className="truncate text-[9.5px] text-(--fg-primary)">
                {property.right[1]}
              </span>
            </div>
          )
        )}
      </section>

      <section>
        <div className="flex h-[30px] items-center justify-between px-3 text-[9.5px] font-medium text-(--fg-tertiary)">
          <span>Evidence</span>
          <span className="font-mono text-[8.5px] font-normal">
            {Number(payloadCount > 0) + Number(logsCount > 0)} sources
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
        <div className="flex h-[30px] items-center justify-between px-3 text-[9.5px] font-medium text-(--fg-tertiary)">
          <span>Trace context</span>
          <span className="font-mono text-[8.5px] font-normal">2 fields</span>
        </div>
        <div className="flex h-[60px] flex-col overflow-hidden font-mono">
          <div className="flex h-[30px] shrink-0 items-center overflow-hidden px-3">
            <span className="w-[92px] shrink-0 text-[8.5px] text-(--fg-tertiary)">
              trace
            </span>
            <span className="truncate text-[9px] text-(--fg-secondary)">
              {traceId ?? "—"}
            </span>
          </div>
          <div className="flex h-[30px] shrink-0 items-center overflow-hidden px-3">
            <span className="w-[92px] shrink-0 text-[8.5px] text-(--fg-tertiary)">
              correlation
            </span>
            <span className="truncate text-[9px] text-(--fg-secondary)">
              {story.correlationId}
            </span>
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
    <div className="flex h-9 items-center gap-2 px-3">
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
    <section className="flex h-[278px] flex-col gap-2 overflow-visible border-b border-(--line-subtle) p-3">
      <div className="flex h-[26px] items-center justify-between overflow-hidden text-[10px] text-(--fg-tertiary)">
        <span className="font-medium uppercase">
          {group.label.replaceAll("-", " ")}
        </span>
        <span className="font-mono text-[9px]">{group.operations.length}</span>
      </div>
      {group.operations.map((operation, index) => (
        <TechnicalOperationRow
          index={index}
          operation={operation}
          key={operation.id}
        />
      ))}
    </section>
  );
}

function TechnicalOperationRow({
  index,
  operation,
}: {
  index: number;
  operation: TechnicalOperationView;
}) {
  const { openAdminActions, openRemoteCalls } = useConsole();
  const operationsTarget = technicalOperationOperationsTarget(operation);
  const [attributesVisible, setAttributesVisible] = useState(false);
  return (
    <div className="group relative flex h-[84px] shrink-0 gap-2.5 overflow-visible py-2">
      <span className="w-[13px] shrink-0 font-mono text-[10px] font-medium text-(--accent)">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex h-[68px] w-[256px] shrink-0 flex-col gap-[5px] overflow-hidden">
        <div className="flex h-[18px] items-start justify-between gap-2">
          <span
            className="truncate font-mono text-[11px] font-medium text-(--fg-primary)"
            title={operation.name}
          >
            {operation.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-(--fg-tertiary)">
            {formatRuntimeDuration(operation.durationMs)}
          </span>
        </div>
        <div
          className={cn(
            "font-mono text-[9px] font-medium uppercase",
            operation.status === "error"
              ? "text-(--tone-error-fg)"
              : "text-(--tone-success-fg)"
          )}
        >
          {operation.status}
        </div>
        <div
          className="truncate text-[10px] text-(--fg-secondary)"
          title={operation.summary}
        >
          {operation.summary ?? operation.sourceLabel}
        </div>
      </div>
      <div className="absolute top-2 right-0 flex items-start">
        {Object.keys(operation.safeAttributes).length > 0 ? (
          <button
            aria-expanded={attributesVisible}
            aria-label={`Toggle ${operation.name} safe attributes`}
            className="mr-1 grid size-4 place-items-center text-(--fg-tertiary) opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => setAttributesVisible((current) => !current)}
            title="Show safe attributes"
            type="button"
          >
            <Copy size={10} />
          </button>
        ) : null}
        {operationsTarget ? (
          <button
            aria-label={`Open ${operation.sourceLabel} operations`}
            className="grid size-4 place-items-center text-(--fg-tertiary) hover:text-(--fg-primary)"
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
      {attributesVisible ? (
        <JsonViewer
          className="absolute top-full right-0 left-0 z-10"
          defaultExpanded
          title="safe attributes"
          value={operation.safeAttributes}
        />
      ) : null}
    </div>
  );
}

function KeyValueTable({ rows }: { rows: Array<[string, unknown]> }) {
  if (rows.length === 0) {
    return <EmptyRows label="No execution details recorded" />;
  }

  return (
    <div className="min-w-full border-b border-(--line-subtle) text-xs">
      {rows.map(([key, value]) => (
        <div
          className="grid min-h-9 min-w-full grid-cols-[92px_minmax(0,1fr)] border-b border-(--line-subtle) last:border-b-0"
          key={key}
        >
          <div className="px-3 py-2 text-[9px] text-(--fg-tertiary)">{key}</div>
          <div className="whitespace-pre-wrap px-3 py-2 font-mono text-[10px] text-(--fg-secondary)">
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
    <div className="min-w-full">
      {activity.map((item, index) => (
        <EventActivityRow
          isLast={index === activity.length - 1}
          item={item}
          key={item.id}
        />
      ))}
    </div>
  );
}

function EventActivityRow({
  isLast,
  item,
}: {
  isLast: boolean;
  item: ExecutionActivityItem;
}) {
  const eventKind = eventKindLabel(item);
  const detailLines = [item.detail ?? item.label, `source · ${item.kind}`];

  return (
    <div
      className={cn(
        "flex h-[108px] w-full gap-3 overflow-hidden px-3",
        isLast && "border-b border-(--line-subtle)"
      )}
    >
      <div className="relative h-[108px] w-3 shrink-0">
        <span
          className={cn(
            "absolute top-0 left-1/2 size-2 -translate-x-1/2 rounded-full",
            isLast ? "bg-(--fg-primary)" : "bg-(--tone-success-fg)"
          )}
        />
        {isLast ? null : (
          <span className="absolute top-2 bottom-2 left-1/2 w-px -translate-x-1/2 bg-(--line-subtle)" />
        )}
      </div>
      <div className="flex h-[108px] w-[284px] shrink-0 flex-col gap-[7px] pt-0">
        <div className="flex h-[18px] items-center justify-between gap-2 font-mono text-[10px]">
          <span className="text-(--fg-tertiary)">
            +{formatRuntimeDuration(item.timestampMs)}
          </span>
          <span className={cn("font-medium", activityStatusTone(item.status))}>
            {eventKind} · {item.status.toUpperCase()}
          </span>
        </div>
        <div className="truncate text-[12px] font-medium text-(--fg-primary)">
          {item.label}
        </div>
        <div className="h-9 overflow-hidden font-mono text-[10px] leading-[0] text-(--fg-secondary)">
          {detailLines.map((line) => (
            <div className="truncate leading-[normal]" key={line}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function eventKindLabel(item: ExecutionActivityItem) {
  if (item.kind === "event") {
    return "EVENT";
  }
  if (item.kind.includes("function")) {
    return "DATABASE";
  }
  if (item.kind.includes("http") || item.kind.includes("command")) {
    return "COMMAND";
  }
  return item.kind.toUpperCase();
}

function activityStatusTone(status: string) {
  if (status === "failed" || status === "dead" || status === "error") {
    return "text-(--tone-error-fg)";
  }
  if (status === "pending" || status === "processing" || status === "running") {
    return "text-(--tone-warning-fg)";
  }
  return "text-(--tone-success-fg)";
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
  node,
  payload,
}: {
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  node: ExecutionNode;
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
    <div className="flex min-h-full min-w-full flex-col">
      {payload && payload.redactedFields.length > 0 ? (
        <div className="flex h-11 shrink-0 gap-2 overflow-hidden border-b border-(--line-subtle) px-3 py-[7px]">
          <span className="w-[7px] shrink-0 text-[13px] leading-[17px] font-medium text-(--tone-warning-fg)">
            ✦
          </span>
          <div className="h-[30px] w-[260px] text-[10px] leading-[15px] text-(--fg-secondary)">
            <div>
              {payload.redactedFields.length} sensitive field
              {payload.redactedFields.length === 1 ? "" : "s"} redacted
            </div>
            <div>{payload.redactedFields.join(" · ")}</div>
          </div>
        </div>
      ) : null}
      <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-(--line-subtle) px-3 pt-2.5 pb-[9px] leading-normal">
        <span className="text-[13px] font-medium text-(--fg-primary)">
          Request payload
        </span>
        <span className="font-mono text-[10px] text-(--fg-tertiary)">
          application/json
        </span>
      </div>
      {hasPanelValue(payload?.input) ? (
        <PayloadJsonBlock
          countLabel={`${fieldCount(payload?.input)} fields`}
          title="input"
          value={payload?.input}
        />
      ) : null}
      {payload && hasPanelValue(payload.output) ? (
        <JsonViewer
          countLabel={`${fieldCount(payload.output)} fields`}
          title="output"
          value={payload.output}
          variant="payload-row"
        />
      ) : null}
      {payload && hasPanelValue(payload.metadata) ? (
        <JsonViewer
          countLabel={`${fieldCount(payload.metadata)} fields`}
          title="metadata"
          value={payload.metadata}
          variant="payload-row"
        />
      ) : null}
      <div className="min-h-0 flex-1" />
      <PayloadContract node={node} payload={payload} />
    </div>
  );
}

function PayloadJsonBlock({
  countLabel,
  title,
  value,
}: {
  countLabel: string;
  title: string;
  value: unknown;
}) {
  const [expanded, setExpanded] = useState(true);
  const json = prettyJson(value);

  return (
    <section className="flex shrink-0 flex-col overflow-hidden">
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-(--line-subtle) px-3 pt-2.5 pb-[9px]">
        <button
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0 text-(--fg-tertiary)" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-(--fg-tertiary)" />
          )}
          <span className="font-sans text-[11px] font-medium text-(--fg-primary)">
            {title}
          </span>
        </button>
        <div className="flex items-center gap-4 whitespace-nowrap text-[10px]">
          <span className="font-mono text-(--fg-tertiary)">{countLabel}</span>
          <button
            className="font-medium text-(--fg-secondary) hover:text-(--fg-primary)"
            type="button"
          >
            Copy
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="max-h-[171px] shrink-0 overflow-hidden border-b border-(--line-subtle) px-3 pt-2.5 pb-[11px]">
          <pre className="max-h-[150px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-[15px] text-(--fg-secondary)">
            {json}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function PayloadContract({
  node,
  payload,
}: {
  node: ExecutionNode;
  payload: ExecutionPayload | undefined;
}) {
  const contract =
    firstString(
      node.attributes.payload_contract,
      node.attributes.payloadContract,
      node.attributes.input_schema,
      node.attributes.inputSchema
    ) ?? `${node.canonicalName ?? node.name} / v1`;
  const isValid = Boolean(payload) && !payload?.redactedFields.length;

  return (
    <section className="flex h-[80px] shrink-0 flex-col justify-center gap-2 overflow-hidden border-t border-(--line-subtle) p-3">
      <div className="flex h-4 items-center justify-between font-medium">
        <span className="w-[97px] shrink-0">
          <InspectorEyebrow>Payload contract</InspectorEyebrow>
        </span>
        <p className="whitespace-nowrap font-mono text-[12px] font-medium text-(--fg-primary)">
          {contract}
        </p>
      </div>
      <p
        className={cn(
          "text-[11px]",
          isValid ? "text-(--tone-success-fg)" : "text-(--fg-secondary)"
        )}
      >
        {isValid
          ? "Validated at ingress · 0 schema errors"
          : "Validation evidence is incomplete"}
      </p>
    </section>
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
    <div className="min-w-full">
      <InspectorDocumentToolbar
        count={`${logs.length} entries`}
        title="Runtime logs"
      />
      {logs.map((log) => (
        <LogEntry key={log.id} log={log} story={story} />
      ))}
      {logs.some(logHasAttributes) ? (
        <LogAttributesPanel
          log={logs.toReversed().find(logHasAttributes) ?? logs.at(-1)!}
        />
      ) : null}
      <LogDiagnostic logs={logs} />
    </div>
  );
}

function LogEntry({
  log,
  story,
}: {
  log: ExecutionLogEntry;
  story: RuntimeStory;
}) {
  return (
    <section className="flex h-[100px] flex-col gap-2 overflow-hidden border-b border-(--line-subtle) px-3 py-2.5">
      <div className="flex h-[18px] items-center gap-2 font-mono text-[10px]">
        <span className="w-[49px] shrink-0 text-(--fg-tertiary)">
          +{formatRuntimeDuration(logOffsetMs(story.timestamp, log.occurredAt))}
        </span>
        <span
          className={cn(
            "font-medium uppercase",
            logSeverityClass(log.severity)
          )}
        >
          {log.severity}
        </span>
      </div>
      <div className="h-[34px] truncate text-[11px] font-medium text-(--fg-primary)">
        {log.body || "-"}
      </div>
      <div className="truncate font-mono text-[10px] text-(--fg-tertiary)">
        {log.serviceName}
        {log.traceId ? ` · trace ${log.traceId.slice(0, 12)}` : ""}
      </div>
    </section>
  );
}

function logHasAttributes(log: ExecutionLogEntry) {
  return (
    Object.keys(log.attributes).length > 0 ||
    log.redactedFields.length > 0 ||
    Boolean(log.traceId) ||
    Boolean(log.spanId)
  );
}

function LogAttributesPanel({ log }: { log: ExecutionLogEntry }) {
  const rows = [
    ...Object.entries(log.attributes),
    ...(log.redactedFields.length > 0
      ? [["redacted_fields", log.redactedFields.join(" · ")] as const]
      : []),
    ...(log.traceId ? [["trace_id", log.traceId] as const] : []),
    ...(log.spanId ? [["span_id", log.spanId] as const] : []),
  ];

  return (
    <section className="flex h-[216px] flex-col gap-2.5 overflow-hidden border-b border-(--line-subtle) p-3">
      <div className="flex h-5 items-center justify-between text-[10px] font-medium uppercase">
        <InspectorEyebrow>Attributes</InspectorEyebrow>
        <span className="normal-case text-(--fg-secondary)">Copy JSON</span>
      </div>
      {rows.map(([key, value]) => (
        <div
          className="flex h-[27px] items-center justify-between gap-3 overflow-hidden font-mono"
          key={key}
        >
          <span className="truncate text-[9px] text-(--fg-tertiary)">
            {key}
          </span>
          <span className="truncate text-right text-[10px] text-(--fg-secondary)">
            {formatCell(value)}
          </span>
        </div>
      ))}
    </section>
  );
}

function LogDiagnostic({ logs }: { logs: ExecutionLogEntry[] }) {
  const issueCount = logs.filter(
    (log) => log.severity === "warn" || log.severity === "error"
  ).length;
  const service = logs[0]?.serviceName ?? "runtime";
  const hasIssues = issueCount > 0;

  return (
    <section className="flex h-[256px] flex-col gap-3 overflow-hidden px-3 py-[14px]">
      <InspectorEyebrow>Log context</InspectorEyebrow>
      <h3 className="text-[13px] font-medium text-(--fg-primary)">
        {hasIssues
          ? `${issueCount} log issue${issueCount === 1 ? "" : "s"}`
          : "No warnings or errors"}
      </h3>
      <div
        className={cn(
          "h-0.5 w-[280px]",
          hasIssues ? "bg-(--tone-warning-fg)" : "bg-(--tone-success-fg)"
        )}
      />
      <p className="text-[10px] leading-[15px] text-(--fg-secondary)">
        {hasIssues
          ? `${issueCount} entries require operator review in ${service}.`
          : `${logs.length === 2 ? "Both entries" : `${logs.length} entries`} belong to the same trace and were emitted by ${service}.`}
      </p>
      <p className="font-mono text-[10px] text-(--fg-tertiary)">
        Retention 7 days · structured JSON available
      </p>
    </section>
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

function fieldCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return 1;
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
