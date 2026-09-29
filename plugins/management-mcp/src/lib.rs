//! Native MCP transport. A bound Management service retains every authorization decision.

use axum::{
    Json, Router,
    body::Body,
    extract::{Request, State},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use http::{StatusCode, request::Parts};
use lenso_auth_sdk::{AuthOutcome, CredentialEvidence, authenticate_request, decode_auth_response};
use lenso_capability_auth::AuthClient;
use lenso_capability_management as management;
use lenso_kernel::{CancellationToken, InvocationContext};
use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ListToolsResult,
        PaginatedRequestParams, ProtocolVersion, ServerCapabilities, ServerConfig, Tool,
    },
    service::RequestContext,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use std::{
    borrow::Cow,
    collections::{BTreeMap, BTreeSet},
    rc::Rc,
    sync::Arc,
    time::Duration,
};
use tokio::sync::{Semaphore, mpsc, oneshot};

const MAX_BEARER: usize = 8192;
const STATUS_TOOL: &str = "management__status";

#[derive(Clone)]
struct Credential(String);
impl std::fmt::Debug for Credential {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Credential(<redacted>)")
    }
}

#[derive(Clone, Debug)]
pub struct Bridge {
    sender: mpsc::Sender<Message>,
    resource_uri: Arc<str>,
    permits: Arc<Semaphore>,
}
#[derive(Debug)]
struct Message {
    credential: Credential,
    cancellation: tokio_util::sync::CancellationToken,
    action: Action,
    reply: oneshot::Sender<Result<Value, TransportError>>,
}
#[derive(Debug)]
enum Action {
    Catalog,
    Invoke(management::InvokeRequest),
    Status(String),
}
#[derive(Clone, Copy, Debug)]
enum TransportError {
    Denied,
    Unavailable,
    Invalid,
    Conflict,
    NotFound,
}

/// Own this handle in the Native Host's LocalSet. No listener or model starts implicitly.
#[derive(Debug)]
pub struct NativeBridge {
    pub bridge: Bridge,
    task: tokio::task::JoinHandle<()>,
}
impl NativeBridge {
    pub fn spawn(
        auth: AuthClient,
        management: management::ManagementClient,
        resource_uri: String,
        now: Rc<dyn Fn() -> Duration>,
        timeout: Duration,
    ) -> Result<Self, std::io::Error> {
        if timeout.is_zero() || timeout > Duration::from_secs(60) {
            return Err(std::io::Error::other("invalid management request timeout"));
        }
        validate_resource(&resource_uri)?;
        let frozen_resource: Arc<str> = resource_uri.clone().into();
        let (sender, mut receiver) = mpsc::channel::<Message>(64);
        let task = tokio::task::spawn_local(async move {
            let mut requests = tokio::task::JoinSet::new();
            let mut id = 0u64;
            while let Some(message) = receiver.recv().await {
                id = id.wrapping_add(1);
                let auth = auth.clone();
                let management = management.clone();
                let resource_uri = resource_uri.clone();
                let now = now.clone();
                requests.spawn_local(async move {
                    let cancellation=CancellationToken::new();let context=InvocationContext::new(id,Some(now()+timeout),cancellation.clone());
                    let result=tokio::select! {
                        ()=message.cancellation.cancelled()=>{cancellation.cancel();Err(TransportError::Unavailable)},
                        result=tokio::time::timeout(timeout,dispatch(&auth,&management,&resource_uri,context,message.credential,message.action))=>match result{Ok(result)=>result,Err(_)=>{cancellation.cancel();Err(TransportError::Unavailable)}},
                    };
                    let _=message.reply.send(result);
                });
                while requests.try_join_next().is_some() {}
            }
            requests.abort_all();
            while requests.join_next().await.is_some() {}
        });
        Ok(Self {
            bridge: Bridge {
                sender,
                resource_uri: frozen_resource,
                permits: Arc::new(Semaphore::new(32)),
            },
            task,
        })
    }
    pub async fn shutdown(mut self) {
        self.task.abort();
        let _ = (&mut self.task).await;
    }
}
impl Drop for NativeBridge {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl Bridge {
    async fn request(
        &self,
        credential: Credential,
        cancellation: tokio_util::sync::CancellationToken,
        action: Action,
    ) -> Result<Value, TransportError> {
        let _permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| TransportError::Unavailable)?;
        let cancellation = cancellation.child_token();
        let _cancel_on_drop = cancellation.clone().drop_guard();
        let (reply, result) = oneshot::channel();
        self.sender
            .send(Message {
                credential,
                cancellation,
                action,
                reply,
            })
            .await
            .map_err(|_| TransportError::Unavailable)?;
        result.await.map_err(|_| TransportError::Unavailable)?
    }
}
async fn dispatch(
    auth: &AuthClient,
    management: &management::ManagementClient,
    resource_uri: &str,
    context: InvocationContext,
    credential: Credential,
    action: Action,
) -> Result<Value, TransportError> {
    let response = auth
        .authenticate_with_context(
            context.clone(),
            authenticate_request(Some(CredentialEvidence::new("bearer", credential.0))),
        )
        .await
        .map_err(|error| match error {
            lenso_capability_auth::AuthInvocationError::Runtime(_)
            | lenso_capability_auth::AuthInvocationError::Domain(
                lenso_capability_auth::AuthenticateError::Unknown(_),
            ) => TransportError::Unavailable,
            lenso_capability_auth::AuthInvocationError::Domain(_) => TransportError::Denied,
        })?;
    let AuthOutcome::Authenticated(assertion) =
        decode_auth_response(response).map_err(|_| TransportError::Unavailable)?
    else {
        return Err(TransportError::Denied);
    };
    if assertion.actor_kind() != "user"
        || !assertion
            .audience()
            .iter()
            .any(|audience| audience == resource_uri)
    {
        return Err(TransportError::Denied);
    }
    let context = assertion
        .attach(context)
        .map_err(|_| TransportError::Unavailable)?;
    match action {
        Action::Catalog => serde_json::to_value(
            management
                .catalog_with_context(context, management::CatalogRequest {})
                .await
                .map_err(|error| match error {
                    management::ManagementCatalogInvocationError::Domain(
                        management::CatalogError::PermissionDenied,
                    ) => TransportError::Denied,
                    _ => TransportError::Unavailable,
                })?,
        )
        .map_err(|_| TransportError::Unavailable),
        Action::Invoke(request) => serde_json::to_value(
            management
                .invoke_with_context(context, request)
                .await
                .map_err(|error| match error {
                    management::ManagementInvokeInvocationError::Domain(
                        management::InvokeError::PermissionDenied,
                    ) => TransportError::Denied,
                    management::ManagementInvokeInvocationError::Domain(
                        management::InvokeError::Conflict,
                    ) => TransportError::Conflict,
                    management::ManagementInvokeInvocationError::Domain(
                        management::InvokeError::InvalidInput,
                    ) => TransportError::Invalid,
                    management::ManagementInvokeInvocationError::Domain(
                        management::InvokeError::NotFound,
                    ) => TransportError::NotFound,
                    _ => TransportError::Unavailable,
                })?,
        )
        .map_err(|_| TransportError::Unavailable),
        Action::Status(id) => serde_json::to_value(
            management
                .status_with_context(context, management::StatusRequest { operation_id: id })
                .await
                .map_err(|error| match error {
                    management::ManagementStatusInvocationError::Domain(
                        management::StatusError::PermissionDenied,
                    ) => TransportError::Denied,
                    management::ManagementStatusInvocationError::Domain(
                        management::StatusError::Conflict,
                    ) => TransportError::Conflict,
                    management::ManagementStatusInvocationError::Domain(
                        management::StatusError::NotFound,
                    ) => TransportError::NotFound,
                    _ => TransportError::Unavailable,
                })?,
        )
        .map_err(|_| TransportError::Unavailable),
    }
}

#[derive(Clone, Debug)]
pub struct Profile {
    pub resource_uri: String,
    pub authorization_servers: Vec<String>,
    pub allowed_origins: BTreeSet<String>,
    pub allowed_write_entries: BTreeSet<String>,
}
impl Profile {
    pub fn read_only(resource_uri: String) -> Self {
        Self {
            resource_uri,
            authorization_servers: vec![],
            allowed_origins: BTreeSet::new(),
            allowed_write_entries: BTreeSet::new(),
        }
    }
    fn visible(&self, entry: &management::Entry) -> bool {
        entry.effect == management::Effect::Read
            || (entry.requires_approval && self.allowed_write_entries.contains(&entry.id))
    }
    fn validate(&self) -> Result<(), std::io::Error> {
        validate_resource(&self.resource_uri)?;
        if self.allowed_write_entries.len() > 1
            || self
                .allowed_write_entries
                .iter()
                .any(|entry| entry.is_empty() || entry.len() > 128)
            || self.allowed_origins.iter().any(|origin| {
                url::Url::parse(origin)
                    .map_or(true, |url| url.origin().ascii_serialization() != *origin)
            })
            || self
                .authorization_servers
                .iter()
                .any(|server| url::Url::parse(server).map_or(true, |url| url.scheme() != "https"))
        {
            return Err(std::io::Error::other("invalid management MCP profile"));
        }
        Ok(())
    }
}
fn validate_resource(uri: &str) -> Result<(), std::io::Error> {
    let url = url::Url::parse(uri).map_err(|_| std::io::Error::other("invalid resource URI"))?;
    if !(url.scheme() == "https"
        || (url.scheme() == "http"
            && url
                .host_str()
                .is_some_and(|host| host == "localhost" || host == "127.0.0.1" || host == "[::1]")))
        || url.path() != "/mcp"
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(std::io::Error::other("invalid resource URI"));
    }
    Ok(())
}

#[derive(Clone, Debug)]
struct Handler {
    bridge: Bridge,
    profile: Arc<Profile>,
}
fn credential(context: &RequestContext<RoleServer>) -> Result<Credential, TransportError> {
    let parts = context
        .extensions
        .get::<Parts>()
        .ok_or(TransportError::Denied)?;
    header_credential(&parts.headers)
}
fn header_credential(headers: &http::HeaderMap) -> Result<Credential, TransportError> {
    let value = headers
        .get(http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| {
            !value.is_empty()
                && value.len() <= MAX_BEARER
                && value.bytes().all(|byte| byte.is_ascii_graphic())
        })
        .ok_or(TransportError::Denied)?;
    Ok(Credential(value.into()))
}
fn canonicalize(value: Value) -> Value {
    match value {
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| (key, canonicalize(value)))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize).collect()),
        value => value,
    }
}
fn tool_name(entry: &management::Entry) -> Result<String, TransportError> {
    let input: Value = serde_json::from_str(entry.input_schema_json.as_str())
        .map_err(|_| TransportError::Invalid)?;
    let identity = serde_json::json!([
        entry.id,
        entry.version,
        entry.capability,
        entry.operation,
        entry.target_instance,
        canonicalize(input),
        entry.effect,
        entry.requires_approval
    ]);
    let bytes = serde_json::to_vec(&identity).map_err(|_| TransportError::Invalid)?;
    let digest = format!("{:x}", Sha256::digest(bytes));
    Ok(format!("management__{}", &digest[..48]))
}
fn tool(entry: &management::Entry) -> Result<Tool, TransportError> {
    let input: Value = serde_json::from_str(entry.input_schema_json.as_str())
        .map_err(|_| TransportError::Invalid)?;
    let required = if entry.effect == management::Effect::Read {
        vec!["input"]
    } else {
        vec!["input", "idempotency_key"]
    };
    let value = serde_json::json!({"type":"object","additionalProperties":false,"properties":{"input":input,"idempotency_key":{"type":"string","minLength":1,"maxLength":128},"expected_revision":{"type":"string","minLength":1,"maxLength":128}},"required":required});
    Ok(Tool::new(
        tool_name(entry)?,
        entry.description.clone(),
        value.as_object().cloned().ok_or(TransportError::Invalid)?,
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Arguments {
    input: Value,
    #[serde(default)]
    idempotency_key: Option<String>,
    #[serde(default)]
    expected_revision: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusArguments {
    operation_id: String,
}
impl ServerHandler for Handler {
    fn supported_protocol_versions(&self) -> Cow<'static, [ProtocolVersion]> {
        Cow::Borrowed(ProtocolVersion::known_up_to(&ProtocolVersion::V_2025_11_25))
    }
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_instructions("Bound application management. Human approval is out of band; query the operation ID. Unknown writes are never replayed.")
    }
    async fn list_tools(
        &self,
        request: Option<PaginatedRequestParams>,
        context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        if request.is_some_and(|request| request.cursor.is_some()) {
            return Err(ErrorData::invalid_params(
                "Catalog cursors are not supported",
                None,
            ));
        }
        let credential = credential(&context).map_err(protocol_error)?;
        let value = self
            .bridge
            .request(credential, context.ct.clone(), Action::Catalog)
            .await
            .map_err(protocol_error)?;
        let catalog: management::CatalogResponse = serde_json::from_value(value)
            .map_err(|_| protocol_error(TransportError::Unavailable))?;
        let mut tools = catalog
            .entries
            .iter()
            .filter(|entry| self.profile.visible(entry))
            .map(tool)
            .collect::<Result<Vec<_>, _>>()
            .map_err(protocol_error)?;
        if !tools.is_empty() {
            tools.push(Tool::new(STATUS_TOOL,"Query one authorized management operation without replay",serde_json::json!({"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","minLength":1,"maxLength":128}},"required":["operation_id"]}).as_object().unwrap().clone()));
        }
        Ok(ListToolsResult {
            tools,
            ..Default::default()
        })
    }
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let outcome = async {
            let credential = credential(&context)?;
            let arguments = Value::Object(request.arguments.unwrap_or_default());
            if arguments.to_string().len() > 262144 {
                return Err(TransportError::Invalid);
            }
            if request.name == STATUS_TOOL {
                let arguments: StatusArguments =
                    serde_json::from_value(arguments).map_err(|_| TransportError::Invalid)?;
                return self
                    .bridge
                    .request(
                        credential,
                        context.ct.clone(),
                        Action::Status(arguments.operation_id),
                    )
                    .await;
            }
            let catalog: management::CatalogResponse = serde_json::from_value(
                self.bridge
                    .request(credential.clone(), context.ct.clone(), Action::Catalog)
                    .await?,
            )
            .map_err(|_| TransportError::Unavailable)?;
            let mut selected = None;
            for entry in catalog
                .entries
                .iter()
                .filter(|entry| self.profile.visible(entry))
            {
                if tool_name(entry)? == request.name {
                    selected = Some(entry);
                    break;
                }
            }
            let entry = selected.ok_or(TransportError::Denied)?;
            let arguments: Arguments =
                serde_json::from_value(arguments).map_err(|_| TransportError::Invalid)?;
            self.bridge
                .request(
                    credential,
                    context.ct.clone(),
                    Action::Invoke(management::InvokeRequest {
                        entry_id: entry.id.clone(),
                        version: entry.version.clone(),
                        input_json: arguments
                            .input
                            .to_string()
                            .parse()
                            .map_err(|_| TransportError::Invalid)?,
                        idempotency_key: arguments.idempotency_key,
                        expected_revision: arguments.expected_revision,
                    }),
                )
                .await
        }
        .await;
        Ok(match outcome {
            Ok(value) => {
                let mut result =
                    CallToolResult::success(vec![ContentBlock::text(value.to_string())]);
                result.structured_content = Some(value);
                result.into()
            }
            Err(error) => CallToolResult::error(vec![ContentBlock::text(match error {
                TransportError::Denied => "Management permission denied",
                TransportError::Invalid => "Invalid management arguments",
                TransportError::Conflict => "Management intent or revision conflict",
                TransportError::NotFound => "Management operation not found",
                TransportError::Unavailable => {
                    "Management response unavailable; query any returned operation ID"
                }
            })])
            .into(),
        })
    }
}
fn protocol_error(error: TransportError) -> ErrorData {
    ErrorData::invalid_request(
        match error {
            TransportError::Denied => "Management permission denied",
            TransportError::Invalid => "Invalid management request",
            TransportError::Conflict => "Management conflict",
            TransportError::NotFound => "Management operation not found",
            TransportError::Unavailable => "Management unavailable",
        },
        None,
    )
}

/// Mount this router explicitly in the selected Host. Default tools are read-only.
pub fn router(bridge: Bridge, profile: Profile) -> Result<Router, std::io::Error> {
    profile.validate()?;
    if bridge.resource_uri.as_ref() != profile.resource_uri {
        return Err(std::io::Error::other(
            "Management MCP resource binding mismatch",
        ));
    }
    let profile = Arc::new(profile);
    let handler = Handler {
        bridge: bridge.clone(),
        profile: profile.clone(),
    };
    let resource = url::Url::parse(&profile.resource_uri)
        .map_err(|_| std::io::Error::other("invalid resource URI"))?;
    let authority = resource[url::Position::BeforeHost..url::Position::AfterPort].to_owned();
    let config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_max_request_body_bytes(1_310_720)
        .with_allowed_hosts([authority])
        .with_allowed_origins(profile.allowed_origins.iter().cloned())
        .enforce_origin_validation();
    let service = StreamableHttpService::new(
        move || Ok(handler.clone()),
        Arc::new(LocalSessionManager::default()),
        config,
    );
    let protected =
        Router::new()
            .nest_service("/mcp", service)
            .layer(middleware::from_fn_with_state(
                (bridge, profile.clone()),
                admit,
            ));
    let metadata = serde_json::json!({"resource":profile.resource_uri,"authorization_servers":profile.authorization_servers,"bearer_methods_supported":["header"]});
    Ok(protected.route(
        "/.well-known/oauth-protected-resource",
        get(move || async move { Json(metadata.clone()) }),
    ))
}
async fn admit(
    State((bridge, profile)): State<(Bridge, Arc<Profile>)>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if request
        .headers()
        .get(http::header::ORIGIN)
        .is_some_and(|origin| {
            origin
                .to_str()
                .map_or(true, |origin| !profile.allowed_origins.contains(origin))
        })
    {
        return (StatusCode::FORBIDDEN, "Origin denied").into_response();
    }
    let credential = match header_credential(request.headers()) {
        Ok(credential) => credential,
        Err(_) => return unauthorized(&profile),
    };
    if bridge
        .request(
            credential,
            tokio_util::sync::CancellationToken::new(),
            Action::Catalog,
        )
        .await
        .is_err()
    {
        return unauthorized(&profile);
    }
    next.run(request).await
}
fn unauthorized(profile: &Profile) -> Response {
    let mut response = (StatusCode::UNAUTHORIZED, "Management credential required").into_response();
    let metadata = format!(
        "Bearer resource_metadata=\"{}\"",
        profile.resource_uri.trim_end_matches("/mcp").to_owned()
            + "/.well-known/oauth-protected-resource"
    );
    if let Ok(value) = metadata.parse() {
        response
            .headers_mut()
            .insert(http::header::WWW_AUTHENTICATE, value);
    }
    response
}

#[cfg(test)]
mod tests;
