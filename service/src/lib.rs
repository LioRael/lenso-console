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
use lenso_agent_web::{AgentWebConfig, AgentWebControl, AgentWebSurface};
use serde::{Deserialize, Serialize};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::{ServeDir, ServeFile};

const DEFAULT_PORT: u16 = 3030;
const MAX_AGENT_REQUEST_BYTES: usize = 64 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsolePluginConfig {
    address: String,
    agent_home: String,
    allowed_tools: Vec<String>,
    connected_agent_label: String,
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
        || config.connected_agent_label.trim().is_empty()
        || config.managed_app_root.is_empty()
        || config.web_root.is_empty()
    {
        return Err(invalid_plan("Console paths must not be empty"));
    }
    ConnectedAgent::parse(&config.connected_agent_url, &config.connected_agent_label)
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
    pub connected_agent: Option<ConnectedAgent>,
    pub tool_policy: PathBuf,
    pub web_root: PathBuf,
}

impl ConsoleConfig {
    /// Connects the Console Shell to one existing loopback Agent Harness.
    pub fn with_connected_agent(mut self, origin: &str, label: &str) -> anyhow::Result<Self> {
        self.connected_agent = ConnectedAgent::parse(origin, label).map_err(anyhow::Error::msg)?;
        Ok(self)
    }

    pub fn from_plugin(config: &ConsolePluginConfig) -> anyhow::Result<Self> {
        let current = std::env::current_dir()?;
        let agent_home = resolve_path(&current, &config.agent_home);
        Ok(Self {
            address: config.address.parse()?,
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            managed_app_root: resolve_path(&current, &config.managed_app_root),
            allowed_tools: config.allowed_tools.clone(),
            connected_agent: ConnectedAgent::parse(
                &config.connected_agent_url,
                &config.connected_agent_label,
            )
            .map_err(anyhow::Error::msg)?,
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
        let allowed_tools = std::env::var("LENSO_CONSOLE_AGENT_TOOLS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .collect();
        let connected_agent_url =
            std::env::var("LENSO_CONSOLE_CONNECTED_AGENT_URL").unwrap_or_default();
        let connected_agent_label = std::env::var("LENSO_CONSOLE_CONNECTED_AGENT_LABEL")
            .unwrap_or_else(|_| "Connected Harness".to_owned());
        let web_root = std::env::var_os("CONSOLE_WEB_ROOT")
            .map_or_else(|| manifest.join("../dist/client"), PathBuf::from);
        Ok(Self {
            address,
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            managed_app_root,
            allowed_tools,
            connected_agent: ConnectedAgent::parse(&connected_agent_url, &connected_agent_label)
                .map_err(anyhow::Error::msg)?,
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
            self.web_root.join("index.html").is_file(),
            "Console Shell build is missing at {}; run `pnpm service:web-build`",
            self.web_root.display()
        );
        Ok(())
    }

    fn agent_web_config(&self) -> AgentWebConfig {
        let mut config = AgentWebConfig::new(lenso_agent_console_plugins::link);
        config.agent_home = Some(self.agent_home.clone());
        config.managed_app_root = Some(self.managed_app_root.clone());
        config.allowed_tools.clone_from(&self.allowed_tools);
        config.tool_policy = Some(self.tool_policy.clone());
        config.control = AgentWebControl::HostAuthorized;
        config.plugin_control = true;
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
        let agent_targets = AgentTargets::new(config.connected_agent);
        let app = Router::new()
            .route("/health/live", get(health))
            .route("/health/ready", get(health))
            .route("/health/startup", get(health))
            .merge(agent.router())
            .merge(agent_target_routes(agent_targets))
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
pub struct ConnectedAgent {
    client: reqwest::Client,
    label: String,
    origin: reqwest::Url,
}

impl ConnectedAgent {
    fn parse(origin: &str, label: &str) -> Result<Option<Self>, String> {
        if origin.trim().is_empty() {
            return Ok(None);
        }
        let origin = reqwest::Url::parse(origin.trim())
            .map_err(|error| format!("connected Agent URL is invalid: {error}"))?;
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
            return Err("connected Agent URL must be a clean loopback HTTP origin".to_owned());
        }
        let label = label.trim();
        if label.is_empty() {
            return Err("connected Agent label must not be empty".to_owned());
        }
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(3))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| format!("connected Agent client is invalid: {error}"))?;
        Ok(Some(Self {
            client,
            label: label.to_owned(),
            origin,
        }))
    }
}

#[derive(Clone, Debug)]
struct AgentTargets {
    connected: Option<ConnectedAgent>,
}

impl AgentTargets {
    const fn new(connected: Option<ConnectedAgent>) -> Self {
        Self { connected }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentTarget {
    id: &'static str,
    kind: &'static str,
    label: String,
}

#[derive(Debug, Serialize)]
struct AgentTargetList {
    targets: Vec<AgentTarget>,
}

fn agent_target_routes(targets: AgentTargets) -> Router {
    Router::new()
        .route("/api/console/v1/agents", get(list_agent_targets))
        .route(
            "/api/console/v1/agents/{target}/{*path}",
            any(proxy_connected_agent),
        )
        .layer(RequestBodyLimitLayer::new(MAX_AGENT_REQUEST_BYTES))
        .with_state(targets)
}

async fn list_agent_targets(State(targets): State<AgentTargets>) -> Json<AgentTargetList> {
    let mut available = vec![AgentTarget {
        id: "console",
        kind: "console",
        label: "Console Agent".to_owned(),
    }];
    if let Some(connected) = targets.connected {
        available.push(AgentTarget {
            id: "connected",
            kind: "connected",
            label: connected.label,
        });
    }
    Json(AgentTargetList { targets: available })
}

async fn proxy_connected_agent(
    State(targets): State<AgentTargets>,
    AxumPath((target, path)): AxumPath<(String, String)>,
    OriginalUri(incoming): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if target != "connected" {
        return problem(StatusCode::NOT_FOUND, "Agent target was not found");
    }
    let Some(connected) = targets.connected else {
        return problem(StatusCode::NOT_FOUND, "Connected Harness is not configured");
    };
    if !allowed_agent_route(&method, &path) {
        return problem(StatusCode::NOT_FOUND, "Connected Agent route was not found");
    }
    let mut target_url = connected.origin;
    target_url.set_path(&format!("/api/console/v1/agent/{path}"));
    target_url.set_query(incoming.query());
    let mut request = connected.client.request(method, target_url).body(body);
    for name in [header::ACCEPT, header::CONTENT_TYPE] {
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
                &format!("Connected Harness is unavailable: {error}"),
            );
        }
    };
    let status = response.status();
    let headers = response.headers().clone();
    let mut proxied = Response::builder()
        .status(status)
        .header(header::CACHE_CONTROL, "no-store");
    for name in [header::CONTENT_TYPE] {
        if let Some(value) = headers.get(&name) {
            proxied = proxied.header(name, value);
        }
    }
    if let Some(value) = headers.get("last-event-id") {
        proxied = proxied.header("last-event-id", value);
    }
    proxied
        .body(Body::from_stream(response.bytes_stream()))
        .unwrap_or_else(|_| problem(StatusCode::BAD_GATEWAY, "Connected Harness response failed"))
}

fn allowed_agent_route(method: &Method, path: &str) -> bool {
    let parts = path.split('/').collect::<Vec<_>>();
    match (method, parts.as_slice()) {
        (&Method::GET, ["bootstrap" | "models" | "sessions" | "tasks"])
        | (&Method::POST, ["turns"]) => true,
        (&Method::GET | &Method::PATCH, ["sessions", session_id]) => {
            valid_agent_identity(session_id)
        }
        (
            &Method::GET,
            ["sessions", session_id, "trajectory"] | ["turns", session_id, "interactions"],
        )
        | (&Method::POST, ["turns", session_id, "cancel"]) => valid_agent_identity(session_id),
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
        _ => false,
    }
}

fn valid_agent_identity(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn problem(status: StatusCode, detail: &str) -> Response {
    (
        status,
        Json(serde_json::json!({
            "detail": detail,
            "status": status.as_u16(),
            "title": status.canonical_reason().unwrap_or("Agent target error"),
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

    #[test]
    fn plugin_descriptor_is_an_endpoint_free_lifecycle_root() {
        let descriptor: serde_json::Value = serde_json::from_str(PLUGIN_DESCRIPTOR_JSON).unwrap();

        assert_eq!(descriptor["plugin_id"], "lenso.console.web");
        assert_eq!(descriptor["root_slot"], "console");
        assert_eq!(descriptor["provided_capabilities"], serde_json::json!([]));
        assert_eq!(descriptor["required_capabilities"], serde_json::json!([]));
    }

    #[test]
    fn rejects_non_loopback_hosts() {
        assert!(parse_loopback_host("127.0.0.1").is_ok());
        assert!(parse_loopback_host("::1").is_ok());
        assert!(parse_loopback_host("0.0.0.0").is_err());
    }

    #[test]
    fn connected_agent_accepts_only_clean_loopback_origins() {
        assert!(
            ConnectedAgent::parse("http://127.0.0.1:8787", "Current Harness")
                .unwrap()
                .is_some()
        );
        assert!(
            ConnectedAgent::parse("", "Current Harness")
                .unwrap()
                .is_none()
        );
        assert!(ConnectedAgent::parse("https://127.0.0.1:8787", "Current Harness").is_err());
        assert!(ConnectedAgent::parse("http://example.com", "Current Harness").is_err());
        assert!(ConnectedAgent::parse("http://127.0.0.1:8787/path", "Current Harness").is_err());
    }

    #[test]
    fn connected_agent_proxy_exposes_only_the_agent_data_plane() {
        assert!(allowed_agent_route(&Method::GET, "bootstrap"));
        assert!(allowed_agent_route(&Method::POST, "turns"));
        assert!(allowed_agent_route(
            &Method::GET,
            "sessions/session-1/trajectory"
        ));
        assert!(!allowed_agent_route(&Method::GET, "control/tool-policy"));
        assert!(!allowed_agent_route(&Method::DELETE, "sessions/session-1"));
        assert!(!allowed_agent_route(&Method::GET, "sessions/../trajectory"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn connected_agent_proxy_preserves_the_target_bootstrap() {
        let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_address = target_listener.local_addr().unwrap();
        let target = Router::new().route(
            "/api/console/v1/agent/bootstrap",
            get(|| async { Json(serde_json::json!({ "profile": "coding" })) }),
        );
        let target_task = tokio::spawn(async move {
            axum::serve(target_listener, target).await.unwrap();
        });

        let connected =
            ConnectedAgent::parse(&format!("http://{target_address}"), "Current Harness").unwrap();
        let console_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let console_address = console_listener.local_addr().unwrap();
        let console = agent_target_routes(AgentTargets::new(connected));
        let console_task = tokio::spawn(async move {
            axum::serve(console_listener, console).await.unwrap();
        });

        let response = reqwest::get(format!(
            "http://{console_address}/api/console/v1/agents/connected/bootstrap"
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

    #[test]
    fn console_host_authorizes_the_managed_app_plugin_root() {
        let root = tempfile::tempdir().unwrap();
        let agent_home = root.path().join("agent");
        let config = ConsoleConfig {
            address: "127.0.0.1:3030".parse().unwrap(),
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            managed_app_root: root.path().join("app"),
            allowed_tools: Vec::new(),
            connected_agent: None,
            web_root: root.path().join("web"),
        };

        let agent = config.agent_web_config();

        assert!(agent.plugin_control);
        assert_eq!(agent.managed_app_root, Some(root.path().join("app")));
        assert!(matches!(agent.control, AgentWebControl::HostAuthorized));
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
        let web_root = root.path().join("console-web");
        std::fs::create_dir_all(&web_root).unwrap();
        std::fs::write(
            web_root.join("index.html"),
            "<!doctype html><title>Console</title>",
        )
        .unwrap();
        let plugin_root = root.path().join("plugins/lenso.console.web");
        std::fs::create_dir_all(&plugin_root).unwrap();
        std::fs::write(
            plugin_root.join("console.toml"),
            format!(
                "address = \"127.0.0.1:0\"\nagent_home = {:?}\nallowed_tools = []\nconnected_agent_label = \"Connected Harness\"\nconnected_agent_url = \"\"\nmanaged_app_root = {:?}\nweb_root = {:?}\n",
                root.path().join("console-agent").display().to_string(),
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
                    .surface(WebSurface::browser())
                    .build()
                    .unwrap();
                let mut app = host.run(Profile::Default).await.unwrap();

                assert!(app.resolved_plan().plugin_instances().iter().any(|plugin| {
                    plugin.package_id() == "lenso.console.web"
                        && plugin.instance_key() == "lenso.console.web/console"
                }));
                app.shutdown().await.unwrap();

                std::fs::remove_file(plugin_root.join("console.toml")).unwrap();
                let host = AgentHost::builder()
                    .plugins(link)
                    .plugins(lenso_agent_console_plugins::link)
                    .agent_home(root.path())
                    .unwrap()
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
    }
}
