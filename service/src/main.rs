use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
};

use axum::{
    Json, Router,
    http::StatusCode,
    routing::{any, get},
};
use directories::BaseDirs;
use lenso_agent_web::{AgentWebConfig, AgentWebControl, AgentWebSurface};
use serde::Serialize;
use tower_http::services::{ServeDir, ServeFile};

const DEFAULT_PORT: u16 = 3030;

#[derive(Clone, Debug)]
struct ConsoleConfig {
    address: SocketAddr,
    agent_home: PathBuf,
    allowed_tools: Vec<String>,
    tool_policy: PathBuf,
    web_root: PathBuf,
}

impl ConsoleConfig {
    fn load() -> anyhow::Result<Self> {
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
            allowed_tools,
            web_root,
        })
    }

    fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            self.address.ip().is_loopback(),
            "the local Console Agent Host may bind only to a loopback address"
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

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let local = tokio::task::LocalSet::new();
    local.run_until(run(ConsoleConfig::load()?)).await
}

async fn run(config: ConsoleConfig) -> anyhow::Result<()> {
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
    let listener = tokio::net::TcpListener::bind(config.address).await?;
    println!("Lenso Console listening on http://{}", config.address);
    let result = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await;
    let shutdown = agent.shutdown().await.map_err(anyhow::Error::msg);
    result?;
    shutdown
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

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_loopback_hosts() {
        assert!(parse_loopback_host("127.0.0.1").is_ok());
        assert!(parse_loopback_host("::1").is_ok());
        assert!(parse_loopback_host("0.0.0.0").is_err());
    }

    #[test]
    fn console_host_authorizes_plugin_root_control() {
        let root = tempfile::tempdir().unwrap();
        let agent_home = root.path().join("agent");
        let config = ConsoleConfig {
            address: "127.0.0.1:3030".parse().unwrap(),
            tool_policy: agent_home.join("tool-policy.json"),
            agent_home,
            allowed_tools: Vec::new(),
            web_root: root.path().join("web"),
        };

        let agent = config.agent_web_config();

        assert!(agent.plugin_control);
        assert!(matches!(agent.control, AgentWebControl::HostAuthorized));
    }
}
