#[allow(clippy::wildcard_imports)]
use super::*;
use crate::federation::{
    FederatedRuntimeStory, FederatedStoryLogCoverage, FederatedStoryLogCoverageStatus,
    FederatedStorySegment, FederatedStoryTechnicalEvidenceKind,
};
use platform_core::ExecutionLogQuery as ProviderExecutionLogQuery;

enum StoryExecutionNode {
    Local {
        node: StoryWorkRow,
        story_rows: Vec<StoryWorkRow>,
    },
    Federated {
        story: FederatedRuntimeStory,
        segment_index: usize,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LocalPayloadSource {
    Outbox,
    FunctionRun,
    ProviderCall,
    CapturedStoryEvent,
}

#[utoipa::path(
    get,
    path = "/api/console/v1/stories/{correlation_id}/executions/{node_id}/payload",
    operation_id = "admin_runtime_get_story_execution_payload",
    tag = "admin-runtime",
    params(
        ("correlation_id" = String, Path, description = "Correlation identifier shared by related runtime work"),
        ("node_id" = String, Path, description = "Runtime execution node identifier within the Story"),
        ("authorization" = String, Header, description = "Development service bearer token, for example `Bearer dev-service:admin`"),
        ("x-request-id" = Option<String>, Header, description = "Optional caller-provided request identifier"),
        ("x-correlation-id" = Option<String>, Header, description = "Optional caller-provided correlation identifier")
    ),
    responses(
        (
            status = 200,
            description = "Recursively redacted payload captured for the Story execution node",
            body = AdminRuntimeExecutionPayloadResponse,
            content_type = "application/json"
        ),
        (status = 401, description = "Authentication is required", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, description = "Runtime Story read access is required", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, description = "The execution node does not belong to the Story", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, description = "Internal server error", body = ErrorResponse, content_type = "application/problem+json")
    )
)]
pub(super) async fn get_story_execution_payload(
    actor: AuthenticatedActor,
    State(ctx): State<AppContext>,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path((correlation_id, node_id)): Path<(String, String)>,
) -> Result<Json<AdminRuntimeExecutionPayloadResponse>, ApiErrorResponse> {
    ensure_story_read_capability(&actor, &ctx, &request_ctx).await?;
    let node = resolve_story_execution_node(
        &ctx,
        &request_ctx,
        correlation_id.as_str(),
        node_id.as_str(),
    )
    .await?;
    let data = execution_payload(&ctx, &request_ctx, node).await?;
    Ok(Json(AdminRuntimeExecutionPayloadResponse { data }))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/stories/{correlation_id}/executions/{node_id}/logs",
    operation_id = "admin_runtime_get_story_execution_logs",
    tag = "admin-runtime",
    params(
        ("correlation_id" = String, Path, description = "Correlation identifier shared by related runtime work"),
        ("node_id" = String, Path, description = "Runtime execution node identifier within the Story"),
        ("authorization" = String, Header, description = "Development service bearer token, for example `Bearer dev-service:admin`"),
        ("x-request-id" = Option<String>, Header, description = "Optional caller-provided request identifier"),
        ("x-correlation-id" = Option<String>, Header, description = "Optional caller-provided correlation identifier"),
        ExecutionLogQuery
    ),
    responses(
        (
            status = 200,
            description = "Structured, recursively redacted logs for the Story execution node",
            body = AdminRuntimeExecutionLogListResponse,
            content_type = "application/json"
        ),
        (status = 401, description = "Authentication is required", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, description = "Runtime Story read access is required", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, description = "The execution node does not belong to the Story", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, description = "Internal server error", body = ErrorResponse, content_type = "application/problem+json")
    )
)]
pub(super) async fn get_story_execution_logs(
    actor: AuthenticatedActor,
    State(ctx): State<AppContext>,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path((correlation_id, node_id)): Path<(String, String)>,
    Query(query): Query<ExecutionLogQuery>,
) -> Result<Json<AdminRuntimeExecutionLogListResponse>, ApiErrorResponse> {
    ensure_story_read_capability(&actor, &ctx, &request_ctx).await?;
    let node = resolve_story_execution_node(
        &ctx,
        &request_ctx,
        correlation_id.as_str(),
        node_id.as_str(),
    )
    .await?;
    let limit = normalized_limit(query.limit);
    let read = execution_logs(&ctx, &request_ctx, node, None, limit).await?;
    Ok(Json(AdminRuntimeExecutionLogListResponse {
        // The provider exposes only a timestamp cursor, which cannot page safely
        // across logs that share an occurrence time. Keep this bounded view honest.
        page: page_info(limit, None),
        coverage: read.coverage,
        data: read.data,
        order: "occurred_at_asc",
    }))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/stories/{correlation_id}/executions/{node_id}/technical-operations",
    operation_id = "admin_runtime_get_story_execution_technical_operations",
    tag = "admin-runtime",
    params(
        ("correlation_id" = String, Path, description = "Correlation identifier shared by related runtime work"),
        ("node_id" = String, Path, description = "Runtime execution node identifier within the Story"),
        ("authorization" = String, Header, description = "Development service bearer token, for example `Bearer dev-service:admin`"),
        ("x-request-id" = Option<String>, Header, description = "Optional caller-provided request identifier"),
        ("x-correlation-id" = Option<String>, Header, description = "Optional caller-provided correlation identifier")
    ),
    responses(
        (
            status = 200,
            description = "Technical operations linked to the Story execution node",
            body = AdminRuntimeTechnicalOperationListResponse,
            content_type = "application/json"
        ),
        (status = 401, description = "Authentication is required", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, description = "Runtime Story read access is required", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, description = "The execution node does not belong to the Story", body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, description = "Internal server error", body = ErrorResponse, content_type = "application/problem+json")
    )
)]
pub(super) async fn get_story_execution_technical_operations(
    actor: AuthenticatedActor,
    State(ctx): State<AppContext>,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path((correlation_id, node_id)): Path<(String, String)>,
) -> Result<Json<AdminRuntimeTechnicalOperationListResponse>, ApiErrorResponse> {
    ensure_story_read_capability(&actor, &ctx, &request_ctx).await?;
    let node = resolve_story_execution_node(
        &ctx,
        &request_ctx,
        correlation_id.as_str(),
        node_id.as_str(),
    )
    .await?;
    let mut data = execution_technical_operations(&ctx, &request_ctx, node).await?;
    for operation in &mut data {
        operation.attributes = redacted_json_value(operation.attributes.clone(), "attributes");
    }
    sort_technical_operations(&mut data);
    Ok(Json(AdminRuntimeTechnicalOperationListResponse {
        data,
        order: "started_at_asc",
    }))
}

async fn resolve_story_execution_node(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    correlation_id: &str,
    node_id: &str,
) -> Result<StoryExecutionNode, ApiErrorResponse> {
    let story_rows =
        fetch_story_rows(ctx, request_ctx, Some(correlation_id), None, MAX_LIMIT).await?;
    if let Some(node) = story_rows.iter().find(|row| row.id == node_id).cloned() {
        return Ok(StoryExecutionNode::Local { node, story_rows });
    }
    if !story_rows.is_empty() {
        return Err(execution_node_not_found(
            request_ctx,
            correlation_id,
            node_id,
        ));
    }

    let story = fetch_federated_story(ctx, request_ctx, correlation_id).await?;
    let Some(segment_index) = story
        .segments
        .iter()
        .position(|segment| segment.id == node_id)
    else {
        return Err(execution_node_not_found(
            request_ctx,
            correlation_id,
            node_id,
        ));
    };
    Ok(StoryExecutionNode::Federated {
        story,
        segment_index,
    })
}

async fn execution_payload(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    node: StoryExecutionNode,
) -> Result<AdminRuntimeExecutionPayload, ApiErrorResponse> {
    match node {
        StoryExecutionNode::Local { node, .. } => {
            local_execution_payload(ctx, request_ctx, &node).await
        }
        StoryExecutionNode::Federated {
            story,
            segment_index,
        } => Ok(federated_execution_payload(&story.segments[segment_index])),
    }
}

async fn local_execution_payload(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    node: &StoryWorkRow,
) -> Result<AdminRuntimeExecutionPayload, ApiErrorResponse> {
    let (input, output, metadata) = match local_payload_source(node) {
        LocalPayloadSource::Outbox => outbox_payload_parts(ctx, request_ctx, node).await?,
        LocalPayloadSource::FunctionRun => function_payload_parts(ctx, request_ctx, node).await?,
        LocalPayloadSource::ProviderCall => provider_payload_parts(ctx, request_ctx, node).await?,
        LocalPayloadSource::CapturedStoryEvent => {
            (node.metadata.clone(), None, runtime_node_metadata(node))
        }
    };
    Ok(redacted_execution_payload(
        node.id.clone(),
        node.item_type.clone(),
        input,
        output,
        metadata,
    ))
}

fn local_payload_source(node: &StoryWorkRow) -> LocalPayloadSource {
    if node.item_type == "provider_call" {
        return LocalPayloadSource::ProviderCall;
    }
    match node.source_type.as_str() {
        "outbox" => LocalPayloadSource::Outbox,
        "function_run" => LocalPayloadSource::FunctionRun,
        _ => LocalPayloadSource::CapturedStoryEvent,
    }
}

async fn outbox_payload_parts(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    node: &StoryWorkRow,
) -> Result<(Value, Option<Value>, Value), ApiErrorResponse> {
    let row = sqlx::query(
        r#"
        select
            payload,
            jsonb_build_object(
                'event_name', event_name,
                'event_version', event_version,
                'source_module', source_module,
                'aggregate_type', aggregate_type,
                'aggregate_id', aggregate_id,
                'status', status,
                'attempts', attempts,
                'max_attempts', max_attempts,
                'available_at', available_at,
                'locked_by', locked_by,
                'published_at', published_at,
                'last_error', last_error,
                'correlation_id', correlation_id,
                'causation_id', causation_id,
                'occurred_at', occurred_at,
                'created_at', created_at,
                'actor', coalesce(headers -> 'actor', '{}'::jsonb),
                'trace', coalesce(headers -> 'trace', '{}'::jsonb),
                'headers', headers
            ) as metadata
        from platform.outbox
        where id = $1 and correlation_id = $2
        "#,
    )
    .bind(&node.id)
    .bind(&node.correlation_id)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|source| query_error(source, request_ctx))?
    .ok_or_else(|| execution_node_not_found(request_ctx, &node.correlation_id, &node.id))?;

    let input = row
        .try_get("payload")
        .map_err(|source| query_error(source, request_ctx))?;
    let metadata = row
        .try_get("metadata")
        .map_err(|source| query_error(source, request_ctx))?;
    Ok((input, None, metadata))
}

async fn function_payload_parts(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    node: &StoryWorkRow,
) -> Result<(Value, Option<Value>, Value), ApiErrorResponse> {
    let row = sqlx::query(
        r#"
        select
            input_json,
            jsonb_build_object(
                'function_name', function_name,
                'status', status,
                'attempts', attempts,
                'max_attempts', max_attempts,
                'available_at', available_at,
                'locked_by', locked_by,
                'started_at', started_at,
                'completed_at', completed_at,
                'last_error', last_error,
                'correlation_id', correlation_id,
                'created_at', created_at,
                'actor', actor
            ) as metadata
        from runtime.function_runs
        where id = $1 and correlation_id = $2
        "#,
    )
    .bind(&node.id)
    .bind(&node.correlation_id)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|source| query_error(source, request_ctx))?
    .ok_or_else(|| execution_node_not_found(request_ctx, &node.correlation_id, &node.id))?;

    let input = row
        .try_get("input_json")
        .map_err(|source| query_error(source, request_ctx))?;
    let metadata = row
        .try_get("metadata")
        .map_err(|source| query_error(source, request_ctx))?;
    Ok((input, None, metadata))
}

async fn provider_payload_parts(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    node: &StoryWorkRow,
) -> Result<(Value, Option<Value>, Value), ApiErrorResponse> {
    let provider_call_id = node
        .metadata
        .get("provider_call_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| node.id.strip_prefix("provider_").map(str::to_owned))
        .ok_or_else(|| execution_node_not_found(request_ctx, &node.correlation_id, &node.id))?;
    let row = sqlx::query(
        r#"
        select
            path_params,
            error_details,
            jsonb_build_object(
                'provider_call_id', id,
                'module_name', module_name,
                'method', method,
                'declared_path', declared_path,
                'provider_path', provider_path,
                'capability', capability,
                'provider_status', provider_status,
                'duration_ms', duration_ms,
                'success', success,
                'error_code', error_code,
                'retryable', retryable,
                'request_id', request_id,
                'correlation_id', correlation_id,
                'trace_id', trace_id,
                'span_id', span_id,
                'occurred_at', occurred_at
            ) as metadata
        from platform.provider_http_calls
        where id = $1 and correlation_id = $2
        "#,
    )
    .bind(provider_call_id)
    .bind(&node.correlation_id)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|source| query_error(source, request_ctx))?
    .ok_or_else(|| execution_node_not_found(request_ctx, &node.correlation_id, &node.id))?;

    let input = row
        .try_get("path_params")
        .map_err(|source| query_error(source, request_ctx))?;
    let output = row
        .try_get("error_details")
        .map_err(|source| query_error(source, request_ctx))?;
    let metadata = row
        .try_get("metadata")
        .map_err(|source| query_error(source, request_ctx))?;
    Ok((input, Some(output), metadata))
}

fn runtime_node_metadata(node: &StoryWorkRow) -> Value {
    serde_json::json!({
        "name": node.name,
        "status": node.status,
        "attempts": node.attempts,
        "max_attempts": node.max_attempts,
        "service": node.service,
        "correlation_id": node.correlation_id,
        "causation_id": node.causation_id,
        "created_at": node.created_at,
        "started_at": node.started_at,
        "completed_at": node.completed_at,
        "last_error": node.last_error,
    })
}

fn federated_execution_payload(segment: &FederatedStorySegment) -> AdminRuntimeExecutionPayload {
    redacted_execution_payload(
        segment.id.clone(),
        federated_node_type(segment).to_owned(),
        serde_json::to_value(&segment.segment).unwrap_or(Value::Null),
        None,
        serde_json::json!({
            "technical_evidence": segment.technical_evidence,
        }),
    )
}

fn redacted_execution_payload(
    node_id: String,
    node_type: String,
    input: Value,
    output: Option<Value>,
    metadata: Value,
) -> AdminRuntimeExecutionPayload {
    let mut redacted_fields = Vec::new();
    let input = redact_json_value(input, "input", &mut redacted_fields);
    let output = output.map(|value| redact_json_value(value, "output", &mut redacted_fields));
    let metadata = redact_json_value(metadata, "metadata", &mut redacted_fields);
    redacted_fields.sort();
    redacted_fields.dedup();
    AdminRuntimeExecutionPayload {
        node_id,
        node_type,
        input,
        output,
        metadata,
        redacted_fields,
    }
}

struct ExecutionLogRead {
    data: Vec<AdminRuntimeExecutionLog>,
    coverage: AdminRuntimeExecutionLogCoverage,
}

async fn execution_logs(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    node: StoryExecutionNode,
    occurred_before: Option<DateTime<Utc>>,
    limit: i64,
) -> Result<ExecutionLogRead, ApiErrorResponse> {
    match node {
        StoryExecutionNode::Local { node, .. } => {
            let service_name = node.service.clone();
            let execution_id = node.id.clone();
            let correlation_id = node.correlation_id.clone();
            let logs = ctx
                .execution_logs
                .query_execution_logs(ProviderExecutionLogQuery {
                    execution_id: execution_id.clone(),
                    occurred_before,
                    limit,
                })
                .await;
            match logs {
                Ok(logs) => {
                    let mut data = logs
                        .into_iter()
                        .filter(|log| log.correlation_id == correlation_id)
                        .map(redacted_execution_log)
                        .collect::<Vec<_>>();
                    data.sort_by(|left, right| {
                        left.occurred_at
                            .cmp(&right.occurred_at)
                            .then_with(|| left.id.cmp(&right.id))
                    });
                    Ok(ExecutionLogRead {
                        data,
                        coverage: local_execution_log_coverage(
                            &service_name,
                            AdminRuntimeExecutionLogCoverageStatus::Complete,
                            Vec::new(),
                        ),
                    })
                }
                Err(error) if error.code == ErrorCode::ExternalDependency => {
                    tracing::warn!(
                        error = %error,
                        execution_id,
                        correlation_id,
                        "Execution log source unavailable"
                    );
                    Ok(ExecutionLogRead {
                        data: Vec::new(),
                        coverage: local_execution_log_coverage(
                            &service_name,
                            AdminRuntimeExecutionLogCoverageStatus::Unavailable,
                            vec![AdminRuntimeExecutionLogCoverageGap {
                                source_id: "runtime_execution_logs".to_owned(),
                                kind: "source_unavailable".to_owned(),
                                detail: "Runtime execution logs are temporarily unavailable"
                                    .to_owned(),
                                next_action: Some(
                                    "Restore the runtime execution log source.".to_owned(),
                                ),
                            }],
                        ),
                    })
                }
                Err(error) => Err(ApiErrorResponse::with_context(error, request_ctx)),
            }
        }
        StoryExecutionNode::Federated {
            story,
            segment_index,
        } => Ok(ExecutionLogRead {
            data: federated_execution_logs(&story, segment_index, occurred_before, limit),
            coverage: admin_federated_log_coverage(&story.segments[segment_index].log_coverage),
        }),
    }
}

fn local_execution_log_coverage(
    service_name: &str,
    status: AdminRuntimeExecutionLogCoverageStatus,
    gaps: Vec<AdminRuntimeExecutionLogCoverageGap>,
) -> AdminRuntimeExecutionLogCoverage {
    AdminRuntimeExecutionLogCoverage {
        status,
        sources: vec![AdminRuntimeExecutionLogCoverageSource {
            source_id: "runtime_execution_logs".to_owned(),
            service_name: service_name.to_owned(),
            status,
        }],
        gaps,
    }
}

fn admin_federated_log_coverage(
    coverage: &FederatedStoryLogCoverage,
) -> AdminRuntimeExecutionLogCoverage {
    AdminRuntimeExecutionLogCoverage {
        status: admin_log_coverage_status(coverage.status),
        sources: coverage
            .sources
            .iter()
            .map(|source| AdminRuntimeExecutionLogCoverageSource {
                source_id: source.source_id.clone(),
                service_name: source.service_name.clone(),
                status: admin_log_coverage_status(source.status),
            })
            .collect(),
        gaps: coverage
            .gaps
            .iter()
            .map(|gap| AdminRuntimeExecutionLogCoverageGap {
                source_id: gap.source_id.clone(),
                kind: gap.kind.clone(),
                detail: gap.detail.clone(),
                next_action: gap.next_action.clone(),
            })
            .collect(),
    }
}

const fn admin_log_coverage_status(
    status: FederatedStoryLogCoverageStatus,
) -> AdminRuntimeExecutionLogCoverageStatus {
    match status {
        FederatedStoryLogCoverageStatus::Complete => {
            AdminRuntimeExecutionLogCoverageStatus::Complete
        }
        FederatedStoryLogCoverageStatus::Disabled => {
            AdminRuntimeExecutionLogCoverageStatus::Disabled
        }
        FederatedStoryLogCoverageStatus::Partial => AdminRuntimeExecutionLogCoverageStatus::Partial,
        FederatedStoryLogCoverageStatus::Unavailable => {
            AdminRuntimeExecutionLogCoverageStatus::Unavailable
        }
    }
}

fn redacted_execution_log(log: ExecutionLogRow) -> AdminRuntimeExecutionLog {
    let mut redacted_fields = log.redacted_fields;
    let attributes = redact_json_value(log.attributes, "attributes", &mut redacted_fields);
    redacted_fields.sort();
    redacted_fields.dedup();
    AdminRuntimeExecutionLog {
        id: log.id,
        node_id: log.execution_id,
        node_type: log.execution_type,
        correlation_id: log.correlation_id,
        story_id: log.story_id,
        execution_name: log.execution_name,
        occurred_at: log.occurred_at,
        severity: log.severity,
        body: log.body,
        attributes,
        service_name: log.service_name,
        trace_id: log.trace_id,
        span_id: log.span_id,
        redacted_fields,
    }
}

fn federated_execution_logs(
    story: &FederatedRuntimeStory,
    segment_index: usize,
    occurred_before: Option<DateTime<Utc>>,
    limit: i64,
) -> Vec<AdminRuntimeExecutionLog> {
    let segment = &story.segments[segment_index];
    let mut logs = segment
        .technical_evidence
        .iter()
        .filter(|evidence| evidence.kind == FederatedStoryTechnicalEvidenceKind::Log)
        .filter_map(|evidence| {
            let occurred_at = evidence
                .attributes
                .get("occurredAt")
                .or_else(|| evidence.attributes.get("occurred_at"))
                .and_then(Value::as_str)
                .and_then(|value| value.parse::<DateTime<Utc>>().ok())
                .unwrap_or(segment.segment.recorded_at);
            occurred_before
                .is_none_or(|before| occurred_at < before)
                .then(|| {
                    let row = ExecutionLogRow {
                        id: evidence.id.clone(),
                        correlation_id: story.story_id.clone(),
                        story_id: story.story_id.clone(),
                        execution_id: segment.id.clone(),
                        execution_type: federated_node_type(segment).to_owned(),
                        execution_name: segment.segment.operation.operation_id.clone(),
                        occurred_at,
                        severity: evidence
                            .attributes
                            .get("severity")
                            .and_then(Value::as_str)
                            .unwrap_or("info")
                            .to_owned(),
                        body: evidence
                            .attributes
                            .get("body")
                            .or_else(|| evidence.attributes.get("message"))
                            .and_then(Value::as_str)
                            .unwrap_or("Federated Story log")
                            .to_owned(),
                        attributes: evidence.attributes.clone(),
                        trace_id: evidence
                            .attributes
                            .get("trace_id")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        span_id: evidence
                            .attributes
                            .get("span_id")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        service_name: segment.segment.source.service_id.clone(),
                        redacted_fields: Vec::new(),
                    };
                    redacted_execution_log(row)
                })
        })
        .collect::<Vec<_>>();
    logs.sort_by(|left, right| {
        left.occurred_at
            .cmp(&right.occurred_at)
            .then_with(|| left.id.cmp(&right.id))
    });
    let limit = usize::try_from(limit).unwrap_or(usize::MAX);
    if logs.len() > limit {
        logs = logs.split_off(logs.len() - limit);
    }
    logs
}

async fn execution_technical_operations(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    node: StoryExecutionNode,
) -> Result<Vec<AdminRuntimeTechnicalOperation>, ApiErrorResponse> {
    match node {
        StoryExecutionNode::Local { node, story_rows } => {
            let span_query = match node.source_type.as_str() {
                "function_run" => TelemetrySpanQuery::by_function_run_id(&node.id),
                "outbox" => TelemetrySpanQuery::by_outbox_event_id(&node.id),
                _ => TelemetrySpanQuery::by_correlation_id(&node.correlation_id),
            };
            let spans = ctx
                .telemetry_spans
                .query_spans(span_query)
                .await
                .map_err(|source| ApiErrorResponse::with_context(source, request_ctx))?;
            let node_index = runtime_node_index(&story_rows);
            let mut data = technical_operations_from_spans(spans.clone(), &node_index);
            data.extend(
                provider_technical_operations(
                    ctx,
                    request_ctx,
                    &node.correlation_id,
                    &spans,
                    &node_index,
                )
                .await?,
            );
            data.extend(
                remote_runtime_technical_operations_by_execution(
                    ctx,
                    request_ctx,
                    &node.id,
                    &node.correlation_id,
                    &node_index,
                )
                .await?,
            );
            data.retain(|operation| operation.related_node_id.as_deref() == Some(node.id.as_str()));
            Ok(data)
        }
        StoryExecutionNode::Federated {
            story,
            segment_index,
        } => {
            let node_id = story.segments[segment_index].id.as_str();
            Ok(federated_technical_operations(&story)
                .into_iter()
                .filter(|operation| operation.related_node_id.as_deref() == Some(node_id))
                .collect())
        }
    }
}

pub(super) fn redact_json_value(
    value: Value,
    path: &str,
    redacted_fields: &mut Vec<String>,
) -> Value {
    match value {
        Value::Array(items) => Value::Array(
            items
                .into_iter()
                .enumerate()
                .map(|(index, item)| {
                    redact_json_value(item, &format!("{path}[{index}]"), redacted_fields)
                })
                .collect(),
        ),
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, value)| {
                    let field_path = format!("{path}.{key}");
                    if is_sensitive_json_key(&key) {
                        redacted_fields.push(field_path);
                        (key, Value::String("[redacted]".to_owned()))
                    } else {
                        (key, redact_json_value(value, &field_path, redacted_fields))
                    }
                })
                .collect(),
        ),
        value => value,
    }
}

pub(super) fn redacted_json_value(value: Value, path: &str) -> Value {
    redact_json_value(value, path, &mut Vec::new())
}

fn is_sensitive_json_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    [
        "authorization",
        "cookie",
        "password",
        "passwd",
        "secret",
        "token",
        "api_key",
        "apikey",
        "access_key",
        "credential",
        "email",
    ]
    .iter()
    .any(|unsafe_part| lower.contains(unsafe_part))
}

fn execution_node_not_found(
    request_ctx: &RequestContext,
    correlation_id: &str,
    node_id: &str,
) -> ApiErrorResponse {
    ApiErrorResponse::with_context(
        AppError::new(
            ErrorCode::NotFound,
            format!("Runtime execution node {node_id} was not found in Story {correlation_id}"),
        ),
        request_ctx,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recursive_redaction_tracks_nested_object_and_array_paths() {
        let mut fields = Vec::new();
        let value = redact_json_value(
            serde_json::json!({
                "safe": true,
                "profile": {
                    "auth_material": [{
                        "access_token": "secret",
                        "label": "visible"
                    }]
                }
            }),
            "input",
            &mut fields,
        );

        assert_eq!(
            value["profile"]["auth_material"][0]["access_token"],
            "[redacted]"
        );
        assert_eq!(value["profile"]["auth_material"][0]["label"], "visible");
        assert_eq!(fields, vec!["input.profile.auth_material[0].access_token"]);
    }

    #[test]
    fn credential_containers_are_redacted_as_a_whole() {
        let mut fields = Vec::new();
        let value = redact_json_value(
            serde_json::json!({
                "credentials": {
                    "value": "secret",
                    "safe": true
                }
            }),
            "input",
            &mut fields,
        );

        assert_eq!(value["credentials"], "[redacted]");
        assert_eq!(fields, vec!["input.credentials"]);
    }

    #[test]
    fn story_event_node_type_does_not_impersonate_runtime_source_table() {
        let timestamp = "2026-08-12T00:00:00Z"
            .parse::<DateTime<Utc>>()
            .expect("test timestamp should parse");
        let node = StoryWorkRow {
            item_type: "function".to_owned(),
            source_type: "story_event".to_owned(),
            id: "story_function_projection".to_owned(),
            name: "projected.function".to_owned(),
            status: "completed".to_owned(),
            attempts: 0,
            max_attempts: 1,
            correlation_id: "corr_story".to_owned(),
            causation_id: None,
            service: "runtime".to_owned(),
            created_at: timestamp,
            started_at: Some(timestamp),
            completed_at: Some(timestamp),
            last_error: None,
            metadata: serde_json::json!({"captured": true}),
        };

        assert_eq!(
            local_payload_source(&node),
            LocalPayloadSource::CapturedStoryEvent
        );
    }
}
