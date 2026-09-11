//! Real one-process browser authentication acceptance with disposable schemas.
use super::*;
use crate::{ConsoleConfig, ConsolePluginConfig, console_host_catalog, console_registry};
use lenso_app_plan::authoring::{PluginRootInstance, PluginRootSnapshot, resolve_plugin_root};
use lenso_postgres_kit::sqlx::{AssertSqlSafe, Executor, PgPool};
use serde_json::json;

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires LENSO_POSTGRES_TEST_URL and CONSOLE_TEST_SECRET"]
async fn one_process_password_login_authenticates_console_and_logout_revokes_it() {
    verify_browser_session(false).await;
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires LENSO_POSTGRES_TEST_URL and CONSOLE_TEST_SECRET"]
async fn native_projects_reuses_console_identity_without_an_external_service() {
    verify_browser_session(true).await;
}

#[allow(clippy::too_many_lines)]
async fn verify_browser_session(native_projects: bool) {
    tokio::task::LocalSet::new().run_until(async {
        link(); crate::link();
        let url = std::env::var("LENSO_POSTGRES_TEST_URL").unwrap();
        let secret = std::env::var("CONSOLE_TEST_SECRET").unwrap();
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let accounts = format!("console_accounts_{suffix}");
        let passwords = format!("console_passwords_{suffix}");
        lenso_auth_account_plugin::AccountAuthOperator::setup(&url, &accounts).await.unwrap();
        lenso_auth_password_plugin::PasswordAuthOperator::setup(&url, &passwords).await.unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap(); drop(listener);
        let origin = format!("http://{address}");
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("index.html"), "<!doctype html><title>Console</title>").unwrap();
        let mut config: ConsolePluginConfig = serde_json::from_str(include_str!("../config.defaults.json")).unwrap();
        config.web_root = directory.path().to_str().unwrap().to_owned();
        config.agent_home = directory.path().join("agent").to_str().unwrap().to_owned();
        // The Agent is outside this authentication scenario; only its existing
        // readiness probe is stubbed. All Auth and ingress Plugins are real.
        let agent_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        config.console_agent_url = format!("http://{}", agent_listener.local_addr().unwrap());
        let agent = tokio::spawn(async move {
            axum::serve(agent_listener, axum::Router::new().route("/api/console/v1/agent/bootstrap", axum::routing::get(|| async { axum::Json(json!({})) }))).await.unwrap();
        });
        let mut host_config = ConsoleConfig::from_plugin(&config).unwrap();
        host_config.address = address;
        let host = console_host_catalog(&host_config).unwrap();
        let root = PluginRootSnapshot::new([], [
            PluginRootInstance::new("lenso.console.web", "default").with_configuration(json!({"require_user_session":true})),
            PluginRootInstance::new("lenso.web-ingress", "default").with_configuration(json!({"session_cookie":{"name":"__Host-lenso-session","csrf_cookie_name":"__Host-lenso-csrf","csrf_header_name":"x-csrf-token"}})),
            PluginRootInstance::new("lenso.auth.account", "default").with_configuration(json!({"schema":accounts,"issuer":"console-test","assertion_public_key":lenso_auth_account_plugin::assertion_public_key(&secret),"database_url_secret":"database","assertion_signing_key_secret":"signing","token_pepper_secret":"pepper","assertion_ttl_seconds":60})),
            PluginRootInstance::new("lenso.auth.password", "default").with_configuration(json!({"schema":passwords,"database_url_secret":"database","audience":["lenso.console@1:access","lenso.ui.workspace-service@1:invoke","lenso.http.endpoint@1:handle","lenso.projects@1:list_projects"],"session_ttl_seconds":600,"max_failures":5,"failure_window_seconds":60})),
            PluginRootInstance::new("lenso.auth.web-session", "default").with_configuration(json!({"session_cookie_name":"__Host-lenso-session","csrf_cookie_name":"__Host-lenso-csrf","origin":origin})),
            PluginRootInstance::new("lenso.secrets.env", "default").with_configuration(json!({"references":{"database":"LENSO_POSTGRES_TEST_URL","signing":"CONSOLE_TEST_SECRET","pepper":"CONSOLE_TEST_SECRET"}})),
        ], []);
        let root = if native_projects {
            let mut instances = root.instances().to_vec();
            instances.retain(|instance| instance.id().plugin_id() != "lenso.console.web");
            instances.push(PluginRootInstance::new("lenso.console.web", "default").with_configuration(json!({"require_user_session":true,"member_workspace_ids":["projects"]})));
            for (plugin, configuration) in native_configuration(&url, &suffix, &secret).await {
                instances.push(PluginRootInstance::new(plugin, "default").with_configuration(configuration));
            }
            PluginRootSnapshot::new([], instances, [])
        } else { root };
        let selected = resolve_plugin_root(&host, &root).unwrap();
        let host = crate::http_admission_catalog(host, selected.plan()).unwrap();
        let resolved = resolve_plugin_root(&host, &root).unwrap();
        assert_eq!(selected.plan().capability_bindings().len(), resolved.plan().capability_bindings().len());
        validate_browser_session(resolved.plan()).unwrap();
        let app = lenso_kernel::Kernel::start_native(resolved.plan().clone(), lenso_runner::TokioDriver::new(), console_registry()).await.unwrap();
        let client = reqwest::Client::new();
        let methods = client.get(format!("{origin}/auth/methods")).send().await.unwrap();
        assert_eq!(methods.status(), 200);
        let methods: serde_json::Value = methods.json().await.unwrap();
        assert_eq!(methods["methods"].as_array().unwrap().len(), 1);
        assert_eq!(methods["methods"][0]["kind"], "password");
        assert_eq!(client.get(format!("{origin}/api/console/v1/session")).send().await.unwrap().status(), 401);
        let password = app.handle::<lenso_capability_password_auth::PasswordRegister>("lenso.auth.web-session/default").unwrap();
        let registered = password.invoke(lenso_capability_password_auth::REGISTER_OPERATION, lenso_capability_password_auth::RegisterRequest {identifier:"alice@example.test".into(),password:"A-strong-test-password-2026".into()}).await.unwrap().unwrap();
        let login = client.post(format!("{origin}/auth/password/login")).header("origin", &origin).json(&json!({"identifier":"alice@example.test","password":"A-strong-test-password-2026"})).send().await.unwrap();
        assert_eq!(login.status(), 204);
        let cookies: Vec<_> = login.headers().get_all("set-cookie").iter().map(|value| value.to_str().unwrap().split(';').next().unwrap().to_owned()).collect();
        assert_eq!(cookies.len(), 2);
        let cookie = cookies.join("; ");
        let csrf = cookies.iter().find_map(|value| value.strip_prefix("__Host-lenso-csrf=")).unwrap();
        // A real authenticated member is distinguished from an absent session,
        // but cannot inherit the shared Console's administrator authority.
        assert_eq!(client.get(format!("{origin}/api/console/v1/session")).header("cookie", &cookie).send().await.unwrap().status(), if native_projects {200} else {403});
        if native_projects {
            let catalog: serde_json::Value = client.get(format!("{origin}/api/console/v1/pages")).header("cookie", &cookie).send().await.unwrap().json().await.unwrap();
            assert_eq!(catalog["mounts"].as_array().unwrap().len(), 1);
            assert_eq!(catalog["mounts"][0]["id"], "projects");
            assert_eq!(client.get(format!("{origin}/api/console/v1/agent/bootstrap")).header("cookie", &cookie).send().await.unwrap().status(), 403);
            let endpoint = format!("{origin}/api/console/v1/pages/projects/services/projects/invoke");
            let response = client.post(format!("{endpoint}/connection_status")).header("cookie", &cookie).header("x-csrf-token", csrf).json(&json!({})).send().await.unwrap();
            assert_eq!(response.status(), 200);
            let connection: serde_json::Value = response.json().await.unwrap();
            assert_eq!(connection["mode"], "console");
            assert_eq!(connection["subject"], registered.subject);
            assert_eq!(connection["connected"], true);
            let workspaces: serde_json::Value = client.post(format!("{endpoint}/list_workspaces")).header("cookie", &cookie).header("x-csrf-token", csrf).json(&json!({})).send().await.unwrap().json().await.unwrap();
            assert_eq!(workspaces["status"], 200, "{workspaces}");
            let denied: serde_json::Value = client.post(format!("{endpoint}/list_projects")).header("cookie", &cookie).header("x-csrf-token", csrf).json(&json!({"organization_id":"someone-elses-organization"})).send().await.unwrap().json().await.unwrap();
            assert_eq!(denied["status"], 403, "{denied}");
            let bob = password.invoke(lenso_capability_password_auth::REGISTER_OPERATION, lenso_capability_password_auth::RegisterRequest {identifier:"bob@example.test".into(),password:"Another-strong-test-password-2026".into()}).await.unwrap().unwrap();
            let login = client.post(format!("{origin}/auth/password/login")).header("origin", &origin).json(&json!({"identifier":"bob@example.test","password":"Another-strong-test-password-2026"})).send().await.unwrap();
            assert_eq!(login.status(), 204);
            let cookies: Vec<_> = login.headers().get_all("set-cookie").iter().map(|value| value.to_str().unwrap().split(';').next().unwrap().to_owned()).collect();
            let bob_csrf = cookies.iter().find_map(|value| value.strip_prefix("__Host-lenso-csrf=")).unwrap();
            let bob_connection: serde_json::Value = client.post(format!("{endpoint}/connection_status")).header("cookie", cookies.join("; ")).header("x-csrf-token", bob_csrf).json(&json!({})).send().await.unwrap().json().await.unwrap();
            assert_eq!(bob_connection["subject"], bob.subject);
            assert_ne!(bob_connection["subject"], registered.subject);
            let alice_again: serde_json::Value = client.post(format!("{endpoint}/connection_status")).header("cookie", &cookie).header("x-csrf-token", csrf).json(&json!({})).send().await.unwrap().json().await.unwrap();
            assert_eq!(alice_again["subject"], registered.subject);

        }
        assert_eq!(app.shutdown(std::time::Duration::from_secs(3)).await, lenso_kernel::ShutdownOutcome::Clean);
        let instances = root.instances().iter().map(|instance| {
            if instance.id().plugin_id() == "lenso.console.web" {
                PluginRootInstance::new("lenso.console.web", "default").with_configuration(json!({"require_user_session":true,"administrator_subjects":[registered.subject]}))
            } else { instance.clone() }
        });
        let administrator = resolve_plugin_root(&host, &PluginRootSnapshot::new([], instances, [])).unwrap();
        let app = lenso_kernel::Kernel::start_native(administrator.plan().clone(), lenso_runner::TokioDriver::new(), console_registry()).await.unwrap();
        let restored = client.get(format!("{origin}/api/console/v1/session")).header("cookie", &cookie).send().await.unwrap();
        assert_eq!(restored.status(), 200);
        let restored: serde_json::Value = restored.json().await.unwrap();
        assert_eq!(restored["subject"], registered.subject);
        let logout = client.post(format!("{origin}/auth/logout")).header("cookie", &cookie).header("x-csrf-token", csrf).send().await.unwrap();
        assert_eq!(logout.status(), 204);
        assert_eq!(client.get(format!("{origin}/api/console/v1/session")).header("cookie", &cookie).send().await.unwrap().status(), 401);
        assert!(!registered.subject.is_empty());
        assert_eq!(app.shutdown(std::time::Duration::from_secs(3)).await, lenso_kernel::ShutdownOutcome::Clean);
        let pool = PgPool::connect(&url).await.unwrap();
        let mut schemas = vec![accounts, passwords];
        if native_projects { schemas.extend([format!("console_org_{suffix}"), format!("console_access_{suffix}"), format!("console_projects_{suffix}")]); }
        for schema in schemas {
            pool.execute(AssertSqlSafe(format!("DROP SCHEMA \"{schema}\" CASCADE"))).await.unwrap();
        }
        pool.close().await;
        agent.abort();
    }).await;
}

async fn native_configuration(
    url: &str,
    suffix: &str,
    secret: &str,
) -> Vec<(&'static str, serde_json::Value)> {
    let organization = format!("console_org_{suffix}");
    let access = format!("console_access_{suffix}");
    let projects = format!("console_projects_{suffix}");
    lenso_organization_postgres_plugin::OrganizationOperator::setup(url, &organization)
        .await
        .unwrap();
    lenso_access_control_postgres_plugin::AccessControlOperator::setup(url, &access)
        .await
        .unwrap();
    lenso_projects_postgres_plugin::ProjectsOperator::setup(url, &projects)
        .await
        .unwrap();
    let key = lenso_auth_account_plugin::assertion_public_key(secret);
    vec![
        ("lenso.console.workspace.projects", json!({})),
        (
            "lenso.projects.web",
            json!({"invocation_auth_issuer":"console-test","invocation_auth_public_key":key}),
        ),
        (
            "lenso.organization.postgres",
            json!({"schema":organization,"database_url_secret":"database","admin_callers":["provisioning"],"directory_callers":["lenso.projects.web/default"],"membership_admin_callers":["lenso.projects.web/default"]}),
        ),
        (
            "lenso.access-control.postgres",
            json!({"schema":access,"database_url_secret":"database","auth_issuer":"console-test","auth_assertion_public_key":key,"bootstrap_callers":["provisioning"]}),
        ),
        (
            "lenso.projects.postgres",
            json!({"schema":projects,"database_url_secret":"database","auth_issuer":"console-test","auth_assertion_public_key":key,"project_callers":["lenso.projects.web/default"],"admin_callers":["lenso.projects.web/default"],"governance_callers":["provisioning"]}),
        ),
    ]
}
