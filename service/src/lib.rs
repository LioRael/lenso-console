use std::{
    future::Future,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
};

use axum::{
    Json, Router,
    http::StatusCode,
    routing::{any, get},
};
use directories::BaseDirs;
use lenso::prelude::*;
use lenso_agent_web::{AgentWebConfig, AgentWebControl, AgentWebSurface};
use serde::{Deserialize, Serialize};
use tower_http::services::{ServeDir, ServeFile};

const DEFAULT_PORT: u16 = 3030;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsolePluginConfig {
    address: String,
    agent_home: String,
    allowed_tools: Vec<String>,
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
        || config.managed_app_root.is_empty()
        || config.web_root.is_empty()
    {
        return Err(invalid_plan("Console paths must not be empty"));
    }
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
    pub tool_policy: PathBuf,
    pub web_root: PathBuf,
}

impl ConsoleConfig {
    pub fn from_plugin(config: &ConsolePluginConfig) -> anyhow::Result<Self> {
        let current = std::env::current_dir()?;
        let agent_home = resolve_path(&current, &config.agent_home);
        Ok(Self {
            address: config.address.parse()?,
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            managed_app_root: resolve_path(&current, &config.managed_app_root),
            allowed_tools: config.allowed_tools.clone(),
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
        let web_root = std::env::var_os("CONSOLE_WEB_ROOT")
            .map_or_else(|| manifest.join("../dist/client"), PathBuf::from);
        Ok(Self {
            address,
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            managed_app_root,
            allowed_tools,
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
        let app = Router::new()
            .route("/health/live", get(health))
            .route("/health/ready", get(health))
            .route("/health/startup", get(health))
            .merge(agent.router())
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
    fn console_host_authorizes_the_managed_app_plugin_root() {
        let root = tempfile::tempdir().unwrap();
        let agent_home = root.path().join("agent");
        let config = ConsoleConfig {
            address: "127.0.0.1:3030".parse().unwrap(),
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            managed_app_root: root.path().join("app"),
            allowed_tools: Vec::new(),
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
                "address = \"127.0.0.1:0\"\nagent_home = {:?}\nallowed_tools = []\nmanaged_app_root = {:?}\nweb_root = {:?}\n",
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
