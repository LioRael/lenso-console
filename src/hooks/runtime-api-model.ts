import type {
  ExecutionEdge,
  ExecutionLogEntry,
  ExecutionPayload,
  ExecutionNode,
  FederatedReliabilityEvidence,
  FederatedStoryEvidence,
  FederatedStoryGap,
  FederatedWorkflowEntity,
  RuntimeStatus,
  RuntimeStory,
  TechnicalOperation,
  TimelineItem,
} from "../data/mock-runtime";
import { isRetryable } from "../data/mock-runtime";
import type {
  AdminRuntimeHeatmapCell,
  AdminRuntimeHeatmapResponse,
  AdminRuntimeExecutionLog,
  AdminRuntimeExecutionLogListResponse,
  AdminRuntimeExecutionPayloadResponse,
  AdminRuntimeStoryDetail,
  AdminRuntimeStoryDetailResponse,
  AdminRuntimeStoryEdge,
  AdminRuntimeStoryListItem,
  AdminRuntimeStoryListResponse,
  AdminRuntimeTechnicalOperation,
  AdminRuntimeTechnicalOperationListResponse,
  AdminRuntimeTimelineItem,
  PageInfo as ApiPageInfo,
} from "./runtime-api-types";

export type RuntimeHeatmapCell = {
  bucketStart: string;
  bucketEnd: string;
  service: string;
  nodeType: "event" | "function" | "http" | "provider_call";
  totalCount: number;
  errorCount: number;
  deadCount: number;
  avgDurationMs?: number;
  maxDurationMs?: number;
};

export type RuntimeHeatmap = {
  bucketSeconds: number;
  cells: RuntimeHeatmapCell[];
  page?: PageInfo;
};

export type PageInfo = {
  limit: number;
  nextCreatedBefore?: string;
};

type DeepPartial<T> =
  T extends Array<infer Item>
    ? Array<DeepPartial<Item>>
    : T extends object
      ? { [Key in keyof T]?: DeepPartial<T[Key]> }
      : T;

export type ApiRuntimeStoryListResponse =
  DeepPartial<AdminRuntimeStoryListResponse>;
export type ApiRuntimeStoryListItem = DeepPartial<AdminRuntimeStoryListItem>;
export type ApiRuntimeStoryDetailResponse =
  DeepPartial<AdminRuntimeStoryDetailResponse>;
export type ApiRuntimeStoryDetail = DeepPartial<AdminRuntimeStoryDetail>;
export type ApiRuntimeStoryEdge = DeepPartial<AdminRuntimeStoryEdge>;
export type ApiTimelineItem = DeepPartial<AdminRuntimeTimelineItem>;
export type ApiRuntimeHeatmapResponse =
  DeepPartial<AdminRuntimeHeatmapResponse>;
export type ApiRuntimeHeatmapCell = DeepPartial<AdminRuntimeHeatmapCell>;
export type ApiExecutionPayloadResponse =
  DeepPartial<AdminRuntimeExecutionPayloadResponse>;
export type ApiExecutionLogResponse =
  DeepPartial<AdminRuntimeExecutionLogListResponse>;
export type ApiExecutionLog = DeepPartial<AdminRuntimeExecutionLog>;
export type ApiTechnicalOperationResponse =
  DeepPartial<AdminRuntimeTechnicalOperationListResponse>;
export type ApiTechnicalOperation = DeepPartial<AdminRuntimeTechnicalOperation>;

const fallbackTimestamp = "1970-01-01T00:00:00.000Z";

export function normalizeRuntimeStoryListResponse(
  response: ApiRuntimeStoryListResponse
): { stories: RuntimeStory[]; page?: PageInfo } {
  return {
    ...(response.page ? { page: normalizePageInfoPartial(response.page) } : {}),
    stories: (response.data ?? []).map(normalizeRuntimeStoryListItem),
  };
}

export function normalizeRuntimeStoryListItem(
  item: ApiRuntimeStoryListItem
): RuntimeStory {
  const correlationId = safeString(item.correlation_id, "unknown");
  const timestamp = normalizeTimestamp(item.created_at);
  const durationMs = normalizeDuration(item.duration);
  const services = normalizeStringArray(item.services);
  const pattern = normalizeStringArray(item.pattern);
  const nodeCount = normalizeInteger(item.node_count, 0);
  const errorCount = normalizeInteger(item.error_count, 0);
  const nodes = Array.from({ length: nodeCount }, (_, index) =>
    placeholderNode({
      correlationId,
      durationMs: index === 0 ? durationMs : 0,
      ...(index === 0 && item.root_error ? { error: item.root_error } : {}),
      id: `${correlationId}:summary:${index + 1}`,
      index,
      kind: toExecutionNodeKind(pattern[index] ?? pattern.at(-1)),
      service: services[index] ?? services.at(-1) ?? "runtime",
      status: normalizeRuntimeStatus(
        index < errorCount ? "failed" : item.status
      ),
      timestamp,
    })
  );

  return {
    correlationId,
    durationMs,
    id: correlationId,
    name: safeString(item.title, "Runtime Story"),
    nodes,
    service: services[0] ?? "runtime",
    source:
      item.story_kind === "federated"
        ? "federated-runtime-story"
        : "runtime-story",
    status: normalizeRuntimeStatus(item.status),
    timestamp,
  };
}

export function normalizeRuntimeStory(
  detail: ApiRuntimeStoryDetail
): RuntimeStory {
  const summary = detail.summary ?? {};
  const isFederated = summary.story_kind === "federated";
  const correlationId = safeString(summary.correlation_id, "unknown");
  const timestamp = normalizeTimestamp(summary.created_at);
  const hasValidBaseTimestamp =
    typeof summary.created_at === "string" &&
    Number.isFinite(Date.parse(summary.created_at));
  const baseTimestamp = Date.parse(timestamp);
  const rawNodes = detail.nodes ?? [];
  const nodeIdAliases = new Map<string, string>();
  const seenIds = new Map<string, number>();
  const nodes = rawNodes.map((node, index): ExecutionNode => {
    const inputId = safeString(node.id, `node_${index + 1}`);
    const nodeType = normalizeProviderCallType(node.type);
    const canonicalId = normalizeProviderNodeId(inputId, nodeType);
    const seenCount = seenIds.get(canonicalId) ?? 0;
    seenIds.set(canonicalId, seenCount + 1);
    const id =
      seenCount === 0 ? canonicalId : `${canonicalId}__${seenCount + 1}`;
    if (!nodeIdAliases.has(inputId)) {
      nodeIdAliases.set(inputId, id);
    }
    nodeIdAliases.set(canonicalId, id);

    const metadata = normalizeProviderNodeReferences(
      normalizeProviderNodeMetadata(node.metadata, nodeType)
    );
    const nodeTimestamp = normalizeTimestamp(node.timestamp, timestamp);
    const parsedNodeTimestamp = Date.parse(nodeTimestamp);
    const startMs = hasValidBaseTimestamp
      ? Number.isFinite(baseTimestamp) && Number.isFinite(parsedNodeTimestamp)
        ? Math.max(0, parsedNodeTimestamp - baseTimestamp)
        : index
      : 0;
    const error = node.error ?? undefined;
    const status = normalizeRuntimeStatus(node.status);
    const attempts = normalizeOptionalInteger(metadata.attempts);
    const maxAttempts = normalizeOptionalInteger(metadata.max_attempts);
    const canonicalName = safeString(node.name, "Runtime Work");
    const displayName = safeString(node.display_name, canonicalName);

    return {
      ...(attempts === undefined ? {} : { attempts }),
      ...(displayName === canonicalName ? {} : { canonicalName }),
      ...(maxAttempts === undefined ? {} : { maxAttempts }),
      attributes: metadata,
      context: {
        correlation_id: correlationId,
        ...(typeof metadata.causation_id === "string"
          ? { causation_id: metadata.causation_id }
          : {}),
      },
      durationMs: normalizeDuration(node.duration_ms),
      events: [],
      id,
      kind: toExecutionNodeKind(nodeType),
      logs: error ? [error] : [],
      name: displayName,
      retryable: !isFederated && isRetryable(status),
      service: safeString(node.service, "runtime"),
      startMs,
      status,
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeRuntimeEdges(
    detail.edges ?? [],
    nodeIdAliases,
    nodeIds
  );
  const parentByTarget = new Map(
    edges.map((edge) => [edge.target, edge.source])
  );
  const nodesWithParents = nodes.map((node) => {
    const parentId = parentByTarget.get(node.id);
    return parentId ? { ...node, parentId } : node;
  });
  const timelineItems =
    detail.timeline_items?.map((item, index) =>
      normalizeTimelineItem(item, correlationId, index)
    ) ?? [];
  const lastNodeEnd = Math.max(
    0,
    ...nodesWithParents.map((node) => node.startMs + node.durationMs),
    ...timelineItems.map((item) =>
      timelineItemOffset(timestamp, item.completedAt ?? item.createdAt)
    )
  );

  return {
    correlationId,
    durationMs: Math.max(normalizeDuration(summary.duration), lastNodeEnd),
    edges,
    id: correlationId,
    name: safeString(summary.title, "Runtime Story"),
    nodes: nodesWithParents,
    service: nodesWithParents[0]?.service ?? "runtime",
    source: isFederated ? "federated-runtime-story" : "runtime-story",
    status: normalizeRuntimeStatus(summary.status),
    timelineItems,
    timestamp,
    ...(detail.federation
      ? { federation: normalizeFederatedStoryEvidence(detail.federation) }
      : {}),
  };
}

function normalizeFederatedStoryEvidence(
  evidence: NonNullable<ApiRuntimeStoryDetail["federation"]>
): FederatedStoryEvidence {
  return {
    assembledAt: normalizeTimestamp(evidence.assembledAt),
    gaps: (evidence.gaps ?? []).map(normalizeFederatedStoryGap),
    protocol: safeString(evidence.protocol, "lenso.federated-runtime-story.v1"),
    reliability: (evidence.reliability ?? []).map(
      normalizeFederatedReliabilityEvidence
    ),
    ...(typeof evidence.tenantId === "string"
      ? { tenantId: evidence.tenantId }
      : {}),
    workflowEntities: (evidence.workflowEntities ?? []).map(
      normalizeFederatedWorkflowEntity
    ),
  };
}

function normalizeFederatedStoryGap(
  gap: NonNullable<
    NonNullable<ApiRuntimeStoryDetail["federation"]>["gaps"]
  >[number]
): FederatedStoryGap {
  return {
    detail: safeString(gap.detail, "Story Segment evidence is unavailable"),
    detectedAt: normalizeTimestamp(gap.detectedAt),
    kind: normalizeFederatedGapKind(gap.kind),
    lastObservedAt: normalizeTimestamp(gap.lastObservedAt),
    nextAction: safeString(gap.nextAction, "inspect_story_segment_source"),
    sourceServiceId: safeString(gap.sourceServiceId, "unknown-service"),
    ...(typeof gap.tenantId === "string" ? { tenantId: gap.tenantId } : {}),
  };
}

function normalizeFederatedWorkflowEntity(
  entity: NonNullable<
    NonNullable<ApiRuntimeStoryDetail["federation"]>["workflowEntities"]
  >[number]
): FederatedWorkflowEntity {
  return {
    attempt: normalizeInteger(entity.attempt, 1),
    id: safeString(entity.id, "unknown-workflow-entity"),
    instanceId: safeString(entity.instanceId, "unknown-workflow"),
    kind: normalizeFederatedWorkflowKind(entity.kind),
    label: safeString(entity.label, "Workflow evidence"),
    nodeId: safeString(entity.nodeId, "unknown-node"),
    observedAt: normalizeTimestamp(entity.observedAt),
    ...(typeof entity.parentId === "string"
      ? { parentId: entity.parentId }
      : {}),
    serviceId: safeString(entity.serviceId, "unknown-service"),
    state: safeString(entity.state, "unknown"),
  };
}

function normalizeFederatedReliabilityEvidence(
  evidence: NonNullable<
    NonNullable<ApiRuntimeStoryDetail["federation"]>["reliability"]
  >[number]
): FederatedReliabilityEvidence {
  const { report } = evidence;
  return {
    ...(typeof evidence.detail === "string" ? { detail: evidence.detail } : {}),
    ...(typeof evidence.nextAction === "string"
      ? { nextAction: evidence.nextAction }
      : {}),
    observedAt: normalizeTimestamp(evidence.observedAt),
    ...(report
      ? {
          report: {
            activeDegradedModes: (report.activeDegradedModes ?? []).map(
              (mode) => ({
                dependencyId: safeString(
                  mode.dependencyId,
                  "unknown-dependency"
                ),
                evidenceReferences: normalizeStringArray(
                  mode.evidenceReferences
                ),
                mode: safeString(mode.mode, "degraded"),
              })
            ),
            checks: (report.checks ?? []).map((check) => ({
              code: safeString(check.code, "unknown_check"),
              evidenceReferences: normalizeStringArray(
                check.evidenceReferences
              ),
              expected: check.expected,
              ...(typeof check.issueCode === "string"
                ? { issueCode: check.issueCode }
                : {}),
              nextActions: normalizeStringArray(check.nextActions),
              observed: check.observed,
              state: normalizeReliabilityCheckState(check.state),
            })),
            contractId: safeString(report.contractId, "unknown-contract"),
            contractVersion: safeString(report.contractVersion, "unknown"),
            effectiveValues: objectRecord(report.effectiveValues),
            overrides: objectRecord(report.overrides),
            profile: normalizeReliabilityProfile(report.profile),
            protocol: safeString(
              report.protocol,
              "lenso.reliability-report.v1"
            ),
            serviceId: safeString(
              report.serviceId,
              safeString(evidence.sourceServiceId, "unknown-service")
            ),
            state: normalizeReliabilityState(report.state),
          },
        }
      : {}),
    sourceServiceId: safeString(evidence.sourceServiceId, "unknown-service"),
    status: normalizeReliabilityEvidenceStatus(evidence.status),
  };
}

export function normalizeRuntimeHeatmap(
  response: ApiRuntimeHeatmapResponse
): RuntimeHeatmap {
  return {
    bucketSeconds:
      normalizeOptionalInteger(response.bucket_seconds) &&
      Number(response.bucket_seconds) > 0
        ? Number(response.bucket_seconds)
        : 300,
    cells: (response.data ?? []).map(normalizeRuntimeHeatmapCell),
    ...(response.page ? { page: normalizePageInfoPartial(response.page) } : {}),
  };
}

export function normalizeTechnicalOperations(
  response: ApiTechnicalOperationResponse
): TechnicalOperation[] {
  return (response.data ?? [])
    .filter((operation) => operation.source !== "admin_action")
    .map(normalizeTechnicalOperation);
}

export function normalizeExecutionPayload(
  response: ApiExecutionPayloadResponse
): ExecutionPayload {
  const data = response.data ?? {};
  return {
    input: data.input,
    metadata: data.metadata,
    output: data.output,
    redactedFields: normalizeStringArray(data.redacted_fields),
  };
}

export function normalizeExecutionLogs(
  response: ApiExecutionLogResponse
): ExecutionLogEntry[] {
  return (response.data ?? []).map(normalizeExecutionLog);
}

function normalizeRuntimeEdges(
  edges: ApiRuntimeStoryEdge[],
  nodeIdAliases: Map<string, string>,
  nodeIds: Set<string>
): ExecutionEdge[] {
  const seenEdges = new Set<string>();
  const normalizedEdges: ExecutionEdge[] = [];

  for (const edge of edges) {
    const source = nodeIdAliases.get(edge.source ?? "") ?? edge.source;
    const target = nodeIdAliases.get(edge.target ?? "") ?? edge.target;
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) {
      continue;
    }
    const id = normalizeProviderEdgeId(
      safeString(edge.id, `${source}:${target}:${edge.type ?? "edge"}`)
    );
    const dedupeKey = `${source}:${target}:${edge.type ?? "edge"}:${id}`;
    if (seenEdges.has(dedupeKey)) {
      continue;
    }
    seenEdges.add(dedupeKey);
    normalizedEdges.push({
      id,
      ...(edge.label ? { label: edge.label } : {}),
      source,
      target,
      type: safeString(edge.type, "sequence"),
    });
  }

  return normalizedEdges;
}

function normalizeTimelineItem(
  item: ApiTimelineItem,
  fallbackCorrelationId: string,
  index: number
): TimelineItem {
  const type = normalizeProviderCallType(item.type);
  const id = normalizeProviderNodeId(
    safeString(item.id, `timeline_${index + 1}`),
    type
  );
  const createdAt = normalizeTimestamp(item.created_at);
  const completedAt = maybeTimestamp(item.completed_at);
  const lastError = item.last_error;
  const startedAt = maybeTimestamp(item.started_at);
  return {
    attempts: normalizeInteger(item.attempts, 1),
    correlationId: safeString(item.correlation_id, fallbackCorrelationId),
    createdAt,
    detailId: id,
    id,
    maxAttempts: normalizeInteger(item.max_attempts, 1),
    name: safeString(item.name, "Runtime Work"),
    ...(completedAt ? { completedAt } : {}),
    ...(lastError ? { lastError } : {}),
    ...(startedAt ? { startedAt } : {}),
    status: normalizeRuntimeStatus(item.status),
    type,
  };
}

function normalizeExecutionLog(log: ApiExecutionLog): ExecutionLogEntry {
  return {
    attributes: objectRecord(log.attributes),
    body: safeString(log.body, ""),
    correlationId: safeString(log.correlation_id, "unknown"),
    executionName: safeString(log.execution_name, "Runtime Work"),
    id: safeString(log.id, "execution_log"),
    nodeId: safeString(log.node_id, "unknown"),
    nodeType: safeString(log.node_type, "runtime"),
    occurredAt: normalizeTimestamp(log.occurred_at),
    redactedFields: normalizeStringArray(log.redacted_fields),
    serviceName: safeString(log.service_name, "runtime"),
    severity: normalizeLogSeverity(log.severity),
    ...(typeof log.span_id === "string" ? { spanId: log.span_id } : {}),
    storyId: safeString(
      log.story_id,
      safeString(log.correlation_id, "unknown")
    ),
    ...(typeof log.trace_id === "string" ? { traceId: log.trace_id } : {}),
  };
}

function normalizeTechnicalOperation(
  operation: ApiTechnicalOperation
): TechnicalOperation {
  const source = normalizeTechnicalOperationSource(operation.source);
  return {
    attributes: normalizeProviderAttributes(operation.attributes, source),
    category: normalizeTechnicalOperationCategory(operation.category),
    correlationId: safeString(operation.correlation_id, "unknown"),
    durationMs: normalizeDuration(operation.duration_ms),
    endedAt: normalizeTimestamp(operation.ended_at),
    id: normalizeProviderOperationId(
      safeString(operation.id, "technical_operation"),
      source
    ),
    name: safeString(operation.name, "Technical Operation"),
    ...(operation.related_node_id
      ? {
          relatedNodeId: normalizeProviderNodeId(
            operation.related_node_id,
            source === "provider" ? "provider_call" : undefined
          ),
        }
      : {}),
    source,
    startedAt: normalizeTimestamp(operation.started_at),
    status: safeString(operation.status, "unknown"),
    storyId: safeString(operation.story_id, "unknown"),
  };
}

function normalizeLogSeverity(severity: string | undefined) {
  switch (severity) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error": {
      return severity;
    }
    default: {
      return "info";
    }
  }
}

function normalizeTechnicalOperationCategory(
  category: string | undefined
): TechnicalOperation["category"] {
  switch (category) {
    case "http":
    case "db":
    case "redis":
    case "s3":
    case "ses":
    case "worker":
    case "runtime":
    case "external":
    case "unknown": {
      return category;
    }
    default: {
      return "unknown";
    }
  }
}

function normalizeTechnicalOperationSource(
  source: string | undefined
): TechnicalOperation["source"] {
  switch (source) {
    case "provider":
    case "remote_runtime": {
      return source;
    }
    case "remote_proxy": {
      return "provider";
    }
    default: {
      return "otel";
    }
  }
}

function normalizeRuntimeHeatmapCell(
  cell: ApiRuntimeHeatmapCell
): RuntimeHeatmapCell {
  const bucketStart = normalizeTimestamp(cell.bucket_start);
  const avgDurationMs = normalizeOptionalPositiveDuration(cell.avg_duration_ms);
  const maxDurationMs = normalizeOptionalPositiveDuration(cell.max_duration_ms);
  return {
    bucketEnd: normalizeTimestamp(cell.bucket_end, bucketStart),
    bucketStart,
    deadCount: normalizeInteger(cell.dead_count, 0),
    errorCount: normalizeInteger(cell.error_count, 0),
    ...(avgDurationMs === undefined ? {} : { avgDurationMs }),
    ...(maxDurationMs === undefined ? {} : { maxDurationMs }),
    nodeType: normalizeHeatmapNodeType(cell.node_type),
    service: safeString(cell.service, "runtime"),
    totalCount: normalizeInteger(cell.total_count, 0),
  };
}

function normalizeHeatmapNodeType(type: string | undefined) {
  switch (type) {
    case "event":
    case "outbox_event": {
      return "event";
    }
    case "http":
    case "http_request": {
      return "http";
    }
    case "external_provider_call":
    case "provider_call":
    case "remote_proxy_call": {
      return "provider_call";
    }
    default: {
      return "function";
    }
  }
}

function normalizePageInfoPartial(page: DeepPartial<ApiPageInfo>): PageInfo {
  return {
    limit: normalizeInteger(page.limit, 0),
    ...(maybeTimestamp(page.next_created_before)
      ? { nextCreatedBefore: maybeTimestamp(page.next_created_before)! }
      : {}),
  };
}

function placeholderNode(input: {
  correlationId: string;
  durationMs: number;
  error?: string | null;
  id: string;
  index: number;
  kind: ExecutionNode["kind"];
  service: string;
  status: RuntimeStatus;
  timestamp: string;
}): ExecutionNode {
  return {
    attributes: {},
    context: { correlation_id: input.correlationId },
    durationMs: input.durationMs,
    events: [],
    id: input.id,
    kind: input.kind,
    logs: input.error ? [input.error] : [],
    name: "Runtime Work",
    retryable: isRetryable(input.status),
    service: input.service,
    startMs: input.index === 0 ? 0 : input.index,
    status: input.status,
  };
}

function toExecutionNodeKind(type: string | undefined): ExecutionNode["kind"] {
  switch (type) {
    case "http":
    case "http_request":
    case "request": {
      return "http";
    }
    case "command": {
      return "command";
    }
    case "database": {
      return "database";
    }
    case "event":
    case "outbox_event": {
      return "event";
    }
    case "handler": {
      return "handler";
    }
    case "function":
    case "function_run":
    case "flow_step":
    case "agent_tool_call": {
      return "function";
    }
    case "external":
    case "provider_call":
    case "remote_proxy_call":
    case "external_provider_call": {
      return "external";
    }
    case "worker":
    case "runtime": {
      return "runtime";
    }
    default: {
      return "runtime";
    }
  }
}

function normalizeProviderCallType(type: string | undefined) {
  switch (type) {
    case "remote_proxy_call":
    case "external_provider_call":
    case "provider_call": {
      return "provider_call";
    }
    default: {
      return safeString(type, "runtime");
    }
  }
}

function normalizeProviderNodeId(id: string, type: string | undefined) {
  if (type !== "provider_call" || !id.startsWith("remoteproxy_")) {
    return id;
  }
  return `provider_${id.slice("remoteproxy_".length)}`;
}

function normalizeProviderEdgeId(id: string) {
  return id.replaceAll("remoteproxy_", "provider_");
}

function normalizeProviderOperationId(
  id: string,
  source: TechnicalOperation["source"]
) {
  if (source !== "provider" || !id.startsWith("remote_proxy:")) {
    return id;
  }
  return `provider:${id.slice("remote_proxy:".length)}`;
}

function normalizeProviderNodeMetadata(
  value: unknown,
  type: string
): Record<string, unknown> {
  const metadata = objectRecord(value);
  if (type !== "provider_call") {
    return metadata;
  }
  const normalized = normalizeProviderAttributes(metadata, "provider");
  if (Object.hasOwn(metadata, "source_metadata")) {
    normalized.source_metadata = normalizeProviderAttributes(
      metadata.source_metadata,
      "provider"
    );
  }
  return normalized;
}

function normalizeProviderNodeReferences(metadata: Record<string, unknown>) {
  const normalized = { ...metadata };
  if (typeof normalized.causation_id === "string") {
    normalized.causation_id = normalizeProviderReferenceId(
      normalized.causation_id
    );
  }
  return normalized;
}

function normalizeProviderReferenceId(id: string) {
  return id.startsWith("remoteproxy_")
    ? `provider_${id.slice("remoteproxy_".length)}`
    : id;
}

function normalizeProviderAttributes(
  value: unknown,
  source: TechnicalOperation["source"]
): Record<string, unknown> {
  const attributes = { ...objectRecord(value) };
  if (source !== "provider") {
    return attributes;
  }
  for (const [legacy, canonical] of [
    ["remote_proxy_call_id", "provider_call_id"],
    ["remote_path", "provider_path"],
    ["remote_status", "provider_status"],
  ] as const) {
    if (
      !Object.hasOwn(attributes, canonical) &&
      Object.hasOwn(attributes, legacy)
    ) {
      attributes[canonical] = attributes[legacy];
    }
  }
  delete attributes.remote_proxy_call_id;
  delete attributes.remote_path;
  delete attributes.remote_status;
  return attributes;
}

function normalizeRuntimeStatus(status: string | undefined): RuntimeStatus {
  switch (status) {
    case "pending":
    case "processing":
    case "running":
    case "published":
    case "completed":
    case "failed":
    case "dead": {
      return status;
    }
    default: {
      return "pending";
    }
  }
}

function normalizeFederatedGapKind(
  kind: string | undefined
): FederatedStoryGap["kind"] {
  switch (kind) {
    case "unreachable":
    case "stale":
    case "unauthorized":
    case "truncated":
    case "retention_expired": {
      return kind;
    }
    default: {
      return "unreachable";
    }
  }
}

function normalizeFederatedWorkflowKind(
  kind: string | undefined
): FederatedWorkflowEntity["kind"] {
  switch (kind) {
    case "instance":
    case "step":
    case "attempt":
    case "timer":
    case "child":
    case "compensation":
    case "intervention": {
      return kind;
    }
    default: {
      return "instance";
    }
  }
}

function normalizeReliabilityEvidenceStatus(
  status: string | undefined
): FederatedReliabilityEvidence["status"] {
  switch (status) {
    case "available":
    case "unavailable":
    case "not_declared": {
      return status;
    }
    default: {
      return "unavailable";
    }
  }
}

function normalizeReliabilityProfile(
  profile: string | undefined
): NonNullable<FederatedReliabilityEvidence["report"]>["profile"] {
  switch (profile) {
    case "development":
    case "standard":
    case "critical": {
      return profile;
    }
    default: {
      return "development";
    }
  }
}

function normalizeReliabilityState(
  state: string | undefined
): NonNullable<FederatedReliabilityEvidence["report"]>["state"] {
  switch (state) {
    case "healthy":
    case "degraded":
    case "unavailable": {
      return state;
    }
    default: {
      return "unavailable";
    }
  }
}

function normalizeReliabilityCheckState(
  state: string | undefined
): NonNullable<
  FederatedReliabilityEvidence["report"]
>["checks"][number]["state"] {
  switch (state) {
    case "met":
    case "breached":
    case "unknown":
    case "allowed": {
      return state;
    }
    default: {
      return "unknown";
    }
  }
}

function normalizeTimestamp(value: unknown, fallback = fallbackTimestamp) {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return value;
  }
  return fallback;
}

function maybeTimestamp(value: unknown) {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return value;
  }
  return undefined;
}

function timelineItemOffset(baseTimestamp: string, timestamp: string) {
  const base = Date.parse(baseTimestamp);
  const value = Date.parse(timestamp);
  if (Number.isFinite(base) && Number.isFinite(value)) {
    return Math.max(0, value - base);
  }
  return 0;
}

function normalizeDuration(value: unknown) {
  return normalizeInteger(value, 0);
}

function normalizeOptionalPositiveDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function normalizeInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : fallback;
}

function normalizeOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function safeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    : [];
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
