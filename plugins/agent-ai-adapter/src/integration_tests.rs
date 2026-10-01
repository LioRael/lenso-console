use super::*;
use crate::plugin::link;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use lenso_app_plan::{
    CapabilityRequirementPlan,
    authoring::{
        HostCatalog, HostDefaultPlugin, HostPluginRelease, HostSlot, PluginDescriptor,
        PluginRootSnapshot, resolve_plugin_root,
    },
};
use lenso_capability_workspace_service as service;
use lenso_kernel::{CancellationToken, InvocationContext, Kernel, RuntimeFailure, ShutdownOutcome};
use lenso_native_adapter::{
    NativePluginFactory, NativePluginFactoryContext, NativePluginInstance, NativePluginRegistry,
};
use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::Duration,
};

#[derive(Debug)]
struct Probe;
impl NativePluginFactory for Probe {
    fn package_id(&self) -> &'static str {
        "test.ai-probe"
    }
    fn package_version(&self) -> &'static str {
        "1.0.0"
    }
    fn factory_identity(&self) -> String {
        "1.0.0".into()
    }
    fn instantiate(
        &self,
        _: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        Ok(NativePluginInstance::default())
    }
}
struct Fixture(Child);
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn input(prompt: &str) -> service::InvokeRequest {
    service::InvokeRequest { service_id: "ai".into(), operation: "complete".into(), media_type: service::InvokeRequestMediaType::ApplicationJson,
        body_base64: STANDARD.encode(serde_json::to_vec(&serde_json::json!({"model":"fixture/readme-summary-v1","prompt":prompt,"max_output":64})).unwrap()) }
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires the locally built Agent Web fixture test executable"]
async fn native_binding_cross_process_completion_preserves_budget_and_zero_history() {
    tokio::task::LocalSet::new().run_until(Box::pin(async {
        let root = tempfile::tempdir().unwrap();
        let issuer = lenso_auth_sdk::ActorAssertionIssuer::from_signing_key("operators.fixture", [7; 32]);
        let binary = PathBuf::from(std::env::var("LENSO_AI_AGENT_TEST_BINARY").unwrap());
        let log = std::fs::File::create(root.path().join("agent-fixture.log")).unwrap();
        let mut child = Fixture(Command::new(binary).args(["--ignored", "--exact", "plugin_ai::tests::plugin_ai_fixture_process", "--nocapture"])
            .env("LENSO_AI_FIXTURE_ROOT",root.path()).env("LENSO_AI_FIXTURE_ISSUER","operators.fixture")
            .env("LENSO_AI_FIXTURE_PUBLIC_KEY",issuer.public_key_base64()).stdout(Stdio::from(log.try_clone().unwrap())).stderr(Stdio::from(log)).spawn().unwrap());
        let origin_path = root.path().join("fixture-origin");
        for _ in 0..100 {
            if origin_path.exists() { break; }
            assert!(child.0.try_wait().unwrap().is_none(), "Agent fixture failed: {}", std::fs::read_to_string(root.path().join("agent-fixture.log")).unwrap());
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let origin = std::fs::read_to_string(origin_path).unwrap();
        let assertion = |issuer: &lenso_auth_sdk::ActorAssertionIssuer, audiences: Vec<String>| {
            let now = time::OffsetDateTime::now_utc();
            issuer.issue("alice", "user", "fixture", audiences,
                lenso_auth_sdk::Validity::new(now - time::Duration::seconds(1), now + time::Duration::minutes(5)).unwrap(), Default::default())
        };
        let audiences = vec![lenso_auth_sdk::audience(service::CAPABILITY_ID,service::INVOKE_OPERATION), lenso_auth_sdk::audience("lenso.agent.model@4","complete")];
        let actor = assertion(&issuer,audiences.clone());
        let actor_header = STANDARD.encode(serde_json::to_vec(&actor.to_wire()).unwrap());
        let control = "synthetic-existing-host-control";
        let control_file = root.path().join("existing-host-control-token");
        std::fs::write(&control_file, control).unwrap();
        let http = reqwest::Client::new();
        let quote_body = serde_json::json!({"run_id":uuid::Uuid::new_v4().to_string(),"model":"fixture/readme-summary-v1","prompt":"What did you summarize?","max_output":64,"generation":null});
        assert_eq!(http.post(format!("{origin}/api/console/v1/agent/plugin-ai/quote")).json(&quote_body).send().await.unwrap().status(),403);
        assert_eq!(http.post(format!("{origin}/api/console/v1/agent/plugin-ai/quote")).header("x-lenso-actor", &actor_header).json(&quote_body).send().await.unwrap().status(),403);
        let quote: serde_json::Value = http.post(format!("{origin}/api/console/v1/agent/plugin-ai/quote")).header("x-lenso-actor",&actor_header).bearer_auth(control).json(&quote_body).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
        let ledger = root.path().join("console-usage.sqlite");
        link();
        let slots = [HostSlot::many("console-ai-adapters"), HostSlot::many("probe")];
        let linked = NativePluginRegistry::host_catalog(slots.clone(), []).unwrap();
        let probe = PluginDescriptor::new("test.ai-probe","1.0.0","probe")
            .with_requirement(CapabilityRequirementPlan::one(service::CAPABILITY_ID,service::DESCRIPTOR_VERSION));
        let releases = linked.plugins().iter().cloned().chain([HostPluginRelease::new(probe)]).collect::<Vec<_>>();
        let caller = HostCaller { consumer:"test.ai-probe/default".into(),user:"alice".into(),project:"project-one".into() };
        let profile = PurposeProfile { callers:[caller].into(), model:"fixture/readme-summary-v1".into(),price:Some(Price { version:"fixture-known-price/1".into(),input:1,output:2 }),budget:100000,max_output:64,concurrency:1 };
        let config = serde_json::json!({"agent_origin":origin,"ledger":ledger,"issuer":"operators.fixture","public_key":issuer.public_key_base64(),
            "provider_instance":quote["provider_instance"],"profile":profile,"control_token_file":control_file});
        let defaults = [HostDefaultPlugin::new("test.ai-probe","default"),HostDefaultPlugin::new("test.ai-probe","intruder"),
            HostDefaultPlugin::new("lenso.console.agent-ai-adapter","default").with_configuration(config)];
        let resolved = resolve_plugin_root(&HostCatalog::new(slots,releases,defaults),&PluginRootSnapshot::default()).unwrap();
        let registry = NativePluginRegistry::new().with_linked_factories().with_factory(Probe);
        let app = Kernel::start_native(resolved.plan().clone(),lenso_runner::TokioDriver::new(),registry).await.unwrap();
        let context = |actor: &lenso_auth_sdk::ActorAssertion, cancellation| actor.clone().attach(InvocationContext::new(1,None,cancellation)).unwrap();
        let handle = app.handle::<service::WorkspaceServiceInvoke>("test.ai-probe/default").unwrap();
        let response = handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("What did you summarize?")).await.unwrap().unwrap();
        let response: serde_json::Value = serde_json::from_slice(&STANDARD.decode(response.body_base64).unwrap()).unwrap();
        assert!(response["text"].as_str().unwrap().contains("Nothing yet"));
        assert_eq!(response["evidence"]["charged"],32);
        assert_eq!(response["evidence"]["caller"]["project"],"project-one");
        let intruder = app.handle::<service::WorkspaceServiceInvoke>("test.ai-probe/intruder").unwrap();
        assert!(intruder.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()).with_caller_instance("test.ai-probe/default"),input("What did you summarize?")).await.unwrap().is_err());
        let foreign = lenso_auth_sdk::ActorAssertionIssuer::from_signing_key("application.fixture",[8;32]);
        let wrong = assertion(&foreign,audiences.clone());
        let wrong_header = STANDARD.encode(serde_json::to_vec(&wrong.to_wire()).unwrap());
        assert_eq!(http.post(format!("{origin}/api/console/v1/agent/plugin-ai/quote")).bearer_auth(control).header("x-lenso-actor",wrong_header).json(&quote_body).send().await.unwrap().status(),403);
        assert!(handle.invoke_with_context(service::INVOKE_OPERATION,context(&wrong,CancellationToken::new()),input("What did you summarize?")).await.unwrap().is_err());
        let wrong_audience = assertion(&issuer,vec![lenso_auth_sdk::audience(service::CAPABILITY_ID,"describe_exports")]);
        assert!(handle.invoke_with_context(service::INVOKE_OPERATION,context(&wrong_audience,CancellationToken::new()),input("What did you summarize?")).await.unwrap().is_err());
        let mut forged = input("What did you summarize?");
        forged.body_base64 = STANDARD.encode(br#"{"model":"fixture/readme-summary-v1","prompt":"What did you summarize?","max_output":64,"project":"project-two"}"#);
        assert!(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),forged).await.unwrap().is_err());
        let cancellation = CancellationToken::new();
        let pending = handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,cancellation.clone()),input("Remain pending until cancelled."));
        let cancel = async {
            tokio::time::sleep(Duration::from_millis(300)).await;
            cancellation.cancel();
        };
        let (result,()) = tokio::join!(pending,cancel);
        assert!(!matches!(result, Ok(Ok(_))));
        assert!(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("unsupported fixture prompt")).await.unwrap().is_err());
        let db = rusqlite::Connection::open(&ledger).unwrap();
        let unknown: i64 = db.query_row("SELECT COUNT(*) FROM runs WHERE state='unknown' AND charge>0",[],|r|r.get(0)).unwrap();
        assert_eq!(unknown,2);
        let total: i64 = db.query_row("SELECT SUM(charge) FROM runs",[],|r|r.get(0)).unwrap();
        assert!(total>57000);
        assert_eq!(app.shutdown(Duration::from_secs(2)).await,ShutdownOutcome::Clean);
        std::fs::write(root.path().join("fixture-stop"),"").unwrap();
        for _ in 0..100 {
            if let Some(status) = child.0.try_wait().unwrap() { assert!(status.success(),"fixture history assertions failed"); return; }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("Agent fixture shutdown timed out");
    })).await;
}
