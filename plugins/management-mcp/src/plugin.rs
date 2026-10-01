//! Independently removable MCP provider over Host-selected Auth and Management ports.
use crate::{NativeBridge, Profile};
use axum::{
    Router,
    body::{Body, BodyDataStream},
};
use futures::{
    StreamExt as _,
    future::{LocalBoxFuture, ready},
};
use lenso_capability_http_stream_endpoint as http_stream;
use lenso_kernel::{
    ActivateContext, DeactivateContext, InvocationContext, NativeStreamItem, NativeStreamSession,
    RuntimeFailure,
};
use std::{any::Any, cell::RefCell, collections::BTreeSet, rc::Rc, time::Duration};
use tower::ServiceExt as _;

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct McpConfig {
    resource_uri: String,
    #[serde(default)]
    authorization_servers: Vec<String>,
    #[serde(default)]
    allowed_origins: BTreeSet<String>,
    #[serde(default)]
    allowed_write_entries: BTreeSet<String>,
}
impl McpConfig {
    fn profile(&self) -> Profile {
        Profile {
            resource_uri: self.resource_uri.clone(),
            authorization_servers: self.authorization_servers.clone(),
            allowed_origins: self.allowed_origins.clone(),
            allowed_write_entries: self.allowed_write_entries.clone(),
        }
    }
}
fn failure(error: impl std::fmt::Display) -> RuntimeFailure {
    RuntimeFailure::PluginFailure {
        detail: format!("Management MCP: {error}"),
    }
}
fn validate_config(config: &McpConfig) -> Result<(), RuntimeFailure> {
    config.profile().validate().map_err(failure)
}

#[lenso::plugin(lifecycle, configuration_schema = "config.schema.json", validate = validate_config)]
#[derive(Clone, Debug)]
struct ManagementMcp {
    #[config]
    config: McpConfig,
    auth: lenso::Port<lenso_capability_auth::AuthClient>,
    management: lenso::Port<lenso_capability_management::ManagementClient>,
    running: Rc<RefCell<Option<(NativeBridge, Router)>>>,
}

#[lenso::provides(http_stream::StreamEndpoint)]
impl ManagementMcp {
    fn describe_stream(
        &self,
        _context: InvocationContext,
        _request: http_stream::DescribeRequest,
    ) -> lenso_kernel::NativeRequestFuture<http_stream::StreamEndpointDescribe> {
        Box::pin(ready(Ok(Ok(http_stream::DescribeResponse {
            routes: ["GET", "POST", "DELETE", "OPTIONS"]
                .into_iter()
                .map(|method| http_stream::DescribeResponseRoutesItem {
                    method: method.into(),
                    path: "/mcp".into(),
                    route_id: "management.mcp".into(),
                })
                .chain(std::iter::once(http_stream::DescribeResponseRoutesItem {
                    method: "GET".into(),
                    path: "/.well-known/oauth-protected-resource".into(),
                    route_id: "management.mcp.metadata".into(),
                }))
                .collect(),
        }))))
    }
    fn handle_stream(
        &self,
        context: InvocationContext,
        request: http_stream::HandleRequest,
    ) -> LocalBoxFuture<
        'static,
        Result<McpResponse, http_stream::StreamEndpointHandleInvocationError>,
    > {
        let cancellation = context.cancellation();
        let router = self
            .running
            .borrow()
            .as_ref()
            .map(|(_, router)| router.clone());
        Box::pin(async move {
            let router = router.ok_or_else(|| {
                http_stream::StreamEndpointHandleInvocationError::Runtime(failure("not active"))
            })?;
            if !matches!(
                request.route_id.as_str(),
                "management.mcp" | "management.mcp.metadata"
            ) {
                return Err(http_stream::StreamEndpointHandleInvocationError::Domain(
                    http_stream::HandleError::Rejected,
                ));
            }
            let uri = request.query.as_ref().map_or_else(
                || request.path.clone(),
                |query| format!("{}?{query}", request.path),
            );
            let mut builder = http::Request::builder()
                .method(request.method.as_str())
                .uri(uri);
            for header in &request.headers {
                builder = builder.header(&header.name, &header.value);
            }
            // Ingress credentials are forwarded unchanged; this Plugin never supplies a Host token.
            if let Some(credential) = request.credential
                && credential.scheme == "bearer"
            {
                let value = format!("Bearer {}", credential.value);
                let existing = builder
                    .headers_ref()
                    .and_then(|headers| headers.get(http::header::AUTHORIZATION));
                if existing.is_some_and(|header| header.to_str().ok() != Some(value.as_str())) {
                    return Err(http_stream::StreamEndpointHandleInvocationError::Domain(
                        http_stream::HandleError::Rejected,
                    ));
                }
                if existing.is_none() {
                    builder = builder.header(http::header::AUTHORIZATION, value);
                }
            }
            let incoming = builder
                .body(Body::from(request.body.into_shared()))
                .map_err(|error| {
                    http_stream::StreamEndpointHandleInvocationError::Runtime(failure(error))
                })?;
            let response = tokio::select! {
                () = cancellation.cancelled() => return Err(http_stream::StreamEndpointHandleInvocationError::Runtime(failure("request cancelled"))),
                response = router.oneshot(incoming) => response.map_err(|error| http_stream::StreamEndpointHandleInvocationError::Runtime(failure(error)))?,
            };
            let head = http_stream::HandleResponse {
                kind: http_stream::HandleResponseKind::Head,
                status: Some(i64::from(response.status().as_u16())),
                body: None,
                headers: Some(
                    response
                        .headers()
                        .iter()
                        .filter_map(|(name, value)| {
                            value.to_str().ok().map(|value| {
                                http_stream::HandleResponseHeadersItem {
                                    name: name.to_string(),
                                    value: value.into(),
                                }
                            })
                        })
                        .collect(),
                ),
            };
            Ok(McpResponse {
                cancellation,
                head: RefCell::new(Some(head)),
                body: Rc::new(RefCell::new(Some(response.into_body().into_data_stream()))),
            })
        })
    }
}

impl lenso::Lifecycle for ManagementMcp {
    async fn activate(&self, _context: ActivateContext) -> Result<(), RuntimeFailure> {
        let native = NativeBridge::spawn_scoped(
            (*self.auth).clone(),
            (*self.management).clone(),
            self.config.resource_uri.clone(),
            None,
            Duration::from_secs(30),
        )
        .map_err(failure)?;
        let router =
            crate::router(native.bridge.clone(), self.config.profile()).map_err(failure)?;
        self.running.replace(Some((native, router)));
        Ok(())
    }
    async fn deactivate(&self, _context: DeactivateContext) -> Result<(), RuntimeFailure> {
        let running = self.running.take();
        if let Some((native, _)) = running {
            native.shutdown().await;
        }
        Ok(())
    }
}

struct McpResponse {
    cancellation: lenso_kernel::CancellationToken,
    head: RefCell<Option<http_stream::HandleResponse>>,
    body: Rc<RefCell<Option<BodyDataStream>>>,
}
impl std::fmt::Debug for McpResponse {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("McpResponse")
            .finish_non_exhaustive()
    }
}
impl NativeStreamSession for McpResponse {
    fn close_send(&self) -> LocalBoxFuture<'static, Result<(), RuntimeFailure>> {
        Box::pin(ready(Ok(())))
    }
    fn send(&self, _message: Box<dyn Any>) -> LocalBoxFuture<'static, Result<(), RuntimeFailure>> {
        Box::pin(ready(Ok(())))
    }
    fn receive(&self) -> LocalBoxFuture<'static, Result<NativeStreamItem, RuntimeFailure>> {
        if let Some(head) = self.head.take() {
            return Box::pin(ready(Ok(NativeStreamItem::Message(Box::new(head)))));
        }
        let stream = self.body.take();
        let slot = self.body.clone();
        let cancellation = self.cancellation.clone();
        Box::pin(async move {
            let Some(mut stream) = stream else {
                return Ok(NativeStreamItem::Terminal(Ok(())));
            };
            let next = tokio::select! {
                biased;
                () = cancellation.cancelled() => return Ok(NativeStreamItem::Terminal(Ok(()))),
                next = stream.next() => next,
            };
            match next {
                Some(Ok(bytes)) => {
                    slot.replace(Some(stream));
                    Ok(NativeStreamItem::Message(Box::new(
                        http_stream::HandleResponse {
                            kind: http_stream::HandleResponseKind::Chunk,
                            status: None,
                            headers: None,
                            body: Some(bytes.to_vec().into()),
                        },
                    )))
                }
                Some(Err(error)) => Err(failure(error)),
                None => Ok(NativeStreamItem::Terminal(Ok(()))),
            }
        })
    }
    fn cancel(&self) {
        self.cancellation.cancel();
        self.head.take();
        self.body.take();
    }
}
pub fn link() {}

#[cfg(test)]
mod tests {
    use super::*;

    // Protect real disconnect behavior: the old receive owned a pending body
    // outside the slot, so clearing the slot alone could not cancel it.
    #[tokio::test]
    async fn cancelling_a_pending_receive_ends_the_native_stream() {
        let pending = futures::stream::pending::<Result<Vec<u8>, std::convert::Infallible>>();
        let response = McpResponse {
            cancellation: lenso_kernel::CancellationToken::new(),
            head: RefCell::new(None),
            body: Rc::new(RefCell::new(Some(
                Body::from_stream(pending).into_data_stream(),
            ))),
        };
        let receive = response.receive();
        response.cancel();
        let result = tokio::time::timeout(Duration::from_secs(1), receive)
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(result, NativeStreamItem::Terminal(Ok(()))));
        assert!(response.body.borrow().is_none());
    }

    #[test]
    fn mcp_registration_requires_bound_auth_and_management_without_agent() {
        let descriptor: serde_json::Value = serde_json::from_str(PLUGIN_DESCRIPTOR_JSON).unwrap();
        let requirements = descriptor["required_capabilities"].as_array().unwrap();
        assert_eq!(requirements.len(), 2);
        assert!(
            requirements
                .iter()
                .any(|requirement| requirement["capability_id"] == "lenso.auth@1"
                    && requirement["cardinality"] == "one")
        );
        assert!(
            requirements
                .iter()
                .any(
                    |requirement| requirement["capability_id"] == "lenso.management@1"
                        && requirement["cardinality"] == "one"
                )
        );
        assert_eq!(
            descriptor["provided_capabilities"][0]["capability_id"],
            "lenso.http.stream-endpoint@1"
        );
    }

    // Exercise the actual generated Plugin lifecycle and HTTP capability bridge,
    // not just the standalone Axum transport used by the existing client test.
    #[tokio::test(flavor = "current_thread")]
    async fn mcp_only_native_plugin_starts_and_shuts_down_without_agent() {
        use lenso_app_plan::{
            CapabilityEndpointPlan, CapabilityRequirementPlan,
            authoring::{
                HostCatalog, HostDefaultPlugin, HostPluginRelease, HostSlot, PluginDescriptor,
                PluginRootSnapshot, resolve_plugin_root,
            },
        };
        use lenso_kernel::{Kernel, ShutdownOutcome, StreamEvent};
        use lenso_native_adapter::{
            NativePluginFactory, NativePluginFactoryContext, NativePluginInstance,
            NativePluginRegistry,
        };

        #[derive(Debug)]
        struct Endpoint {
            capability: &'static str,
            operations: &'static [&'static str],
        }
        impl lenso_kernel::NativeRequestEndpoint for Endpoint {
            fn capability_id(&self) -> &'static str {
                self.capability
            }
            fn descriptor_version(&self) -> &'static str {
                "1.0.0"
            }
            fn operations(&self) -> &'static [&'static str] {
                self.operations
            }
            fn invoke(
                &self,
                _operation: &str,
                _request: Box<dyn Any>,
                _context: InvocationContext,
            ) -> LocalBoxFuture<'static, Result<Result<Box<dyn Any>, Box<dyn Any>>, RuntimeFailure>>
            {
                Box::pin(ready(Err(failure(
                    "fixture deliberately has no credentials",
                ))))
            }
        }
        #[derive(Debug)]
        struct FixtureFactory(&'static str);
        impl NativePluginFactory for FixtureFactory {
            fn package_id(&self) -> &'static str {
                self.0
            }
            fn package_version(&self) -> &'static str {
                "1.0.0"
            }
            fn factory_identity(&self) -> String {
                "1.0.0".into()
            }
            fn instantiate(
                &self,
                _context: NativePluginFactoryContext<'_>,
            ) -> Result<NativePluginInstance, RuntimeFailure> {
                Ok(if self.0 == "test.mcp-authority" {
                    NativePluginInstance::new(vec![
                        Rc::new(Endpoint {
                            capability: "lenso.auth@1",
                            operations: &["authenticate"],
                        }),
                        Rc::new(Endpoint {
                            capability: "lenso.management@1",
                            operations: &["catalog", "invoke", "status"],
                        }),
                    ])
                } else {
                    NativePluginInstance::default()
                })
            }
        }
        tokio::task::LocalSet::new().run_until(async {
            link();
            let slots = [HostSlot::many("management-mcp"), HostSlot::one("authority"), HostSlot::one("probe")];
            let linked = NativePluginRegistry::host_catalog(slots.clone(), []).unwrap();
            let authority = PluginDescriptor::new("test.mcp-authority", "1.0.0", "authority")
                .with_capability(CapabilityEndpointPlan::new("lenso.auth@1", "1.0.0", ["authenticate"]))
                .with_capability(CapabilityEndpointPlan::new("lenso.management@1", "1.0.0", ["catalog", "invoke", "status"]));
            let probe = PluginDescriptor::new("test.mcp-probe", "1.0.0", "probe")
                .with_requirement(CapabilityRequirementPlan::one(http_stream::CAPABILITY_ID, http_stream::DESCRIPTOR_VERSION));
            let releases = linked.plugins().iter().cloned().chain([HostPluginRelease::new(authority), HostPluginRelease::new(probe)]).collect::<Vec<_>>();
            let defaults = vec![
                HostDefaultPlugin::new("test.mcp-authority", "default"),
                HostDefaultPlugin::new("test.mcp-probe", "default"),
                HostDefaultPlugin::new("lenso.console.management-mcp", "default").with_configuration(serde_json::json!({"resource_uri":"http://127.0.0.1:3030/mcp"})).disableable(),
            ];
            let resolved = resolve_plugin_root(&HostCatalog::new(slots, releases, defaults), &PluginRootSnapshot::default()).unwrap();
            assert!(resolved.plan().plugin_instances().iter().all(|instance| !instance.package_id().contains("agent")));
            let registry = NativePluginRegistry::new().with_linked_factories().with_factory(FixtureFactory("test.mcp-authority")).with_factory(FixtureFactory("test.mcp-probe"));
            let app = Kernel::start_native(resolved.plan().clone(), lenso_runner::TokioDriver::new(), registry).await.unwrap();
            let stream = app.stream_handle::<http_stream::StreamEndpointHandle>("test.mcp-probe/default").unwrap().open(http_stream::HANDLE_STREAM_OPERATION, http_stream::HandleRequest {
                body: Vec::<u8>::new().into(), credential: None, headers: vec![], method: "GET".into(), path: "/.well-known/oauth-protected-resource".into(), path_parameters: vec![], query: None, request_id: "metadata".into(), route_id: "management.mcp.metadata".into(),
            }).await.unwrap().unwrap();
            assert!(matches!(stream.receive().await.unwrap(), StreamEvent::Message(head) if head.status == Some(200)));
            assert!(matches!(stream.receive().await.unwrap(), StreamEvent::Message(body) if body.body.is_some()));
            assert!(matches!(stream.receive().await.unwrap(), StreamEvent::Terminal(Ok(()))));
            assert_eq!(app.shutdown(Duration::from_secs(2)).await, ShutdownOutcome::Clean);
        }).await;
    }
}
