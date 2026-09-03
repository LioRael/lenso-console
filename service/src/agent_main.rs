use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    process::ExitCode,
};

use directories::BaseDirs;
use lenso_agent_web::{
    AgentWebAccess, AgentWebConfig, AgentWebControl, AgentWebSurface,
    PluginConfigurationStoreConfig, RemotePluginConfigurationConfig,
    RemotePluginConfigurationResource, TrustedPluginBundle,
};
use lenso_console_plugin::{ConsoleConfig, serve};

const DEFAULT_AGENT_ADDRESS: &str = "127.0.0.1:8787";
const AUTHORITY_ENV: &str = "LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY";
const STORE_ENV: &str = "LENSO_AGENT_PLUGIN_CONFIGURATION_STORE";
const REMOTE_URL_ENV: &str = "LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_URL";
const REMOTE_APP_ENV: &str = "LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_APP";
const REMOTE_ENVIRONMENT_ENV: &str = "LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_ENVIRONMENT";
const REMOTE_TOKEN_ENV: &str = "LENSO_PLUGIN_CONFIGURATION_REMOTE_TOKEN";
const TRUSTED_BUNDLES_ENV: &str = "LENSO_AGENT_TRUSTED_PLUGIN_BUNDLES";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AgentConfigurationAuthorityKind {
    Local,
    Remote,
    Sqlite,
}

#[derive(Default)]
struct AgentAuthorityEnvironment {
    selection: Option<String>,
    store: Option<PathBuf>,
    remote_url: Option<String>,
    remote_app: Option<String>,
    remote_environment: Option<String>,
    remote_token: Option<String>,
}

impl AgentAuthorityEnvironment {
    fn load() -> Self {
        Self {
            selection: std::env::var(AUTHORITY_ENV).ok(),
            store: std::env::var_os(STORE_ENV).map(PathBuf::from),
            remote_url: std::env::var(REMOTE_URL_ENV).ok(),
            remote_app: std::env::var(REMOTE_APP_ENV).ok(),
            remote_environment: std::env::var(REMOTE_ENVIRONMENT_ENV).ok(),
            remote_token: std::env::var(REMOTE_TOKEN_ENV).ok(),
        }
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let local = tokio::task::LocalSet::new();
    match local.run_until(run()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> anyhow::Result<()> {
    lenso_console_plugin::link();
    let agent_address = agent_address()?;
    let agent_listener = tokio::net::TcpListener::bind(agent_address).await?;
    let agent_address = agent_listener.local_addr()?;
    let agent_home = agent_home()?;
    let console = ConsoleConfig::load()?
        .with_app_agent_management(&format!("http://{agent_address}"), "Lenso Agent")?;
    let mut agent_config = AgentWebConfig::new(lenso_agent_default_plugins::link);
    agent_config.access = AgentWebAccess::Local;
    agent_config.agent_home = Some(agent_home.clone());
    agent_config.control = AgentWebControl::HostAuthorized;
    agent_config.plugin_control = true;
    configure_agent_authority(&mut agent_config, &agent_home)?;
    agent_config.trusted_plugin_bundles =
        parse_trusted_bundles(std::env::var(TRUSTED_BUNDLES_ENV).ok().as_deref())?;
    let agent = AgentWebSurface::start(agent_config)
        .await
        .map_err(anyhow::Error::msg)?;
    let (stop_agent, agent_shutdown) = tokio::sync::oneshot::channel();
    let agent_router = agent.router();
    let agent_server = tokio::task::spawn_local(async move {
        axum::serve(agent_listener, agent_router)
            .with_graceful_shutdown(async move {
                let _ = agent_shutdown.await;
            })
            .await
    });
    println!("Connected Lenso Agent listening on http://{agent_address}");

    let console_result = serve(console, shutdown_signal()).await;
    let _ = stop_agent.send(());
    let agent_server_result = agent_server
        .await
        .map_err(|error| anyhow::anyhow!("Agent Web server task failed: {error}"))?;
    let agent_shutdown_result = agent.shutdown().await.map_err(anyhow::Error::msg);
    console_result?;
    agent_server_result?;
    agent_shutdown_result
}

fn parse_trusted_bundles(value: Option<&str>) -> anyhow::Result<Vec<TrustedPluginBundle>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(Vec::new());
    };
    let entries = serde_json::from_str::<std::collections::BTreeMap<String, PathBuf>>(value)
        .map_err(|error| anyhow::anyhow!("{TRUSTED_BUNDLES_ENV} must be a JSON object: {error}"))?;
    entries
        .into_iter()
        .map(|(id, path)| TrustedPluginBundle::new(id, path).map_err(anyhow::Error::msg))
        .collect()
}

fn agent_address() -> anyhow::Result<SocketAddr> {
    let value = std::env::var("LENSO_AGENT_WEB_LISTEN")
        .unwrap_or_else(|_| DEFAULT_AGENT_ADDRESS.to_owned());
    let address = value.parse::<SocketAddr>()?;
    anyhow::ensure!(
        address.ip().is_loopback(),
        "LENSO_AGENT_WEB_LISTEN must be a loopback address"
    );
    Ok(address)
}

fn agent_home() -> anyhow::Result<PathBuf> {
    let home = std::env::var_os("LENSO_AGENT_HOME").map_or_else(
        || {
            BaseDirs::new()
                .map(|base| base.home_dir().join(".lenso/agent"))
                .ok_or_else(|| anyhow::anyhow!("the user home directory is unavailable"))
        },
        |value| Ok(PathBuf::from(value)),
    )?;
    anyhow::ensure!(
        home.is_absolute(),
        "LENSO_AGENT_HOME must be an absolute path"
    );
    Ok(home)
}

fn configure_agent_authority(config: &mut AgentWebConfig, agent_home: &Path) -> anyhow::Result<()> {
    configure_agent_authority_from(config, agent_home, AgentAuthorityEnvironment::load())
}

fn configure_agent_authority_from(
    config: &mut AgentWebConfig,
    agent_home: &Path,
    environment: AgentAuthorityEnvironment,
) -> anyhow::Result<()> {
    let AgentAuthorityEnvironment {
        selection,
        store,
        remote_url,
        remote_app,
        remote_environment,
        remote_token,
    } = environment;
    let kind = parse_authority_kind(selection.as_deref())?;
    match kind {
        AgentConfigurationAuthorityKind::Local => {
            reject_present(store.is_some(), STORE_ENV, kind)?;
            reject_remote_settings(
                kind,
                remote_url.as_ref(),
                remote_app.as_ref(),
                remote_environment.as_ref(),
                remote_token.as_ref(),
            )?;
        }
        AgentConfigurationAuthorityKind::Sqlite => {
            reject_remote_settings(
                kind,
                remote_url.as_ref(),
                remote_app.as_ref(),
                remote_environment.as_ref(),
                remote_token.as_ref(),
            )?;
            let database = store.unwrap_or_else(|| agent_home.join("plugin-configuration.sqlite3"));
            anyhow::ensure!(
                database.is_absolute(),
                "{STORE_ENV} must be an absolute path"
            );
            config.plugin_configuration_store =
                Some(PluginConfigurationStoreConfig::new(database, "app-agent"));
        }
        AgentConfigurationAuthorityKind::Remote => {
            reject_present(store.is_some(), STORE_ENV, kind)?;
            let service_url = required_setting(remote_url, REMOTE_URL_ENV, kind)?;
            let app = required_setting(remote_app, REMOTE_APP_ENV, kind)?;
            let environment = required_setting(remote_environment, REMOTE_ENVIRONMENT_ENV, kind)?;
            let token = required_setting(remote_token, REMOTE_TOKEN_ENV, kind)?;
            let resource = RemotePluginConfigurationResource::new(service_url, app, environment)
                .map_err(|error| anyhow::anyhow!(error.to_string()))?;
            config.plugin_configuration_remote = Some(
                RemotePluginConfigurationConfig::new(resource, token)
                    .map_err(|error| anyhow::anyhow!(error.to_string()))?,
            );
        }
    }
    Ok(())
}

fn parse_authority_kind(value: Option<&str>) -> anyhow::Result<AgentConfigurationAuthorityKind> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("sqlite_configuration_store") => Ok(AgentConfigurationAuthorityKind::Sqlite),
        Some("local_plugin_root") => Ok(AgentConfigurationAuthorityKind::Local),
        Some("remote_configuration_service") => Ok(AgentConfigurationAuthorityKind::Remote),
        Some(value) => anyhow::bail!(
            "{AUTHORITY_ENV} must be local_plugin_root, sqlite_configuration_store, or remote_configuration_service; received `{value}`"
        ),
    }
}

fn reject_remote_settings(
    kind: AgentConfigurationAuthorityKind,
    url: Option<&String>,
    app: Option<&String>,
    environment: Option<&String>,
    token: Option<&String>,
) -> anyhow::Result<()> {
    for (name, present) in [
        (REMOTE_URL_ENV, url.is_some()),
        (REMOTE_APP_ENV, app.is_some()),
        (REMOTE_ENVIRONMENT_ENV, environment.is_some()),
        (REMOTE_TOKEN_ENV, token.is_some()),
    ] {
        reject_present(present, name, kind)?;
    }
    Ok(())
}

fn reject_present(
    present: bool,
    name: &str,
    kind: AgentConfigurationAuthorityKind,
) -> anyhow::Result<()> {
    anyhow::ensure!(
        !present,
        "{name} conflicts with selected authority {}",
        authority_kind_name(kind)
    );
    Ok(())
}

fn required_setting(
    value: Option<String>,
    name: &str,
    kind: AgentConfigurationAuthorityKind,
) -> anyhow::Result<String> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("{name} is required for {}", authority_kind_name(kind)))
}

const fn authority_kind_name(kind: AgentConfigurationAuthorityKind) -> &'static str {
    match kind {
        AgentConfigurationAuthorityKind::Local => "local_plugin_root",
        AgentConfigurationAuthorityKind::Remote => "remote_configuration_service",
        AgentConfigurationAuthorityKind::Sqlite => "sqlite_configuration_store",
    }
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> AgentWebConfig {
        AgentWebConfig::new(|| {})
    }

    #[test]
    fn default_agent_address_is_loopback() {
        let address = DEFAULT_AGENT_ADDRESS.parse::<SocketAddr>().unwrap();
        assert!(address.ip().is_loopback());
    }

    #[test]
    fn authority_selection_accepts_exact_host_kinds() {
        assert_eq!(
            parse_authority_kind(None).unwrap(),
            AgentConfigurationAuthorityKind::Sqlite
        );
        assert_eq!(
            parse_authority_kind(Some("local_plugin_root")).unwrap(),
            AgentConfigurationAuthorityKind::Local
        );
        assert_eq!(
            parse_authority_kind(Some("remote_configuration_service")).unwrap(),
            AgentConfigurationAuthorityKind::Remote
        );
        assert!(parse_authority_kind(Some("custom")).is_err());
    }

    #[test]
    fn trusted_bundle_catalog_keeps_paths_in_host_configuration() {
        let bundles = parse_trusted_bundles(Some(
            r#"{"reviewed.tools":"/opt/lenso/plugins/reviewed-tools"}"#,
        ))
        .unwrap();

        assert_eq!(bundles.len(), 1);
        assert_eq!(bundles[0].id, "reviewed.tools");
        assert_eq!(
            bundles[0].path,
            PathBuf::from("/opt/lenso/plugins/reviewed-tools")
        );
        assert!(parse_trusted_bundles(Some(r#"{"reviewed":"relative"}"#)).is_err());
    }

    #[test]
    fn authority_selection_defaults_to_durable_sqlite() {
        let mut config = test_config();
        configure_agent_authority_from(
            &mut config,
            Path::new("/agent-home"),
            AgentAuthorityEnvironment::default(),
        )
        .unwrap();

        assert!(config.plugin_configuration_store.is_some());
        assert!(config.plugin_configuration_remote.is_none());
    }

    #[test]
    fn local_authority_rejects_remote_credentials() {
        let mut config = test_config();
        let error = configure_agent_authority_from(
            &mut config,
            Path::new("/agent-home"),
            AgentAuthorityEnvironment {
                selection: Some("local_plugin_root".to_owned()),
                remote_token: Some("must-not-be-ignored".to_owned()),
                ..AgentAuthorityEnvironment::default()
            },
        )
        .unwrap_err();

        assert!(error.to_string().contains(REMOTE_TOKEN_ENV));
        assert!(config.plugin_configuration_store.is_none());
        assert!(config.plugin_configuration_remote.is_none());
    }

    #[test]
    fn remote_authority_requires_every_resource_coordinate() {
        let mut config = test_config();
        let error = configure_agent_authority_from(
            &mut config,
            Path::new("/agent-home"),
            AgentAuthorityEnvironment {
                selection: Some("remote_configuration_service".to_owned()),
                remote_url: Some("https://configuration.example.com".to_owned()),
                remote_app: Some("agent".to_owned()),
                remote_token: Some("secret".to_owned()),
                ..AgentAuthorityEnvironment::default()
            },
        )
        .unwrap_err();

        assert!(error.to_string().contains(REMOTE_ENVIRONMENT_ENV));
    }

    #[test]
    fn remote_authority_is_selected_when_coordinates_are_complete() {
        let mut config = test_config();
        configure_agent_authority_from(
            &mut config,
            Path::new("/agent-home"),
            AgentAuthorityEnvironment {
                selection: Some("remote_configuration_service".to_owned()),
                remote_url: Some("https://configuration.example.com".to_owned()),
                remote_app: Some("agent".to_owned()),
                remote_environment: Some("production".to_owned()),
                remote_token: Some("secret".to_owned()),
                ..AgentAuthorityEnvironment::default()
            },
        )
        .unwrap();

        assert!(config.plugin_configuration_store.is_none());
        assert!(config.plugin_configuration_remote.is_some());
    }
}
