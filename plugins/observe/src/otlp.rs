use http::StatusCode;
use lenso_capability_http_stream_endpoint::{
    HandleRequest, HandleRequestHeadersItem, HandleResponseHeadersItem,
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

use crate::{
    otlp_body::{self, BodyError},
    store::{Attribute, IngestLoss, ObserveStore, StoredEvent, StoredLink, StoredLog, StoredSpan},
};

const MAX_RECORDS: usize = 10_000;
const MAX_ATTRIBUTES: usize = 64;
const MAX_EVENTS: usize = 128;
const MAX_LINKS: usize = 128;
const MAX_KEY_BYTES: usize = 256;
const MAX_VALUE_BYTES: usize = 4096;
const MAX_NAME_BYTES: usize = 512;
const MAX_LOG_BODY_BYTES: usize = 16 * 1024;

pub(crate) struct Response {
    pub body: Vec<u8>,
    pub headers: Vec<HandleResponseHeadersItem>,
    pub status: u16,
}

pub(crate) async fn handle(store: ObserveStore, token: &str, request: HandleRequest) -> Response {
    if let Some(response) = rejection(token, &request) {
        return response;
    }
    let body = match otlp_body::decode(&request.headers, request.body.into_shared()).await {
        Ok(body) => body,
        Err(error) => return body_problem(&store, error),
    };
    match request.route_id.as_str() {
        "observe.otlp.traces" => export_traces(store, body).await,
        "observe.otlp.logs" => export_logs(store, body).await,
        _ => problem(
            StatusCode::NOT_FOUND,
            "route_not_found",
            "OTLP route was not found",
        ),
    }
}

async fn export_traces(store: ObserveStore, body: bytes::Bytes) -> Response {
    let Ok(request) = ExportTraceServiceRequest::decode(body) else {
        store.record_decode_failure();
        return problem(
            StatusCode::BAD_REQUEST,
            "invalid_otlp",
            "Invalid OTLP trace payload",
        );
    };
    let (spans, loss) = normalize_spans(request);
    let rejected = loss.rejected;
    if let Err(error) = store.ingest_spans(spans, loss).await {
        return overloaded(error);
    }
    protobuf(&ExportTraceServiceResponse {
        partial_success: (rejected > 0).then(|| ExportTracePartialSuccess {
            rejected_spans: i64::try_from(rejected).unwrap_or(i64::MAX),
            error_message: "Observe rejected invalid or excess spans".to_owned(),
        }),
    })
}

async fn export_logs(store: ObserveStore, body: bytes::Bytes) -> Response {
    let Ok(request) = ExportLogsServiceRequest::decode(body) else {
        store.record_decode_failure();
        return problem(
            StatusCode::BAD_REQUEST,
            "invalid_otlp",
            "Invalid OTLP log payload",
        );
    };
    let (log_records, ingest_loss) = normalize_logs(request);
    let rejected = ingest_loss.rejected;
    if let Err(error) = store.ingest_logs(log_records, ingest_loss).await {
        return overloaded(error);
    }
    protobuf(&ExportLogsServiceResponse {
        partial_success: (rejected > 0).then(|| ExportLogsPartialSuccess {
            rejected_log_records: i64::try_from(rejected).unwrap_or(i64::MAX),
            error_message: "Observe rejected invalid or excess log records".to_owned(),
        }),
    })
}

fn rejection(token: &str, request: &HandleRequest) -> Option<Response> {
    if header(&request.headers, "content-type") != Some("application/x-protobuf") {
        return Some(problem(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported_media_type",
            "Observe accepts OTLP/HTTP Protobuf",
        ));
    }
    if !header(&request.headers, "content-encoding")
        .is_none_or(|value| value == "identity" || value == "gzip")
    {
        return Some(problem(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported_content_encoding",
            "Observe accepts identity or gzip content encoding",
        ));
    }
    if request.credential.as_ref().is_none_or(|credential| {
        !credential.scheme.eq_ignore_ascii_case("Bearer") || credential.value != token
    }) {
        return Some(problem(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Observe bearer token is missing or invalid",
        ));
    }
    None
}

fn header<'a>(headers: &'a [HandleRequestHeadersItem], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str())
}

fn body_problem(store: &ObserveStore, error: BodyError) -> Response {
    store.record_decode_failure();
    match error {
        BodyError::EncodedTooLarge => problem(
            StatusCode::PAYLOAD_TOO_LARGE,
            "encoded_body_too_large",
            "OTLP request body exceeds its encoded limit",
        ),
        BodyError::DecodedTooLarge => problem(
            StatusCode::PAYLOAD_TOO_LARGE,
            "decoded_body_too_large",
            "OTLP request body exceeds its decoded limit",
        ),
        BodyError::InvalidGzip => problem(
            StatusCode::BAD_REQUEST,
            "invalid_gzip",
            "OTLP gzip request body is invalid",
        ),
        BodyError::WorkerUnavailable => problem(
            StatusCode::INTERNAL_SERVER_ERROR,
            "decode_worker_unavailable",
            "Observe could not decode the OTLP request body",
        ),
    }
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
    let (attributes, mut redacted) = safe_attributes(span.attributes);
    let (events, events_redacted, events_incomplete) = normalize_events(span.events);
    redacted = redacted.saturating_add(events_redacted);
    let (links, links_redacted, links_incomplete) = normalize_links(span.links);
    redacted = redacted.saturating_add(links_redacted);
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
        || span.dropped_links_count > 0
        || events_incomplete
        || links_incomplete;
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
            events,
            links,
        },
        redacted,
    ))
}

fn normalize_events(events: Vec<span::Event>) -> (Vec<StoredEvent>, u64, bool) {
    let mut output = Vec::new();
    let mut redacted = 0u64;
    let mut incomplete = false;
    for event in events {
        if output.len() >= MAX_EVENTS || event.name.is_empty() {
            incomplete = true;
            continue;
        }
        let (attributes, event_redacted) = safe_attributes(event.attributes);
        redacted = redacted.saturating_add(event_redacted);
        incomplete |= event.dropped_attributes_count > 0;
        output.push(StoredEvent {
            timestamp: event.time_unix_nano,
            name: truncate(event.name, MAX_NAME_BYTES),
            attributes,
        });
    }
    (output, redacted, incomplete)
}

fn normalize_links(links: Vec<span::Link>) -> (Vec<StoredLink>, u64, bool) {
    let mut output = Vec::new();
    let mut redacted = 0u64;
    let mut incomplete = false;
    for link in links {
        if output.len() >= MAX_LINKS || link.trace_id.len() != 16 || link.span_id.len() != 8 {
            incomplete = true;
            continue;
        }
        let (attributes, link_redacted) = safe_attributes(link.attributes);
        redacted = redacted.saturating_add(link_redacted);
        incomplete |= link.dropped_attributes_count > 0;
        output.push(StoredLink {
            trace_id: hex::encode(link.trace_id),
            span_id: hex::encode(link.span_id),
            attributes,
        });
    }
    (output, redacted, incomplete)
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
        Some(any_value::Value::StringValueStrindex(_) | any_value::Value::DoubleValue(_))
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
    Response {
        body,
        headers: vec![response_header("content-type", "application/x-protobuf")],
        status: StatusCode::OK.as_u16(),
    }
}

fn overloaded(error: impl std::fmt::Debug) -> Response {
    let mut response = problem(
        StatusCode::SERVICE_UNAVAILABLE,
        "receiver_overloaded",
        "Observe could not accept this telemetry batch",
    );
    response.headers.push(response_header("retry-after", "1"));
    eprintln!("Observe ingestion rejected a batch: {error:?}");
    response
}

fn problem(status: StatusCode, code: &'static str, title: &'static str) -> Response {
    Response {
        body: serde_json::to_vec(&serde_json::json!({ "code": code, "title": title }))
            .expect("static OTLP problem is serializable"),
        headers: vec![response_header("content-type", "application/json")],
        status: status.as_u16(),
    }
}

fn response_header(name: &str, value: &str) -> HandleResponseHeadersItem {
    HandleResponseHeadersItem {
        name: name.to_owned(),
        value: value.to_owned(),
    }
}
