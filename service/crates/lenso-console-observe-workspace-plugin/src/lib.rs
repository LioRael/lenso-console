//! First-party Observe Workspace Plugin.

mod otlp;
mod otlp_body;
mod store;

use std::{
    any::Any,
    cell::{Cell, RefCell},
    path::{Path, PathBuf},
    rc::Rc,
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures::{
    FutureExt as _,
    future::{Either, ready, select},
};
use lenso_capability_http_stream_endpoint as http_stream;
use lenso_capability_observability_query::{
    self as observe, ListRequestsRequest, ListTraceLogsRequest, QueryListRequestsInvocationError,
    QueryListTraceLogsInvocationError, QueryReadIngestionHealthInvocationError,
    QueryReadTraceInvocationError, QueryWatchRequestsInvocationError, ReadIngestionHealthRequest,
    ReadTraceRequest, WatchRequestsError, WatchRequestsRequest, WatchRequestsResponse,
};
use lenso_capability_ui_contribution::{
    self as ui, DescribeRequest, DescribeResponse, DescribeResponseAssetsItem,
    DescribeResponseAssetsItemMediaType, DescribeResponseNavigation,
    DescribeResponseNavigationItemsItem, DescribeResponseRequirementsItem,
    DescribeResponseRequirementsItemSource, DescribeResponseSubject, DescribeResponseSubjectKind,
};
use lenso_capability_workspace_service::{
    self as service, DescribeExportsRequest, DescribeExportsResponse,
    DescribeExportsResponseServicesItem, DescribeExportsResponseServicesItemOperationsItem,
    DescribeExportsResponseServicesItemOperationsItemInteraction, InvokeError, InvokeRequest,
    InvokeResponse, InvokeResponseOutcome, SubscribeError, SubscribeRequest, SubscribeResponse,
    SubscribeResponseOutcome, WorkspaceServiceInvoke, WorkspaceServiceSubscribe,
    WorkspaceServiceSubscribeInvocationError,
};
use lenso_kernel::{
    DeactivateContext, InvocationContext, NativeStreamItem, NativeStreamSession, PrepareContext,
    RuntimeFailure,
};
use store::{ObserveStore, ObserveWorker, StoreConfig};

const SERVICE_ID: &str = "observe";
const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ObserveConfig {
    source_id: String,
    source_label: String,
    database: PathBuf,
    token_file: PathBuf,
    retention_days: u32,
    retention_bytes: u64,
}

fn validate_config(config: &ObserveConfig) -> Result<(), RuntimeFailure> {
    if !valid_slug(&config.source_id)
        || config.source_label.trim().is_empty()
        || config.source_label.len() > 128
        || config.database.as_os_str().is_empty()
        || config.token_file.as_os_str().is_empty()
        || !(1..=30).contains(&config.retention_days)
        || !(1024 * 1024..=512 * 1024 * 1024).contains(&config.retention_bytes)
    {
        return Err(invalid_plan(
            "Observe configuration is outside reviewed bounds",
        ));
    }
    Ok(())
}

#[lenso::plugin(
    lifecycle,
    configuration_schema = "config.schema.json",
    validate = validate_config
)]
#[derive(Clone, Debug)]
struct ObserveWorkspace {
    #[config]
    config: ObserveConfig,
    store: Rc<RefCell<Option<ObserveStore>>>,
    worker: Rc<RefCell<Option<ObserveWorker>>>,
    token: Rc<RefCell<Option<String>>>,
    #[tasks]
    tasks: lenso::ManagedTasks,
}

#[lenso::provides(
    ui::Contribution,
    service::WorkspaceService,
    observe::Query,
    http_stream::StreamEndpoint
)]
impl ObserveWorkspace {
    fn describe_contribution(
        &self,
        _context: InvocationContext,
        _request: DescribeRequest,
    ) -> lenso_kernel::NativeRequestFuture<ui::Contribution> {
        let source_id = self.config.source_id.clone();
        let source_label = self.config.source_label.clone();
        Box::pin(ready(Ok(Ok(DescribeResponse {
            assets: vec![
                DescribeResponseAssetsItem {
                    content_base64: STANDARD.encode(include_bytes!("../workspace.mjs")),
                    media_type: DescribeResponseAssetsItemMediaType::TextJavascriptCharsetUtf,
                    path: "workspace.mjs".to_owned(),
                },
                DescribeResponseAssetsItem {
                    content_base64: STANDARD.encode(include_bytes!("../workspace.css")),
                    media_type: DescribeResponseAssetsItemMediaType::TextCssCharsetUtf,
                    path: "workspace.css".to_owned(),
                },
            ],
            module: "workspace.mjs".to_owned(),
            navigation: DescribeResponseNavigation {
                items: vec![DescribeResponseNavigationItemsItem {
                    label: "Requests".to_owned(),
                    path: Vec::new(),
                }],
                label: format!("Observe · {source_label}"),
            },
            requirements: vec![DescribeResponseRequirementsItem {
                capability_id: observe::CAPABILITY_ID.to_owned(),
                descriptor_version: observe::DESCRIPTOR_VERSION.to_owned(),
                operations: vec![
                    observe::LIST_REQUESTS_OPERATION.to_owned(),
                    observe::READ_TRACE_OPERATION.to_owned(),
                    observe::LIST_TRACE_LOGS_OPERATION.to_owned(),
                    observe::WATCH_REQUESTS_OPERATION.to_owned(),
                    observe::READ_INGESTION_HEALTH_OPERATION.to_owned(),
                ],
                required: true,
                service_id: SERVICE_ID.to_owned(),
                source: DescribeResponseRequirementsItemSource::Owner,
            }],
            revision: env!("CARGO_PKG_VERSION").to_owned(),
            styles: vec!["workspace.css".to_owned()],
            subject: Some(DescribeResponseSubject {
                app_id: Some(Some(source_id)),
                kind: DescribeResponseSubjectKind::App,
            }),
            title: format!("Observe · {source_label}"),
            workspace_id: format!("observe-{}", self.config.source_id),
        }))))
    }

    #[allow(clippy::unused_self)]
    fn describe_exports(
        &self,
        _context: InvocationContext,
        _request: DescribeExportsRequest,
    ) -> lenso_kernel::NativeRequestFuture<service::WorkspaceServiceDescribeExports> {
        Box::pin(ready(Ok(Ok(DescribeExportsResponse {
            adapter_revision: env!("CARGO_PKG_VERSION").to_owned(),
            services: vec![DescribeExportsResponseServicesItem {
                capability_id: observe::CAPABILITY_ID.to_owned(),
                descriptor_version: observe::DESCRIPTOR_VERSION.to_owned(),
                operations: vec![
                    export_request(observe::LIST_REQUESTS_OPERATION),
                    export_request(observe::READ_TRACE_OPERATION),
                    export_request(observe::LIST_TRACE_LOGS_OPERATION),
                    export_stream(observe::WATCH_REQUESTS_OPERATION),
                    export_request(observe::READ_INGESTION_HEALTH_OPERATION),
                ],
                service_id: SERVICE_ID.to_owned(),
            }],
        }))))
    }

    fn invoke(
        &self,
        _context: InvocationContext,
        request: InvokeRequest,
    ) -> lenso_kernel::NativeRequestFuture<WorkspaceServiceInvoke> {
        let store = self.store();
        Box::pin(async move {
            let store = store?;
            if request.service_id != SERVICE_ID {
                return Ok(Err(InvokeError::UnknownService));
            }
            let body = match decode_workspace_body(&request.body_base64) {
                Ok(body) => body,
                Err(error) => return Ok(Err(error)),
            };
            let response = match request.operation.as_str() {
                observe::LIST_REQUESTS_OPERATION => match decode_json(&body) {
                    Ok(value) => invoke_json(store.list_requests(value).await?),
                    Err(error) => Err(error),
                },
                observe::READ_TRACE_OPERATION => match decode_json(&body) {
                    Ok(value) => invoke_json(store.read_trace(value).await?),
                    Err(error) => Err(error),
                },
                observe::LIST_TRACE_LOGS_OPERATION => match decode_json(&body) {
                    Ok(value) => invoke_json(store.list_logs(value).await?),
                    Err(error) => Err(error),
                },
                observe::READ_INGESTION_HEALTH_OPERATION => match decode_json(&body) {
                    Ok(value) => invoke_json(store.health(value).await?),
                    Err(error) => Err(error),
                },
                _ => Err(InvokeError::UnknownOperation),
            };
            Ok(response)
        })
    }

    fn subscribe(
        &self,
        context: InvocationContext,
        request: SubscribeRequest,
    ) -> futures::future::LocalBoxFuture<
        'static,
        Result<
            lenso::ProviderStream<WorkspaceServiceSubscribe>,
            WorkspaceServiceSubscribeInvocationError,
        >,
    > {
        if request.service_id != SERVICE_ID {
            return Box::pin(ready(Err(
                WorkspaceServiceSubscribeInvocationError::Domain(SubscribeError::UnknownService),
            )));
        }
        if request.operation != observe::WATCH_REQUESTS_OPERATION {
            return Box::pin(ready(Err(
                WorkspaceServiceSubscribeInvocationError::Domain(SubscribeError::UnknownOperation),
            )));
        }
        let _open: WatchRequestsRequest = match STANDARD
            .decode(request.body_base64)
            .ok()
            .and_then(|body| serde_json::from_slice::<WatchRequestsRequest>(&body).ok())
        {
            Some(open) if open.source_id == self.config.source_id => open,
            _ => {
                return Box::pin(ready(Err(
                    WorkspaceServiceSubscribeInvocationError::Domain(SubscribeError::CodecMismatch),
                )));
            }
        };
        let store = self.store();
        let tasks = self.tasks.clone();
        Box::pin(async move {
            let store = store.map_err(WorkspaceServiceSubscribeInvocationError::Runtime)?;
            let mut feed = store.subscribe();
            let (stream, mut channel) =
                lenso::ProviderStream::<WorkspaceServiceSubscribe>::channel(&context, 32);
            tasks
                .spawn_local(async move {
                    let mut sequence = 0u64;
                    loop {
                        let receive = feed.recv().fuse();
                        let cancelled = context.cancellation().cancelled().fuse();
                        futures::pin_mut!(receive, cancelled);
                        let item = match select(receive, cancelled).await {
                            Either::Left((result, _)) => {
                                if let Some(item) = classify_feed_receive(&store, result) {
                                    item
                                } else {
                                    let _ = channel.complete(Ok(())).await;
                                    return;
                                }
                            }
                            Either::Right(((), _)) => {
                                let _ = channel.complete(Ok(())).await;
                                return;
                            }
                        };
                        let Ok(body) = serde_json::to_vec(&item) else {
                            return;
                        };
                        if channel
                            .send(SubscribeResponse {
                                body_base64: STANDARD.encode(body),
                                outcome: SubscribeResponseOutcome::Item,
                                sequence: sequence.to_string(),
                            })
                            .await
                            .is_err()
                        {
                            return;
                        }
                        sequence = sequence.saturating_add(1);
                    }
                })
                .map_err(|error| {
                    WorkspaceServiceSubscribeInvocationError::Runtime(plugin_failure(format!(
                        "Observe feed task failed: {error:?}"
                    )))
                })?;
            Ok(stream)
        })
    }

    async fn list_requests(
        &self,
        _context: InvocationContext,
        request: ListRequestsRequest,
    ) -> Result<observe::ListRequestsResponse, QueryListRequestsInvocationError> {
        self.store()
            .map_err(QueryListRequestsInvocationError::Runtime)?
            .list_requests(request)
            .await
            .map_err(QueryListRequestsInvocationError::Runtime)?
            .map_err(QueryListRequestsInvocationError::Domain)
    }
    async fn list_trace_logs(
        &self,
        _context: InvocationContext,
        request: ListTraceLogsRequest,
    ) -> Result<observe::ListTraceLogsResponse, QueryListTraceLogsInvocationError> {
        self.store()
            .map_err(QueryListTraceLogsInvocationError::Runtime)?
            .list_logs(request)
            .await
            .map_err(QueryListTraceLogsInvocationError::Runtime)?
            .map_err(QueryListTraceLogsInvocationError::Domain)
    }
    async fn read_ingestion_health(
        &self,
        _context: InvocationContext,
        request: ReadIngestionHealthRequest,
    ) -> Result<observe::ReadIngestionHealthResponse, QueryReadIngestionHealthInvocationError> {
        self.store()
            .map_err(QueryReadIngestionHealthInvocationError::Runtime)?
            .health(request)
            .await
            .map_err(QueryReadIngestionHealthInvocationError::Runtime)?
            .map_err(QueryReadIngestionHealthInvocationError::Domain)
    }
    async fn read_trace(
        &self,
        _context: InvocationContext,
        request: ReadTraceRequest,
    ) -> Result<observe::ReadTraceResponse, QueryReadTraceInvocationError> {
        self.store()
            .map_err(QueryReadTraceInvocationError::Runtime)?
            .read_trace(request)
            .await
            .map_err(QueryReadTraceInvocationError::Runtime)?
            .map_err(QueryReadTraceInvocationError::Domain)
    }
    fn watch_requests(
        &self,
        context: InvocationContext,
        request: WatchRequestsRequest,
    ) -> futures::future::LocalBoxFuture<
        'static,
        Result<
            lenso::ProviderStream<observe::QueryWatchRequests>,
            QueryWatchRequestsInvocationError,
        >,
    > {
        let WatchRequestsRequest { source_id } = request;
        if source_id != self.config.source_id {
            return Box::pin(ready(Err(QueryWatchRequestsInvocationError::Domain(
                WatchRequestsError::InvalidQuery,
            ))));
        }
        let store = self.store();
        let tasks = self.tasks.clone();
        Box::pin(async move {
            let store = store.map_err(QueryWatchRequestsInvocationError::Runtime)?;
            let mut feed = store.subscribe();
            let (stream, mut channel) =
                lenso::ProviderStream::<observe::QueryWatchRequests>::channel(&context, 32);
            tasks
                .spawn_local(async move {
                    loop {
                        let receive = feed.recv().fuse();
                        let cancelled = context.cancellation().cancelled().fuse();
                        futures::pin_mut!(receive, cancelled);
                        let item = match select(receive, cancelled).await {
                            Either::Left((result, _)) => {
                                if let Some(item) = classify_feed_receive(&store, result) {
                                    item
                                } else {
                                    let _ = channel.complete(Ok(())).await;
                                    return;
                                }
                            }
                            Either::Right(((), _)) => {
                                let _ = channel.complete(Ok(())).await;
                                return;
                            }
                        };
                        if channel.send(item).await.is_err() {
                            return;
                        }
                    }
                })
                .map_err(|error| {
                    QueryWatchRequestsInvocationError::Runtime(plugin_failure(format!(
                        "Observe query feed task failed: {error:?}"
                    )))
                })?;
            Ok(stream)
        })
    }

    fn describe_stream(
        &self,
        _context: InvocationContext,
        _request: http_stream::DescribeRequest,
    ) -> lenso_kernel::NativeRequestFuture<http_stream::StreamEndpointDescribe> {
        let _ = self;
        Box::pin(ready(Ok(Ok(http_stream::DescribeResponse {
            routes: [
                ("/v1/traces", "observe.otlp.traces"),
                ("/v1/logs", "observe.otlp.logs"),
            ]
            .into_iter()
            .map(|(path, route_id)| http_stream::DescribeResponseRoutesItem {
                method: "POST".to_owned(),
                path: path.to_owned(),
                route_id: route_id.to_owned(),
            })
            .collect(),
        }))))
    }

    fn handle_stream(
        &self,
        _context: InvocationContext,
        request: http_stream::HandleRequest,
    ) -> futures::future::LocalBoxFuture<
        'static,
        Result<OtlpResponseStream, http_stream::StreamEndpointHandleInvocationError>,
    > {
        let store = self.store();
        let token = self.token.borrow().clone();
        Box::pin(async move {
            let store = store.map_err(http_stream::StreamEndpointHandleInvocationError::Runtime)?;
            let token = token.ok_or_else(|| {
                http_stream::StreamEndpointHandleInvocationError::Runtime(
                    RuntimeFailure::Unavailable {
                        capability: http_stream::CAPABILITY_ID,
                    },
                )
            })?;
            if !matches!(
                request.route_id.as_str(),
                "observe.otlp.traces" | "observe.otlp.logs"
            ) {
                return Err(http_stream::StreamEndpointHandleInvocationError::Domain(
                    http_stream::HandleError::Rejected,
                ));
            }
            Ok(OtlpResponseStream::new(
                otlp::handle(store, &token, request).await,
            ))
        })
    }
}

struct OtlpResponseStream {
    body: Rc<RefCell<Option<Vec<u8>>>>,
    cancelled: Rc<Cell<bool>>,
    head: Rc<RefCell<Option<http_stream::HandleResponse>>>,
}

impl OtlpResponseStream {
    fn new(response: otlp::Response) -> Self {
        Self {
            body: Rc::new(RefCell::new(Some(response.body))),
            cancelled: Rc::new(Cell::new(false)),
            head: Rc::new(RefCell::new(Some(http_stream::HandleResponse {
                body: None,
                headers: Some(response.headers),
                kind: http_stream::HandleResponseKind::Head,
                status: Some(i64::from(response.status)),
            }))),
        }
    }
}

impl std::fmt::Debug for OtlpResponseStream {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("OtlpResponseStream")
            .finish_non_exhaustive()
    }
}

impl NativeStreamSession for OtlpResponseStream {
    fn send(
        &self,
        _message: Box<dyn Any>,
    ) -> futures::future::LocalBoxFuture<'static, Result<(), RuntimeFailure>> {
        Box::pin(ready(Ok(())))
    }

    fn receive(
        &self,
    ) -> futures::future::LocalBoxFuture<'static, Result<NativeStreamItem, RuntimeFailure>> {
        if let Some(head) = self.head.borrow_mut().take() {
            return Box::pin(ready(Ok(NativeStreamItem::Message(Box::new(head)))));
        }
        if self.cancelled.get() {
            self.body.take();
        }
        let body = self.body.take();
        Box::pin(ready(Ok(match body {
            Some(body) if !body.is_empty() => {
                NativeStreamItem::Message(Box::new(http_stream::HandleResponse {
                    body: Some(body.into()),
                    headers: None,
                    kind: http_stream::HandleResponseKind::Chunk,
                    status: None,
                }))
            }
            _ => NativeStreamItem::Terminal(Ok(())),
        })))
    }

    fn close_send(&self) -> futures::future::LocalBoxFuture<'static, Result<(), RuntimeFailure>> {
        Box::pin(ready(Ok(())))
    }

    fn cancel(&self) {
        self.cancelled.set(true);
        self.body.take();
    }
}

fn classify_feed_receive(
    store: &ObserveStore,
    result: Result<WatchRequestsResponse, tokio::sync::broadcast::error::RecvError>,
) -> Option<WatchRequestsResponse> {
    match result {
        Ok(item) => Some(item),
        Err(tokio::sync::broadcast::error::RecvError::Lagged(count)) => {
            store.record_feed_lag();
            Some(store::lag_item(count))
        }
        Err(tokio::sync::broadcast::error::RecvError::Closed) => None,
    }
}

impl ObserveWorkspace {
    fn store(&self) -> Result<ObserveStore, RuntimeFailure> {
        self.store
            .borrow()
            .clone()
            .ok_or(RuntimeFailure::Unavailable {
                capability: observe::CAPABILITY_ID,
            })
    }
}

impl lenso::Lifecycle for ObserveWorkspace {
    async fn prepare(&self, _context: PrepareContext) -> Result<(), RuntimeFailure> {
        if self.worker.borrow().is_some() || self.token.borrow().is_some() {
            return Err(plugin_failure("Observe was prepared twice"));
        }
        let token = read_or_create_token(&self.config.token_file).map_err(plugin_failure)?;
        let (store, worker) = ObserveWorker::start(StoreConfig {
            database: self.config.database.clone(),
            source_id: self.config.source_id.clone(),
            retention_days: self.config.retention_days,
            retention_bytes: self.config.retention_bytes,
        })
        .await?;
        self.store.replace(Some(store));
        self.worker.replace(Some(worker));
        self.token.replace(Some(token));
        Ok(())
    }

    async fn deactivate(&self, _context: DeactivateContext) -> Result<(), RuntimeFailure> {
        self.store.take();
        self.token.take();
        match self.worker.take() {
            Some(worker) => worker.shutdown().await,
            None => Ok(()),
        }
    }
}

fn export_request(name: &str) -> DescribeExportsResponseServicesItemOperationsItem {
    DescribeExportsResponseServicesItemOperationsItem {
        interaction: DescribeExportsResponseServicesItemOperationsItemInteraction::Request,
        name: name.to_owned(),
    }
}
fn export_stream(name: &str) -> DescribeExportsResponseServicesItemOperationsItem {
    DescribeExportsResponseServicesItemOperationsItem {
        interaction: DescribeExportsResponseServicesItemOperationsItemInteraction::Stream,
        name: name.to_owned(),
    }
}
fn decode_workspace_body(body: &str) -> Result<Vec<u8>, InvokeError> {
    let body = STANDARD
        .decode(body)
        .map_err(|_| InvokeError::CodecMismatch)?;
    if body.len() > MAX_REQUEST_BYTES {
        return Err(InvokeError::RequestTooLarge);
    }
    Ok(body)
}
fn decode_json<T: serde::de::DeserializeOwned>(body: &[u8]) -> Result<T, InvokeError> {
    serde_json::from_slice(body).map_err(|_| InvokeError::CodecMismatch)
}
fn invoke_json<T: serde::Serialize, E: serde::Serialize>(
    result: Result<T, E>,
) -> Result<InvokeResponse, InvokeError> {
    let (outcome, body) = match result {
        Ok(value) => (InvokeResponseOutcome::Success, serde_json::to_vec(&value)),
        Err(error) => (
            InvokeResponseOutcome::DomainError,
            serde_json::to_vec(&error),
        ),
    };
    let body = body.map_err(|_| InvokeError::CodecMismatch)?;
    if body.len() > MAX_RESPONSE_BYTES {
        return Err(InvokeError::ResponseTooLarge);
    }
    Ok(InvokeResponse {
        body_base64: STANDARD.encode(body),
        outcome,
    })
}

fn read_or_create_token(path: &Path) -> anyhow::Result<String> {
    if let Ok(token) = std::fs::read_to_string(path) {
        let token = token.trim();
        anyhow::ensure!(
            token.len() >= 32,
            "Observe token file contains an invalid token"
        );
        return Ok(token.to_owned());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let token = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    match options.open(path) {
        Ok(mut file) => {
            use std::io::Write as _;
            file.write_all(token.as_bytes())?;
            file.sync_all()?;
            Ok(token)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let existing = std::fs::read_to_string(path)?;
            let existing = existing.trim();
            anyhow::ensure!(
                existing.len() >= 32,
                "Observe token file contains an invalid token"
            );
            Ok(existing.to_owned())
        }
        Err(error) => Err(error.into()),
    }
}

fn invalid_plan(error: impl std::fmt::Display) -> RuntimeFailure {
    RuntimeFailure::InvalidResolvedPlan {
        detail: format!("invalid Observe configuration: {error}"),
    }
}
fn plugin_failure(error: impl std::fmt::Display) -> RuntimeFailure {
    RuntimeFailure::PluginFailure {
        detail: error.to_string(),
    }
}
fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'_' | b'-')
        })
}

/// Forces this linked Plugin into a Host executable.
pub fn link() {}

#[cfg(test)]
mod tests;
