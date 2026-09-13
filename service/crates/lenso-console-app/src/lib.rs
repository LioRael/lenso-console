//! Reference Console App: linked providers, defaults, ingress and process lifecycle.
mod auth_plugins;
mod config;
use anyhow::Context as _;
pub use config::ConsoleAppConfig;
use lenso_app_plan::authoring::{
    HostBinding, HostCatalog, HostDefaultPlugin, HostPluginRelease, HostSlot, PluginInstanceId,
};
#[cfg(test)]
use lenso_app_plan::authoring::{PluginRootSnapshot, resolve_plugin_root};
use lenso_app_plan::{RequestAdmissionPlan, ResolvedAppPlan};
use lenso_capability_http_endpoint as http_endpoint;
use lenso_capability_http_stream_endpoint as stream_endpoint;
use lenso_console_plugin::link;
use lenso_kernel::{Kernel, NativeApp, ShutdownOutcome};
use lenso_native_adapter::NativePluginRegistry;
use lenso_runner::TokioDriver;
use lenso_web_ingress_plugin::{WebIngressConfig, WebIngressFactory};
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    future::Future,
    io::Write as _,
    net::SocketAddr,
    path::Path,
};
const MAX_AGENT_REQUEST_BYTES: usize = 12 * 1024 * 1024;
const CONSOLE_REQUEST_ADMISSION: RequestAdmissionPlan = RequestAdmissionPlan::new(64, 16);
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
pub async fn start_host(config: &ConsoleAppConfig) -> anyhow::Result<NativeApp> {
    config.validate()?;
    link();
    auth_plugins::link();
    lenso_observe_plugin::link();
    lenso_projects_workspace_plugin::link();
    let registry = console_registry();
    let catalog = console_host_catalog(config)?;
    publish_console_app_authority(&config.app_root, &catalog)?;
    let resolved = lenso_app_authoring::load_resolved_app(&config.app_root)
        .map_err(|error| anyhow::anyhow!("resolve Console App Plugin Root: {error:#}"))?;
    // Derive admission in Host authority, then resolve the final immutable Plan.
    let catalog = http_admission_catalog(catalog, resolved.plan())?;
    publish_console_app_authority(&config.app_root, &catalog)?;
    let resolved = lenso_app_authoring::load_resolved_app(&config.app_root)?;
    auth_plugins::validate_browser_session(resolved.plan())?;
    let app = Kernel::start_native(resolved.plan().clone(), TokioDriver::new(), registry)
        .await
        .map_err(|error| anyhow::anyhow!("Console Host startup failed: {error:?}"))?;
    println!("Lenso Console listening on http://{}", config.address);
    Ok(app)
}

#[cfg(test)]
fn console_host_plan(config: &ConsoleAppConfig) -> anyhow::Result<ResolvedAppPlan> {
    let host = console_host_catalog(config)?;
    let resolved = resolve_plugin_root(&host, &PluginRootSnapshot::default())
        .map_err(|error| anyhow::anyhow!("invalid Console Plugin composition: {error}"))?;
    let host = http_admission_catalog(host, resolved.plan())?;
    Ok(resolve_plugin_root(&host, &PluginRootSnapshot::default())?
        .plan()
        .clone())
}

#[allow(clippy::too_many_lines)] // Keep the available Plugin cohort and its bindings together.
fn console_host_catalog(config: &ConsoleAppConfig) -> anyhow::Result<HostCatalog> {
    let slots = [
        HostSlot::many("http-ingress"),
        HostSlot::one("console"),
        HostSlot::many("console-workspaces"),
        HostSlot::many("identity"),
        HostSlot::many("auth"),
        HostSlot::many("auth-methods"),
        HostSlot::many("oauth-flows"),
        HostSlot::many("secrets"),
        HostSlot::many("http-clients"),
        HostSlot::many("web"),
        HostSlot::many("projects"),
        HostSlot::many("organization"),
        HostSlot::many("access-control"),
    ];
    let linked = NativePluginRegistry::host_catalog(slots.clone(), [])
        .map_err(|error| anyhow::anyhow!("invalid linked Console Plugin catalog: {error:?}"))?;
    let ingress_descriptor = WebIngressFactory::plugin_descriptor();
    let releases = linked
        .plugins()
        .iter()
        .cloned()
        .chain(std::iter::once(HostPluginRelease::new(ingress_descriptor)))
        .chain(std::iter::once(HostPluginRelease::new(
            lenso_organization_postgres_plugin::OrganizationFactory::plugin_descriptor(),
        )))
        .collect::<Vec<_>>();
    let mut defaults = Vec::new();
    let observe_source = config.observe_source()?;
    for release in &releases {
        let descriptor = release.descriptor();
        match descriptor.root_slot() {
            "http-ingress" if descriptor.plugin_id() == "lenso.web-ingress" => {
                let ingress = web_ingress_config(config.address, MAX_AGENT_REQUEST_BYTES, 65_536)?;
                defaults.push(
                    HostDefaultPlugin::new(descriptor.plugin_id(), "default")
                        .with_configuration(serde_json::to_value(ingress)?),
                );
                if observe_source.is_some() {
                    let telemetry =
                        web_ingress_config(config.telemetry_address, 16 * 1024 * 1024, 4096)?;
                    defaults.push(
                        HostDefaultPlugin::new(descriptor.plugin_id(), "telemetry")
                            .with_configuration(serde_json::to_value(telemetry)?),
                    );
                }
            }
            "console" if descriptor.plugin_id() == "lenso.console.web" => {
                defaults.push(
                    HostDefaultPlugin::new(descriptor.plugin_id(), "default").with_configuration(
                        serde_json::to_value(config.shell.to_plugin_config()?)?,
                    ),
                );
            }
            "console-workspaces" if descriptor.plugin_id() == "lenso.console.workspace.observe" => {
                if let Some((source_id, source_label)) = observe_source.clone() {
                    let state_root = config
                        .shell
                        .agent_home
                        .parent()
                        .unwrap_or(&config.shell.agent_home)
                        .join("observe");
                    defaults.push(
                        HostDefaultPlugin::new(descriptor.plugin_id(), &source_id)
                            .with_configuration(serde_json::json!({
                                "source_id": source_id,
                                "source_label": source_label,
                                "database": state_root.join("telemetry.sqlite3"),
                                "token_file": state_root.join("otlp-token"),
                                "retention_days": 7,
                                "retention_bytes": 536_870_912_u64
                            }))
                            .disableable(),
                    );
                }
            }
            "console-workspaces"
                if descriptor.plugin_id() == "lenso.console.workspace.projects" =>
            {
                if let Some(origin) = &config.projects_workspace_origin {
                    defaults.push(
                        HostDefaultPlugin::new(descriptor.plugin_id(), "default")
                            .with_configuration(serde_json::json!({"origin": origin}))
                            .disableable(),
                    );
                }
            }
            _ => {}
        }
    }
    let ingress = PluginInstanceId::new("lenso.web-ingress", "default");
    let mut bindings = vec![
        HostBinding::new(
            PluginInstanceId::new("lenso.console.workspace.projects", "default"),
            http_endpoint::CAPABILITY_ID,
            "web",
        ),
        HostBinding::new(
            PluginInstanceId::new("lenso.console.web", "default"),
            lenso_capability_auth::CAPABILITY_ID,
            "identity",
        ),
        HostBinding::new(ingress, stream_endpoint::CAPABILITY_ID, "console")
            .with_admission(CONSOLE_REQUEST_ADMISSION),
    ];
    if observe_source.is_some() {
        bindings.push(HostBinding::new(
            PluginInstanceId::new("lenso.web-ingress", "telemetry"),
            stream_endpoint::CAPABILITY_ID,
            "console-workspaces",
        ));
    }
    Ok(HostCatalog::new(slots, releases, defaults).with_bindings(bindings))
}

/// HTTP fan-out needs bounded waiting instead of the generic zero-queue default.
/// Preserve the resolver's provider set; never change the running Plan or routes.
fn http_admission_catalog(
    catalog: HostCatalog,
    plan: &ResolvedAppPlan,
) -> anyhow::Result<HostCatalog> {
    let mut groups = BTreeMap::<(String, String), Vec<PluginInstanceId>>::new();
    for binding in plan.capability_bindings() {
        if binding.capability_id() == http_endpoint::CAPABILITY_ID {
            groups
                .entry((
                    binding.consumer_instance().to_owned(),
                    binding.requirement_id().to_owned(),
                ))
                .or_default()
                .push(plan_instance_id(binding.provider_instance())?);
        }
    }
    let mut bindings = catalog.bindings().to_vec();
    for ((consumer, requirement), providers) in groups {
        let consumer = plan_instance_id(&consumer)?;
        bindings.retain(|binding| {
            binding.consumer() != &consumer || binding.requirement_id() != requirement
        });
        let binding = HostBinding::to_instances(consumer, http_endpoint::CAPABILITY_ID, providers)
            .with_admission(CONSOLE_REQUEST_ADMISSION);
        bindings.push(if requirement.starts_with('~') {
            binding
        } else {
            binding.with_requirement_id(requirement)
        });
    }
    Ok(catalog.with_bindings(bindings))
}

fn plan_instance_id(key: &str) -> anyhow::Result<PluginInstanceId> {
    let (plugin, instance) = key
        .split_once('/')
        .ok_or_else(|| anyhow::anyhow!("invalid resolved Plugin Instance: {key}"))?;
    Ok(PluginInstanceId::new(plugin, instance))
}

fn publish_console_app_authority(root: &Path, catalog: &HostCatalog) -> anyhow::Result<()> {
    anyhow::ensure!(
        root.is_absolute() && root.parent().is_some(),
        "Console App root must be an absolute non-root path"
    );
    ensure_real_directory(root, "Console App root")?;
    let control = root.join(".lenso");
    let plugins = root.join("plugins");
    ensure_real_directory(&control, "Console control directory")?;
    ensure_real_directory(&plugins, "Console Plugin Root")?;

    let mut bytes = serde_json::to_vec_pretty(catalog)?;
    bytes.push(b'\n');
    let destination = control.join("host-catalog.json");
    if fs::read(&destination).is_ok_and(|current| current == bytes) {
        return Ok(());
    }
    if fs::symlink_metadata(&destination).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        anyhow::bail!(
            "Console Host Catalog must not be a symbolic link: {}",
            destination.display()
        );
    }
    let temporary = control.join(format!("host-catalog.{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> anyhow::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&temporary, &destination)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.with_context(|| format!("publish Console Host Catalog at {}", destination.display()))
}

fn ensure_real_directory(path: &Path, label: &str) -> anyhow::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => anyhow::ensure!(
            metadata.file_type().is_dir(),
            "{label} must be a directory, not a symlink or file: {}",
            path.display()
        ),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(path)
                .with_context(|| format!("create {label} at {}", path.display()))?;
        }
        Err(error) => {
            return Err(error).with_context(|| format!("inspect {label} at {}", path.display()));
        }
    }
    Ok(())
}

fn web_ingress_config(
    address: SocketAddr,
    max_body_bytes: usize,
    max_connections: usize,
) -> anyhow::Result<WebIngressConfig> {
    WebIngressConfig::default()
        .with_bind_address(address)
        .map_err(anyhow::Error::msg)?
        .with_request_limits(max_body_bytes, 1024 * 1024)
        .map_err(anyhow::Error::msg)?
        .with_connection_limits(max_connections, std::time::Duration::from_secs(15))
        .map_err(anyhow::Error::msg)?
        .with_shutdown_grace_timeout(std::time::Duration::from_millis(250))
        .map_err(anyhow::Error::msg)
}

fn console_registry() -> NativePluginRegistry {
    NativePluginRegistry::new()
        .with_linked_factories()
        .with_factory(WebIngressFactory::default())
        .with_factory(lenso_organization_postgres_plugin::OrganizationFactory)
}

/// Runs the reference Console Host until the process owner requests shutdown.
pub async fn serve_host(
    config: ConsoleAppConfig,
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

#[cfg(test)]
mod tests;
