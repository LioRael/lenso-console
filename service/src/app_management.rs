//! Console-owned HTTP management projection. Agent interaction remains a separate catalog.
use super::{
    AgentCatalog, AppAgentAdapter, Bytes, Deserialize, HeaderMap, Json, MAX_AGENT_REQUEST_BYTES,
    Method, OriginalUri, Response, Serialize, State, StatusCode,
    allowed_plugin_configuration_route, allowed_plugin_lifecycle_route, problem, proxy_request_at,
};
use crate::http::{IntoResponse as _, Path as HttpPath, Request};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ManagedAppConnection {
    pub id: String,
    pub label: String,
    pub origin: String,
    #[serde(default)]
    pub console_extensions: bool,
    /// Environment variable name; never a token value in the public catalog.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub control_token_env: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ManagedAppAdapter {
    transport: AppAgentAdapter,
    console_extensions: bool,
}

impl ManagedAppAdapter {
    pub fn connect(config: &ManagedAppConnection) -> anyhow::Result<Self> {
        anyhow::ensure!(config.id != "console-extensions", "reserved App identity");
        let mut transport = AppAgentAdapter::parse_as(&config.id, &config.origin, &config.label)
            .map_err(anyhow::Error::msg)?
            .ok_or_else(|| anyhow::anyhow!("App management origin is required"))?;
        transport.plugin_configuration = true;
        transport.authorization = config
            .control_token_env
            .as_ref()
            .map(|name| {
                std::env::var(name)
                    .map(|token| format!("Bearer {token}"))
                    .map_err(|_| {
                        anyhow::anyhow!("App control token environment variable is unavailable")
                    })
            })
            .transpose()?;
        Ok(Self {
            transport,
            console_extensions: config.console_extensions,
        })
    }

    pub(crate) fn application_subject_id(&self) -> Option<&str> {
        (!self.console_extensions).then_some(self.transport.id.as_str())
    }
}

#[derive(Clone)]
pub(super) struct AppCatalog {
    pub agents: AgentCatalog,
    pub apps: Vec<ManagedAppAdapter>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppIdentity {
    id: String,
    label: String,
    scope: &'static str,
    plugin_configuration: bool,
    agent_id: Option<String>,
    local_bundle_install: bool,
}

fn agent_app(agent: &AppAgentAdapter, scope: &'static str) -> AppIdentity {
    AppIdentity {
        id: agent.id.clone(),
        label: agent.label.clone(),
        scope,
        plugin_configuration: agent.plugin_configuration,
        agent_id: Some(agent.id.clone()),
        local_bundle_install: scope == "management-agent",
    }
}

fn list_apps(State(catalog): State<AppCatalog>) -> Json<serde_json::Value> {
    let mut apps = vec![agent_app(&catalog.agents.console_agent, "management-agent")];
    apps.extend(
        catalog
            .agents
            .app_agents
            .iter()
            .map(|app| agent_app(app, "application")),
    );
    if !catalog.apps.iter().any(|app| app.console_extensions) {
        apps.push(AppIdentity {
            id: "console-extensions".to_owned(),
            label: "Console".to_owned(),
            scope: "console-extensions",
            plugin_configuration: false,
            agent_id: None,
            local_bundle_install: false,
        });
    }
    apps.extend(catalog.apps.iter().map(|app| AppIdentity {
        id: app.transport.id.clone(),
        label: app.transport.label.clone(),
        scope: if app.console_extensions {
            "console-extensions"
        } else {
            "application"
        },
        plugin_configuration: app.transport.plugin_configuration,
        agent_id: None,
        local_bundle_install: false,
    }));
    Json(serde_json::json!({ "apps": apps }))
}

pub(super) async fn handle(catalog: &AppCatalog, request: &Request) -> Option<Response> {
    if request.path == "/api/console/v1/apps" {
        return Some(if request.method == Method::GET {
            list_apps(State(catalog.clone())).into_response()
        } else {
            StatusCode::METHOD_NOT_ALLOWED.into_response()
        });
    }
    let tail = request.path.strip_prefix("/api/console/v1/apps/")?;
    let (id, path) = tail.split_once('/')?;
    if request.body.len() > MAX_AGENT_REQUEST_BYTES {
        return Some(problem(
            StatusCode::PAYLOAD_TOO_LARGE,
            "App management request body is too large",
        ));
    }
    Some(
        route_app(
            State(catalog.clone()),
            HttpPath((
                crate::http::decode_path(id)?,
                crate::http::decode_path(path)?,
            )),
            OriginalUri(request.uri()),
            request.method.clone(),
            request.headers.clone(),
            request.body.clone(),
        )
        .await,
    )
}

async fn route_app(
    State(catalog): State<AppCatalog>,
    HttpPath((id, path)): HttpPath<(String, String)>,
    OriginalUri(incoming): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let (target, base, local_install) =
        if let Some(app) = catalog.apps.iter().find(|app| app.transport.id == id) {
            (app.transport.clone(), "/api/lenso/v1", false)
        } else if id == catalog.agents.console_agent.id {
            (catalog.agents.console_agent, "/api/console/v1/agent", true)
        } else if let Some(app) = catalog.agents.app_agents.iter().find(|app| app.id == id) {
            (app.clone(), "/api/console/v1/agent", false)
        } else {
            return problem(StatusCode::NOT_FOUND, "App management target was not found");
        };
    let parts = path.split('/').collect::<Vec<_>>();
    let allowed = target.plugin_configuration
        && ((method == Method::GET && path == "plugins")
            || allowed_plugin_configuration_route(&method, &parts)
            || (local_install && method == Method::POST && path == "control/plugins/install"))
        || target.plugin_lifecycle && allowed_plugin_lifecycle_route(&method, &parts);
    if !allowed {
        return problem(StatusCode::NOT_FOUND, "App management route is unavailable");
    }
    proxy_request_at(target, base, path, incoming, method, headers, body).await
}

pub(super) fn validate_connections(
    agents: &[AppAgentAdapter],
    apps: &[ManagedAppAdapter],
) -> anyhow::Result<()> {
    let mut ids = std::collections::BTreeSet::from(["console", "console-extensions"]);
    for id in agents
        .iter()
        .map(|app| app.id.as_str())
        .chain(apps.iter().map(|app| app.transport.id.as_str()))
    {
        anyhow::ensure!(
            ids.insert(id),
            "duplicate or reserved App management identity"
        );
    }
    anyhow::ensure!(
        apps.iter().filter(|app| app.console_extensions).count() <= 1,
        "only one Console extension authority may be configured"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{handle_agent_request, http::Request};
    use ::http::header;

    fn connection(id: &str, origin: &str) -> ManagedAppConnection {
        ManagedAppConnection {
            id: id.to_owned(),
            label: "Support App".to_owned(),
            origin: origin.to_owned(),
            console_extensions: false,
            control_token_env: None,
        }
    }

    #[test]
    fn rejects_ambiguous_and_nonlocal_management_targets() {
        assert!(ManagedAppAdapter::connect(&connection("support", "http://example.com")).is_err());
        assert!(ManagedAppAdapter::connect(&connection("console", "http://127.0.0.1:1")).is_err());
        let app = ManagedAppAdapter::connect(&connection("support", "http://127.0.0.1:1")).unwrap();
        assert!(validate_connections(&[], &[app.clone(), app.clone()]).is_err());
        let agent = AppAgentAdapter::parse_as("support", "http://127.0.0.1:2", "Agent")
            .unwrap()
            .unwrap();
        assert!(validate_connections(&[agent], &[app]).is_err());
    }

    #[tokio::test]
    async fn explicit_console_extension_authority_replaces_only_the_placeholder() {
        let mut config = connection("console-web", "http://127.0.0.1:1");
        config.console_extensions = true;
        let app = ManagedAppAdapter::connect(&config).unwrap();
        let agents = AgentCatalog::new(
            AppAgentAdapter::parse_console("http://127.0.0.1:2", None).unwrap(),
            Vec::new(),
        );
        let Json(catalog) = list_apps(State(AppCatalog {
            agents,
            apps: vec![app],
        }));
        let apps = catalog["apps"].as_array().unwrap();
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0]["id"], "console");
        assert_eq!(apps[0]["scope"], "management-agent");
        assert_eq!(apps[1]["id"], "console-web");
        assert_eq!(apps[1]["scope"], "console-extensions");
        assert_eq!(apps[1]["pluginConfiguration"], true);
    }

    async fn response_json(response: Response) -> serde_json::Value {
        serde_json::from_slice(&response.into_body().collect(1024 * 1024).await.unwrap()).unwrap()
    }

    async fn assert_catalog_and_target_routing(catalog: &AppCatalog) {
        let value = handle(catalog, &Request::new(Method::GET, "/api/console/v1/apps"))
            .await
            .unwrap();
        let catalog_json = response_json(value).await;
        assert_eq!(catalog_json["apps"].as_array().unwrap().len(), 4);
        let support = catalog_json["apps"]
            .as_array()
            .unwrap()
            .iter()
            .find(|app| app["id"] == "support")
            .unwrap();
        assert_eq!(support["agentId"], serde_json::Value::Null);
        assert_eq!(support["pluginConfiguration"], true);
        assert!(!catalog_json.to_string().contains("control"));
        let agent_catalog = response_json(
            handle_agent_request(
                &catalog.agents,
                &Request::new(Method::GET, "/api/console/v1/agents"),
            )
            .await
            .unwrap(),
        )
        .await;
        assert_eq!(agent_catalog["agents"].as_array().unwrap().len(), 2);
        for (id, expected_path, expected_auth) in [
            (
                "support",
                "/api/lenso/v1/plugins",
                Some("Bearer app-control"),
            ),
            ("development", "/api/console/v1/agent/plugins", None),
            (
                "console",
                "/api/console/v1/agent/plugins",
                Some("Bearer console-control"),
            ),
        ] {
            let response = response_json(
                handle(
                    catalog,
                    &Request::new(
                        Method::GET,
                        &format!("/api/console/v1/apps/{id}/plugins?after=3"),
                    )
                    .with_header(header::AUTHORIZATION, "Bearer browser-token"),
                )
                .await
                .unwrap(),
            )
            .await;
            assert_eq!(response["path"], expected_path);
            assert_eq!(response["authorization"], serde_json::json!(expected_auth));
            assert_eq!(response["query"], "after=3");
        }
    }

    #[tokio::test]
    async fn non_agent_app_is_separate_and_proxy_is_plugin_only() {
        async fn upstream(
            headers: axum::http::HeaderMap,
            axum::extract::OriginalUri(uri): axum::extract::OriginalUri,
            method: axum::http::Method,
        ) -> axum::Json<serde_json::Value> {
            axum::Json(
                serde_json::json!({ "path": uri.path(), "query": uri.query(), "method": method.as_str(), "authorization": headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()) }),
            )
        }
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let target = tokio::spawn(async move {
            axum::serve(listener, axum::Router::new().fallback(upstream))
                .await
                .unwrap();
        });
        let mut app = ManagedAppAdapter::connect(&connection("support", &origin)).unwrap();
        app.transport.authorization = Some("Bearer app-control".to_owned());
        let console =
            AppAgentAdapter::parse_console(&origin, Some("console-control".to_owned())).unwrap();
        let mut agent = AppAgentAdapter::parse_as("development", &origin, "Development Agent")
            .unwrap()
            .unwrap();
        agent.plugin_configuration = true;
        let agents = AgentCatalog::new(console, vec![agent]);
        let catalog = AppCatalog {
            agents: agents.clone(),
            apps: vec![app],
        };
        assert_catalog_and_target_routing(&catalog).await;
        let response = response_json(
            handle(
                &catalog,
                &Request::new(
                    Method::PUT,
                    "/api/console/v1/apps/support/control/plugins/example/default/enabled",
                ),
            )
            .await
            .unwrap(),
        )
        .await;
        assert_eq!(
            response["path"],
            "/api/lenso/v1/control/plugins/example/default/enabled"
        );
        for path in [
            "bootstrap",
            "sessions",
            "auth/connections",
            "control/plugins/install",
        ] {
            assert_eq!(
                handle(
                    &catalog,
                    &Request::new(Method::GET, &format!("/api/console/v1/apps/support/{path}"),),
                )
                .await
                .unwrap()
                .status(),
                StatusCode::NOT_FOUND
            );
        }
        assert_eq!(
            handle(
                &catalog,
                &Request::new(Method::POST, "/api/console/v1/apps/support/turns"),
            )
            .await
            .unwrap()
            .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            handle_agent_request(
                &agents,
                &Request::new(Method::GET, "/api/console/v1/agents/support/bootstrap"),
            )
            .await
            .unwrap()
            .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            handle(
                &catalog,
                &Request::new(
                    Method::GET,
                    "/api/console/v1/apps/console-extensions/plugins",
                ),
            )
            .await
            .unwrap()
            .status(),
            StatusCode::NOT_FOUND
        );
        target.abort();
    }
}
