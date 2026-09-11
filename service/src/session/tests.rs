use super::*;
use lenso_app_plan::{
    AppComposition, CapabilityBinding, CapabilityEndpointPlan, CapabilityRequirementPlan,
    PluginInstancePlan,
};
use lenso_auth_sdk::{ActorAssertionIssuer, Validity, absent_response, authenticated_response};
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
}
impl NativePluginFactory for Factory {
    fn package_id(&self) -> &'static str {
        "test.session.auth"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        Ok(NativePluginInstance::new(vec![Rc::new(
            auth::AuthEndpoint::new(self.clone()),
        )]))
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
                let assertion = ActorAssertionIssuer::from_signing_key("test.issuer", [7; 32])
                    .issue(
                        credential.value,
                        "user",
                        "password",
                        ["example.query@1:read".to_owned()],
                        Validity::new(now, now + time::Duration::minutes(1)).unwrap(),
                        BTreeMap::new(),
                    );
                Ok(Ok(authenticated_response(&assertion)))
            }
        } else {
            Ok(Ok(absent_response()))
        };
        Box::pin(std::future::ready(result))
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
        .run_until(async {
            let factory = Factory {
                revoked: Rc::new(Cell::new(false)),
                unavailable: Rc::new(Cell::new(false)),
            };
            let plan = AppComposition::new(
                vec![
                    PluginInstancePlan::new("caller", "test.session.caller").with_requirement(
                        CapabilityRequirementPlan::one(
                            auth::CAPABILITY_ID,
                            auth::DESCRIPTOR_VERSION,
                        ),
                    ),
                    PluginInstancePlan::new("auth", "test.session.auth").with_capability(
                        CapabilityEndpointPlan::new(
                            auth::CAPABILITY_ID,
                            auth::DESCRIPTOR_VERSION,
                            [auth::AUTHENTICATE_OPERATION],
                        ),
                    ),
                ],
                vec![CapabilityBinding::new(
                    "caller",
                    auth::CAPABILITY_ID,
                    auth::DESCRIPTOR_VERSION,
                    "auth",
                )],
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
            let workspace_member = SessionBoundary { member_workspace_ids: vec!["projects".into()], ..member.clone() };
            let member_context = workspace_member.prepare(context(), "GET", "/api/console/v1/pages", Some(("session", "alice"))).await.ok().unwrap();
            let catalog = (StatusCode::OK, Json(serde_json::json!({"schema":"console.page-catalog/1","mounts":[{"id":"projects"},{"id":"observe"}]}))).into_response();
            let filtered = workspace_member.filter_catalog(&member_context, "/api/console/v1/pages", catalog).await;
            let bytes = filtered.into_body().collect(4096).await.unwrap();
            let filtered: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(filtered["mounts"], serde_json::json!([{"id":"projects"}]));
            assert!(workspace_member.prepare(context(), "POST", "/api/console/v1/pages/projects/services/projects/invoke/list_projects", Some(("session", "alice"))).await.is_ok());
            assert_eq!(workspace_member.prepare(context(), "GET", "/api/console/v1/pages/observe/services/telemetry/invoke/query", Some(("session", "alice"))).await.err().unwrap().status(), StatusCode::FORBIDDEN);
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
        })
        .await;
}

#[tokio::test(flavor = "current_thread")]
async fn missing_required_provider_fails_closed_and_local_mode_is_explicit() {
    let required = SessionBoundary {
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
