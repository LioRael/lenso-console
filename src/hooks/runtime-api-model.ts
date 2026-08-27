import type {
  ExecutionEdge,
  ExecutionLogCoverage,
  ExecutionLogEntry,
  ExecutionLogsResult,
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

export type ApiRuntimeStoryListResponse = AdminRuntimeStoryListResponse;
export type ApiRuntimeStoryListItem = AdminRuntimeStoryListItem;
export type ApiRuntimeStoryDetailResponse = AdminRuntimeStoryDetailResponse;
export type ApiRuntimeStoryDetail = AdminRuntimeStoryDetail;
export type ApiRuntimeStoryEdge = AdminRuntimeStoryEdge;
export type ApiTimelineItem = AdminRuntimeTimelineItem;
export type ApiRuntimeHeatmapResponse = AdminRuntimeHeatmapResponse;
export type ApiRuntimeHeatmapCell = AdminRuntimeHeatmapCell;
export type ApiExecutionPayloadResponse = AdminRuntimeExecutionPayloadResponse;
export type ApiExecutionLogResponse = AdminRuntimeExecutionLogListResponse;
export type ApiExecutionLog = AdminRuntimeExecutionLog;
export type ApiTechnicalOperationResponse =
  AdminRuntimeTechnicalOperationListResponse;
export type ApiTechnicalOperation = AdminRuntimeTechnicalOperation;

export function normalizeRuntimeStoryListResponse(
  response: ApiRuntimeStoryListResponse
): { stories: RuntimeStory[]; page?: PageInfo } {
  return {
    page: normalizePageInfo(response.page),
    stories: response.data.map(normalizeRuntimeStoryListItem),
  };
}

export function normalizeRuntimeStoryListItem(
  item: ApiRuntimeStoryListItem
): RuntimeStory {
  const correlationId = requiredString(item.correlation_id, "correlation_id");
  const timestamp = requiredTimestamp(item.created_at, "created_at");
  const durationMs = requiredNonNegativeInteger(item.duration, "duration");
  const services = requiredStringArray(item.services, "services");
  const pattern = requiredStringArray(item.pattern, "pattern");
  const nodeCount = requiredNonNegativeInteger(item.node_count, "node_count");
  const errorCount = requiredNonNegativeInteger(
    item.error_count,
    "error_count"
  );
  const service = requiredString(services[0], "services[0]");
  const storyKind = requiredStoryKind(item.story_kind, "story_kind");

  return {
    correlationId,
    durationMs,
    id: correlationId,
    name: requiredString(item.title, "title"),
    nodes: [],
    service,
    source:
      storyKind === "federated" ? "federated-runtime-story" : "runtime-story",
    status: requiredRuntimeStatus(item.status, "status"),
    summary: {
      errorCount,
      nodeCount,
      pattern: pattern.map(toExecutionNodeKind),
      ...(item.root_error ? { rootError: item.root_error } : {}),
      services,
    },
    timestamp,
  };
}

export function normalizeRuntimeStory(
  detail: ApiRuntimeStoryDetail
): RuntimeStory {
  const { summary } = detail;
  const isFederated =
    requiredStoryKind(summary.story_kind, "story_kind") === "federated";
  const correlationId = requiredString(
    summary.correlation_id,
    "correlation_id"
  );
  const timestamp = requiredTimestamp(summary.created_at, "created_at");
  const baseTimestamp = Date.parse(timestamp);
  const nodeIdAliases = new Map<string, string>();
  const seenIds = new Set<string>();
  const nodes = detail.nodes.map((node): ExecutionNode => {
    const inputId = requiredString(node.id, "nodes[].id");
    const nodeType = normalizeProviderCallType(node.type);
    const canonicalId = normalizeProviderNodeId(inputId, nodeType);
    if (seenIds.has(canonicalId)) {
      throw new Error(
        `Runtime API response has duplicate node id ${canonicalId}`
      );
    }
    seenIds.add(canonicalId);
    nodeIdAliases.set(inputId, canonicalId);
    nodeIdAliases.set(canonicalId, canonicalId);

    const metadata = normalizeProviderNodeReferences(
      normalizeProviderNodeMetadata(node.metadata, nodeType)
    );
    const nodeTimestamp = requiredTimestamp(
      node.timestamp,
      "nodes[].timestamp"
    );
    const parsedNodeTimestamp = Date.parse(nodeTimestamp);
    const startMs = Math.max(0, parsedNodeTimestamp - baseTimestamp);
    const error = node.error ?? undefined;
    const status = requiredRuntimeStatus(node.status, "nodes[].status");
    const attempts = normalizeOptionalInteger(metadata.attempts);
    const maxAttempts = normalizeOptionalInteger(metadata.max_attempts);
    const canonicalName = requiredString(node.name, "nodes[].name");
    const displayName = requiredString(
      node.display_name,
      "nodes[].display_name"
    );

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
      durationMs: requiredNonNegativeInteger(
        node.duration_ms,
        "nodes[].duration_ms"
      ),
      events: [],
      id: canonicalId,
      kind: toExecutionNodeKind(nodeType),
      logs: error ? [error] : [],
      name: displayName,
      retryable: !isFederated && isRetryable(status),
      service: requiredString(node.service, "nodes[].service"),
      startMs,
      status,
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeRuntimeEdges(detail.edges, nodeIdAliases, nodeIds);
  const parentByTarget = new Map(
    edges.map((edge) => [edge.target, edge.source])
  );
  const nodesWithParents = nodes.map((node) => {
    const parentId = parentByTarget.get(node.id);
    return parentId ? { ...node, parentId } : node;
  });
  const timelineItems = detail.timeline_items.map((item) =>
    normalizeTimelineItem(item, correlationId)
  );
  const lastNodeEnd = Math.max(
    0,
    ...nodesWithParents.map((node) => node.startMs + node.durationMs),
    ...timelineItems.map((item) =>
      timelineItemOffset(timestamp, item.completedAt ?? item.createdAt)
    )
  );

  return {
    correlationId,
    durationMs: Math.max(
      requiredNonNegativeInteger(summary.duration, "duration"),
      lastNodeEnd
    ),
    edges,
    id: correlationId,
    name: requiredString(summary.title, "title"),
    nodes: nodesWithParents,
    service: requiredString(
      nodesWithParents[0]?.service ?? summary.services[0],
      "services[0]"
    ),
    source: isFederated ? "federated-runtime-story" : "runtime-story",
    status: requiredRuntimeStatus(summary.status, "status"),
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
    assembledAt: requiredTimestamp(
      evidence.assembledAt,
      "federation.assembledAt"
    ),
    gaps: evidence.gaps.map(normalizeFederatedStoryGap),
    protocol: requiredString(evidence.protocol, "federation.protocol"),
    reliability: evidence.reliability.map(
      normalizeFederatedReliabilityEvidence
    ),
    ...(typeof evidence.tenantId === "string"
      ? { tenantId: evidence.tenantId }
      : {}),
    workflowEntities: evidence.workflowEntities.map(
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
    detail: requiredString(gap.detail, "federation.gaps[].detail"),
    detectedAt: requiredTimestamp(
      gap.detectedAt,
      "federation.gaps[].detectedAt"
    ),
    kind: normalizeFederatedGapKind(gap.kind),
    lastObservedAt: requiredTimestamp(
      gap.lastObservedAt,
      "federation.gaps[].lastObservedAt"
    ),
    nextAction: requiredString(gap.nextAction, "federation.gaps[].nextAction"),
    sourceServiceId: requiredString(
      gap.sourceServiceId,
      "federation.gaps[].sourceServiceId"
    ),
    ...(typeof gap.tenantId === "string" ? { tenantId: gap.tenantId } : {}),
  };
}

function normalizeFederatedWorkflowEntity(
  entity: NonNullable<
    NonNullable<ApiRuntimeStoryDetail["federation"]>["workflowEntities"]
  >[number]
): FederatedWorkflowEntity {
  return {
    attempt: requiredNonNegativeInteger(
      entity.attempt,
      "federation.workflowEntities[].attempt"
    ),
    id: requiredString(entity.id, "federation.workflowEntities[].id"),
    instanceId: requiredString(
      entity.instanceId,
      "federation.workflowEntities[].instanceId"
    ),
    kind: normalizeFederatedWorkflowKind(entity.kind),
    label: requiredString(entity.label, "federation.workflowEntities[].label"),
    nodeId: requiredString(
      entity.nodeId,
      "federation.workflowEntities[].nodeId"
    ),
    observedAt: requiredTimestamp(
      entity.observedAt,
      "federation.workflowEntities[].observedAt"
    ),
    ...(typeof entity.parentId === "string"
      ? { parentId: entity.parentId }
      : {}),
    serviceId: requiredString(
      entity.serviceId,
      "federation.workflowEntities[].serviceId"
    ),
    state: requiredString(entity.state, "federation.workflowEntities[].state"),
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
    observedAt: requiredTimestamp(
      evidence.observedAt,
      "federation.reliability[].observedAt"
    ),
    ...(report
      ? {
          report: {
            activeDegradedModes: report.activeDegradedModes.map((mode) => ({
              dependencyId: requiredString(
                mode.dependencyId,
                "federation.reliability[].report.activeDegradedModes[].dependencyId"
              ),
              evidenceReferences: mode.evidenceReferences,
              mode: requiredString(
                mode.mode,
                "federation.reliability[].report.activeDegradedModes[].mode"
              ),
            })),
            checks: report.checks.map((check) => ({
              code: requiredString(
                check.code,
                "federation.reliability[].report.checks[].code"
              ),
              evidenceReferences: check.evidenceReferences,
              expected: check.expected,
              ...(typeof check.issueCode === "string"
                ? { issueCode: check.issueCode }
                : {}),
              nextActions: check.nextActions,
              observed: check.observed,
              state: normalizeReliabilityCheckState(check.state),
            })),
            contractId: requiredString(
              report.contractId,
              "federation.reliability[].report.contractId"
            ),
            contractVersion: requiredString(
              report.contractVersion,
              "federation.reliability[].report.contractVersion"
            ),
            effectiveValues: requiredObject(
              report.effectiveValues,
              "federation.reliability[].report.effectiveValues"
            ),
            overrides: requiredObject(
              report.overrides,
              "federation.reliability[].report.overrides"
            ),
            profile: normalizeReliabilityProfile(report.profile),
            protocol: requiredString(
              report.protocol,
              "federation.reliability[].report.protocol"
            ),
            serviceId: requiredString(
              report.serviceId,
              "federation.reliability[].report.serviceId"
            ),
            state: normalizeReliabilityState(report.state),
          },
        }
      : {}),
    sourceServiceId: requiredString(
      evidence.sourceServiceId,
      "federation.reliability[].sourceServiceId"
    ),
    status: normalizeReliabilityEvidenceStatus(evidence.status),
  };
}

export function normalizeRuntimeHeatmap(
  response: ApiRuntimeHeatmapResponse
): RuntimeHeatmap {
  return {
    bucketSeconds: requiredPositiveInteger(
      response.bucket_seconds,
      "bucket_seconds"
    ),
    cells: response.data.map(normalizeRuntimeHeatmapCell),
    page: normalizePageInfo(response.page),
  };
}

export function normalizeTechnicalOperations(
  response: ApiTechnicalOperationResponse
): TechnicalOperation[] {
  return response.data
    .filter((operation) => operation.source !== "admin_action")
    .map(normalizeTechnicalOperation);
}

export function normalizeExecutionPayload(
  response: ApiExecutionPayloadResponse
): ExecutionPayload {
  const { data } = response;
  return {
    groups: data.groups.map((group) => ({
      content: group.content,
      defaultExpanded: group.default_expanded,
      gaps: group.gaps.map((gap) => ({
        detail: requiredString(gap.detail, "groups[].gaps[].detail"),
        field: requiredString(gap.field, "groups[].gaps[].field"),
        status: requiredEvidenceGapStatus(gap.status, "groups[].gaps[].status"),
      })),
      key: requiredString(group.key, "groups[].key"),
      redactedFields: group.redacted_fields,
    })),
    input: data.input,
    metadata: data.metadata,
    nodeType: requiredString(data.node_type, "node_type"),
    output: data.output,
    redactedFields: data.redacted_fields,
  };
}

export function normalizeExecutionLogs(
  response: ApiExecutionLogResponse
): ExecutionLogsResult {
  if (!response.coverage) {
    throw new Error("Runtime API response is missing coverage");
  }
  return {
    coverage: normalizeExecutionLogCoverage(response.coverage),
    entries: response.data.map(normalizeExecutionLog),
  };
}

function normalizeRuntimeEdges(
  edges: ApiRuntimeStoryEdge[],
  nodeIdAliases: Map<string, string>,
  nodeIds: Set<string>
): ExecutionEdge[] {
  const seenEdges = new Set<string>();
  const normalizedEdges: ExecutionEdge[] = [];

  for (const edge of edges) {
    const rawSource = requiredString(edge.source, "edges[].source");
    const rawTarget = requiredString(edge.target, "edges[].target");
    const source = nodeIdAliases.get(rawSource) ?? rawSource;
    const target = nodeIdAliases.get(rawTarget) ?? rawTarget;
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      throw new Error(`Runtime API response has a dangling edge ${edge.id}`);
    }
    const id = normalizeProviderEdgeId(requiredString(edge.id, "edges[].id"));
    const type = requiredString(edge.type, "edges[].type");
    const dedupeKey = `${source}:${target}:${type}:${id}`;
    if (seenEdges.has(dedupeKey)) {
      throw new Error(`Runtime API response has duplicate edge ${id}`);
    }
    seenEdges.add(dedupeKey);
    normalizedEdges.push({
      id,
      ...(edge.label ? { label: edge.label } : {}),
      source,
      target,
      type,
    });
  }

  return normalizedEdges;
}

function normalizeTimelineItem(
  item: ApiTimelineItem,
  storyCorrelationId: string
): TimelineItem {
  const type = normalizeProviderCallType(item.type);
  const id = normalizeProviderNodeId(
    requiredString(item.id, "timeline_items[].id"),
    type
  );
  const createdAt = requiredTimestamp(
    item.created_at,
    "timeline_items[].created_at"
  );
  const completedAt = optionalTimestamp(
    item.completed_at,
    "timeline_items[].completed_at"
  );
  const lastError = item.last_error;
  const startedAt = optionalTimestamp(
    item.started_at,
    "timeline_items[].started_at"
  );
  const correlationId = requiredString(
    item.correlation_id,
    "timeline_items[].correlation_id"
  );
  if (correlationId !== storyCorrelationId) {
    throw new Error(
      `Runtime API response has a mismatched timeline correlation`
    );
  }
  return {
    attempts: requiredNonNegativeInteger(
      item.attempts,
      "timeline_items[].attempts"
    ),
    correlationId,
    createdAt,
    detailId: id,
    id,
    maxAttempts: requiredNonNegativeInteger(
      item.max_attempts,
      "timeline_items[].max_attempts"
    ),
    name: requiredString(item.name, "timeline_items[].name"),
    ...(completedAt ? { completedAt } : {}),
    ...(lastError ? { lastError } : {}),
    ...(startedAt ? { startedAt } : {}),
    status: requiredRuntimeStatus(item.status, "timeline_items[].status"),
    type,
  };
}

function normalizeExecutionLog(log: ApiExecutionLog): ExecutionLogEntry {
  return {
    attributes: requiredObject(log.attributes, "logs[].attributes"),
    body: log.body,
    correlationId: requiredString(log.correlation_id, "logs[].correlation_id"),
    executionName: requiredString(log.execution_name, "logs[].execution_name"),
    id: requiredString(log.id, "logs[].id"),
    nodeId: requiredString(log.node_id, "logs[].node_id"),
    nodeType: requiredString(log.node_type, "logs[].node_type"),
    occurredAt: requiredTimestamp(log.occurred_at, "logs[].occurred_at"),
    redactedFields: log.redacted_fields,
    serviceName: requiredString(log.service_name, "logs[].service_name"),
    severity: requiredLogSeverity(log.severity, "logs[].severity"),
    ...(typeof log.span_id === "string" ? { spanId: log.span_id } : {}),
    storyId: requiredString(log.story_id, "logs[].story_id"),
    ...(typeof log.trace_id === "string" ? { traceId: log.trace_id } : {}),
  };
}

function normalizeExecutionLogCoverage(
  coverage: ApiExecutionLogResponse["coverage"]
): ExecutionLogCoverage {
  return {
    gaps: coverage.gaps.map((gap) => ({
      detail: requiredString(gap.detail, "coverage.gaps[].detail"),
      kind: requiredString(gap.kind, "coverage.gaps[].kind"),
      ...(typeof gap.next_action === "string" && gap.next_action.length > 0
        ? { nextAction: gap.next_action }
        : {}),
      sourceId: requiredString(gap.source_id, "coverage.gaps[].source_id"),
    })),
    sources: coverage.sources.map((source) => ({
      serviceName: requiredString(
        source.service_name,
        "coverage.sources[].service_name"
      ),
      sourceId: requiredString(
        source.source_id,
        "coverage.sources[].source_id"
      ),
      status: requiredCoverageStatus(
        source.status,
        "coverage.sources[].status"
      ),
    })),
    status: requiredCoverageStatus(coverage.status, "coverage.status"),
  };
}

function normalizeTechnicalOperation(
  operation: ApiTechnicalOperation
): TechnicalOperation {
  const source = normalizeTechnicalOperationSource(operation.source);
  return {
    attributes: normalizeProviderAttributes(
      requiredObject(operation.attributes, "operations[].attributes"),
      source
    ),
    category: normalizeTechnicalOperationCategory(operation.category),
    correlationId: requiredString(
      operation.correlation_id,
      "operations[].correlation_id"
    ),
    durationMs: requiredNonNegativeInteger(
      operation.duration_ms,
      "operations[].duration_ms"
    ),
    endedAt: requiredTimestamp(operation.ended_at, "operations[].ended_at"),
    id: normalizeProviderOperationId(
      requiredString(operation.id, "operations[].id"),
      source
    ),
    name: requiredString(operation.name, "operations[].name"),
    ...(operation.related_node_id
      ? {
          relatedNodeId: normalizeProviderNodeId(
            operation.related_node_id,
            source === "provider" ? "provider_call" : undefined
          ),
        }
      : {}),
    source,
    startedAt: requiredTimestamp(
      operation.started_at,
      "operations[].started_at"
    ),
    status: requiredString(operation.status, "operations[].status"),
    storyId: requiredString(operation.story_id, "operations[].story_id"),
  };
}

function requiredLogSeverity(severity: unknown, field: string) {
  switch (severity) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error": {
      return severity;
    }
    default: {
      throw new Error(`Runtime API response has an invalid ${field}`);
    }
  }
}

function normalizeTechnicalOperationCategory(
  category: string
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
      throw new Error(
        "Runtime API response has an invalid operations[].category"
      );
    }
  }
}

function normalizeTechnicalOperationSource(
  source: string
): TechnicalOperation["source"] {
  switch (source) {
    case "provider":
    case "remote_runtime": {
      return source;
    }
    case "remote_proxy": {
      return "provider";
    }
    case "otel": {
      return "otel";
    }
    default: {
      throw new Error(
        "Runtime API response has an invalid operations[].source"
      );
    }
  }
}

function normalizeRuntimeHeatmapCell(
  cell: ApiRuntimeHeatmapCell
): RuntimeHeatmapCell {
  const bucketStart = requiredTimestamp(
    cell.bucket_start,
    "heatmap[].bucket_start"
  );
  const avgDurationMs = optionalNonNegativeInteger(
    cell.avg_duration_ms,
    "heatmap[].avg_duration_ms"
  );
  const maxDurationMs = optionalNonNegativeInteger(
    cell.max_duration_ms,
    "heatmap[].max_duration_ms"
  );
  return {
    bucketEnd: requiredTimestamp(cell.bucket_end, "heatmap[].bucket_end"),
    bucketStart,
    deadCount: requiredNonNegativeInteger(
      cell.dead_count,
      "heatmap[].dead_count"
    ),
    errorCount: requiredNonNegativeInteger(
      cell.error_count,
      "heatmap[].error_count"
    ),
    ...(avgDurationMs === undefined ? {} : { avgDurationMs }),
    ...(maxDurationMs === undefined ? {} : { maxDurationMs }),
    nodeType: normalizeHeatmapNodeType(cell.node_type),
    service: requiredString(cell.service, "heatmap[].service"),
    totalCount: requiredNonNegativeInteger(
      cell.total_count,
      "heatmap[].total_count"
    ),
  };
}

function normalizeHeatmapNodeType(type: string) {
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
    case "function":
    case "function_run":
    case "flow_step":
    case "agent_tool_call": {
      return "function";
    }
    default: {
      throw new Error(
        "Runtime API response has an invalid heatmap[].node_type"
      );
    }
  }
}

function normalizePageInfo(page: ApiPageInfo): PageInfo {
  return {
    limit: requiredNonNegativeInteger(page.limit, "page.limit"),
    ...(page.next_created_before
      ? {
          nextCreatedBefore: requiredTimestamp(
            page.next_created_before,
            "page.next_created_before"
          ),
        }
      : {}),
  };
}

function toExecutionNodeKind(type: string): ExecutionNode["kind"] {
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
      throw new Error("Runtime API response has an invalid nodes[].type");
    }
  }
}

function normalizeProviderCallType(type: string) {
  switch (type) {
    case "remote_proxy_call":
    case "external_provider_call":
    case "provider_call": {
      return "provider_call";
    }
    default: {
      return requiredString(type, "nodes[].type");
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
  const metadata = requiredObject(value, "nodes[].metadata");
  if (type !== "provider_call") {
    return metadata;
  }
  const normalized = normalizeProviderAttributes(metadata, "provider");
  if (Object.hasOwn(metadata, "source_metadata")) {
    normalized.source_metadata = normalizeProviderAttributes(
      requiredObject(
        metadata.source_metadata,
        "nodes[].metadata.source_metadata"
      ),
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
  value: Record<string, unknown>,
  source: TechnicalOperation["source"]
): Record<string, unknown> {
  const attributes = { ...value };
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

function normalizeFederatedGapKind(kind: string): FederatedStoryGap["kind"] {
  switch (kind) {
    case "unreachable":
    case "stale":
    case "unauthorized":
    case "truncated":
    case "retention_expired": {
      return kind;
    }
    default: {
      throw new Error(
        "Runtime API response has an invalid federation.gaps[].kind"
      );
    }
  }
}

function normalizeFederatedWorkflowKind(
  kind: string
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
      throw new Error(
        "Runtime API response has an invalid federation.workflowEntities[].kind"
      );
    }
  }
}

function normalizeReliabilityEvidenceStatus(
  status: string
): FederatedReliabilityEvidence["status"] {
  switch (status) {
    case "available":
    case "unavailable":
    case "not_declared": {
      return status;
    }
    default: {
      throw new Error(
        "Runtime API response has an invalid federation.reliability[].status"
      );
    }
  }
}

function normalizeReliabilityProfile(
  profile: string
): NonNullable<FederatedReliabilityEvidence["report"]>["profile"] {
  switch (profile) {
    case "development":
    case "standard":
    case "critical": {
      return profile;
    }
    default: {
      throw new Error(
        "Runtime API response has an invalid federation.reliability[].report.profile"
      );
    }
  }
}

function normalizeReliabilityState(
  state: string
): NonNullable<FederatedReliabilityEvidence["report"]>["state"] {
  switch (state) {
    case "healthy":
    case "degraded":
    case "unavailable": {
      return state;
    }
    default: {
      throw new Error(
        "Runtime API response has an invalid federation.reliability[].report.state"
      );
    }
  }
}

function normalizeReliabilityCheckState(
  state: string
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
      throw new Error(
        "Runtime API response has an invalid federation.reliability[].report.checks[].state"
      );
    }
  }
}

function timelineItemOffset(baseTimestamp: string, timestamp: string) {
  return Math.max(0, Date.parse(timestamp) - Date.parse(baseTimestamp));
}

function normalizeOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function requiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new Error(`Runtime API response is missing ${field}`);
}

function requiredTimestamp(value: unknown, field: string) {
  const timestamp = requiredString(value, field);
  if (Number.isFinite(Date.parse(timestamp))) {
    return timestamp;
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}

function requiredNonNegativeInteger(value: unknown, field: string) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}

function requiredPositiveInteger(value: unknown, field: string) {
  const integer = requiredNonNegativeInteger(value, field);
  if (integer > 0) {
    return integer;
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}

function optionalNonNegativeInteger(value: unknown, field: string) {
  return value === undefined || value === null
    ? undefined
    : requiredNonNegativeInteger(value, field);
}

function optionalTimestamp(value: unknown, field: string) {
  return value === undefined || value === null
    ? undefined
    : requiredTimestamp(value, field);
}

function requiredRuntimeStatus(value: unknown, field: string): RuntimeStatus {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "running" ||
    value === "published" ||
    value === "completed" ||
    value === "failed" ||
    value === "dead"
  ) {
    return value;
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}

function requiredStoryKind(value: unknown, field: string) {
  if (value === "runtime" || value === "federated") {
    return value;
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}

function requiredEvidenceGapStatus(value: unknown, field: string) {
  if (value === "not_applicable" || value === "not_captured") {
    return value;
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}

function requiredCoverageStatus(
  value: unknown,
  field: string
): ExecutionLogCoverage["status"] {
  if (
    value === "complete" ||
    value === "disabled" ||
    value === "partial" ||
    value === "unavailable"
  ) {
    return value;
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}

function requiredStringArray(value: unknown, field: string) {
  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.length > 0)
  ) {
    return value as string[];
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}

function requiredObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`Runtime API response has an invalid ${field}`);
}
