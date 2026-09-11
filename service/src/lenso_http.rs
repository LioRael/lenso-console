//! Boundary adapter from Console's application handler to Lenso Web.

use std::{
    any::Any,
    cell::{Cell, RefCell},
    rc::Rc,
};

use bytes::Bytes;
use futures::future::LocalBoxFuture;
use http::{HeaderMap, HeaderName, HeaderValue, Method, header};
use lenso_capability_http_endpoint as endpoint;
use lenso_capability_http_stream_endpoint as stream_endpoint;
use lenso_kernel::{InvocationContext, NativeStreamItem, NativeStreamSession, RuntimeFailure};

use crate::{
    ConsoleApplication,
    http::{Body, Request},
};

const MAX_BUFFERED_RESPONSE_BYTES: usize = 64 * 1024 * 1024;

pub(super) async fn buffered(
    application: ConsoleApplication,
    session: crate::session::SessionBoundary,
    context: InvocationContext,
    request: endpoint::HandleRequest,
) -> Result<endpoint::HandleResponse, RuntimeFailure> {
    let prepared = session
        .prepare(
            context,
            &request.method,
            &request.path,
            request
                .credential
                .as_ref()
                .map(|value| (value.scheme.as_str(), value.value.as_str())),
        )
        .await;
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
    let prepared = session
        .prepare(
            context,
            &request.method,
            &request.path,
            request
                .credential
                .as_ref()
                .map(|value| (value.scheme.as_str(), value.value.as_str())),
        )
        .await;
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
    cancelled: Rc<Cell<bool>>,
    head: Rc<RefCell<Option<stream_endpoint::HandleResponse>>>,
    terminal: Rc<Cell<bool>>,
}

impl ConsoleResponseStream {
    fn new(head: stream_endpoint::HandleResponse, body: Body) -> Self {
        Self {
            body: Rc::new(RefCell::new(Some(body))),
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
        let terminal = self.terminal.clone();
        Box::pin(async move {
            let Some(mut response_body) = body.borrow_mut().take() else {
                return Ok(NativeStreamItem::Terminal(Ok(())));
            };
            let next = response_body.next().await;
            body.borrow_mut().replace(response_body);
            match next {
                Some(Ok(bytes)) => {
                    terminal.set(false);
                    Ok(NativeStreamItem::Message(Box::new(
                        stream_endpoint::HandleResponse {
                            body: Some(bytes.to_vec().into()),
                            headers: None,
                            kind: stream_endpoint::HandleResponseKind::Chunk,
                            status: None,
                        },
                    )))
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
        self.body.borrow_mut().take();
    }
}

fn internal(detail: impl Into<String>) -> RuntimeFailure {
    RuntimeFailure::Internal {
        detail: detail.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lenso_kernel::{CancellationToken, SealedInvocationExtension};

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
