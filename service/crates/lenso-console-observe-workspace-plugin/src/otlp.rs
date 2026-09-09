use std::sync::Arc;

use axum::{
    Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use opentelemetry_proto::tonic::{
    collector::{
        logs::v1::{ExportLogsPartialSuccess, ExportLogsServiceRequest, ExportLogsServiceResponse},
        trace::v1::{
            ExportTracePartialSuccess, ExportTraceServiceRequest, ExportTraceServiceResponse,
        },
    },
    common::v1::{AnyValue, KeyValue, any_value},
    trace::v1::{Span, span},
};
use prost::Message as _;

use crate::store::{Attribute, IngestLoss, ObserveStore, StoredLog, StoredSpan};

const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
const MAX_RECORDS: usize = 10_000;
const MAX_ATTRIBUTES: usize = 64;
const MAX_KEY_BYTES: usize = 256;
const MAX_VALUE_BYTES: usize = 4096;
const MAX_NAME_BYTES: usize = 512;
const MAX_LOG_BODY_BYTES: usize = 16 * 1024;

#[derive(Clone, Debug)]
struct ReceiverState {
    source_id: String,
    store: ObserveStore,
    token: Arc<str>,
}

pub(crate) fn router(store: ObserveStore, source_id: String, token: String) -> Router {
    Router::new()
        .route("/v1/traces", post(export_traces))
        .route("/v1/logs", post(export_logs))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .with_state(ReceiverState {
            source_id,
            store,
            token: Arc::from(token),
        })
}

async fn export_traces(
    State(state): State<ReceiverState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if let Some(response) = rejection(&state, &headers) {
        return response;
    }
    let Ok(request) = ExportTraceServiceRequest::decode(body) else {
        state.store.record_decode_failure();
        return problem(
            StatusCode::BAD_REQUEST,
            "invalid_otlp",
            "Invalid OTLP trace payload",
        );
    };
    let (spans, loss) = normalize_spans(request);
    let rejected = loss.rejected;
    if let Err(error) = state.store.ingest_spans(spans, loss).await {
        return overloaded(error);
    }
    protobuf(&ExportTraceServiceResponse {
        partial_success: (rejected > 0).then(|| ExportTracePartialSuccess {
            rejected_spans: i64::try_from(rejected).unwrap_or(i64::MAX),
            error_message: "Observe rejected invalid or excess spans".to_owned(),
        }),
    })
}

async fn export_logs(
    State(state): State<ReceiverState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if let Some(response) = rejection(&state, &headers) {
        return response;
    }
    let Ok(request) = ExportLogsServiceRequest::decode(body) else {
        state.store.record_decode_failure();
        return problem(
            StatusCode::BAD_REQUEST,
            "invalid_otlp",
            "Invalid OTLP log payload",
        );
    };
    let (log_records, ingest_loss) = normalize_logs(request);
    let rejected = ingest_loss.rejected;
    if let Err(error) = state.store.ingest_logs(log_records, ingest_loss).await {
        return overloaded(error);
    }
    protobuf(&ExportLogsServiceResponse {
        partial_success: (rejected > 0).then(|| ExportLogsPartialSuccess {
            rejected_log_records: i64::try_from(rejected).unwrap_or(i64::MAX),
            error_message: "Observe rejected invalid or excess log records".to_owned(),
        }),
    })
}

fn rejection(state: &ReceiverState, headers: &HeaderMap) -> Option<Response> {
    if headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        != Some("application/x-protobuf")
    {
        return Some(problem(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported_media_type",
            "Observe accepts OTLP/HTTP Protobuf",
        ));
    }
    if headers
        .get(header::CONTENT_ENCODING)
        .is_some_and(|value| value != "identity")
    {
        return Some(problem(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported_content_encoding",
            "Compressed OTLP is not enabled for this receiver",
        ));
    }
    let expected = format!("Bearer {}", state.token);
    if headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        != Some(expected.as_str())
    {
        return Some(problem(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Observe bearer token is missing or invalid",
        ));
    }
    let _ = &state.source_id;
    None
}

fn normalize_spans(request: ExportTraceServiceRequest) -> (Vec<StoredSpan>, IngestLoss) {
    let mut output = Vec::new();
    let mut loss = IngestLoss::default();
    for resource_spans in request.resource_spans {
        let resource_attributes = resource_spans
            .resource
            .map(|resource| resource.attributes)
            .unwrap_or_default();
        let service_name = find_value(&resource_attributes, "service.name")
            .unwrap_or_else(|| "unknown-service".to_owned());
        for scope in resource_spans.scope_spans {
            for span in scope.spans {
                if output.len() >= MAX_RECORDS {
                    loss.rejected = loss.rejected.saturating_add(1);
                    continue;
                }
                match normalize_span(span, &service_name) {
                    Some((span, redacted)) => {
                        loss.redacted = loss.redacted.saturating_add(redacted);
                        output.push(span);
                    }
                    None => loss.rejected = loss.rejected.saturating_add(1),
                }
            }
        }
    }
    (output, loss)
}

fn normalize_span(span: Span, service_name: &str) -> Option<(StoredSpan, u64)> {
    if span.trace_id.len() != 16
        || span.span_id.len() != 8
        || span.name.is_empty()
        || span.end_time_unix_nano < span.start_time_unix_nano
    {
        return None;
    }
    let (attributes, redacted) = safe_attributes(span.attributes);
    let kind = match span::SpanKind::try_from(span.kind).unwrap_or(span::SpanKind::Unspecified) {
        span::SpanKind::Internal => "internal",
        span::SpanKind::Server => "server",
        span::SpanKind::Client => "client",
        span::SpanKind::Producer => "producer",
        span::SpanKind::Consumer => "consumer",
        span::SpanKind::Unspecified => "unspecified",
    };
    let status = span.status.map_or("unset", |status| match status.code {
        1 => "ok",
        2 => "error",
        _ => "unset",
    });
    let partial = span.dropped_attributes_count > 0
        || span.dropped_events_count > 0
        || span.dropped_links_count > 0;
    let is_server_root = kind == "server" && span.parent_span_id.is_empty();
    let parent_span_id =
        (span.parent_span_id.len() == 8).then(|| hex::encode(&span.parent_span_id));
    Some((
        StoredSpan {
            trace_id: hex::encode(span.trace_id),
            span_id: hex::encode(span.span_id),
            parent_span_id,
            name: truncate(span.name, MAX_NAME_BYTES),
            kind,
            started_at: span.start_time_unix_nano,
            ended_at: span.end_time_unix_nano,
            status,
            service_name: truncate(service_name.to_owned(), 256),
            attributes,
            completeness: if partial { "partial" } else { "complete" },
            is_server_root,
        },
        redacted,
    ))
}

fn normalize_logs(request: ExportLogsServiceRequest) -> (Vec<StoredLog>, IngestLoss) {
    let mut output = Vec::new();
    let mut loss = IngestLoss::default();
    for resource_logs in request.resource_logs {
        for scope in resource_logs.scope_logs {
            for log in scope.log_records {
                if output.len() >= MAX_RECORDS {
                    loss.rejected = loss.rejected.saturating_add(1);
                    continue;
                }
                if log.trace_id.len() != 16 {
                    loss.rejected = loss.rejected.saturating_add(1);
                    continue;
                }
                let (attributes, redacted) = safe_attributes(log.attributes);
                loss.redacted = loss.redacted.saturating_add(redacted);
                let body = log.body.as_ref().map(value_string).unwrap_or_default();
                let timestamp = if log.time_unix_nano == 0 {
                    log.observed_time_unix_nano
                } else {
                    log.time_unix_nano
                };
                output.push(StoredLog {
                    trace_id: hex::encode(log.trace_id),
                    span_id: (log.span_id.len() == 8).then(|| hex::encode(log.span_id)),
                    timestamp,
                    severity: truncate(
                        if log.severity_text.is_empty() {
                            format!("severity-{}", log.severity_number)
                        } else {
                            log.severity_text
                        },
                        32,
                    ),
                    body: truncate(body, MAX_LOG_BODY_BYTES),
                    attributes,
                });
            }
        }
    }
    (output, loss)
}

fn safe_attributes(values: Vec<KeyValue>) -> (Vec<Attribute>, u64) {
    let mut output = Vec::new();
    let mut redacted = 0u64;
    for value in values {
        if output.len() >= MAX_ATTRIBUTES {
            redacted = redacted.saturating_add(1);
            continue;
        }
        let key = value.key.trim();
        let lower = key.to_ascii_lowercase();
        if key.is_empty()
            || key.len() > MAX_KEY_BYTES
            || !allowed_attribute(key)
            || ["authorization", "cookie", "password", "secret", "token"]
                .iter()
                .any(|needle| lower.contains(needle))
        {
            redacted = redacted.saturating_add(1);
            continue;
        }
        let Some(value) = value.value.as_ref() else {
            continue;
        };
        output.push(Attribute {
            key: key.to_owned(),
            value: truncate(value_string(value), MAX_VALUE_BYTES),
        });
    }
    (output, redacted)
}

fn allowed_attribute(key: &str) -> bool {
    matches!(
        key,
        "http.request.method"
            | "http.method"
            | "http.route"
            | "url.path"
            | "http.response.status_code"
            | "http.status_code"
            | "server.address"
            | "server.port"
            | "url.scheme"
            | "network.protocol.version"
            | "error.type"
            | "code.file.path"
            | "code.function.name"
            | "code.line.number"
            | "exception.type"
    )
}

fn find_value(values: &[KeyValue], key: &str) -> Option<String> {
    values
        .iter()
        .find(|value| value.key == key)
        .and_then(|value| value.value.as_ref())
        .map(value_string)
}

fn value_string(value: &AnyValue) -> String {
    match value.value.as_ref() {
        Some(any_value::Value::StringValue(value)) => value.clone(),
        Some(any_value::Value::BoolValue(value)) => value.to_string(),
        Some(any_value::Value::IntValue(value)) => value.to_string(),
        Some(any_value::Value::DoubleValue(value)) if value.is_finite() => value.to_string(),
        Some(any_value::Value::BytesValue(value)) => format!("[{} bytes redacted]", value.len()),
        Some(any_value::Value::ArrayValue(value)) => {
            format!("[array of {} values]", value.values.len())
        }
        Some(any_value::Value::KvlistValue(value)) => {
            format!("[object of {} values]", value.values.len())
        }
        Some(
            any_value::Value::StringValueStrindex(_) | any_value::Value::DoubleValue(_),
        )
        | None => "[unsupported value]".to_owned(),
    }
}

fn truncate(mut value: String, max: usize) -> String {
    if value.len() <= max {
        return value;
    }
    let mut boundary = max;
    while !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    value.truncate(boundary);
    value
}

fn protobuf(message: &impl prost::Message) -> Response {
    let mut body = Vec::new();
    if message.encode(&mut body).is_err() {
        return problem(
            StatusCode::INTERNAL_SERVER_ERROR,
            "encode_failed",
            "Observe could not encode the OTLP response",
        );
    }
    ([(header::CONTENT_TYPE, "application/x-protobuf")], body).into_response()
}

fn overloaded(error: impl std::fmt::Debug) -> Response {
    let mut response = problem(
        StatusCode::SERVICE_UNAVAILABLE,
        "receiver_overloaded",
        "Observe could not accept this telemetry batch",
    );
    response
        .headers_mut()
        .insert(header::RETRY_AFTER, "1".parse().expect("valid header"));
    eprintln!("Observe ingestion rejected a batch: {error:?}");
    response
}

fn problem(status: StatusCode, code: &'static str, title: &'static str) -> Response {
    (
        status,
        axum::Json(serde_json::json!({ "code": code, "title": title })),
    )
        .into_response()
}
