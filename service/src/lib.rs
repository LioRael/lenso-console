mod app_management;
mod page_contributions;
mod project_activity;
mod projects;
mod workspace_services;
pub use app_management::{ManagedAppAdapter, ManagedAppConnection};
pub use projects::LocalProjects;

use std::{
    collections::{BTreeMap, BTreeSet},
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
use lenso_app_plan::ResolvedAppPlan;
use lenso_app_plan::authoring::{
    HostDefaultPlugin, HostSlot, PluginRootSnapshot, resolve_plugin_root,
};
use lenso_kernel::{Kernel, NativeApp, ShutdownOutcome};
use lenso_native_adapter::NativePluginRegistry;
use lenso_runner::TokioDriver;
use serde::{Deserialize, Serialize};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::{ServeDir, ServeFile};

const DEFAULT_PORT: u16 = 3030;
const DEFAULT_CONSOLE_AGENT_URL: &str = "http://127.0.0.1:8788";
const MAX_AGENT_REQUEST_BYTES: usize = 12 * 1024 * 1024;
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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ConsolePluginConfig {
    address: String,
    agent_home: String,
    allowed_tools: Vec<String>,
    agent_configuration_store: String,
    console_agent_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    agent_control_token_file: Option<String>,
    connected_agent_label: String,
    connected_agent_plugin_configuration: bool,
    connected_agent_plugin_lifecycle: bool,
    #[serde(default)]
    connected_agent_auth_connections: bool,
    connected_agent_url: String,
    #[serde(default)]
    managed_apps: Vec<ManagedAppConnection>,
    managed_app_root: String,
    trusted_plugin_bundles: BTreeMap<String, String>,
    web_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    local_projects: Option<LocalProjectsConfig>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct LocalProjectsConfig {
    binary: String,
    root: String,
    template: String,
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
    if let Some(projects) = &config.local_projects
        && [
            projects.binary.as_str(),
            projects.root.as_str(),
            projects.template.as_str(),
        ]
        .into_iter()
        .any(str::is_empty)
    {
        return Err(invalid_plan("local project paths must not be empty"));
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
    workspace_contributions: ManyPort<lenso_capability_ui_contribution::ContributionClient>,
    workspace_services: ManyPort<lenso_capability_workspace_service::WorkspaceServiceClient>,
    #[tasks]
    tasks: ManagedTasks,
}

impl Lifecycle for ConsolePlugin {
    async fn activate(&self, _context: ActivateContext) -> Result<(), RuntimeFailure> {
        let config = ConsoleConfig::from_plugin(&self.config).map_err(plugin_failure)?;
        let (page_catalog, workspace_services) = page_contributions::PageCatalog::from_ports(
            &self.workspace_contributions,
            &self.workspace_services,
            &config.application_subject_ids(),
        )
        .await?;
        let local_projects = config.local_projects.clone();
        let server = ConsoleServer::start(config, page_catalog)
            .await
            .map_err(plugin_failure)?;
        let cancellation = self.tasks.cancellation().map_err(|error| {
            plugin_failure(format!("Console task scope is unavailable: {error:?}"))
        })?;
        let (shutdown, shutdown_signal) = tokio::sync::oneshot::channel();
        self.tasks
            .spawn_local(workspace_services.run())
            .map_err(|error| {
                plugin_failure(format!(
                    "Workspace service dispatcher failed to start: {error:?}"
                ))
            })?;
        self.tasks
            .spawn_local(async move {
                cancellation.cancelled().await;
                let _ = shutdown.send(());
            })
            .map_err(|error| plugin_failure(format!("Console shutdown task failed: {error:?}")))?;
        self.tasks
            .spawn_local(async move {
                let result = server
                    .run(async move {
                        let _ = shutdown_signal.await;
                    })
                    .await;
                if let Some(projects) = local_projects {
                    projects.shutdown().await;
                }
                if let Err(error) = result {
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
    local_projects: Option<std::sync::Arc<LocalProjects>>,
    local_projects_config: Option<LocalProjectsConfig>,
    agent_control_token_file: Option<PathBuf>,
    pub address: SocketAddr,
    pub agent_home: PathBuf,
    pub managed_app_root: PathBuf,
    pub allowed_tools: Vec<String>,
    pub app_agents: Vec<AppAgentAdapter>,
    pub managed_apps: Vec<ManagedAppAdapter>,
    managed_app_connections: Vec<ManagedAppConnection>,
    console_agent: AppAgentAdapter,
    pub agent_configuration_store: PathBuf,
    pub tool_policy: PathBuf,
    pub trusted_plugin_bundles: Vec<TrustedPluginBundle>,
    pub web_root: PathBuf,
}

impl ConsoleConfig {
    fn application_subject_ids(&self) -> BTreeSet<String> {
        self.app_agents
            .iter()
            .map(|app| app.id.clone())
            .chain(
                self.managed_apps
                    .iter()
                    .filter_map(ManagedAppAdapter::application_subject_id)
                    .map(str::to_owned),
            )
            .collect()
    }

    #[must_use]
    pub fn with_local_projects(mut self, projects: std::sync::Arc<LocalProjects>) -> Self {
        self.local_projects = Some(projects);
        self
    }

    pub fn with_local_project_paths(
        mut self,
        root: &Path,
        template: &Path,
        binary: &Path,
    ) -> anyhow::Result<Self> {
        self.local_projects_config = Some(LocalProjectsConfig {
            binary: utf8_path(binary)?,
            root: utf8_path(root)?,
            template: utf8_path(template)?,
        });
        self.local_projects = None;
        Ok(self)
    }

    #[must_use]
    pub fn with_agent_control_token_file(mut self, path: PathBuf) -> Self {
        self.agent_control_token_file = Some(path);
        self
    }

    pub fn with_managed_app(mut self, connection: &ManagedAppConnection) -> anyhow::Result<Self> {
        self.managed_apps
            .push(ManagedAppAdapter::connect(connection)?);
        self.managed_app_connections.push(connection.clone());
        app_management::validate_connections(&self.app_agents, &self.managed_apps)?;
        Ok(self)
    }

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
        if config.connected_agent_auth_connections {
            for agent in &mut app_agents {
                agent.auth_connections = true;
            }
        }
        let configured_control_token = config
            .agent_control_token_file
            .as_ref()
            .map(|path| read_control_token(&resolve_path(&current, path)))
            .transpose()?
            .or_else(console_agent_control_token);
        if let Some(token) = &configured_control_token {
            for agent in &mut app_agents {
                agent.authorization = Some(format!("Bearer {token}"));
            }
        }
        let local_projects = config
            .local_projects
            .as_ref()
            .map(|projects| {
                LocalProjects::load(
                    resolve_path(&current, &projects.root),
                    resolve_path(&current, &projects.template),
                    resolve_path(&current, &projects.binary),
                )
            })
            .transpose()?;
        Ok(Self {
            local_projects,
            local_projects_config: config.local_projects.clone(),
            agent_control_token_file: config
                .agent_control_token_file
                .as_ref()
                .map(|path| resolve_path(&current, path)),
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
                configured_control_token,
            )?,
            app_agents,
            managed_apps: config
                .managed_apps
                .iter()
                .map(ManagedAppAdapter::connect)
                .collect::<anyhow::Result<_>>()?,
            managed_app_connections: config.managed_apps.clone(),
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
        let managed_app_connections = match std::env::var("LENSO_CONSOLE_MANAGED_APPS") {
            Ok(value) => serde_json::from_str::<Vec<ManagedAppConnection>>(&value)?,
            Err(std::env::VarError::NotPresent) => Vec::new(),
            Err(error) => return Err(error.into()),
        };
        Ok(Self {
            local_projects: None,
            local_projects_config: None,
            agent_control_token_file: None,
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
            managed_apps: managed_app_connections
                .iter()
                .map(ManagedAppAdapter::connect)
                .collect::<anyhow::Result<_>>()?,
            managed_app_connections,
            web_root,
        })
    }

    fn to_plugin_config(&self) -> anyhow::Result<ConsolePluginConfig> {
        anyhow::ensure!(
            self.local_projects.is_none() || self.local_projects_config.is_some(),
            "Plan-bound local projects require their Host-owned path configuration"
        );
        anyhow::ensure!(
            self.app_agents.len() <= 1,
            "the reference Console Host supports at most one connected App Agent"
        );
        let connected = self.app_agents.first();
        let connected_agent_control_token = connected
            .and_then(|agent| agent.authorization.as_deref())
            .map(|token| {
                token
                    .strip_prefix("Bearer ")
                    .ok_or_else(|| anyhow::anyhow!("App Agent authorization must use Bearer"))
                    .map(str::to_owned)
            })
            .transpose()?;
        let resolved_console_control_token = self
            .console_agent
            .authorization
            .as_deref()
            .and_then(|token| token.strip_prefix("Bearer "));
        if let (Some(app), Some(console)) = (
            connected_agent_control_token.as_deref(),
            resolved_console_control_token,
        ) {
            anyhow::ensure!(
                app == console,
                "the reference Console Host requires one shared Agent control token"
            );
        }
        let has_runtime_control_token =
            connected_agent_control_token.is_some() || resolved_console_control_token.is_some();
        anyhow::ensure!(
            !has_runtime_control_token
                || self.agent_control_token_file.is_some()
                || console_agent_control_token()
                    == resolved_console_control_token.map(str::to_owned),
            "generated Agent control tokens require a Host-private token file"
        );
        Ok(ConsolePluginConfig {
            address: self.address.to_string(),
            agent_home: utf8_path(&self.agent_home)?,
            allowed_tools: self.allowed_tools.clone(),
            agent_configuration_store: utf8_path(&self.agent_configuration_store)?,
            console_agent_url: self.console_agent.origin.to_string(),
            agent_control_token_file: self
                .agent_control_token_file
                .as_deref()
                .map(utf8_path)
                .transpose()?,
            connected_agent_label: connected
                .map_or_else(|| "Lenso Agent".to_owned(), |agent| agent.label.clone()),
            connected_agent_plugin_configuration: connected
                .is_some_and(|agent| agent.plugin_configuration),
            connected_agent_plugin_lifecycle: connected.is_some_and(|agent| agent.plugin_lifecycle),
            connected_agent_auth_connections: connected.is_some_and(|agent| agent.auth_connections),
            connected_agent_url: connected
                .map_or_else(String::new, |agent| agent.origin.to_string()),
            managed_apps: self.managed_app_connections.clone(),
            managed_app_root: utf8_path(&self.managed_app_root)?,
            trusted_plugin_bundles: self
                .trusted_plugin_bundles
                .iter()
                .map(|bundle| Ok((bundle.id.clone(), utf8_path(&bundle.path)?)))
                .collect::<anyhow::Result<_>>()?,
            web_root: utf8_path(&self.web_root)?,
            local_projects: self.local_projects_config.clone(),
        })
    }

    pub fn validate(&self) -> anyhow::Result<()> {
        app_management::validate_connections(&self.app_agents, &self.managed_apps)?;
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

fn utf8_path(path: &Path) -> anyhow::Result<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| anyhow::anyhow!("Console path is not UTF-8: {}", path.display()))
}

fn read_control_token(path: &Path) -> anyhow::Result<String> {
    let token = std::fs::read_to_string(path)?;
    let token = token.trim();
    anyhow::ensure!(!token.is_empty(), "Agent control token file is empty");
    Ok(token.to_owned())
}

/// Stores one launcher-owned Agent control token outside the Resolved App Plan.
pub fn store_agent_control_token(path: &Path, token: &str) -> anyhow::Result<()> {
    use std::io::Write as _;

    anyhow::ensure!(!token.trim().is_empty(), "Agent control token is empty");
    let parent = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Agent control token path has no parent"))?;
    std::fs::create_dir_all(parent)?;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(token.as_bytes())?;
    file.sync_all()?;
    #[cfg(unix)]
    std::fs::set_permissions(path, {
        use std::os::unix::fs::PermissionsExt as _;
        std::fs::Permissions::from_mode(0o600)
    })?;
    Ok(())
}

/// Starts the reference Console Host from one immutable Plugin composition.
pub async fn start_host(config: &ConsoleConfig) -> anyhow::Result<NativeApp> {
    link();
    lenso_console_welcome_workspace_plugin::link();
    let registry = NativePluginRegistry::new().with_linked_factories();
    Kernel::start_native(console_host_plan(config)?, TokioDriver::new(), registry)
        .await
        .map_err(|error| anyhow::anyhow!("Console Host startup failed: {error:?}"))
}

fn console_host_plan(config: &ConsoleConfig) -> anyhow::Result<ResolvedAppPlan> {
    let slots = [
        HostSlot::one("console"),
        HostSlot::many("console-workspaces"),
    ];
    let linked = NativePluginRegistry::host_catalog(slots.clone(), [])
        .map_err(|error| anyhow::anyhow!("invalid linked Console Plugin catalog: {error:?}"))?;
    let mut defaults = Vec::new();
    for release in linked.plugins() {
        let descriptor = release.descriptor();
        match descriptor.root_slot() {
            "console" if descriptor.plugin_id() == "lenso.console.web" => {
                defaults.push(
                    HostDefaultPlugin::new(descriptor.plugin_id(), "default")
                        .with_configuration(serde_json::to_value(config.to_plugin_config()?)?),
                );
            }
            "console-workspaces" => defaults
                .push(HostDefaultPlugin::new(descriptor.plugin_id(), "default").disableable()),
            _ => {}
        }
    }
    let host = NativePluginRegistry::host_catalog(slots, defaults)
        .map_err(|error| anyhow::anyhow!("invalid Console Host catalog: {error:?}"))?;
    let resolved = resolve_plugin_root(&host, &PluginRootSnapshot::default())
        .map_err(|error| anyhow::anyhow!("invalid Console Plugin composition: {error}"))?;
    Ok(resolved.plan().clone())
}

/// Runs the reference Console Host until the process owner requests shutdown.
pub async fn serve_host(
    config: ConsoleConfig,
    shutdown: impl Future<Output = ()>,
) -> anyhow::Result<()> {
    let app = start_host(&config).await?;
    shutdown.await;
    match app.shutdown(std::time::Duration::from_secs(10)).await {
        ShutdownOutcome::Clean => Ok(()),
        ShutdownOutcome::RuntimeFailure { error } => {
            Err(anyhow::anyhow!("Console Host shutdown failed: {error:?}"))
        }
        ShutdownOutcome::Timeout => anyhow::bail!("Console Host shutdown timed out"),
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
    let page_catalog = page_contributions::PageCatalog::discover(
        &config.web_root,
        &config.application_subject_ids(),
    )?;
    ConsoleServer::start(config, page_catalog)
        .await?
        .run(shutdown)
        .await
}

/// Serve Console on a listener reserved by its process-owning launcher.
pub async fn serve_listener(
    config: ConsoleConfig,
    listener: tokio::net::TcpListener,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> anyhow::Result<()> {
    let page_catalog = page_contributions::PageCatalog::discover(
        &config.web_root,
        &config.application_subject_ids(),
    )?;
    ConsoleServer::with_listener(config, listener, page_catalog)
        .await?
        .run(shutdown)
        .await
}

struct ConsoleServer {
    address: SocketAddr,
    app: Router,
    listener: tokio::net::TcpListener,
}

impl ConsoleServer {
    async fn start(
        config: ConsoleConfig,
        page_catalog: page_contributions::PageCatalog,
    ) -> anyhow::Result<Self> {
        let listener = tokio::net::TcpListener::bind(config.address).await?;
        Self::with_listener(config, listener, page_catalog).await
    }

    async fn with_listener(
        config: ConsoleConfig,
        listener: tokio::net::TcpListener,
        page_catalog: page_contributions::PageCatalog,
    ) -> anyhow::Result<Self> {
        anyhow::ensure!(
            listener.local_addr()?.ip() == config.address.ip()
                && (config.address.port() == 0
                    || listener.local_addr()?.port() == config.address.port()),
            "Console listener address does not match configuration"
        );
        config.validate()?;
        config.console_agent.require_ready().await?;
        let index = config.web_root.join("index.html");
        let shell = ServeDir::new(config.web_root).fallback(ServeFile::new(index));
        let mut agent_catalog = AgentCatalog::new(config.console_agent, config.app_agents);
        agent_catalog.projects = config.local_projects;
        if agent_catalog.projects.is_some() {
            for adapter in &mut agent_catalog.app_agents {
                if adapter.id == "app" {
                    adapter.activity = Some(std::sync::Arc::default());
                }
            }
        }
        let app = Router::new()
            .route("/health/live", get(health))
            .route("/health/ready", get(health))
            .route("/health/startup", get(health))
            .merge(page_catalog.routes())
            .merge(app_management::routes(app_management::AppCatalog {
                agents: agent_catalog.clone(),
                apps: config.managed_apps,
            }))
            .merge(projects::routes(agent_catalog.clone()))
            .merge(agent_catalog_routes(agent_catalog))
            .route("/api/{*path}", any(api_not_found))
            .fallback_service(shell);
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
    activity: Option<project_activity::SharedActivity>,
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
            activity: None,
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
        let mut request = self
            .client
            .get(url)
            .timeout(std::time::Duration::from_secs(2));
        if let Some(value) = &self.authorization {
            request = request.header(header::AUTHORIZATION, value);
        }
        let response = request
            .send()
            .await
            .map_err(|error| anyhow::anyhow!("Agent is unavailable: {error}"))?;
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
    projects: Option<std::sync::Arc<LocalProjects>>,
    console_agent: AppAgentAdapter,
    app_agents: Vec<AppAgentAdapter>,
}

impl AgentCatalog {
    fn new(console_agent: AppAgentAdapter, app_agents: Vec<AppAgentAdapter>) -> Self {
        Self {
            projects: None,
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
        .layer(axum::extract::DefaultBodyLimit::max(
            MAX_AGENT_REQUEST_BYTES,
        ))
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
    if method == Method::GET
        && path == "activity"
        && let Some(activity) = &app_agent.activity
    {
        return project_activity::snapshot(activity);
    }
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
    if method == Method::POST && path == "turns" && app_agent.activity.is_some() {
        return project_activity::relay(app_agent, headers, body).await;
    }
    proxy_request_at(
        app_agent,
        "/api/console/v1/agent",
        path,
        incoming,
        method,
        headers,
        body,
    )
    .await
}

async fn proxy_request_at(
    app_agent: AppAgentAdapter,
    base: &str,
    path: String,
    incoming: axum::http::Uri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let mut target_url = app_agent.origin;
    target_url.set_path(&format!("{base}/{path}"));
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
        (&Method::GET, ["sessions", session_id, "attachments", digest]) => {
            valid_agent_identity(session_id)
                && digest.len() == 64
                && digest.bytes().all(|b| b.is_ascii_hexdigit())
        }
        (
            &Method::GET,
            [
                "bootstrap" | "context-sources" | "skills" | "models" | "plugins" | "sessions"
                | "tasks",
            ]
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
            | ["sessions", session_id, "compact" | "fork"]
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
        (&Method::POST, ["control", "profile"] | ["control", "profiles", "import"])
        | (&Method::GET | &Method::POST, ["control", "profiles"])
        | (&Method::GET | &Method::PUT, ["control", "tool-policy"]) => plugin_configuration,
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
        assert_eq!(
            descriptor["required_capabilities"],
            serde_json::json!([
                {
                    "capability_id": "lenso.ui.contribution@1",
                    "descriptor_version": "1.2.0",
                    "cardinality": "many"
                },
                {
                    "capability_id": "lenso.ui.workspace-service@1",
                    "descriptor_version": "1.0.0",
                    "cardinality": "many"
                }
            ])
        );
    }

    #[test]
    fn reference_host_binds_the_workspace_provider_through_the_plan() {
        link();
        lenso_console_welcome_workspace_plugin::link();
        let plugin_config: ConsolePluginConfig =
            serde_json::from_str(include_str!("../config.defaults.json")).unwrap();
        let config = ConsoleConfig::from_plugin(&plugin_config).unwrap();
        let plan = console_host_plan(&config).unwrap();

        assert_eq!(plan.plugin_instances().len(), 2);
        assert!(
            plan.plugin_instances()
                .iter()
                .any(|instance| { instance.instance_key() == "lenso.console.web/default" })
        );
        assert!(plan.capability_bindings().iter().any(|binding| {
            binding.capability_id() == lenso_capability_ui_contribution::CAPABILITY_ID
        }));
        assert!(plan.capability_bindings().iter().any(|binding| {
            binding.capability_id() == lenso_capability_workspace_service::CAPABILITY_ID
        }));
    }

    #[test]
    fn agent_control_token_stays_out_of_the_resolved_plan() {
        let root = tempfile::tempdir().unwrap();
        let token_file = root.path().join("agent-control-token");
        store_agent_control_token(&token_file, "host-secret").unwrap();
        let mut plugin_config: ConsolePluginConfig =
            serde_json::from_str(include_str!("../config.defaults.json")).unwrap();
        plugin_config.agent_control_token_file = Some(token_file.to_str().unwrap().to_owned());
        let config = ConsoleConfig::from_plugin(&plugin_config).unwrap();
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
    async fn reference_host_serves_the_plan_bound_workspace_catalog() {
        let agent_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let agent_address = agent_listener.local_addr().unwrap();
        let agent = tokio::spawn(async move {
            axum::serve(
                agent_listener,
                Router::new().route(
                    "/api/console/v1/agent/bootstrap",
                    get(|| async { Json(serde_json::json!({})) }),
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
        let mut plugin_config: ConsolePluginConfig =
            serde_json::from_str(include_str!("../config.defaults.json")).unwrap();
        plugin_config.address = address.to_string();
        plugin_config.console_agent_url = format!("http://{agent_address}");
        plugin_config.web_root = root.path().to_str().unwrap().to_owned();
        let config = ConsoleConfig::from_plugin(&plugin_config).unwrap();

        let local = tokio::task::LocalSet::new();
        local
            .run_until(async move {
                let host = start_host(&config).await.unwrap();
                let catalog = reqwest::get(format!("http://{address}/api/console/v1/pages"))
                    .await
                    .unwrap()
                    .text()
                    .await
                    .unwrap();
                assert!(catalog.contains("lenso.console.workspace.welcome/default"));
                assert!(catalog.contains("\"service_id\":\"welcome\""));
                assert!(catalog.contains("\"available\":true"));
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
                assert!(matches!(
                    host.shutdown(std::time::Duration::from_secs(2)).await,
                    ShutdownOutcome::Clean
                ));
                let revoked = client
                    .post(format!(
                        "http://{address}/api/console/v1/pages/welcome/services/welcome/invoke/greet"
                    ))
                    .json(&serde_json::json!({ "name": "late" }))
                    .send()
                    .await;
                assert!(revoked.is_err());
            })
            .await;
        agent.abort();
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
            (Method::GET, "skills"),
            (Method::GET, "sessions"),
            (Method::POST, "turns"),
            (Method::GET, "sessions/session-1/trajectory"),
        ] {
            assert!(
                allowed_agent_route(&method, route, false),
                "{method} {route}"
            );
        }
        let attachment = format!("sessions/session-1/attachments/{}", "a".repeat(64));
        assert!(allowed_agent_route(&Method::GET, &attachment, false));
        assert!(!allowed_agent_route(&Method::POST, &attachment, false));
        assert!(!allowed_agent_route(
            &Method::GET,
            "sessions/session-1/attachments/invalid",
            false
        ));
        assert!(!allowed_agent_route(&Method::GET, "control/plugins", false));
        assert!(allowed_agent_route(&Method::GET, "control/plugins", true));
        assert!(allowed_agent_route(&Method::POST, "control/profile", true));
        assert!(!allowed_agent_route(
            &Method::POST,
            "control/profile",
            false
        ));
        for (method, path) in [
            (Method::POST, "control/profiles/import"),
            (Method::GET, "control/profiles"),
            (Method::POST, "control/profiles"),
            (Method::GET, "control/tool-policy"),
            (Method::PUT, "control/tool-policy"),
        ] {
            assert!(allowed_agent_route(&method, path, true));
            assert!(!allowed_agent_route(&method, path, false));
        }
        assert!(!allowed_agent_route(
            &Method::DELETE,
            "control/tool-policy",
            true
        ));
        assert!(!allowed_agent_route(
            &Method::PUT,
            "control/profiles/import",
            true
        ));
        assert!(!allowed_agent_route(
            &Method::POST,
            "control/profiles/arbitrary",
            true
        ));
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
