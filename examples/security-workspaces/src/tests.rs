//! Real native/socket integration using deterministic public Capability providers.
//! These credentials and data are fixtures, not PostgreSQL or live Account Auth.
use super::*;
use lenso_app_plan::authoring::{PluginDescriptor, PluginRootInstance};
use lenso_app_plan::{CapabilityEndpointPlan, CapabilityRequirementPlan};
use lenso_auth_sdk::{ActorAssertionIssuer, Validity, authenticated_response};
use lenso_capability_access_control as access;
use lenso_capability_access_control_directory as directory;
use lenso_capability_audit_log as audit;
use lenso_capability_auth as auth;
use lenso_kernel::{InvocationContext, Kernel, NativeRequestFuture, ShutdownOutcome};
use lenso_native_adapter::{NativePluginFactory, NativePluginFactoryContext, NativePluginInstance};
use lenso_runner::TokioDriver;
use serde_json::{Value, json};
use std::{cell::RefCell, rc::Rc, time::Duration};

const FIXTURE: &str = "test.security.owners";
pub(super) const ISSUER: &str = "security-fixture";

#[derive(Debug, Default)]
struct State {
    revoked: bool,
    access_revoked: bool,
    directory_reads: usize,
    audit_reads: usize,
    append_calls: usize,
}

#[derive(Clone, Debug, Default)]
pub(super) struct Owners(Rc<RefCell<State>>);

impl NativePluginFactory for Owners {
    fn package_id(&self) -> &'static str {
        FIXTURE
    }
    fn package_version(&self) -> &'static str {
        "1.0.0"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, lenso_kernel::RuntimeFailure> {
        Ok(NativePluginInstance::new(vec![
            Rc::new(auth::AuthEndpoint::new(self.clone())),
            Rc::new(access::AccessControlEndpoint::new(self.clone())),
            Rc::new(directory::AccessControlDirectoryEndpoint::new(self.clone())),
            Rc::new(audit::AuditLogEndpoint::new(self.clone())),
        ]))
    }
}

impl auth::AuthProvider for Owners {
    fn authenticate(
        &self,
        _: InvocationContext,
        request: auth::AuthRequest,
    ) -> NativeRequestFuture<auth::Auth> {
        let absent = request.credential.as_ref().is_none_or(|credential| {
            credential.scheme != "session"
                || self.0.borrow().revoked && credential.value == "alice"
                || !["alice", "bob", "member"].contains(&credential.value.as_str())
        });
        Box::pin(async move {
            if absent {
                return Ok(Ok(lenso_auth_sdk::absent_response()));
            }
            let subject = request.credential.unwrap().value;
            let now = time::OffsetDateTime::now_utc();
            let issuer = ActorAssertionIssuer::from_signing_key(ISSUER, [42; 32]);
            let assertion = issuer.issue(
                subject,
                "user",
                "session",
                [lenso_auth_sdk::audience(
                    "lenso.ui.workspace-service@1",
                    "invoke",
                )],
                Validity::new(now, now + time::Duration::seconds(60)).unwrap(),
                BTreeMap::new(),
            );
            Ok(Ok(authenticated_response(&assertion)))
        })
    }
}

impl access::AccessControlProvider for Owners {
    fn check_permission(
        &self,
        _: InvocationContext,
        request: access::CheckPermissionRequest,
    ) -> NativeRequestFuture<access::AccessControl> {
        let allowed = !self.0.borrow().access_revoked
            && request.scope.kind == "app"
            && matches!(
                (request.subject.as_str(), request.scope.id.as_str()),
                ("alice", "alpha") | ("bob", "beta")
            )
            && ["access.roles.read", "audit.events.read"].contains(&request.permission.as_str());
        Box::pin(async move {
            Ok(Ok(access::CheckPermissionResponse {
                allowed,
                policy_revision: "1".into(),
            }))
        })
    }
}

fn roles(scope: &directory::Scope) -> Vec<directory::Role> {
    vec![directory::Role {
        role_id: format!("{}-reader", scope.id),
        name: format!("{} reader", scope.id),
        permissions: vec!["business.read".into()],
        protected: false,
    }]
}

impl directory::AccessControlDirectoryProvider for Owners {
    fn get_role(
        &self,
        _: InvocationContext,
        _: directory::GetRoleRequest,
    ) -> NativeRequestFuture<directory::AccessControlDirectoryGetRole> {
        Box::pin(async { Ok(Err(directory::GetRoleError::RoleNotFound)) })
    }
    fn list_roles(
        &self,
        _: InvocationContext,
        request: directory::ListRolesRequest,
    ) -> NativeRequestFuture<directory::AccessControlDirectoryListRoles> {
        self.0.borrow_mut().directory_reads += 1;
        Box::pin(async move {
            Ok(Ok(directory::ListRolesResponse {
                roles: roles(&request.scope),
                next_cursor: None,
                policy_revision: "1".into(),
            }))
        })
    }
    fn list_subject_roles(
        &self,
        _: InvocationContext,
        request: directory::ListSubjectRolesRequest,
    ) -> NativeRequestFuture<directory::AccessControlDirectoryListSubjectRoles> {
        self.0.borrow_mut().directory_reads += 1;
        Box::pin(async move {
            Ok(Ok(directory::ListSubjectRolesResponse {
                roles: roles(&request.scope),
                subject: request.subject,
                next_cursor: None,
                policy_revision: "1".into(),
            }))
        })
    }
}

fn event(scope: &str, index: u8) -> Value {
    json!({"id":format!("{scope}-{index}"),"action":"read","actor_kind":"user","actor_id":"fixture-user",
        "actor_display":null,"causation_id":null,"correlation_id":null,"created_at":"2026-10-05T00:00:00Z",
        "event_name":"business.read","metadata":{},"occurred_at":"2026-10-05T00:00:00Z","outcome":"success",
        "reason":null,"request_id":null,"resource_display":null,"resource_id":null,"resource_type":null,
        "scope_display":null,"scope_id":scope,"scope_module":"ordinary-app","scope_type":"app",
        "severity":"info","source_instance":"business/default","story_id":null})
}

impl audit::AuditLogProvider for Owners {
    fn append_event(
        &self,
        _: InvocationContext,
        _: audit::AppendEventRequest,
    ) -> NativeRequestFuture<audit::AuditLogAppendEvent> {
        self.0.borrow_mut().append_calls += 1;
        Box::pin(async { Ok(Err(audit::AppendEventError::Unauthorized)) })
    }
    fn get_event(
        &self,
        _: InvocationContext,
        _: audit::GetEventRequest,
    ) -> NativeRequestFuture<audit::AuditLogGetEvent> {
        Box::pin(async { Ok(Err(audit::GetEventError::NotFound)) })
    }
    fn list_events(
        &self,
        _: InvocationContext,
        request: audit::ListEventsRequest,
    ) -> NativeRequestFuture<audit::AuditLogListEvents> {
        self.0.borrow_mut().audit_reads += 1;
        Box::pin(async move {
            if request.scope_module.as_deref() != Some("ordinary-app")
                || request.scope_type.as_deref() != Some("app")
            {
                return Ok(Err(audit::ListEventsError::InvalidQuery));
            }
            let scope = request.scope_id.unwrap();
            let first = request.cursor.is_none();
            let value = json!({"events":[event(&scope, if first {2} else {1})],
                "next_cursor":if first {json!({"id":format!("{scope}-2"),"occurred_at":"2026-10-05T00:00:00Z"})} else {Value::Null}});
            Ok(Ok(serde_json::from_value(value).unwrap()))
        })
    }
}

#[derive(Clone, Debug)]
pub(super) struct BusinessReader;
impl NativePluginFactory for BusinessReader {
    fn package_id(&self) -> &'static str {
        "test.business.reader"
    }
    fn package_version(&self) -> &'static str {
        "1.0.0"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, lenso_kernel::RuntimeFailure> {
        Ok(NativePluginInstance::new(vec![]))
    }
}

fn fixture_catalog(address: SocketAddr) -> HostCatalog {
    let base = host_catalog(address).unwrap();
    let mut releases = base.plugins().to_vec();
    let fixture = PluginDescriptor::new(FIXTURE, "1.0.0", "identity")
        .with_capability(CapabilityEndpointPlan::new(
            auth::CAPABILITY_ID,
            auth::DESCRIPTOR_VERSION,
            [auth::AUTHENTICATE_OPERATION],
        ))
        .with_capability(CapabilityEndpointPlan::new(
            access::CAPABILITY_ID,
            access::DESCRIPTOR_VERSION,
            [access::CHECK_PERMISSION_OPERATION],
        ))
        .with_capability(CapabilityEndpointPlan::new(
            directory::CAPABILITY_ID,
            directory::DESCRIPTOR_VERSION,
            [
                directory::GET_ROLE_OPERATION,
                directory::LIST_ROLES_OPERATION,
                directory::LIST_SUBJECT_ROLES_OPERATION,
            ],
        ))
        .with_capability(CapabilityEndpointPlan::new(
            audit::CAPABILITY_ID,
            audit::DESCRIPTOR_VERSION,
            [
                audit::APPEND_EVENT_OPERATION,
                audit::GET_EVENT_OPERATION,
                audit::LIST_EVENTS_OPERATION,
            ],
        ));
    releases.push(HostPluginRelease::new(fixture));
    releases.push(HostPluginRelease::new(
        PluginDescriptor::new("test.business.reader", "1.0.0", "web").with_requirement(
            CapabilityRequirementPlan::one(audit::CAPABILITY_ID, audit::DESCRIPTOR_VERSION),
        ),
    ));
    HostCatalog::new(base.slots().to_vec(), releases, base.defaults().to_vec())
        .with_bindings(base.bindings().iter().cloned())
}

#[cfg(feature = "console")]
pub(super) fn selected_root(web_root: &str) -> PluginRootSnapshot {
    let public_key = ActorAssertionIssuer::from_signing_key(ISSUER, [42; 32]).public_key_base64();
    let mut entries = vec![
        PluginRootInstance::new(FIXTURE, "default"),
        PluginRootInstance::new("test.business.reader", "default"),
        PluginRootInstance::new("lenso.console.web", "console").with_configuration(
            json!({"administrator_subjects":["alice","bob"],"web_root":web_root,
                "workspace_mounts":[
                    {"instance":"lenso.access-control.console/alpha","workspace":"roles","path":"/access/alpha"},
                    {"instance":"lenso.access-control.console/beta","workspace":"roles","path":"/access/beta"},
                    {"instance":"lenso.audit-log.console/alpha","workspace":"audit-events","path":"/audit/alpha"},
                    {"instance":"lenso.audit-log.console/beta","workspace":"audit-events","path":"/audit/beta"}
                ]}),
        ),
    ];
    for scope in ["alpha", "beta"] {
        let common = json!({"issuer":ISSUER,"public_key":public_key,"assertion_max_ttl_seconds":60,"caller_instances":[CONSOLE_INSTANCE]});
        let mut roles = common.clone();
        roles["scope"] = json!({"kind":"app","id":scope});
        entries.push(
            PluginRootInstance::new("lenso.access-control.console", scope)
                .with_configuration(roles),
        );
        let mut events = common;
        events["access_scope"] = json!({"kind":"app","id":scope});
        events["audit_scope"] = json!({"module":"ordinary-app","type":"app","id":scope});
        entries.push(
            PluginRootInstance::new("lenso.audit-log.console", scope).with_configuration(events),
        );
    }
    PluginRootSnapshot::new([], entries, [])
}

#[cfg(feature = "console")]
pub(super) async fn invoke(
    client: &reqwest::Client,
    origin: &str,
    mount: &Value,
    actor: &str,
    service: &str,
    operation: &str,
    input: Value,
) -> reqwest::Response {
    client
        .post(format!(
            "{origin}/api/console/v1/pages/{}/services/{service}/invoke/{operation}",
            mount["id"].as_str().unwrap()
        ))
        .header("authorization", format!("Session {actor}"))
        .header(
            "x-lenso-page-owner",
            mount["owner"]["instance"].as_str().unwrap(),
        )
        .header("x-lenso-page-revision", mount["revision"].as_str().unwrap())
        .header(
            "x-lenso-page-implementation",
            mount["implementationId"].as_str().unwrap(),
        )
        .json(&input)
        .send()
        .await
        .unwrap()
}

// A resolved configuration can still mismatch individually valid cookie policies.
// Existing socket tests use Authorization credentials and cannot detect this startup gap.
#[test]
fn cookie_transport_preflight_accepts_matching_and_rejects_missing_or_mismatched_extraction() {
    use lenso_app_plan::{AppComposition, PluginInstancePlan};
    let session = json!({"session_cookie_name":"__Host-lenso-session","csrf_cookie_name":"__Host-lenso-csrf"});
    let extraction = json!({"name":"__Host-lenso-session","csrf_cookie_name":"__Host-lenso-csrf","csrf_header_name":"x-csrf-token"});
    let plan = |cookie: Option<Value>, select_ingress: bool| {
        let mut instances = vec![
            PluginInstancePlan::new("lenso.auth.web-session/default", "lenso.auth.web-session")
                .with_configuration(session.to_string()),
        ];
        if select_ingress {
            instances.push(
                PluginInstancePlan::new("lenso.web-ingress/native", "lenso.web-ingress")
                    .with_configuration(json!({"session_cookie":cookie}).to_string()),
            );
        }
        AppComposition::new(instances, Vec::new())
            .resolve()
            .unwrap()
    };
    validate_session_transport(&plan(Some(extraction.clone()), true)).unwrap();
    assert!(validate_session_transport(&plan(None, true)).is_err());
    assert!(validate_session_transport(&plan(None, false)).is_err());
    for (field, changed) in [
        ("name", "__Host-other-session"),
        ("csrf_cookie_name", "__Host-other-csrf"),
        ("csrf_header_name", "x-other-csrf"),
    ] {
        let mut mismatched = extraction.clone();
        mismatched[field] = json!(changed);
        assert!(validate_session_transport(&plan(Some(mismatched), true)).is_err());
    }
    let authorization_only = AppComposition::new(Vec::new(), Vec::new())
        .resolve()
        .unwrap();
    validate_session_transport(&authorization_only).unwrap();
}

// Existing Console mount tests use a Welcome owner. They cannot catch an Access
// or Audit adapter reading before RBAC, exposing mutation ports, or leaking scope.
#[cfg(feature = "console")]
#[tokio::test(flavor = "current_thread")]
async fn ordinary_app_readonly_workspaces_enforce_scope_paging_revocation_and_removal() {
    tokio::task::LocalSet::new().run_until(Box::pin(async {
        let catalog = fixture_catalog("127.0.0.1:0".parse().unwrap());
        let shell = tempfile::tempdir().unwrap();
        std::fs::write(shell.path().join("index.html"), "<!doctype html><title>Security workspaces</title>").unwrap();
        let root = selected_root(shell.path().to_str().unwrap());
        let owners = Owners::default();
        let ingress = WebIngressFactory::new();
        let app = Kernel::start_native(resolve(&catalog, &root).unwrap(), TokioDriver::new(),
            registry(ingress.clone()).with_factory(owners.clone()).with_factory(BusinessReader)).await.unwrap();
        let origin = format!("http://{}", ingress.local_address().unwrap());
        let client = reqwest::Client::new();
        assert_eq!(client.get(format!("{origin}/health")).send().await.unwrap().status(), 200);
        assert_eq!(client.get(format!("{origin}/api/console/v1/pages")).send().await.unwrap().status(), 401);
        let pages: Value = client.get(format!("{origin}/api/console/v1/pages")).header("authorization", "Session alice")
            .send().await.unwrap().json().await.unwrap();
        let mounts = pages["mounts"].as_array().expect("Console page catalog");
        assert_eq!(mounts.len(), 4);
        let mount = |plugin: &str, scope: &str| mounts.iter().find(|value|
            value["owner"]["instance"] == format!("{plugin}/{scope}")).unwrap().clone();
        let access_alpha = mount("lenso.access-control.console", "alpha");
        let access_beta = mount("lenso.access-control.console", "beta");
        let audit_alpha = mount("lenso.audit-log.console", "alpha");
        let audit_beta = mount("lenso.audit-log.console", "beta");
        for (page, path) in [(&access_alpha,"/access/alpha/"),(&access_beta,"/access/beta/"),
            (&audit_alpha,"/audit/alpha/"),(&audit_beta,"/audit/beta/")] {
            assert_eq!(page["basePath"],path);
        }
        assert_ne!(access_alpha["id"], access_beta["id"]);
        assert_ne!(audit_alpha["id"], audit_beta["id"]);
        for (page, actor, scope) in [(&access_alpha,"alice","alpha"),(&access_beta,"bob","beta")] {
            let response = invoke(&client,&origin,page,actor,"access-directory","list_roles",json!({"limit":1,"cursor":null})).await;
            assert_eq!(response.status(),200);
            assert_eq!(response.json::<Value>().await.unwrap()["roles"][0]["role_id"],format!("{scope}-reader"));
        }
        let bindings = invoke(&client,&origin,&access_alpha,"alice","access-directory","list_subject_roles",json!({"limit":1,"cursor":null,"subject":"member"})).await;
        assert_eq!(bindings.status(),200);
        assert_eq!(bindings.json::<Value>().await.unwrap()["subject"],"member");
        for (page, actor, scope) in [(&audit_alpha,"alice","alpha"),(&audit_beta,"bob","beta")] {
            let first = invoke(&client,&origin,page,actor,"audit-events","list_events",json!({"limit":1,"cursor":null})).await;
            assert_eq!(first.status(),200);
            let first: Value = first.json().await.unwrap();
            assert_eq!(first["events"][0]["id"],format!("{scope}-2"));
            let second = invoke(&client,&origin,page,actor,"audit-events","list_events",json!({"limit":1,"cursor":first["next_cursor"]})).await;
            assert_eq!(second.status(),200);
            let second: Value = second.json().await.unwrap();
            assert_eq!(second["events"][0]["id"],format!("{scope}-1"));
            assert_eq!(second["next_cursor"],Value::Null);
        }
        let reads = (owners.0.borrow().directory_reads,owners.0.borrow().audit_reads);
        for (page, service, operation) in [(&access_beta,"access-directory","list_roles"),(&audit_beta,"audit-events","list_events")] {
            let denied = invoke(&client,&origin,page,"alice",service,operation,json!({"limit":1,"cursor":null})).await;
            assert_eq!(denied.status(),422);
            assert_eq!(denied.json::<Value>().await.unwrap()["code"],"workspace_service_denied");
        }
        let member = invoke(&client,&origin,&access_alpha,"member","access-directory","list_roles",json!({"limit":1,"cursor":null})).await;
        assert_eq!(member.status(),403);
        let forged = invoke(&client,&origin,&access_alpha,"alice","access-directory","list_roles",json!({"limit":1,"cursor":null,"scope":{"kind":"app","id":"beta"}})).await;
        assert_eq!(forged.status(),422);
        let forged = invoke(&client,&origin,&audit_alpha,"alice","audit-events","list_events",json!({"limit":1,"cursor":null,"scope_id":"beta"})).await;
        assert_eq!(forged.status(),422);
        let append = invoke(&client,&origin,&audit_alpha,"alice","audit-events","append_event",json!({})).await;
        assert!(!append.status().is_success());
        assert_eq!(owners.0.borrow().append_calls,0);
        owners.0.borrow_mut().access_revoked = true;
        for (page, service, operation) in [(&access_alpha, "access-directory", "list_roles"), (&audit_alpha, "audit-events", "list_events")] {
            let denied = invoke(&client, &origin, page, "alice", service, operation, json!({"limit":1,"cursor":null})).await;
            assert_eq!(denied.status(), 422);
            assert_eq!(denied.json::<Value>().await.unwrap()["code"], "workspace_service_denied");
        }
        assert_eq!((owners.0.borrow().directory_reads, owners.0.borrow().audit_reads), reads);
        owners.0.borrow_mut().revoked = true;
        assert_eq!(invoke(&client,&origin,&audit_alpha,"alice","audit-events","list_events",json!({"limit":1,"cursor":null})).await.status(),401);
        assert_eq!((owners.0.borrow().directory_reads,owners.0.borrow().audit_reads),reads);
        assert_eq!(app.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean);
        // Drop UI selection only. Business owner state and its public port remain.
        let removed = PluginRootSnapshot::new([], [PluginRootInstance::new(FIXTURE,"default"),PluginRootInstance::new("test.business.reader","default")],
            [PluginInstanceId::new("lenso.console.web","console")]);
        let ingress = WebIngressFactory::new();
        let business = Kernel::start_native(resolve(&catalog,&removed).unwrap(),TokioDriver::new(),
            registry(ingress.clone()).with_factory(owners.clone()).with_factory(BusinessReader)).await.unwrap();
        let origin = format!("http://{}",ingress.local_address().unwrap());
        assert_eq!(client.get(format!("{origin}/health")).send().await.unwrap().status(),200);
        assert_eq!(client.get(format!("{origin}/api/console/v1/pages")).send().await.unwrap().status(),404);
        let reader = business.handle::<audit::AuditLogListEvents>("test.business.reader/default").unwrap();
        let request: audit::ListEventsRequest = serde_json::from_value(json!({"limit":1,"scope_module":"ordinary-app","scope_type":"app","scope_id":"alpha"})).unwrap();
        let page = reader.invoke(audit::LIST_EVENTS_OPERATION,request).await.unwrap().unwrap();
        assert_eq!(page.events[0].id,"alpha-2");
        assert_eq!(owners.0.borrow().append_calls,0);
        assert_eq!(business.shutdown(Duration::from_secs(3)).await,ShutdownOutcome::Clean);
    })).await;
}

#[cfg(not(feature = "console"))]
#[tokio::test(flavor = "current_thread")]
async fn headless_business_host_has_no_console_dependency() {
    tokio::task::LocalSet::new()
        .run_until(async {
            let catalog = host_catalog("127.0.0.1:0".parse().unwrap()).unwrap();
            let ingress = WebIngressFactory::new();
            let app = Kernel::start_native(
                resolve(&catalog, &PluginRootSnapshot::default()).unwrap(),
                TokioDriver::new(),
                registry(ingress.clone()),
            )
            .await
            .unwrap();
            let origin = format!("http://{}", ingress.local_address().unwrap());
            let client = reqwest::Client::new();
            assert_eq!(
                client
                    .get(format!("{origin}/health"))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                200
            );
            assert_eq!(
                client
                    .get(format!("{origin}/api/console/v1/pages"))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                404
            );
            assert_eq!(
                app.shutdown(Duration::from_secs(3)).await,
                ShutdownOutcome::Clean
            );
        })
        .await;
}
