use super::*;
use axum::{Router, body::Body, response::Response, routing::post};
use futures_util::StreamExt;
use tokio::sync::{Notify, mpsc};

struct Server {
    origin: String,
    task: tokio::task::JoinHandle<()>,
}
impl Server {
    async fn start(router: Router) -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        Self { origin, task }
    }
    fn request(&self) -> reqwest::RequestBuilder {
        reqwest::Client::new().post(&self.origin)
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn completed(relay: &TurnRelay) -> Activity {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let state = relay.snapshot();
            if !state.running {
                return state;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("upstream must complete without waiting for its browser")
}
fn body() -> Bytes {
    Bytes::from_static(br#"{"request_id":"request-a","session_id":"initial"}"#)
}

#[tokio::test]
async fn slow_reader_gets_an_error_while_upstream_and_activity_complete() {
    let release = Arc::new(Notify::new());
    let gate = release.clone();
    let server = Server::start(Router::new().route(
        "/",
        post(move || {
            let gate = gate.clone();
            async move {
                let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(4);
                tokio::spawn(async move {
                    let _ = tx.send(Ok(Bytes::from_static(b": ready\n\n"))).await;
                    gate.notified().await;
                    // More than the relay's entire retained byte budget, with no reads
                    // by the browser. The final event must still update activity.
                    for _ in 0..128 {
                        let _ = tx.send(Ok(Bytes::from(vec![b' '; 32 * 1024]))).await;
                    }
                    let _ = tx
                        .send(Ok(Bytes::from_static(
                            b"\ndata: {\"session_id\":\"final-session\"}\n\n",
                        )))
                        .await;
                });
                Response::builder()
                    .header("content-type", "text/event-stream")
                    .body(Body::from_stream(
                        tokio_stream::wrappers::ReceiverStream::new(rx),
                    ))
                    .unwrap()
            }
        }),
    ))
    .await;
    let relay = TurnRelay::default();
    let mut response = relay.start(server.request(), body()).await.unwrap();
    assert_eq!(response.status, http::StatusCode::OK);
    assert!(matches!(
        relay.clone().start(server.request(), body()).await,
        Err(StartError::AlreadyRunning)
    ));
    release.notify_one();
    let state = completed(&relay).await;
    assert_eq!(state.session_id.as_deref(), Some("final-session"));
    assert!(state.detail.is_none());
    let error = response.body.next().await.unwrap().unwrap_err();
    assert!(error.to_string().contains("fell behind"));
    assert!(response.body.next().await.is_none());
}

#[tokio::test]
async fn disconnect_before_headers_does_not_abandon_the_turn() {
    let accepted = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let (seen, gate) = (accepted.clone(), release.clone());
    let server = Server::start(Router::new().route(
        "/",
        post(move || {
            let (seen, gate) = (seen.clone(), gate.clone());
            async move {
                seen.notify_one();
                gate.notified().await;
                "data: {\"session_id\":\"detached-session\"}\n\n"
            }
        }),
    ))
    .await;
    let relay = TurnRelay::default();
    let (owner, request) = (relay.clone(), server.request());
    let browser = tokio::spawn(async move { owner.start(request, body()).await });
    tokio::time::timeout(Duration::from_secs(2), accepted.notified())
        .await
        .unwrap();
    browser.abort();
    let _ = browser.await;
    release.notify_one();
    let state = completed(&relay).await;
    assert_eq!(state.session_id.as_deref(), Some("detached-session"));
    assert!(state.detail.is_none());
}

#[tokio::test]
async fn active_reader_receives_exact_bytes_and_isolated_activity() {
    const DATA: &[u8] = b"data: {\"message\":{\"session_id\":\"owned-session\"}}\r\n\r\ndata: {\"detail\":\"done\"}\n\n";
    let server = Server::start(Router::new().route(
        "/",
        post(|| async {
            Response::builder()
                .header("content-type", "text/event-stream")
                .body(Body::from_stream(futures_util::stream::iter([
                    Ok::<_, std::io::Error>(Bytes::from_static(&DATA[..16])),
                    Ok(Bytes::from_static(&DATA[16..])),
                ])))
                .unwrap()
        }),
    ))
    .await;
    let relay = TurnRelay::default();
    let other = TurnRelay::default();
    assert!(matches!(
        relay
            .start(server.request(), Bytes::from_static(b"{invalid"))
            .await,
        Err(StartError::InvalidRequest)
    ));
    assert!(!relay.snapshot().running);
    let mut response = relay.start(server.request(), body()).await.unwrap();
    assert_eq!(response.content_type.unwrap(), "text/event-stream");
    let mut received = Vec::new();
    while let Some(bytes) = response.body.next().await {
        received.extend_from_slice(&bytes.unwrap());
    }
    assert_eq!(received, DATA);
    let state = completed(&relay).await;
    assert_eq!(state.session_id.as_deref(), Some("owned-session"));
    assert_eq!(state.detail.as_deref(), Some("done"));
    assert!(other.snapshot().session_id.is_none());
    assert!(relay.start(server.request(), body()).await.is_ok());
    completed(&relay).await;
}

#[tokio::test]
async fn upstream_failures_release_admission_and_preserve_http_rejections() {
    let relay = TurnRelay::default();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    assert!(matches!(
        relay
            .start(reqwest::Client::new().post(origin), body())
            .await,
        Err(StartError::UpstreamUnavailable)
    ));
    assert!(!relay.snapshot().running);
    assert!(relay.snapshot().detail.is_some());
    let server = Server::start(Router::new().route(
        "/",
        post(|| async { (http::StatusCode::FORBIDDEN, "denied") }),
    ))
    .await;
    let mut response = relay.start(server.request(), body()).await.unwrap();
    assert_eq!(response.status, http::StatusCode::FORBIDDEN);
    let mut received = Vec::new();
    while let Some(bytes) = response.body.next().await {
        received.extend_from_slice(&bytes.unwrap());
    }
    assert_eq!(received, b"denied");
    assert!(completed(&relay).await.detail.unwrap().contains("403"));
}

#[tokio::test]
async fn failed_upstream_body_is_a_stream_error_not_successful_eof() {
    let release = Arc::new(Notify::new());
    let gate = release.clone();
    let server = Server::start(Router::new().route(
        "/",
        post(move || {
            let gate = gate.clone();
            async move {
                let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(4);
                tokio::spawn(async move {
                    let _ = tx.send(Ok(Bytes::from_static(b"data: {}\n\n"))).await;
                    gate.notified().await;
                    let _ = tx
                        .send(Err(std::io::Error::other("fixture upstream failure")))
                        .await;
                });
                Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx))
            }
        }),
    ))
    .await;
    let relay = TurnRelay::default();
    let mut response = relay.start(server.request(), body()).await.unwrap();
    assert!(response.body.next().await.unwrap().is_ok());
    release.notify_one();
    assert!(
        tokio::time::timeout(Duration::from_secs(2), response.body.next())
            .await
            .unwrap()
            .unwrap()
            .is_err()
    );
    assert!(response.body.next().await.is_none());
    assert!(completed(&relay).await.detail.is_some());
}
