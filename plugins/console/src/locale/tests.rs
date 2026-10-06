//! Real generated client/endpoint fixture; in-memory persistence is test-only.
use super::*;
use lenso_app_plan::{
    AppComposition, CapabilityBinding, CapabilityEndpointPlan, CapabilityRequirementPlan,
    PluginInstancePlan,
};
use lenso_auth_sdk::{ActorAssertionIssuer, Validity};
use lenso_capability_access_control as access;
use lenso_kernel::{InvocationContext, Kernel, NativeRequestFuture, RuntimeFailure};
use lenso_native_adapter::{
    NativePluginFactory, NativePluginFactoryContext, NativePluginInstance, NativePluginRegistry,
};
use lenso_runner::TokioDriver;
use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    rc::Rc,
};

#[derive(Clone, Debug, Default)]
struct Fixture {
    preferences: Rc<RefCell<BTreeMap<(String, String), Value>>>,
    default: Rc<RefCell<Option<String>>>,
    permit_default: Rc<Cell<bool>>,
}
impl NativePluginFactory for Fixture {
    fn package_id(&self) -> &'static str {
        "test.locale.fixture"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        Ok(NativePluginInstance::new(vec![
            Rc::new(store::LocaleStoreEndpoint::new(self.clone())),
            Rc::new(access::AccessControlEndpoint::new(self.clone())),
        ]))
    }
}
impl store::LocaleStoreProvider for Fixture {
    fn read_default(
        &self,
        _: InvocationContext,
        _: store::ReadDefaultRequest,
    ) -> NativeRequestFuture<store::LocaleStoreReadDefault> {
        let locale = self.default.borrow().clone();
        Box::pin(async move { Ok(Ok(store::ReadDefaultResponse { locale })) })
    }
    fn write_default(
        &self,
        _: InvocationContext,
        request: store::WriteDefaultRequest,
    ) -> NativeRequestFuture<store::LocaleStoreWriteDefault> {
        self.default.replace(request.locale.clone());
        Box::pin(async move {
            Ok(Ok(store::WriteDefaultResponse {
                locale: request.locale,
            }))
        })
    }
    fn read_preference(
        &self,
        context: InvocationContext,
        request: store::ReadPreferenceRequest,
    ) -> NativeRequestFuture<store::LocaleStoreReadPreference> {
        assert_actor_projection(&context, &request.authority, &request.subject);
        let preference = self
            .preferences
            .borrow()
            .get(&(request.authority, request.subject))
            .cloned()
            .unwrap_or(json!("global"));
        Box::pin(async move {
            Ok(Ok(
                serde_json::from_value(json!({"preference":preference})).unwrap()
            ))
        })
    }
    fn write_preference(
        &self,
        context: InvocationContext,
        request: store::WritePreferenceRequest,
    ) -> NativeRequestFuture<store::LocaleStoreWritePreference> {
        assert_actor_projection(&context, &request.authority, &request.subject);
        let preference = serde_json::to_value(request.preference).unwrap();
        self.preferences
            .borrow_mut()
            .insert((request.authority, request.subject), preference.clone());
        Box::pin(async move {
            Ok(Ok(
                serde_json::from_value(json!({"preference":preference})).unwrap()
            ))
        })
    }
}
impl access::AccessControlProvider for Fixture {
    fn check_permission(
        &self,
        _: InvocationContext,
        request: access::CheckPermissionRequest,
    ) -> NativeRequestFuture<access::AccessControl> {
        assert_eq!(request.permission, "console.locale.default.manage");
        assert_eq!(request.scope.kind, "deployment");
        assert_eq!(request.scope.id, "locale-test");
        let allowed = request.subject == "alice" && self.permit_default.get();
        Box::pin(async move {
            Ok(Ok(access::CheckPermissionResponse {
                allowed,
                policy_revision: "1".into(),
            }))
        })
    }
}
fn assert_actor_projection(context: &InvocationContext, authority: &str, subject: &str) {
    assert_eq!(context.caller_instance(), Some("caller"));
    let extension = context
        .sealed_extension(lenso_auth_sdk::ACTOR_ASSERTION_EXTENSION)
        .unwrap();
    let assertion: Value = serde_json::from_slice(extension.value()).unwrap();
    assert_eq!(extension.issuer(), authority);
    assert_eq!(assertion["issuer"], authority);
    assert_eq!(assertion["subject"], subject);
    assert_eq!(assertion["actor_kind"], "user");
}

#[derive(Debug)]
struct Caller;
impl NativePluginFactory for Caller {
    fn package_id(&self) -> &'static str {
        "test.locale.caller"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        Ok(NativePluginInstance::default())
    }
}
fn account_request(
    method: Method,
    path: &str,
    authority: &str,
    subject: &str,
    body: Value,
) -> Request {
    let now = time::OffsetDateTime::now_utc();
    let assertion = ActorAssertionIssuer::from_signing_key(authority, [7; 32]).issue(
        subject,
        "user",
        "password",
        [
            lenso_auth_sdk::audience(lenso_capability_http_endpoint::CAPABILITY_ID, "handle"),
            lenso_auth_sdk::audience(store::CAPABILITY_ID, store::READ_PREFERENCE_OPERATION),
            lenso_auth_sdk::audience(store::CAPABILITY_ID, store::WRITE_PREFERENCE_OPERATION),
            lenso_auth_sdk::audience(access::CAPABILITY_ID, access::CHECK_PERMISSION_OPERATION),
        ],
        Validity::new(now, now + time::Duration::minutes(1)).unwrap(),
        BTreeMap::new(),
    );
    let mut request = Request::new(method, path).with_body(body.to_string());
    request.context = assertion.attach(request.context).unwrap();
    request
}
async fn read(service: &LocaleService, authority: &str, subject: &str) -> Value {
    let response = service
        .handle(&account_request(
            Method::GET,
            "/api/console/v1/locale",
            authority,
            subject,
            Value::Null,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&response.into_body().collect(8192).await.unwrap()).unwrap()
}

// Prevent a verified ordinary account from being denied personal settings, crossing
// account/issuer boundaries, or bypassing the independent global-default permission.
#[tokio::test(flavor = "current_thread")]
#[allow(clippy::too_many_lines)]
async fn generated_store_enforces_personal_identity_and_independent_default_permission() {
    tokio::task::LocalSet::new()
        .run_until(async {
            let fixture = Fixture::default();
            let plan = AppComposition::new(
                vec![
                    PluginInstancePlan::new("caller", "test.locale.caller")
                        .with_requirement(CapabilityRequirementPlan::one(
                            store::CAPABILITY_ID,
                            store::DESCRIPTOR_VERSION,
                        ))
                        .with_requirement(CapabilityRequirementPlan::one(
                            access::CAPABILITY_ID,
                            access::DESCRIPTOR_VERSION,
                        )),
                    PluginInstancePlan::new("fixture", "test.locale.fixture")
                        .with_capability(CapabilityEndpointPlan::new(
                            store::CAPABILITY_ID,
                            store::DESCRIPTOR_VERSION,
                            [
                                store::READ_DEFAULT_OPERATION,
                                store::READ_PREFERENCE_OPERATION,
                                store::WRITE_DEFAULT_OPERATION,
                                store::WRITE_PREFERENCE_OPERATION,
                            ],
                        ))
                        .with_capability(CapabilityEndpointPlan::new(
                            access::CAPABILITY_ID,
                            access::DESCRIPTOR_VERSION,
                            [access::CHECK_PERMISSION_OPERATION],
                        )),
                ],
                vec![
                    CapabilityBinding::new(
                        "caller",
                        store::CAPABILITY_ID,
                        store::DESCRIPTOR_VERSION,
                        "fixture",
                    ),
                    CapabilityBinding::new(
                        "caller",
                        access::CAPABILITY_ID,
                        access::DESCRIPTOR_VERSION,
                        "fixture",
                    ),
                ],
            )
            .resolve()
            .unwrap();
            let app = Kernel::start_native(
                plan,
                TokioDriver::new(),
                NativePluginRegistry::new()
                    .with_factory(Caller)
                    .with_factory(fixture.clone()),
            )
            .await
            .unwrap();
            let service = LocaleService {
                store: Some(
                    store::LocaleStoreClient::from_dependencies(
                        &app.dependencies("caller").unwrap(),
                    )
                    .unwrap(),
                ),
                access: Some(access::AccessControlClient::new(
                    app.handle::<access::AccessControl>("caller").unwrap(),
                )),
                scope: Some(crate::session::AssistantPermission {
                    scope_kind: "deployment".into(),
                    scope_id: "locale-test".into(),
                }),
            };
            let response = service
                .handle(&account_request(
                    Method::PUT,
                    "/api/console/v1/locale/preference",
                    "accounts",
                    "alice",
                    json!({"preference":"zh-CN"}),
                ))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                read(&service, "accounts", "alice").await["preference"],
                "zh-CN"
            );
            assert_eq!(
                read(&service, "accounts", "bob").await["preference"],
                "global"
            );
            assert_eq!(
                read(&service, "other-issuer", "alice").await["preference"],
                "global"
            );
            let override_request = account_request(
                Method::PUT,
                "/api/console/v1/locale/preference",
                "accounts",
                "alice",
                json!({"preference":"en","subject":"bob"}),
            );
            assert_eq!(
                service.handle(&override_request).await.unwrap().status(),
                StatusCode::BAD_REQUEST
            );
            let default_request = account_request(
                Method::PUT,
                "/api/console/v1/locale/default",
                "accounts",
                "alice",
                json!({"locale":"en"}),
            );
            assert_eq!(
                service.handle(&default_request).await.unwrap().status(),
                StatusCode::FORBIDDEN
            );
            fixture.permit_default.set(true);
            let no_permission_scope = LocaleService {
                scope: None,
                ..service.clone()
            };
            assert_eq!(
                no_permission_scope
                    .handle(&default_request)
                    .await
                    .unwrap()
                    .status(),
                StatusCode::FORBIDDEN
            );
            assert_eq!(
                read(&no_permission_scope, "accounts", "alice").await["can_manage_default"],
                false
            );

            assert_eq!(
                service.handle(&default_request).await.unwrap().status(),
                StatusCode::OK
            );
            let alice = read(&service, "accounts", "alice").await;
            assert_eq!(alice["global_default"], "en");
            assert_eq!(alice["locale"], "zh-CN");
            assert_eq!(read(&service, "accounts", "bob").await["locale"], "en");
            let follow = account_request(
                Method::PUT,
                "/api/console/v1/locale/preference",
                "accounts",
                "alice",
                json!({"preference":"global"}),
            );
            assert_eq!(
                service.handle(&follow).await.unwrap().status(),
                StatusCode::OK
            );
            assert_eq!(read(&service, "accounts", "alice").await["locale"], "en");
            assert_eq!(
                app.shutdown(std::time::Duration::from_secs(1)).await,
                lenso_kernel::ShutdownOutcome::Clean
            );
        })
        .await;
}
