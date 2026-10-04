//! Boundary adapter from Console's application handler to Lenso Web.

use std::{
    any::Any,
    cell::{Cell, RefCell},
    rc::Rc,
};

use bytes::Bytes;
use futures::future::{AbortHandle, Abortable, LocalBoxFuture};
use http::{HeaderMap, HeaderName, HeaderValue, Method, header};
use lenso_capability_http_endpoint as endpoint;
use lenso_capability_http_stream_endpoint as stream_endpoint;
use lenso_kernel::{InvocationContext, NativeStreamItem, NativeStreamSession, RuntimeFailure};

use crate::{
    ConsoleApplication,
    http::{Body, Request},
};

const MAX_BUFFERED_RESPONSE_BYTES: usize = 64 * 1024 * 1024;
const MAX_RESPONSE_CHUNK_BYTES: usize = 65_536;

pub(super) async fn buffered(
    application: ConsoleApplication,
    session: crate::session::SessionBoundary,
    context: InvocationContext,
    request: endpoint::HandleRequest,
) -> Result<endpoint::HandleResponse, RuntimeFailure> {
    let prepared = match expected_subject(&request.headers) {
        Ok(subject) => {
            session
                .prepare_for_subject(
                    context,
                    &request.method,
                    &request.path,
                    request
                        .credential
                        .as_ref()
                        .map(|value| (value.scheme.as_str(), value.value.as_str())),
                    subject,
                )
                .await
        }
        Err(response) => Err(response),
    };
    let response = match prepared {
        Err(response) => *response,
        Ok(context) => {
            let response = application
                .handle(application_request(
                    context.clone(),
                    &request.method,
                    &request.path,
                    request.query,
                    &request.headers,
                    request
                        .credential
                        .as_ref()
                        .map(|value| (value.scheme.as_str(), value.value.as_str())),
                    request.body.into_shared(),
                )?)
                .await;
            session
                .filter_catalog(&context, &request.path, response)
                .await
        }
    };
    let (parts, body) = response.into_parts();
    let body = body.collect(MAX_BUFFERED_RESPONSE_BYTES).await?;
    Ok(endpoint::HandleResponse {
        body: body.to_vec().into(),
        headers: endpoint_headers(&parts.headers)?,
        status: i64::from(parts.status.as_u16()),
    })
}

pub(super) async fn streaming(
    application: ConsoleApplication,
    session: crate::session::SessionBoundary,
    context: InvocationContext,
    request: stream_endpoint::HandleRequest,
) -> Result<ConsoleResponseStream, RuntimeFailure> {
    let prepared = match expected_subject(&request.headers) {
        Ok(subject) => {
            session
                .prepare_for_subject(
                    context,
                    &request.method,
                    &request.path,
                    request
                        .credential
                        .as_ref()
                        .map(|value| (value.scheme.as_str(), value.value.as_str())),
                    subject,
                )
                .await
        }
        Err(response) => Err(response),
    };
    let response = match prepared {
        Err(response) => *response,
        Ok(context) => {
            let response = application
                .handle(application_request(
                    context.clone(),
                    &request.method,
                    &request.path,
                    request.query,
                    &request.headers,
                    request
                        .credential
                        .as_ref()
                        .map(|value| (value.scheme.as_str(), value.value.as_str())),
                    request.body.into_shared(),
                )?)
                .await;
            session
                .filter_catalog(&context, &request.path, response)
                .await
        }
    };
    let (parts, body) = response.into_parts();
    let head = stream_endpoint::HandleResponse {
        body: None,
        headers: Some(stream_headers(&parts.headers)?),
        kind: stream_endpoint::HandleResponseKind::Head,
        status: Some(i64::from(parts.status.as_u16())),
    };
    Ok(ConsoleResponseStream::new(head, body))
}

fn application_request<H>(
    context: InvocationContext,
    method: &str,
    path: &str,
    query: Option<String>,
    headers: &[H],
    credential: Option<(&str, &str)>,
    body: Bytes,
) -> Result<Request, RuntimeFailure>
where
    H: RequestHeader,
{
    let method = method
        .parse::<Method>()
        .map_err(|error| internal(format!("Console request method is invalid: {error}")))?;
    let mut result_headers = HeaderMap::new();
    for value in headers {
        let name = HeaderName::from_bytes(value.name().as_bytes())
            .map_err(|_| internal("Console request contains an invalid header name"))?;
        let value = HeaderValue::from_str(value.value())
            .map_err(|_| internal("Console request contains an invalid header value"))?;
        result_headers.append(name, value);
    }
    if let Some((scheme, value)) = credential {
        let value = HeaderValue::from_str(&format!("{scheme} {value}"))
            .map_err(|_| internal("Console request contains an invalid credential"))?;
        result_headers.insert(header::AUTHORIZATION, value);
    }
    Ok(Request {
        context,
        body,
        headers: result_headers,
        method,
        path: path.to_owned(),
        query,
    })
}

fn expected_subject<H: RequestHeader>(
    headers: &[H],
) -> Result<Option<&str>, Box<crate::http::Response>> {
    let mut matched = headers.iter().filter(|header| {
        header
            .name()
            .eq_ignore_ascii_case("x-lenso-expected-subject")
    });
    let value = matched.next().map(RequestHeader::value);
    if matched.next().is_some()
        || value.is_some_and(|value| {
            value.is_empty() || value.len() > 256 || value.chars().any(char::is_control)
        })
    {
        return Err(crate::session::problem(
            http::StatusCode::BAD_REQUEST,
            "invalid_subject_precondition",
        ));
    }
    Ok(value)
}

trait RequestHeader {
    fn name(&self) -> &str;
    fn value(&self) -> &str;
}

impl RequestHeader for endpoint::HandleRequestHeadersItem {
    fn name(&self) -> &str {
        &self.name
    }

    fn value(&self) -> &str {
        &self.value
    }
}

impl RequestHeader for stream_endpoint::HandleRequestHeadersItem {
    fn name(&self) -> &str {
        &self.name
    }

    fn value(&self) -> &str {
        &self.value
    }
}

fn endpoint_headers(
    headers: &HeaderMap,
) -> Result<Vec<endpoint::HandleResponseHeadersItem>, RuntimeFailure> {
    headers
        .iter()
        .filter(|(name, _)| !ingress_owned(name))
        .map(|(name, value)| {
            Ok(endpoint::HandleResponseHeadersItem {
                name: name.as_str().to_owned(),
                value: value
                    .to_str()
                    .map_err(|_| internal("Console response contains a non-text header"))?
                    .to_owned(),
            })
        })
        .collect()
}

fn stream_headers(
    headers: &HeaderMap,
) -> Result<Vec<stream_endpoint::HandleResponseHeadersItem>, RuntimeFailure> {
    headers
        .iter()
        .filter(|(name, _)| !ingress_owned(name))
        .map(|(name, value)| {
            Ok(stream_endpoint::HandleResponseHeadersItem {
                name: name.as_str().to_owned(),
                value: value
                    .to_str()
                    .map_err(|_| internal("Console response contains a non-text header"))?
                    .to_owned(),
            })
        })
        .collect()
}

fn ingress_owned(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "content-length"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "x-content-type-options"
            | "x-request-id"
    )
}

pub(super) struct ConsoleResponseStream {
    body: Rc<RefCell<Option<Body>>>,
    pending: Rc<RefCell<Bytes>>,
    reading: Rc<RefCell<Option<AbortHandle>>>,
    cancelled: Rc<Cell<bool>>,
    head: Rc<RefCell<Option<stream_endpoint::HandleResponse>>>,
    terminal: Rc<Cell<bool>>,
}

impl ConsoleResponseStream {
    fn new(head: stream_endpoint::HandleResponse, body: Body) -> Self {
        Self {
            body: Rc::new(RefCell::new(Some(body))),
            pending: Rc::new(RefCell::new(Bytes::new())),
            reading: Rc::new(RefCell::new(None)),
            cancelled: Rc::new(Cell::new(false)),
            head: Rc::new(RefCell::new(Some(head))),
            terminal: Rc::new(Cell::new(false)),
        }
    }
}

impl std::fmt::Debug for ConsoleResponseStream {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ConsoleResponseStream")
            .field("cancelled", &self.cancelled.get())
            .field("terminal", &self.terminal.get())
            .finish_non_exhaustive()
    }
}

impl NativeStreamSession for ConsoleResponseStream {
    fn send(&self, _message: Box<dyn Any>) -> LocalBoxFuture<'static, Result<(), RuntimeFailure>> {
        Box::pin(futures::future::ready(Ok(())))
    }

    fn receive(&self) -> LocalBoxFuture<'static, Result<NativeStreamItem, RuntimeFailure>> {
        if let Some(head) = self.head.borrow_mut().take() {
            return Box::pin(futures::future::ready(Ok(NativeStreamItem::Message(
                Box::new(head),
            ))));
        }
        if self.cancelled.get() || self.terminal.replace(true) {
            return Box::pin(futures::future::ready(Ok(NativeStreamItem::Terminal(Ok(
                (),
            )))));
        }
        let body = self.body.clone();
        let pending = self.pending.clone();
        let reading = self.reading.clone();
        let cancelled = self.cancelled.clone();
        let terminal = self.terminal.clone();
        Box::pin(async move {
            if cancelled.get() {
                return Ok(NativeStreamItem::Terminal(Ok(())));
            }
            let buffered = {
                let mut pending = pending.borrow_mut();
                let length = pending.len().min(MAX_RESPONSE_CHUNK_BYTES);
                (length > 0).then(|| pending.split_to(length))
            };
            if let Some(bytes) = buffered {
                terminal.set(false);
                return Ok(response_chunk(&bytes));
            }
            let Some(mut response_body) = body.borrow_mut().take() else {
                return Ok(NativeStreamItem::Terminal(Ok(())));
            };
            let (abort, registration) = AbortHandle::new_pair();
            reading.borrow_mut().replace(abort);
            let next = Abortable::new(response_body.next(), registration).await;
            reading.borrow_mut().take();
            if cancelled.get() {
                return Ok(NativeStreamItem::Terminal(Ok(())));
            }
            let Ok(next) = next else {
                return Ok(NativeStreamItem::Terminal(Ok(())));
            };
            match next {
                Some(Ok(mut bytes)) => {
                    let length = bytes.len().min(MAX_RESPONSE_CHUNK_BYTES);
                    let chunk = bytes.split_to(length);
                    *pending.borrow_mut() = bytes;
                    body.borrow_mut().replace(response_body);
                    terminal.set(false);
                    Ok(response_chunk(&chunk))
                }
                Some(Err(error)) => Err(error),
                None => Ok(NativeStreamItem::Terminal(Ok(()))),
            }
        })
    }

    fn close_send(&self) -> LocalBoxFuture<'static, Result<(), RuntimeFailure>> {
        Box::pin(futures::future::ready(Ok(())))
    }

    fn cancel(&self) {
        self.cancelled.set(true);
        if let Some(reading) = self.reading.borrow_mut().take() {
            reading.abort();
        }
        self.head.borrow_mut().take();
        self.body.borrow_mut().take();
        *self.pending.borrow_mut() = Bytes::new();
    }
}

fn response_chunk(bytes: &Bytes) -> NativeStreamItem {
    NativeStreamItem::Message(Box::new(stream_endpoint::HandleResponse {
        body: Some(bytes.to_vec().into()),
        headers: None,
        kind: stream_endpoint::HandleResponseKind::Chunk,
        status: None,
    }))
}

fn internal(detail: impl Into<String>) -> RuntimeFailure {
    RuntimeFailure::Internal {
        detail: detail.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::Stream;
    use lenso_kernel::{CancellationToken, SealedInvocationExtension};
    use std::{
        pin::Pin,
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
        task::{Context, Poll},
    };

    fn response_stream(body: Body) -> ConsoleResponseStream {
        ConsoleResponseStream::new(
            stream_endpoint::HandleResponse {
                body: None,
                headers: Some(vec![]),
                kind: stream_endpoint::HandleResponseKind::Head,
                status: Some(200),
            },
            body,
        )
    }

    async fn message(stream: &ConsoleResponseStream) -> stream_endpoint::HandleResponse {
        let NativeStreamItem::Message(value) = stream.receive().await.unwrap() else {
            panic!("expected an HTTP stream message");
        };
        *value.downcast().unwrap()
    }

    async fn terminal(stream: &ConsoleResponseStream) {
        assert!(matches!(
            stream.receive().await.unwrap(),
            NativeStreamItem::Terminal(Ok(()))
        ));
    }

    struct OwnedBytes {
        bytes: Vec<u8>,
        dropped: Arc<AtomicBool>,
    }
    impl AsRef<[u8]> for OwnedBytes {
        fn as_ref(&self) -> &[u8] {
            &self.bytes
        }
    }
    impl Drop for OwnedBytes {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    struct TrackedStream {
        values: std::collections::VecDeque<Result<Bytes, std::io::Error>>,
        pending: bool,
        dropped: Arc<AtomicBool>,
    }
    impl Stream for TrackedStream {
        type Item = Result<Bytes, std::io::Error>;
        fn poll_next(mut self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Option<Self::Item>> {
            if self.pending {
                Poll::Pending
            } else {
                Poll::Ready(self.values.pop_front())
            }
        }
    }
    impl Drop for TrackedStream {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    // The deployed assets arrive as a single Full body. Compilation and small
    // health responses never exercised Core's 65536-byte per-chunk bound.
    #[tokio::test]
    async fn large_javascript_and_css_assets_stream_without_truncation() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("contributions/relay.console");
        std::fs::create_dir_all(&directory).unwrap();
        let mut javascript = b"export const apiMajor=1; export function createWorkspace(){return {Page(){return null;}}}".to_vec();
        javascript.resize(347_108, b' ');
        let mut css = b".relay{color:blue}".to_vec();
        css.resize(242_598, b' ');
        std::fs::write(directory.join("page.mjs"), &javascript).unwrap();
        std::fs::write(directory.join("page.css"), &css).unwrap();
        std::fs::write(
            directory.join("contribution.json"),
            serde_json::json!({
                "schema":"console.page-contribution/1", "id":"relay.console", "title":"Relay",
                "subject":{"kind":"console"}, "runtime":{"apiMajor":1},
                "module":"page.mjs", "styles":["page.css"],
                "navigation":{"label":"Relay","items":[{"label":"Home","path":[]}]}
            })
            .to_string(),
        )
        .unwrap();
        let pages = crate::page_contributions::PageCatalog::discover(
            root.path(),
            &std::collections::BTreeSet::new(),
        )
        .unwrap();
        let mut config = crate::ConsolePluginConfig::defaults();
        config.web_root = root.path().to_str().unwrap().into();
        let app =
            crate::console_application(crate::ConsoleConfig::from_plugin(&config).unwrap(), pages);
        let response = app
            .handle(Request::new(Method::GET, "/api/console/v1/pages"))
            .await;
        let catalog: serde_json::Value =
            serde_json::from_slice(&response.into_parts().1.collect(65536).await.unwrap()).unwrap();
        for (path, expected) in [
            (&catalog["mounts"][0]["module"], javascript),
            (&catalog["mounts"][0]["styles"][0], css),
        ] {
            let response = app
                .handle(Request::new(Method::GET, path.as_str().unwrap()))
                .await;
            assert_eq!(response.status(), http::StatusCode::OK);
            let (parts, body) = response.into_parts();
            let stream = ConsoleResponseStream::new(
                stream_endpoint::HandleResponse {
                    body: None,
                    headers: Some(stream_headers(&parts.headers).unwrap()),
                    kind: stream_endpoint::HandleResponseKind::Head,
                    status: Some(200),
                },
                body,
            );
            let head = message(&stream).await;
            assert!(matches!(
                head.kind,
                stream_endpoint::HandleResponseKind::Head
            ));
            assert_eq!(head.status, Some(200));
            let mut assembled = Vec::new();
            let mut chunks = 0;
            while let NativeStreamItem::Message(value) = stream.receive().await.unwrap() {
                let value = value.downcast::<stream_endpoint::HandleResponse>().unwrap();
                assert!(matches!(
                    value.kind,
                    stream_endpoint::HandleResponseKind::Chunk
                ));
                assert!(value.headers.is_none() && value.status.is_none());
                let bytes = value.body.unwrap().into_shared();
                assert!(bytes.len() <= 65536);
                assembled.extend_from_slice(&bytes);
                chunks += 1;
            }
            assert!(chunks > 1);
            assert_eq!(assembled, expected);
            terminal(&stream).await;
        }
    }

    #[tokio::test]
    async fn cancelling_releases_buffered_remainder_and_unsent_head() {
        for after_chunk in [false, true] {
            let dropped = Arc::new(AtomicBool::new(false));
            let bytes = Bytes::from_owner(OwnedBytes {
                bytes: vec![42; 347_108],
                dropped: dropped.clone(),
            });
            let stream = response_stream(Body::from(bytes));
            if after_chunk {
                message(&stream).await;
                assert_eq!(message(&stream).await.body.unwrap().len(), 65536);
            }
            assert!(!dropped.load(Ordering::SeqCst));
            stream.cancel();
            assert!(dropped.load(Ordering::SeqCst));
            terminal(&stream).await;
            terminal(&stream).await;
        }
    }

    #[tokio::test]
    async fn cancelling_wakes_pending_receive_and_drops_upstream_body() {
        let dropped = Arc::new(AtomicBool::new(false));
        let stream = response_stream(Body::from_stream(TrackedStream {
            values: std::collections::VecDeque::new(),
            pending: true,
            dropped: dropped.clone(),
        }));
        message(&stream).await;
        let mut receive = stream.receive();
        assert!(matches!(
            receive
                .as_mut()
                .poll(&mut Context::from_waker(std::task::Waker::noop())),
            Poll::Pending
        ));
        stream.cancel();
        assert!(matches!(
            tokio::time::timeout(std::time::Duration::from_millis(100), receive)
                .await
                .unwrap()
                .unwrap(),
            NativeStreamItem::Terminal(Ok(()))
        ));
        assert!(dropped.load(Ordering::SeqCst));
        terminal(&stream).await;
    }

    #[tokio::test]
    async fn source_boundaries_errors_and_eof_preserve_order_and_release_body() {
        for fail in [false, true] {
            let dropped = Arc::new(AtomicBool::new(false));
            let mut values = std::collections::VecDeque::from([
                Ok(Bytes::new()),
                Ok(Bytes::from(vec![17; 65_539])),
                Ok(Bytes::from_static(b"tail")),
            ]);
            if fail {
                values.push_back(Err(std::io::Error::other("upstream")));
            }
            let stream = response_stream(Body::from_stream(TrackedStream {
                values,
                pending: false,
                dropped: dropped.clone(),
            }));
            message(&stream).await;
            assert!(message(&stream).await.body.unwrap().is_empty());
            assert_eq!(message(&stream).await.body.unwrap().len(), 65536);
            assert_eq!(
                message(&stream).await.body.unwrap().into_shared().as_ref(),
                &[17; 3]
            );
            assert_eq!(
                message(&stream).await.body.unwrap().into_shared().as_ref(),
                b"tail"
            );
            if fail {
                assert!(matches!(
                    stream.receive().await,
                    Err(RuntimeFailure::Internal { .. })
                ));
            } else {
                terminal(&stream).await;
            }
            assert!(dropped.load(Ordering::SeqCst));
            terminal(&stream).await;
        }
    }

    #[test]
    fn http_adapter_preserves_sealed_context_without_promoting_headers_to_identity() {
        let cancellation = CancellationToken::new();
        let assertion = SealedInvocationExtension::signed(
            "test.actor",
            "test.issuer",
            ["example.query@1:read"],
            b"alice".to_vec(),
            "test-proof",
        );
        let context = InvocationContext::new(42, None, cancellation.clone())
            .with_sealed_extension(assertion.clone())
            .unwrap();
        let request = application_request(
            context,
            "POST",
            "/api/example",
            None,
            &[endpoint::HandleRequestHeadersItem {
                name: "x-actor-subject".into(),
                value: "mallory".into(),
            }],
            None,
            Bytes::new(),
        )
        .unwrap();
        assert_eq!(request.context.request_id(), 42);
        assert_eq!(
            request.context.sealed_extension("test.actor"),
            Some(&assertion)
        );
        cancellation.cancel();
        assert!(request.context.cancellation().is_cancelled());

        let anonymous = application_request(
            InvocationContext::new(43, None, CancellationToken::new()),
            "POST",
            "/api/example",
            None,
            &[endpoint::HandleRequestHeadersItem {
                name: "x-actor-subject".into(),
                value: "alice".into(),
            }],
            None,
            Bytes::new(),
        )
        .unwrap();
        assert_eq!(anonymous.context.sealed_extensions().count(), 0);
    }
}
