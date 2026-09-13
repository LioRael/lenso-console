//! Console HTTP translation for the independent Agent turn relay.
use super::{AppAgentAdapter, Bytes, HeaderMap, Json, Response, StatusCode, problem};
use crate::http::{Body, IntoResponse};
use lenso_agent_turn_relay::{StartError, TurnRelay};

pub(super) fn snapshot(activity: &TurnRelay) -> Response {
    Json(activity.snapshot()).into_response()
}

pub(super) async fn relay(adapter: AppAgentAdapter, headers: HeaderMap, body: Bytes) -> Response {
    let Some(activity) = adapter.activity else {
        return problem(StatusCode::NOT_FOUND, "Project activity is unavailable");
    };
    let mut url = adapter.origin;
    url.set_path("/api/console/v1/agent/turns");
    let mut request = adapter.client.post(url);
    if let Some(token) = adapter.authorization {
        request = request.header("authorization", token);
    }
    if let Some(value) = headers.get("last-event-id") {
        request = request.header("last-event-id", value);
    }
    match activity.start(request, body).await {
        Ok(response) => {
            let mut builder = ::http::Response::builder()
                .status(response.status)
                .header("cache-control", "no-store");
            if let Some(value) = response.content_type {
                builder = builder.header("content-type", value);
            }
            builder
                .body(Body::from_stream(response.body))
                .unwrap_or_else(|_| problem(StatusCode::BAD_GATEWAY, "Project response failed"))
        }
        Err(StartError::InvalidRequest) => problem(StatusCode::BAD_REQUEST, "Invalid turn request"),
        Err(StartError::AlreadyRunning) => problem(
            StatusCode::CONFLICT,
            "A task is already running in this project",
        ),
        Err(StartError::UpstreamUnavailable) => {
            problem(StatusCode::BAD_GATEWAY, "Project turn could not start")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Json as AxumJson, Router, body::Body as AxumBody, response::Response as AxumResponse,
        routing::post,
    };

    #[tokio::test]
    async fn detached_turns_finish_independently_and_reject_duplicate_work() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route(
                    "/api/console/v1/agent/turns",
                    post(
                        |headers: HeaderMap, AxumJson(request): AxumJson<serde_json::Value>| async move {
                            assert_eq!(headers["authorization"], "Bearer private-turn-token");
                            assert_eq!(headers["last-event-id"], "resume-event");
                            assert_eq!(headers["content-type"], "application/json");
                            assert_eq!(headers["accept"], "text/event-stream");
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
                            AxumResponse::builder()
                                .header("content-type", "text/event-stream")
                                .body(AxumBody::from_stream(
                                    tokio_stream::wrappers::ReceiverStream::new(rx),
                                ))
                                .unwrap()
                        },
                    ),
                ),
            )
            .await
            .unwrap();
        });
        let mut a = AppAgentAdapter::parse_as("app", &format!("http://{address}"), "A")
            .unwrap()
            .unwrap();
        a.activity = Some(TurnRelay::default());
        a.authorization = Some("Bearer private-turn-token".to_owned());
        let mut b = a.clone();
        b.activity = Some(TurnRelay::default());
        let body_a = Bytes::from_static(br#"{"request_id":"a","session_id":"session-a"}"#);
        let body_b = Bytes::from_static(br#"{"request_id":"b","session_id":"session-b"}"#);
        let mut headers = HeaderMap::new();
        headers.insert("last-event-id", "resume-event".parse().unwrap());
        let (response_a, response_b) = tokio::join!(
            relay(a.clone(), headers.clone(), body_a.clone()),
            relay(b.clone(), headers, body_b)
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
                let a = a.activity.as_ref().unwrap().snapshot();
                let b = b.activity.as_ref().unwrap().snapshot();
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
