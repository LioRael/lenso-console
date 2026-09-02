use std::{
    future::Future,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
};

use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{OriginalUri, Path as AxumPath, State},
    http::{HeaderMap, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{any, get},
};
use directories::BaseDirs;
use lenso::prelude::*;
use lenso_agent_web::{
    AgentWebAccess, AgentWebConfig, AgentWebControl, AgentWebSurface,
    PluginConfigurationStoreConfig,
};
use serde::{Deserialize, Serialize};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::{ServeDir, ServeFile};

const DEFAULT_PORT: u16 = 3030;
const MAX_AGENT_REQUEST_BYTES: usize = 64 * 1024;
pub const AGENT_PLUGIN_CONFIGURATION_CAPABILITY: &str = "lenso.agent.plugin-configuration@1";

fn default_console_agent_tools() -> Vec<String> {
    lenso_agent_console_plugins::PLUGIN_CONTROL_TOOLS
        .iter()
        .map(|tool| (*tool).to_owned())
        .collect()
}

fn configured_console_agent_tools(value: Option<&str>) -> Vec<String> {
    value.map_or_else(default_console_agent_tools, |value| {
        value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .collect()
    })
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsolePluginConfig {
    address: String,
    agent_home: String,
    allowed_tools: Vec<String>,
    agent_configuration_store: String,
    connected_agent_label: String,
    connected_agent_plugin_configuration: bool,
    connected_agent_url: String,
    managed_app_root: String,
    web_root: String,
}

pub fn validate_plugin_config(config: &ConsolePluginConfig) -> Result<(), RuntimeFailure> {
    let address = config
        .address
        .parse::<SocketAddr>()
        .map_err(|error| invalid_plan(format!("invalid Console address: {error}")))?;
    if !address.ip().is_loopback() {
        return Err(invalid_plan("Console address must be loopback"));
    }
    if config.agent_home.is_empty()
        || config.agent_configuration_store.is_empty()
        || config.connected_agent_label.trim().is_empty()
        || config.managed_app_root.is_empty()
        || config.web_root.is_empty()
    {
        return Err(invalid_plan("Console paths must not be empty"));
    }
    AppAgentAdapter::parse(&config.connected_agent_url, &config.connected_agent_label)
        .map_err(invalid_plan)?;
    Ok(())
}

#[lenso::plugin(
    consumer,
    lifecycle,
    configuration_schema = "config.schema.json",
    configuration_defaults = "config.defaults.json",
    validate = validate_plugin_config
)]
#[derive(Clone, Debug)]
pub struct ConsolePlugin {
    #[config]
    config: ConsolePluginConfig,
    #[tasks]
    tasks: ManagedTasks,
}

impl Lifecycle for ConsolePlugin {
    async fn activate(&self, _context: ActivateContext) -> Result<(), RuntimeFailure> {
        let config = ConsoleConfig::from_plugin(&self.config).map_err(plugin_failure)?;
        let server = ConsoleServer::start(config).await.map_err(plugin_failure)?;
        let cancellation = self.tasks.cancellation().map_err(|error| {
            plugin_failure(format!("Console task scope is unavailable: {error:?}"))
        })?;
        let (shutdown, shutdown_signal) = tokio::sync::oneshot::channel();
        self.tasks
            .spawn_local(async move {
                cancellation.cancelled().await;
                let _ = shutdown.send(());
            })
            .map_err(|error| plugin_failure(format!("Console shutdown task failed: {error:?}")))?;
        self.tasks
            .spawn_local(async move {
                if let Err(error) = server
                    .run(async move {
                        let _ = shutdown_signal.await;
                    })
                    .await
                {
                    eprintln!("Lenso Console stopped: {error:#}");
                }
            })
            .map_err(|error| plugin_failure(format!("Console server task failed: {error:?}")))?;
        Ok(())
    }
}

/// Forces the linked Console Plugin into a Console-capable Host executable.
pub fn link() {}

#[derive(Clone, Debug)]
pub struct ConsoleConfig {
    pub address: SocketAddr,
    pub agent_home: PathBuf,
    pub managed_app_root: PathBuf,
    pub allowed_tools: Vec<String>,
    pub app_agents: Vec<AppAgentAdapter>,
    pub agent_configuration_store: PathBuf,
    pub tool_policy: PathBuf,
    pub web_root: PathBuf,
}

impl ConsoleConfig {
    /// Contributes one App Agent through an existing loopback Agent Web Adapter.
    pub fn with_app_agent(self, origin: &str, label: &str) -> anyhow::Result<Self> {
        self.with_app_agent_identity("app", origin, label)
    }

    /// Contributes one independently addressed App Agent identity.
    pub fn with_app_agent_identity(
        mut self,
        id: &str,
        origin: &str,
        label: &str,
    ) -> anyhow::Result<Self> {
        let Some(app_agent) =
            AppAgentAdapter::parse_as(id, origin, label).map_err(anyhow::Error::msg)?
        else {
            return Ok(self);
        };
        anyhow::ensure!(
            self.app_agents.iter().all(|agent| agent.id != app_agent.id),
            "App Agent identity `{id}` is already configured"
        );
        self.app_agents.push(app_agent);
        Ok(self)
    }

    /// Contributes one App Agent whose Host explicitly provides Plugin configuration control.
    pub fn with_app_agent_configuration(self, origin: &str, label: &str) -> anyhow::Result<Self> {
        self.with_app_agent_identity_configuration("app", origin, label)
    }

    /// Contributes one independently addressed App Agent with Plugin configuration control.
    pub fn with_app_agent_identity_configuration(
        mut self,
        id: &str,
        origin: &str,
        label: &str,
    ) -> anyhow::Result<Self> {
        let Some(mut app_agent) =
            AppAgentAdapter::parse_as(id, origin, label).map_err(anyhow::Error::msg)?
        else {
            return Ok(self);
        };
        app_agent.plugin_configuration = true;
        anyhow::ensure!(
            self.app_agents.iter().all(|agent| agent.id != app_agent.id),
            "App Agent identity `{id}` is already configured"
        );
        self.app_agents.push(app_agent);
        Ok(self)
    }

    /// Connects the Console Shell to one existing loopback Agent Harness.
    #[deprecated(note = "use with_app_agent; connection topology is not Agent identity")]
    pub fn with_connected_agent(self, origin: &str, label: &str) -> anyhow::Result<Self> {
        self.with_app_agent(origin, label)
    }

    pub fn from_plugin(config: &ConsolePluginConfig) -> anyhow::Result<Self> {
        let current = std::env::current_dir()?;
        let agent_home = resolve_path(&current, &config.agent_home);
        let mut app_agents: Vec<_> =
            AppAgentAdapter::parse(&config.connected_agent_url, &config.connected_agent_label)
                .map_err(anyhow::Error::msg)?
                .into_iter()
                .collect();
        if config.connected_agent_plugin_configuration {
            for agent in &mut app_agents {
                agent.plugin_configuration = true;
            }
        }
        Ok(Self {
            address: config.address.parse()?,
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            agent_configuration_store: resolve_path(&current, &config.agent_configuration_store),
            managed_app_root: resolve_path(&current, &config.managed_app_root),
            allowed_tools: config.allowed_tools.clone(),
            app_agents,
            web_root: resolve_path(&current, &config.web_root),
        })
    }

    pub fn load() -> anyhow::Result<Self> {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let _ = dotenvy::from_path(manifest.join(".env"));
        let address = SocketAddr::new(
            parse_loopback_host(std::env::var("HTTP_HOST").as_deref().unwrap_or("127.0.0.1"))?,
            std::env::var("HTTP_PORT")
                .ok()
                .map_or(Ok(DEFAULT_PORT), |value| value.parse())?,
        );
        let console_home =
            std::env::var_os("LENSO_CONSOLE_HOME").map_or_else(default_console_home, |value| {
                let path = PathBuf::from(value);
                if path.is_absolute() {
                    Ok(path)
                } else {
                    anyhow::bail!("LENSO_CONSOLE_HOME must be an absolute path")
                }
            })?;
        let agent_home = console_home.join("agent");
        let managed_app_root = resolve_app_root(std::env::var_os("LENSO_APP_ROOT"))?;
        let allowed_tools = match std::env::var("LENSO_CONSOLE_AGENT_TOOLS") {
            Ok(value) => configured_console_agent_tools(Some(&value)),
            Err(std::env::VarError::NotPresent) => configured_console_agent_tools(None),
            Err(error) => return Err(error.into()),
        };
        let connected_agent_url =
            std::env::var("LENSO_CONSOLE_CONNECTED_AGENT_URL").unwrap_or_default();
        let connected_agent_label = std::env::var("LENSO_CONSOLE_CONNECTED_AGENT_LABEL")
            .unwrap_or_else(|_| "Lenso Agent".to_owned());
        let connected_agent_plugin_configuration =
            parse_boolean_environment("LENSO_CONSOLE_CONNECTED_AGENT_PLUGIN_CONFIGURATION")?;
        let web_root = std::env::var_os("CONSOLE_WEB_ROOT")
            .map_or_else(|| manifest.join("../dist/client"), PathBuf::from);
        Ok(Self {
            address,
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            agent_configuration_store: console_home.join("agent-configuration.sqlite3"),
            managed_app_root,
            allowed_tools,
            app_agents: AppAgentAdapter::parse(&connected_agent_url, &connected_agent_label)
                .map_err(anyhow::Error::msg)?
                .into_iter()
                .map(|mut agent| {
                    agent.plugin_configuration = connected_agent_plugin_configuration;
                    agent
                })
                .collect(),
            web_root,
        })
    }

    pub fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            self.address.ip().is_loopback(),
            "the local Console Agent Host may bind only to a loopback address"
        );
        anyhow::ensure!(
            self.agent_home.is_absolute(),
            "Console Agent Home must be absolute"
        );
        anyhow::ensure!(
            self.managed_app_root.is_absolute(),
            "managed App root must be absolute"
        );
        anyhow::ensure!(
            self.agent_configuration_store.is_absolute(),
            "Console Agent configuration store must be absolute"
        );
        anyhow::ensure!(
            self.web_root.join("index.html").is_file(),
            "Console Shell build is missing at {}; run `pnpm service:web-build`",
            self.web_root.display()
        );
        Ok(())
    }

    fn agent_web_config(&self) -> AgentWebConfig {
        let mut config = AgentWebConfig::new(lenso_agent_console_plugins::link);
        config.access = AgentWebAccess::HostAuthorized;
        config.agent_home = Some(self.agent_home.clone());
        config.allowed_tools.clone_from(&self.allowed_tools);
        config.tool_policy = Some(self.tool_policy.clone());
        config.control = AgentWebControl::HostAuthorized;
        config.plugin_control = true;
        config.plugin_configuration_store = Some(PluginConfigurationStoreConfig::new(
            self.agent_configuration_store.clone(),
            "console-agent",
        ));
        config
    }
}

#[derive(Debug, Serialize)]
struct Health {
    status: &'static str,
}

pub async fn serve(
    config: ConsoleConfig,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> anyhow::Result<()> {
    ConsoleServer::start(config).await?.run(shutdown).await
}

struct ConsoleServer {
    address: SocketAddr,
    agent: AgentWebSurface,
    app: Router,
    listener: tokio::net::TcpListener,
}

impl ConsoleServer {
    async fn start(config: ConsoleConfig) -> anyhow::Result<Self> {
        config.validate()?;
        std::fs::create_dir_all(&config.agent_home)?;
        let agent = AgentWebSurface::start(config.agent_web_config())
            .await
            .map_err(anyhow::Error::msg)?;
        let index = config.web_root.join("index.html");
        let shell = ServeDir::new(config.web_root).fallback(ServeFile::new(index));
        let agent_catalog = AgentCatalog::new(config.app_agents);
        let app = Router::new()
            .route("/health/live", get(health))
            .route("/health/ready", get(health))
            .route("/health/startup", get(health))
            .merge(agent.router())
            .merge(agent_catalog_routes(agent_catalog))
            .route("/api/{*path}", any(api_not_found))
            .fallback_service(shell);
        let listener = match tokio::net::TcpListener::bind(config.address).await {
            Ok(listener) => listener,
            Err(error) => {
                agent.shutdown().await.map_err(anyhow::Error::msg)?;
                return Err(error.into());
            }
        };
        let address = match listener.local_addr() {
            Ok(address) => address,
            Err(error) => {
                agent.shutdown().await.map_err(anyhow::Error::msg)?;
                return Err(error.into());
            }
        };
        Ok(Self {
            address,
            agent,
            app,
            listener,
        })
    }

    async fn run(self, shutdown: impl Future<Output = ()> + Send + 'static) -> anyhow::Result<()> {
        println!("Lenso Console listening on http://{}", self.address);
        let result = axum::serve(self.listener, self.app)
            .with_graceful_shutdown(shutdown)
            .await;
        let agent_shutdown = self.agent.shutdown().await.map_err(anyhow::Error::msg);
        result?;
        agent_shutdown
    }
}

#[derive(Clone, Debug)]
pub struct AppAgentAdapter {
    client: reqwest::Client,
    id: String,
    label: String,
    origin: reqwest::Url,
    plugin_configuration: bool,
}

impl AppAgentAdapter {
    fn parse(origin: &str, label: &str) -> Result<Option<Self>, String> {
        Self::parse_as("app", origin, label)
    }

    fn parse_as(id: &str, origin: &str, label: &str) -> Result<Option<Self>, String> {
        if origin.trim().is_empty() {
            return Ok(None);
        }
        if !valid_agent_id(id) || id == "console" {
            return Err("App Agent identity is invalid".to_owned());
        }
        let origin = reqwest::Url::parse(origin.trim())
            .map_err(|error| format!("App Agent Adapter URL is invalid: {error}"))?;
        let loopback = origin.host_str().is_some_and(|host| {
            host == "localhost" || host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
        });
        if origin.scheme() != "http"
            || !loopback
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.path() != "/"
            || origin.query().is_some()
            || origin.fragment().is_some()
        {
            return Err("App Agent Adapter URL must be a clean loopback HTTP origin".to_owned());
        }
        let label = label.trim();
        if label.is_empty() {
            return Err("App Agent label must not be empty".to_owned());
        }
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(3))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| format!("App Agent Adapter client is invalid: {error}"))?;
        Ok(Some(Self {
            client,
            id: id.to_owned(),
            label: label.to_owned(),
            origin,
            plugin_configuration: false,
        }))
    }
}

#[derive(Clone, Debug)]
struct AgentCatalog {
    app_agents: Vec<AppAgentAdapter>,
}

impl AgentCatalog {
    fn new(app_agents: Vec<AppAgentAdapter>) -> Self {
        Self { app_agents }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentIdentity {
    capabilities: Vec<&'static str>,
    id: String,
    role: &'static str,
    label: String,
}

#[derive(Debug, Serialize)]
struct AgentIdentityList {
    agents: Vec<AgentIdentity>,
}

fn agent_catalog_routes(catalog: AgentCatalog) -> Router {
    Router::new()
        .route("/api/console/v1/agents", get(list_agents))
        .route(
            "/api/console/v1/agents/{agent_id}/{*path}",
            any(route_app_agent),
        )
        .layer(RequestBodyLimitLayer::new(MAX_AGENT_REQUEST_BYTES))
        .with_state(catalog)
}

async fn list_agents(State(catalog): State<AgentCatalog>) -> Json<AgentIdentityList> {
    let mut agents = vec![AgentIdentity {
        capabilities: vec![AGENT_PLUGIN_CONFIGURATION_CAPABILITY],
        id: "console".to_owned(),
        role: "console",
        label: "Console Agent".to_owned(),
    }];
    for app_agent in catalog.app_agents {
        agents.push(AgentIdentity {
            capabilities: app_agent
                .plugin_configuration
                .then_some(AGENT_PLUGIN_CONFIGURATION_CAPABILITY)
                .into_iter()
                .collect(),
            id: app_agent.id,
            role: "app",
            label: app_agent.label,
        });
    }
    Json(AgentIdentityList { agents })
}

async fn route_app_agent(
    State(catalog): State<AgentCatalog>,
    AxumPath((agent_id, path)): AxumPath<(String, String)>,
    OriginalUri(incoming): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let Some(app_agent) = catalog
        .app_agents
        .into_iter()
        .find(|app_agent| app_agent.id == agent_id)
    else {
        return problem(StatusCode::NOT_FOUND, "Agent identity was not found");
    };
    if !allowed_agent_route(&method, &path, app_agent.plugin_configuration) {
        return problem(StatusCode::NOT_FOUND, "App Agent route was not found");
    }
    let mut target_url = app_agent.origin;
    target_url.set_path(&format!("/api/console/v1/agent/{path}"));
    target_url.set_query(incoming.query());
    let mut request = app_agent.client.request(method, target_url).body(body);
    for name in [header::ACCEPT, header::CONTENT_TYPE, header::IF_NONE_MATCH] {
        if let Some(value) = headers.get(&name) {
            request = request.header(name, value);
        }
    }
    if let Some(value) = headers.get("last-event-id") {
        request = request.header("last-event-id", value);
    }
    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return problem(
                StatusCode::BAD_GATEWAY,
                &format!("App Agent is unavailable: {error}"),
            );
        }
    };
    let status = response.status();
    let headers = response.headers().clone();
    let mut proxied = Response::builder()
        .status(status)
        .header(header::CACHE_CONTROL, "no-store");
    for name in [header::CONTENT_TYPE, header::ETAG] {
        if let Some(value) = headers.get(&name) {
            proxied = proxied.header(name, value);
        }
    }
    if let Some(value) = headers.get("last-event-id") {
        proxied = proxied.header("last-event-id", value);
    }
    proxied
        .body(Body::from_stream(response.bytes_stream()))
        .unwrap_or_else(|_| problem(StatusCode::BAD_GATEWAY, "App Agent response failed"))
}

fn allowed_agent_route(method: &Method, path: &str, plugin_configuration: bool) -> bool {
    let parts = path.split('/').collect::<Vec<_>>();
    match (method, parts.as_slice()) {
        (
            &Method::GET,
            ["bootstrap" | "context-sources" | "models" | "plugins" | "sessions" | "tasks"]
            | ["terminal", "commands"],
        )
        | (&Method::POST, ["turns"] | ["terminal", "executions"]) => true,
        (&Method::GET | &Method::PATCH, ["sessions", session_id])
        | (
            &Method::GET,
            ["sessions", session_id, "trajectory"] | ["turns", session_id, "interactions"],
        )
        | (
            &Method::POST,
            ["turns", session_id, "cancel"]
            | ["sessions", session_id, "compact"]
            | ["terminal", "executions", session_id, "cancel"],
        ) => valid_agent_identity(session_id),
        (
            &Method::POST,
            [
                "turns",
                request_id,
                "interactions",
                interaction_id,
                "answer",
            ],
        ) => valid_agent_identity(request_id) && valid_agent_identity(interaction_id),
        _ => plugin_configuration && allowed_plugin_configuration_route(method, parts.as_slice()),
    }
}

fn allowed_plugin_configuration_route(method: &Method, parts: &[&str]) -> bool {
    match (method, parts) {
        (&Method::GET, ["control", "plugins"]) => true,
        (&Method::GET, ["control", "plugin-operations", operation_id]) => {
            valid_agent_identity(operation_id)
        }
        (
            &Method::POST,
            [
                "control",
                "plugins",
                package_id,
                instance_key,
                "configuration",
                "proposals" | "rollback-proposals",
            ],
        )
        | (
            &Method::GET,
            [
                "control",
                "plugins",
                package_id,
                instance_key,
                "configuration",
                "publications",
            ],
        )
        | (
            &Method::PUT,
            [
                "control",
                "plugins",
                package_id,
                instance_key,
                "configuration",
            ],
        )
        | (&Method::DELETE, ["control", "plugins", package_id, instance_key]) => {
            valid_plugin_route_segment(package_id) && valid_plugin_route_segment(instance_key)
        }
        _ => false,
    }
}

fn valid_plugin_route_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn valid_agent_identity(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn valid_agent_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_' | b'.')
        })
}

fn problem(status: StatusCode, detail: &str) -> Response {
    (
        status,
        Json(serde_json::json!({
            "detail": detail,
            "status": status.as_u16(),
            "title": status.canonical_reason().unwrap_or("Agent routing error"),
            "type": "about:blank"
        })),
    )
        .into_response()
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

async fn api_not_found() -> StatusCode {
    StatusCode::NOT_FOUND
}

fn parse_loopback_host(value: &str) -> anyhow::Result<IpAddr> {
    let address = match value {
        "localhost" => IpAddr::V4(Ipv4Addr::LOCALHOST),
        value => value.parse()?,
    };
    anyhow::ensure!(
        address.is_loopback(),
        "HTTP_HOST must be a loopback address"
    );
    Ok(address)
}

fn parse_boolean_environment(name: &str) -> anyhow::Result<bool> {
    match std::env::var(name) {
        Ok(value) if value.eq_ignore_ascii_case("true") || value == "1" => Ok(true),
        Ok(value) if value.eq_ignore_ascii_case("false") || value == "0" => Ok(false),
        Ok(value) => anyhow::bail!("{name} must be true, false, 1, or 0; received `{value}`"),
        Err(std::env::VarError::NotPresent) => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn default_console_home() -> anyhow::Result<PathBuf> {
    BaseDirs::new()
        .map(|directories| directories.home_dir().join(".lenso/console"))
        .ok_or_else(|| anyhow::anyhow!("the user home directory is unavailable"))
}

fn resolve_app_root(configured: Option<std::ffi::OsString>) -> anyhow::Result<PathBuf> {
    let current = std::env::current_dir()?;
    let root = configured.map_or(current.clone(), PathBuf::from);
    if root.is_absolute() {
        Ok(root)
    } else {
        Ok(current.join(root))
    }
}

fn resolve_path(current: &Path, configured: &str) -> PathBuf {
    let path = Path::new(configured);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        current.join(path)
    }
}

fn invalid_plan(detail: impl Into<String>) -> RuntimeFailure {
    RuntimeFailure::InvalidResolvedPlan {
        detail: detail.into(),
    }
}

fn plugin_failure(detail: impl std::fmt::Display) -> RuntimeFailure {
    RuntimeFailure::PluginFailure {
        detail: detail.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lenso_agent_host::{AgentHost, Profile, WebSurface};
    use lenso_app_authoring::LocalPluginRootAuthority;
    use std::sync::Arc;

    fn configure_test_codex_catalog(root: &Path, base_url: &str) {
        std::fs::create_dir_all(root).unwrap();
        let credentials = root.join("auth.json");
        std::fs::write(
            &credentials,
            r#"{"openai-codex":{"type":"oauth","access":"ci-access","refresh":"ci-refresh","accountId":"ci-account","expires":4102444800000}}"#,
        )
        .unwrap();
        let auth = root.join("plugins/lenso.agent.auth.openai-codex");
        std::fs::create_dir_all(&auth).unwrap();
        std::fs::write(
            auth.join("auth.toml"),
            format!(
                "issuer = \"https://auth.openai.com\"\nprofile = \"default\"\ncredential_file = {:?}\nrefresh_margin_seconds = 60\n",
                credentials.display().to_string()
            ),
        )
        .unwrap();
        let model = root.join("plugins/lenso.agent.model.openai-codex-direct");
        std::fs::create_dir_all(&model).unwrap();
        std::fs::write(
            model.join("model.toml"),
            format!(
                "base_url = {base_url:?}\nmodel = \"gpt-5.6-luna\"\nreasoning_effort = \"medium\"\nmax_event_bytes = 1048576\n"
            ),
        )
        .unwrap();
    }

    async fn start_test_codex_catalog() -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route(
                    "/codex/models",
                    get(|| async {
                        Json(serde_json::json!({
                            "models": [{
                                "slug": "gpt-5.6-luna",
                                "display_name": "CI Fixture",
                                "default_reasoning_level": "medium",
                                "supported_reasoning_levels": [{
                                    "effort": "medium",
                                    "description": "Balanced"
                                }],
                                "visibility": "list",
                                "supports_parallel_tool_calls": true,
                                "context_window": 272_000,
                                "effective_context_window_percent": 95,
                                "input_modalities": ["text"]
                            }]
                        }))
                    }),
                ),
            )
            .await
            .unwrap();
        });
        (format!("http://{address}"), server)
    }

    #[test]
    fn plugin_descriptor_is_an_endpoint_free_lifecycle_root() {
        let descriptor: serde_json::Value = serde_json::from_str(PLUGIN_DESCRIPTOR_JSON).unwrap();

        assert_eq!(descriptor["plugin_id"], "lenso.console.web");
        assert_eq!(descriptor["root_slot"], "console");
        assert_eq!(descriptor["provided_capabilities"], serde_json::json!([]));
        assert_eq!(descriptor["required_capabilities"], serde_json::json!([]));
    }

    #[test]
    fn console_agent_tool_defaults_are_reviewed_and_removable() {
        let expected = lenso_agent_console_plugins::PLUGIN_CONTROL_TOOLS
            .iter()
            .map(|tool| (*tool).to_owned())
            .collect::<Vec<_>>();
        let defaults: ConsolePluginConfig =
            serde_json::from_str(include_str!("../config.defaults.json")).unwrap();

        assert_eq!(default_console_agent_tools(), expected);
        assert_eq!(configured_console_agent_tools(None), expected);
        assert_eq!(defaults.allowed_tools, expected);
        assert!(configured_console_agent_tools(Some("")).is_empty());
        assert_eq!(
            configured_console_agent_tools(Some(" inspect_app, check_plugin_change ")),
            ["inspect_app", "check_plugin_change"]
        );
    }

    #[test]
    fn rejects_non_loopback_hosts() {
        assert!(parse_loopback_host("127.0.0.1").is_ok());
        assert!(parse_loopback_host("::1").is_ok());
        assert!(parse_loopback_host("0.0.0.0").is_err());
    }

    #[test]
    fn app_agent_adapter_accepts_only_clean_loopback_origins() {
        assert!(
            AppAgentAdapter::parse("http://127.0.0.1:8787", "Lenso Agent")
                .unwrap()
                .is_some()
        );
        assert!(AppAgentAdapter::parse("", "Lenso Agent").unwrap().is_none());
        assert!(AppAgentAdapter::parse("https://127.0.0.1:8787", "Lenso Agent").is_err());
        assert!(AppAgentAdapter::parse("http://example.com", "Lenso Agent").is_err());
        assert!(AppAgentAdapter::parse("http://127.0.0.1:8787/path", "Lenso Agent").is_err());
        assert!(
            AppAgentAdapter::parse_as("Console", "http://127.0.0.1:8787", "Lenso Agent").is_err()
        );
    }

    #[tokio::test]
    async fn ordinary_app_catalog_contains_the_full_console_agent() {
        let Json(catalog) = list_agents(State(AgentCatalog::new(Vec::new()))).await;

        assert_eq!(catalog.agents.len(), 1);
        assert_eq!(catalog.agents[0].id, "console");
        assert_eq!(catalog.agents[0].role, "console");
        assert_eq!(catalog.agents[0].label, "Console Agent");
        assert_eq!(
            catalog.agents[0].capabilities,
            [AGENT_PLUGIN_CONFIGURATION_CAPABILITY]
        );
    }

    #[tokio::test]
    async fn agent_app_catalog_adds_an_app_agent_identity() {
        let app_agent = AppAgentAdapter::parse("http://127.0.0.1:8787", "Support Agent").unwrap();
        let Json(catalog) =
            list_agents(State(AgentCatalog::new(app_agent.into_iter().collect()))).await;

        assert_eq!(catalog.agents.len(), 2);
        assert_eq!(catalog.agents[1].id, "app");
        assert_eq!(catalog.agents[1].role, "app");
        assert_eq!(catalog.agents[1].label, "Support Agent");
        assert!(catalog.agents[1].capabilities.is_empty());
    }

    #[tokio::test]
    async fn catalog_advertises_only_explicit_app_agent_configuration() {
        let mut app_agent = AppAgentAdapter::parse("http://127.0.0.1:8787", "Support Agent")
            .unwrap()
            .unwrap();
        app_agent.plugin_configuration = true;

        let Json(catalog) = list_agents(State(AgentCatalog::new(vec![app_agent]))).await;

        assert_eq!(
            catalog.agents[1].capabilities,
            [AGENT_PLUGIN_CONFIGURATION_CAPABILITY]
        );
    }

    #[tokio::test]
    async fn catalog_keeps_multiple_app_agent_identities_independent() {
        let support =
            AppAgentAdapter::parse_as("support", "http://127.0.0.1:8787", "Support Agent")
                .unwrap()
                .unwrap();
        let research =
            AppAgentAdapter::parse_as("research", "http://127.0.0.1:8788", "Research Agent")
                .unwrap()
                .unwrap();
        let Json(catalog) = list_agents(State(AgentCatalog {
            app_agents: vec![support, research],
        }))
        .await;

        assert_eq!(catalog.agents.len(), 3);
        assert_eq!(catalog.agents[1].id, "support");
        assert_eq!(catalog.agents[2].id, "research");
    }

    #[test]
    fn app_agent_adapter_exposes_only_the_agent_data_plane() {
        assert!(allowed_agent_route(&Method::GET, "bootstrap", false));
        assert!(allowed_agent_route(&Method::GET, "context-sources", false));
        assert!(allowed_agent_route(
            &Method::GET,
            "terminal/commands",
            false
        ));
        assert!(allowed_agent_route(
            &Method::POST,
            "terminal/executions/request-1/cancel",
            false
        ));
        assert!(allowed_agent_route(&Method::POST, "turns", false));
        assert!(allowed_agent_route(
            &Method::GET,
            "sessions/session-1/trajectory",
            false
        ));
        assert!(allowed_agent_route(
            &Method::POST,
            "sessions/session-1/compact",
            false
        ));
        assert!(!allowed_agent_route(
            &Method::GET,
            "control/tool-policy",
            false
        ));
        assert!(!allowed_agent_route(
            &Method::DELETE,
            "sessions/session-1",
            false
        ));
        assert!(!allowed_agent_route(
            &Method::GET,
            "sessions/../trajectory",
            false
        ));
    }

    #[test]
    fn plugin_configuration_capability_is_narrow_and_explicit() {
        let management = "control/plugins";
        let proposal = "control/plugins/lenso_agent_loop/agent/configuration/proposals";
        let publication = "control/plugins/lenso_agent_loop/agent/configuration";

        assert!(!allowed_agent_route(&Method::GET, management, false));
        assert!(allowed_agent_route(&Method::GET, management, true));
        assert!(allowed_agent_route(&Method::POST, proposal, true));
        assert!(allowed_agent_route(&Method::PUT, publication, true));
        assert!(allowed_agent_route(
            &Method::DELETE,
            "control/plugins/lenso.agent.loop/agent",
            true
        ));
        assert!(!allowed_agent_route(
            &Method::GET,
            "control/tool-policy",
            true
        ));
        assert!(!allowed_agent_route(
            &Method::POST,
            "control/plugins/install",
            true
        ));
        assert!(!allowed_agent_route(
            &Method::PUT,
            "control/plugins/lenso_agent_loop/agent/enabled",
            true
        ));
        assert!(!allowed_agent_route(
            &Method::DELETE,
            "control/plugins",
            true
        ));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn app_agent_adapter_preserves_the_agent_bootstrap() {
        let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_address = target_listener.local_addr().unwrap();
        let target = Router::new().route(
            "/api/console/v1/agent/bootstrap",
            get(|| async { Json(serde_json::json!({ "profile": "coding" })) }),
        );
        let target_task = tokio::spawn(async move {
            axum::serve(target_listener, target).await.unwrap();
        });

        let app_agent =
            AppAgentAdapter::parse(&format!("http://{target_address}"), "Lenso Agent").unwrap();
        let console_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let console_address = console_listener.local_addr().unwrap();
        let console = agent_catalog_routes(AgentCatalog::new(app_agent.into_iter().collect()));
        let console_task = tokio::spawn(async move {
            axum::serve(console_listener, console).await.unwrap();
        });

        let response = reqwest::get(format!(
            "http://{console_address}/api/console/v1/agents/app/bootstrap"
        ))
        .await
        .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.json::<serde_json::Value>().await.unwrap()["profile"],
            "coding"
        );

        console_task.abort();
        target_task.abort();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn app_agent_configuration_requires_capability_and_preserves_validators() {
        let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_address = target_listener.local_addr().unwrap();
        let target = Router::new().route(
            "/api/console/v1/agent/control/plugins",
            get(|headers: HeaderMap| async move {
                assert_eq!(
                    headers.get(header::IF_NONE_MATCH).unwrap(),
                    "\"management-revision\""
                );
                (
                    [(header::ETAG, "\"management-revision\"")],
                    Json(serde_json::json!({ "schema": "management" })),
                )
            }),
        );
        let target_task = tokio::spawn(async move {
            axum::serve(target_listener, target).await.unwrap();
        });

        let origin = format!("http://{target_address}");
        let ordinary = AppAgentAdapter::parse_as("ordinary", &origin, "Ordinary Agent")
            .unwrap()
            .unwrap();
        let mut configurable =
            AppAgentAdapter::parse_as("configurable", &origin, "Configurable Agent")
                .unwrap()
                .unwrap();
        configurable.plugin_configuration = true;
        let console_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let console_address = console_listener.local_addr().unwrap();
        let console = agent_catalog_routes(AgentCatalog::new(vec![ordinary, configurable]));
        let console_task = tokio::spawn(async move {
            axum::serve(console_listener, console).await.unwrap();
        });
        let client = reqwest::Client::new();

        let denied = client
            .get(format!(
                "http://{console_address}/api/console/v1/agents/ordinary/control/plugins"
            ))
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::NOT_FOUND);

        let allowed = client
            .get(format!(
                "http://{console_address}/api/console/v1/agents/configurable/control/plugins"
            ))
            .header(header::IF_NONE_MATCH, "\"management-revision\"")
            .send()
            .await
            .unwrap();
        assert_eq!(allowed.status(), StatusCode::OK);
        assert_eq!(
            allowed.headers().get(header::ETAG).unwrap(),
            "\"management-revision\""
        );

        console_task.abort();
        target_task.abort();
    }

    #[test]
    fn console_host_persists_only_its_own_agent_configuration() {
        let root = tempfile::tempdir().unwrap();
        let agent_home = root.path().join("agent");
        let config = ConsoleConfig {
            address: "127.0.0.1:3030".parse().unwrap(),
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            managed_app_root: root.path().join("app"),
            allowed_tools: Vec::new(),
            app_agents: Vec::new(),
            agent_configuration_store: root.path().join("agent-configuration.sqlite3"),
            web_root: root.path().join("web"),
        };

        let agent = config.agent_web_config();

        assert!(agent.plugin_control);
        assert!(agent.allowed_tools.is_empty());
        assert!(matches!(agent.access, AgentWebAccess::HostAuthorized));
        assert_eq!(agent.managed_app_root, None);
        assert!(matches!(agent.control, AgentWebControl::HostAuthorized));
        let store = agent
            .plugin_configuration_store
            .expect("Console Host should select a durable configuration authority");
        assert_eq!(
            store.database,
            root.path().join("agent-configuration.sqlite3")
        );
        assert_eq!(store.reference, "console-agent");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn console_product_bootstrap_admits_the_reviewed_plugin_tools() {
        let root = tempfile::tempdir().unwrap();
        let (catalog_url, catalog_server) = start_test_codex_catalog().await;
        let agent_home = root.path().join("console-agent");
        configure_test_codex_catalog(&agent_home, &catalog_url);
        let web_root = root.path().join("console-web");
        std::fs::create_dir_all(&web_root).unwrap();
        std::fs::write(
            web_root.join("index.html"),
            "<!doctype html><title>Console</title>",
        )
        .unwrap();
        let config = ConsoleConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            managed_app_root: root.path().join("app"),
            allowed_tools: default_console_agent_tools(),
            app_agents: Vec::new(),
            agent_configuration_store: root.path().join("agent-configuration.sqlite3"),
            web_root,
        };

        let local = tokio::task::LocalSet::new();
        local
            .run_until(async {
                let server = ConsoleServer::start(config).await.unwrap();
                let address = server.address;
                let (shutdown, shutdown_signal) = tokio::sync::oneshot::channel();
                let server_task = tokio::task::spawn_local(server.run(async move {
                    let _ = shutdown_signal.await;
                }));

                let bootstrap =
                    reqwest::get(format!("http://{address}/api/console/v1/agent/bootstrap"))
                        .await
                        .unwrap()
                        .json::<serde_json::Value>()
                        .await
                        .unwrap();
                let mut expected = default_console_agent_tools();
                expected.sort();
                assert_eq!(
                    bootstrap["tools"]["allowed"],
                    serde_json::json!(expected),
                    "unexpected bootstrap response: {bootstrap:#}"
                );
                let available = bootstrap["tools"]["available"].as_array().unwrap();
                for tool in lenso_agent_console_plugins::PLUGIN_CONTROL_TOOLS {
                    assert!(available.iter().any(|entry| entry["name"] == tool));
                }

                let plugins = reqwest::get(format!(
                    "http://{address}/api/console/v1/agent/plugins"
                ))
                .await
                .unwrap()
                .json::<serde_json::Value>()
                .await
                .unwrap();
                let instruction = plugins["active"]["plugins"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|plugin| {
                        plugin["packageId"] == "lenso.agent.console-instructions"
                    })
                    .expect("Console instruction should be active");
                assert_eq!(
                    instruction["providedCapabilities"],
                    serde_json::json!(["lenso.agent.prompt-provider@1"])
                );

                shutdown.send(()).unwrap();
                server_task.await.unwrap().unwrap();
            })
            .await;
        catalog_server.abort();
    }

    #[test]
    fn resolves_relative_app_roots_against_the_launcher_directory() {
        let current = std::env::current_dir().unwrap();

        let root = resolve_app_root(Some("fixtures/app".into())).unwrap();

        assert_eq!(root, current.join("fixtures/app"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn selected_console_plugin_activates_and_removal_restores_the_non_console_app() {
        let root = tempfile::tempdir().unwrap();
        let (catalog_url, catalog_server) = start_test_codex_catalog().await;
        configure_test_codex_catalog(root.path(), &catalog_url);
        configure_test_codex_catalog(&root.path().join("console-agent"), &catalog_url);
        let web_root = root.path().join("console-web");
        std::fs::create_dir_all(&web_root).unwrap();
        std::fs::write(
            web_root.join("index.html"),
            "<!doctype html><title>Console</title>",
        )
        .unwrap();
        let configuration_store = root.path().join("agent-configuration.sqlite3");
        let plugin_root = root.path().join("plugins/lenso.console.web");
        std::fs::create_dir_all(&plugin_root).unwrap();
        std::fs::write(
            plugin_root.join("console.toml"),
            format!(
                "address = \"127.0.0.1:0\"\nagent_home = {:?}\nagent_configuration_store = {:?}\nallowed_tools = []\nconnected_agent_label = \"Lenso Agent\"\nconnected_agent_url = \"\"\nmanaged_app_root = {:?}\nweb_root = {:?}\n",
                root.path().join("console-agent").display().to_string(),
                configuration_store.display().to_string(),
                root.path().display().to_string(),
                web_root.display().to_string(),
            ),
        )
        .unwrap();

        let local = tokio::task::LocalSet::new();
        local
            .run_until(async {
                let host = AgentHost::builder()
                    .plugins(link)
                    .plugins(lenso_agent_console_plugins::link)
                    .agent_home(root.path())
                    .unwrap()
                    .plugin_configuration_authority(Arc::new(LocalPluginRootAuthority::new(
                        root.path(),
                    )))
                    .surface(WebSurface::browser())
                    .build()
                    .unwrap();
                let mut app = host.run(Profile::Default).await.unwrap();

                assert!(app.resolved_plan().plugin_instances().iter().any(|plugin| {
                    plugin.package_id() == "lenso.console.web"
                        && plugin.instance_key() == "lenso.console.web/console"
                }));
                app.shutdown().await.unwrap();

                assert!(configuration_store.is_file());
                assert!(
                    std::fs::read(&configuration_store)
                        .unwrap()
                        .starts_with(b"SQLite format 3\0")
                );

                let host = AgentHost::builder()
                    .plugins(link)
                    .plugins(lenso_agent_console_plugins::link)
                    .agent_home(root.path())
                    .unwrap()
                    .plugin_configuration_authority(Arc::new(LocalPluginRootAuthority::new(
                        root.path(),
                    )))
                    .surface(WebSurface::browser())
                    .build()
                    .unwrap();
                let mut restarted = host.run(Profile::Default).await.unwrap();
                restarted.shutdown().await.unwrap();

                std::fs::remove_file(plugin_root.join("console.toml")).unwrap();
                let host = AgentHost::builder()
                    .plugins(link)
                    .plugins(lenso_agent_console_plugins::link)
                    .agent_home(root.path())
                    .unwrap()
                    .plugin_configuration_authority(Arc::new(LocalPluginRootAuthority::new(
                        root.path(),
                    )))
                    .surface(WebSurface::browser())
                    .build()
                    .unwrap();
                let mut app = host.run(Profile::Default).await.unwrap();
                assert!(
                    app.resolved_plan()
                        .plugin_instances()
                        .iter()
                        .all(|plugin| plugin.package_id() != "lenso.console.web")
                );
                app.shutdown().await.unwrap();
            })
            .await;
        catalog_server.abort();
    }
}
