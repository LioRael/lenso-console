//! Detachable Agent turn streams. The caller supplies the selected, authenticated
//! upstream request; this module owns transient activity and browser backpressure.
use bytes::Bytes;
use futures_core::Stream;
use serde::Serialize;
use std::{
    pin::Pin,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{broadcast, oneshot};

const QUEUE_FRAMES: usize = 32;
const FRAME_BYTES: usize = 32 * 1024;
const MAX_LINE_BYTES: usize = 1024 * 1024;

type Frame = Result<Bytes, String>;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub request_id: Option<String>,
    pub session_id: Option<String>,
    pub running: bool,
    pub detail: Option<String>,
}

/// Clones share the same per-Agent admission gate and activity. A new process
/// must receive a new relay. Activity is a transient projection, not session storage.
#[derive(Clone, Debug, Default)]
pub struct TurnRelay {
    state: Arc<Mutex<Activity>>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum StartError {
    InvalidRequest,
    AlreadyRunning,
    UpstreamUnavailable,
}

pub struct TurnResponse {
    pub status: http::StatusCode,
    pub content_type: Option<http::HeaderValue>,
    pub body: Pin<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>>,
}

impl TurnRelay {
    #[must_use]
    pub fn snapshot(&self) -> Activity {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Starts one turn and returns response headers and a detachable body. Dropping
    /// the caller or body never cancels the upstream turn. A lagging reader receives
    /// an explicit stream error; it must recover history/activity from its Agent.
    pub async fn start(
        &self,
        request: reqwest::RequestBuilder,
        body: Bytes,
    ) -> Result<TurnResponse, StartError> {
        let value: serde_json::Value =
            serde_json::from_slice(&body).map_err(|_| StartError::InvalidRequest)?;
        {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if state.running {
                return Err(StartError::AlreadyRunning);
            }
            *state = Activity {
                request_id: value["request_id"].as_str().map(str::to_owned),
                session_id: value["session_id"].as_str().map(str::to_owned),
                running: true,
                detail: None,
            };
        }
        let guard = RunningTurn {
            state: self.state.clone(),
            finished: false,
        };
        let (response_tx, response_rx) = oneshot::channel();
        tokio::spawn(async move {
            let request = request
                .body(body)
                .header("content-type", "application/json")
                .header("accept", "text/event-stream");
            let sent = tokio::time::timeout(Duration::from_secs(30), request.send()).await;
            let mut response = match sent {
                Ok(Ok(response)) => response,
                other => {
                    let detail = match other {
                        Ok(Err(error)) => error.to_string(),
                        Err(error) => error.to_string(),
                        Ok(Ok(_)) => unreachable!(),
                    };
                    guard.finish(Some(detail));
                    let _ = response_tx.send(Err(StartError::UpstreamUnavailable));
                    return;
                }
            };
            let status = response.status();
            let (tx, rx) = broadcast::channel(QUEUE_FRAMES);
            let _ = response_tx.send(Ok(TurnResponse {
                status,
                content_type: response.headers().get("content-type").cloned(),
                body: reader(rx),
            }));
            let mut observer = LineObserver::default();
            let detail = loop {
                match response.chunk().await {
                    Ok(Some(bytes)) => {
                        observer.push(&guard.state, &bytes);
                        // Fixed-size owned frames bound retained queue memory. Broadcast
                        // never waits for a browser; lag is an error, not silent data loss.
                        for chunk in bytes.chunks(FRAME_BYTES) {
                            let _ = tx.send(Ok(Bytes::copy_from_slice(chunk)));
                            tokio::task::yield_now().await;
                        }
                    }
                    Ok(None) => {
                        break (!status.is_success())
                            .then(|| format!("Project turn returned HTTP {status}"));
                    }
                    Err(error) => {
                        let detail = error.to_string();
                        let _ = tx.send(Err(detail.clone()));
                        break Some(detail);
                    }
                }
            };
            guard.finish(detail);
        });
        response_rx
            .await
            .unwrap_or(Err(StartError::UpstreamUnavailable))
    }
}

fn reader(
    rx: broadcast::Receiver<Frame>,
) -> Pin<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>> {
    Box::pin(futures_util::stream::unfold(Some(rx), |state| async move {
        let mut rx = state?;
        match rx.recv().await {
            Ok(Ok(bytes)) => Some((Ok(bytes), Some(rx))),
            Ok(Err(detail)) => Some((Err(std::io::Error::other(detail)), None)),
            Err(broadcast::error::RecvError::Lagged(_)) => Some((
                Err(std::io::Error::other(
                    "Agent turn reader fell behind; reconnect and read Agent history",
                )),
                None,
            )),
            Err(broadcast::error::RecvError::Closed) => None,
        }
    }))
}

struct RunningTurn {
    state: Arc<Mutex<Activity>>,
    finished: bool,
}

impl RunningTurn {
    fn finish(mut self, detail: Option<String>) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.running = false;
        if detail.is_some() {
            state.detail = detail;
        }
        self.finished = true;
    }
}

impl Drop for RunningTurn {
    fn drop(&mut self) {
        if !self.finished {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            state.running = false;
            state.detail = Some("Agent turn relay stopped before upstream completion".to_owned());
        }
    }
}

#[derive(Default)]
struct LineObserver {
    pending: Vec<u8>,
    discarding: bool,
}

impl LineObserver {
    fn push(&mut self, activity: &Arc<Mutex<Activity>>, bytes: &[u8]) {
        for part in bytes.split_inclusive(|byte| *byte == b'\n') {
            if self.pending.len() + part.len() > MAX_LINE_BYTES {
                self.pending.clear();
                self.discarding = true;
            }
            if !self.discarding {
                self.pending.extend_from_slice(part);
            }
            if part.last() == Some(&b'\n') {
                if !self.discarding {
                    observe(activity, &self.pending);
                }
                self.pending.clear();
                self.discarding = false;
            }
        }
    }
}

fn observe(activity: &Arc<Mutex<Activity>>, line: &[u8]) {
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
mod tests;
