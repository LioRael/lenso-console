//! Console-owned HTTP application types.
//!
//! These types deliberately stop at the Lenso HTTP Capability boundary. They
//! are not a second network server: `lenso.web-ingress` owns sockets, framing,
//! limits, and protocol lifecycle.

use std::{fmt, path::PathBuf};

use ::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, Uri, header};
use bytes::Bytes;
use futures::{Stream, StreamExt as _, stream::BoxStream};
use lenso_kernel::RuntimeFailure;
use serde::Serialize;

pub(super) struct Request {
    pub body: Bytes,
    pub headers: HeaderMap,
    pub method: Method,
    pub path: String,
    pub query: Option<String>,
}

impl Request {
    #[cfg(test)]
    pub fn new(method: Method, target: &str) -> Self {
        let (path, query) = target
            .split_once('?')
            .map_or((target, None), |(path, query)| {
                (path, Some(query.to_owned()))
            });
        Self {
            body: Bytes::new(),
            headers: HeaderMap::new(),
            method,
            path: path.to_owned(),
            query,
        }
    }

    #[cfg(test)]
    pub fn with_body(mut self, body: impl Into<Bytes>) -> Self {
        self.body = body.into();
        self
    }

    #[cfg(test)]
    pub fn with_header(mut self, name: HeaderName, value: &'static str) -> Self {
        self.headers.insert(name, HeaderValue::from_static(value));
        self
    }

    pub fn uri(&self) -> Uri {
        let value = self.query.as_ref().map_or_else(
            || self.path.clone(),
            |query| format!("{}?{query}", self.path),
        );
        value.parse().unwrap_or_else(|_| Uri::from_static("/"))
    }
}

pub(super) enum Body {
    Empty,
    Full(Option<Bytes>),
    Stream(BoxStream<'static, Result<Bytes, RuntimeFailure>>),
}

impl Body {
    pub const fn empty() -> Self {
        Self::Empty
    }

    pub fn from_stream<S, E>(stream: S) -> Self
    where
        S: Stream<Item = Result<Bytes, E>> + Send + 'static,
        E: fmt::Display + Send + 'static,
    {
        Self::Stream(
            stream
                .map(|item| {
                    item.map_err(|error| RuntimeFailure::Internal {
                        detail: format!("Console response stream failed: {error}"),
                    })
                })
                .boxed(),
        )
    }

    pub async fn next(&mut self) -> Option<Result<Bytes, RuntimeFailure>> {
        match self {
            Self::Empty => None,
            Self::Full(value) => value.take().map(Ok),
            Self::Stream(stream) => stream.next().await,
        }
    }

    pub async fn collect(mut self, limit: usize) -> Result<Bytes, RuntimeFailure> {
        let mut output = Vec::new();
        while let Some(chunk) = self.next().await {
            let chunk = chunk?;
            if output.len().saturating_add(chunk.len()) > limit {
                return Err(RuntimeFailure::Internal {
                    detail: "Console response exceeded its buffered response limit".to_owned(),
                });
            }
            output.extend_from_slice(&chunk);
        }
        Ok(output.into())
    }
}

impl From<Bytes> for Body {
    fn from(value: Bytes) -> Self {
        Self::Full(Some(value))
    }
}

impl From<Vec<u8>> for Body {
    fn from(value: Vec<u8>) -> Self {
        Self::from(Bytes::from(value))
    }
}

impl From<String> for Body {
    fn from(value: String) -> Self {
        Self::from(Bytes::from(value))
    }
}

impl From<&'static str> for Body {
    fn from(value: &'static str) -> Self {
        Self::from(Bytes::from_static(value.as_bytes()))
    }
}

pub(super) type Response = http::Response<Body>;

pub(super) struct Json<T>(pub T);
pub(super) struct State<T>(pub T);
pub(super) struct Path<T>(pub T);
pub(super) struct Query<T>(pub T);
pub(super) struct OriginalUri(pub Uri);

pub(super) trait IntoResponse {
    fn into_response(self) -> Response;
}

impl IntoResponse for StatusCode {
    fn into_response(self) -> Response {
        response(self, Body::empty())
    }
}

impl<T: Serialize> IntoResponse for Json<T> {
    fn into_response(self) -> Response {
        json(StatusCode::OK, &self.0)
    }
}

impl<T: Serialize> IntoResponse for (StatusCode, Json<T>) {
    fn into_response(self) -> Response {
        json(self.0, &self.1.0)
    }
}

impl<T: Serialize, const N: usize> IntoResponse
    for (StatusCode, [(HeaderName, &'static str); N], Json<T>)
{
    fn into_response(self) -> Response {
        let mut response = json(self.0, &self.2.0);
        for (name, value) in self.1 {
            response
                .headers_mut()
                .insert(name, HeaderValue::from_static(value));
        }
        response
    }
}

impl<const N: usize> IntoResponse for ([(HeaderName, &'static str); N], Bytes) {
    fn into_response(self) -> Response {
        with_headers(StatusCode::OK, self.0, self.1)
    }
}

impl<const N: usize> IntoResponse for (StatusCode, [(HeaderName, &'static str); N], Vec<u8>) {
    fn into_response(self) -> Response {
        with_headers(self.0, self.1, Bytes::from(self.2))
    }
}

pub(super) fn json<T: Serialize>(status: StatusCode, value: &T) -> Response {
    match serde_json::to_vec(value) {
        Ok(body) => with_headers(
            status,
            [(header::CONTENT_TYPE, "application/json")],
            Bytes::from(body),
        ),
        Err(_) => response(StatusCode::INTERNAL_SERVER_ERROR, Body::empty()),
    }
}

pub(super) fn response(status: StatusCode, body: impl Into<Body>) -> Response {
    ::http::Response::builder()
        .status(status)
        .body(body.into())
        .expect("static Console response is valid")
}

pub(super) fn with_headers<const N: usize>(
    status: StatusCode,
    headers: [(HeaderName, &'static str); N],
    body: Bytes,
) -> Response {
    let mut response = response(status, body);
    for (name, value) in headers {
        response
            .headers_mut()
            .insert(name, HeaderValue::from_static(value));
    }
    response
}

pub(super) fn decode_path(value: &str) -> Option<String> {
    percent_encoding::percent_decode_str(value)
        .decode_utf8()
        .ok()
        .map(std::borrow::Cow::into_owned)
}

pub(super) fn static_path(root: &std::path::Path, request_path: &str) -> Option<PathBuf> {
    let decoded = decode_path(request_path.trim_start_matches('/'))?;
    let mut path = root.to_path_buf();
    for segment in decoded.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." || segment.contains(['\\', '\0']) {
            return None;
        }
        path.push(segment);
    }
    Some(path)
}

pub(super) fn content_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|value| value.to_str()) {
        Some("css") => "text/css; charset=utf-8",
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("json" | "map") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}
