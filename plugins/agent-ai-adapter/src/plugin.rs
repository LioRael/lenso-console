//! Optional capability provider. Identity comes from the Kernel caller and an
//! existing operators assertion; project comes only from Host-owned policy.
use crate::{CompletionRequest, HostCaller, PurposeProfile, Rejection, durable::DurableAdmission};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures::StreamExt as _;
use lenso_auth_sdk::{
    ActorAssertion, ActorProjectionError, FixedClock, TypedActor, realm::RealmAssertionVerifier,
};
use lenso_capability_workspace_service as service;
use lenso_kernel::{ActivateContext, DeactivateContext, InvocationContext, RuntimeFailure};
use std::{cell::RefCell, path::PathBuf, rc::Rc, time::Duration};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Config {
    agent_origin: String,
    ledger: PathBuf,
    control_token_file: PathBuf,
    issuer: String,
    public_key: String,
    provider_instance: String,
    profile: PurposeProfile,
}

fn failure(error: impl std::fmt::Display) -> RuntimeFailure {
    RuntimeFailure::PluginFailure {
        detail: format!("AI adapter: {error}"),
    }
}
fn validate(config: &Config) -> Result<(), RuntimeFailure> {
    let url = reqwest::Url::parse(&config.agent_origin).map_err(failure)?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || !config.ledger.is_absolute()
        || !config.control_token_file.is_absolute()
        || config.provider_instance.is_empty()
        || config.profile.callers.is_empty()
        || config.profile.concurrency == 0
        || config.profile.max_output == 0
        || config.profile.max_output > 4096
    {
        return Err(failure(
            "explicit loopback, ledger, exact provider and bounded Host policy required",
        ));
    }
    RealmAssertionVerifier::new("operators", &config.issuer, &config.public_key, 3600, None)
        .map_err(|_| failure("invalid existing operators authority"))?;
    if config
        .profile
        .price
        .as_ref()
        .is_none_or(|price| price.version.is_empty())
    {
        return Err(failure("unknown pricing is forbidden"));
    }
    Ok(())
}

#[derive(Clone, Debug)]
struct Running {
    admission: DurableAdmission,
    verifier: RealmAssertionVerifier,
    client: reqwest::Client,
    control: Rc<HostControl>,
}

struct HostControl(String);
impl std::fmt::Debug for HostControl {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("<Host control credential>")
    }
}

#[lenso::plugin(lifecycle, configuration_schema = "config.schema.json", validate = validate)]
#[derive(Clone, Debug)]
struct AiAdapter {
    #[config]
    config: Config,
    running: Rc<RefCell<Option<Running>>>,
}

struct User(ActorAssertion);

struct RemoteRunGuard {
    client: reqwest::Client,
    url: String,
    actor: String,
    completed: bool,
    control: String,
}
impl Drop for RemoteRunGuard {
    fn drop(&mut self) {
        if self.completed {
            return;
        }
        let client = self.client.clone();
        let url = self.url.clone();
        let actor = self.actor.clone();
        let control = self.control.clone();
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            runtime.spawn(async move {
                let _ = client
                    .post(url)
                    .header("x-lenso-actor", actor)
                    .bearer_auth(control)
                    .timeout(Duration::from_secs(2))
                    .send()
                    .await;
            });
        }
    }
}
impl TypedActor for User {
    fn from_assertion(actor: &ActorAssertion) -> Result<Self, ActorProjectionError> {
        if actor.actor_kind() != "user" {
            return Err(ActorProjectionError::UnexpectedActorKind {
                expected: "user".into(),
                actual: actor.actor_kind().into(),
            });
        }
        Ok(Self(actor.clone()))
    }
}

#[lenso::provides(service::WorkspaceService)]
impl AiAdapter {
    fn describe_exports(
        &self,
        _context: InvocationContext,
        _request: service::DescribeExportsRequest,
    ) -> lenso_kernel::NativeRequestFuture<service::WorkspaceServiceDescribeExports> {
        Box::pin(async {
            Ok(Ok(serde_json::from_value(serde_json::json!({
            "adapter_revision":"completion/1", "services":[{"service_id":"ai", "capability_id":service::CAPABILITY_ID,
            "descriptor_version":service::DESCRIPTOR_VERSION,"operations":[{"name":"complete","interaction":"request"}]}]
        })).map_err(failure)?))
        })
    }

    fn invoke(
        &self,
        context: InvocationContext,
        request: service::InvokeRequest,
    ) -> lenso_kernel::NativeRequestFuture<service::WorkspaceServiceInvoke> {
        let running = self.running.borrow().clone();
        let config = self.config.clone();
        Box::pin(async move {
            if request.service_id != "ai" {
                return Ok(Err(service::InvokeError::UnknownService));
            }
            if request.operation != "complete" {
                return Ok(Err(service::InvokeError::UnknownOperation));
            }
            let Some(running) = running else {
                return Err(failure("not active"));
            };
            let result = complete(&running, &config, &context, request).await;
            match result {
                Ok(body) => Ok(Ok(service::InvokeResponse {
                    body_base64: STANDARD.encode(body),
                    outcome: service::InvokeResponseOutcome::Success,
                })),
                Err(Rejection::Unauthorized) => Ok(Err(service::InvokeError::Denied)),
                Err(Rejection::Budget | Rejection::Concurrency) => {
                    Ok(Err(service::InvokeError::ResourceExhausted))
                }
                Err(_) => Ok(Err(service::InvokeError::Denied)),
            }
        })
    }

    fn subscribe(
        &self,
        _context: InvocationContext,
        _request: service::SubscribeRequest,
    ) -> futures::future::LocalBoxFuture<
        'static,
        Result<
            lenso::ProviderStream<service::WorkspaceServiceSubscribe>,
            service::WorkspaceServiceSubscribeInvocationError,
        >,
    > {
        Box::pin(async {
            Err(service::WorkspaceServiceSubscribeInvocationError::Domain(
                service::SubscribeError::UnknownOperation,
            ))
        })
    }
}

async fn complete(
    running: &Running,
    config: &Config,
    context: &InvocationContext,
    request: service::InvokeRequest,
) -> Result<Vec<u8>, Rejection> {
    let User(actor) = running
        .verifier
        .project_context::<User>(
            context,
            service::CAPABILITY_ID,
            service::INVOKE_OPERATION,
            &FixedClock::new(time::OffsetDateTime::now_utc()),
        )
        .map_err(|_| Rejection::Unauthorized)?;
    let consumer = context.caller_instance().ok_or(Rejection::Unauthorized)?;
    let mut grants = config
        .profile
        .callers
        .iter()
        .filter(|grant| grant.consumer == consumer && grant.user == actor.subject());
    let caller: HostCaller = grants.next().cloned().ok_or(Rejection::Unauthorized)?;
    // One exact project per bound adapter; no request field may select another.
    if grants.next().is_some() {
        return Err(Rejection::Unauthorized);
    }
    let bytes = STANDARD
        .decode(&request.body_base64)
        .map_err(|_| Rejection::Limit)?;
    if bytes.len() > 65536 {
        return Err(Rejection::Limit);
    }
    let request: CompletionRequest =
        serde_json::from_slice(&bytes).map_err(|_| Rejection::Limit)?;
    running.admission.authorize(&caller, &request)?;
    let actor =
        STANDARD.encode(serde_json::to_vec(&actor.to_wire()).map_err(|_| Rejection::Unauthorized)?);
    let base = format!(
        "{}/api/console/v1/agent/plugin-ai",
        config.agent_origin.trim_end_matches('/')
    );
    let id = uuid::Uuid::new_v4().to_string();
    let mut body = serde_json::json!({"run_id":id,"model":request.model,"prompt":request.prompt,"max_output":request.max_output,"generation":null});
    let quote = bounded_post(
        &running.client,
        &format!("{base}/quote"),
        &actor,
        &running.control.0,
        &body,
    )
    .await?;
    if quote["model"].as_str() != Some(request.model.as_str())
        || quote["provider_instance"].as_str() != Some(config.provider_instance.as_str())
    {
        return Err(Rejection::Evidence);
    }
    let ceiling = quote["input_ceiling"]
        .as_u64()
        .ok_or(Rejection::UnmeteredInput)?;
    let generation = quote["generation"]
        .as_str()
        .filter(|g| !g.is_empty())
        .ok_or(Rejection::Evidence)?;
    body["generation"] = generation.into();
    body["input_ceiling"] = ceiling.into();
    let reservation = running
        .admission
        .reserve(id.clone(), &caller, &request, ceiling, &quote)?;
    let mut remote = RemoteRunGuard {
        client: running.client.clone(),
        url: format!("{base}/completions/{id}/cancel"),
        actor: actor.clone(),
        completed: false,
        control: running.control.0.clone(),
    };
    let cancellation = context.cancellation();
    let completion_url = format!("{base}/completions");
    let reply = tokio::select! {
        biased;
        () = cancellation.cancelled() => {
            let _ = running.client.post(format!("{base}/completions/{id}/cancel"))
                .header("x-lenso-actor", &actor).bearer_auth(&running.control.0).timeout(Duration::from_secs(2)).send().await;
            return Err(Rejection::Provider);
        }
        reply = bounded_post(&running.client, &completion_url, &actor, &running.control.0, &body) => reply?,
    };
    if reply["binding"] != quote {
        return Err(Rejection::Evidence);
    }
    let text = reply["text"].as_str().ok_or(Rejection::Evidence)?;
    let evidence = reservation.finish(
        request.model.as_str(),
        reply["input_tokens"].as_u64().ok_or(Rejection::Evidence)?,
        reply["output_tokens"].as_u64().ok_or(Rejection::Evidence)?,
        &quote,
    )?;
    remote.completed = true;
    serde_json::to_vec(
        &serde_json::json!({"text":text,"run_id":id,"evidence":evidence,"binding":quote}),
    )
    .map_err(|_| Rejection::Evidence)
}

async fn bounded_post(
    client: &reqwest::Client,
    url: &str,
    actor: &str,
    control: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, Rejection> {
    let response = client
        .post(url)
        .header("x-lenso-actor", actor)
        .bearer_auth(control)
        .json(body)
        .send()
        .await
        .map_err(|_| Rejection::Provider)?;
    if !response.status().is_success() {
        return Err(Rejection::Provider);
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| Rejection::Provider)?;
        if bytes.len() + chunk.len() > 2 * 1048576 {
            return Err(Rejection::Evidence);
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| Rejection::Evidence)
}

impl lenso::Lifecycle for AiAdapter {
    async fn activate(&self, _context: ActivateContext) -> Result<(), RuntimeFailure> {
        validate(&self.config)?;
        let admission = DurableAdmission::open(&self.config.ledger, self.config.profile.clone())
            .map_err(|_| failure("durable ledger unavailable or policy changed"))?;
        let verifier = RealmAssertionVerifier::new(
            "operators",
            &self.config.issuer,
            &self.config.public_key,
            3600,
            None,
        )
        .map_err(|_| failure("invalid operators authority"))?;
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(18))
            .build()
            .map_err(failure)?;
        let control = std::fs::read_to_string(&self.config.control_token_file).map_err(failure)?;
        if control.trim().is_empty() || control.len() > 8192 {
            return Err(failure("invalid existing Host control credential"));
        }
        *self.running.borrow_mut() = Some(Running {
            admission,
            verifier,
            client,
            control: Rc::new(HostControl(control.trim().to_owned())),
        });
        Ok(())
    }
    async fn deactivate(&self, _context: DeactivateContext) -> Result<(), RuntimeFailure> {
        self.running.borrow_mut().take();
        Ok(())
    }
}

pub fn link() {}
