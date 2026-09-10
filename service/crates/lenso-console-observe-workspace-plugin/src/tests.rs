use std::{cell::RefCell, io::Write as _, rc::Rc};

use flate2::{Compression, write::GzEncoder};

use lenso_capability_observability_query::{
    ListRequestsRequest, OptionalValue, ReadIngestionHealthRequest, ReadTraceRequest,
    ReadTraceResponseCompleteness, RequestCompleteness,
};
use lenso_capability_ui_contribution::{DescribeRequest, DescribeResponseSubjectKind};
use lenso_kernel::{CancellationToken, InvocationContext};
use opentelemetry_proto::tonic::{
    collector::{
        logs::v1::ExportLogsServiceRequest,
        trace::v1::{ExportTraceServiceRequest, ExportTraceServiceResponse},
    },
    common::v1::{AnyValue, KeyValue, any_value},
    logs::v1::{LogRecord, ResourceLogs, ScopeLogs},
    resource::v1::Resource,
    trace::v1::{ResourceSpans, ScopeSpans, Span, Status, span},
};
use prost::Message as _;

use super::*;

fn config(root: &std::path::Path) -> ObserveConfig {
    ObserveConfig {
        source_id: "sample-app".to_owned(),
        source_label: "Sample App".to_owned(),
        listen_address: "127.0.0.1:0".to_owned(),
        database: root.join("observe.sqlite3"),
        token_file: root.join("otlp-token"),
        retention_days: 7,
        retention_bytes: 1024 * 1024,
    }
}

fn plugin(config: ObserveConfig) -> ObserveWorkspace {
    ObserveWorkspace {
        config,
        store: Rc::new(RefCell::new(None)),
        worker: Rc::new(RefCell::new(None)),
        receiver: Rc::new(RefCell::new(None)),
        tasks: lenso::ManagedTasks::default(),
    }
}

fn context() -> InvocationContext {
    InvocationContext::new(1, None, CancellationToken::new())
}

fn string_value(value: &str) -> AnyValue {
    AnyValue {
        value: Some(any_value::Value::StringValue(value.to_owned())),
    }
}

fn int_value(value: i64) -> AnyValue {
    AnyValue {
        value: Some(any_value::Value::IntValue(value)),
    }
}

fn attribute(key: &str, value: AnyValue) -> KeyValue {
    KeyValue {
        key: key.to_owned(),
        value: Some(value),
        key_strindex: 0,
    }
}

fn trace_request() -> ExportTraceServiceRequest {
    let start = now_nanos();
    ExportTraceServiceRequest {
        resource_spans: vec![ResourceSpans {
            resource: Some(Resource {
                attributes: vec![attribute("service.name", string_value("sample-web"))],
                ..Default::default()
            }),
            scope_spans: vec![ScopeSpans {
                spans: vec![
                    Span {
                        trace_id: vec![1; 16],
                        span_id: vec![2; 8],
                        name: "GET /orders/:id".to_owned(),
                        kind: span::SpanKind::Server.into(),
                        start_time_unix_nano: start,
                        end_time_unix_nano: start + 25_000_000,
                        attributes: vec![
                            attribute("http.request.method", string_value("GET")),
                            attribute("http.route", string_value("/orders/:id")),
                            attribute("http.response.status_code", int_value(200)),
                            attribute("http.request.header.authorization", string_value("secret")),
                        ],
                        events: vec![span::Event {
                            time_unix_nano: start + 10_000_000,
                            name: "exception".to_owned(),
                            attributes: vec![attribute(
                                "exception.type",
                                string_value("ExampleError"),
                            )],
                            ..Default::default()
                        }],
                        links: vec![span::Link {
                            trace_id: vec![4; 16],
                            span_id: vec![5; 8],
                            attributes: vec![attribute(
                                "code.function.name",
                                string_value("load_order"),
                            )],
                            ..Default::default()
                        }],
                        status: Some(Status {
                            message: String::new(),
                            code: 1,
                        }),
                        ..Default::default()
                    },
                    Span {
                        trace_id: vec![1; 16],
                        span_id: vec![3; 8],
                        parent_span_id: vec![2; 8],
                        name: "SELECT order".to_owned(),
                        kind: span::SpanKind::Client.into(),
                        start_time_unix_nano: start + 2_000_000,
                        end_time_unix_nano: start + 20_000_000,
                        status: Some(Status {
                            message: String::new(),
                            code: 1,
                        }),
                        ..Default::default()
                    },
                ],
                ..Default::default()
            }],
            ..Default::default()
        }],
    }
}

fn logs_request() -> ExportLogsServiceRequest {
    ExportLogsServiceRequest {
        resource_logs: vec![ResourceLogs {
            scope_logs: vec![ScopeLogs {
                log_records: vec![LogRecord {
                    time_unix_nano: now_nanos(),
                    severity_text: "INFO".to_owned(),
                    body: Some(string_value("order loaded")),
                    trace_id: vec![1; 16],
                    span_id: vec![3; 8],
                    attributes: vec![attribute("request.cookie", string_value("private"))],
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        }],
    }
}

fn now_nanos() -> u64 {
    u64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    )
    .unwrap()
}

fn gzip(bytes: &[u8]) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(bytes).unwrap();
    encoder.finish().unwrap()
}

fn stored_root(byte: u8, started_at: u64) -> store::StoredSpan {
    store::StoredSpan {
        trace_id: hex::encode([byte; 16]),
        span_id: hex::encode([byte; 8]),
        parent_span_id: None,
        name: format!("GET /{byte}"),
        kind: "server",
        started_at,
        ended_at: started_at.saturating_add(1_000),
        status: "ok",
        service_name: "pagination-test".to_owned(),
        attributes: vec![store::Attribute {
            key: "http.request.method".to_owned(),
            value: "GET".to_owned(),
        }],
        completeness: "complete",
        is_server_root: true,
        events: Vec::new(),
        links: Vec::new(),
    }
}

#[test]
fn descriptor_and_workspace_are_removable_plugin_contributions() {
    let descriptor: serde_json::Value = serde_json::from_str(PLUGIN_DESCRIPTOR_JSON).unwrap();
    assert_eq!(descriptor["plugin_id"], "lenso.console.workspace.observe");
    assert_eq!(descriptor["root_slot"], "console-workspaces");
    let root = tempfile::tempdir().unwrap();
    let plugin = plugin(config(root.path()));
    let contribution = futures::executor::block_on(plugin.describe(context(), DescribeRequest {}))
        .unwrap()
        .unwrap();
    assert_eq!(contribution.workspace_id, "observe-sample-app");
    assert_eq!(
        contribution.subject.unwrap().kind,
        DescribeResponseSubjectKind::App
    );
    assert_eq!(
        contribution.requirements[0].capability_id,
        observe::CAPABILITY_ID
    );
    assert_eq!(contribution.assets.len(), 2);
}

#[tokio::test(flavor = "current_thread")]
async fn real_otlp_http_ingestion_persists_queries_and_redacts_secrets() {
    let root = tempfile::tempdir().unwrap();
    let config = config(root.path());
    let (store, worker) = ObserveWorker::start(StoreConfig {
        database: config.database.clone(),
        source_id: config.source_id.clone(),
        retention_days: config.retention_days,
        retention_bytes: config.retention_bytes,
    })
    .await
    .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let query_store = store.clone();
    let (shutdown, stop) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            otlp::router(store, "test-token-which-is-long-enough".to_owned()),
        )
        .with_graceful_shutdown(async move {
            let _ = stop.await;
        })
        .await
        .unwrap();
    });
    let client = reqwest::Client::new();

    let unauthorized = client
        .post(format!("http://{address}/v1/traces"))
        .header("content-type", "application/x-protobuf")
        .body(trace_request().encode_to_vec())
        .send()
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), reqwest::StatusCode::UNAUTHORIZED);

    let response = client
        .post(format!("http://{address}/v1/traces"))
        .header("content-type", "application/x-protobuf")
        .header("content-encoding", "gzip")
        .bearer_auth("test-token-which-is-long-enough")
        .body(gzip(&trace_request().encode_to_vec()))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "application/x-protobuf");

    let response = client
        .post(format!("http://{address}/v1/logs"))
        .header("content-type", "application/x-protobuf")
        .bearer_auth("test-token-which-is-long-enough")
        .body(logs_request().encode_to_vec())
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::OK);

    let mut invalid = trace_request();
    invalid.resource_spans[0].scope_spans[0].spans = vec![Span::default()];
    let response = client
        .post(format!("http://{address}/v1/traces"))
        .header("content-type", "application/x-protobuf")
        .bearer_auth("test-token-which-is-long-enough")
        .body(invalid.encode_to_vec())
        .send()
        .await
        .unwrap();
    let partial = ExportTraceServiceResponse::decode(response.bytes().await.unwrap()).unwrap();
    assert_eq!(partial.partial_success.unwrap().rejected_spans, 1);

    let response = client
        .post(format!("http://{address}/v1/traces"))
        .header("content-type", "application/x-protobuf")
        .header("content-encoding", "gzip")
        .bearer_auth("test-token-which-is-long-enough")
        .body(gzip(&vec![0; otlp_body::MAX_DECODED_BYTES + 1]))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::PAYLOAD_TOO_LARGE);

    let page = query_store
        .list_requests(ListRequestsRequest {
            cursor: OptionalValue::default(),
            limit: 10,
            source_id: config.source_id.clone(),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(page.requests.len(), 1);
    assert_eq!(page.requests[0].route, "/orders/:id");
    assert_eq!(page.requests[0].duration_nano, "25000000");
    assert_eq!(page.requests[0].completeness, RequestCompleteness::Late);

    let trace = query_store
        .read_trace(ReadTraceRequest {
            source_id: config.source_id.clone(),
            trace_id: hex::encode([1; 16]),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(trace.spans.len(), 2);
    assert_eq!(trace.completeness, ReadTraceResponseCompleteness::Late);
    assert_eq!(trace.spans[0].events.as_ref().unwrap()[0].name, "exception");
    assert_eq!(
        trace.spans[0].links.as_ref().unwrap()[0].trace_id,
        hex::encode([4; 16])
    );
    assert!(
        trace.spans[0]
            .attributes
            .iter()
            .all(|item| !item.key.contains("authorization"))
    );
    let health = query_store
        .health(ReadIngestionHealthRequest {
            source_id: config.source_id.clone(),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(health.accepted_spans, "2");
    assert_eq!(health.accepted_logs, "1");
    assert_eq!(health.rejected_records, "1");
    assert_eq!(health.decode_failures, "1");
    assert_eq!(health.redacted_attributes, "2");

    let _ = shutdown.send(());
    server.await.unwrap();
    worker.shutdown().await.unwrap();

    let (reopened, reopened_worker) = ObserveWorker::start(StoreConfig {
        database: config.database.clone(),
        source_id: config.source_id.clone(),
        retention_days: config.retention_days,
        retention_bytes: config.retention_bytes,
    })
    .await
    .unwrap();
    let persisted = reopened
        .list_requests(ListRequestsRequest {
            cursor: OptionalValue::default(),
            limit: 10,
            source_id: config.source_id.clone(),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(persisted.requests.len(), 1);
    assert_eq!(
        persisted.requests[0].completeness,
        RequestCompleteness::Late
    );
    let persisted_trace = reopened
        .read_trace(ReadTraceRequest {
            source_id: config.source_id.clone(),
            trace_id: hex::encode([1; 16]),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(persisted_trace.spans[0].events.as_ref().unwrap().len(), 1);
    assert_eq!(persisted_trace.spans[0].links.as_ref().unwrap().len(), 1);
    let logs = reopened
        .list_logs(ListTraceLogsRequest {
            cursor: OptionalValue::default(),
            limit: 10,
            source_id: config.source_id.clone(),
            span_id: OptionalValue::default(),
            trace_id: hex::encode([1; 16]),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(logs.logs[0].body, "order loaded");
    assert!(logs.logs[0].attributes.is_empty());
    reopened_worker.shutdown().await.unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn request_pagination_and_time_retention_are_enforced() {
    let root = tempfile::tempdir().unwrap();
    let config = config(root.path());
    let (store, worker) = ObserveWorker::start(StoreConfig {
        database: config.database.clone(),
        source_id: config.source_id.clone(),
        retention_days: config.retention_days,
        retention_bytes: config.retention_bytes,
    })
    .await
    .unwrap();
    let now = now_nanos();
    store
        .ingest_spans(
            vec![stored_root(6, now), stored_root(7, now.saturating_sub(1))],
            store::IngestLoss::default(),
        )
        .await
        .unwrap();
    let first = store
        .list_requests(ListRequestsRequest {
            cursor: OptionalValue::default(),
            limit: 1,
            source_id: config.source_id.clone(),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(first.requests.len(), 1);
    let second = store
        .list_requests(ListRequestsRequest {
            cursor: Some(Some(first.next_cursor.unwrap())),
            limit: 1,
            source_id: config.source_id.clone(),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(second.requests.len(), 1);
    assert_ne!(first.requests[0].trace_id, second.requests[0].trace_id);

    store
        .ingest_spans(vec![stored_root(8, 1)], store::IngestLoss::default())
        .await
        .unwrap();
    let retained = store
        .read_trace(ReadTraceRequest {
            source_id: config.source_id.clone(),
            trace_id: hex::encode([8; 16]),
        })
        .await
        .unwrap();
    assert!(retained.is_err());
    let health = store
        .health(ReadIngestionHealthRequest {
            source_id: config.source_id,
        })
        .await
        .unwrap()
        .unwrap();
    assert!(health.retention_deletions.parse::<u64>().unwrap() >= 1);
    worker.shutdown().await.unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn logical_size_retention_removes_the_oldest_complete_trace() {
    let root = tempfile::tempdir().unwrap();
    let config = config(root.path());
    let (store, worker) = ObserveWorker::start(StoreConfig {
        database: config.database.clone(),
        source_id: config.source_id.clone(),
        retention_days: config.retention_days,
        retention_bytes: 700,
    })
    .await
    .unwrap();
    let now = now_nanos();
    let mut oldest = stored_root(9, now.saturating_sub(1));
    oldest.events.push(store::StoredEvent {
        timestamp: now,
        name: "old-event".to_owned(),
        attributes: vec![store::Attribute {
            key: "exception.type".to_owned(),
            value: "OldError".to_owned(),
        }],
    });
    oldest.links.push(store::StoredLink {
        trace_id: hex::encode([19; 16]),
        span_id: hex::encode([19; 8]),
        attributes: vec![store::Attribute {
            key: "code.function.name".to_owned(),
            value: "old_dependency".to_owned(),
        }],
    });
    let mut newest = stored_root(10, now);
    newest.events.push(store::StoredEvent {
        timestamp: now,
        name: "new-event".to_owned(),
        attributes: Vec::new(),
    });
    newest.links.push(store::StoredLink {
        trace_id: hex::encode([20; 16]),
        span_id: hex::encode([20; 8]),
        attributes: Vec::new(),
    });

    store
        .ingest_spans(vec![oldest, newest], store::IngestLoss::default())
        .await
        .unwrap();

    let page = store
        .list_requests(ListRequestsRequest {
            cursor: OptionalValue::default(),
            limit: 10,
            source_id: config.source_id.clone(),
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(page.requests.len(), 1);
    assert_eq!(page.requests[0].trace_id, hex::encode([10; 16]));
    let health = store
        .health(ReadIngestionHealthRequest {
            source_id: config.source_id,
        })
        .await
        .unwrap()
        .unwrap();
    assert!(health.retention_deletions.parse::<u64>().unwrap() >= 1);
    worker.shutdown().await.unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn request_feed_reports_and_counts_subscriber_lag() {
    let root = tempfile::tempdir().unwrap();
    let config = config(root.path());
    let (store, worker) = ObserveWorker::start(StoreConfig {
        database: config.database.clone(),
        source_id: config.source_id.clone(),
        retention_days: config.retention_days,
        retention_bytes: config.retention_bytes,
    })
    .await
    .unwrap();
    let mut feed = store.subscribe();
    let now = now_nanos();
    let spans = (0_u8..=64)
        .map(|byte| stored_root(byte, now.saturating_add(u64::from(byte))))
        .collect();
    store
        .ingest_spans(spans, store::IngestLoss::default())
        .await
        .unwrap();

    let item = classify_feed_receive(&store, feed.recv().await).unwrap();
    assert_eq!(item.kind, observe::WatchRequestsResponseKind::Lag);
    assert_eq!(item.dropped_count, "1");
    let health = store
        .health(ReadIngestionHealthRequest {
            source_id: config.source_id,
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(health.feed_lag, "1");
    worker.shutdown().await.unwrap();
}

#[test]
fn token_is_created_outside_the_plan_with_private_permissions() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("private/token");
    let first = read_or_create_token(&path).unwrap();
    let second = read_or_create_token(&path).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.len(), 64);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        assert_eq!(
            std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
