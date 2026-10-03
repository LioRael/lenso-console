//! Real ingress proof: one linked page implementation, two independent owners.
use super::*;
use lenso_app_plan::{
    AppComposition, CapabilityBinding, CapabilityEndpointPlan, PluginInstancePlan,
};
use lenso_auth_sdk::{ActorAssertionIssuer, Validity, authenticated_response};
use lenso_capability_auth as auth;
use lenso_capability_ui_contribution as ui;
use lenso_capability_workspace_service as service;
use lenso_console_plugin::ConsolePluginConfig;
use lenso_native_adapter::{NativePluginFactory, NativePluginFactoryContext, NativePluginInstance};
use serde_json::{Value, json};
use std::{rc::Rc, time::Duration};

#[derive(Clone, Debug)]
struct FixtureAuth;
impl NativePluginFactory for FixtureAuth {
    fn package_id(&self) -> &'static str {
        "test.instance.auth"
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, lenso_kernel::RuntimeFailure> {
        Ok(NativePluginInstance::new(vec![Rc::new(
            auth::AuthEndpoint::new(self.clone()),
        )]))
    }
}
impl auth::AuthProvider for FixtureAuth {
    fn authenticate(
        &self,
        _: lenso_kernel::InvocationContext,
        request: auth::AuthRequest,
    ) -> lenso_kernel::NativeRequestFuture<auth::Auth> {
        Box::pin(async move {
            let Some(credential) = request.credential else {
                return Ok(Ok(lenso_auth_sdk::absent_response()));
            };
            let subject = if credential.value == "bob" {
                "bob"
            } else {
                "alice"
            };
            let issuer = ActorAssertionIssuer::from_signing_key(
                if credential.value == "foreign" {
                    "foreign"
                } else {
                    "instance-fixture"
                },
                [42; 32],
            );
            let audiences = if credential.value == "wrong-audience" {
                vec![lenso_auth_sdk::audience(
                    service::CAPABILITY_ID,
                    "describe_exports",
                )]
            } else {
                vec![lenso_auth_sdk::audience(
                    service::CAPABILITY_ID,
                    service::INVOKE_OPERATION,
                )]
            };
            let now = time::OffsetDateTime::now_utc();
            let assertion = issuer.issue(
                subject,
                "user",
                "fixture",
                audiences,
                Validity::new(now, now + time::Duration::minutes(1)).unwrap(),
                BTreeMap::new(),
            );
            Ok(Ok(authenticated_response(&assertion)))
        })
    }
}

fn plan(
    config: &ConsoleAppConfig,
    public_key: &str,
    plugin: &ConsolePluginConfig,
) -> ResolvedAppPlan {
    let base = console_host_plan(config).unwrap();
    let mut instances = base
        .plugin_instances()
        .iter()
        .map(|instance| {
            if instance.instance_key() == "lenso.console.web/default" {
                instance
                    .clone()
                    .with_configuration(serde_json::to_string(plugin).unwrap())
            } else {
                instance.clone()
            }
        })
        .collect::<Vec<_>>();
    let mut bindings = base.capability_bindings().to_vec();
    instances.push(
        PluginInstancePlan::new("test.instance.auth/default", "test.instance.auth")
            .with_capability(CapabilityEndpointPlan::new(
                auth::CAPABILITY_ID,
                auth::DESCRIPTOR_VERSION,
                [auth::AUTHENTICATE_OPERATION],
            )),
    );
    bindings.push(CapabilityBinding::new(
        "lenso.console.web/default",
        auth::CAPABILITY_ID,
        auth::DESCRIPTOR_VERSION,
        "test.instance.auth/default",
    ));
    for (key, subject) in [("alpha", "alice"), ("beta", "bob")] {
        let owner = format!("lenso.console.workspace.welcome/{key}");
        instances.push(PluginInstancePlan::new(&owner, "lenso.console.workspace.welcome")
            .with_configuration(json!({ "label": key, "authorization": { "issuer": "instance-fixture", "public_key": public_key, "subject": subject } }).to_string())
            .with_capability(CapabilityEndpointPlan::new(ui::CAPABILITY_ID, ui::DESCRIPTOR_VERSION, [ui::DESCRIBE_CONTRIBUTION_OPERATION]))
            .with_capability(CapabilityEndpointPlan::new(service::CAPABILITY_ID, service::DESCRIPTOR_VERSION, [service::DESCRIBE_EXPORTS_OPERATION, service::INVOKE_OPERATION, service::SUBSCRIBE_OPERATION]).with_stream_operation(service::SUBSCRIBE_OPERATION)));
        for (capability, version) in [
            (ui::CAPABILITY_ID, ui::DESCRIPTOR_VERSION),
            (service::CAPABILITY_ID, service::DESCRIPTOR_VERSION),
        ] {
            bindings.push(CapabilityBinding::new(
                "lenso.console.web/default",
                capability,
                version,
                &owner,
            ));
        }
    }
    AppComposition::new(instances, bindings).resolve().unwrap()
}

async fn call(
    client: &reqwest::Client,
    origin: &str,
    mount: &Value,
    actor: &str,
    operation: &str,
    input: Value,
) -> reqwest::Response {
    client
        .post(format!(
            "{origin}/api/console/v1/pages/{}/services/welcome/invoke/{operation}",
            mount["id"].as_str().unwrap()
        ))
        .bearer_auth(actor)
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

// Single-owner Host tests cannot catch page-ID collision, owner config/log bleed,
// an idle owner blocking the dispatcher, or shared code granting a second scope.
#[tokio::test(flavor = "current_thread")]
#[allow(clippy::too_many_lines)]
async fn two_instance_mounts_isolate_real_requests_configuration_logs_and_permissions() {
    tokio::task::LocalSet::new()
        .run_until(Box::pin(async {
            link();
            lenso_console_welcome_workspace_plugin::link();
            let root = tempfile::tempdir().unwrap();
            std::fs::write(root.path().join("index.html"), "<!doctype html>").unwrap();
            let mut plugin = ConsolePluginConfig::defaults();
            plugin.web_root = root.path().to_str().unwrap().into();
            plugin.require_user_session = true;
            plugin.administrator_subjects = vec!["alice".into(), "bob".into()];
            let mut config = ConsoleAppConfig::from_plugin(&plugin).unwrap();
            config.address = "127.0.0.1:0".parse().unwrap();
            let public_key = ActorAssertionIssuer::from_signing_key("instance-fixture", [42; 32])
                .public_key_base64();
            let ingress = WebIngressFactory::new();
            let app = Kernel::start_native(
                plan(&config, &public_key, &plugin),
                TokioDriver::new(),
                NativePluginRegistry::new()
                    .with_linked_factories()
                    .with_factory(ingress.clone())
                    .with_factory(FixtureAuth),
            )
            .await
            .unwrap();
            let origin = format!("http://{}", ingress.local_address().unwrap());
            let client = reqwest::Client::new();
            assert_eq!(
                client
                    .get(format!("{origin}/api/console/v1/pages"))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                401
            );
            let catalog: Value = client
                .get(format!("{origin}/api/console/v1/pages"))
                .bearer_auth("alice")
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            let mounts = catalog["mounts"].as_array().unwrap();
            assert_eq!(mounts.len(), 2);
            let alpha = mounts
                .iter()
                .find(|mount| mount["title"] == "alpha")
                .unwrap()
                .clone();
            let beta = mounts
                .iter()
                .find(|mount| mount["title"] == "beta")
                .unwrap()
                .clone();
            assert_ne!(alpha["id"], beta["id"]);
            assert_eq!(alpha["pageId"], "welcome");
            assert_eq!(alpha["pageId"], beta["pageId"]);
            assert_eq!(alpha["implementationId"], beta["implementationId"]);
            let mut bodies = Vec::new();
            for mount in [&alpha, &beta] {
                let module = client
                    .get(format!("{origin}{}", mount["module"].as_str().unwrap()))
                    .bearer_auth("alice")
                    .send()
                    .await
                    .unwrap();
                assert_eq!(module.status(), 200);
                bodies.push(module.text().await.unwrap());
            }
            assert_eq!(bodies[0], bodies[1]);
            assert_eq!(
                call(
                    &client,
                    &origin,
                    &alpha,
                    "alice",
                    "append_log",
                    json!({"message":"alpha-only"})
                )
                .await
                .status(),
                200
            );
            assert_eq!(
                call(
                    &client,
                    &origin,
                    &beta,
                    "bob",
                    "append_log",
                    json!({"message":"beta-only"})
                )
                .await
                .status(),
                200
            );
            for (mount, actor, label, entry) in [
                (&alpha, "alice", "alpha", "alpha-only"),
                (&beta, "bob", "beta", "beta-only"),
            ] {
                let state: Value = call(&client, &origin, mount, actor, "read_state", json!({}))
                    .await
                    .json()
                    .await
                    .unwrap();
                assert_eq!(state, json!({"label":label,"log":[entry]}));
            }
            for (mount, actor) in [
                (&alpha, "bob"),
                (&beta, "alice"),
                (&alpha, "wrong-audience"),
                (&alpha, "foreign"),
            ] {
                let denied = call(
                    &client,
                    &origin,
                    mount,
                    actor,
                    "append_log",
                    json!({"message":"denied"}),
                )
                .await;
                assert_eq!(denied.status(), 422);
                assert_eq!(
                    denied.json::<Value>().await.unwrap()["code"],
                    "workspace_service_denied"
                );
            }
            for field in ["owner", "revision", "implementationId"] {
                let mut forged = alpha.clone();
                forged[field] = if field == "owner" {
                    beta["owner"].clone()
                } else {
                    json!("retired")
                };
                let changed = call(
                    &client,
                    &origin,
                    &forged,
                    "alice",
                    "append_log",
                    json!({"message":"stale"}),
                )
                .await;
                assert_eq!(changed.status(), 409);
                assert_eq!(
                    changed.json::<Value>().await.unwrap()["code"],
                    "page_mount_changed"
                );
            }
            let after_denials: Value =
                call(&client, &origin, &alpha, "alice", "read_state", json!({}))
                    .await
                    .json()
                    .await
                    .unwrap();
            assert_eq!(after_denials["log"], json!(["alpha-only"]));
            // Alpha never completes until cancelled. Beta must still finish promptly.
            let started = lenso_console_welcome_workspace_plugin::started_slow_requests();
            let slow_client = client.clone();
            let slow_origin = origin.clone();
            let slow_alpha = alpha.clone();
            let slow = tokio::task::spawn_local(async move {
                call(
                    &slow_client,
                    &slow_origin,
                    &slow_alpha,
                    "alice",
                    "slow",
                    json!({}),
                )
                .await
            });
            tokio::time::timeout(Duration::from_secs(2), async {
                while lenso_console_welcome_workspace_plugin::started_slow_requests() == started {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .expect("slow request never entered its owner");
            let state = tokio::time::timeout(
                Duration::from_secs(2),
                call(&client, &origin, &beta, "bob", "read_state", json!({})),
            )
            .await
            .expect("alpha blocked beta");
            assert_eq!(state.status(), 200);
            slow.abort();
            let _ = slow.await;
            assert_eq!(
                app.shutdown(Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );
            // The existing Console member boundary admits an exact mount ID only.
            plugin.administrator_subjects.clear();
            plugin.member_workspace_ids = vec![alpha["id"].as_str().unwrap().into()];
            let mut member_config = ConsoleAppConfig::from_plugin(&plugin).unwrap();
            member_config.address = "127.0.0.1:0".parse().unwrap();
            let ingress = WebIngressFactory::new();
            let member = Kernel::start_native(
                plan(&member_config, &public_key, &plugin),
                TokioDriver::new(),
                NativePluginRegistry::new()
                    .with_linked_factories()
                    .with_factory(ingress.clone())
                    .with_factory(FixtureAuth),
            )
            .await
            .unwrap();
            let origin = format!("http://{}", ingress.local_address().unwrap());
            let visible: Value = client
                .get(format!("{origin}/api/console/v1/pages"))
                .bearer_auth("alice")
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            assert_eq!(visible["mounts"].as_array().unwrap().len(), 1);
            assert_eq!(visible["mounts"][0]["id"], alpha["id"]);
            assert_eq!(
                call(&client, &origin, &alpha, "alice", "read_state", json!({}))
                    .await
                    .status(),
                200
            );
            assert_eq!(
                call(&client, &origin, &beta, "alice", "read_state", json!({}))
                    .await
                    .status(),
                403
            );
            assert_eq!(
                client
                    .get(format!("{origin}{}", beta["module"].as_str().unwrap()))
                    .bearer_auth("alice")
                    .send()
                    .await
                    .unwrap()
                    .status(),
                403
            );
            assert_eq!(
                member.shutdown(Duration::from_secs(2)).await,
                ShutdownOutcome::Clean
            );
        }))
        .await;
}
