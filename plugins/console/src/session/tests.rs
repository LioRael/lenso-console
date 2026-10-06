use super::*;
use crate::OperatorsProfile;
use lenso_app_plan::{
    AppComposition, CapabilityBinding, CapabilityEndpointPlan, CapabilityRequirementPlan,
    PluginInstancePlan,
};
use lenso_auth_sdk::{ActorAssertionIssuer, Validity, absent_response, authenticated_response};
use lenso_capability_access_control as access;
use lenso_capability_auth as auth;
use lenso_kernel::{Kernel, NativeRequestFuture, RuntimeFailure};
use lenso_native_adapter::{
    NativePluginFactory, NativePluginFactoryContext, NativePluginInstance, NativePluginRegistry,
};
use lenso_runner::TokioDriver;
use std::{cell::Cell, collections::BTreeMap, rc::Rc, time::Duration};

#[derive(Clone, Debug)]
struct Factory {
    revoked: Rc<Cell<bool>>,
    unavailable: Rc<Cell<bool>>,
    operators: Rc<Cell<bool>>,
    permission: Rc<Cell<bool>>,
    delegated: Rc<Cell<bool>>,
    auth_calls: Rc<Cell<usize>>,
}
impl NativePluginFactory for Factory {
    fn package_id(&self) -> &'static str {
        "test.session.auth"
    }
    fn instantiate(
        &self,
        context: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        let mut factory = self.clone();
        if context.instance_key() == "operator-auth" {
            factory.operators = Rc::new(Cell::new(true));
        }
        Ok(NativePluginInstance::new(vec![
            Rc::new(auth::AuthEndpoint::new(factory.clone())),
            Rc::new(access::AccessControlEndpoint::new(factory)),
        ]))
    }
}
impl auth::AuthProvider for Factory {
    fn authenticate(
        &self,
        _: InvocationContext,
        request: auth::AuthRequest,
    ) -> NativeRequestFuture<auth::Auth> {
        self.auth_calls.set(self.auth_calls.get() + 1);
        let result = if self.unavailable.get() {
            Err(RuntimeFailure::Unavailable {
                capability: auth::CAPABILITY_ID,
            })
        } else if let Some(credential) = request.credential {
            if self.revoked.get()
                || credential.scheme != "session"
                || !["alice", "bob"].contains(&credential.value.as_str())
            {
                Ok(Err(auth::AuthenticateError::Invalid))
            } else {
                let now = time::OffsetDateTime::now_utc();
                let issuer = if self.operators.get() {
                    ActorAssertionIssuer::from_signing_key("operators", [8; 32])
                } else {
                    ActorAssertionIssuer::from_signing_key("test.issuer", [7; 32])
                };
                let assertion = issuer.issue(
                    credential.value,
                    "user",
                    "password",
                    [
                        "example.query@1:read".to_owned(),
                        format!("{}:handle", lenso_capability_http_endpoint::CAPABILITY_ID),
                    ],
                    Validity::new(now, now + time::Duration::minutes(1)).unwrap(),
                    if self.delegated.get() {
                        BTreeMap::from([(lenso_auth_sdk::delegation::SCOPED_DELEGATION_CLAIM.into(), serde_json::json!({"task_id":"task","agent_session_id":"agent-session","delegate_caller":"example.agent/default"}))])
                    } else { BTreeMap::new() },
                );
                Ok(Ok(authenticated_response(&assertion)))
            }
        } else {
            Ok(Ok(absent_response()))
        };
        Box::pin(std::future::ready(result))
    }
}
impl access::AccessControlProvider for Factory {
    fn check_permission(
        &self,
        _: InvocationContext,
        request: access::CheckPermissionRequest,
    ) -> NativeRequestFuture<access::AccessControl> {
        assert!(["console.operator", "assistant.use"].contains(&request.permission.as_str()));
        assert_eq!(request.scope.kind, "deployment");
        assert_eq!(request.scope.id, "alpha");
        let allowed = self.permission.get()
            && (request.permission != "assistant.use" || request.subject == "alice");
        Box::pin(async move {
            Ok(Ok(access::CheckPermissionResponse {
                allowed,
                policy_revision: "1".into(),
            }))
        })
    }
}
#[derive(Debug)]
struct Caller;
impl NativePluginFactory for Caller {
    fn package_id(&self) -> &'static str {
        "test.session.caller"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        Ok(NativePluginInstance::default())
    }
}
fn context() -> InvocationContext {
    InvocationContext::new(1, None, lenso_kernel::CancellationToken::new())
}

#[tokio::test(flavor = "current_thread")]
#[allow(clippy::too_many_lines)]
async fn bound_auth_rechecks_each_user_and_revocation_without_fallback() {
    tokio::task::LocalSet::new()
        .run_until(Box::pin(async {
            let factory = Factory {
                revoked: Rc::new(Cell::new(false)),
                unavailable: Rc::new(Cell::new(false)),
                operators: Rc::new(Cell::new(false)),
                permission: Rc::new(Cell::new(true)),
                delegated: Rc::new(Cell::new(false)),
                auth_calls:Rc::new(Cell::new(0)),
            };
            let plan = AppComposition::new(
                vec![
                    PluginInstancePlan::new("caller", "test.session.caller").with_requirement(CapabilityRequirementPlan::one(auth::CAPABILITY_ID,auth::DESCRIPTOR_VERSION)).with_requirement(CapabilityRequirementPlan::one(access::CAPABILITY_ID,access::DESCRIPTOR_VERSION)),
                    PluginInstancePlan::new("auth", "test.session.auth").with_capability(
                        CapabilityEndpointPlan::new(
                            auth::CAPABILITY_ID,
                            auth::DESCRIPTOR_VERSION,
                            [auth::AUTHENTICATE_OPERATION],
                        ),
                    ).with_capability(CapabilityEndpointPlan::new(access::CAPABILITY_ID,access::DESCRIPTOR_VERSION,[access::CHECK_PERMISSION_OPERATION])),
                ],
                vec![CapabilityBinding::new("caller",auth::CAPABILITY_ID,auth::DESCRIPTOR_VERSION,"auth"),CapabilityBinding::new("caller",access::CAPABILITY_ID,access::DESCRIPTOR_VERSION,"auth")],
            )
            .resolve()
            .unwrap();
            let app = Kernel::start_native(
                plan,
                TokioDriver::new(),
                NativePluginRegistry::new()
                    .with_factory(Caller)
                    .with_factory(factory.clone()),
            )
            .await
            .unwrap();
            let boundary = SessionBoundary {
                assistant_access: None,
        operators_profile: None, access_control: None,
                required: true,
                administrator_subjects: vec!["alice".into(), "bob".into()],
                member_workspace_ids: vec![],
                auth: Some(AuthClient::new(app.handle::<auth::Auth>("caller").unwrap())),
            };
            let unauthorized = boundary
                .prepare(context(), "GET", "/api/private", None)
                .await
                .err()
                .unwrap();
            assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
            for subject in ["alice", "bob"] {
                let admitted = boundary
                    .prepare(
                        context(),
                        "POST",
                        "/api/private",
                        Some(("session", subject)),
                    )
                    .await
                    .ok()
                    .unwrap();
                let value: serde_json::Value = serde_json::from_slice(
                    admitted
                        .sealed_extension(lenso_auth_sdk::ACTOR_ASSERTION_EXTENSION)
                        .unwrap()
                        .value(),
                )
                .unwrap();
                assert_eq!(value["subject"], subject);
            }
            let member = SessionBoundary {
                administrator_subjects: vec![],
                ..boundary.clone()
            };
            for path in [
                "/api/console/v1/agent/bootstrap",
                "/api/console/v1/pages",
                "/api/private",
            ] {
                assert_eq!(
                    member
                        .prepare(context(), "GET", path, Some(("session", "alice")))
                        .await
                        .err()
                        .unwrap()
                        .status(),
                    StatusCode::FORBIDDEN
                );
            }
            // Regression: an assistant grant must admit a member without granting administration;
            // the old coverage proved only that all members were rejected.
            let assistant_member = SessionBoundary {
                assistant_access: Some(AssistantAccessPolicy { enabled: true, subjects: vec!["alice".into()], ..Default::default() }),
                ..member.clone()
            };
            for path in ["/api/console/v1/agent/bootstrap", "/api/console/v1/assistant/settings", "/api/console/v1/agents"] {
                assert!(assistant_member.prepare(context(), "GET", path, Some(("session", "alice"))).await.is_ok());
                assert_eq!(assistant_member.prepare(context(), "GET", path, Some(("session", "bob"))).await.err().unwrap().status(), StatusCode::FORBIDDEN);
            }
            let response = assistant_member.prepare(context(), "GET", "/api/console/v1/session", Some(("session", "alice"))).await.err().unwrap();
            assert_eq!(response.headers()["x-lenso-read-scope"].as_bytes().len(), 64);
            let session_status: serde_json::Value = serde_json::from_slice(&response.into_body().collect(4096).await.unwrap()).unwrap();
            assert_eq!(session_status["assistant_enabled"], true);
            assert_eq!(session_status["administrator"], false);
            assert_eq!(assistant_member.prepare(context(), "POST", "/api/console/v1/configuration", Some(("session", "alice"))).await.err().unwrap().status(), StatusCode::FORBIDDEN);
            let permission_member = SessionBoundary { assistant_access: Some(AssistantAccessPolicy { enabled: true, permission: Some(AssistantPermission { scope_kind: "deployment".into(), scope_id: "alpha".into() }), ..Default::default() }), access_control: Some(access::AccessControlClient::new(app.handle::<access::AccessControl>("caller").unwrap())), ..member.clone() };
            assert!(permission_member.prepare(context(), "GET", "/api/console/v1/agent/bootstrap", Some(("session", "alice"))).await.is_ok());
            assert_eq!(permission_member.prepare(context(), "GET", "/api/console/v1/agent/bootstrap", Some(("session", "bob"))).await.err().unwrap().status(), StatusCode::FORBIDDEN);
            let default_deny = SessionBoundary { assistant_access: Some(AssistantAccessPolicy::default()), ..boundary.clone() };
            assert_eq!(default_deny.prepare(context(), "GET", "/api/console/v1/agent/bootstrap", Some(("session", "alice"))).await.err().unwrap().status(), StatusCode::FORBIDDEN);
            let admitted = boundary.prepare(context(), "GET", "/api/console/v1/agent/bootstrap", Some(("session", "alice"))).await.ok().unwrap();
            assert_eq!(admitted.extension(LEGACY_AGENT_CONTROL), Some(b"1".as_slice()));
            // A legacy administrator must retain App Agent proxy scope as well.
            let legacy_app = boundary.prepare(context(), "GET", "/api/console/v1/agents/app/bootstrap", Some(("session", "alice"))).await.ok().unwrap();
            let mut legacy_request = crate::http::Request::new(::http::Method::GET, "/api/console/v1/agents/app/bootstrap");
            legacy_request.context = legacy_app;
            let (_, restricted) = crate::authenticated_agent_headers(&legacy_request).ok().unwrap();
            assert!(!restricted);

            let workspace_member = SessionBoundary { member_workspace_ids: vec!["projects".into()], ..member.clone() };
            let member_context = workspace_member.prepare(context(), "GET", "/api/console/v1/pages", Some(("session", "alice"))).await.ok().unwrap();
            let catalog = (StatusCode::OK, Json(serde_json::json!({"schema":"console.page-catalog/1","mounts":[{"id":"projects"},{"id":"observe"}]}))).into_response();
            let filtered = workspace_member.filter_catalog(&member_context, "/api/console/v1/pages", catalog).await;
            let bytes = filtered.into_body().collect(4096).await.unwrap();
            let filtered: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(filtered["mounts"], serde_json::json!([{"id":"projects"}]));
            assert!(workspace_member.prepare(context(), "POST", "/api/console/v1/pages/projects/services/projects/invoke/list_projects", Some(("session", "alice"))).await.is_ok());
            assert_eq!(workspace_member.prepare(context(), "GET", "/api/console/v1/pages/observe/services/telemetry/invoke/query", Some(("session", "alice"))).await.err().unwrap().status(), StatusCode::FORBIDDEN);
            // The old member fixture has no access metadata. A misconfigured
            // member allowlist must not expose an administrator mount's assets
            // or invoke its services in either real HTTP adapter.
            let response = serde_json::from_value(serde_json::json!({
                "assets":[{"content_base64":"ZXhwb3J0IGNvbnN0IGFwaU1ham9yID0gMTs=","media_type":"text/javascript; charset=utf-8","path":"page.mjs"}],
                "module":"page.mjs","navigation":{"label":"Admin","items":[]},"requirements":[],"revision":"1","styles":[],"title":"Admin","workspace_id":"admin",
                "workspaces":[{"id":"admin","title":"Admin","path":"/admin","access":"administrator","index":[],"routes":[[]],"navigation":{"label":"Admin","items":[]}}]
            })).unwrap();
            let mut pages = crate::page_contributions::PageCatalog::from_contributions(
                vec![("example/default".into(), response)], &std::collections::BTreeSet::default()
            ).unwrap();
            pages.apply_mount_overrides(&[]).unwrap();
            let catalog_response = pages.handle(&crate::http::Request::new(::http::Method::GET,"/api/console/v1/pages")).await.unwrap();
            let catalog_value: serde_json::Value = serde_json::from_slice(&catalog_response.into_body().collect(4096).await.unwrap()).unwrap();
            let admin_id = catalog_value["mounts"][0]["id"].as_str().unwrap();
            let module = catalog_value["mounts"][0]["module"].as_str().unwrap();
            let misconfigured_member = SessionBoundary {member_workspace_ids:vec![admin_id.into()], ..member.clone()};
            let member_context = misconfigured_member.prepare(context(), "GET", "/api/console/v1/pages", Some(("session","alice"))).await.ok().unwrap();
            assert!(!misconfigured_member.admits_administrator(&member_context));
            let filtered = misconfigured_member.filter_catalog(&member_context, "/api/console/v1/pages", Json(catalog_value.clone()).into_response()).await;
            let value: serde_json::Value = serde_json::from_slice(&filtered.into_body().collect(4096).await.unwrap()).unwrap();
            assert_eq!(value["mounts"], serde_json::json!([]));
            let application = crate::console_application(crate::ConsoleConfig::from_plugin(&crate::ConsolePluginConfig::defaults()).unwrap(), pages);
            for (method,path) in [("GET",module.to_owned()), ("POST",format!("/api/console/v1/pages/{admin_id}/services/example/invoke/read"))] {
                let request = serde_json::json!({"body":"","headers":[],"method":method,"path":path,"path_parameters":[],"request_id":"admin-boundary","route_id":"console.shell","credential":{"scheme":"session","value":"alice"}});
                let denied = crate::lenso_http::buffered(application.clone(),misconfigured_member.clone(),context(),serde_json::from_value(request.clone()).unwrap()).await.unwrap();
                assert_eq!(denied.status,403);
                assert_eq!(serde_json::from_slice::<serde_json::Value>(denied.body.as_ref()).unwrap()["code"],"console_administrator_required");
                let stream = crate::lenso_http::streaming(application.clone(),misconfigured_member.clone(),context(),serde_json::from_value(request).unwrap()).await.unwrap();
                let lenso_kernel::NativeStreamItem::Message(head) = lenso_kernel::NativeStreamSession::receive(&stream).await.unwrap() else {panic!("expected head")};
                let head = head.downcast::<lenso_capability_http_stream_endpoint::HandleResponse>().unwrap();
                assert_eq!(head.status,Some(403));
            }
            let permitted = crate::lenso_http::buffered(application,boundary.clone(),context(),serde_json::from_value(serde_json::json!({"body":"","headers":[],"method":"GET","path":module,"path_parameters":[],"request_id":"admin-boundary","route_id":"console.shell","credential":{"scheme":"session","value":"alice"}})).unwrap()).await.unwrap();
            assert_eq!(permitted.status,200);

            let operators_boundary=SessionBoundary {assistant_access:None,operators_profile:Some(OperatorsProfile {deployment:"alpha".into(),issuer:"operators".into(),public_key:ActorAssertionIssuer::from_signing_key("operators",[8;32]).public_key_base64(),max_assertion_ttl_seconds:300,human_interface:false,management_enabled:true,administrator_workspace_ids:vec![]}),access_control:Some(access::AccessControlClient::new(app.handle::<access::AccessControl>("caller").unwrap())),required:true,administrator_subjects:vec![],member_workspace_ids:vec!["projects".into()],auth:boundary.auth.clone()};
            assert_eq!(operators_boundary.prepare(context(),"GET","/api/console/v1/pages",Some(("session","alice"))).await.err().unwrap().status(),StatusCode::FORBIDDEN);
            factory.operators.set(true);
            assert!(operators_boundary.prepare(context(),"GET","/api/console/v1/pages",Some(("session","alice"))).await.is_ok());
            let stale = operators_boundary.prepare_for_subject(context(),"POST","/api/console/v1/management/invoke",Some(("session","bob")),Some("alice")).await.err().unwrap();
            assert_eq!(stale.status(), StatusCode::PRECONDITION_FAILED);
            assert_eq!(stale.headers()[http::header::CACHE_CONTROL], "no-store");
            let problem: serde_json::Value = serde_json::from_slice(&stale.into_body().collect(4096).await.unwrap()).unwrap();
            assert_eq!(problem["code"], "session_changed");
            factory.delegated.set(true);
            assert_eq!(operators_boundary.prepare(context(),"GET","/api/console/v1/pages",Some(("session","alice"))).await.err().unwrap().status(),StatusCode::FORBIDDEN);
            factory.delegated.set(false);

            for bypass in ["/api/console/v1/apps/alpha/invoke","/api/console/v1/agent/turns","/api/console/v1/configuration"] {
                assert_eq!(operators_boundary.prepare(context(),"POST",bypass,Some(("session","alice"))).await.err().unwrap().status(),StatusCode::FORBIDDEN);
            }
            factory.permission.set(false);
            assert_eq!(operators_boundary.prepare(context(),"GET","/api/console/v1/pages",Some(("session","alice"))).await.err().unwrap().status(),StatusCode::FORBIDDEN);
            factory.operators.set(false);
            factory.revoked.set(true);
            assert_eq!(
                boundary
                    .prepare(context(), "GET", "/api/private", Some(("session", "alice")))
                    .await
                    .err()
                    .unwrap()
                    .status(),
                StatusCode::UNAUTHORIZED
            );
            factory.unavailable.set(true);
            assert_eq!(
                boundary
                    .prepare(context(), "GET", "/api/private", Some(("session", "bob")))
                    .await
                    .err()
                    .unwrap()
                    .status(),
                StatusCode::SERVICE_UNAVAILABLE
            );
            assert_eq!(
                app.shutdown(Duration::from_secs(1)).await,
                lenso_kernel::ShutdownOutcome::Clean
            );
        }))
        .await;
}

#[tokio::test(flavor = "current_thread")]
async fn missing_required_provider_fails_closed_and_local_mode_is_explicit() {
    let required = SessionBoundary {
        assistant_access: None,
        operators_profile: None,
        access_control: None,
        required: true,
        administrator_subjects: vec![],
        member_workspace_ids: vec![],
        auth: None,
    };
    assert_eq!(
        required
            .prepare(context(), "GET", "/api/private", None)
            .await
            .err()
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let local = SessionBoundary {
        assistant_access: None,
        operators_profile: None,
        access_control: None,
        required: false,
        administrator_subjects: vec![],
        member_workspace_ids: vec![],
        auth: None,
    };
    assert!(
        local
            .prepare(context(), "GET", "/api/private", None)
            .await
            .is_ok()
    );
    let response = local
        .prepare(context(), "GET", "/api/console/v1/session", None)
        .await
        .err()
        .unwrap();
    assert_eq!(response.headers()["x-lenso-read-scope"], "local");
    let body = response.into_body().collect(4096).await.unwrap();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["mode"], "local");
    assert_eq!(value["authenticated"], false);
}

// Session snapshots must partition equal subject names by admitted realm/audience,
// while proof renewal alone must not turn every cached return into a first read.
#[test]
fn read_scope_partitions_admission_without_caching_proofs_or_renewal_times() {
    let issuer = ActorAssertionIssuer::from_signing_key("test.issuer", [7; 32]);
    let now = time::OffsetDateTime::now_utc();
    let assertion = |subject: &str, audience: &str, offset: i64| {
        issuer.issue(
            subject,
            "user",
            "password",
            [audience.to_owned()],
            Validity::new(
                now + time::Duration::seconds(offset),
                now + time::Duration::minutes(1) + time::Duration::seconds(offset),
            )
            .unwrap(),
            BTreeMap::new(),
        )
    };
    let digest = |actor: &ActorAssertion, realm: &str| {
        with_read_scope(
            session_response(
                "required",
                Some(actor.subject()),
                false,
                &[],
                false,
                false,
                false,
            ),
            actor,
            realm,
            "fixture-authority",
        )
        .headers()["x-lenso-read-scope"]
            .to_str()
            .unwrap()
            .to_owned()
    };
    let original = assertion("same-name", "endpoint:read", 0);
    let scope = digest(&original, "realm-a");
    assert_eq!(scope.len(), 64);
    assert!(!scope.contains(original.proof()));
    assert_eq!(
        scope,
        digest(&assertion("same-name", "endpoint:read", 1), "realm-a")
    );
    assert_ne!(scope, digest(&original, "realm-b"));
    assert_ne!(
        scope,
        digest(&assertion("another-user", "endpoint:read", 0), "realm-a")
    );
    assert_ne!(
        scope,
        digest(&assertion("same-name", "another:endpoint", 0), "realm-a")
    );
}

#[tokio::test]
async fn session_errors_are_problem_details() {
    let response = problem(StatusCode::UNAUTHORIZED, "authentication_required");
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        response.headers()[http::header::CONTENT_TYPE],
        "application/problem+json"
    );
    let body = response.into_body().collect(4096).await.unwrap();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["type"], "about:blank");
    assert_eq!(value["status"], 401);
    assert_eq!(value["title"], "Unauthorized");
    assert_eq!(value["detail"], "Sign in to continue.");
    assert_eq!(value["code"], "authentication_required");
}

// Existing Auth tests cover legacy admins and operators management, not an explicit
// admin-workspace grant across two independently resolved Auth provider instances.
#[tokio::test(flavor = "current_thread")]
async fn fixed_auth_instances_only_admit_explicit_operator_workspaces() {
    tokio::task::LocalSet::new().run_until(Box::pin(async {
        let factory = Factory { revoked:Rc::new(Cell::new(false)), unavailable:Rc::new(Cell::new(false)),operators:Rc::new(Cell::new(false)),permission:Rc::new(Cell::new(true)),delegated:Rc::new(Cell::new(false)),auth_calls:Rc::new(Cell::new(0)) };
        let callers = ["user-console", "admin-console"];
        let providers = ["account-auth", "operator-auth"];
        let mut instances = Vec::new();
        let mut bindings = Vec::new();
        for (caller,provider) in callers.into_iter().zip(providers) {
            instances.push(PluginInstancePlan::new(caller,"test.session.caller").with_requirement(CapabilityRequirementPlan::one(auth::CAPABILITY_ID,auth::DESCRIPTOR_VERSION)).with_requirement(CapabilityRequirementPlan::one(access::CAPABILITY_ID,access::DESCRIPTOR_VERSION)));
            instances.push(PluginInstancePlan::new(provider,"test.session.auth").with_capability(CapabilityEndpointPlan::new(auth::CAPABILITY_ID,auth::DESCRIPTOR_VERSION,[auth::AUTHENTICATE_OPERATION])).with_capability(CapabilityEndpointPlan::new(access::CAPABILITY_ID,access::DESCRIPTOR_VERSION,[access::CHECK_PERMISSION_OPERATION])));
            bindings.push(CapabilityBinding::new(caller,auth::CAPABILITY_ID,auth::DESCRIPTOR_VERSION,provider));
            bindings.push(CapabilityBinding::new(caller,access::CAPABILITY_ID,access::DESCRIPTOR_VERSION,provider));
        }
        // Real Console lifecycle connects fixed Auth/Access ports. A workspace-only
        // operator configuration must activate without a fake Management provider.
        let lifecycle_root = tempfile::tempdir().unwrap();
        std::fs::write(lifecycle_root.path().join("index.html"),"<head></head>").unwrap();
        for (key, provider, shell, api, auth_base, operator) in [
            ("real-console/user", "account-auth", "/console", "/console/api", "/auth", false),
            ("real-console/admin", "operator-auth", "/admin", "/admin/api", "/auth/operator", true),
        ] {
            let mut config = crate::ConsolePluginConfig::defaults();
            config.web_root = lifecycle_root.path().to_str().unwrap().into();
            config.require_user_session = true;
            config.http_paths = crate::ConsoleHttpPaths {shell_base_path:shell.into(),api_base_path:api.into(),auth_base_path:auth_base.into()};
            config.member_workspace_ids = if operator {vec![]} else {vec!["user".into()]};
            if operator {
                config.operators_profile = Some(OperatorsProfile {deployment:"alpha".into(),issuer:"operators".into(),public_key:ActorAssertionIssuer::from_signing_key("operators",[8;32]).public_key_base64(),max_assertion_ttl_seconds:300,human_interface:false,management_enabled:false,administrator_workspace_ids:vec!["admin".into()]});
            }
            let instance = PluginInstancePlan::new(key,"lenso.console.web")
                .with_configuration(serde_json::to_string(&config).unwrap())
                .with_capability(CapabilityEndpointPlan::new(lenso_capability_http_endpoint::CAPABILITY_ID,lenso_capability_http_endpoint::DESCRIPTOR_VERSION,[lenso_capability_http_endpoint::DESCRIBE_OPERATION,lenso_capability_http_endpoint::HANDLE_OPERATION]))
                .with_capability(CapabilityEndpointPlan::new(lenso_capability_http_stream_endpoint::CAPABILITY_ID,lenso_capability_http_stream_endpoint::DESCRIPTOR_VERSION,[lenso_capability_http_stream_endpoint::DESCRIBE_STREAM_OPERATION,lenso_capability_http_stream_endpoint::HANDLE_STREAM_OPERATION]).with_stream_operation(lenso_capability_http_stream_endpoint::HANDLE_STREAM_OPERATION))
                .with_requirement(CapabilityRequirementPlan::one(auth::CAPABILITY_ID,auth::DESCRIPTOR_VERSION));
            bindings.push(CapabilityBinding::new(key,auth::CAPABILITY_ID,auth::DESCRIPTOR_VERSION,provider));
            add_console_ingress(&mut instances,&mut bindings,key);
            if operator {
                instances.push(instance.with_requirement(CapabilityRequirementPlan::one(access::CAPABILITY_ID,access::DESCRIPTOR_VERSION)));
                bindings.push(CapabilityBinding::new(key,access::CAPABILITY_ID,access::DESCRIPTOR_VERSION,provider));
            } else {
                instances.push(instance);
            }
        }
        let app = start_fixed_console_app(instances,bindings,&factory).await;
        assert_real_console_http_instances(&app,&factory).await;
        let user = SessionBoundary { assistant_access:None, required:true,administrator_subjects:vec![],member_workspace_ids:vec!["user".into()],auth:Some(AuthClient::new(app.handle::<auth::Auth>("user-console").unwrap())),operators_profile:None,access_control:None };
        let mut admin = SessionBoundary {assistant_access:None,required:true,administrator_subjects:vec![],member_workspace_ids:vec![],auth:Some(AuthClient::new(app.handle::<auth::Auth>("admin-console").unwrap())),operators_profile:Some(OperatorsProfile {deployment:"alpha".into(),issuer:"operators".into(),public_key:ActorAssertionIssuer::from_signing_key("operators",[8;32]).public_key_base64(),max_assertion_ttl_seconds:300,human_interface:false,management_enabled:false,administrator_workspace_ids:vec!["admin".into()]}),access_control:Some(access::AccessControlClient::new(app.handle::<access::AccessControl>("admin-console").unwrap()))};
        let credential = Some(("session","alice"));
        assert!(user.prepare(context(),"GET","/api/console/v1/pages/user/assets/file",credential).await.is_ok());
        assert_eq!(user.prepare(context(),"POST","/api/console/v1/pages/admin/services/manage/invoke/update",credential).await.err().unwrap().status(),StatusCode::FORBIDDEN);
        let prepared = admin.prepare(context(),"POST","/api/console/v1/pages/admin/services/manage/invoke/update",credential).await.ok().unwrap();
        assert!(!admin.admits_administrator(&prepared));
        assert!(admin.admits_workspace_administrator(&prepared,"/api/console/v1/pages/admin/assets/file"));
        assert!(!admin.admits_workspace_administrator(&prepared,"/api/console/v1/pages/other/assets/file"));
        let filtered = admin.filter_catalog(&prepared,"/api/console/v1/pages",Json(serde_json::json!({"schema":"console.page-catalog/1","mounts":[{"id":"admin","access":"administrator"},{"id":"other","access":"administrator"},{"id":"user","access":"member"}]})).into_response()).await;
        let value:serde_json::Value = serde_json::from_slice(&filtered.into_body().collect(4096).await.unwrap()).unwrap();
        assert_eq!(value["mounts"],serde_json::json!([{"id":"admin","access":"administrator"}]));
        let session = admin.prepare(context(),"GET","/api/console/v1/session",credential).await.err().unwrap();
        let value:serde_json::Value = serde_json::from_slice(&session.into_body().collect(8192).await.unwrap()).unwrap();
        assert_eq!(value["administrator"],false);
        assert_eq!(value["management_enabled"],false);
        assert_eq!(admin.prepare(context(),"GET","/api/console/v1/management/catalog",credential).await.err().unwrap().status(),StatusCode::FORBIDDEN);
        assert_eq!(value["workspace_ids"],serde_json::json!(["admin"]));
        assert_eq!(admin.prepare(context(),"POST","/api/console/v1/configuration",credential).await.err().unwrap().status(),StatusCode::FORBIDDEN);
        assert_eq!(admin.prepare(context(),"GET","/api/console/v1/pages/other/assets/file",credential).await.err().unwrap().status(),StatusCode::FORBIDDEN);
        factory.permission.set(false);
        assert_eq!(admin.prepare(context(),"POST","/api/console/v1/pages/admin/services/manage/invoke/update",credential).await.err().unwrap().status(),StatusCode::FORBIDDEN);
        factory.permission.set(true);

        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("index.html"),"<head></head>").unwrap();
        let contribution = serde_json::from_value(serde_json::json!({"assets":[{"path":"page.mjs","media_type":"text/javascript; charset=utf-8","content_base64":"ZXhwb3J0IGNvbnN0IGFwaU1ham9yPTE7"}],"module":"page.mjs","navigation":{"label":"Admin","items":[]},"requirements":[],"revision":"fixture","styles":[],"title":"Admin","workspace_id":"admin","workspaces":[{"id":"admin","title":"Admin","path":"/admin","access":"administrator","index":[],"routes":[[]],"navigation":{"label":"Admin","items":[]}}]})).unwrap();
        let catalog = crate::page_contributions::PageCatalog::from_contributions(vec![("admin-fixture/default".into(),contribution)],&std::collections::BTreeSet::new()).unwrap();
        let listing = catalog.handle(&crate::http::Request::new(http::Method::GET,"/api/console/v1/pages")).await.unwrap();
        let value:serde_json::Value = serde_json::from_slice(&listing.into_body().collect(8192).await.unwrap()).unwrap();
        let id = value["mounts"][0]["id"].as_str().unwrap();
        let module = value["mounts"][0]["module"].as_str().unwrap();
        admin.operators_profile.as_mut().unwrap().administrator_workspace_ids.push(id.into());
        let mut config = crate::ConsolePluginConfig::defaults();
        config.web_root = root.path().to_str().unwrap().into();
        config.http_paths = crate::ConsoleHttpPaths {shell_base_path:"/admin".into(),api_base_path:"/admin/api".into(),auth_base_path:"/auth/operator".into()};
        let admin_application = crate::console_application(crate::ConsoleConfig::from_plugin(&config).unwrap(),catalog.clone());
        let request = |path:String| lenso_capability_http_endpoint::HandleRequest {route_id:"console.api.get".into(),request_id:"fixed-auth-fixture".into(),method:"GET".into(),path,path_parameters:vec![],query:None,headers:vec![],credential:Some(lenso_capability_http_endpoint::HandleRequestCredential {scheme:"session".into(),value:"alice".into()}),body:Vec::new().into()};
        let response = crate::lenso_http::buffered(admin_application.clone(),admin.clone(),context(),request(format!("/admin{module}"))).await.unwrap();
        assert_eq!(response.status,200);
        assert_eq!(response.body.as_ref(), b"export const apiMajor=1;");
        let calls = factory.auth_calls.get();
        let response = crate::lenso_http::buffered(admin_application.clone(),admin.clone(),context(),request(format!("/console{module}"))).await.unwrap();
        assert_eq!(response.status,404);
        assert_eq!(factory.auth_calls.get(),calls);
        let response = crate::lenso_http::buffered(admin_application.clone(),admin.clone(),context(),request("/admin/api/console/v1/pages/unspecified/assets/file/page.mjs".into())).await.unwrap();
        assert_eq!(response.status,403);
        config.http_paths = crate::ConsoleHttpPaths {shell_base_path:"/console".into(),api_base_path:"/console/api".into(),auth_base_path:"/auth".into()};
        let user_application = crate::console_application(crate::ConsoleConfig::from_plugin(&config).unwrap(),catalog);
        let response = crate::lenso_http::buffered(user_application,user.clone(),context(),request(format!("/console{module}"))).await.unwrap();
        assert_eq!(response.status,403);
        factory.permission.set(false);
        let response = crate::lenso_http::buffered(admin_application,admin.clone(),context(),request(format!("/admin{module}"))).await.unwrap();
        assert_eq!(response.status,403);
        factory.permission.set(true);
        admin.auth = user.auth.clone();
        assert_eq!(admin.prepare(context(),"GET","/api/console/v1/pages/admin/assets/file",credential).await.err().unwrap().status(),StatusCode::FORBIDDEN);
        assert_eq!(app.shutdown(Duration::from_secs(1)).await,lenso_kernel::ShutdownOutcome::Clean);
    })).await;
}

async fn assert_default_management_requires_provider(
    instances: &[PluginInstancePlan],
    bindings: &[CapabilityBinding],
    factory: &Factory,
) {
    let default_instances = instances
        .iter()
        .map(|instance| {
            if instance.instance_key() == "real-console/admin" {
                let mut config: serde_json::Value =
                    serde_json::from_str(instance.configuration()).unwrap();
                config["operators_profile"]
                    .as_object_mut()
                    .unwrap()
                    .remove("management_enabled");
                instance.clone().with_configuration(config.to_string())
            } else {
                instance.clone()
            }
        })
        .collect();
    let default_result = Kernel::start_native(
        AppComposition::new(default_instances, bindings.to_vec())
            .resolve()
            .unwrap(),
        TokioDriver::new(),
        NativePluginRegistry::new()
            .with_linked_factories()
            .with_factory(Caller)
            .with_factory(factory.clone()),
    )
    .await;
    assert!(format!("{:?}", default_result.err().unwrap()).contains("Management binding"));
}

// Exercise the activated Console endpoints through their resolved Kernel bindings,
// in addition to testing the asset adapter with an explicit fixture catalog.
async fn assert_real_console_http_instances(app: &lenso_kernel::NativeApp, factory: &Factory) {
    use lenso_capability_http_endpoint as endpoint;
    for (caller, own, other) in [
        ("real-console/user/ingress", "/console/api", "/admin/api"),
        ("real-console/admin/ingress", "/admin/api", "/console/api"),
    ] {
        let client = app.handle::<endpoint::EndpointHandle>(caller).unwrap();
        let request = |prefix: &str| endpoint::HandleRequest {
            route_id: "console.api.get".into(),
            request_id: "resolved-console-instance".into(),
            method: "GET".into(),
            path: format!("{prefix}/console/v1/session"),
            path_parameters: vec![],
            query: None,
            headers: vec![],
            credential: Some(endpoint::HandleRequestCredential {
                scheme: "session".into(),
                value: "alice".into(),
            }),
            body: Vec::new().into(),
        };
        let response = client
            .invoke(endpoint::HANDLE_OPERATION, request(own))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(response.status, 200, "{caller}: {:?}", response.body);
        let value: serde_json::Value = serde_json::from_slice(response.body.as_ref()).unwrap();
        assert_eq!(value["subject"], "alice");
        assert_eq!(value["administrator"], false);
        assert_eq!(value["management_enabled"], false);
        let calls = factory.auth_calls.get();
        let response = client
            .invoke(endpoint::HANDLE_OPERATION, request(other))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(response.status, 404);
        assert_eq!(factory.auth_calls.get(), calls);
        factory.permission.set(false);
        let response = client
            .invoke(endpoint::HANDLE_OPERATION, request(own))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(response.status, if own == "/admin/api" { 403 } else { 200 });
        factory.permission.set(true);
    }
}

fn add_console_ingress(
    instances: &mut Vec<PluginInstancePlan>,
    bindings: &mut Vec<CapabilityBinding>,
    key: &str,
) {
    use lenso_capability_http_endpoint as endpoint;
    let ingress = format!("{key}/ingress");
    instances.push(
        PluginInstancePlan::new(&ingress, "test.session.caller").with_requirement(
            CapabilityRequirementPlan::one(endpoint::CAPABILITY_ID, endpoint::DESCRIPTOR_VERSION),
        ),
    );
    bindings.push(CapabilityBinding::new(
        &ingress,
        endpoint::CAPABILITY_ID,
        endpoint::DESCRIPTOR_VERSION,
        key,
    ));
}

async fn start_fixed_console_app(
    instances: Vec<PluginInstancePlan>,
    bindings: Vec<CapabilityBinding>,
    factory: &Factory,
) -> lenso_kernel::NativeApp {
    assert_default_management_requires_provider(&instances, &bindings, factory).await;
    Kernel::start_native(
        AppComposition::new(instances, bindings).resolve().unwrap(),
        TokioDriver::new(),
        NativePluginRegistry::new()
            .with_linked_factories()
            .with_factory(Caller)
            .with_factory(factory.clone()),
    )
    .await
    .unwrap()
}
