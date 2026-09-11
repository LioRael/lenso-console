use std::{collections::BTreeMap, convert::Infallible, sync::Arc};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use bytes::Bytes;
use futures::{StreamExt as _, future::Either};
use http::{HeaderMap, Method, StatusCode, header};
use lenso::ManyPort;
use lenso_capability_ui_contribution::{
    DescribeResponseRequirementsItem, DescribeResponseRequirementsItemSource,
};
use lenso_capability_workspace_service::{
    DescribeExportsRequest, DescribeExportsResponseServicesItemOperationsItemInteraction,
    InvokeRequest, InvokeRequestMediaType, InvokeResponse, SubscribeRequest,
    SubscribeRequestMediaType, SubscribeResponse, WorkspaceServiceClient,
    WorkspaceServiceDescribeExportsInvocationError, WorkspaceServiceInvokeInvocationError,
    WorkspaceServiceSubscribeInvocationError,
};
use lenso_kernel::{CancellationToken, RuntimeFailure, StreamEvent};
use serde::Serialize;
use tokio::sync::{mpsc, oneshot};
use tokio_stream::wrappers::ReceiverStream;

use crate::http::{Body, IntoResponse, Json, Path, Request, Response, State};

const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const MAX_UNARY_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
const MAX_STREAM_ITEM_BYTES: usize = 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Interaction {
    Request,
    Stream,
}

#[derive(Clone, Debug)]
struct ServiceExport {
    capability_id: String,
    descriptor_version: String,
    operations: BTreeMap<String, Interaction>,
}

#[derive(Clone, Debug)]
struct Route {
    interaction: Interaction,
    owner: String,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct RouteKey {
    operation: String,
    service: String,
    workspace: String,
}

pub(super) struct WorkspaceServiceBuilder {
    exports: BTreeMap<String, BTreeMap<String, ServiceExport>>,
    receiver: mpsc::Receiver<DispatchCommand>,
    routes: BTreeMap<RouteKey, Route>,
    sender: mpsc::Sender<DispatchCommand>,
}

impl WorkspaceServiceBuilder {
    pub(super) async fn prepare(
        services: &ManyPort<WorkspaceServiceClient>,
    ) -> Result<Self, RuntimeFailure> {
        let mut exports = BTreeMap::new();
        for provider in services.iter() {
            let owner = provider.provider_instance().to_owned();
            let response = provider
                .describe_exports(DescribeExportsRequest {})
                .await
                .map_err(|error| describe_failure(&owner, error))?;
            require_plan(
                !response.adapter_revision.trim().is_empty()
                    && response.adapter_revision.len() <= 128
                    && response.services.len() <= 32,
                format!("Workspace service provider `{owner}` returned an invalid export catalog"),
            )?;
            let mut owner_services = BTreeMap::new();
            for service in response.services {
                let mut operations = BTreeMap::new();
                require_plan(
                    valid_slug(&service.service_id)
                        && !service.capability_id.trim().is_empty()
                        && service.capability_id.len() <= 128
                        && !service.descriptor_version.trim().is_empty()
                        && service.descriptor_version.len() <= 32
                        && !service.operations.is_empty()
                        && service.operations.len() <= 32,
                    format!(
                        "Workspace service provider `{owner}` returned an invalid service export"
                    ),
                )?;
                for operation in service.operations {
                    let interaction = match operation.interaction {
                        DescribeExportsResponseServicesItemOperationsItemInteraction::Request => {
                            Interaction::Request
                        }
                        DescribeExportsResponseServicesItemOperationsItemInteraction::Stream => {
                            Interaction::Stream
                        }
                    };
                    require_plan(
                        !operation.name.trim().is_empty()
                            && operation.name.len() <= 64
                            && operations.insert(operation.name, interaction).is_none(),
                        format!(
                            "Workspace service provider `{owner}` returned duplicate or invalid Operations"
                        ),
                    )?;
                }
                require_plan(
                    owner_services
                        .insert(
                            service.service_id,
                            ServiceExport {
                                capability_id: service.capability_id,
                                descriptor_version: service.descriptor_version,
                                operations,
                            },
                        )
                        .is_none(),
                    format!("Workspace service provider `{owner}` returned duplicate service IDs"),
                )?;
            }
            require_plan(
                exports.insert(owner.clone(), owner_services).is_none(),
                format!("Workspace service provider Instance `{owner}` is ambiguous"),
            )?;
        }
        let (sender, receiver) = mpsc::channel(64);
        Ok(Self {
            exports,
            receiver,
            routes: BTreeMap::new(),
            sender,
        })
    }

    pub(super) fn bind_mount(
        &mut self,
        workspace: &str,
        owner: &str,
        requirements: &[DescribeResponseRequirementsItem],
    ) -> anyhow::Result<Vec<PublishedRequirement>> {
        let mut service_ids = std::collections::BTreeSet::new();
        let mut published = Vec::with_capacity(requirements.len());
        for requirement in requirements {
            anyhow::ensure!(
                service_ids.insert(requirement.service_id.clone()),
                "Workspace `{workspace}` declares duplicate service `{}`",
                requirement.service_id
            );
            let export = match requirement.source {
                DescribeResponseRequirementsItemSource::Owner => self
                    .exports
                    .get(owner)
                    .and_then(|services| services.get(&requirement.service_id)),
                DescribeResponseRequirementsItemSource::Subject => None,
            };
            let available = export.is_some_and(|export| {
                export.capability_id == requirement.capability_id
                    && export.descriptor_version == requirement.descriptor_version
                    && requirement
                        .operations
                        .iter()
                        .all(|operation| export.operations.contains_key(operation))
            });
            anyhow::ensure!(
                available || !requirement.required,
                "Workspace `{workspace}` required service `{}` is missing or drifted",
                requirement.service_id
            );
            if let Some(export) = export.filter(|_| available) {
                for operation in &requirement.operations {
                    let interaction = export.operations[operation];
                    let key = RouteKey {
                        operation: operation.clone(),
                        service: requirement.service_id.clone(),
                        workspace: workspace.to_owned(),
                    };
                    anyhow::ensure!(
                        self.routes
                            .insert(
                                key,
                                Route {
                                    interaction,
                                    owner: owner.to_owned(),
                                },
                            )
                            .is_none(),
                        "Workspace `{workspace}` has an ambiguous service route"
                    );
                }
            }
            published.push(PublishedRequirement {
                available,
                capability_id: requirement.capability_id.clone(),
                descriptor_version: requirement.descriptor_version.clone(),
                operations: requirement.operations.clone(),
                required: requirement.required,
                service_id: requirement.service_id.clone(),
                source: match requirement.source {
                    DescribeResponseRequirementsItemSource::Owner => "owner",
                    DescribeResponseRequirementsItemSource::Subject => "subject",
                },
            });
        }
        Ok(published)
    }

    pub(super) fn finish(
        self,
        clients: ManyPort<WorkspaceServiceClient>,
    ) -> (WorkspaceServiceDispatch, WorkspaceServiceRuntime) {
        (
            WorkspaceServiceDispatch {
                routes: Arc::new(self.routes),
                sender: self.sender,
            },
            WorkspaceServiceRuntime {
                clients,
                receiver: self.receiver,
            },
        )
    }
}

#[derive(Clone, Debug, Serialize)]
pub(super) struct PublishedRequirement {
    available: bool,
    capability_id: String,
    descriptor_version: String,
    operations: Vec<String>,
    required: bool,
    service_id: String,
    source: &'static str,
}

impl PublishedRequirement {
    pub(super) fn unavailable(requirement: &DescribeResponseRequirementsItem) -> Self {
        Self {
            available: false,
            capability_id: requirement.capability_id.clone(),
            descriptor_version: requirement.descriptor_version.clone(),
            operations: requirement.operations.clone(),
            required: requirement.required,
            service_id: requirement.service_id.clone(),
            source: match requirement.source {
                DescribeResponseRequirementsItemSource::Owner => "owner",
                DescribeResponseRequirementsItemSource::Subject => "subject",
            },
        }
    }
}

#[derive(Clone)]
pub(super) struct WorkspaceServiceDispatch {
    routes: Arc<BTreeMap<RouteKey, Route>>,
    sender: mpsc::Sender<DispatchCommand>,
}

impl WorkspaceServiceDispatch {
    pub(super) fn unavailable() -> Self {
        let (sender, _receiver) = mpsc::channel(1);
        Self {
            routes: Arc::new(BTreeMap::new()),
            sender,
        }
    }

    pub(super) async fn handle(&self, request: &Request) -> Option<Response> {
        let tail = request.path.strip_prefix("/api/console/v1/pages/")?;
        let parts = tail.split('/').collect::<Vec<_>>();
        let [workspace, "services", service, interaction, operation] = parts.as_slice() else {
            return None;
        };
        if request.method != Method::POST {
            return Some(StatusCode::METHOD_NOT_ALLOWED.into_response());
        }
        let parameters = (
            crate::http::decode_path(workspace)?,
            crate::http::decode_path(service)?,
            crate::http::decode_path(operation)?,
        );
        match *interaction {
            "invoke" => Some(
                invoke(
                    State(self.clone()),
                    Path(parameters),
                    request.context.clone(),
                    request.headers.clone(),
                    request.body.clone(),
                )
                .await,
            ),
            "subscribe" => Some(
                subscribe(
                    State(self.clone()),
                    Path(parameters),
                    request.context.clone(),
                    request.headers.clone(),
                    request.body.clone(),
                )
                .await,
            ),
            _ => None,
        }
    }
}

pub(super) struct WorkspaceServiceRuntime {
    clients: ManyPort<WorkspaceServiceClient>,
    receiver: mpsc::Receiver<DispatchCommand>,
}

impl WorkspaceServiceRuntime {
    pub(super) async fn run(mut self, cancellation: CancellationToken) {
        loop {
            let command = tokio::select! {
                () = cancellation.cancelled() => return,
                command = self.receiver.recv() => {
                    let Some(command) = command else { return; };
                    command
                }
            };
            match command {
                DispatchCommand::Invoke {
                    owner,
                    context,
                    request,
                    response,
                } => {
                    let result = match self.client(&owner) {
                        Some(client) => client
                            .invoke_with_context(context, request)
                            .await
                            .map_err(invoke_failure),
                        None => Err(TransportFailure::unavailable()),
                    };
                    let _ = response.send(result);
                }
                DispatchCommand::Subscribe {
                    owner,
                    context,
                    request,
                    response,
                } => {
                    let result = match self.client(&owner) {
                        Some(client) => client
                            .subscribe_with_context(context, request)
                            .await
                            .map_err(subscribe_failure),
                        None => Err(TransportFailure::unavailable()),
                    };
                    match result {
                        Ok(stream) => {
                            let (sender, receiver) = mpsc::channel(16);
                            if response.send(Ok(receiver)).is_ok() {
                                tokio::task::spawn_local(pump_stream(stream, sender));
                            } else {
                                stream.cancel();
                            }
                        }
                        Err(error) => {
                            let _ = response.send(Err(error));
                        }
                    }
                }
            }
        }
    }

    fn client(&self, owner: &str) -> Option<&WorkspaceServiceClient> {
        self.clients
            .iter()
            .find(|client| client.provider_instance() == owner)
            .map(lenso::BoundCapabilityClient::client)
    }
}

enum DispatchCommand {
    Invoke {
        owner: String,
        context: lenso_kernel::InvocationContext,
        request: InvokeRequest,
        response: oneshot::Sender<Result<InvokeResponse, TransportFailure>>,
    },
    Subscribe {
        owner: String,
        context: lenso_kernel::InvocationContext,
        request: SubscribeRequest,
        response: oneshot::Sender<Result<mpsc::Receiver<StreamFrame>, TransportFailure>>,
    },
}

enum StreamFrame {
    Item(SubscribeResponse),
    Terminal,
    Domain(String),
    Runtime(TransportFailure),
}

async fn pump_stream(
    stream: lenso_kernel::NativeStream<
        lenso_capability_workspace_service::WorkspaceServiceSubscribe,
    >,
    sender: mpsc::Sender<StreamFrame>,
) {
    loop {
        let receive = stream.receive();
        let closed = sender.closed();
        futures::pin_mut!(receive, closed);
        match futures::future::select(receive, closed).await {
            Either::Right(_) => {
                stream.cancel();
                return;
            }
            Either::Left((Ok(StreamEvent::Message(message)), _)) => {
                if decoded_len(&message.body_base64).is_none_or(|len| len > MAX_STREAM_ITEM_BYTES) {
                    let _ = sender
                        .send(StreamFrame::Runtime(TransportFailure::bad_gateway(
                            "workspace_service_response_too_large",
                        )))
                        .await;
                    stream.cancel();
                    return;
                }
                if sender.send(StreamFrame::Item(message)).await.is_err() {
                    stream.cancel();
                    return;
                }
            }
            Either::Left((Ok(StreamEvent::PeerHalfClosed), _)) => {}
            Either::Left((Ok(StreamEvent::Terminal(Ok(()))), _)) => {
                let _ = sender.send(StreamFrame::Terminal).await;
                return;
            }
            Either::Left((Ok(StreamEvent::Terminal(Err(error))), _)) => {
                let _ = sender.send(StreamFrame::Domain(format!("{error:?}"))).await;
                return;
            }
            Either::Left((Err(error), _)) => {
                let _ = sender
                    .send(StreamFrame::Runtime(runtime_failure(&error)))
                    .await;
                return;
            }
        }
    }
}

async fn invoke(
    State(dispatch): State<WorkspaceServiceDispatch>,
    Path((workspace, service, operation)): Path<(String, String, String)>,
    context: lenso_kernel::InvocationContext,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if body.len() > MAX_REQUEST_BYTES {
        return TransportFailure::payload_too_large().into_response();
    }
    if !is_json(&headers) {
        return TransportFailure::unsupported_media_type().into_response();
    }
    let Some(route) = dispatch.routes.get(&RouteKey {
        workspace,
        service: service.clone(),
        operation: operation.clone(),
    }) else {
        return TransportFailure::not_found().into_response();
    };
    if route.interaction != Interaction::Request {
        return TransportFailure::not_found().into_response();
    }
    let (response, receive) = oneshot::channel();
    let command = DispatchCommand::Invoke {
        owner: route.owner.clone(),
        context,
        request: InvokeRequest {
            body_base64: STANDARD.encode(body),
            media_type: InvokeRequestMediaType::ApplicationJson,
            operation,
            service_id: service,
        },
        response,
    };
    if dispatch.sender.send(command).await.is_err() {
        return TransportFailure::unavailable().into_response();
    }
    match receive.await {
        Ok(Ok(response)) => invoke_response(response),
        Ok(Err(error)) => error.into_response(),
        Err(_) => TransportFailure::unavailable().into_response(),
    }
}

fn invoke_response(value: InvokeResponse) -> Response {
    let Ok(body) = STANDARD.decode(value.body_base64) else {
        return TransportFailure::bad_gateway("workspace_service_codec_mismatch").into_response();
    };
    if body.len() > MAX_UNARY_RESPONSE_BYTES {
        return TransportFailure::bad_gateway("workspace_service_response_too_large")
            .into_response();
    }
    let (status, outcome) = match value.outcome {
        lenso_capability_workspace_service::InvokeResponseOutcome::Success => {
            (StatusCode::OK, "success")
        }
        lenso_capability_workspace_service::InvokeResponseOutcome::DomainError => {
            (StatusCode::UNPROCESSABLE_ENTITY, "domain_error")
        }
    };
    (
        status,
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "no-store"),
            (
                header::HeaderName::from_static("x-lenso-workspace-outcome"),
                outcome,
            ),
        ],
        body,
    )
        .into_response()
}

async fn subscribe(
    State(dispatch): State<WorkspaceServiceDispatch>,
    Path((workspace, service, operation)): Path<(String, String, String)>,
    context: lenso_kernel::InvocationContext,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if body.len() > MAX_REQUEST_BYTES {
        return TransportFailure::payload_too_large().into_response();
    }
    if !is_json(&headers) {
        return TransportFailure::unsupported_media_type().into_response();
    }
    let Some(route) = dispatch.routes.get(&RouteKey {
        workspace,
        service: service.clone(),
        operation: operation.clone(),
    }) else {
        return TransportFailure::not_found().into_response();
    };
    if route.interaction != Interaction::Stream {
        return TransportFailure::not_found().into_response();
    }
    let (response, receive) = oneshot::channel();
    let command = DispatchCommand::Subscribe {
        owner: route.owner.clone(),
        context,
        request: SubscribeRequest {
            body_base64: STANDARD.encode(body),
            media_type: SubscribeRequestMediaType::ApplicationJson,
            operation,
            service_id: service,
        },
        response,
    };
    if dispatch.sender.send(command).await.is_err() {
        return TransportFailure::unavailable().into_response();
    }
    let receiver = match receive.await {
        Ok(Ok(receiver)) => receiver,
        Ok(Err(error)) => return error.into_response(),
        Err(_) => return TransportFailure::unavailable().into_response(),
    };
    let stream = ReceiverStream::new(receiver).map(|frame| {
        Ok::<_, Infallible>(Bytes::from(match frame {
            StreamFrame::Item(message) => format!(
                "event: item\ndata: {}\n\n",
                serde_json::json!({
                    "sequence": message.sequence,
                    "outcome": message.outcome,
                    "bodyBase64Url": base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(
                        STANDARD.decode(message.body_base64).expect("validated stream body")
                    ),
                })
            ),
            StreamFrame::Terminal => {
                "event: terminal\ndata: {\"outcome\":\"success\"}\n\n".to_owned()
            }
            StreamFrame::Domain(error) => format!(
                "event: terminal\ndata: {}\n\n",
                serde_json::json!({ "outcome": "domain_error", "code": error })
            ),
            StreamFrame::Runtime(error) => format!(
                "event: terminal\ndata: {}\n\n",
                serde_json::json!({ "outcome": "runtime_failure", "code": error.code })
            ),
        }))
    });
    ::http::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(Body::from_stream(stream))
        .expect("static Workspace service response is valid")
}

#[derive(Clone, Debug)]
struct TransportFailure {
    code: &'static str,
    status: StatusCode,
}

impl TransportFailure {
    const fn bad_gateway(code: &'static str) -> Self {
        Self {
            code,
            status: StatusCode::BAD_GATEWAY,
        }
    }

    const fn not_found() -> Self {
        Self {
            code: "workspace_service_not_found",
            status: StatusCode::NOT_FOUND,
        }
    }

    const fn payload_too_large() -> Self {
        Self {
            code: "workspace_service_request_too_large",
            status: StatusCode::PAYLOAD_TOO_LARGE,
        }
    }

    const fn unavailable() -> Self {
        Self {
            code: "workspace_service_unavailable",
            status: StatusCode::SERVICE_UNAVAILABLE,
        }
    }

    const fn unsupported_media_type() -> Self {
        Self {
            code: "workspace_service_codec_mismatch",
            status: StatusCode::UNSUPPORTED_MEDIA_TYPE,
        }
    }
}

impl IntoResponse for TransportFailure {
    fn into_response(self) -> Response {
        (
            self.status,
            [(header::CACHE_CONTROL, "no-store")],
            Json(serde_json::json!({
                "type": format!("https://lenso.dev/problems/{}", self.code),
                "title": "Workspace service request failed",
                "status": self.status.as_u16(),
                "code": self.code,
            })),
        )
            .into_response()
    }
}

fn describe_failure(
    owner: &str,
    error: WorkspaceServiceDescribeExportsInvocationError,
) -> RuntimeFailure {
    match error {
        WorkspaceServiceDescribeExportsInvocationError::Domain(error) => {
            RuntimeFailure::PluginFailure {
                detail: format!(
                    "Workspace service provider `{owner}` rejected describe: {error:?}"
                ),
            }
        }
        WorkspaceServiceDescribeExportsInvocationError::Runtime(error) => error,
    }
}

fn invoke_failure(error: WorkspaceServiceInvokeInvocationError) -> TransportFailure {
    match error {
        WorkspaceServiceInvokeInvocationError::Domain(_) => TransportFailure {
            code: "workspace_service_rejected",
            status: StatusCode::UNPROCESSABLE_ENTITY,
        },
        WorkspaceServiceInvokeInvocationError::Runtime(error) => runtime_failure(&error),
    }
}

fn subscribe_failure(error: WorkspaceServiceSubscribeInvocationError) -> TransportFailure {
    match error {
        WorkspaceServiceSubscribeInvocationError::Domain(_) => TransportFailure {
            code: "workspace_service_rejected",
            status: StatusCode::UNPROCESSABLE_ENTITY,
        },
        WorkspaceServiceSubscribeInvocationError::Runtime(error) => runtime_failure(&error),
    }
}

fn runtime_failure(error: &RuntimeFailure) -> TransportFailure {
    match error {
        RuntimeFailure::AdmissionClosed | RuntimeFailure::Unavailable { .. } => {
            TransportFailure::unavailable()
        }
        _ => TransportFailure::bad_gateway("workspace_service_runtime_failure"),
    }
}

fn require_plan(valid: bool, detail: String) -> Result<(), RuntimeFailure> {
    if valid {
        Ok(())
    } else {
        Err(RuntimeFailure::InvalidResolvedPlan { detail })
    }
}

fn decoded_len(value: &str) -> Option<usize> {
    STANDARD.decode(value).ok().map(|body| body.len())
}

fn is_json(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value
                .split(';')
                .next()
                .is_some_and(|media_type| media_type.trim() == "application/json")
        })
}

fn valid_slug(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some('a'..='z'))
        && value.len() <= 64
        && chars.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '_' | '-')
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "current_thread")]
    async fn dispatch_preserves_each_requests_context_for_unary_and_stream_calls() {
        use lenso_kernel::{InvocationContext, SealedInvocationExtension};
        for (interaction, operation) in [("invoke", "read"), ("subscribe", "watch")] {
            let mut builder = builder();
            builder
                .bind_mount("alpha", "workspace/default", &[requirement(true)])
                .unwrap();
            let dispatch = WorkspaceServiceDispatch {
                routes: Arc::new(builder.routes),
                sender: builder.sender,
            };
            for subject in ["alice", "bob"] {
                let cancellation = lenso_kernel::CancellationToken::new();
                let assertion = SealedInvocationExtension::signed(
                    "test.actor",
                    "test.issuer",
                    ["example.query@1:read"],
                    subject.as_bytes().to_vec(),
                    "test-proof",
                );
                let mut request = Request::new(
                    Method::POST,
                    &format!(
                        "/api/console/v1/pages/alpha/services/example/{interaction}/{operation}"
                    ),
                )
                .with_header(header::CONTENT_TYPE, "application/json")
                .with_body("{}");
                request.context = InvocationContext::new(
                    42,
                    Some(std::time::Duration::from_secs(30)),
                    cancellation.clone(),
                )
                .with_sealed_extension(assertion.clone())
                .unwrap();
                let receive = async {
                    let command = builder.receiver.recv().await.unwrap();
                    let context = match command {
                        DispatchCommand::Invoke {
                            context, response, ..
                        } => {
                            let _ = response.send(Err(TransportFailure::unavailable()));
                            context
                        }
                        DispatchCommand::Subscribe {
                            context, response, ..
                        } => {
                            let _ = response.send(Err(TransportFailure::unavailable()));
                            context
                        }
                    };
                    assert_eq!(context.request_id(), 42);
                    assert_eq!(context.deadline(), request.context.deadline());
                    assert_eq!(context.sealed_extension("test.actor"), Some(&assertion));
                    cancellation.cancel();
                    assert!(context.cancellation().is_cancelled());
                };
                let (response, ()) = tokio::join!(dispatch.handle(&request), receive);
                assert_eq!(response.unwrap().status(), StatusCode::SERVICE_UNAVAILABLE);
            }
        }
    }

    fn builder() -> WorkspaceServiceBuilder {
        let (sender, receiver) = mpsc::channel(4);
        WorkspaceServiceBuilder {
            exports: BTreeMap::from([(
                "workspace/default".to_owned(),
                BTreeMap::from([(
                    "example".to_owned(),
                    ServiceExport {
                        capability_id: "example.query@1".to_owned(),
                        descriptor_version: "1.0.0".to_owned(),
                        operations: BTreeMap::from([
                            ("read".to_owned(), Interaction::Request),
                            ("watch".to_owned(), Interaction::Stream),
                        ]),
                    },
                )]),
            )]),
            receiver,
            routes: BTreeMap::new(),
            sender,
        }
    }

    fn requirement(required: bool) -> DescribeResponseRequirementsItem {
        DescribeResponseRequirementsItem {
            capability_id: "example.query@1".to_owned(),
            descriptor_version: "1.0.0".to_owned(),
            operations: vec!["read".to_owned(), "watch".to_owned()],
            required,
            service_id: "example".to_owned(),
            source: DescribeResponseRequirementsItemSource::Owner,
        }
    }

    #[test]
    fn owner_exports_are_frozen_into_mount_scoped_routes() {
        let mut builder = builder();
        let published = builder
            .bind_mount("alpha", "workspace/default", &[requirement(true)])
            .unwrap();

        assert!(published[0].available);
        assert_eq!(builder.routes.len(), 2);
        assert_eq!(
            builder.routes[&RouteKey {
                operation: "watch".to_owned(),
                service: "example".to_owned(),
                workspace: "alpha".to_owned(),
            }]
                .interaction,
            Interaction::Stream
        );
        assert!(!builder.routes.contains_key(&RouteKey {
            operation: "read".to_owned(),
            service: "example".to_owned(),
            workspace: "beta".to_owned(),
        }));
    }

    #[test]
    fn required_missing_or_drifted_owner_service_fails_admission() {
        let mut missing = builder();
        assert!(
            missing
                .bind_mount("alpha", "missing/default", &[requirement(true)])
                .unwrap_err()
                .to_string()
                .contains("required service")
        );

        let mut drifted = builder();
        let mut requirement = requirement(true);
        requirement.descriptor_version = "2.0.0".to_owned();
        assert!(
            drifted
                .bind_mount("alpha", "workspace/default", &[requirement])
                .is_err()
        );
    }

    #[test]
    fn identical_service_ids_remain_isolated_between_mounts() {
        let mut builder = builder();
        builder
            .bind_mount("alpha", "workspace/default", &[requirement(true)])
            .unwrap();
        builder
            .bind_mount("beta", "workspace/default", &[requirement(true)])
            .unwrap();

        assert_eq!(builder.routes.len(), 4);
        assert!(builder.routes.contains_key(&RouteKey {
            operation: "read".to_owned(),
            service: "example".to_owned(),
            workspace: "alpha".to_owned(),
        }));
        assert!(builder.routes.contains_key(&RouteKey {
            operation: "read".to_owned(),
            service: "example".to_owned(),
            workspace: "beta".to_owned(),
        }));
    }

    #[test]
    fn unavailable_optional_subject_service_is_published_without_a_route() {
        let mut builder = builder();
        let mut requirement = requirement(false);
        requirement.source = DescribeResponseRequirementsItemSource::Subject;
        let published = builder
            .bind_mount("alpha", "workspace/default", &[requirement])
            .unwrap();

        assert!(!published[0].available);
        assert!(builder.routes.is_empty());
    }
}
