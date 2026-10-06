//! Real Account/Password credentials and storage, through the ordinary HTTP Host.
use super::*;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use lenso_app_plan::CapabilityRequirementPlan;
use lenso_app_plan::authoring::{PluginDescriptor, PluginRootInstance};
use lenso_auth_sdk::{AuthOutcome, credential::CredentialBinding, decode_auth_response};
use lenso_capability_access_control_admin as access_admin;
use lenso_capability_auth as auth;
use lenso_capability_password_auth as password;
use lenso_kernel::{CancellationToken, InvocationContext, Kernel, NativeApp, ShutdownOutcome};
use lenso_native_adapter::{NativePluginFactory, NativePluginFactoryContext, NativePluginInstance};
use lenso_runner::TokioDriver;
use serde_json::{Value, json};
use std::time::Duration;

const PROVISION: &str = "security.auth-provisioning/default";
const ACCOUNT_UI: &str = "lenso.auth.account.console/default";
const COOKIE: &str = "__Host-lenso-session";
const CSRF: &str = "__Host-lenso-csrf";
const ISSUER: &str = "ordinary-auth-test";
const PASSWORD: &str = "Disposable-auth-test-password-123!";

#[derive(Debug)]
struct TestDiagnostics;
impl lenso_web_ingress_plugin::WebIngressDiagnostics for TestDiagnostics {
    fn endpoint_runtime_failure(
        &self,
        event: lenso_web_ingress_plugin::WebIngressEndpointFailure<'_>,
    ) {
        eprintln!(
            "Auth fixture route {} runtime failure: {:?}",
            event.route_id(),
            event.failure()
        );
    }
}

fn allowed_origin() -> String {
    std::env::var("LENSO_SECURITY_TEST_ALLOWED_ORIGIN")
        .unwrap_or_else(|_| "https://app.example".into())
}

#[derive(Clone, Debug)]
struct Provisioning;
impl NativePluginFactory for Provisioning {
    fn package_id(&self) -> &'static str {
        "security.auth-provisioning"
    }
    fn package_version(&self) -> &'static str {
        "1.0.0"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, lenso_kernel::RuntimeFailure> {
        Ok(NativePluginInstance::default())
    }
}

fn catalog() -> HostCatalog {
    let base = host_catalog("127.0.0.1:0".parse().unwrap()).unwrap();
    let mut releases = base.plugins().to_vec();
    releases.push(HostPluginRelease::new(
        PluginDescriptor::new("security.auth-provisioning", "1.0.0", "web")
            .with_requirement(CapabilityRequirementPlan::one(
                password::CAPABILITY_ID,
                password::DESCRIPTOR_VERSION,
            ))
            .with_requirement(CapabilityRequirementPlan::one(
                auth::CAPABILITY_ID,
                auth::DESCRIPTOR_VERSION,
            ))
            .with_requirement(CapabilityRequirementPlan::one(
                access_admin::CAPABILITY_ID,
                access_admin::DESCRIPTOR_VERSION,
            )),
    ));
    HostCatalog::new(base.slots().to_vec(), releases, base.defaults().to_vec())
        .with_bindings(base.bindings().iter().cloned())
}

fn root(shell: &str, public_key: &str, administrators: &[String], ui: bool) -> PluginRootSnapshot {
    let mut entries = vec![
        PluginRootInstance::new("security.auth-provisioning", "default"),
        PluginRootInstance::new("lenso.auth.account", "default").with_configuration(json!({
            "schema":"security_auth_accounts", "issuer":ISSUER, "assertion_public_key":public_key,
            "database_url_secret":"security.database", "assertion_signing_key_secret":"security.signing", "token_pepper_secret":"security.pepper",
            "assertion_ttl_seconds":60, "admin_callers":[ACCOUNT_UI], "credential_state_callers":[ACCOUNT_UI],
            "management_session_ceiling":{"deployment":"ordinary-test","permissions":["auth.subject.read","auth.session.read","auth.subject.status","auth.session.revoke"],"resource_scopes":[{"kind":"app","id":"alpha"}]},
            "managed_sessions":{"policy":{"idle_timeout_seconds":120,"absolute_timeout_seconds":300,"renew_interval_seconds":1},
                "issue_callers":["lenso.auth.password/default"],"renew_callers":["lenso.auth.session-renewal/default"]}
        })),
        PluginRootInstance::new("lenso.auth.password", "default").with_configuration(json!({
            "schema":"security_auth_passwords", "database_url_secret":"security.database", "managed_sessions":true,
            "audience":["lenso.console@1:access","lenso.http.endpoint@1:handle","lenso.ui.workspace-service@1:invoke",
                "lenso.access-control@1:check_permission", "lenso.access-control-directory@1:list_roles", "lenso.access-control-directory@1:list_subject_roles",
                "lenso.audit-log@1:list_events", "lenso.access-control-admin@1:create_role", "lenso.access-control-admin@1:set_role_permissions", "lenso.access-control-admin@1:assign_role"],
            "session_ttl_seconds":3600,"max_failures":5,"failure_window_seconds":60
        })),
        PluginRootInstance::new("lenso.access-control.postgres", "default").with_configuration(json!({
            "schema":"security_auth_access", "database_url_secret":"security.database", "auth_issuer":ISSUER,"auth_assertion_public_key":public_key,
            "bootstrap_callers":[PROVISION],"directory_callers":["lenso.access-control.console/alpha","lenso.access-control.console/beta"]
        })),
        PluginRootInstance::new("lenso.audit-log.postgres", "default").with_configuration(json!({
            "database_url_secret":"security.database", "writer_instances":[PROVISION], "reader_instances":["lenso.audit-log.console/alpha","lenso.audit-log.console/beta"],
            "reader_scopes":{"lenso.audit-log.console/alpha":[{"kind":"app","id":"alpha"}],"lenso.audit-log.console/beta":[{"kind":"app","id":"beta"}]}
        })),
        PluginRootInstance::new("lenso.secrets.env", "default").with_configuration(json!({"references":{
            "security.database":"LENSO_SECURITY_TEST_DATABASE_URL", "security.signing":"LENSO_SECURITY_TEST_SIGNING_KEY", "security.pepper":"LENSO_SECURITY_TEST_TOKEN_PEPPER"
        }})),
    ];
    if ui {
        entries.extend([
            PluginRootInstance::new("lenso.console.web", "console").with_configuration(json!({"web_root":shell,"administrator_subjects":administrators,
                "workspace_mounts":[
                    {"instance":"lenso.access-control.console/alpha","workspace":"roles","path":"/access/alpha"},
                    {"instance":"lenso.access-control.console/beta","workspace":"roles","path":"/access/beta"},
                    {"instance":"lenso.audit-log.console/alpha","workspace":"audit-events","path":"/audit/alpha"},
                    {"instance":"lenso.audit-log.console/beta","workspace":"audit-events","path":"/audit/beta"},
                    {"instance":ACCOUNT_UI,"workspace":"accounts","path":"/accounts"}
                ]})),
            PluginRootInstance::new("lenso.web-ingress", "native").with_configuration(json!({"session_cookie":{"name":COOKIE,"csrf_cookie_name":CSRF,"csrf_header_name":"x-csrf-token"}})),
            PluginRootInstance::new("lenso.auth.password-web-session", "default").with_configuration(json!({"allowed_origin":allowed_origin(),"session_cookie_name":COOKIE,"csrf_cookie_name":CSRF})),
            PluginRootInstance::new("lenso.auth.session-renewal", "default").with_configuration(json!({"allowed_origin":allowed_origin(),"session_cookie_name":COOKIE,"csrf_cookie_name":CSRF})),
            PluginRootInstance::new("lenso.auth.session-console", "default").with_configuration(json!({"session_cookie_name":COOKIE,"csrf_cookie_name":CSRF})),
            PluginRootInstance::new("lenso.auth.account.console", "default").with_configuration(json!({
                "issuer":ISSUER,"public_key":public_key,"assertion_max_ttl_seconds":60,"caller_instances":[CONSOLE_INSTANCE],
                "deployment":"ordinary-test","access_scope":{"kind":"app","id":"alpha"},"account_instance":"lenso.auth.account/default",
                "allowed_mutations":["set_subject_status","revoke_session"]
            })),
        ]);
        for scope in ["alpha", "beta"] {
            let common = json!({"issuer":ISSUER,"public_key":public_key,"assertion_max_ttl_seconds":60,"caller_instances":[CONSOLE_INSTANCE]});
            let mut roles = common.clone();
            roles["scope"] = json!({"kind":"app","id":scope});
            entries.push(
                PluginRootInstance::new("lenso.access-control.console", scope)
                    .with_configuration(roles),
            );
            let mut audit = common;
            audit["access_scope"] = json!({"kind":"app","id":scope});
            audit["audit_scope"] = json!({"module":"ordinary-app","type":"app","id":scope});
            entries.push(
                PluginRootInstance::new("lenso.audit-log.console", scope).with_configuration(audit),
            );
        }
    }
    PluginRootSnapshot::new(
        [],
        entries,
        if ui {
            vec![]
        } else {
            vec![PluginInstanceId::new("lenso.console.web", "console")]
        },
    )
}

async fn start(
    catalog: &HostCatalog,
    root: &PluginRootSnapshot,
    ingress: WebIngressFactory,
) -> NativeApp {
    let plan = resolve(catalog, root).unwrap();
    validate_session_transport(&plan).unwrap();
    Kernel::start_native(
        plan,
        TokioDriver::new(),
        registry(ingress).with_factory(Provisioning),
    )
    .await
    .unwrap()
}

async fn assertion(app: &NativeApp, credential: &str) -> lenso_auth_sdk::ActorAssertion {
    let response = app
        .handle::<auth::Auth>(PROVISION)
        .unwrap()
        .invoke(
            auth::AUTHENTICATE_OPERATION,
            auth::AuthRequest {
                credential: Some(auth::AuthenticateRequestCredential {
                    scheme: "session".into(),
                    value: credential.into(),
                }),
            },
        )
        .await
        .unwrap()
        .unwrap();
    let AuthOutcome::Authenticated(assertion) = decode_auth_response(response).unwrap() else {
        panic!("real Account assertion required")
    };
    assertion
}

async fn actor_context(app: &NativeApp, credential: &str) -> InvocationContext {
    assertion(app, credential)
        .await
        .attach(InvocationContext::new(1, None, CancellationToken::new()))
        .unwrap()
}

async fn provision(app: &NativeApp) -> Vec<String> {
    let mut registered = Vec::new();
    for name in ["alice", "bob", "member"] {
        let registered_session = app
            .handle::<password::PasswordRegister>(PROVISION)
            .unwrap()
            .invoke(
                password::REGISTER_OPERATION,
                password::RegisterRequest {
                    identifier: format!("{name}@ordinary.example"),
                    password: PASSWORD.into(),
                },
            )
            .await
            .unwrap()
            .unwrap();
        registered.push(registered_session);
    }
    for (scope, session) in [("alpha", &registered[0]), ("beta", &registered[1])] {
        let target = json!({"kind":"app","id":scope});
        app.handle::<access_admin::AccessControlAdminBootstrapScope>(PROVISION)
            .unwrap()
            .invoke(
                access_admin::BOOTSTRAP_SCOPE_OPERATION,
                serde_json::from_value(json!({"scope":target,"subject":session.subject})).unwrap(),
            )
            .await
            .unwrap()
            .unwrap();
        app.handle::<access_admin::AccessControlAdminCreateRole>(PROVISION).unwrap().invoke_with_context(access_admin::CREATE_ROLE_OPERATION,actor_context(app,&session.credential).await,
            serde_json::from_value(json!({"scope":target,"role_id":"security-management","name":"Explicit test management"})).unwrap()).await.unwrap().unwrap();
        app.handle::<access_admin::AccessControlAdminSetRolePermissions>(PROVISION).unwrap().invoke_with_context(access_admin::SET_ROLE_PERMISSIONS_OPERATION,actor_context(app,&session.credential).await,
            serde_json::from_value(json!({"scope":target,"role_id":"security-management","permissions":["auth.subject.read","auth.session.read","auth.subject.status","auth.session.revoke","access.roles.read","audit.events.read"]})).unwrap()).await.unwrap().unwrap();
        app.handle::<access_admin::AccessControlAdminAssignRole>(PROVISION).unwrap().invoke_with_context(access_admin::ASSIGN_ROLE_OPERATION,actor_context(app,&session.credential).await,
            serde_json::from_value(json!({"scope":target,"role_id":"security-management","subject":session.subject})).unwrap()).await.unwrap().unwrap();
    }
    registered
        .into_iter()
        .map(|session| session.subject)
        .collect()
}

// Credentials deliberately have no Debug implementation and never enter assertion messages.
struct Cookies {
    session: String,
    csrf: String,
}
impl Cookies {
    fn header(&self) -> String {
        format!("{COOKIE}={}; {CSRF}={}", self.session, self.csrf)
    }
    fn from_response(response: &reqwest::Response) -> Self {
        let cookies = response
            .headers()
            .get_all("set-cookie")
            .iter()
            .map(|value| value.to_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(cookies.len(), 2);
        let value = |name: &str| {
            cookies
                .iter()
                .find_map(|cookie| {
                    cookie
                        .strip_prefix(&format!("{name}="))
                        .map(|tail| tail.split(';').next().unwrap().to_owned())
                })
                .unwrap()
        };
        for cookie in &cookies {
            assert!(cookie.contains("; Secure"));
            assert!(cookie.contains("SameSite=Lax"));
        }
        assert!(
            cookies
                .iter()
                .find(|cookie| cookie.starts_with(&format!("{COOKIE}=")))
                .unwrap()
                .contains("HttpOnly")
        );
        Self {
            session: value(COOKIE),
            csrf: value(CSRF),
        }
    }
}

fn no_cookie(response: &reqwest::Response, status: u16) {
    assert_eq!(response.status().as_u16(), status);
    assert_eq!(response.headers().get_all("set-cookie").iter().count(), 0);
}
async fn login(client: &reqwest::Client, origin: &str, name: &str) -> Cookies {
    let response = client
        .post(format!("{origin}/auth/password/login"))
        .header("origin", allowed_origin())
        .json(&json!({"identifier":format!("{name}@ordinary.example"),"password":PASSWORD}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let cookies = Cookies::from_response(&response);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["authenticated"], true);
    assert!(body.get("credential").is_none());
    assert!(!body.to_string().contains(&cookies.session));
    cookies
}
async fn invoke(
    client: &reqwest::Client,
    origin: &str,
    page: &Value,
    cookies: &Cookies,
    service: &str,
    operation: &str,
    input: Value,
) -> reqwest::Response {
    client
        .post(format!(
            "{origin}/api/console/v1/pages/{}/services/{service}/invoke/{operation}",
            page["id"].as_str().unwrap()
        ))
        .header("cookie", cookies.header())
        .header("origin", allowed_origin())
        .header("x-csrf-token", &cookies.csrf)
        .header(
            "x-lenso-page-owner",
            page["owner"]["instance"].as_str().unwrap(),
        )
        .header("x-lenso-page-revision", page["revision"].as_str().unwrap())
        .header(
            "x-lenso-page-implementation",
            page["implementationId"].as_str().unwrap(),
        )
        .json(&input)
        .send()
        .await
        .unwrap()
}
async fn whoami(client: &reqwest::Client, origin: &str, cookies: &Cookies) -> reqwest::Response {
    client
        .get(format!("{origin}/api/console/v1/session"))
        .header("cookie", cookies.header())
        .send()
        .await
        .unwrap()
}
async fn session_state(
    client: &reqwest::Client,
    origin: &str,
    cookies: &Cookies,
) -> reqwest::Response {
    client
        .get(format!("{origin}/auth/session/state"))
        .header("cookie", cookies.header())
        .header("origin", allowed_origin())
        .send()
        .await
        .unwrap()
}
async fn session_id(app: &NativeApp, cookies: &Cookies) -> String {
    CredentialBinding::from_assertion(&assertion(app, &cookies.session).await)
        .unwrap()
        .session_id
}

// Optional bounded pause for a human/real-browser pass against this same
// disposable app. The file contains only public listening/subject information.
async fn browser_ready(origin: &str, subjects: &[String]) {
    let Some(path) = std::env::var_os("LENSO_SECURITY_BROWSER_READY_FILE") else {
        return;
    };
    let path = std::path::PathBuf::from(path);
    let mut done = path.as_os_str().to_owned();
    done.push(".done");
    let done = std::path::PathBuf::from(done);
    assert!(!done.exists(), "use a fresh browser completion marker");
    std::fs::write(
        &path,
        serde_json::to_vec(&json!({"origin":origin,"subjects":subjects})).unwrap(),
    )
    .unwrap();
    let started = std::time::Instant::now();
    while !done.exists() {
        assert!(
            started.elapsed() < Duration::from_secs(120),
            "browser fixture completion timed out"
        );
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

// First-slice fixtures cannot expose real credential issuance/rotation, durable
// revocation or an Account workspace trusting a stale management credential.
#[tokio::test(flavor = "current_thread")]
#[ignore = "requires a disposable database and generated test-only signing/pepper env secrets"]
async fn postgres_auth_login_management_rotation_and_durable_revocation() {
    tokio::task::LocalSet::new().run_until(Box::pin(async {
        let database = std::env::var("LENSO_SECURITY_TEST_DATABASE_URL").expect("disposable database required");
        assert!(database.rsplit('/').next().unwrap().starts_with("lenso_security_test"),"refuse a non-test database");
        let signing = std::env::var("LENSO_SECURITY_TEST_SIGNING_KEY").expect("generated test-only signing secret required");
        let pepper = std::env::var("LENSO_SECURITY_TEST_TOKEN_PEPPER").expect("generated test-only pepper required");
        assert!(signing.len()>=32 && pepper.len()>=32 && signing!=pepper,"independent generated test secrets required");
        let public_key = lenso_auth_account_plugin::assertion_public_key(&signing);
        lenso_auth_account_plugin::AccountAuthOperator::setup_managed(&database,"security_auth_accounts").await.unwrap();
        lenso_auth_password_plugin::PasswordAuthOperator::setup(&database,"security_auth_passwords").await.unwrap();
        lenso_access_control_postgres_plugin::AccessControlOperator::setup(&database,"security_auth_access").await.unwrap();
        lenso_audit_log_postgres_plugin::AuditLogOperator::setup(&database).await.unwrap();
        let temporary_shell = tempfile::tempdir().unwrap();
        let shell_path = if let Some(path) = std::env::var_os("LENSO_SECURITY_TEST_SHELL_ROOT") {
            let path = std::path::PathBuf::from(path);
            assert!(path.is_absolute() && path.join("index.html").is_file(), "built Shell root must be an absolute existing directory");
            path
        } else {
            std::fs::write(temporary_shell.path().join("index.html"),"<!doctype html><title>Auth integration fixture</title>").unwrap();
            temporary_shell.path().to_owned()
        };
        let shell = shell_path.to_str().unwrap();
        let catalog = catalog();
        let setup = start(&catalog,&root(shell,&public_key,&[],false),WebIngressFactory::new()).await;
        let subjects = provision(&setup).await;
        assert_eq!(setup.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean);
        // No setup, issuance or grants occur during this UI startup.
        let ingress = WebIngressFactory::new().with_diagnostics(TestDiagnostics);
        let app = start(&catalog,&root(shell,&public_key,&subjects[..2],true),ingress.clone()).await;
        let origin = format!("http://{}",ingress.local_address().unwrap());
        let client = reqwest::Client::new();
        // Exercise real Ingress response headers before handing the fixture to
        // a browser; isolated adapter tests cannot catch duplicate host headers.
        let page = client.get(format!("{origin}/auth/login")).send().await.unwrap();
        no_cookie(&page,200);
        assert_eq!(page.headers()["content-type"],"text/html; charset=utf-8");
        assert!(page.text().await.unwrap().contains("<form"));
        let asset = client.get(format!("{origin}/auth/login/assets.js")).send().await.unwrap();
        no_cookie(&asset,200);
        assert_eq!(asset.headers()["content-type"],"text/javascript; charset=utf-8");
        assert!(!asset.bytes().await.unwrap().is_empty());
        let methods = client.get(format!("{origin}/auth/methods")).send().await.unwrap();
        no_cookie(&methods,200);
        let methods:Value = methods.json().await.unwrap();
        assert_eq!(methods["csrf"]["cookie_name"],CSRF);
        assert_eq!(methods["csrf"]["header_name"],"x-csrf-token");
        assert_eq!(methods["methods"][0]["action"],"/auth/password/login");
        browser_ready(&origin,&subjects).await;
        let wrong_origin = client.post(format!("{origin}/auth/password/login")).header("origin","https://attacker.example")
            .json(&json!({"identifier":"alice@ordinary.example","password":PASSWORD})).send().await.unwrap();
        no_cookie(&wrong_origin,403);
        let wrong_password = client.post(format!("{origin}/auth/password/login")).header("origin",allowed_origin())
            .json(&json!({"identifier":"alice@ordinary.example","password":"incorrect"})).send().await.unwrap();
        no_cookie(&wrong_password,401);
        let alice = login(&client,&origin,"alice").await;
        let bob = login(&client,&origin,"bob").await;
        let member = login(&client,&origin,"member").await;
        let identity:Value = whoami(&client,&origin,&alice).await.json().await.unwrap();
        assert_eq!(identity["subject"],subjects[0]);
        let overwrite = client.post(format!("{origin}/auth/password/login")).header("origin",allowed_origin()).header("cookie",alice.header()).header("x-csrf-token",&alice.csrf)
            .json(&json!({"identifier":"bob@ordinary.example","password":PASSWORD})).send().await.unwrap();
        no_cookie(&overwrite,409);
        let pages:Value = client.get(format!("{origin}/api/console/v1/pages")).header("cookie",alice.header()).send().await.unwrap().json().await.unwrap();
        let mounts = pages["mounts"].as_array().unwrap();
        assert_eq!(mounts.len(),5);
        let mount = |instance:&str| mounts.iter().find(|page|page["owner"]["instance"]==instance).unwrap().clone();
        let accounts = mount(ACCOUNT_UI);
        for (instance,path) in [("lenso.access-control.console/alpha","/access/alpha/"),("lenso.access-control.console/beta","/access/beta/"),
            ("lenso.audit-log.console/alpha","/audit/alpha/"),("lenso.audit-log.console/beta","/audit/beta/")] { assert_eq!(mount(instance)["basePath"],path); }
        for (instance,cookies) in [("lenso.access-control.console/alpha",&alice),("lenso.access-control.console/beta",&bob)] {
            assert_eq!(invoke(&client,&origin,&mount(instance),cookies,"access-directory","list_roles",json!({"limit":1,"cursor":null})).await.status(),200);
        }
        assert_eq!(invoke(&client,&origin,&mount("lenso.audit-log.console/alpha"),&alice,"audit-events","list_events",json!({"limit":1,"cursor":null})).await.status(),200);
        assert_eq!(invoke(&client,&origin,&mount("lenso.audit-log.console/beta"),&alice,"audit-events","list_events",json!({"limit":1,"cursor":null})).await.status(),422);
        let first = invoke(&client,&origin,&accounts,&alice,"account-admin","list_subjects",json!({"limit":1,"cursor":null})).await;
        assert_eq!(first.status(),200); let first:Value = first.json().await.unwrap();
        assert_eq!(first["subjects"].as_array().unwrap().len(),1); assert!(first["next_cursor"].is_string());
        let second = invoke(&client,&origin,&accounts,&alice,"account-admin","list_subjects",json!({"limit":1,"cursor":first["next_cursor"]})).await;
        assert_eq!(second.status(),200); let second:Value = second.json().await.unwrap();
        assert_ne!(first["subjects"][0]["subject"],second["subjects"][0]["subject"]);
        let first_session = invoke(&client,&origin,&accounts,&alice,"account-admin","list_sessions",json!({"subject":subjects[0],"limit":1,"cursor":null})).await;
        assert_eq!(first_session.status(),200); let first_session:Value = first_session.json().await.unwrap();
        assert!(first_session["next_cursor"].is_string());
        let second_session = invoke(&client,&origin,&accounts,&alice,"account-admin","list_sessions",json!({"subject":subjects[0],"limit":1,"cursor":first_session["next_cursor"]})).await;
        assert_eq!(second_session.status(),200); let second_session:Value = second_session.json().await.unwrap();
        assert_ne!(first_session["sessions"][0]["session_id"],second_session["sessions"][0]["session_id"]);
        assert_eq!(invoke(&client,&origin,&accounts,&member,"account-admin","list_subjects",json!({"limit":1,"cursor":null})).await.status(),403);
        assert_eq!(invoke(&client,&origin,&accounts,&bob,"account-admin","list_subjects",json!({"limit":1,"cursor":null})).await.status(),422);
        assert_eq!(invoke(&client,&origin,&accounts,&alice,"account-admin","revoke_session",json!({"session_id":session_id(&app,&member).await,"confirmed":false})).await.status(),422);
        let member_state = session_state(&client,&origin,&member).await;
        no_cookie(&member_state,200);
        assert_eq!(member_state.json::<Value>().await.unwrap()["authenticated"],true);
        let revoked = invoke(&client,&origin,&accounts,&alice,"account-admin","revoke_session",json!({"session_id":session_id(&app,&member).await,"confirmed":true})).await;
        assert_eq!(revoked.status(),200); assert_eq!(revoked.json::<Value>().await.unwrap()["changed"],true);
        no_cookie(&session_state(&client,&origin,&member).await,401);
        for status in ["disabled","active"] {
            let changed = invoke(&client,&origin,&accounts,&alice,"account-admin","set_subject_status",json!({"subject":subjects[1],"status":status,"reason":null,"disabled_until":null,"confirmed":true})).await;
            assert_eq!(changed.status(),200); assert_eq!(changed.json::<Value>().await.unwrap()["changed"],true);
            no_cookie(&whoami(&client,&origin,&bob).await,401);
        }
        assert_eq!(whoami(&client,&origin,&login(&client,&origin,"bob").await).await.status(),200);
        let selected_origin = allowed_origin();
        for (origin_header,csrf_header) in [(selected_origin.as_str(),None),(selected_origin.as_str(),Some("wrong")),("https://attacker.example",Some(alice.csrf.as_str()))] {
            let mut request = client.post(format!("{origin}/auth/session/renew")).header("cookie",alice.header()).header("origin",origin_header);
            if let Some(header) = csrf_header { request=request.header("x-csrf-token",header); }
            no_cookie(&request.send().await.unwrap(),403);
        }
        tokio::time::sleep(Duration::from_millis(1100)).await;
        let renew = || client.post(format!("{origin}/auth/session/renew")).header("cookie",alice.header()).header("origin",allowed_origin()).header("x-csrf-token",&alice.csrf).send();
        let (one,two) = futures::join!(renew(),renew()); let (one,two)=(one.unwrap(),two.unwrap());
        assert_ne!(one.status()==200,two.status()==200,"exactly one concurrent renewal must succeed");
        let (winner,loser) = if one.status()==200 {(one,two)} else {(two,one)};
        assert_eq!(winner.status(),200);
        // The unchanged HTTP provider has bounded aggregate admission. A
        // competing request may be rejected there before Account classifies it.
        let rejected = loser.status().as_u16();
        assert!(matches!(rejected,409|503));
        no_cookie(&loser,rejected);
        if rejected==409 { assert_eq!(loser.json::<Value>().await.unwrap()["code"],"stale_credential"); }
        // Serial replay reaches Account and must deterministically classify the
        // old credential as stale, independently of concurrent HTTP admission.
        let stale=renew().await.unwrap(); no_cookie(&stale,409);
        assert_eq!(stale.json::<Value>().await.unwrap()["code"],"stale_credential");
        let current = Cookies::from_response(&winner);
        assert!(current.session!=alice.session);
        let metadata:Value=winner.json().await.unwrap(); assert!(!metadata.to_string().contains(&current.session));
        let state=client.get(format!("{origin}/auth/session/state")).header("cookie",current.header()).header("origin",allowed_origin()).send().await.unwrap();
        no_cookie(&state,200); assert_eq!(state.json::<Value>().await.unwrap()["authenticated"],true);
        no_cookie(&whoami(&client,&origin,&alice).await,401);
        assert_eq!(invoke(&client,&origin,&accounts,&current,"account-admin","list_subjects",json!({"limit":1,"cursor":null})).await.status(),200);
        // A historical, CSRF-admitted credential may revoke its same current
        // session through the issuer; it must never regain Auth admission.
        let logout=client.post(format!("{origin}/auth/logout")).header("cookie",alice.header()).header("origin",allowed_origin()).header("x-csrf-token",&alice.csrf).send().await.unwrap();
        assert_eq!(logout.status(),204); assert_eq!(logout.headers().get_all("set-cookie").iter().count(),2);
        for value in logout.headers().get_all("set-cookie") { assert!(value.to_str().unwrap().contains("Max-Age=0")); }
        no_cookie(&whoami(&client,&origin,&current).await,401);
        let unknown=client.post(format!("{origin}/auth/logout")).header("cookie",format!("{COOKIE}=lenso_st_{}; {CSRF}=unknown",URL_SAFE_NO_PAD.encode([9u8;32])))
            .header("origin",allowed_origin()).header("x-csrf-token","unknown").send().await.unwrap();
        no_cookie(&unknown,401);
        assert_eq!(app.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean);
    })).await;
}
