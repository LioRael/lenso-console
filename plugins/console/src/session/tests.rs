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
}
impl NativePluginFactory for Factory {
    fn package_id(&self) -> &'static str {
        "test.session.auth"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        Ok(NativePluginInstance::new(vec![
            Rc::new(auth::AuthEndpoint::new(self.clone())),
            Rc::new(access::AccessControlEndpoint::new(self.clone())),
        ]))
    }
}
impl auth::AuthProvider for Factory {
    fn authenticate(
        &self,
        _: InvocationContext,
        request: auth::AuthRequest,
    ) -> NativeRequestFuture<auth::Auth> {
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
            let operators_boundary=SessionBoundary {assistant_access:None,operators_profile:Some(OperatorsProfile {deployment:"alpha".into(),issuer:"operators".into(),public_key:ActorAssertionIssuer::from_signing_key("operators",[8;32]).public_key_base64(),max_assertion_ttl_seconds:300,human_interface:false}),access_control:Some(access::AccessControlClient::new(app.handle::<access::AccessControl>("caller").unwrap())),required:true,administrator_subjects:vec![],member_workspace_ids:vec!["projects".into()],auth:boundary.auth.clone()};
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
    let body = response.into_body().collect(4096).await.unwrap();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["mode"], "local");
    assert_eq!(value["authenticated"], false);
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
