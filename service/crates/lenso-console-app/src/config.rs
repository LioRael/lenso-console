//! Configuration of the reference App distribution, separate from Shell behavior.
use lenso_console_plugin::{ConsoleConfig, ConsolePluginConfig};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct ConsoleAppConfig {
    pub shell: ConsoleConfig,
    pub app_root: PathBuf,
    pub address: SocketAddr,
    pub telemetry_address: SocketAddr,
    pub projects_workspace_origin: Option<String>,
}

impl ConsoleAppConfig {
    #[must_use]
    pub fn new(shell: ConsoleConfig) -> Self {
        let app_root = shell
            .agent_home
            .parent()
            .unwrap_or(&shell.agent_home)
            .to_path_buf();
        Self {
            shell,
            app_root,
            address: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 3030),
            telemetry_address: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 4318),
            projects_workspace_origin: None,
        }
    }

    pub fn from_plugin(config: &ConsolePluginConfig) -> anyhow::Result<Self> {
        Ok(Self::new(ConsoleConfig::from_plugin(config)?))
    }

    pub fn load() -> anyhow::Result<Self> {
        let mut config = Self::new(ConsoleConfig::load()?);
        let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "127.0.0.1".into());
        let host = parse_loopback_host(&host)?;
        config.address = SocketAddr::new(
            host,
            std::env::var("HTTP_PORT")
                .ok()
                .map_or(Ok(3030), |value| value.parse())?,
        );
        config.projects_workspace_origin = std::env::var("LENSO_CONSOLE_PROJECTS_ORIGIN").ok();
        Ok(config)
    }

    pub fn validate(&self) -> anyhow::Result<()> {
        self.shell.validate()?;
        anyhow::ensure!(
            self.address.ip().is_loopback() && self.telemetry_address.ip().is_loopback(),
            "the local Console Host may bind only to loopback addresses"
        );
        anyhow::ensure!(
            self.app_root.is_absolute() && self.app_root.parent().is_some(),
            "Console App root must be an absolute non-root path"
        );
        Ok(())
    }

    pub(super) fn observe_source(&self) -> anyhow::Result<Option<(String, String)>> {
        let shell = self.shell.to_plugin_config()?;
        if !shell.connected_agent_url.is_empty() {
            // The reference distribution admits at most one App Agent.
            return Ok(self
                .shell
                .app_agents
                .first()
                .map(|agent| (agent.id().to_owned(), shell.connected_agent_label)));
        }
        Ok(shell
            .managed_apps
            .into_iter()
            .find(|app| !app.console_extensions)
            .map(|app| (app.id, app.label)))
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_non_loopback_listeners() {
        assert!(parse_loopback_host("127.0.0.1").is_ok());
        assert!(parse_loopback_host("localhost").is_ok());
        assert!(parse_loopback_host("::1").is_ok());
        assert!(parse_loopback_host("0.0.0.0").is_err());
    }
}
