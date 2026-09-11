//! Authentication implementations are available; App Plugin Root chooses activation.
use lenso_access_control_postgres_plugin as _;
use lenso_auth_account_plugin as _;
use lenso_auth_oauth_flow_plugin as _;
use lenso_auth_oidc_client_plugin as _;
use lenso_auth_password_plugin as _;
use lenso_auth_web_session_plugin as _;
use lenso_http_egress_plugin as _;
use lenso_projects_postgres_plugin as _;
use lenso_projects_web_plugin as _;

pub(super) fn link() {
    lenso_secrets_env_plugin::link();
}

/// Reject a browser login composition whose ingress would discard its session.
pub(super) fn validate_browser_session(
    plan: &lenso_app_plan::ResolvedAppPlan,
) -> anyhow::Result<()> {
    let configuration = |key: &str| -> anyhow::Result<serde_json::Value> {
        let instance = plan
            .plugin_instances()
            .iter()
            .find(|instance| instance.instance_key() == key)
            .ok_or_else(|| anyhow::anyhow!("missing session composition instance {key}"))?;
        Ok(serde_json::from_str(instance.configuration())?)
    };
    let console = configuration("lenso.console.web/default")?;
    if console["require_user_session"] != true {
        return Ok(());
    }
    if console["member_workspace_ids"]
        .as_array()
        .is_some_and(|ids| ids.iter().any(|id| id == "projects"))
    {
        let workspace = configuration("lenso.console.workspace.projects/default")?;
        anyhow::ensure!(
            workspace["origin"].is_null(),
            "Member Projects access requires the native Workspace, never a shared external grant"
        );
    }
    let ingress = configuration("lenso.web-ingress/default")?;
    anyhow::ensure!(
        ingress["session_cookie"].is_object(),
        "Session mode requires Web Ingress session_cookie configuration"
    );
    for instance in plan.plugin_instances().iter().filter(|instance| {
        instance
            .instance_key()
            .starts_with("lenso.auth.web-session/")
    }) {
        let web: serde_json::Value = serde_json::from_str(instance.configuration())?;
        anyhow::ensure!(
            web["session_cookie_name"] == ingress["session_cookie"]["name"]
                && web["csrf_cookie_name"] == ingress["session_cookie"]["csrf_cookie_name"]
                && ingress["session_cookie"]["csrf_header_name"] == "x-csrf-token",
            "Auth Web Session and Web Ingress must use matching session and CSRF cookies"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ConsoleConfig, ConsolePluginConfig, console_host_catalog};
    use lenso_app_plan::authoring::{PluginRootInstance, PluginRootSnapshot, resolve_plugin_root};

    #[test]
    fn login_plugins_are_available_but_only_root_selected_instances_are_activated() {
        link();
        crate::link();
        let config: ConsolePluginConfig =
            serde_json::from_str(include_str!("../config.defaults.json")).unwrap();
        let host = console_host_catalog(&ConsoleConfig::from_plugin(&config).unwrap()).unwrap();
        let available: Vec<_> = host
            .plugins()
            .iter()
            .map(|release| release.descriptor().plugin_id())
            .collect();
        for id in [
            "lenso.auth.account",
            "lenso.auth.password",
            "lenso.auth.web-session",
            "lenso.auth.oidc-client",
            "lenso.auth.oauth-flow",
        ] {
            assert!(available.contains(&id), "missing linked Plugin {id}");
        }
        let local = resolve_plugin_root(&host, &PluginRootSnapshot::default()).unwrap();
        assert!(
            local
                .plan()
                .plugin_instances()
                .iter()
                .all(|instance| !instance.instance_key().starts_with("lenso.auth."))
        );
        let root = PluginRootSnapshot::new([], [
            PluginRootInstance::new("lenso.console.web", "default").with_configuration(serde_json::json!({"require_user_session":true,"administrator_subjects":["user-admin"]})),
            PluginRootInstance::new("lenso.auth.account", "default").with_configuration(serde_json::json!({
                "schema":"console_accounts","issuer":"console", "assertion_public_key":"test-public-key",
                "database_url_secret":"auth.database", "assertion_signing_key_secret":"auth.signing", "token_pepper_secret":"auth.pepper", "assertion_ttl_seconds":60
            })),
            PluginRootInstance::new("lenso.auth.password", "default").with_configuration(serde_json::json!({
                "schema":"console_passwords", "database_url_secret":"auth.database", "audience":["lenso.console@1:access"], "session_ttl_seconds":3600,"max_failures":5,"failure_window_seconds":60
            })),
            PluginRootInstance::new("lenso.auth.web-session", "default").with_configuration(serde_json::json!({
                "session_cookie_name":"__Host-lenso-session", "csrf_cookie_name":"__Host-lenso-csrf", "origin":"https://console.example.com"
            })),
            PluginRootInstance::new("lenso.secrets.env", "default").with_configuration(serde_json::json!({"references":{"auth.database":"CONSOLE_DATABASE_URL","auth.signing":"CONSOLE_SIGNING_KEY","auth.pepper":"CONSOLE_TOKEN_PEPPER"}})),
        ], []);
        let configured = resolve_plugin_root(&host, &root).unwrap();
        let plan = configured.plan();
        assert!(
            validate_browser_session(plan).is_err(),
            "missing cookie extraction must fail before startup"
        );
        let mut instances = root.instances().to_vec();
        instances.push(PluginRootInstance::new("lenso.web-ingress", "default").with_configuration(serde_json::json!({"session_cookie":{"name":"__Host-lenso-session","csrf_cookie_name":"__Host-lenso-csrf","csrf_header_name":"x-csrf-token"}})));
        let complete =
            resolve_plugin_root(&host, &PluginRootSnapshot::new([], instances, [])).unwrap();
        validate_browser_session(complete.plan()).unwrap();
        assert!(
            plan.plugin_instances()
                .iter()
                .any(|instance| instance.instance_key() == "lenso.auth.password/default")
        );
        assert!(
            plan.capability_bindings()
                .iter()
                .any(|binding| binding.capability_id() == "lenso.auth@1")
        );
    }
}

#[cfg(test)]
#[path = "auth_plugins_live.rs"]
mod live;
