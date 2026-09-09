//! Reference Workspace contribution Plugin.

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
    InvokeResponse, InvokeResponseOutcome, SubscribeRequest, SubscribeResponse,
    SubscribeResponseOutcome, WorkspaceServiceInvoke, WorkspaceServiceSubscribe,
    WorkspaceServiceSubscribeInvocationError,
};
use lenso_kernel::{InvocationContext, RuntimeFailure};

const SERVICE_ID: &str = "welcome";
const DOMAIN_CAPABILITY_ID: &str = "lenso.console.welcome@1";
const DOMAIN_DESCRIPTOR_VERSION: &str = "1.0.0";
const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

const MODULE: &str = r#"
export const apiMajor = 1;
export const createWorkspace = ({ createElement, react, services }) => {
  const { useState } = react;
  const Page = ({ environment, location, mount, navigation, signal }) => {
    const [message, setMessage] = useState("Service has not been called yet.");
    const invoke = async () => {
      const result = await services.invoke("welcome", "greet", { name: "Console" }, { signal });
      setMessage(result.message);
    };
    return createElement(
      "section",
      { className: "welcome-workspace" },
      createElement("p", { className: "welcome-eyebrow" }, "PLUGIN WORKSPACE"),
      createElement("h1", null, "Welcome to " + mount.title),
      createElement("p", null, "This page is contributed by " + mount.owner.instance + "."),
      createElement("p", null, "Locale: " + environment.locale + " · Theme: " + environment.theme),
      createElement("p", { "data-testid": "welcome-service-result" }, message),
      createElement("button", {
        onClick: location.segments.length ? () => navigation.go([]) : invoke,
        type: "button"
      }, location.segments.length ? "Back to workspace home" : "Call Workspace service")
    );
  };
  return { Page };
};
"#;

const STYLES: &str = r"
.welcome-workspace { margin: 0 auto; max-width: 720px; padding: 64px 32px; }
.welcome-workspace h1 { font-size: 36px; letter-spacing: -0.04em; margin: 8px 0 16px; }
.welcome-workspace p { color: var(--lenso-color-text-secondary); line-height: 1.6; }
.welcome-workspace .welcome-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .12em; }
.welcome-workspace button { margin-top: 16px; }
";

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct WelcomeWorkspaceConfig {}

#[lenso::plugin(
    lifecycle,
    configuration_schema = "config.schema.json",
    configuration_defaults = "config.defaults.json"
)]
#[derive(Clone, Debug)]
struct WelcomeWorkspace {
    #[config]
    config: WelcomeWorkspaceConfig,
    #[tasks]
    tasks: lenso::ManagedTasks,
}

impl lenso::Lifecycle for WelcomeWorkspace {}

#[lenso::provides(ui::Contribution, service::WorkspaceService)]
impl WelcomeWorkspace {
    fn describe(
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
                    path: "workspace.mjs".to_owned(),
                },
                DescribeResponseAssetsItem {
                    content_base64: STANDARD.encode(STYLES),
                    media_type: DescribeResponseAssetsItemMediaType::TextCssCharsetUtf,
                    path: "workspace.css".to_owned(),
                },
            ],
            module: "workspace.mjs".to_owned(),
            navigation: DescribeResponseNavigation {
                items: vec![
                    DescribeResponseNavigationItemsItem {
                        label: "Home".to_owned(),
                        path: Vec::new(),
                    },
                    DescribeResponseNavigationItemsItem {
                        label: "Runtime".to_owned(),
                        path: vec!["runtime".to_owned()],
                    },
                ],
                label: "Welcome".to_owned(),
            },
            requirements: vec![DescribeResponseRequirementsItem {
                capability_id: DOMAIN_CAPABILITY_ID.to_owned(),
                descriptor_version: DOMAIN_DESCRIPTOR_VERSION.to_owned(),
                operations: vec!["greet".to_owned(), "ticks".to_owned()],
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
            title: "Welcome".to_owned(),
            workspace_id: "welcome".to_owned(),
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
                operations: vec![
                    DescribeExportsResponseServicesItemOperationsItem {
                        interaction:
                            DescribeExportsResponseServicesItemOperationsItemInteraction::Request,
                        name: "greet".to_owned(),
                    },
                    DescribeExportsResponseServicesItemOperationsItem {
                        interaction:
                            DescribeExportsResponseServicesItemOperationsItemInteraction::Stream,
                        name: "ticks".to_owned(),
                    },
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
        let _ = &self.config;
        Box::pin(ready(Ok(invoke_welcome(request))))
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
        let count = match decode_subscribe_count(request) {
            Ok(count) => count,
            Err(error) => return Box::pin(ready(Err(error))),
        };
        let tasks = self.tasks.clone();
        Box::pin(async move {
            let (stream, mut channel) =
                lenso::ProviderStream::<WorkspaceServiceSubscribe>::channel(&context, 4);
            tasks
                .spawn_local(async move {
                    for sequence in 0..count {
                        let body = serde_json::to_vec(&serde_json::json!({ "tick": sequence }))
                            .expect("fixture response is serializable");
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
                    }
                    let _ = channel.complete(Ok(())).await;
                })
                .map_err(|error| {
                    WorkspaceServiceSubscribeInvocationError::Runtime(
                        RuntimeFailure::PluginFailure {
                            detail: format!("Welcome Workspace stream task failed: {error:?}"),
                        },
                    )
                })?;
            Ok(stream)
        })
    }
}

fn invoke_welcome(request: InvokeRequest) -> Result<InvokeResponse, InvokeError> {
    if request.service_id != SERVICE_ID {
        return Err(InvokeError::UnknownService);
    }
    if request.operation != "greet" {
        return Err(InvokeError::UnknownOperation);
    }
    let Ok(body) = STANDARD.decode(request.body_base64) else {
        return Err(InvokeError::CodecMismatch);
    };
    if body.len() > MAX_REQUEST_BYTES {
        return Err(InvokeError::RequestTooLarge);
    }
    let Some(name) = serde_json::from_slice::<serde_json::Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("name")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .filter(|value| !value.trim().is_empty())
    else {
        return Err(InvokeError::CodecMismatch);
    };
    let body = serde_json::to_vec(&serde_json::json!({
        "message": format!("Hello, {name}. This came through the Plan-bound service."),
    }))
    .expect("fixture response is serializable");
    if body.len() > MAX_RESPONSE_BYTES {
        return Err(InvokeError::ResponseTooLarge);
    }
    Ok(InvokeResponse {
        body_base64: STANDARD.encode(body),
        outcome: InvokeResponseOutcome::Success,
    })
}

fn decode_subscribe_count(
    request: SubscribeRequest,
) -> Result<u64, WorkspaceServiceSubscribeInvocationError> {
    if request.service_id != SERVICE_ID {
        return Err(WorkspaceServiceSubscribeInvocationError::Domain(
            service::SubscribeError::UnknownService,
        ));
    }
    if request.operation != "ticks" {
        return Err(WorkspaceServiceSubscribeInvocationError::Domain(
            service::SubscribeError::UnknownOperation,
        ));
    }
    let body = STANDARD.decode(request.body_base64).map_err(|_| {
        WorkspaceServiceSubscribeInvocationError::Domain(service::SubscribeError::CodecMismatch)
    })?;
    if body.len() > MAX_REQUEST_BYTES {
        return Err(WorkspaceServiceSubscribeInvocationError::Domain(
            service::SubscribeError::RequestTooLarge,
        ));
    }
    serde_json::from_slice::<serde_json::Value>(&body)
        .ok()
        .and_then(|value| value.get("count").and_then(serde_json::Value::as_u64))
        .filter(|count| *count <= 32)
        .ok_or(WorkspaceServiceSubscribeInvocationError::Domain(
            service::SubscribeError::CodecMismatch,
        ))
}

/// Forces this linked Plugin into a Host executable.
pub fn link() {}

#[cfg(test)]
mod tests {
    use super::*;
    use lenso_kernel::CancellationToken;

    #[test]
    fn descriptor_exports_one_workspace_contribution() {
        let descriptor: serde_json::Value = serde_json::from_str(PLUGIN_DESCRIPTOR_JSON).unwrap();
        assert_eq!(descriptor["plugin_id"], "lenso.console.workspace.welcome");
        let capabilities = descriptor["provided_capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .map(|capability| capability["capability_id"].as_str().unwrap())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(
            capabilities,
            [ui::CAPABILITY_ID, service::CAPABILITY_ID].into()
        );
    }

    #[test]
    fn contribution_is_a_self_contained_workspace_snapshot() {
        let plugin = WelcomeWorkspace {
            config: WelcomeWorkspaceConfig {},
            tasks: lenso::ManagedTasks::default(),
        };
        let response = futures::executor::block_on(plugin.describe(
            InvocationContext::new(1, None, CancellationToken::new()),
            DescribeRequest {},
        ))
        .unwrap()
        .unwrap();
        assert_eq!(response.workspace_id, "welcome");
        assert_eq!(response.assets.len(), 2);
        assert_eq!(response.requirements[0].service_id, SERVICE_ID);
        assert!(
            response
                .assets
                .iter()
                .any(|asset| asset.path == response.module)
        );
    }

    #[test]
    fn owner_service_preserves_success_and_domain_errors() {
        let success = invoke_welcome(InvokeRequest {
            body_base64: STANDARD.encode(br#"{"name":"Ada"}"#),
            media_type: service::InvokeRequestMediaType::ApplicationJson,
            operation: "greet".to_owned(),
            service_id: SERVICE_ID.to_owned(),
        })
        .unwrap();
        assert_eq!(success.outcome, InvokeResponseOutcome::Success);

        let error = invoke_welcome(InvokeRequest {
            body_base64: STANDARD.encode(b"{}"),
            media_type: service::InvokeRequestMediaType::ApplicationJson,
            operation: "greet".to_owned(),
            service_id: "missing".to_owned(),
        });
        assert_eq!(error, Err(InvokeError::UnknownService));
    }
}
