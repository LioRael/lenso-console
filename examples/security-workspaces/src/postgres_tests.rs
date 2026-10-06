//! Real persisted Access/Audit owners; only Auth assertions remain test fixtures.
use super::tests::{BusinessReader, ISSUER, Owners, invoke, selected_root};
use super::*;
use lenso_app_plan::authoring::{PluginDescriptor, PluginRootInstance};
use lenso_app_plan::{CapabilityEndpointPlan, CapabilityRequirementPlan};
use lenso_auth_sdk::{ActorAssertionIssuer, Validity};
use lenso_capability_access_control_admin as admin;
use lenso_capability_audit_log as audit;
use lenso_capability_auth as auth;
use lenso_kernel::{CancellationToken, InvocationContext, Kernel, NativeApp, ShutdownOutcome};
use lenso_native_adapter::{NativePluginFactory, NativePluginFactoryContext, NativePluginInstance};
use lenso_runner::TokioDriver;
use serde_json::{Value, json};
use std::{rc::Rc, time::Duration};

const AUTH: &str = "test.security.auth";
const PROVISIONING: &str = "security.provisioning/default";
const BUSINESS: &str = "test.business.reader/default";

#[derive(Clone, Debug)]
struct AuthOnly;
impl NativePluginFactory for AuthOnly {
    fn package_id(&self) -> &'static str {
        AUTH
    }
    fn package_version(&self) -> &'static str {
        "1.0.0"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, lenso_kernel::RuntimeFailure> {
        Ok(NativePluginInstance::new(vec![Rc::new(
            auth::AuthEndpoint::new(Owners::default()),
        )]))
    }
}

#[derive(Clone, Debug)]
struct Provisioning;
impl NativePluginFactory for Provisioning {
    fn package_id(&self) -> &'static str {
        "security.provisioning"
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
        PluginDescriptor::new(AUTH, "1.0.0", "identity").with_capability(
            CapabilityEndpointPlan::new(
                auth::CAPABILITY_ID,
                auth::DESCRIPTOR_VERSION,
                [auth::AUTHENTICATE_OPERATION],
            ),
        ),
    ));
    releases.push(HostPluginRelease::new(
        PluginDescriptor::new("security.provisioning", "1.0.0", "web")
            .with_requirement(CapabilityRequirementPlan::one(
                admin::CAPABILITY_ID,
                admin::DESCRIPTOR_VERSION,
            ))
            .with_requirement(CapabilityRequirementPlan::one(
                audit::CAPABILITY_ID,
                audit::DESCRIPTOR_VERSION,
            )),
    ));
    releases.push(HostPluginRelease::new(
        PluginDescriptor::new("test.business.reader", "1.0.0", "web").with_requirement(
            CapabilityRequirementPlan::one(audit::CAPABILITY_ID, audit::DESCRIPTOR_VERSION),
        ),
    ));
    HostCatalog::new(base.slots().to_vec(), releases, base.defaults().to_vec())
        .with_bindings(base.bindings().iter().cloned())
}

fn persisted_root(web_root: &str) -> PluginRootSnapshot {
    let selected = selected_root(web_root);
    let mut entries = selected
        .instances()
        .iter()
        .filter(|entry| entry.id().plugin_id() != "test.security.owners")
        .cloned()
        .collect::<Vec<_>>();
    let key = ActorAssertionIssuer::from_signing_key(ISSUER, [42; 32]).public_key_base64();
    entries.extend([
        PluginRootInstance::new(AUTH,"default"),
        PluginRootInstance::new("security.provisioning","default"),
        PluginRootInstance::new("lenso.access-control.postgres","default").with_configuration(json!({
            "schema":"security_access","database_url_secret":"security.database","auth_issuer":ISSUER,"auth_assertion_public_key":key,
            "bootstrap_callers":[PROVISIONING],"directory_callers":["lenso.access-control.console/alpha","lenso.access-control.console/beta"]})),
        PluginRootInstance::new("lenso.audit-log.postgres","default").with_configuration(json!({
            "database_url_secret":"security.database","writer_instances":[PROVISIONING],
            "reader_instances":["lenso.audit-log.console/alpha","lenso.audit-log.console/beta",BUSINESS],
            "reader_scopes":{"lenso.audit-log.console/alpha":[{"kind":"app","id":"alpha"}],"lenso.audit-log.console/beta":[{"kind":"app","id":"beta"}],
                (BUSINESS):[{"kind":"app","id":"alpha"},{"kind":"app","id":"beta"}]}})),
        PluginRootInstance::new("lenso.secrets.env","default").with_configuration(json!({"references":{"security.database":"LENSO_SECURITY_TEST_DATABASE_URL"}})),
    ]);
    PluginRootSnapshot::new([], entries, [])
}

fn without_ui(root: &PluginRootSnapshot) -> PluginRootSnapshot {
    PluginRootSnapshot::new(
        [],
        root.instances()
            .iter()
            .filter(|entry| {
                ![
                    "lenso.console.web",
                    "lenso.access-control.console",
                    "lenso.audit-log.console",
                ]
                .contains(&entry.id().plugin_id())
            })
            .cloned(),
        [PluginInstanceId::new("lenso.console.web", "console")],
    )
}

fn signed_admin(scope: &str, operation: &str) -> InvocationContext {
    let now = time::OffsetDateTime::now_utc();
    ActorAssertionIssuer::from_signing_key(ISSUER, [42; 32])
        .issue(
            format!("admin-{scope}"),
            "user",
            "session",
            [lenso_auth_sdk::audience(admin::CAPABILITY_ID, operation)],
            Validity::new(now, now + time::Duration::seconds(60)).unwrap(),
            BTreeMap::new(),
        )
        .attach(InvocationContext::new(1, None, CancellationToken::new()))
        .unwrap()
}

async fn start(
    catalog: &HostCatalog,
    root: &PluginRootSnapshot,
    ingress: WebIngressFactory,
) -> NativeApp {
    Kernel::start_native(
        resolve(catalog, root).unwrap(),
        TokioDriver::new(),
        registry(ingress)
            .with_factory(AuthOnly)
            .with_factory(Provisioning)
            .with_factory(BusinessReader),
    )
    .await
    .unwrap()
}

/// Seed only through owner public operations, in an explicitly invoked fixture phase.
async fn provision(app: &NativeApp) -> BTreeMap<String, Vec<String>> {
    let mut event_ids = BTreeMap::new();
    for (scope, subject) in [("alpha", "alice"), ("beta", "bob")] {
        let target = json!({"kind":"app","id":scope});
        app.handle::<admin::AccessControlAdminBootstrapScope>(PROVISIONING)
            .unwrap()
            .invoke(
                admin::BOOTSTRAP_SCOPE_OPERATION,
                serde_json::from_value(json!({"scope":target,"subject":format!("admin-{scope}")}))
                    .unwrap(),
            )
            .await
            .unwrap()
            .unwrap();
        app.handle::<admin::AccessControlAdminCreateRole>(PROVISIONING).unwrap()
            .invoke_with_context(admin::CREATE_ROLE_OPERATION,signed_admin(scope,admin::CREATE_ROLE_OPERATION),
                serde_json::from_value(json!({"scope":target,"role_id":"security-reader","name":format!("{scope} security reader")})).unwrap())
            .await.unwrap().unwrap();
        app.handle::<admin::AccessControlAdminSetRolePermissions>(PROVISIONING).unwrap()
            .invoke_with_context(admin::SET_ROLE_PERMISSIONS_OPERATION,signed_admin(scope,admin::SET_ROLE_PERMISSIONS_OPERATION),
                serde_json::from_value(json!({"scope":target,"role_id":"security-reader","permissions":["access.roles.read","audit.events.read"]})).unwrap())
            .await.unwrap().unwrap();
        app.handle::<admin::AccessControlAdminAssignRole>(PROVISIONING)
            .unwrap()
            .invoke_with_context(
                admin::ASSIGN_ROLE_OPERATION,
                signed_admin(scope, admin::ASSIGN_ROLE_OPERATION),
                serde_json::from_value(
                    json!({"scope":target,"role_id":"security-reader","subject":subject}),
                )
                .unwrap(),
            )
            .await
            .unwrap()
            .unwrap();
        let mut ids = Vec::new();
        for second in [1, 2] {
            let request: audit::AppendEventRequest = serde_json::from_value(json!({"action":"read","actor":{"kind":"user","id":subject,"display":null},
                "event_name":"business.read","metadata":{},"occurred_at":format!("2026-10-05T00:00:0{second}Z"),
                "outcome":"success","reason":null,"request_context":null,"resource":null,
                "scope":{"scope_type":"app","id":scope,"module":"ordinary-app","display":null},"severity":"info"})).unwrap();
            let appended = app
                .handle::<audit::AuditLogAppendEvent>(PROVISIONING)
                .unwrap()
                .invoke(audit::APPEND_EVENT_OPERATION, request)
                .await
                .unwrap()
                .unwrap();
            ids.push(appended.event.id);
        }
        event_ids.insert(scope.to_owned(), ids);
    }
    event_ids
}

// A fixture-only provider cannot prove persistence, owner directory caller policy,
// current stored RBAC or continuity when UI is removed from a real business App.
#[tokio::test(flavor = "current_thread")]
#[ignore = "requires an explicitly supplied disposable LENSO_SECURITY_TEST_DATABASE_URL"]
async fn postgres_owners_keep_real_readonly_scopes_and_state_after_ui_removal() {
    tokio::task::LocalSet::new().run_until(Box::pin(async {
        let database = std::env::var("LENSO_SECURITY_TEST_DATABASE_URL").expect("disposable database URL required");
        assert!(database.rsplit('/').next().unwrap().starts_with("lenso_security_test"),"test requires a disposable lenso_security_test* database");
        lenso_access_control_postgres_plugin::AccessControlOperator::setup(&database,"security_access").await.unwrap();
        lenso_audit_log_postgres_plugin::AuditLogOperator::setup(&database).await.unwrap();
        let shell = tempfile::tempdir().unwrap();
        std::fs::write(shell.path().join("index.html"),"<!doctype html><title>Security workspaces</title>").unwrap();
        let catalog = catalog();
        let root = persisted_root(shell.path().to_str().unwrap());
        let headless = without_ui(&root);
        let setup = start(&catalog,&headless,WebIngressFactory::new()).await;
        let event_ids = provision(&setup).await;
        assert_eq!(setup.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean);
        // Startup now only prepares already provisioned owner storage.
        let ingress = WebIngressFactory::new();
        let app = start(&catalog,&root,ingress.clone()).await;
        let origin = format!("http://{}",ingress.local_address().unwrap());
        let client = reqwest::Client::new();
        let pages: Value = client.get(format!("{origin}/api/console/v1/pages")).header("authorization", "Session alice").send().await.unwrap().json().await.unwrap();
        let mounts = pages["mounts"].as_array().unwrap();
        assert_eq!(mounts.len(),4);
        let mount = |plugin: &str,scope: &str| mounts.iter().find(|page| page["owner"]["instance"] == format!("{plugin}/{scope}")).unwrap().clone();
        for (scope,subject) in [("alpha","alice"),("beta","bob")] {
            let roles = mount("lenso.access-control.console",scope);
            let bindings = invoke(&client,&origin,&roles,subject,"access-directory","list_subject_roles",json!({"limit":25,"cursor":null,"subject":subject})).await;
            assert_eq!(bindings.status(),200);
            let bindings: Value = bindings.json().await.unwrap();
            assert_eq!(bindings["roles"][0]["role_id"],"security-reader");
            assert_eq!(bindings["roles"][0]["name"],format!("{scope} security reader"));
            let events = mount("lenso.audit-log.console",scope);
            let first = invoke(&client,&origin,&events,subject,"audit-events","list_events",json!({"limit":1,"cursor":null})).await;
            assert_eq!(first.status(),200);
            let first: Value = first.json().await.unwrap();
            assert_eq!(first["events"][0]["scope_id"],scope);
            assert_eq!(first["events"][0]["id"],event_ids[scope][1]);
            assert!(first["next_cursor"].is_object());
            let second = invoke(&client,&origin,&events,subject,"audit-events","list_events",json!({"limit":1,"cursor":first["next_cursor"]})).await;
            assert_eq!(second.status(),200);
            let second: Value = second.json().await.unwrap();
            assert_eq!(second["events"][0]["id"],event_ids[scope][0]);
            assert!(second["next_cursor"].is_null());
        }
        let alpha_roles = mount("lenso.access-control.console","alpha");
        let alpha_events = mount("lenso.audit-log.console","alpha");
        let beta_events = mount("lenso.audit-log.console","beta");
        assert_eq!(invoke(&client,&origin,&alpha_roles,"member","access-directory","list_roles",json!({"limit":1,"cursor":null})).await.status(),403);
        let denied = invoke(&client,&origin,&beta_events,"alice","audit-events","list_events",json!({"limit":1,"cursor":null})).await;
        assert_eq!(denied.status(),422);
        assert_eq!(denied.json::<Value>().await.unwrap()["code"],"workspace_service_denied");
        app.handle::<admin::AccessControlAdminRevokeRole>(PROVISIONING).unwrap()
            .invoke_with_context(admin::REVOKE_ROLE_OPERATION,signed_admin("alpha",admin::REVOKE_ROLE_OPERATION),
                serde_json::from_value(json!({"scope":{"kind":"app","id":"alpha"},"role_id":"security-reader","subject":"alice"})).unwrap()).await.unwrap().unwrap();
        for (page,service,operation) in [(&alpha_roles,"access-directory","list_roles"),(&alpha_events,"audit-events","list_events")] {
            let denied = invoke(&client,&origin,page,"alice",service,operation,json!({"limit":1,"cursor":null})).await;
            assert_eq!(denied.status(),422);
            assert_eq!(denied.json::<Value>().await.unwrap()["code"],"workspace_service_denied");
        }
        assert_eq!(client.get(format!("{origin}/api/console/v1/session")).header("authorization", "Session alice").send().await.unwrap().status(),200);
        assert_eq!(app.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean);
        let ingress = WebIngressFactory::new();
        let business = start(&catalog,&headless,ingress.clone()).await;
        let origin = format!("http://{}",ingress.local_address().unwrap());
        assert_eq!(client.get(format!("{origin}/health")).send().await.unwrap().status(),200);
        assert_eq!(client.get(format!("{origin}/api/console/v1/pages")).send().await.unwrap().status(),404);
        let stored = business.handle::<audit::AuditLogListEvents>(BUSINESS).unwrap().invoke(audit::LIST_EVENTS_OPERATION,
            serde_json::from_value(json!({"limit":25,"scope_module":"ordinary-app","scope_type":"app","scope_id":"alpha"})).unwrap()).await.unwrap().unwrap();
        assert_eq!(stored.events.iter().map(|event| &event.id).collect::<Vec<_>>(),vec![&event_ids["alpha"][1],&event_ids["alpha"][0]]);
        assert_eq!(business.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean);
    })).await;
}
