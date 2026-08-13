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
enum ExecutionEvidenceSource {
    Outbox,
    FunctionRun,
    ProviderCall,
    CapturedStoryEvent,
    Federated,
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
    let source = execution_evidence_source(node);
    let (input, output, metadata) = match source {
        ExecutionEvidenceSource::Outbox => outbox_payload_parts(ctx, request_ctx, node).await?,
        ExecutionEvidenceSource::FunctionRun => {
            function_payload_parts(ctx, request_ctx, node).await?
        }
        ExecutionEvidenceSource::ProviderCall => {
            provider_payload_parts(ctx, request_ctx, node).await?
        }
        ExecutionEvidenceSource::CapturedStoryEvent => {
            (node.metadata.clone(), None, runtime_node_metadata(node))
        }
        ExecutionEvidenceSource::Federated => unreachable!("local evidence cannot be federated"),
    };
    Ok(redacted_execution_payload(
        source,
        node.id.clone(),
        node.item_type.clone(),
        input,
        output,
        metadata,
    ))
}

fn execution_evidence_source(node: &StoryWorkRow) -> ExecutionEvidenceSource {
    if node.item_type == "provider_call" {
        return ExecutionEvidenceSource::ProviderCall;
    }
    match node.source_type.as_str() {
        "outbox" => ExecutionEvidenceSource::Outbox,
        "function_run" => ExecutionEvidenceSource::FunctionRun,
        _ => ExecutionEvidenceSource::CapturedStoryEvent,
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
            provider_call.path_params,
            provider_call.error_details,
            to_jsonb(provider_call) -> 'request_body' as request_body,
            to_jsonb(provider_call) -> 'response_body' as response_body,
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
                'occurred_at', occurred_at,
                'request_body_capture', jsonb_build_object(
                    'status', to_jsonb(provider_call) ->> 'request_body_capture_status',
                    'reason', to_jsonb(provider_call) ->> 'request_body_capture_reason',
                    'observed_bytes', to_jsonb(provider_call) -> 'request_body_observed_bytes'
                ),
                'response_body_capture', jsonb_build_object(
                    'status', to_jsonb(provider_call) ->> 'response_body_capture_status',
                    'reason', to_jsonb(provider_call) ->> 'response_body_capture_reason',
                    'observed_bytes', to_jsonb(provider_call) -> 'response_body_observed_bytes'
                )
            ) as metadata
        from platform.provider_http_calls provider_call
        where id = $1 and correlation_id = $2
        "#,
    )
    .bind(provider_call_id)
    .bind(&node.correlation_id)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|source| query_error(source, request_ctx))?
    .ok_or_else(|| execution_node_not_found(request_ctx, &node.correlation_id, &node.id))?;

    let path_params: Value = row
        .try_get("path_params")
        .map_err(|source| query_error(source, request_ctx))?;
    let error_details: Value = row
        .try_get("error_details")
        .map_err(|source| query_error(source, request_ctx))?;
    let request_body: Option<Value> = row
        .try_get("request_body")
        .map_err(|source| query_error(source, request_ctx))?;
    let response_body: Option<Value> = row
        .try_get("response_body")
        .map_err(|source| query_error(source, request_ctx))?;
    let metadata = row
        .try_get("metadata")
        .map_err(|source| query_error(source, request_ctx))?;
    Ok((
        serde_json::json!({
            "path_params": path_params,
            "body": request_body,
        }),
        Some(serde_json::json!({
            "body": response_body,
            "error_details": error_details,
        })),
        metadata,
    ))
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
        ExecutionEvidenceSource::Federated,
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
    source: ExecutionEvidenceSource,
    node_id: String,
    node_type: String,
    input: Value,
    output: Option<Value>,
    metadata: Value,
) -> AdminRuntimeExecutionPayload {
    let groups = execution_evidence_groups(source, &node_type, &input, output.as_ref(), &metadata);
    let mut redacted_fields = Vec::new();
    let input = redact_json_value(input, "input", &mut redacted_fields);
    let output = output.map(|value| redact_json_value(value, "output", &mut redacted_fields));
    let metadata = redact_json_value(metadata, "metadata", &mut redacted_fields);
    redacted_fields.sort();
    redacted_fields.dedup();
    AdminRuntimeExecutionPayload {
        node_id,
        node_type,
        groups,
        input,
        output,
        metadata,
        redacted_fields,
    }
}

fn execution_evidence_groups(
    source: ExecutionEvidenceSource,
    node_type: &str,
    input: &Value,
    output: Option<&Value>,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    match source {
        ExecutionEvidenceSource::Outbox => outbox_evidence_groups(input, metadata),
        ExecutionEvidenceSource::FunctionRun => function_evidence_groups(input, output, metadata),
        ExecutionEvidenceSource::ProviderCall => provider_evidence_groups(input, output, metadata),
        ExecutionEvidenceSource::CapturedStoryEvent => {
            captured_evidence_groups(node_type, input, output, metadata)
        }
        ExecutionEvidenceSource::Federated => federated_evidence_groups(node_type, input, metadata),
    }
}

fn outbox_evidence_groups(
    input: &Value,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    let mut event = selected_fields(metadata, &["event_name", "event_version"]);
    event.insert("payload".to_owned(), input.clone());

    vec![
        evidence_group("event", Value::Object(event), true, vec![]),
        evidence_group(
            "envelope",
            selected_value(
                metadata,
                &[
                    "source_module",
                    "aggregate_type",
                    "aggregate_id",
                    "correlation_id",
                    "causation_id",
                    "actor",
                    "trace",
                    "occurred_at",
                    "headers",
                ],
            ),
            false,
            vec![],
        ),
        evidence_group(
            "delivery",
            selected_value(
                metadata,
                &[
                    "status",
                    "attempts",
                    "max_attempts",
                    "available_at",
                    "locked_by",
                    "published_at",
                    "last_error",
                    "created_at",
                ],
            ),
            false,
            vec![],
        ),
    ]
}

fn function_evidence_groups(
    input: &Value,
    output: Option<&Value>,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    let (business_input, runtime_context) = split_function_input(input);
    let mut result = selected_fields(metadata, &["status", "completed_at", "last_error"]);
    let result_gaps = if let Some(output) = output.filter(|value| has_json_value(value)) {
        result.insert("output".to_owned(), output.clone());
        vec![]
    } else {
        vec![evidence_gap(
            "output",
            AdminRuntimeExecutionEvidenceGapStatus::NotCaptured,
            "The function runtime did not persist a return value for this execution.",
        )]
    };
    let mut execution = selected_fields(
        metadata,
        &[
            "function_name",
            "attempts",
            "max_attempts",
            "available_at",
            "locked_by",
            "started_at",
            "created_at",
            "correlation_id",
            "actor",
            "name",
            "service",
            "causation_id",
        ],
    );
    if let Some(runtime_context) = runtime_context {
        execution.insert("runtime_context".to_owned(), runtime_context);
    }

    vec![
        evidence_group("input", business_input, true, vec![]),
        evidence_group("result", Value::Object(result), true, result_gaps),
        evidence_group("execution", Value::Object(execution), false, vec![]),
    ]
}

fn provider_evidence_groups(
    input: &Value,
    output: Option<&Value>,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    let method = metadata
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_uppercase();
    let mut request = selected_fields(metadata, &["method", "declared_path", "provider_path"]);
    request.insert(
        "path_params".to_owned(),
        input
            .get("path_params")
            .cloned()
            .unwrap_or_else(|| input.clone()),
    );
    let request_capture = metadata.get("request_body_capture");
    if let Some(capture) = request_capture {
        request.insert("capture".to_owned(), capture.clone());
    }
    let request_gaps = body_evidence_gaps(request_capture, "request", Some(&method));
    if request_gaps.is_empty()
        && let Some(body) = input.get("body")
    {
        request.insert("body".to_owned(), body.clone());
    }

    let mut response = selected_fields(
        metadata,
        &["provider_status", "success", "error_code", "retryable"],
    );
    if let Some(error_details) = output
        .and_then(|value| value.get("error_details"))
        .filter(|value| has_json_value(value))
    {
        response.insert("error_details".to_owned(), error_details.clone());
    } else if let Some(output) = output.filter(|value| has_json_value(value))
        && output.get("body").is_none()
    {
        response.insert("error_details".to_owned(), output.clone());
    }
    let response_capture = metadata.get("response_body_capture");
    if let Some(capture) = response_capture {
        response.insert("capture".to_owned(), capture.clone());
    }
    let response_gaps = body_evidence_gaps(response_capture, "response", None);
    if response_gaps.is_empty()
        && let Some(body) = output.and_then(|value| value.get("body"))
    {
        response.insert("body".to_owned(), body.clone());
    }
    let response_expanded = metadata
        .get("success")
        .and_then(Value::as_bool)
        .is_some_and(|success| !success);

    vec![
        evidence_group("request", Value::Object(request), true, request_gaps),
        evidence_group(
            "response",
            Value::Object(response),
            response_expanded,
            response_gaps,
        ),
        evidence_group(
            "call",
            selected_value(
                metadata,
                &[
                    "provider_call_id",
                    "module_name",
                    "capability",
                    "duration_ms",
                    "request_id",
                    "correlation_id",
                    "trace_id",
                    "span_id",
                    "occurred_at",
                ],
            ),
            false,
            vec![],
        ),
    ]
}

fn body_evidence_gaps(
    capture: Option<&Value>,
    side: &str,
    method: Option<&str>,
) -> Vec<AdminRuntimeExecutionEvidenceGap> {
    let status = capture
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str);
    if status == Some("captured") {
        return vec![];
    }

    let reason = capture
        .and_then(|value| value.get("reason"))
        .and_then(Value::as_str);
    let observed_bytes = capture
        .and_then(|value| value.get("observed_bytes"))
        .and_then(Value::as_i64);
    let inferred_not_applicable = side == "request"
        && method.is_some_and(|method| matches!(method, "GET" | "HEAD" | "DELETE"));
    let gap_status =
        if status == Some("not_applicable") || (status.is_none() && inferred_not_applicable) {
            AdminRuntimeExecutionEvidenceGapStatus::NotApplicable
        } else {
            AdminRuntimeExecutionEvidenceGapStatus::NotCaptured
        };
    let detail = match reason {
        Some("method_without_body") => {
            "This HTTP method does not have a JSON request body.".to_owned()
        }
        Some("empty_response_body") => {
            "The Provider returned an empty response body for this call.".to_owned()
        }
        Some("evidence_limit_exceeded") => observed_bytes.map_or_else(
            || {
                format!(
                    "The Provider {side} body exceeded the 64 KiB evidence limit; no partial body was persisted."
                )
            },
            |bytes| {
                format!(
                    "The Provider {side} body was {bytes} bytes and exceeded the 64 KiB evidence limit; no partial body was persisted."
                )
            },
        ),
        Some("serialization_failed") => format!(
            "The Provider {side} body could not be serialized into safe JSON evidence."
        ),
        Some("legacy_record") => format!(
            "This Provider call predates body evidence capture, so its {side} body is unavailable."
        ),
        _ if gap_status == AdminRuntimeExecutionEvidenceGapStatus::NotApplicable => {
            format!("This Provider call has no applicable {side} body.")
        }
        _ => format!(
            "The Provider runtime did not persist the {side} body for this call."
        ),
    };

    vec![evidence_gap("body", gap_status, &detail)]
}

fn captured_evidence_groups(
    node_type: &str,
    input: &Value,
    output: Option<&Value>,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    match node_type {
        "function" | "function_run" => function_evidence_groups(input, output, metadata),
        "event" | "outbox_event" => vec![
            evidence_group(
                "event",
                serde_json::json!({ "payload": input }),
                true,
                vec![],
            ),
            evidence_group("context", metadata.clone(), false, vec![]),
        ],
        "http" | "http_request" => captured_http_evidence_groups(input, output, metadata),
        "workflow" => workflow_evidence_groups(input, metadata),
        "compensation" => compensation_evidence_groups(input, metadata),
        "intervention" => intervention_evidence_groups(input, metadata),
        "timer" => timer_evidence_groups(input, metadata),
        _ => generic_evidence_groups(input, output, metadata),
    }
}

fn captured_http_evidence_groups(
    input: &Value,
    output: Option<&Value>,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    let request = input.get("request").unwrap_or(input).clone();
    let mut response = selected_fields(metadata, &["status", "completed_at", "last_error"]);
    let response_gaps = if let Some(output) = output.filter(|value| has_json_value(value)) {
        response.insert("body".to_owned(), output.clone());
        vec![]
    } else {
        vec![evidence_gap(
            "body",
            AdminRuntimeExecutionEvidenceGapStatus::NotCaptured,
            "No response body was attached to this captured Story execution.",
        )]
    };
    vec![
        evidence_group("request", request, true, vec![]),
        evidence_group("response", Value::Object(response), false, response_gaps),
        evidence_group("context", metadata.clone(), false, vec![]),
    ]
}

fn federated_evidence_groups(
    node_type: &str,
    segment: &Value,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    let mut groups = match node_type {
        "http_request" => federated_http_evidence_groups(segment),
        "outbox_event" | "event" => federated_event_evidence_groups(segment),
        "workflow" => workflow_evidence_groups(segment, segment),
        "compensation" => compensation_evidence_groups(segment, segment),
        "intervention" => intervention_evidence_groups(segment, segment),
        "timer" => timer_evidence_groups(segment, segment),
        _ => generic_evidence_groups(segment, None, segment),
    };
    if metadata
        .get("technical_evidence")
        .is_some_and(has_json_value)
    {
        groups.push(evidence_group(
            "technical_evidence",
            metadata
                .get("technical_evidence")
                .cloned()
                .unwrap_or(Value::Null),
            false,
            vec![],
        ));
    }
    groups
}

fn federated_http_evidence_groups(segment: &Value) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    let mut request = selected_fields(segment, &["operation", "contract", "source"]);
    request.extend(selected_fields(
        segment,
        &["parentSegmentId", "causationId"],
    ));
    vec![
        evidence_group(
            "request",
            Value::Object(request),
            true,
            vec![evidence_gap(
                "body",
                AdminRuntimeExecutionEvidenceGapStatus::NotCaptured,
                "The federated Story Segment contains operation evidence, not the HTTP request body.",
            )],
        ),
        evidence_group(
            "response",
            selected_value(segment, &["status", "attempt", "startedAt", "completedAt"]),
            false,
            vec![evidence_gap(
                "body",
                AdminRuntimeExecutionEvidenceGapStatus::NotCaptured,
                "The federated Story Segment does not include the HTTP response body.",
            )],
        ),
        evidence_group("context", federated_context(segment), false, vec![]),
    ]
}

fn federated_event_evidence_groups(segment: &Value) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    vec![
        evidence_group(
            "event",
            selected_value(segment, &["operation", "contract", "status"]),
            true,
            vec![evidence_gap(
                "payload",
                AdminRuntimeExecutionEvidenceGapStatus::NotCaptured,
                "The federated Story Segment records event progress without copying the domain event payload.",
            )],
        ),
        evidence_group(
            "envelope",
            selected_value(
                segment,
                &[
                    "storyId",
                    "segmentId",
                    "source",
                    "tenantId",
                    "parentSegmentId",
                    "causationId",
                ],
            ),
            false,
            vec![],
        ),
        evidence_group(
            "delivery",
            selected_value(
                segment,
                &["attempt", "startedAt", "completedAt", "recordedAt"],
            ),
            false,
            vec![],
        ),
    ]
}

fn workflow_evidence_groups(
    evidence: &Value,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    vec![
        evidence_group(
            "workflow",
            selected_or_value(evidence, &["workflow", "operation", "contract"]),
            true,
            vec![],
        ),
        evidence_group(
            "progress",
            execution_progress(evidence, metadata),
            true,
            vec![],
        ),
        evidence_group("context", merged_context(evidence, metadata), false, vec![]),
    ]
}

fn compensation_evidence_groups(
    evidence: &Value,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    let original_effect = selected_value(
        evidence,
        &[
            "parentSegmentId",
            "causationId",
            "parent_segment_id",
            "causation_id",
        ],
    );
    let original_effect_gaps = if has_json_value(&original_effect) {
        vec![]
    } else {
        vec![evidence_gap(
            "reference",
            AdminRuntimeExecutionEvidenceGapStatus::NotCaptured,
            "The evidence source did not record the original effect reference.",
        )]
    };
    vec![
        evidence_group(
            "original_effect",
            original_effect,
            false,
            original_effect_gaps,
        ),
        evidence_group(
            "compensation",
            selected_or_value(evidence, &["workflow", "operation", "contract"]),
            true,
            vec![],
        ),
        evidence_group(
            "outcome",
            execution_progress(evidence, metadata),
            true,
            vec![],
        ),
        evidence_group("context", merged_context(evidence, metadata), false, vec![]),
    ]
}

fn intervention_evidence_groups(
    evidence: &Value,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    vec![
        evidence_group(
            "intervention",
            selected_or_value(evidence, &["workflow", "operation", "contract"]),
            true,
            vec![],
        ),
        evidence_group(
            "decision",
            execution_progress(evidence, metadata),
            true,
            vec![],
        ),
        evidence_group("context", merged_context(evidence, metadata), false, vec![]),
    ]
}

fn timer_evidence_groups(
    evidence: &Value,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    vec![
        evidence_group(
            "schedule",
            selected_or_value(
                evidence,
                &["workflow", "operation", "contract", "startedAt"],
            ),
            true,
            vec![],
        ),
        evidence_group(
            "firing",
            execution_progress(evidence, metadata),
            true,
            vec![],
        ),
        evidence_group("context", merged_context(evidence, metadata), false, vec![]),
    ]
}

fn generic_evidence_groups(
    input: &Value,
    output: Option<&Value>,
    metadata: &Value,
) -> Vec<AdminRuntimeExecutionEvidenceGroup> {
    let mut groups = vec![evidence_group("evidence", input.clone(), true, vec![])];
    if let Some(output) = output.filter(|value| has_json_value(value)) {
        groups.push(evidence_group("outcome", output.clone(), true, vec![]));
    }
    if has_json_value(metadata) {
        groups.push(evidence_group("context", metadata.clone(), false, vec![]));
    }
    groups
}

fn evidence_group(
    key: &str,
    content: Value,
    default_expanded: bool,
    gaps: Vec<AdminRuntimeExecutionEvidenceGap>,
) -> AdminRuntimeExecutionEvidenceGroup {
    let mut redacted_fields = Vec::new();
    let content = redact_json_value(content, key, &mut redacted_fields);
    redacted_fields.sort();
    redacted_fields.dedup();
    AdminRuntimeExecutionEvidenceGroup {
        key: key.to_owned(),
        content,
        default_expanded,
        redacted_fields,
        gaps,
    }
}

fn evidence_gap(
    field: &str,
    status: AdminRuntimeExecutionEvidenceGapStatus,
    detail: &str,
) -> AdminRuntimeExecutionEvidenceGap {
    AdminRuntimeExecutionEvidenceGap {
        field: field.to_owned(),
        status,
        detail: detail.to_owned(),
    }
}

fn selected_fields(value: &Value, fields: &[&str]) -> serde_json::Map<String, Value> {
    let Some(object) = value.as_object() else {
        return serde_json::Map::new();
    };
    fields
        .iter()
        .filter_map(|field| {
            object
                .get(*field)
                .filter(|value| !value.is_null())
                .map(|value| ((*field).to_owned(), value.clone()))
        })
        .collect()
}

fn selected_value(value: &Value, fields: &[&str]) -> Value {
    Value::Object(selected_fields(value, fields))
}

fn selected_or_value(value: &Value, fields: &[&str]) -> Value {
    let selected = selected_fields(value, fields);
    if selected.is_empty() {
        value.clone()
    } else {
        Value::Object(selected)
    }
}

fn execution_progress(evidence: &Value, metadata: &Value) -> Value {
    let mut progress = selected_fields(
        evidence,
        &[
            "status",
            "attempt",
            "attempts",
            "max_attempts",
            "startedAt",
            "completedAt",
            "recordedAt",
            "started_at",
            "completed_at",
            "created_at",
            "last_error",
        ],
    );
    for (key, value) in selected_fields(
        metadata,
        &[
            "status",
            "attempt",
            "attempts",
            "max_attempts",
            "started_at",
            "completed_at",
            "created_at",
            "last_error",
        ],
    ) {
        progress.entry(key).or_insert(value);
    }
    Value::Object(progress)
}

fn split_function_input(input: &Value) -> (Value, Option<Value>) {
    let Value::Object(input) = input else {
        return (input.clone(), None);
    };
    let mut business_input = input.clone();
    let runtime_context = business_input.remove("_lenso_runtime");
    (Value::Object(business_input), runtime_context)
}

fn federated_context(segment: &Value) -> Value {
    selected_value(
        segment,
        &[
            "storyId",
            "segmentId",
            "evidenceRevision",
            "source",
            "tenantId",
            "parentSegmentId",
            "causationId",
            "recordedAt",
        ],
    )
}

fn merged_context(evidence: &Value, metadata: &Value) -> Value {
    let mut context = selected_fields(
        evidence,
        &[
            "storyId",
            "segmentId",
            "evidenceRevision",
            "source",
            "tenantId",
            "parentSegmentId",
            "causationId",
        ],
    );
    if metadata != evidence {
        context.insert("runtime".to_owned(), metadata.clone());
    }
    Value::Object(context)
}

fn has_json_value(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Array(values) => !values.is_empty(),
        Value::Object(values) => !values.is_empty(),
        _ => true,
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
            execution_evidence_source(&node),
            ExecutionEvidenceSource::CapturedStoryEvent
        );
    }

    #[test]
    fn provider_groups_separate_request_response_and_call_evidence() {
        let payload = redacted_execution_payload(
            ExecutionEvidenceSource::ProviderCall,
            "provider_call_1".to_owned(),
            "provider_call".to_owned(),
            serde_json::json!({
                "path_params": { "ticket_id": "ticket_42" },
                "body": null
            }),
            Some(serde_json::json!({
                "body": {
                    "message": "unavailable",
                    "credentials": { "api_key": "secret" }
                },
                "error_details": []
            })),
            serde_json::json!({
                "method": "GET",
                "declared_path": "/tickets/{ticket_id}",
                "provider_path": "/tickets/ticket_42",
                "provider_status": 503,
                "success": false,
                "module_name": "support/tickets",
                "duration_ms": 50,
                "request_body_capture": {
                    "status": "not_applicable",
                    "reason": "method_without_body",
                    "observed_bytes": null
                },
                "response_body_capture": {
                    "status": "captured",
                    "reason": null,
                    "observed_bytes": 74
                }
            }),
        );

        assert_eq!(
            payload
                .groups
                .iter()
                .map(|group| group.key.as_str())
                .collect::<Vec<_>>(),
            vec!["request", "response", "call"]
        );
        let request = &payload.groups[0];
        assert_eq!(request.content["path_params"]["ticket_id"], "ticket_42");
        assert!(request.redacted_fields.is_empty());
        assert_eq!(
            request.gaps[0].status,
            AdminRuntimeExecutionEvidenceGapStatus::NotApplicable
        );
        assert!(payload.groups[1].default_expanded);
        assert!(payload.groups[1].gaps.is_empty());
        assert_eq!(
            payload.groups[1].content["body"]["credentials"],
            "[redacted]"
        );
        assert_eq!(
            payload.groups[1].redacted_fields,
            vec!["response.body.credentials"]
        );
    }

    #[test]
    fn provider_groups_explain_oversized_body_evidence_without_partial_content() {
        let groups = provider_evidence_groups(
            &serde_json::json!({ "path_params": {}, "body": null }),
            Some(&serde_json::json!({ "body": null, "error_details": [] })),
            &serde_json::json!({
                "method": "POST",
                "request_body_capture": {
                    "status": "not_captured",
                    "reason": "evidence_limit_exceeded",
                    "observed_bytes": 70000
                },
                "response_body_capture": {
                    "status": "not_applicable",
                    "reason": "empty_response_body",
                    "observed_bytes": null
                }
            }),
        );

        assert_eq!(
            groups[0].gaps[0].status,
            AdminRuntimeExecutionEvidenceGapStatus::NotCaptured
        );
        assert!(groups[0].gaps[0].detail.contains("70000 bytes"));
        assert!(groups[0].content.get("body").is_none());
        assert_eq!(
            groups[1].gaps[0].status,
            AdminRuntimeExecutionEvidenceGapStatus::NotApplicable
        );
        assert!(groups[1].content.get("body").is_none());
    }

    #[test]
    fn outbox_groups_preserve_event_envelope_and_delivery_meaning() {
        let groups = outbox_evidence_groups(
            &serde_json::json!({ "user_id": "usr_1" }),
            &serde_json::json!({
                "event_name": "identity.user_registered.v1",
                "event_version": 1,
                "source_module": "identity",
                "correlation_id": "corr_1",
                "status": "published",
                "attempts": 1,
                "published_at": "2026-08-14T00:00:00Z"
            }),
        );

        assert_eq!(
            groups
                .iter()
                .map(|group| group.key.as_str())
                .collect::<Vec<_>>(),
            vec!["event", "envelope", "delivery"]
        );
        assert_eq!(groups[0].content["payload"]["user_id"], "usr_1");
        assert_eq!(groups[1].content["source_module"], "identity");
        assert_eq!(groups[2].content["status"], "published");
    }

    #[test]
    fn function_groups_move_runtime_context_out_of_business_input() {
        let groups = function_evidence_groups(
            &serde_json::json!({
                "recipient_id": "usr_1",
                "_lenso_runtime": { "causation_id": "evt_1" }
            }),
            None,
            &serde_json::json!({
                "function_name": "notifications.send.v1",
                "status": "completed",
                "attempts": 1
            }),
        );

        assert_eq!(
            groups
                .iter()
                .map(|group| group.key.as_str())
                .collect::<Vec<_>>(),
            vec!["input", "result", "execution"]
        );
        assert!(groups[0].content.get("_lenso_runtime").is_none());
        assert_eq!(
            groups[2].content["runtime_context"]["causation_id"],
            "evt_1"
        );
        assert_eq!(
            groups[1].gaps[0].status,
            AdminRuntimeExecutionEvidenceGapStatus::NotCaptured
        );
    }

    #[test]
    fn federated_work_types_receive_distinct_semantic_groups() {
        let segment = serde_json::json!({
            "storyId": "story_1",
            "segmentId": "segment_1",
            "source": { "serviceId": "orders" },
            "operation": { "kind": "durable_workflow", "operationId": "checkout" },
            "contract": { "contractId": "checkout", "version": "1" },
            "workflow": { "instanceId": "workflow_1", "compensationId": "comp_1" },
            "status": "completed",
            "attempt": 1,
            "startedAt": "2026-08-14T00:00:00Z",
            "completedAt": "2026-08-14T00:00:01Z"
        });
        let groups = federated_evidence_groups(
            "compensation",
            &segment,
            &serde_json::json!({ "technical_evidence": [] }),
        );

        assert_eq!(
            groups
                .iter()
                .map(|group| group.key.as_str())
                .collect::<Vec<_>>(),
            vec!["original_effect", "compensation", "outcome", "context"]
        );
        assert_eq!(groups[1].content["workflow"]["compensationId"], "comp_1");
        assert_eq!(groups[2].content["status"], "completed");
    }
}
