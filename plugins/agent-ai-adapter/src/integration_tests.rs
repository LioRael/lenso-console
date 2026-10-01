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
use lenso_capability_credential_state as credentials;
use lenso_capability_workspace_service as service;
use lenso_kernel::{CancellationToken, InvocationContext, Kernel, RuntimeFailure, ShutdownOutcome};
use lenso_native_adapter::{
    NativePluginFactory, NativePluginFactoryContext, NativePluginInstance, NativePluginRegistry,
};
use std::{
    any::Any,
    cell::Cell,
    path::PathBuf,
    process::{Child, Command, Stdio},
    rc::Rc,
    time::Duration,
};

#[derive(Debug)]
struct CredentialEndpoint(Rc<Cell<bool>>);
impl lenso_kernel::NativeRequestEndpoint for CredentialEndpoint {
    fn capability_id(&self) -> &'static str {
        credentials::CAPABILITY_ID
    }
    fn descriptor_version(&self) -> &'static str {
        credentials::DESCRIPTOR_VERSION
    }
    fn operations(&self) -> &'static [&'static str] {
        &[credentials::INSPECT_OPERATION]
    }
    fn invoke(
        &self,
        _: &str,
        request: Box<dyn Any>,
        _: InvocationContext,
    ) -> futures::future::LocalBoxFuture<
        'static,
        Result<Result<Box<dyn Any>, Box<dyn Any>>, RuntimeFailure>,
    > {
        let active = self.0.get();
        Box::pin(async move {
            let request = request.downcast::<credentials::InspectRequest>().unwrap();
            let response: credentials::InspectResponse = serde_json::from_value(serde_json::json!({
                "credential_id":request.credential_id,"session_id":request.session_id,"subject":"alice","actor_kind":"user",
                "assurance":"fixture","claims":{},"active":active,
                "audience":[lenso_auth_sdk::audience(service::CAPABILITY_ID,service::INVOKE_OPERATION),lenso_auth_sdk::audience("lenso.agent.model@4","complete"),lenso_auth_sdk::audience("lenso.agent@3","run_turn"),lenso_auth_sdk::audience("lenso.agent.session@1","open"),lenso_auth_sdk::audience("lenso.agent.session@1","read"),lenso_auth_sdk::audience("lenso.agent.session@1","append")],
                "expires_at":(time::OffsetDateTime::now_utc()+time::Duration::minutes(5)).format(&time::format_description::well_known::Rfc3339).unwrap()
            })).unwrap();
            Ok(Ok(Box::new(response) as Box<dyn Any>))
        })
    }
}
#[derive(Debug)]
struct CredentialFactory(Rc<Cell<bool>>);
impl NativePluginFactory for CredentialFactory {
    fn package_id(&self) -> &'static str {
        "test.credential-state"
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
        Ok(NativePluginInstance::new(vec![Rc::new(
            CredentialEndpoint(self.0.clone()),
        )]))
    }
}

#[derive(Debug)]
struct Probe(&'static str);
impl NativePluginFactory for Probe {
    fn package_id(&self) -> &'static str {
        self.0
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
    run_binding_integration(false, None).await;
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires coordinated Agent Web fixture executable"]
async fn native_binding_cross_process_runs_require_explicit_scoped_session_grants() {
    run_binding_integration(true, None).await;
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires coordinated Agent Web fixture executable"]
async fn native_binding_cross_process_expired_admission_can_only_stop_its_run() {
    run_binding_integration(false, Some("expiry")).await;
}
#[tokio::test(flavor = "current_thread")]
#[ignore = "requires coordinated Agent Web fixture executable"]
async fn native_binding_cross_process_cancel_failure_holds_concurrency_after_restart() {
    run_binding_integration(false, Some("reject")).await;
}
#[tokio::test(flavor = "current_thread")]
#[ignore = "requires coordinated Agent Web fixture executable"]
async fn native_binding_cross_process_cancel_timeout_holds_concurrency_after_restart() {
    run_binding_integration(false, Some("timeout")).await;
}
#[tokio::test(flavor = "current_thread")]
#[ignore = "requires coordinated Agent Web fixture executable"]
async fn native_binding_cross_process_disconnect_holds_concurrency_after_restart() {
    run_binding_integration(false, Some("disconnect")).await;
}

async fn run_binding_integration(scoped: bool, safety: Option<&str>) {
    tokio::task::LocalSet::new().run_until(Box::pin(async {
        let root = tempfile::tempdir().unwrap();
        let issuer = lenso_auth_sdk::ActorAssertionIssuer::from_signing_key("operators.fixture", [7; 32]);
        let binary = PathBuf::from(std::env::var("LENSO_AI_AGENT_TEST_BINARY").unwrap());
        let log = std::fs::File::create(root.path().join("agent-fixture.log")).unwrap();
        let mut child = Fixture(Command::new(binary).args(["--ignored", "--exact", "plugin_ai::tests::plugin_ai_fixture_process", "--nocapture"])
            .env("LENSO_AI_FIXTURE_ROOT",root.path()).env("LENSO_AI_FIXTURE_ISSUER","operators.fixture")
            .env("LENSO_AI_FIXTURE_SCOPED",if scoped{"1"}else{"0"}).env("LENSO_AI_FIXTURE_PUBLIC_KEY",issuer.public_key_base64()).stdout(Stdio::from(log.try_clone().unwrap())).stderr(Stdio::from(log)).spawn().unwrap());
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
                lenso_auth_sdk::Validity::new(now - time::Duration::seconds(1), now + time::Duration::minutes(5)).unwrap(),
                [(lenso_auth_sdk::credential::CREDENTIAL_BINDING_CLAIM.into(),serde_json::json!({"credential_id":"synthetic-credential","session_id":"synthetic-parent-session"}))].into())
        };
        let audiences = vec![lenso_auth_sdk::audience(service::CAPABILITY_ID,service::INVOKE_OPERATION),lenso_auth_sdk::audience("lenso.agent.model@4","complete"),lenso_auth_sdk::audience("lenso.agent@3","run_turn"),lenso_auth_sdk::audience("lenso.agent.session@1","open"),lenso_auth_sdk::audience("lenso.agent.session@1","read"),lenso_auth_sdk::audience("lenso.agent.session@1","append")];
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
        let slots = [HostSlot::many("console-ai-adapters"), HostSlot::many("probe"),HostSlot::one("credential-state")];
        let linked = NativePluginRegistry::host_catalog(slots.clone(), []).unwrap();
        let probe = PluginDescriptor::new("test.ai-probe","1.0.0","probe")
            .with_requirement(CapabilityRequirementPlan::one(service::CAPABILITY_ID,service::DESCRIPTOR_VERSION));
        let credential = PluginDescriptor::new("test.credential-state","1.0.0","credential-state")
            .with_capability(lenso_app_plan::CapabilityEndpointPlan::new(credentials::CAPABILITY_ID,credentials::DESCRIPTOR_VERSION,[credentials::INSPECT_OPERATION]));
        let releases = linked.plugins().iter().cloned().chain([HostPluginRelease::new(probe),HostPluginRelease::new(credential),HostPluginRelease::new(PluginDescriptor::new("test.ai-worker","1.0.0","probe").with_requirement(CapabilityRequirementPlan::one(service::CAPABILITY_ID,service::DESCRIPTOR_VERSION)))]).collect::<Vec<_>>();
        let caller = HostCaller { consumer:"test.ai-probe/default".into(),user:"alice".into(),project:"project-one".into() };
        let worker=HostCaller{consumer:"test.ai-worker/default".into(),..caller.clone()};
        let other_project=HostCaller{consumer:"test.ai-worker/project-two".into(),project:"project-two".into(),..worker.clone()};
        // Baseline cases deliberately retain three unresolved failures. The
        // fourth slot exercises receipt-backed recovery. P1 fault cases use
        // concurrency one and prove no second reservation survives a restart.
        let profile = PurposeProfile { callers:if scoped{[caller.clone(),worker.clone(),other_project].into()}else{[caller.clone()].into()}, model:"fixture/readme-summary-v1".into(),price:Some(Price { version:"fixture-known-price/1".into(),input:1,output:2 }),budget:if scoped{1000000}else{200000},max_output:64,concurrency:if safety.is_some(){1}else{4} };
        let mut config = serde_json::json!({"agent_origin":origin,"ledger":ledger,"issuer":"operators.fixture","public_key":issuer.public_key_base64(),
            "provider_instance":quote["provider_instance"],"profile":profile,"control_token_file":control_file});
        if scoped {config["run"]=serde_json::json!({"authority":root.path().join("run-authority.sqlite"),"workspace":root.path(),"max_calls":2,"tools":["uppercase"],"existing_session_owners":[caller.consumer]});}
        let defaults = [HostDefaultPlugin::new("test.ai-worker","default"),HostDefaultPlugin::new("test.ai-worker","project-two"),HostDefaultPlugin::new("test.credential-state","default"),HostDefaultPlugin::new("test.ai-probe","default"),HostDefaultPlugin::new("test.ai-probe","intruder"),
            HostDefaultPlugin::new("lenso.console.agent-ai-adapter","default").with_configuration(config)];
        let resolved = resolve_plugin_root(&HostCatalog::new(slots,releases,defaults),&PluginRootSnapshot::default()).unwrap();
        let active = Rc::new(Cell::new(true));
        let registry = || NativePluginRegistry::new().with_linked_factories().with_factory(Probe("test.ai-probe")).with_factory(Probe("test.ai-worker")).with_factory(CredentialFactory(active.clone()));
        let app = Kernel::start_native(resolved.plan().clone(),lenso_runner::TokioDriver::new(),registry()).await.unwrap();
        let context = |actor: &lenso_auth_sdk::ActorAssertion, cancellation| actor.clone().attach(InvocationContext::new(1,None,cancellation)).unwrap();
        let handle = app.handle::<service::WorkspaceServiceInvoke>("test.ai-probe/default").unwrap();
        if let Some(case) = safety {
            if case == "expiry" {
                expiry_stop_regression(&http,&origin,&issuer,&actor_header,&quote,&audiences).await;
            }
            if matches!(case,"reject"|"timeout") {
                std::fs::write(root.path().join("fixture-cancel-fault"),case).unwrap();
            }
            let test_actor = if case == "expiry" {short_assertion(&issuer,&audiences)}else{actor.clone()};
            let cancellation=CancellationToken::new();
            let pending=handle.invoke_with_context(service::INVOKE_OPERATION,context(&test_actor,cancellation.clone()),input("Remain pending until cancelled."));
            let fault=async {
                let deadline=tokio::time::Instant::now()+Duration::from_secs(5);
                loop {
                    let reserved:i64=rusqlite::Connection::open(&ledger).unwrap().query_row("SELECT COUNT(*) FROM runs WHERE state='reserved'",[],|r|r.get(0)).unwrap();
                    if reserved>0{break;}
                    assert!(tokio::time::Instant::now()<deadline,"native request never reserved");
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
                // Give the actual provider request time to reach the Agent.
                tokio::time::sleep(Duration::from_millis(200)).await;
                if case=="disconnect" {child.0.kill().unwrap();child.0.wait().unwrap();}
                else if case!="expiry" {cancellation.cancel();}
            };
            let (result,())=tokio::time::timeout(Duration::from_secs(8),async{tokio::join!(pending,fault)}).await.unwrap();
            assert!(!matches!(result,Ok(Ok(_))));
            let deadline=tokio::time::Instant::now()+Duration::from_secs(5);
            loop {
                let held:i64=rusqlite::Connection::open(&ledger).unwrap().query_row("SELECT COUNT(*) FROM runs WHERE state='unknown' AND charge>0",[],|r|r.get(0)).unwrap();
                if held==1{break;}
                assert!(tokio::time::Instant::now()<deadline,"abandoned request did not persist unknown execution");
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            if matches!(case,"reject"|"timeout") {
                let trace=root.path().join("fixture-cancel-fault").with_extension("entered");
                while !trace.exists(){assert!(tokio::time::Instant::now()<deadline);tokio::time::sleep(Duration::from_millis(10)).await;}
                assert_eq!(std::fs::read_to_string(trace).unwrap(),case);
            }
            let db=rusqlite::Connection::open(&ledger).unwrap();
            let charge:i64=db.query_row("SELECT SUM(charge) FROM runs",[],|r|r.get(0)).unwrap();
            let admission=crate::durable::DurableAdmission::open(&ledger,profile.clone()).unwrap();
            assert!(matches!(admission.reserve("must-not-dispatch".into(),&caller,&CompletionRequest{model:profile.model.clone(),prompt:"What did you summarize?".into(),max_output:64},quote["input_ceiling"].as_u64().unwrap(),&quote),Err(Rejection::Concurrency)));
            if case!="disconnect" {
                assert!(matches!(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("What did you summarize?")).await.unwrap(),Err(service::InvokeError::ResourceExhausted)));
            }
            assert_eq!(app.shutdown(Duration::from_secs(2)).await,ShutdownOutcome::Clean);
            // A fresh native adapter instance must honor the same unknown slot.
            let restarted=Kernel::start_native(resolved.plan().clone(),lenso_runner::TokioDriver::new(),registry()).await.unwrap();
            let after=restarted.handle::<service::WorkspaceServiceInvoke>("test.ai-probe/default").unwrap();
            let result=after.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("What did you summarize?")).await.unwrap();
            if case=="disconnect" {assert!(result.is_err());}else{assert!(matches!(result,Err(service::InvokeError::ResourceExhausted)));}
            assert_eq!(db.query_row::<i64,_,_>("SELECT SUM(charge) FROM runs",[],|r|r.get(0)).unwrap(),charge);
            assert_eq!(db.query_row::<i64,_,_>("SELECT COUNT(*) FROM runs",[],|r|r.get(0)).unwrap(),1);
            assert_eq!(restarted.shutdown(Duration::from_secs(2)).await,ShutdownOutcome::Clean);
            return;
        }
        let response = handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("What did you summarize?")).await.unwrap().unwrap();
        let response: serde_json::Value = serde_json::from_slice(&STANDARD.decode(response.body_base64).unwrap()).unwrap();
        assert!(response["text"].as_str().unwrap().contains("Nothing yet"));
        assert_eq!(response["evidence"]["charged"],32);
        assert_eq!(response["evidence"]["caller"]["project"],"project-one");
        active.set(false);
        assert!(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("What did you summarize?")).await.unwrap().is_err());
        let db = rusqlite::Connection::open(&ledger).unwrap();
        let before: i64 = db.query_row("SELECT COUNT(*) FROM runs",[],|r|r.get(0)).unwrap();
        assert_eq!(before,1);
        active.set(true);
        let pending_revoke = handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("Remain pending until cancelled."));
        let revoke = async {
            loop {
                let reserved: i64 = db.query_row("SELECT COUNT(*) FROM runs WHERE state='reserved'",[],|r|r.get(0)).unwrap();
                if reserved > 0 { break; }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            active.set(false);
        };
        let (revoked,()) = tokio::time::timeout(Duration::from_secs(5),async { tokio::join!(pending_revoke,revoke) }).await.unwrap();
        assert!(!matches!(revoked,Ok(Ok(_))));
        active.set(true);
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
        assert_eq!(unknown,3);
        let total: i64 = db.query_row("SELECT SUM(charge) FROM runs",[],|r|r.get(0)).unwrap();
        assert!(total>86000);
        // Crash after the FULL-synchronous reservation commit: deliberately omit
        // its destructor. Agent completed but Console crashed before settlement.
        // Recover only with its successful terminal receipt, never replay.
        let crashed_id = uuid::Uuid::new_v4().to_string();
        let admission = crate::durable::DurableAdmission::open(&ledger,profile.clone()).unwrap();
        let crashed = admission.reserve(crashed_id.clone(),&caller,&CompletionRequest { model:profile.model.clone(),prompt:"What did you summarize?".into(),max_output:64 },
            quote["input_ceiling"].as_u64().unwrap(),&quote).unwrap();
        std::mem::forget(crashed);
        let mut completed_body = quote_body.clone();
        completed_body["run_id"] = crashed_id.clone().into();
        completed_body["generation"] = quote["generation"].clone();
        completed_body["input_ceiling"] = quote["input_ceiling"].clone();
        http.post(format!("{origin}/api/console/v1/agent/plugin-ai/completions"))
            .header("x-lenso-actor", &actor_header).bearer_auth(control).json(&completed_body)
            .send().await.unwrap().error_for_status().unwrap();
        // Unknown IDs cannot be mistaken for terminated provider execution.
        let unknown_id = uuid::Uuid::new_v4();
        let unknown_receipt: bool = http.post(format!("{origin}/api/console/v1/agent/plugin-ai/completions/{unknown_id}/recover"))
            .header("x-lenso-actor", &actor_header).bearer_auth(control).json(&serde_json::Value::Null)
            .send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
        assert!(!unknown_receipt);
        let before_recovery: i64 = db.query_row("SELECT SUM(charge) FROM runs",[],|r|r.get(0)).unwrap();
        assert!(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("What did you summarize?")).await.unwrap().is_err());
        let recover = service::InvokeRequest { service_id:"ai".into(),operation:"recover".into(),media_type:service::InvokeRequestMediaType::ApplicationJson,
            body_base64:STANDARD.encode(serde_json::to_vec(&serde_json::json!({"run_id":crashed_id})).unwrap()) };
        assert!(intruder.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),recover.clone()).await.unwrap().is_err());
        let recovered = handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),recover).await.unwrap().unwrap();
        let recovered: serde_json::Value = serde_json::from_slice(&STANDARD.decode(recovered.body_base64).unwrap()).unwrap();
        assert_eq!(recovered["state"],"unknown"); assert_eq!(recovered["refunded"],false);
        let after_recovery: i64 = db.query_row("SELECT SUM(charge) FROM runs",[],|r|r.get(0)).unwrap();
        assert_eq!(before_recovery,after_recovery);
        assert!(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),input("What did you summarize?")).await.unwrap().is_ok());
        if scoped {
            let operation=|name:&str,body:serde_json::Value|service::InvokeRequest{service_id:"ai".into(),operation:name.into(),media_type:service::InvokeRequestMediaType::ApplicationJson,body_base64:STANDARD.encode(serde_json::to_vec(&body).unwrap())};
            let decode=|reply:service::InvokeResponse|serde_json::from_slice::<serde_json::Value>(&STANDARD.decode(reply.body_base64).unwrap()).unwrap();
            let worker_handle=app.handle::<service::WorkspaceServiceInvoke>("test.ai-worker/default").unwrap();
            let project_handle=app.handle::<service::WorkspaceServiceInvoke>("test.ai-worker/project-two").unwrap();
            let run=|prompt:&str,session:Option<&str>,grant:Option<&str>|operation("run",serde_json::json!({"model":profile.model,"prompt":prompt,"max_output":64,"max_calls":2,"session_id":session,"grant_id":grant}));
            let background=decode(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),run("Use the text Plugin to uppercase Lenso plugin.",None,None)).await.unwrap().unwrap_or_else(|e|panic!("{e:?}: {}",std::fs::read_to_string(root.path().join("agent-fixture.log")).unwrap())));
            assert_eq!(background["calls"],2);assert!(background["text"].as_str().unwrap().contains("LENSO PLUGIN"));assert!(background["session_id"].is_null());
            let history=rusqlite::Connection::open(root.path().join("scoped-history.sqlite")).unwrap();
            assert_eq!(history.query_row::<i64,_,_>("SELECT COUNT(*) FROM sessions",[],|r|r.get(0)).unwrap(),0);
            let existing:serde_json::Value=http.post(format!("{origin}/api/console/v1/agent/plugin-ai/session")).bearer_auth(control).header("x-lenso-actor",&actor_header).json(&serde_json::json!({"session_id":null,"namespace":null})).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
            let id=existing["session_id"].as_str().unwrap();
            assert!(worker_handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),operation("register_session",serde_json::json!({"session_id":id}))).await.unwrap().is_err());
            handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),operation("register_session",serde_json::json!({"session_id":id}))).await.unwrap().unwrap();
            assert!(worker_handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),run("What did you summarize?",Some(id),None)).await.unwrap().is_err());
            let grant=decode(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),operation("grant_session",serde_json::json!({"session_id":id,"consumer":"test.ai-worker/default","seconds":300}))).await.unwrap().unwrap());
            let grant=grant["grant_id"].as_str().unwrap();
            assert!(project_handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),run("What did you summarize?",Some(id),Some(grant))).await.unwrap().is_err());
            worker_handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),run("What did you summarize?",Some(id),Some(grant))).await.unwrap().unwrap();
            let own=decode(handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),operation("open_session",serde_json::json!({}))).await.unwrap().unwrap());
            let own=own["session_id"].as_str().unwrap();handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),run("What did you summarize?",Some(own),None)).await.unwrap().unwrap();
            assert!(worker_handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),run("What did you summarize?",Some(own),None)).await.unwrap().is_err());
            assert_eq!(history.query_row::<i64,_,_>("SELECT COUNT(*) FROM sessions",[],|r|r.get(0)).unwrap(),2);
            let pending=worker_handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),run("Remain pending until cancelled.",Some(id),Some(grant)));
            let revoke=async {
                loop {let count:i64=db.query_row("SELECT COUNT(*) FROM runs WHERE state='reserved'",[],|r|r.get(0)).unwrap();if count>0{break;}tokio::time::sleep(Duration::from_millis(10)).await;}
                handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),operation("revoke_grant",serde_json::json!({"grant_id":grant}))).await.unwrap().unwrap();
            };
            let (result,())=tokio::time::timeout(Duration::from_secs(8),async{tokio::join!(pending,revoke)}).await.unwrap();assert!(!matches!(result,Ok(Ok(_))));
            assert!(worker_handle.invoke_with_context(service::INVOKE_OPERATION,context(&actor,CancellationToken::new()),run("What did you summarize?",Some(id),Some(grant))).await.unwrap().is_err());
        }
        assert_eq!(app.shutdown(Duration::from_secs(2)).await,ShutdownOutcome::Clean);
        std::fs::write(root.path().join("fixture-stop"),"").unwrap();
        for _ in 0..100 {
            if let Some(status) = child.0.try_wait().unwrap() { assert!(status.success(),"fixture history assertions failed"); return; }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("Agent fixture shutdown timed out");
    })).await;
}

fn short_assertion(
    issuer: &lenso_auth_sdk::ActorAssertionIssuer,
    audiences: &[String],
) -> lenso_auth_sdk::ActorAssertion {
    let now = time::OffsetDateTime::now_utc();
    issuer.issue("alice","user","fixture",audiences.to_vec(),lenso_auth_sdk::Validity::new(now-time::Duration::seconds(1),now+time::Duration::seconds(2)).unwrap(),
        [(lenso_auth_sdk::credential::CREDENTIAL_BINDING_CLAIM.into(),serde_json::json!({"credential_id":"synthetic-credential","session_id":"synthetic-parent-session"}))].into())
}
async fn expiry_stop_regression(
    http: &reqwest::Client,
    origin: &str,
    issuer: &lenso_auth_sdk::ActorAssertionIssuer,
    fresh_header: &str,
    quote: &serde_json::Value,
    audiences: &[String],
) {
    let short = short_assertion(issuer, audiences);
    let expired_header = STANDARD.encode(serde_json::to_vec(&short.to_wire()).unwrap());
    let control = "synthetic-existing-host-control";
    let base = format!("{origin}/api/console/v1/agent/plugin-ai");
    let id = uuid::Uuid::new_v4().to_string();
    let body = serde_json::json!({"run_id":id,"model":"fixture/readme-summary-v1","prompt":"Remain pending until cancelled.","max_output":64,"generation":quote["generation"],"input_ceiling":quote["input_ceiling"]});
    let client = http.clone();
    let endpoint = format!("{base}/completions");
    let header = expired_header.clone();
    let input = body.clone();
    let pending = tokio::spawn(async move {
        client
            .post(endpoint)
            .bearer_auth(control)
            .header("x-lenso-actor", header)
            .json(&input)
            .send()
            .await
            .unwrap()
    });
    tokio::time::sleep(Duration::from_millis(3100)).await;
    assert!(
        !pending.is_finished(),
        "real Agent task must still be active before stop"
    );
    // Expired admission cannot start, quote, recover, or stop a different task.
    for route in ["quote".to_string(), "completions".to_string()] {
        assert_eq!(
            http.post(format!("{base}/{route}"))
                .bearer_auth(control)
                .header("x-lenso-actor", &expired_header)
                .json(&body)
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
    }
    assert_eq!(
        http.post(format!("{base}/completions/{id}/recover"))
            .bearer_auth(control)
            .header("x-lenso-actor", &expired_header)
            .json(&serde_json::Value::Null)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        http.post(format!("{base}/completions/{id}/cancel"))
            .header("x-lenso-actor", &expired_header)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let reply = http
        .post(format!("{base}/completions/{id}/cancel"))
        .bearer_auth(control)
        .header("x-lenso-actor", &expired_header)
        .send()
        .await
        .unwrap();
    assert_eq!(reply.status(), 200);
    assert!(reply.json::<bool>().await.unwrap());
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(3), pending)
            .await
            .unwrap()
            .unwrap()
            .status(),
        409
    );
    let mut other = body;
    let other_id = uuid::Uuid::new_v4().to_string();
    other["run_id"] = other_id.clone().into();
    let client = http.clone();
    let endpoint = format!("{base}/completions");
    let header = fresh_header.to_owned();
    let pending = tokio::spawn(async move {
        client
            .post(endpoint)
            .bearer_auth(control)
            .header("x-lenso-actor", header)
            .json(&other)
            .send()
            .await
            .unwrap()
    });
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(
        http.post(format!("{base}/completions/{other_id}/cancel"))
            .bearer_auth(control)
            .header("x-lenso-actor", &expired_header)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let stopped = http
        .post(format!("{base}/completions/{other_id}/cancel"))
        .bearer_auth(control)
        .header("x-lenso-actor", fresh_header)
        .send()
        .await
        .unwrap();
    assert_eq!(stopped.status(), 200);
    assert!(stopped.json::<bool>().await.unwrap());
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(3), pending)
            .await
            .unwrap()
            .unwrap()
            .status(),
        409
    );
}
