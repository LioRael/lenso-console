use std::{
    collections::BTreeMap,
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
use serde::{Deserialize, Serialize};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::{ServeDir, ServeFile};

const DEFAULT_PORT: u16 = 3030;
const DEFAULT_CONSOLE_AGENT_URL: &str = "http://127.0.0.1:8788";
const MAX_AGENT_REQUEST_BYTES: usize = 64 * 1024;
pub const AGENT_PLUGIN_CONFIGURATION_CAPABILITY: &str = "lenso.agent.plugin-configuration@1";
pub const AGENT_PLUGIN_LIFECYCLE_CAPABILITY: &str = "lenso.agent.plugin-package-management@1";

fn default_console_agent_tools() -> Vec<String> {
    [
        "inspect_app",
        "list_plugins",
        "inspect_plugin",
        "check_plugin_change",
        "apply_plugin_change",
        "list_plugin_changes",
        "check_plugin_rollback",
        "apply_plugin_rollback",
        "set_plugin_enabled",
        "list_available_plugins",
        "check_plugin_install",
        "apply_plugin_install",
        "check_plugin_removal",
        "apply_plugin_removal",
    ]
    .iter()
    .map(|tool| (*tool).to_owned())
    .collect()
}

#[derive(Clone, Debug)]
pub struct TrustedPluginBundle {
    pub id: String,
    pub path: PathBuf,
}

impl TrustedPluginBundle {
    fn new(id: impl Into<String>, path: impl Into<PathBuf>) -> Result<Self, String> {
        let id = id.into();
        let path = path.into();
        if id.is_empty()
            || id.len() > 128
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
            || !path.is_absolute()
        {
            return Err("trusted Plugin Bundle entry is invalid".to_owned());
        }
        Ok(Self { id, path })
    }
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
    console_agent_url: String,
    connected_agent_label: String,
    connected_agent_plugin_configuration: bool,
    connected_agent_plugin_lifecycle: bool,
    connected_agent_url: String,
    managed_app_root: String,
    trusted_plugin_bundles: BTreeMap<String, String>,
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
    AppAgentAdapter::parse_console(&config.console_agent_url, None)
        .map_err(|error| invalid_plan(error.to_string()))?;
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
    console_agent: AppAgentAdapter,
    pub agent_configuration_store: PathBuf,
    pub tool_policy: PathBuf,
    pub trusted_plugin_bundles: Vec<TrustedPluginBundle>,
    pub web_root: PathBuf,
}

impl ConsoleConfig {
    /// Selects the separately released Console Agent process and its Host-only control token.
    pub fn with_console_agent(
        mut self,
        origin: &str,
        control_token: Option<String>,
    ) -> anyhow::Result<Self> {
        self.console_agent = AppAgentAdapter::parse_console(origin, control_token)?;
        Ok(self)
    }

    /// Contributes one App Agent through an existing loopback Agent Web Adapter.
    pub fn with_app_agent(self, origin: &str, label: &str) -> anyhow::Result<Self> {
        self.with_app_agent_identity("app", origin, label)
    }

    /// Contributes one independently addressed App Agent identity.
    pub fn with_app_agent_identity(
        self,
        id: &str,
        origin: &str,
        label: &str,
    ) -> anyhow::Result<Self> {
        self.with_app_agent_identity_capabilities(id, origin, label, false, false)
    }

    /// Contributes one App Agent whose Host explicitly provides Plugin configuration control.
    pub fn with_app_agent_configuration(self, origin: &str, label: &str) -> anyhow::Result<Self> {
        self.with_app_agent_identity_configuration("app", origin, label)
    }

    /// Contributes one independently addressed App Agent with Plugin configuration control.
    pub fn with_app_agent_identity_configuration(
        self,
        id: &str,
        origin: &str,
        label: &str,
    ) -> anyhow::Result<Self> {
        self.with_app_agent_identity_capabilities(id, origin, label, true, false)
    }

    /// Contributes one App Agent whose Host explicitly provides trusted package lifecycle control.
    pub fn with_app_agent_plugin_lifecycle(
        self,
        origin: &str,
        label: &str,
    ) -> anyhow::Result<Self> {
        self.with_app_agent_identity_plugin_lifecycle("app", origin, label)
    }

    /// Contributes one independently addressed App Agent with trusted package lifecycle control.
    pub fn with_app_agent_identity_plugin_lifecycle(
        self,
        id: &str,
        origin: &str,
        label: &str,
    ) -> anyhow::Result<Self> {
        self.with_app_agent_identity_capabilities(id, origin, label, false, true)
    }

    /// Contributes one App Agent with both independent Plugin control capabilities.
    pub fn with_app_agent_management(self, origin: &str, label: &str) -> anyhow::Result<Self> {
        self.with_app_agent_identity_management("app", origin, label)
    }

    /// Contributes one managed App Agent while keeping its control token in the Host proxy.
    pub fn with_app_agent_management_token(
        mut self,
        origin: &str,
        label: &str,
        control_token: &str,
    ) -> anyhow::Result<Self> {
        self = self.with_app_agent_management(origin, label)?;
        if let Some(agent) = self.app_agents.iter_mut().find(|agent| agent.id == "app") {
            agent.authorization = Some(format!("Bearer {control_token}"));
        }
        Ok(self)
    }

    /// Contributes one independently addressed App Agent with both Plugin control capabilities.
    pub fn with_app_agent_identity_management(
        self,
        id: &str,
        origin: &str,
        label: &str,
    ) -> anyhow::Result<Self> {
        self.with_app_agent_identity_capabilities(id, origin, label, true, true)
    }

    /// Allows authentication management for an already registered App Agent.
    /// The target Host must independently authorize management requests.
    pub fn with_app_agent_auth_connections(mut self, id: &str) -> anyhow::Result<Self> {
        let agent = self
            .app_agents
            .iter_mut()
            .find(|agent| agent.id == id)
            .ok_or_else(|| anyhow::anyhow!("App Agent identity was not found"))?;
        agent.auth_connections = true;
        Ok(self)
    }

    fn with_app_agent_identity_capabilities(
        mut self,
        id: &str,
        origin: &str,
        label: &str,
        plugin_configuration: bool,
        plugin_lifecycle: bool,
    ) -> anyhow::Result<Self> {
        let Some(mut app_agent) =
            AppAgentAdapter::parse_as(id, origin, label).map_err(anyhow::Error::msg)?
        else {
            return Ok(self);
        };
        app_agent.plugin_configuration = plugin_configuration;
        app_agent.plugin_lifecycle = plugin_lifecycle;
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
        if config.connected_agent_plugin_lifecycle {
            for agent in &mut app_agents {
                agent.plugin_lifecycle = true;
            }
        }
        Ok(Self {
            address: config.address.parse()?,
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            agent_configuration_store: resolve_path(&current, &config.agent_configuration_store),
            managed_app_root: resolve_path(&current, &config.managed_app_root),
            trusted_plugin_bundles: trusted_plugin_bundles(
                config
                    .trusted_plugin_bundles
                    .iter()
                    .map(|(id, path)| (id.clone(), resolve_path(&current, path))),
            )?,
            allowed_tools: config.allowed_tools.clone(),
            console_agent: AppAgentAdapter::parse_console(
                &config.console_agent_url,
                console_agent_control_token(),
            )?,
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
        let console_agent_url = std::env::var("LENSO_CONSOLE_AGENT_URL")
            .unwrap_or_else(|_| DEFAULT_CONSOLE_AGENT_URL.to_owned());
        let connected_agent_label = std::env::var("LENSO_CONSOLE_CONNECTED_AGENT_LABEL")
            .unwrap_or_else(|_| "Lenso Agent".to_owned());
        let connected_agent_plugin_configuration =
            parse_boolean_environment("LENSO_CONSOLE_CONNECTED_AGENT_PLUGIN_CONFIGURATION")?;
        let connected_agent_plugin_lifecycle =
            parse_boolean_environment("LENSO_CONSOLE_CONNECTED_AGENT_PLUGIN_LIFECYCLE")?;
        let trusted_plugin_bundles = match std::env::var("LENSO_CONSOLE_TRUSTED_PLUGIN_BUNDLES") {
            Ok(value) => trusted_plugin_bundles(
                serde_json::from_str::<BTreeMap<String, PathBuf>>(&value).map_err(|error| {
                    anyhow::anyhow!(
                        "LENSO_CONSOLE_TRUSTED_PLUGIN_BUNDLES must be a JSON object: {error}"
                    )
                })?,
            )?,
            Err(std::env::VarError::NotPresent) => Vec::new(),
            Err(error) => return Err(error.into()),
        };
        let web_root = std::env::var_os("CONSOLE_WEB_ROOT")
            .map_or_else(|| manifest.join("../dist/client"), PathBuf::from);
        Ok(Self {
            address,
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            agent_configuration_store: console_home.join("agent-configuration.sqlite3"),
            managed_app_root,
            trusted_plugin_bundles,
            allowed_tools,
            console_agent: AppAgentAdapter::parse_console(
                &console_agent_url,
                console_agent_control_token(),
            )?,
            app_agents: AppAgentAdapter::parse(&connected_agent_url, &connected_agent_label)
                .map_err(anyhow::Error::msg)?
                .into_iter()
                .map(|mut agent| {
                    agent.plugin_configuration = connected_agent_plugin_configuration;
                    agent.plugin_lifecycle = connected_agent_plugin_lifecycle;
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
}

fn console_agent_control_token() -> Option<String> {
    std::env::var("LENSO_CONSOLE_AGENT_CONTROL_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
}

fn trusted_plugin_bundles(
    entries: impl IntoIterator<Item = (String, PathBuf)>,
) -> anyhow::Result<Vec<TrustedPluginBundle>> {
    entries
        .into_iter()
        .map(|(id, path)| TrustedPluginBundle::new(id, path).map_err(anyhow::Error::msg))
        .collect()
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
    app: Router,
    listener: tokio::net::TcpListener,
}

impl ConsoleServer {
    async fn start(config: ConsoleConfig) -> anyhow::Result<Self> {
        config.validate()?;
        config.console_agent.require_ready().await?;
        let index = config.web_root.join("index.html");
        let shell = ServeDir::new(config.web_root).fallback(ServeFile::new(index));
        let agent_catalog = AgentCatalog::new(config.console_agent, config.app_agents);
        let app = Router::new()
            .route("/health/live", get(health))
            .route("/health/ready", get(health))
            .route("/health/startup", get(health))
            .merge(agent_catalog_routes(agent_catalog))
            .route("/api/{*path}", any(api_not_found))
            .fallback_service(shell);
        let listener = tokio::net::TcpListener::bind(config.address).await?;
        let address = listener.local_addr()?;
        Ok(Self {
            address,
            app,
            listener,
        })
    }

    async fn run(self, shutdown: impl Future<Output = ()> + Send + 'static) -> anyhow::Result<()> {
        println!("Lenso Console listening on http://{}", self.address);
        axum::serve(self.listener, self.app)
            .with_graceful_shutdown(shutdown)
            .await?;
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct AppAgentAdapter {
    auth_connections: bool,
    client: reqwest::Client,
    authorization: Option<String>,
    id: String,
    label: String,
    origin: reqwest::Url,
    plugin_configuration: bool,
    plugin_lifecycle: bool,
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
            auth_connections: false,
            client,
            authorization: None,
            id: id.to_owned(),
            label: label.to_owned(),
            origin,
            plugin_configuration: false,
            plugin_lifecycle: false,
        }))
    }

    fn parse_console(origin: &str, token: Option<String>) -> anyhow::Result<Self> {
        let mut agent = Self::parse_as("console-proxy", origin, "Console Agent")
            .map_err(anyhow::Error::msg)?
            .ok_or_else(|| anyhow::anyhow!("Console Agent URL must not be empty"))?;
        "console".clone_into(&mut agent.id);
        agent.authorization = token.map(|value| format!("Bearer {value}"));
        agent.plugin_configuration = true;
        agent.plugin_lifecycle = true;
        agent.auth_connections = true;
        Ok(agent)
    }

    async fn require_ready(&self) -> anyhow::Result<()> {
        let mut url = self.origin.clone();
        url.set_path("/api/console/v1/agent/bootstrap");
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|error| anyhow::anyhow!("Console Agent is unavailable: {error}"))?;
        anyhow::ensure!(
            response.status().is_success(),
            "Console Agent readiness failed with HTTP {}",
            response.status()
        );
        Ok(())
    }
}

#[derive(Clone, Debug)]
struct AgentCatalog {
    console_agent: AppAgentAdapter,
    app_agents: Vec<AppAgentAdapter>,
}

impl AgentCatalog {
    fn new(console_agent: AppAgentAdapter, app_agents: Vec<AppAgentAdapter>) -> Self {
        Self {
            console_agent,
            app_agents,
        }
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
        .route("/api/console/v1/agent/{*path}", any(route_console_agent))
        .route(
            "/api/console/v1/agents/{agent_id}/{*path}",
            any(route_app_agent),
        )
        .layer(RequestBodyLimitLayer::new(MAX_AGENT_REQUEST_BYTES))
        .with_state(catalog)
}

async fn route_console_agent(
    State(catalog): State<AgentCatalog>,
    AxumPath(path): AxumPath<String>,
    OriginalUri(incoming): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    proxy_agent_request(catalog.console_agent, path, incoming, method, headers, body).await
}

async fn list_agents(State(catalog): State<AgentCatalog>) -> Json<AgentIdentityList> {
    let mut agents = vec![AgentIdentity {
        capabilities: vec![
            "lenso.agent.auth-connection@1",
            AGENT_PLUGIN_CONFIGURATION_CAPABILITY,
            AGENT_PLUGIN_LIFECYCLE_CAPABILITY,
        ],
        id: "console".to_owned(),
        role: "console",
        label: "Console Agent".to_owned(),
    }];
    for app_agent in catalog.app_agents {
        agents.push(AgentIdentity {
            capabilities: [
                app_agent
                    .auth_connections
                    .then_some("lenso.agent.auth-connection@1"),
                app_agent
                    .plugin_configuration
                    .then_some(AGENT_PLUGIN_CONFIGURATION_CAPABILITY),
                app_agent
                    .plugin_lifecycle
                    .then_some(AGENT_PLUGIN_LIFECYCLE_CAPABILITY),
            ]
            .into_iter()
            .flatten()
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
    if !(allowed_agent_route_with_capabilities(
        &method,
        &path,
        app_agent.plugin_configuration,
        app_agent.plugin_lifecycle,
    ) || (app_agent.auth_connections
        && matches!(
            (&method, path.as_str()),
            (&Method::GET, "auth/connections") | (&Method::POST, "auth/connections/actions")
        )))
    {
        return problem(StatusCode::NOT_FOUND, "App Agent route was not found");
    }
    proxy_agent_request(app_agent, path, incoming, method, headers, body).await
}

async fn proxy_agent_request(
    app_agent: AppAgentAdapter,
    path: String,
    incoming: axum::http::Uri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
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
    if let Some(value) = app_agent.authorization {
        request = request.header(header::AUTHORIZATION, value);
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

fn allowed_agent_route_with_capabilities(
    method: &Method,
    path: &str,
    plugin_configuration: bool,
    plugin_lifecycle: bool,
) -> bool {
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
        _ if plugin_configuration
            && allowed_plugin_configuration_route(method, parts.as_slice()) =>
        {
            true
        }
        _ => plugin_lifecycle && allowed_plugin_lifecycle_route(method, parts.as_slice()),
    }
}

#[cfg(test)]
fn allowed_agent_route(method: &Method, path: &str, plugin_configuration: bool) -> bool {
    allowed_agent_route_with_capabilities(method, path, plugin_configuration, false)
}

fn allowed_plugin_lifecycle_route(method: &Method, parts: &[&str]) -> bool {
    matches!(
        (method, parts),
        (&Method::GET, ["control", "plugins", "trusted-catalog"])
            | (
                &Method::POST,
                [
                    "control",
                    "plugin-installations" | "plugin-removals",
                    "proposals" | "publications"
                ]
            )
    )
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
                "configuration" | "enabled",
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

    fn console_agent() -> AppAgentAdapter {
        AppAgentAdapter::parse_console("http://127.0.0.1:8788", Some("host-secret".to_owned()))
            .unwrap()
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
        let defaults: ConsolePluginConfig =
            serde_json::from_str(include_str!("../config.defaults.json")).unwrap();

        assert_eq!(defaults.allowed_tools, default_console_agent_tools());
        assert_eq!(
            configured_console_agent_tools(None),
            default_console_agent_tools()
        );
        assert!(configured_console_agent_tools(Some("")).is_empty());
        assert_eq!(
            configured_console_agent_tools(Some(" inspect_app, check_plugin_change ")),
            ["inspect_app", "check_plugin_change"]
        );
        assert_eq!(defaults.console_agent_url, DEFAULT_CONSOLE_AGENT_URL);
    }

    #[test]
    fn rejects_non_loopback_hosts_and_agent_origins() {
        assert!(parse_loopback_host("127.0.0.1").is_ok());
        assert!(parse_loopback_host("::1").is_ok());
        assert!(parse_loopback_host("0.0.0.0").is_err());
        assert!(
            AppAgentAdapter::parse("http://127.0.0.1:8787", "Lenso Agent")
                .unwrap()
                .is_some()
        );
        assert!(AppAgentAdapter::parse("", "Lenso Agent").unwrap().is_none());
        assert!(AppAgentAdapter::parse("https://127.0.0.1:8787", "Lenso Agent").is_err());
        assert!(AppAgentAdapter::parse("http://example.com", "Lenso Agent").is_err());
        assert!(AppAgentAdapter::parse_console("", None).is_err());
    }

    #[tokio::test]
    async fn catalog_preserves_complete_agent_identities_and_capabilities() {
        let mut app_agent = AppAgentAdapter::parse("http://127.0.0.1:8787", "App Agent")
            .unwrap()
            .unwrap();
        app_agent.plugin_configuration = true;
        let Json(catalog) =
            list_agents(State(AgentCatalog::new(console_agent(), vec![app_agent]))).await;

        assert_eq!(catalog.agents.len(), 2);
        assert_eq!(catalog.agents[0].id, "console");
        assert_eq!(catalog.agents[0].role, "console");
        assert_eq!(
            catalog.agents[0].capabilities,
            [
                "lenso.agent.auth-connection@1",
                AGENT_PLUGIN_CONFIGURATION_CAPABILITY,
                AGENT_PLUGIN_LIFECYCLE_CAPABILITY,
            ]
        );
        assert_eq!(catalog.agents[1].id, "app");
        assert_eq!(catalog.agents[1].role, "app");
        assert_eq!(
            catalog.agents[1].capabilities,
            [AGENT_PLUGIN_CONFIGURATION_CAPABILITY]
        );
    }

    #[test]
    fn app_agent_proxy_exposes_only_the_declared_data_plane() {
        for (method, route) in [
            (Method::GET, "bootstrap"),
            (Method::GET, "sessions"),
            (Method::POST, "turns"),
            (Method::GET, "sessions/session-1/trajectory"),
        ] {
            assert!(
                allowed_agent_route(&method, route, false),
                "{method} {route}"
            );
        }
        assert!(!allowed_agent_route(&Method::GET, "control/plugins", false));
        assert!(allowed_agent_route(&Method::GET, "control/plugins", true));
        assert!(!allowed_agent_route(
            &Method::GET,
            "../control/plugins",
            true
        ));
    }

    #[tokio::test]
    async fn console_agent_proxy_keeps_control_authorization_host_side() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let target = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route(
                    "/api/console/v1/agent/bootstrap",
                    get(|headers: HeaderMap| async move {
                        Json(serde_json::json!({
                            "authorization": headers
                                .get(header::AUTHORIZATION)
                                .and_then(|value| value.to_str().ok())
                        }))
                    }),
                ),
            )
            .await
            .unwrap();
        });

        let console = AppAgentAdapter::parse_console(
            &format!("http://{address}"),
            Some("host-secret".to_owned()),
        )
        .unwrap();
        let router = agent_catalog_routes(AgentCatalog::new(console, Vec::new()));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });

        let body = reqwest::get(format!("http://{address}/api/console/v1/agent/bootstrap"))
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap();
        assert_eq!(body["authorization"], "Bearer host-secret");

        server.abort();
        target.abort();
    }

    #[test]
    fn resolves_relative_app_roots_against_the_launcher_directory() {
        let current = std::env::current_dir().unwrap();
        let root = resolve_app_root(Some("fixtures/app".into())).unwrap();
        assert_eq!(root, current.join("fixtures/app"));
    }
}
