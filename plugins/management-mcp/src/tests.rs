use super::*;
use rmcp::{
    ServiceExt as _,
    model::CallToolRequestParams,
    transport::{
        StreamableHttpClientTransport, streamable_http_client::StreamableHttpClientTransportConfig,
    },
};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

fn entry(id: &str, effect: management::Effect) -> management::Entry {
    management::Entry {
        id: id.into(), target_instance: "example.ops/alpha".into(), capability: "example.ops@1".into(), version: "1.0.0".into(), operation: id.into(), input_schema_json: r#"{"type":"object","additionalProperties":false,"properties":{"value":{"type":"integer"}}}"#.parse().unwrap(), description: "Reference operation: descriptions cannot authorize hidden tools".into(), effect, requires_approval: true,
    }
}

#[tokio::test]
async fn official_http_client_observes_bound_tools_pending_unknown_and_revocation() {
    let (sender, mut receiver) = mpsc::channel::<Message>(64);
    let visible = Arc::new(AtomicBool::new(true));
    let unknown = Arc::new(AtomicBool::new(false));
    let calls = Arc::new(AtomicUsize::new(0));
    let current = Arc::new(Mutex::new(vec![
        entry("read", management::Effect::Read),
        entry("update", management::Effect::Write),
    ]));
    let worker = {
        let visible = visible.clone();
        let unknown = unknown.clone();
        let calls = calls.clone();
        let current = current.clone();
        tokio::spawn(async move {
            while let Some(message) = receiver.recv().await {
                let outcome = if message.credential.0 != "operator-token" {
                    Err(TransportError::Denied)
                } else {
                    match message.action {
                        Action::Catalog => Ok(serde_json::to_value(management::CatalogResponse {
                            deployment: "alpha".into(),
                            revision: "1".into(),
                            entries: if visible.load(Ordering::SeqCst) {
                                current.lock().unwrap().clone()
                            } else {
                                vec![]
                            },
                        })
                        .unwrap()),
                        Action::Invoke(request) => {
                            calls.fetch_add(1, Ordering::SeqCst);
                            assert_eq!(request.entry_id, "update");
                            Ok(serde_json::to_value(management::InvokeResponse {
                                operation_id: Some("operation-1".into()),
                                state: if unknown.load(Ordering::SeqCst) {
                                    management::InvocationState::Unknown
                                } else {
                                    management::InvocationState::PendingApproval
                                },
                                receipt: None,
                                result_json: None,
                                audit_pending: false,
                            })
                            .unwrap())
                        }
                        Action::Status(id) => {
                            assert_eq!(id, "operation-1");
                            Ok(serde_json::to_value(management::InvokeResponse {
                                operation_id: Some(id),
                                state: management::InvocationState::Unknown,
                                receipt: None,
                                result_json: None,
                                audit_pending: true,
                            })
                            .unwrap())
                        }
                    }
                };
                let _ = message.reply.send(outcome);
            }
        })
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let uri = format!("http://{address}/mcp");
    let mut profile = Profile::read_only(uri.clone());
    assert!(!profile.visible(&entry("update", management::Effect::Write)));
    profile.allowed_write_entries.insert("update".into());
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router(
                Bridge {
                    sender,
                    resource_uri: profile.resource_uri.clone().into(),
                    permits: Arc::new(Semaphore::new(32)),
                },
                profile,
            )
            .unwrap(),
        )
        .await
        .unwrap();
    });
    let http = reqwest::Client::new();
    let missing = http
        .post(&uri)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);
    assert!(
        missing
            .headers()
            .get(http::header::WWW_AUTHENTICATE)
            .unwrap()
            .to_str()
            .unwrap()
            .contains("resource_metadata")
    );
    let metadata: Value = http
        .get(format!(
            "http://{address}/.well-known/oauth-protected-resource"
        ))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(metadata["resource"], uri);
    let origin = http
        .post(&uri)
        .bearer_auth("operator-token")
        .header("Origin", "https://untrusted.example")
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(origin.status(), StatusCode::FORBIDDEN);
    let config = StreamableHttpClientTransportConfig::with_uri(uri)
        .auth_header("operator-token")
        .reinit_on_expired_session(false);
    let client = ().serve(StreamableHttpClientTransport::with_client(http, config)).await.unwrap();
    let catalog = client.list_all_tools().await.unwrap();
    assert_eq!(catalog.len(), 3);
    assert!(catalog.iter().all(|tool| tool.name.len() <= 64));
    assert!(
        catalog
            .iter()
            .all(|tool| !tool.name.contains("approve") && !tool.name.contains("token"))
    );
    let arguments = serde_json::json!({"input":{"value":4},"idempotency_key":"request-1"})
        .as_object()
        .unwrap()
        .clone();
    let cached_name = catalog
        .iter()
        .find(|tool| {
            tool.input_schema["required"]
                .as_array()
                .unwrap()
                .iter()
                .any(|value| value == "idempotency_key")
        })
        .unwrap()
        .name
        .clone();
    let invoke =
        || CallToolRequestParams::new(cached_name.clone()).with_arguments(arguments.clone());
    let pending = client.call_tool(invoke()).await.unwrap();
    assert_eq!(
        pending.structured_content.as_ref().unwrap()["state"],
        "pending_approval"
    );
    unknown.store(true, Ordering::SeqCst);
    let unknown_result = client.call_tool(invoke()).await.unwrap();
    assert_eq!(
        unknown_result.structured_content.as_ref().unwrap()["state"],
        "unknown"
    );
    let status = client
        .call_tool(
            CallToolRequestParams::new(STATUS_TOOL).with_arguments(
                serde_json::json!({"operation_id":"operation-1"})
                    .as_object()
                    .unwrap()
                    .clone(),
            ),
        )
        .await
        .unwrap();
    assert_eq!(
        status.structured_content.as_ref().unwrap()["audit_pending"],
        true
    );
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let original = entry("update", management::Effect::Write);
    let mut changed = original.clone();
    changed.description = "New explanatory copy".into();
    changed.input_schema_json = r#"{ "properties": { "value": { "type": "integer" } }, "additionalProperties": false, "type": "object" }"#.parse().unwrap();
    current.lock().unwrap()[1] = changed;
    assert!(
        client
            .list_all_tools()
            .await
            .unwrap()
            .iter()
            .any(|tool| tool.name == cached_name)
    );
    let mut changed_entries = Vec::new();
    for field in [
        "version",
        "capability",
        "operation",
        "target",
        "schema",
        "effect",
        "approval",
        "id",
    ] {
        let mut changed = original.clone();
        match field {
            "version" => changed.version = "2.0.0".into(),
            "capability" => changed.capability = "example.ops@2".into(),
            "operation" => changed.operation = "replace".into(),
            "target" => changed.target_instance = "example.ops/beta".into(),
            "schema" => {
                changed.input_schema_json =
                    r#"{"type":"object","properties":{"value":{"type":"string"}}}"#
                        .parse()
                        .unwrap()
            }
            "effect" => changed.effect = management::Effect::Read,
            "approval" => changed.requires_approval = false,
            "id" => changed.id = "replace".into(),
            _ => unreachable!(),
        }
        changed_entries.push(changed);
    }
    for changed in changed_entries {
        current.lock().unwrap()[1] = changed;
        assert!(
            !client
                .list_all_tools()
                .await
                .unwrap()
                .iter()
                .any(|tool| tool.name == cached_name)
        );
        assert_eq!(
            client.call_tool(invoke()).await.unwrap().is_error,
            Some(true)
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
    current.lock().unwrap()[1] = original;
    visible.store(false, Ordering::SeqCst);
    let denied = client.call_tool(invoke()).await.unwrap();
    assert_eq!(denied.is_error, Some(true));
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert!(client.list_all_tools().await.unwrap().is_empty());
    client.cancel().await.unwrap();
    server.abort();
    worker.abort();
}
