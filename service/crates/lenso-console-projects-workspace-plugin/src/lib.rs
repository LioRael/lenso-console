//! Projects UI contribution and fixed-operation business App adapter.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures::future::ready;
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
    InvokeResponse, InvokeResponseOutcome, SubscribeRequest, WorkspaceServiceInvoke,
    WorkspaceServiceSubscribe, WorkspaceServiceSubscribeInvocationError,
};
use lenso_kernel::InvocationContext;

const SERVICE_ID: &str = "projects";
const DOMAIN_CAPABILITY_ID: &str = "lenso.projects.workspace@1";
const DOMAIN_DESCRIPTOR_VERSION: &str = "1.0.0";
const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

mod connection;
const MODULE: &str = include_str!("../assets/workspace.js");
const STYLES: &str = include_str!("../assets/workspace.css");
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectsWorkspaceConfig {
    origin: String,
}

#[lenso::plugin(
    lifecycle,
    configuration_schema = "config.schema.json",
    configuration_defaults = "config.defaults.json",
    validate = validate_config
)]
#[derive(Clone, Debug)]
struct ProjectsWorkspace {
    #[config]
    config: ProjectsWorkspaceConfig,
    #[tasks]
    tasks: lenso::ManagedTasks,
    connection: std::sync::Arc<tokio::sync::Mutex<connection::Connection>>,
}

fn validate_config(config: &ProjectsWorkspaceConfig) -> Result<(), lenso_kernel::RuntimeFailure> {
    if connection::valid_origin(&config.origin) {
        Ok(())
    } else {
        Err(lenso_kernel::RuntimeFailure::InvalidResolvedPlan {
            detail: "Projects origin must be HTTPS or a loopback HTTP origin without a path".into(),
        })
    }
}

impl lenso::Lifecycle for ProjectsWorkspace {}

#[lenso::provides(ui::Contribution, service::WorkspaceService)]
impl ProjectsWorkspace {
    fn describe_contribution(
        &self,
        _context: InvocationContext,
        _request: DescribeRequest,
    ) -> lenso_kernel::NativeRequestFuture<ui::Contribution> {
        let _ = &self.config;
        Box::pin(ready(Ok(Ok(DescribeResponse {
            assets: vec![
                DescribeResponseAssetsItem {
                    content_base64: STANDARD.encode(MODULE),
                    media_type: DescribeResponseAssetsItemMediaType::TextJavascriptCharsetUtf,
                    path: "workspace.js".to_owned(),
                },
                DescribeResponseAssetsItem {
                    content_base64: STANDARD.encode(STYLES),
                    media_type: DescribeResponseAssetsItemMediaType::TextCssCharsetUtf,
                    path: "workspace.css".to_owned(),
                },
            ],
            module: "workspace.js".to_owned(),
            navigation: DescribeResponseNavigation {
                items: vec![DescribeResponseNavigationItemsItem {
                    label: "Home".to_owned(),
                    path: Vec::new(),
                }],
                label: "Projects".to_owned(),
            },
            requirements: vec![DescribeResponseRequirementsItem {
                capability_id: DOMAIN_CAPABILITY_ID.to_owned(),
                descriptor_version: DOMAIN_DESCRIPTOR_VERSION.to_owned(),
                operations: connection::OPERATIONS
                    .iter()
                    .map(|name| (*name).to_owned())
                    .collect(),
                required: true,
                service_id: SERVICE_ID.to_owned(),
                source: DescribeResponseRequirementsItemSource::Owner,
            }],
            revision: env!("CARGO_PKG_VERSION").to_owned(),
            styles: vec!["workspace.css".to_owned()],
            subject: Some(DescribeResponseSubject {
                app_id: None,
                kind: DescribeResponseSubjectKind::Console,
            }),
            title: "Projects".to_owned(),
            workspace_id: "projects".to_owned(),
        }))))
    }
    fn describe_exports(
        &self,
        _context: InvocationContext,
        _request: DescribeExportsRequest,
    ) -> lenso_kernel::NativeRequestFuture<service::WorkspaceServiceDescribeExports> {
        let _ = &self.config;
        Box::pin(ready(Ok(Ok(DescribeExportsResponse {
            adapter_revision: env!("CARGO_PKG_VERSION").to_owned(),
            services: vec![DescribeExportsResponseServicesItem {
                capability_id: DOMAIN_CAPABILITY_ID.to_owned(),
                descriptor_version: DOMAIN_DESCRIPTOR_VERSION.to_owned(),
                operations: connection::OPERATIONS
                    .iter()
                    .map(|name| DescribeExportsResponseServicesItemOperationsItem {
                        interaction:
                            DescribeExportsResponseServicesItemOperationsItemInteraction::Request,
                        name: (*name).to_owned(),
                    })
                    .collect(),
                service_id: SERVICE_ID.to_owned(),
            }],
        }))))
    }

    fn invoke(
        &self,
        context: InvocationContext,
        request: InvokeRequest,
    ) -> lenso_kernel::NativeRequestFuture<WorkspaceServiceInvoke> {
        let origin = self.config.origin.clone();
        let connection = self.connection.clone();
        Box::pin(async move {
            if request.service_id != SERVICE_ID {
                return Ok(Err(InvokeError::UnknownService));
            }
            if !connection::OPERATIONS.contains(&request.operation.as_str()) {
                return Ok(Err(InvokeError::UnknownOperation));
            }
            let Ok(bytes) = STANDARD.decode(request.body_base64) else {
                return Ok(Err(InvokeError::CodecMismatch));
            };
            if bytes.len() > MAX_REQUEST_BYTES {
                return Ok(Err(InvokeError::RequestTooLarge));
            }
            let Ok(body) = serde_json::from_slice(&bytes) else {
                return Ok(Err(InvokeError::CodecMismatch));
            };
            let cancel = context.cancellation();
            let result = tokio::select! {
                () = cancel.cancelled() => return Ok(Err(InvokeError::Denied)),
                result = connection::invoke(&origin, &connection, &request.operation, body) => result,
            };
            let Ok(response) = result else {
                return Ok(Err(InvokeError::Denied));
            };
            let body = serde_json::to_vec(&response).expect("JSON value");
            if body.len() > MAX_RESPONSE_BYTES {
                return Ok(Err(InvokeError::ResponseTooLarge));
            }
            Ok(Ok(InvokeResponse {
                body_base64: STANDARD.encode(body),
                outcome: InvokeResponseOutcome::Success,
            }))
        })
    }
    fn subscribe(
        &self,
        _context: InvocationContext,
        _request: SubscribeRequest,
    ) -> futures::future::LocalBoxFuture<
        'static,
        Result<
            lenso::ProviderStream<WorkspaceServiceSubscribe>,
            WorkspaceServiceSubscribeInvocationError,
        >,
    > {
        let _ = &self.config;
        Box::pin(ready(Err(
            WorkspaceServiceSubscribeInvocationError::Domain(
                service::SubscribeError::UnknownOperation,
            ),
        )))
    }
}
/// Retain the linked workspace provider in the Host catalog.
pub fn link() {}
