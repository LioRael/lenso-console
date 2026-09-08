//! Keep supervised project turns alive when their browser view is detached.
use super::{AppAgentAdapter, Bytes, HeaderMap, Json, Response, StatusCode, problem};
use axum::{body::Body, response::IntoResponse};
use serde::Serialize;
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Activity {
    pub request_id: Option<String>,
    pub session_id: Option<String>,
    pub running: bool,
    pub detail: Option<String>,
}
pub(super) type SharedActivity = Arc<Mutex<Activity>>;

pub(super) fn snapshot(activity: &SharedActivity) -> Response {
    Json(
        activity
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone(),
    )
    .into_response()
}

pub(super) async fn relay(adapter: AppAgentAdapter, headers: HeaderMap, body: Bytes) -> Response {
    let Some(activity) = adapter.activity.clone() else {
        return problem(StatusCode::NOT_FOUND, "Project activity is unavailable");
    };
    let request: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => return problem(StatusCode::BAD_REQUEST, "Invalid turn request"),
    };
    {
        let mut state = activity
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if state.running {
            return problem(
                StatusCode::CONFLICT,
                "A task is already running in this project",
            );
        }
        *state = Activity {
            request_id: request["request_id"].as_str().map(str::to_owned),
            session_id: request["session_id"].as_str().map(str::to_owned),
            running: true,
            detail: None,
        };
    }
    let (response_tx, response_rx) = tokio::sync::oneshot::channel();
    // This task owns the upstream connection even if the browser disconnects
    // before response headers arrive. Explicit cancel still goes to this Agent.
    tokio::spawn(async move {
        let mut url = adapter.origin.clone();
        url.set_path("/api/console/v1/agent/turns");
        let mut request = adapter
            .client
            .post(url)
            .body(body)
            .header("content-type", "application/json")
            .header("accept", "text/event-stream");
        if let Some(token) = &adapter.authorization {
            request = request.header("authorization", token);
        }
        if let Some(value) = headers.get("last-event-id") {
            request = request.header("last-event-id", value);
        }
        let result = async {
            let mut response =
                tokio::time::timeout(std::time::Duration::from_secs(30), request.send()).await??;
            let status = response.status();
            let content_type = response.headers().get("content-type").cloned();
            let (tx, rx) = tokio::sync::mpsc::channel::<Result<Bytes, std::io::Error>>(32);
            let mut builder = Response::builder()
                .status(status)
                .header("cache-control", "no-store");
            if let Some(value) = content_type {
                builder = builder.header("content-type", value);
            }
            let _ = response_tx.send(
                builder
                    .body(Body::from_stream(
                        tokio_stream::wrappers::ReceiverStream::new(rx),
                    ))
                    .unwrap_or_else(|_| {
                        problem(StatusCode::BAD_GATEWAY, "Project response failed")
                    }),
            );
            let mut pending = Vec::new();
            while let Some(bytes) = response.chunk().await? {
                pending.extend_from_slice(&bytes);
                while let Some(index) = pending.iter().position(|byte| *byte == b'\n') {
                    observe(&activity, &pending[..index]);
                    pending.drain(..=index);
                }
                if pending.len() > 1024 * 1024 {
                    pending.clear();
                }
                // A detached or slow browser must never stop Agent execution.
                if !tx.is_closed() {
                    match tx.try_send(Ok(bytes)) {
                        Ok(()) | Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {}
                        Err(tokio::sync::mpsc::error::TrySendError::Full(bytes)) => {
                            let _ = tx.send(bytes).await;
                        }
                    }
                }
            }
            anyhow::ensure!(status.is_success(), "Project turn returned HTTP {status}");
            Ok::<(), anyhow::Error>(())
        }
        .await;
        let mut state = activity
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.running = false;
        if let Err(error) = result {
            state.detail = Some(error.to_string());
        }
    });
    response_rx
        .await
        .unwrap_or_else(|_| problem(StatusCode::BAD_GATEWAY, "Project turn could not start"))
}

fn observe(activity: &SharedActivity, line: &[u8]) {
    let Some(data) = line.strip_prefix(b"data:") else {
        return;
    };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(data) else {
        return;
    };
    let mut state = activity
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(id) = value["session_id"]
        .as_str()
        .or_else(|| value["message"]["session_id"].as_str())
    {
        state.session_id = Some(id.to_owned());
    }
    if let Some(detail) = value["detail"].as_str() {
        state.detail = Some(detail.to_owned());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, routing::post};

    #[tokio::test]
    async fn detached_turns_finish_independently_and_reject_duplicate_work() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route(
                    "/api/console/v1/agent/turns",
                    post(|Json(request): Json<serde_json::Value>| async move {
                        let (tx, rx) =
                            tokio::sync::mpsc::channel::<Result<Bytes, std::io::Error>>(4);
                        tokio::spawn(async move {
                            let frame = format!(
                                "data: {{\"message\":{{\"session_id\":\"{}\"}}}}\n\n",
                                request["session_id"].as_str().unwrap()
                            );
                            tx.send(Ok(Bytes::from(frame))).await.unwrap();
                            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                            tx.send(Ok(Bytes::from_static(
                                b"data: {\"type\":\"turn_completed\"}\n\n",
                            )))
                            .await
                            .unwrap();
                        });
                        Response::builder()
                            .header("content-type", "text/event-stream")
                            .body(Body::from_stream(
                                tokio_stream::wrappers::ReceiverStream::new(rx),
                            ))
                            .unwrap()
                    }),
                ),
            )
            .await
            .unwrap();
        });
        let mut a = AppAgentAdapter::parse_as("app", &format!("http://{address}"), "A")
            .unwrap()
            .unwrap();
        a.activity = Some(Arc::default());
        let mut b = a.clone();
        b.activity = Some(Arc::default());
        let body_a = Bytes::from_static(br#"{"request_id":"a","session_id":"session-a"}"#);
        let body_b = Bytes::from_static(br#"{"request_id":"b","session_id":"session-b"}"#);
        let (response_a, response_b) = tokio::join!(
            relay(a.clone(), HeaderMap::new(), body_a.clone()),
            relay(b.clone(), HeaderMap::new(), body_b)
        );
        assert_eq!(response_a.status(), StatusCode::OK);
        assert_eq!(response_b.status(), StatusCode::OK);
        assert_eq!(
            relay(a.clone(), HeaderMap::new(), body_a).await.status(),
            StatusCode::CONFLICT
        );
        drop((response_a, response_b));
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let a = a.activity.as_ref().unwrap().lock().unwrap().clone();
                let b = b.activity.as_ref().unwrap().lock().unwrap().clone();
                if !a.running && !b.running {
                    assert_eq!(a.session_id.as_deref(), Some("session-a"));
                    assert_eq!(b.session_id.as_deref(), Some("session-b"));
                    assert!(a.detail.is_none() && b.detail.is_none());
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        server.abort();
    }
}
