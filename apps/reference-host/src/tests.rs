use super::*;
use axum::{
    Json as AxumJson, Router, body::Body as AxumBody, response::Response as AxumResponse,
    routing::get,
};
use bytes::Bytes;
use http::{StatusCode, header};
use lenso_console_plugin::{ConsolePluginConfig, ManagedAppConnection};

#[derive(Clone, Debug)]
struct AppHealth;

impl lenso_native_adapter::NativePluginFactory for AppHealth {
    fn package_id(&self) -> &'static str {
        "test.app.health"
    }

    fn instantiate(
        &self,
        _: lenso_native_adapter::NativePluginFactoryContext<'_>,
    ) -> Result<lenso_native_adapter::NativePluginInstance, lenso_kernel::RuntimeFailure> {
        Ok(lenso_native_adapter::NativePluginInstance::new(vec![
            std::rc::Rc::new(http_endpoint::EndpointEndpoint::new(self.clone())),
        ]))
    }
}

impl http_endpoint::EndpointProvider for AppHealth {
    fn describe(
        &self,
        _: lenso_kernel::InvocationContext,
        _: http_endpoint::DescribeRequest,
    ) -> lenso_kernel::NativeRequestFuture<http_endpoint::EndpointDescribe> {
        Box::pin(async {
            Ok(Ok(http_endpoint::DescribeResponse {
                routes: ["live", "ready"]
                    .into_iter()
                    .map(|name| http_endpoint::DescribeResponseRoutesItem {
                        method: "GET".into(),
                        path: format!("/health/{name}"),
                        route_id: format!("app.health.{name}"),
                        openapi: None,
                    })
                    .collect(),
            }))
        })
    }

    fn handle(
        &self,
        _: lenso_kernel::InvocationContext,
        request: http_endpoint::HandleRequest,
    ) -> lenso_kernel::NativeRequestFuture<http_endpoint::EndpointHandle> {
        Box::pin(async move {
            Ok(Ok(http_endpoint::HandleResponse {
                status: if request.route_id == "app.health.ready" {
                    503
                } else {
                    200
                },
                headers: vec![],
                body: b"app-health".to_vec().into(),
            }))
        })
    }
}

// Prevent the real ingress from rejecting App-owned health routes, or dispatching
// readiness to Console's generic 200. Existing Host tests have one health owner.
#[tokio::test(flavor = "current_thread")]
async fn console_health_override_leaves_ingress_readiness_to_the_app() {
    use lenso_app_plan::{
        AppComposition, CapabilityBinding, CapabilityEndpointPlan, PluginInstancePlan,
    };
    tokio::task::LocalSet::new()
        .run_until(async {
            link();
            let root = tempfile::tempdir().unwrap();
            std::fs::write(root.path().join("index.html"), "<!doctype html>").unwrap();
            let mut plugin = ConsolePluginConfig::defaults();
            plugin.web_root = root.path().to_str().unwrap().into();
            for enabled in [true, false] {
                plugin.liveness_readiness_routes = enabled;
                let mut config = ConsoleAppConfig::from_plugin(&plugin).unwrap();
                config.address = "127.0.0.1:0".parse().unwrap();
                let base = console_host_plan(&config).unwrap();
                let mut instances = base.plugin_instances().to_vec();
                instances.push(
                    PluginInstancePlan::new("app-health", "test.app.health").with_capability(
                        CapabilityEndpointPlan::new(
                            http_endpoint::CAPABILITY_ID,
                            http_endpoint::DESCRIPTOR_VERSION,
                            [
                                http_endpoint::DESCRIBE_OPERATION,
                                http_endpoint::HANDLE_OPERATION,
                            ],
                        ),
                    ),
                );
                let mut bindings = base.capability_bindings().to_vec();
                bindings.push(CapabilityBinding::new(
                    "lenso.web-ingress/default",
                    http_endpoint::CAPABILITY_ID,
                    http_endpoint::DESCRIPTOR_VERSION,
                    "app-health",
                ));
                let plan = AppComposition::new(instances, bindings).resolve().unwrap();
                let ingress = WebIngressFactory::new();
                let registry = NativePluginRegistry::new()
                    .with_linked_factories()
                    .with_factory(ingress.clone())
                    .with_factory(AppHealth);
                let result = Kernel::start_native(plan, TokioDriver::new(), registry).await;
                if enabled {
                    let error = match result {
                        Ok(app) => {
                            app.shutdown(std::time::Duration::from_secs(2)).await;
                            panic!("duplicate health ownership unexpectedly activated");
                        }
                        Err(error) => error,
                    };
                    let detail = format!("{error:?}");
                    assert!(
                        detail.contains("/health/"),
                        "unexpected startup failure: {detail}"
                    );
                    continue;
                }
                let app = result.unwrap();
                let origin = format!("http://{}", ingress.local_address().unwrap());
                let client = reqwest::Client::new();
                for (path, status) in [
                    ("live", StatusCode::OK),
                    ("ready", StatusCode::SERVICE_UNAVAILABLE),
                ] {
                    let response = client
                        .get(format!("{origin}/health/{path}"))
                        .send()
                        .await
                        .unwrap();
                    assert_eq!(response.status(), status);
                    assert_eq!(response.text().await.unwrap(), "app-health");
                }
                assert_eq!(
                    client
                        .get(format!("{origin}/health/startup"))
                        .send()
                        .await
                        .unwrap()
                        .status(),
                    StatusCode::OK
                );
                assert_eq!(
                    app.shutdown(std::time::Duration::from_secs(2)).await,
                    ShutdownOutcome::Clean
                );
            }
        })
        .await;
}

// Prevent a removable extension from leaving executable UI assets/capabilities
// behind after disable. Existing workspace tests do not cover global mounts.
#[cfg(feature = "assistant")]
#[tokio::test(flavor = "current_thread")]
async fn optional_assistant_disable_removes_global_mount_and_assets() {
    tokio::task::LocalSet::new().run_until(async {
        let root = tempfile::tempdir().unwrap();
        let assets = root.path().join("assistant-ui");
        std::fs::create_dir(&assets).unwrap();
        std::fs::write(assets.join("assistant.mjs"), "export const apiMajor=1; export const createWorkspace=({createElement})=>({Page:()=>createElement('button',null,'Optional assistant')});").unwrap();
        std::fs::write(assets.join("assistant.css"), "button{color:inherit}").unwrap();
        std::fs::write(assets.join("assets.json"), r#"["assistant.mjs","assistant.css"]"#).unwrap();
        let agent_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let agent_address = agent_listener.local_addr().unwrap();
        let agent = tokio::task::spawn_local(async move {
            axum::serve(agent_listener, Router::new().route("/api/console/v1/agent/bootstrap", get(|| async { AxumJson(serde_json::json!({})) }))).await.unwrap();
        });
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = port.local_addr().unwrap();
        drop(port);
        let mut plugin: ConsolePluginConfig = ConsolePluginConfig::defaults();
        plugin.web_root = root.path().to_str().unwrap().into();
        plugin.agent_home = root.path().join("agent").to_str().unwrap().into();
        plugin.agent_configuration_store = root.path().join("agent.sqlite3").to_str().unwrap().into();
        plugin.connected_agent_url = format!("http://{agent_address}");
        std::fs::write(root.path().join("index.html"), "<!doctype html>").unwrap();
        let mut config = ConsoleAppConfig::from_plugin(&plugin).unwrap();
        config.app_root = root.path().join("app");
        config.address = address;
        config.telemetry_address = "127.0.0.1:0".parse().unwrap();
        config.assistant_assets = Some(assets);
        let client = reqwest::Client::new();
        let catalog_url = format!("http://{address}/api/console/v1/surfaces");
        let host = start_host(&config).await.unwrap();
        let catalog: serde_json::Value = client.get(&catalog_url).send().await.unwrap().json().await.unwrap();
        assert_eq!(catalog["mounts"][0]["id"], "assistant");
        let asset_url = format!("http://{address}{}", catalog["mounts"][0]["module"].as_str().unwrap());
        assert_eq!(client.get(&asset_url).send().await.unwrap().status(), StatusCode::OK);
        assert_eq!(host.shutdown(std::time::Duration::from_secs(2)).await, ShutdownOutcome::Clean);

        let installed = config.app_root.join("plugins/lenso.console.assistant");
        std::fs::create_dir_all(&installed).unwrap();
        std::fs::write(installed.join("default.disabled"), []).unwrap();
        let host = start_host(&config).await.unwrap();
        let catalog: serde_json::Value = client.get(&catalog_url).send().await.unwrap().json().await.unwrap();
        assert_eq!(catalog["mounts"], serde_json::json!([]));
        assert_eq!(client.get(&asset_url).send().await.unwrap().status(), StatusCode::NOT_FOUND);
        let resolved = lenso_app_authoring::load_resolved_app(&config.app_root).unwrap();
        assert!(resolved.plan().capability_bindings().iter().all(|binding| binding.capability_id() != "lenso.ui.global-contribution@1"));
        assert_eq!(host.shutdown(std::time::Duration::from_secs(2)).await, ShutdownOutcome::Clean);

        std::fs::remove_file(installed.join("default.disabled")).unwrap();
        let host = start_host(&config).await.unwrap();
        let catalog: serde_json::Value = client.get(&catalog_url).send().await.unwrap().json().await.unwrap();
        assert_eq!(catalog["mounts"][0]["id"], "assistant");
        assert_eq!(host.shutdown(std::time::Duration::from_secs(2)).await, ShutdownOutcome::Clean);
        agent.abort();
    }).await;
}
#[test]
fn reference_host_does_not_activate_available_workspaces_by_default() {
    link();
    lenso_observe_plugin::link();
    lenso_console_welcome_workspace_plugin::link();
    let plugin_config: ConsolePluginConfig = ConsolePluginConfig::defaults();
    let config = ConsoleAppConfig::from_plugin(&plugin_config).unwrap();
    let plan = console_host_plan(&config).unwrap();

    assert_eq!(plan.plugin_instances().len(), 2);
    assert!(
        plan.plugin_instances()
            .iter()
            .any(|instance| { instance.instance_key() == "lenso.web-ingress/default" })
    );
    assert!(
        plan.plugin_instances()
            .iter()
            .any(|instance| { instance.instance_key() == "lenso.console.web/default" })
    );
    assert!(plan.capability_bindings().iter().all(|binding| {
        !matches!(
            binding.capability_id(),
            lenso_capability_ui_contribution::CAPABILITY_ID
                | lenso_capability_workspace_service::CAPABILITY_ID
        )
    }));
    assert!(
        plan.capability_bindings()
            .iter()
            .any(|binding| { binding.capability_id() == http_endpoint::CAPABILITY_ID })
    );
    assert!(
        plan.capability_bindings()
            .iter()
            .any(|binding| { binding.capability_id() == stream_endpoint::CAPABILITY_ID })
    );
    for binding in plan.capability_bindings().iter().filter(|binding| {
        matches!(
            binding.capability_id(),
            http_endpoint::CAPABILITY_ID | stream_endpoint::CAPABILITY_ID
        )
    }) {
        let operation = if binding.capability_id() == http_endpoint::CAPABILITY_ID {
            "handle"
        } else {
            "handle_stream"
        };
        assert_eq!(
            plan.request_admission_for(binding, operation),
            CONSOLE_REQUEST_ADMISSION
        );
    }
}

#[test]
fn reference_host_publishes_and_resolves_a_visible_plugin_root() {
    link();
    lenso_observe_plugin::link();
    lenso_console_welcome_workspace_plugin::link();
    lenso_projects_workspace_plugin::link();
    let root = tempfile::tempdir().unwrap();
    let mut plugin_config: ConsolePluginConfig = ConsolePluginConfig::defaults();
    plugin_config.web_root = root.path().to_str().unwrap().to_owned();
    std::fs::write(root.path().join("index.html"), "<!doctype html>").unwrap();
    let mut config = ConsoleAppConfig::from_plugin(&plugin_config).unwrap();
    config.app_root = root.path().join("console-app");
    config.shell.agent_home = root.path().join("agent");

    let catalog = console_host_catalog(&config).unwrap();
    publish_console_app_authority(&config.app_root, &catalog).unwrap();
    let catalog_path = config.app_root.join(".lenso/host-catalog.json");
    assert!(catalog_path.is_file());
    assert!(config.app_root.join("plugins").is_dir());

    let default = lenso_app_authoring::load_resolved_app(&config.app_root).unwrap();
    assert!(
        default
            .plan()
            .plugin_instances()
            .iter()
            .all(|instance| instance.instance_key() != "lenso.console.workspace.welcome/default")
    );
    install_welcome_fixture(&config.app_root);
    let selected = lenso_app_authoring::load_resolved_app(&config.app_root).unwrap();
    assert!(
        selected
            .plan()
            .plugin_instances()
            .iter()
            .any(|instance| instance.instance_key() == "lenso.console.workspace.welcome/default")
    );
    std::fs::remove_file(
        config
            .app_root
            .join("plugins/lenso.console.workspace.welcome/default.toml"),
    )
    .unwrap();
    let removed = lenso_app_authoring::load_resolved_app(&config.app_root).unwrap();
    assert!(
        removed.plan().plugin_instances().iter().all(|instance| {
            instance.instance_key() != "lenso.console.workspace.welcome/default"
        })
    );
    assert!(
        removed
            .plan()
            .plugin_instances()
            .iter()
            .any(|instance| { instance.instance_key() == "lenso.web-ingress/default" })
    );
}

#[test]
fn projects_workspace_requires_explicit_host_origin() {
    link();
    lenso_console_welcome_workspace_plugin::link();
    lenso_projects_workspace_plugin::link();
    let plugin_config: ConsolePluginConfig = ConsolePluginConfig::defaults();
    let mut config = ConsoleAppConfig::from_plugin(&plugin_config).unwrap();
    let contains_projects = |plan: &ResolvedAppPlan| {
        plan.plugin_instances()
            .iter()
            .any(|instance| instance.instance_key() == "lenso.console.workspace.projects/default")
    };
    assert!(!contains_projects(&console_host_plan(&config).unwrap()));
    config.projects_workspace_origin = Some("http://127.0.0.1:55440".into());
    assert!(contains_projects(&console_host_plan(&config).unwrap()));
}

#[test]
fn observe_is_plan_bound_only_when_an_app_subject_exists() {
    link();
    lenso_observe_plugin::link();
    lenso_console_welcome_workspace_plugin::link();
    let plugin_config: ConsolePluginConfig = ConsolePluginConfig::defaults();
    let without_app = ConsoleAppConfig::from_plugin(&plugin_config).unwrap();
    let plan = console_host_plan(&without_app).unwrap();
    assert!(plan.plugin_instances().iter().all(|instance| {
        !instance
            .instance_key()
            .starts_with("lenso.console.workspace.observe/")
    }));
    assert!(
        plan.plugin_instances()
            .iter()
            .all(|instance| { instance.instance_key() != "lenso.web-ingress/telemetry" })
    );
    assert!(
        plan.capability_bindings()
            .iter()
            .all(|binding| { binding.consumer_instance() != "lenso.web-ingress/telemetry" })
    );

    let with_app = lenso_console_plugin::ConsoleConfig::from_plugin(&plugin_config)
        .unwrap()
        .with_managed_app(&ManagedAppConnection {
            id: "sample-app".to_owned(),
            label: "Sample App".to_owned(),
            origin: "http://127.0.0.1:9191".to_owned(),
            console_extensions: false,
            control_token_env: None,
        })
        .unwrap();
    // Keep Projects and Observe selected together: an admission override must
    // not narrow a many-provider requirement to just the Observe instance.
    lenso_projects_workspace_plugin::link();
    let mut config = ConsoleAppConfig::new(with_app);
    config.projects_workspace_origin = Some("http://127.0.0.1:55440".into());
    let plan = console_host_plan(&config).unwrap();
    let providers = plan
        .capability_bindings()
        .iter()
        .filter(|binding| {
            binding.consumer_instance() == "lenso.console.web/default"
                && binding.capability_id() == lenso_capability_workspace_service::CAPABILITY_ID
        })
        .collect::<Vec<_>>();
    assert_eq!(providers.len(), 2);
    for binding in providers {
        assert!(binding.has_explicit_admission());
        assert_eq!(
            plan.request_admission_for(binding, "subscribe"),
            CONSOLE_REQUEST_ADMISSION
        );
    }
    assert!(
        plan.plugin_instances()
            .iter()
            .any(|instance| { instance.instance_key() == "lenso.web-ingress/telemetry" })
    );
    assert!(plan.capability_bindings().iter().any(|binding| {
        binding.consumer_instance() == "lenso.web-ingress/telemetry"
            && binding.capability_id() == stream_endpoint::CAPABILITY_ID
    }));
    let observe = plan
        .plugin_instances()
        .iter()
        .find(|instance| instance.instance_key() == "lenso.console.workspace.observe/sample-app")
        .unwrap();
    let configuration: serde_json::Value = serde_json::from_str(observe.configuration()).unwrap();
    assert_eq!(configuration["source_id"], "sample-app");
    assert!(configuration["token_file"].as_str().is_some());
    assert!(!observe.configuration().contains("otlp-token-contents"));
}

#[test]
fn agent_control_token_stays_out_of_the_resolved_plan() {
    let root = tempfile::tempdir().unwrap();
    let token_file = root.path().join("agent-control-token");
    store_agent_control_token(&token_file, "host-secret").unwrap();
    let mut plugin_config: ConsolePluginConfig = ConsolePluginConfig::defaults();
    plugin_config.agent_control_token_file = Some(token_file.to_str().unwrap().to_owned());
    let config = ConsoleAppConfig::from_plugin(&plugin_config).unwrap();
    let serialized = serde_json::to_string(&console_host_plan(&config).unwrap()).unwrap();

    assert!(!serialized.contains("host-secret"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        assert_eq!(
            std::fs::metadata(token_file).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}

#[tokio::test(flavor = "current_thread")]
#[allow(clippy::too_many_lines)] // One end-to-end Host scenario is easier to audit in sequence.
async fn reference_host_serves_the_plan_bound_workspace_catalog() {
    let agent_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let agent_address = agent_listener.local_addr().unwrap();
    let agent = tokio::spawn(async move {
        axum::serve(
            agent_listener,
            Router::new()
                .route(
                    "/api/console/v1/agent/bootstrap",
                    get(|| async { AxumJson(serde_json::json!({})) }),
                )
                .route(
                    "/api/console/v1/agent/turns",
                    axum::routing::post(|| async {
                        AxumResponse::builder()
                            .header(header::CONTENT_TYPE, "text/event-stream")
                            .body(AxumBody::from_stream(futures::stream::iter([
                                Ok::<_, std::convert::Infallible>(Bytes::from_static(
                                    b"event: item\ndata: first\n\n",
                                )),
                                Ok(Bytes::from_static(b"event: terminal\ndata: second\n\n")),
                            ])))
                            .unwrap()
                    }),
                ),
        )
        .await
        .unwrap();
    });
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("index.html"), "<!doctype html>").unwrap();
    let reservation = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = reservation.local_addr().unwrap();
    drop(reservation);
    let mut plugin_config: ConsolePluginConfig = ConsolePluginConfig::defaults();
    plugin_config.console_agent_url = format!("http://{agent_address}");
    plugin_config.web_root = root.path().to_str().unwrap().to_owned();
    let mut config = ConsoleAppConfig::from_plugin(&plugin_config).unwrap();
    config.app_root = root.path().join("console-app");
    config.address = address;
    config.projects_workspace_origin = Some("http://127.0.0.1:55440".into());
    config.shell.agent_home = root.path().join("agent");
    install_welcome_fixture(&config.app_root);

    let local = tokio::task::LocalSet::new();
    Box::pin(
        local.run_until(async move {
            let host = start_host(&config).await.unwrap();
            let shell_client = reqwest::Client::new();
            // A browser loads the shell and assets in a concurrent burst.
            // Exercise the real ingress and immutable Host Plan, without retries.
            let responses = futures::future::join_all((0..32).map(|_| {
                shell_client
                    .get(format!("http://{address}/workspaces/projects"))
                    .send()
            }))
            .await;
            for response in responses {
                let response = response.unwrap();
                assert_eq!(response.status(), StatusCode::OK);
                assert!(response.text().await.unwrap().contains("<!doctype html>"));
            }

            for path in ["/", "/workspaces/projects"] {
                let url = format!("http://{address}{path}");
                let shell = shell_client.get(&url).send().await.unwrap();
                assert_eq!(shell.status(), StatusCode::OK);
                assert!(shell.text().await.unwrap().contains("<!doctype html>"));
                let head = shell_client.head(&url).send().await.unwrap();
                assert_eq!(head.status(), StatusCode::OK);
                assert!(head.bytes().await.unwrap().is_empty());
            }
            let catalog = reqwest::get(format!("http://{address}/api/console/v1/pages"))
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
            assert!(
                catalog.contains("lenso.console.workspace.welcome/default"),
                "unexpected workspace catalog: {catalog}"
            );
            assert!(catalog.contains("\"service_id\":\"welcome\""));
            assert!(catalog.contains("\"available\":true"));
            // Projects Web supplies these assets from its own package; Console
            // only serves the admitted contribution and dispatches its service.
            let value: serde_json::Value = serde_json::from_str(&catalog).unwrap();
            let projects = value["mounts"].as_array().unwrap().iter().find(|mount| mount["id"] == "projects").unwrap();
            let module = projects["module"].as_str().unwrap();
            let module = shell_client.get(format!("http://{address}{module}")).send().await.unwrap();
            assert_eq!(module.status(), StatusCode::OK);
            assert_eq!(module.text().await.unwrap(), lenso_projects_web_plugin::workspace_assets::MODULE);
            let status = shell_client.post(format!("http://{address}/api/console/v1/pages/projects/services/projects/invoke/connection_status"))
                .json(&serde_json::json!({})).send().await.unwrap();
            assert_eq!(status.status(), StatusCode::OK);
            assert_eq!(status.json::<serde_json::Value>().await.unwrap()["connected"], false);

            let client = reqwest::Client::new();
            let response = client
                .post(format!(
                    "http://{address}/api/console/v1/pages/welcome/services/welcome/invoke/greet"
                ))
                .json(&serde_json::json!({ "name": "Console" }))
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                response.json::<serde_json::Value>().await.unwrap()["message"],
                "Hello, Console. This came through the Plan-bound service."
            );
            let undeclared = client
                .post(format!(
                    "http://{address}/api/console/v1/pages/welcome/services/welcome/invoke/delete"
                ))
                .json(&serde_json::json!({}))
                .send()
                .await
                .unwrap();
            assert_eq!(undeclared.status(), StatusCode::NOT_FOUND);
            let oversized = client
                .post(format!(
                    "http://{address}/api/console/v1/pages/welcome/services/welcome/invoke/greet"
                ))
                .body(vec![b'x'; 1024 * 1024 + 1])
                .send()
                .await
                .unwrap();
            assert_eq!(oversized.status(), StatusCode::PAYLOAD_TOO_LARGE);
            let stream = client
                .post(format!(
                    "http://{address}/api/console/v1/pages/welcome/services/welcome/subscribe/ticks"
                ))
                .json(&serde_json::json!({ "count": 2 }))
                .send()
                .await
                .unwrap();
            assert_eq!(stream.status(), StatusCode::OK);
            let stream = stream.text().await.unwrap();
            assert_eq!(stream.matches("event: item").count(), 2);
            assert!(stream.contains("event: terminal"));
            let agent_stream = client
                .post(format!("http://{address}/api/console/v1/agent/turns"))
                .json(&serde_json::json!({}))
                .send()
                .await
                .unwrap();
            assert_eq!(agent_stream.status(), StatusCode::OK);
            let agent_stream = agent_stream.text().await.unwrap();
            assert!(agent_stream.contains("data: first"));
            assert!(agent_stream.contains("data: second"));
            let shutdown = host.shutdown(std::time::Duration::from_secs(2)).await;
            assert_eq!(
                shutdown,
                ShutdownOutcome::Clean,
                "unexpected shutdown: {shutdown:?}"
            );
            let revoked = client
                .post(format!(
                    "http://{address}/api/console/v1/pages/welcome/services/welcome/invoke/greet"
                ))
                .json(&serde_json::json!({ "name": "late" }))
                .send()
                .await;
            assert!(revoked.is_err());
            // Removing every optional Workspace must still leave a usable Shell.
            let welcome = config
                .app_root
                .join("plugins/lenso.console.workspace.welcome");
            std::fs::create_dir_all(&welcome).unwrap();
            std::fs::remove_file(welcome.join("default.toml")).unwrap();
            let projects = config.app_root.join("plugins/lenso.console.workspace.projects");
            std::fs::create_dir_all(&projects).unwrap();
            std::fs::write(projects.join("default.disabled"), []).unwrap();

            let shell_only = start_host(&config).await.unwrap();
            let response = client
                .get(format!("http://{address}/api/console/v1/pages"))
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let catalog: serde_json::Value = response.json().await.unwrap();
            assert_eq!(
                catalog["mounts"],
                serde_json::json!([]),
                "unexpected catalog: {catalog}"
            );
            let response = client
                .get(format!("http://{address}/"))
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert!(response.text().await.unwrap().contains("<!doctype html>"));
            assert_eq!(
                shell_only.shutdown(std::time::Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );
        }),
    )
    .await;
    agent.abort();
}

#[tokio::test(flavor = "current_thread")]
// Regression: reconnecting before transport cleanup must neither reject the new
// watch nor retain permits indefinitely. The existing OTLP test only opened
// short requests and could not detect replacement-stream admission failures.
#[allow(clippy::too_many_lines)]
async fn reference_host_routes_otlp_through_a_plan_bound_web_ingress() {
    let agent_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let agent_address = agent_listener.local_addr().unwrap();
    let agent = tokio::spawn(async move {
        axum::serve(
            agent_listener,
            Router::new().route(
                "/api/console/v1/agent/bootstrap",
                get(|| async { AxumJson(serde_json::json!({})) }),
            ),
        )
        .await
        .unwrap();
    });
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("index.html"), "<!doctype html>").unwrap();
    let console_listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let console_address = console_listener.local_addr().unwrap();
    drop(console_listener);
    let telemetry_listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let telemetry_address = telemetry_listener.local_addr().unwrap();
    drop(telemetry_listener);
    let mut plugin_config: ConsolePluginConfig = ConsolePluginConfig::defaults();
    plugin_config.console_agent_url = format!("http://{agent_address}");
    plugin_config.web_root = root.path().to_str().unwrap().to_owned();
    let config = lenso_console_plugin::ConsoleConfig::from_plugin(&plugin_config)
        .unwrap()
        .with_managed_app(&ManagedAppConnection {
            id: "sample-app".to_owned(),
            label: "Sample App".to_owned(),
            origin: format!("http://{agent_address}"),
            console_extensions: false,
            control_token_env: None,
        })
        .unwrap();
    let mut config = ConsoleAppConfig::new(config);
    config.address = console_address;
    config.app_root = root.path().join("console-app");
    config.telemetry_address = telemetry_address;
    config.shell.agent_home = root.path().join("agent");

    Box::pin(tokio::task::LocalSet::new()
        .run_until(async move {
            // Existing public Observe fixture input, never a generated or real key.
            let token = "test-token-which-is-long-enough:test-token-which-is-long-enough";
            std::fs::create_dir_all(root.path().join("observe")).unwrap();
            std::fs::write(root.path().join("observe/otlp-token"), token).unwrap();
            let host = start_host(&config).await.unwrap();
            let endpoint = format!("http://{telemetry_address}/v1/traces");
            let client = reqwest::Client::new();
            let unauthorized = client
                .post(&endpoint)
                .header("content-type", "application/x-protobuf")
                .body(Vec::new())
                .send()
                .await
                .unwrap();
            assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
            let accepted = client
                .post(endpoint)
                .header("content-type", "application/x-protobuf")
                .bearer_auth(token.trim())
                .body(Vec::new())
                .send()
                .await
                .unwrap();
            assert_eq!(accepted.status(), StatusCode::OK);
            assert_eq!(
                accepted.headers()[header::CONTENT_TYPE],
                "application/x-protobuf"
            );
            // Replace a live HTTP watch before dropping its predecessor, as
            // Refresh does. More than 16 replacements expose retained permits.
            let watch_url = format!("http://{console_address}/api/console/v1/pages/observe-sample-app/services/observe/subscribe/watch_requests");
            let mut previous = None;
            for _ in 0..32 {
                let response = tokio::time::timeout(
                    std::time::Duration::from_secs(2),
                    client.post(&watch_url).json(&serde_json::json!({"source_id":"sample-app"})).send(),
                ).await.expect("replacement watch retained capacity").unwrap();
                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(response.headers()[header::CONTENT_TYPE], "text/event-stream");
                previous = Some(response);
            }
            drop(previous);

            // Exercise this exact real provider binding independently of ingress
            // admission. All 16 permits must be reusable after the HTTP cycles;
            // the 17th waits and proceeds only after a held stream is released.
            let watch = host.stream_handle::<lenso_capability_workspace_service::WorkspaceServiceSubscribe>("lenso.console.web/default").unwrap();
            let request = || lenso_capability_workspace_service::SubscribeRequest {
                body_base64: "eyJzb3VyY2VfaWQiOiJzYW1wbGUtYXBwIn0=".into(),
                media_type: lenso_capability_workspace_service::SubscribeRequestMediaType::ApplicationJson,
                operation: "watch_requests".into(),
                service_id: "observe".into(),
            };
            let mut held = Vec::new();
            for _ in 0..16 {
                held.push(tokio::time::timeout(std::time::Duration::from_secs(2), watch.open("subscribe", request())).await.expect("released watch permit was not reusable").unwrap().unwrap());
            }
            let replacement = watch.open("subscribe", request());
            tokio::pin!(replacement);
            assert!(tokio::time::timeout(std::time::Duration::from_millis(25), &mut replacement).await.is_err(), "a 17th live stream bypassed the configured bound");
            let released = held.pop().unwrap();
            released.cancel();
            drop(released);
            held.push(tokio::time::timeout(std::time::Duration::from_secs(2), replacement).await.expect("queued watch did not resume after release").unwrap().unwrap());
            for stream in held {
                stream.cancel();
            }
            assert_eq!(
                host.shutdown(std::time::Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );
            let database = root.path().join("observe/telemetry.sqlite3");
            let retained = std::fs::read(&database).unwrap();
            let observe = config.app_root.join("plugins/lenso.console.workspace.observe");
            std::fs::create_dir_all(&observe).unwrap();
            std::fs::write(observe.join("sample-app.disabled"), []).unwrap();
            let without_observe = start_host(&config).await.unwrap();
            let catalog = client.get(format!("http://{console_address}/api/console/v1/pages")).send().await.unwrap();
            assert_eq!(catalog.status(), StatusCode::OK);
            let catalog: serde_json::Value = catalog.json().await.unwrap();
            assert_eq!(catalog["mounts"], serde_json::json!([]));
            let removed = client.post(format!("http://{console_address}/api/console/v1/pages/observe-sample-app/services/observe/invoke/list_requests"))
                .json(&serde_json::json!({})).send().await.unwrap();
            assert_eq!(removed.status(), StatusCode::NOT_FOUND);
            assert_eq!(without_observe.shutdown(std::time::Duration::from_secs(2)).await, ShutdownOutcome::Clean);
            assert_eq!(std::fs::read(database).unwrap(), retained);

        }))
        .await;
    agent.abort();
}

fn install_welcome_fixture(root: &Path) {
    lenso_console_welcome_workspace_plugin::link();
    let plugin = root.join("plugins/lenso.console.workspace.welcome");
    std::fs::create_dir_all(&plugin).unwrap();
    std::fs::write(plugin.join("default.toml"), "").unwrap();
}
