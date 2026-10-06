//! An ordinary business App with optional, independently owned security workspaces.
use lenso_app_plan::authoring::{
    HostBinding, HostCatalog, HostDefaultPlugin, HostPluginRelease, HostSlot, PluginInstanceId,
    PluginRootSnapshot, resolve_plugin_root,
};
use lenso_app_plan::{RequestAdmissionPlan, ResolvedAppPlan};
use lenso_capability_http_endpoint::prelude::*;
use lenso_native_adapter::NativePluginRegistry;
use lenso_web_ingress_plugin::{WebIngressConfig, WebIngressFactory};
use std::{collections::BTreeMap, net::SocketAddr};

// Availability is independent of activation; Plugin Root selects these owners.
use lenso_access_control_postgres_plugin as _;
use lenso_audit_log_postgres_plugin as _;
use lenso_auth_account_plugin as _;
use lenso_auth_password_plugin as _;
#[cfg(feature = "browser-auth")]
use lenso_auth_session_renewal_plugin as _;
use lenso_auth_web_session_plugin as _;

pub const CONSOLE_INSTANCE: &str = "lenso.console.web/console";

#[lenso::plugin]
#[derive(Clone, Debug, Default)]
pub struct Health {}

#[endpoint]
impl Health {
    #[get("health.read", "/health")]
    async fn health(
        &self,
    ) -> Result<Json<serde_json::Value>, lenso_capability_http_endpoint::response::Problem> {
        Ok(Json(
            serde_json::json!({"status":"ok","app":"security-workspaces"}),
        ))
    }
}

pub fn link() {
    lenso_secrets_env_plugin::link();
    #[cfg(feature = "console")]
    {
        lenso_console_plugin::link();
        lenso_access_control_console_plugin::link();
        lenso_audit_log_console_plugin::link();
        lenso_auth_account_console_plugin::link();
        lenso_auth_session_console_plugin::link();
    }
    #[cfg(feature = "browser-auth")]
    {
        lenso_auth_password_web_session_plugin::link_plugin();
    }
}

/// The product Host declares availability; App owners configure selected Instances.
pub fn host_catalog(address: SocketAddr) -> anyhow::Result<HostCatalog> {
    link();
    let slots = [
        "http-ingress",
        "web",
        "console",
        "console-workspaces",
        "console-global-extensions",
        "identity",
        "auth",
        "auth-methods",
        "secrets",
        "access-control",
        "audit",
    ]
    .into_iter()
    .map(HostSlot::many)
    .collect::<Vec<_>>();
    let linked = NativePluginRegistry::host_catalog(slots.clone(), [])
        .map_err(|error| anyhow::anyhow!("linked catalog: {error:?}"))?;
    let mut releases = linked.plugins().to_vec();
    releases.push(HostPluginRelease::new(
        WebIngressFactory::plugin_descriptor(),
    ));
    let ingress = WebIngressConfig::default()
        .with_bind_address(address)
        .map_err(anyhow::Error::msg)?;
    let mut defaults = vec![
        HostDefaultPlugin::new("lenso.security-workspaces.health", "business"),
        HostDefaultPlugin::new("lenso.web-ingress", "native")
            .with_configuration(serde_json::to_value(ingress)?),
    ];
    #[cfg(feature = "console")]
    {
        let mut console = lenso_console_plugin::ConsolePluginConfig::defaults();
        console.require_user_session = true;
        console.liveness_readiness_routes = false;
        // This App has no Agent connection, Operators profile or shared control token.
        console.allowed_tools.clear();
        defaults.push(
            HostDefaultPlugin::new("lenso.console.web", "console")
                .with_configuration(serde_json::to_value(console)?)
                .disableable(),
        );
    }
    // Account owns identities in this App; no external Directory imports them.
    // Explicitly leave its optional source port empty rather than resolving it
    // against Account's own Directory implementation.
    let catalog = HostCatalog::new(slots, releases, defaults).with_bindings([HostBinding::new(
        PluginInstanceId::new("lenso.auth.account", "default"),
        "lenso.identity.directory@1",
        // This Host's method slot has no Directory provider.
        "auth-methods",
    )]);
    #[cfg(feature = "console")]
    let catalog = {
        let mut bindings = catalog.bindings().to_vec();
        bindings.push(HostBinding::new(
            PluginInstanceId::new("lenso.console.web", "console"),
            lenso_capability_access_control::CAPABILITY_ID,
            // This ordinary Host admits no Operators implementation in its Console
            // slot. Business Access providers remain in their own access-control
            // slot; selecting them must not enable Console's optional operator port.
            "console",
        ));
        catalog.with_bindings(bindings)
    };
    Ok(catalog)
}

/// Freeze ordinary ingress and workspace dispatch admission in Host authority.
pub fn resolve(
    catalog: &HostCatalog,
    root: &PluginRootSnapshot,
) -> anyhow::Result<ResolvedAppPlan> {
    let first = resolve_plugin_root(catalog, root)?;
    let admitted = admitted_catalog(catalog, first.plan())?;
    Ok(resolve_plugin_root(&admitted, root)?.plan().clone())
}

/// Keep admission derived from the selected public requirements in Host authority.
pub fn admitted_catalog(
    catalog: &HostCatalog,
    plan: &ResolvedAppPlan,
) -> anyhow::Result<HostCatalog> {
    let mut groups = BTreeMap::<(String, String, String), Vec<PluginInstanceId>>::new();
    for binding in plan.capability_bindings() {
        if binding.capability_id() == lenso_capability_http_endpoint::CAPABILITY_ID
            || (binding.consumer_instance() == CONSOLE_INSTANCE
                && binding.capability_id() == "lenso.ui.workspace-service@1")
        {
            groups
                .entry((
                    binding.consumer_instance().to_owned(),
                    binding.requirement_id().to_owned(),
                    binding.capability_id().to_owned(),
                ))
                .or_default()
                .push(instance(binding.provider_instance())?);
        }
    }
    let mut bindings = catalog.bindings().to_vec();
    for ((consumer, requirement, capability), providers) in groups {
        let consumer = instance(&consumer)?;
        bindings.retain(|binding| {
            binding.consumer() != &consumer || binding.requirement_id() != requirement
        });
        let binding = HostBinding::to_instances(consumer, capability, providers)
            .with_admission(RequestAdmissionPlan::new(64, 16));
        bindings.push(if requirement.starts_with('~') {
            binding
        } else {
            binding.with_requirement_id(requirement)
        });
    }
    Ok(catalog.clone().with_bindings(bindings))
}

fn instance(key: &str) -> anyhow::Result<PluginInstanceId> {
    let (plugin, instance) = key
        .split_once('/')
        .ok_or_else(|| anyhow::anyhow!("invalid instance {key}"))?;
    Ok(PluginInstanceId::new(plugin, instance))
}

pub fn registry(ingress: WebIngressFactory) -> NativePluginRegistry {
    NativePluginRegistry::new()
        .with_linked_factories()
        .with_factory(ingress)
}

/// An explicitly selected cookie login must have matching ingress extraction.
/// Authorization-only Hosts have no Web Session Instance and need no cookie transport.
pub fn validate_session_transport(plan: &ResolvedAppPlan) -> anyhow::Result<()> {
    for instance in plan.plugin_instances().iter().filter(|instance| {
        [
            "lenso.auth.web-session/",
            "lenso.auth.password-web-session/",
            "lenso.auth.session-renewal/",
            "lenso.auth.session-console/",
        ]
        .iter()
        .any(|prefix| instance.instance_key().starts_with(prefix))
    }) {
        let session: serde_json::Value = serde_json::from_str(instance.configuration())?;
        let ingresses = plan
            .plugin_instances()
            .iter()
            .filter(|instance| instance.instance_key().starts_with("lenso.web-ingress/"))
            .collect::<Vec<_>>();
        anyhow::ensure!(
            !ingresses.is_empty(),
            "Web Session requires selected Web Ingress cookie extraction"
        );
        for ingress in ingresses {
            let ingress: serde_json::Value = serde_json::from_str(ingress.configuration())?;
            anyhow::ensure!(
                ingress["session_cookie"].is_object()
                    && session["session_cookie_name"] == ingress["session_cookie"]["name"]
                    && session["csrf_cookie_name"] == ingress["session_cookie"]["csrf_cookie_name"]
                    && ingress["session_cookie"]["csrf_header_name"] == "x-csrf-token",
                "Web Session and Web Ingress require explicit matching session/CSRF cookie extraction"
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;

#[cfg(all(test, feature = "console"))]
mod postgres_tests;

#[cfg(all(test, feature = "console", feature = "browser-auth"))]
mod auth_tests;
