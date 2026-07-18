export type PageInfo = {
  limit: number;
  next_created_before?: string | null;
};

export type ModuleSource = string;

export type RuntimeRetryPolicyDeclaration = {
  initial_delay_ms: number;
  max_attempts: number;
};

export type AdminActionInvocationDto = {
  correlation_id: string;
  request_id: string;
  story_node_id: string;
};

export type AdminActionInvocationItem = {
  action_name: string;
  capability?: string | null;
  correlation_id: string;
  duration_ms: number;
  error_code?: string | null;
  error_message?: string | null;
  id: string;
  input_summary?: string | null;
  label: string;
  module_name: string;
  occurred_at: string;
  request_id?: string | null;
  result_summary?: string | null;
  span_id?: string | null;
  success: boolean;
  trace_id?: string | null;
};

export type AdminActionInvocationListResponse = {
  data: AdminActionInvocationItem[];
  page: PageInfo;
};

export type AdminActionInvokeRequest = {
  confirmation_phrase?: string | null;
  input?: unknown;
};

export type AdminActionInvokeResponse = {
  data: unknown;
  invocation: AdminActionInvocationDto;
};

export type AdminRemoteProxyCallItem = {
  capability?: string | null;
  correlation_id: string;
  declared_path: string;
  duration_ms: number;
  error_code?: string | null;
  error_details: unknown;
  id: string;
  method: string;
  module_name: string;
  occurred_at: string;
  path_params: unknown;
  remote_path: string;
  remote_status?: number | null;
  request_id: string;
  retryable: boolean;
  span_id?: string | null;
  success: boolean;
  trace_id?: string | null;
};

export type AdminRemoteProxyCallListResponse = {
  data: AdminRemoteProxyCallItem[];
  page: PageInfo;
};

export type AdminRuntimeExecutionLog = {
  attributes: unknown;
  body: string;
  correlation_id: string;
  execution_name: string;
  id: string;
  node_id: string;
  node_type: string;
  occurred_at: string;
  redacted_fields: string[];
  service_name: string;
  severity: string;
  span_id?: string | null;
  story_id: string;
  trace_id?: string | null;
};

export type AdminRuntimeExecutionLogListResponse = {
  data: AdminRuntimeExecutionLog[];
  order: string;
  page: PageInfo;
};

export type AdminRuntimeExecutionPayload = {
  input: unknown;
  metadata: unknown;
  node_id: string;
  node_type: string;
  output?: unknown;
  redacted_fields: string[];
};

export type AdminRuntimeExecutionPayloadResponse = {
  data: AdminRuntimeExecutionPayload;
};

export type AdminRuntimeFunctionDeclarationMetadata = {
  input_schema?: string | null;
  module_name: string;
  module_source: ModuleSource;
  name: string;
  queue: string;
  retry_policy?: RuntimeRetryPolicyDeclaration | null;
  version: number;
};

export type AdminRuntimeFunctionRunItem = {
  attempts: number;
  available_at: string;
  completed_at?: string | null;
  correlation_id: string;
  created_at: string;
  function_name: string;
  id: string;
  last_error?: string | null;
  locked_by?: string | null;
  max_attempts: number;
  runtime_declaration?: AdminRuntimeFunctionDeclarationMetadata | null;
  started_at?: string | null;
  status: string;
};

export type AdminFunctionRunDetail = AdminRuntimeFunctionRunItem & {
  actor: unknown;
  input_json: unknown;
};

export type AdminFunctionRunListResponse = {
  data: AdminRuntimeFunctionRunItem[];
  page: PageInfo;
};

export type AdminRuntimeOutboxItem = {
  attempts: number;
  available_at: string;
  correlation_id: string;
  created_at: string;
  event_name: string;
  id: string;
  last_error?: string | null;
  locked_by?: string | null;
  max_attempts: number;
  published_at?: string | null;
  status: string;
};

export type AdminOutboxEventDetail = AdminRuntimeOutboxItem & {
  actor: unknown;
  aggregate_id: string;
  aggregate_type: string;
  causation_id?: string | null;
  event_version: number;
  headers: unknown;
  occurred_at: string;
  payload: unknown;
  source_module: string;
  trace: unknown;
};

export type AdminOutboxListResponse = {
  data: AdminRuntimeOutboxItem[];
  page: PageInfo;
};

export type AdminRuntimeFunctionSummary = {
  completed: number;
  dead: number;
  failed: number;
  oldest_failed_age_seconds?: number | null;
  oldest_pending_age_seconds?: number | null;
  pending: number;
  running: number;
};

export type AdminRuntimeOutboxSummary = {
  dead: number;
  failed: number;
  oldest_failed_age_seconds?: number | null;
  oldest_pending_age_seconds?: number | null;
  pending: number;
  processing: number;
  published: number;
};

export type AdminRuntimeSummaryItem = {
  attempts: number;
  correlation_id?: string | null;
  created_at: string;
  id: string;
  last_error?: string | null;
  max_attempts: number;
  name: string;
  status: string;
  type: string;
};

export type AdminRuntimeSummaryResponse = {
  functions: AdminRuntimeFunctionSummary;
  outbox: AdminRuntimeOutboxSummary;
  recent_activity: AdminRuntimeSummaryItem[];
  recent_failures: AdminRuntimeSummaryItem[];
  status: string;
};

export type AdminRuntimeHeatmapCell = {
  avg_duration_ms?: number | null;
  bucket_end: string;
  bucket_start: string;
  dead_count: number;
  error_count: number;
  max_duration_ms?: number | null;
  node_type: string;
  retry_count: number;
  service: string;
  total_count: number;
};

export type AdminRuntimeHeatmapResponse = {
  bucket_seconds: number;
  data: AdminRuntimeHeatmapCell[];
  order: string;
  page: PageInfo;
};

export type AdminRuntimeStoryEdge = {
  id: string;
  label?: string | null;
  source: string;
  target: string;
  type: string;
};

export type AdminRuntimeStoryListItem = {
  story_kind: string;
  correlation_id: string;
  created_at: string;
  duration: number;
  error_count: number;
  node_count: number;
  pattern: string[];
  root_error?: string | null;
  services: string[];
  status: string;
  title: string;
  updated_at: string;
};

export type AdminFederatedStoryGap = {
  sourceServiceId: string;
  tenantId?: string | null;
  kind: string;
  detectedAt: string;
  lastObservedAt: string;
  detail: string;
  nextAction: string;
};

export type AdminFederatedWorkflowEntity = {
  kind: string;
  id: string;
  nodeId: string;
  instanceId: string;
  parentId?: string | null;
  label: string;
  state: string;
  serviceId: string;
  attempt: number;
  observedAt: string;
};

export type AdminFederatedReliabilityCheck = {
  code: string;
  state: string;
  observed: unknown;
  expected: unknown;
  evidenceReferences: string[];
  issueCode?: string | null;
  nextActions: string[];
};

export type AdminFederatedReliabilityEvidence = {
  sourceServiceId: string;
  observedAt: string;
  status: string;
  report?: {
    protocol: string;
    serviceId: string;
    contractId: string;
    contractVersion: string;
    profile: string;
    overrides: unknown;
    effectiveValues: unknown;
    state: string;
    activeDegradedModes: Array<{
      dependencyId: string;
      mode: string;
      evidenceReferences: string[];
    }>;
    checks: AdminFederatedReliabilityCheck[];
  } | null;
  detail?: string | null;
  nextAction?: string | null;
};

export type AdminFederatedStoryEvidence = {
  protocol: string;
  tenantId?: string | null;
  assembledAt: string;
  gaps: AdminFederatedStoryGap[];
  workflowEntities: AdminFederatedWorkflowEntity[];
  reliability: AdminFederatedReliabilityEvidence[];
};

export type AdminRuntimeStoryNode = {
  display_name: string;
  duration_ms: number;
  error?: string | null;
  id: string;
  metadata: unknown;
  name: string;
  service: string;
  status: string;
  timestamp: string;
  type: string;
};

export type AdminRuntimeTimelineItem = {
  attempts: number;
  completed_at?: string | null;
  correlation_id: string;
  created_at: string;
  id: string;
  last_error?: string | null;
  max_attempts: number;
  name: string;
  related_node_id?: string | null;
  started_at?: string | null;
  status: string;
  type: string;
};

export type AdminRuntimeStoryDetail = {
  edges: AdminRuntimeStoryEdge[];
  federation?: AdminFederatedStoryEvidence | null;
  nodes: AdminRuntimeStoryNode[];
  summary: AdminRuntimeStoryListItem;
  timeline_items: AdminRuntimeTimelineItem[];
};

export type AdminRuntimeStoryDetailResponse = {
  data: AdminRuntimeStoryDetail;
};

export type AdminRuntimeStoryListResponse = {
  data: AdminRuntimeStoryListItem[];
  order: string;
  page: PageInfo;
};

export type AdminRuntimeTechnicalOperation = {
  attributes: unknown;
  category: string;
  correlation_id: string;
  duration_ms: number;
  ended_at: string;
  id: string;
  name: string;
  related_node_id?: string | null;
  source: string;
  started_at: string;
  status: string;
  story_id: string;
};

export type AdminRuntimeTechnicalOperationListResponse = {
  data: AdminRuntimeTechnicalOperation[];
  order: string;
};

export type ConfigAuditDto = {
  actor?: string | null;
  changed_at: string;
  key: string;
  new_value: unknown;
  old_value?: unknown;
  service: string;
};

export type ConfigAuditListResponse = {
  data: ConfigAuditDto[];
};

export type ConfigVisibilityConditionDto = {
  kind: "equals";
  service: string;
  key: string;
  value: unknown;
};

export type ConfigDescriptorDto = {
  default: unknown;
  description: string;
  editable: boolean;
  group?: string | null;
  key: string;
  order: number;
  restart_only: boolean;
  section?: string | null;
  service: string;
  value_type: unknown;
  visible_when?: ConfigVisibilityConditionDto | null;
};

export type ConfigGroupDto = {
  description: string;
  id: string;
  label: string;
  order: number;
};

export type ConfigDescriptorListResponse = {
  groups: ConfigGroupDto[];
  data: ConfigDescriptorDto[];
};

export type ConfigValueDto = {
  desired_value: unknown;
  effective_value: unknown;
  key: string;
  pending_restart: boolean;
  source: string;
  value: unknown;
};

export type ConfigValueListResponse = {
  data: ConfigValueDto[];
};

export type ConfigWriteResponse = {
  applies_on_restart: boolean;
  key: string;
  service: string;
  updated_at: string;
  updated_by?: string | null;
  value: unknown;
};

export type AdminServiceRestartResponse = {
  requires_supervisor: boolean;
  service: string;
  status: string;
};
