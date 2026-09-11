//! Real one-process browser authentication acceptance with disposable schemas.
use super::*;
use crate::{ConsoleConfig, ConsolePluginConfig, console_host_catalog, console_registry};
use lenso_app_plan::authoring::{PluginRootInstance, PluginRootSnapshot, resolve_plugin_root};
use lenso_postgres_kit::sqlx::{AssertSqlSafe, Executor, PgPool};
use serde_json::json;

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires LENSO_POSTGRES_TEST_URL and CONSOLE_TEST_SECRET"]
#[allow(clippy::too_many_lines)]
async fn one_process_password_login_authenticates_console_and_logout_revokes_it() {
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
            PluginRootInstance::new("lenso.auth.password", "default").with_configuration(json!({"schema":passwords,"database_url_secret":"database","audience":["lenso.console@1:access"],"session_ttl_seconds":600,"max_failures":5,"failure_window_seconds":60})),
            PluginRootInstance::new("lenso.auth.web-session", "default").with_configuration(json!({"session_cookie_name":"__Host-lenso-session","csrf_cookie_name":"__Host-lenso-csrf","origin":origin})),
            PluginRootInstance::new("lenso.secrets.env", "default").with_configuration(json!({"references":{"database":"LENSO_POSTGRES_TEST_URL","signing":"CONSOLE_TEST_SECRET","pepper":"CONSOLE_TEST_SECRET"}})),
        ], []);
        let resolved = resolve_plugin_root(&host, &root).unwrap();
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
        assert_eq!(client.get(format!("{origin}/api/console/v1/session")).header("cookie", &cookie).send().await.unwrap().status(), 403);
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
        for schema in [accounts, passwords] {
            pool.execute(AssertSqlSafe(format!("DROP SCHEMA \"{schema}\" CASCADE"))).await.unwrap();
        }
        pool.close().await;
        agent.abort();
    }).await;
}
