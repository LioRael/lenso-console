use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::collections::BTreeSet;
#[cfg(test)]
use std::num::NonZeroU32;
use std::sync::OnceLock;
use std::time::Duration;
use utoipa::ToSchema;

use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, OpenApiRouter, Path, RequestContext, State, UserActor, json, routes,
};
pub(super) use lenso::workload_control::{
    OperationRecord as WorkloadOperationRecord, WORKLOAD_CONTROL_OBSERVE_PATH,
    WORKLOAD_CONTROL_OPERATION_PATH, WORKLOAD_CONTROL_OPERATIONS_PATH, WORKLOAD_CONTROL_PROTOCOL,
    WorkloadControlAction, WorkloadControlActor as WorkloadActor,
    WorkloadControlActorKind as WorkloadActorKind,
    WorkloadControlAuthorityDecision as WorkloadAuthorityDecision,
    WorkloadControlCapability as WorkloadCapability, WorkloadControlError,
    WorkloadControlErrorCode, WorkloadControlMessage,
    WorkloadMutationRequest as WorkloadOperationRequest, WorkloadObservation,
    WorkloadObservationRequest, WorkloadOperationPhase, WorkloadOperationalState,
    WorkloadProtection, WorkloadReference, validate_workload_control_message,
    workload_control_schema_digest,
};

use crate::composition::CONSOLE_SERVICE_ID;
use crate::modules::console_access;

use super::connection::{
    ConnectionStatus, ManagementBinding, SystemTopology, WorkloadControlAdapterInterface,
};
use super::{SYSTEM_READ, WORKLOAD_CONTROL, WORKLOAD_OPERATION_READ, WORKLOAD_READ};

const ADAPTER_CONFIG_ENV: &str = "LENSO_CONSOLE_WORKLOAD_CONTROL_ADAPTERS";
const ADAPTER_REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
const ADAPTER_RESPONSE_BODY_LIMIT: usize = 64 * 1_024;
const WORKLOAD_CONTROL_SCALAR_MAX_LENGTH: usize = 255;
const WORKLOAD_CONTROL_SAFE_MESSAGE_MAX_LENGTH: usize = 1_024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AdapterEndpointConfig {
    system_id: String,
    adapter_id: String,
    base_url: String,
    bearer_token: String,
}

pub(super) struct AdapterDirectory {
    targets: Vec<AdapterTarget>,
}

#[derive(Clone)]
pub(super) struct AdapterTarget {
    system_id: String,
    adapter_id: String,
    base_url: reqwest::Url,
    bearer_token: String,
}

#[derive(Clone, Copy)]
enum AdapterRoute<'a> {
    Observe,
    Mutate,
    Operation { operation_id: &'a str },
}

impl AdapterDirectory {
    pub(super) fn from_environment() -> Result<Self, String> {
        let raw = std::env::var(ADAPTER_CONFIG_ENV)
            .map_err(|_| format!("{ADAPTER_CONFIG_ENV} is not configured"))?;
        Self::parse(&raw)
    }

    fn parse(raw: &str) -> Result<Self, String> {
        let configured: Vec<AdapterEndpointConfig> = serde_json::from_str(raw)
            .map_err(|_| "Workload Control Adapter configuration is invalid".to_owned())?;
        let mut ids = std::collections::BTreeSet::new();
        let mut targets = Vec::with_capacity(configured.len());
        for config in configured {
            if !valid_path_identity(&config.system_id)
                || !valid_control_scalar(&config.adapter_id)
                || config.bearer_token.trim().is_empty()
                || !ids.insert((config.system_id.clone(), config.adapter_id.clone()))
            {
                return Err(
                    "Workload Control Adapter System identity, Adapter identity, and authentication must be explicit"
                        .to_owned(),
                );
            }
            let base_url = validate_adapter_origin(&config.base_url)?;
            targets.push(AdapterTarget {
                system_id: config.system_id,
                adapter_id: config.adapter_id,
                base_url,
                bearer_token: config.bearer_token,
            });
        }
        Ok(Self { targets })
    }

    pub(super) fn resolve(&self, system_id: &str, adapter_id: &str) -> Option<AdapterTarget> {
        self.targets
            .iter()
            .find(|target| target.system_id == system_id && target.adapter_id == adapter_id)
            .cloned()
    }
}

impl AdapterTarget {
    fn fingerprint(&self) -> String {
        format!(
            "sha256:{:x}",
            Sha256::digest(self.base_url.as_str().as_bytes())
        )
    }

    fn url(&self, route: AdapterRoute<'_>) -> Result<reqwest::Url, String> {
        let mut url = self.base_url.clone();
        let mut segments = url.path_segments_mut().map_err(|()| {
            "Workload Control Adapter origin cannot carry path segments".to_owned()
        })?;
        segments.pop_if_empty();
        match route {
            AdapterRoute::Observe => {
                segments.extend(
                    WORKLOAD_CONTROL_OBSERVE_PATH
                        .trim_start_matches('/')
                        .split('/'),
                );
            }
            AdapterRoute::Mutate => {
                segments.extend(
                    WORKLOAD_CONTROL_OPERATIONS_PATH
                        .trim_start_matches('/')
                        .split('/'),
                );
            }
            AdapterRoute::Operation { operation_id } => {
                let prefix = WORKLOAD_CONTROL_OPERATION_PATH
                    .strip_suffix("/{operationId}")
                    .ok_or_else(|| {
                        "Workload Control operation path contract is invalid".to_owned()
                    })?;
                segments.extend(prefix.trim_start_matches('/').split('/'));
                segments.push(operation_id);
            }
        }
        drop(segments);
        Ok(url)
    }
}

fn validate_adapter_origin(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value)
        .map_err(|_| "Workload Control Adapter origin is invalid".to_owned())?;
    let valid_scheme = matches!(url.scheme(), "https" | "http");
    let clean_authority = url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(url.path(), "" | "/")
        && url.query().is_none()
        && url.fragment().is_none();
    if !valid_scheme || !clean_authority {
        return Err("Workload Control Adapter origin is invalid".to_owned());
    }
    if !url.host_str().is_some_and(|host| {
        host == "localhost"
            || host
                .parse::<std::net::Ipv4Addr>()
                .is_ok_and(|address| address == std::net::Ipv4Addr::LOCALHOST)
    }) {
        return Err(
            "This Local Workload Control Adapter transport accepts loopback targets only"
                .to_owned(),
        );
    }
    Ok(url)
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct BrowserWorkloadMutationRequest {
    pub action: WorkloadControlAction,
    pub observed_revision: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserWorkloadAccessResponse {
    pub capabilities: Vec<String>,
}

fn validate_observation(
    observation: &WorkloadObservation,
    expected_workload: &WorkloadReference,
    expected_capabilities: &[WorkloadCapability],
) -> Result<(), String> {
    if !validate_workload_control_message(&WorkloadControlMessage::Observation(observation.clone()))
        .is_empty()
    {
        return Err("Workload Control Adapter observation violates the shared contract".to_owned());
    }
    if observation.protocol != WORKLOAD_CONTROL_PROTOCOL
        || observation.workload != *expected_workload
        || !valid_workload_reference(&observation.workload)
    {
        return Err("Workload Control Adapter observation correlation is invalid".to_owned());
    }
    match observation.state {
        WorkloadOperationalState::Unknown if observation.observed_revision.is_some() => {
            return Err("Unknown Workload operational state must not claim a revision".to_owned());
        }
        WorkloadOperationalState::Unknown => {}
        _ if observation
            .observed_revision
            .as_deref()
            .is_none_or(|revision| !valid_control_scalar(revision)) =>
        {
            return Err("Observed Workload state requires a revision".to_owned());
        }
        _ => {}
    }
    if observation
        .active_operation
        .as_deref()
        .is_some_and(|operation| !valid_path_identity(operation))
    {
        return Err("Active Workload operation handle must not be empty".to_owned());
    }
    let negotiated = expected_capabilities
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    if !observation.capabilities.is_subset(&negotiated) {
        return Err(
            "Workload observation capabilities exceed the negotiated Adapter interface".to_owned(),
        );
    }
    Ok(())
}

fn validate_operation_record(
    record: &WorkloadOperationRecord,
    expected_adapter_id: &str,
    expected_capabilities: &[WorkloadCapability],
    expected_operation_id: Option<&str>,
    expected_request: Option<&WorkloadOperationRequest>,
) -> Result<(), String> {
    if !validate_workload_control_message(&WorkloadControlMessage::OperationRecord(record.clone()))
        .is_empty()
    {
        return Err("Workload Control Adapter operation violates the shared contract".to_owned());
    }
    if record.protocol != WORKLOAD_CONTROL_PROTOCOL
        || record.request.protocol != WORKLOAD_CONTROL_PROTOCOL
    {
        return Err("Workload Control Adapter operation protocol is incompatible".to_owned());
    }
    if !valid_path_identity(&record.operation_id)
        || !valid_control_scalar(&record.authority.adapter_id)
        || record.authority.adapter_id != expected_adapter_id
    {
        return Err("Workload Control Adapter operation correlation is invalid".to_owned());
    }
    if expected_operation_id.is_some_and(|expected| record.operation_id != expected) {
        return Err("Workload Control Adapter returned a different operation handle".to_owned());
    }
    if !expected_capabilities.contains(&capability_for_action(&record.request.action)) {
        return Err(
            "Workload operation action exceeds the negotiated Adapter interface".to_owned(),
        );
    }
    if expected_request.is_some_and(|expected| record.request != *expected) {
        return Err("Workload Control Adapter changed the submitted mutation".to_owned());
    }
    validate_mutation_contract(&record.request)?;

    let decision_matches_phase = matches!(
        (record.authority.decision, record.phase),
        (
            WorkloadAuthorityDecision::Accepted,
            WorkloadOperationPhase::Accepted
                | WorkloadOperationPhase::Executing
                | WorkloadOperationPhase::Verifying
                | WorkloadOperationPhase::Succeeded
                | WorkloadOperationPhase::Failed
        ) | (
            WorkloadAuthorityDecision::Denied,
            WorkloadOperationPhase::Denied
        )
    );
    if !decision_matches_phase {
        return Err("Workload Control authority decision and operation phase disagree".to_owned());
    }
    if record.requested_at_unix_ms > record.decided_at_unix_ms
        || record.decided_at_unix_ms > record.updated_at_unix_ms
        || record
            .finished_at_unix_ms
            .is_some_and(|finished| record.updated_at_unix_ms > finished)
    {
        return Err("Workload Control operation timestamps are not monotonic".to_owned());
    }

    let outcome_matches_phase = match record.phase {
        WorkloadOperationPhase::Accepted
        | WorkloadOperationPhase::Executing
        | WorkloadOperationPhase::Verifying => {
            record.finished_at_unix_ms.is_none()
                && record.result.is_none()
                && record.failure.is_none()
        }
        WorkloadOperationPhase::Succeeded => {
            record.finished_at_unix_ms.is_some()
                && record.result.is_some()
                && record.failure.is_none()
        }
        WorkloadOperationPhase::Failed | WorkloadOperationPhase::Denied => {
            record.finished_at_unix_ms.is_some()
                && record.result.is_none()
                && record.failure.is_some()
        }
    };
    if !outcome_matches_phase {
        return Err("Workload Control operation phase and terminal outcome disagree".to_owned());
    }
    if let Some(result) = &record.result {
        let expected_state = match record.request.action {
            WorkloadControlAction::Suspend => WorkloadOperationalState::Suspended,
            WorkloadControlAction::Resume
            | WorkloadControlAction::Restart
            | WorkloadControlAction::Scale { .. } => WorkloadOperationalState::Running,
        };
        if result.state != expected_state || !valid_control_scalar(&result.observed_revision) {
            return Err("Workload Control operation result is invalid".to_owned());
        }
    }
    if record
        .failure
        .as_ref()
        .is_some_and(|failure| !valid_control_message(&failure.message))
    {
        return Err("Workload Control operation failure is invalid".to_owned());
    }
    Ok(())
}

fn sanitize_operation_record(mut record: WorkloadOperationRecord) -> WorkloadOperationRecord {
    if let Some(failure) = &mut record.failure {
        console_owned_operation_failure_message(failure.code).clone_into(&mut failure.message);
    }
    record
}

const fn console_owned_operation_failure_message(code: WorkloadControlErrorCode) -> &'static str {
    match code {
        WorkloadControlErrorCode::Unauthenticated => {
            "Workload Control authority could not authenticate the operation"
        }
        WorkloadControlErrorCode::Unauthorized => "Workload Control authority denied the operation",
        WorkloadControlErrorCode::UnsupportedAction => {
            "Workload Control authority does not support this action"
        }
        WorkloadControlErrorCode::ProtectedWorkload => "Workload is protected from this operation",
        WorkloadControlErrorCode::StaleRevision => "Workload observation revision became stale",
        WorkloadControlErrorCode::ActiveMutation => "Another Workload mutation is already active",
        WorkloadControlErrorCode::IdempotencyConflict => {
            "Workload mutation idempotency key conflicts with another request"
        }
        WorkloadControlErrorCode::AuthorityUnavailable => {
            "Workload Control authority became unavailable"
        }
        WorkloadControlErrorCode::IncompatibleProtocol => {
            "Workload Control authority returned an incompatible response"
        }
        WorkloadControlErrorCode::WorkloadNotFound => {
            "Workload was not found by the bound authority"
        }
        WorkloadControlErrorCode::OperationNotFound => {
            "Workload operation was not found by the bound authority"
        }
        WorkloadControlErrorCode::InvalidCapacity => "Requested Workload capacity is invalid",
    }
}

fn validate_mutation_contract(request: &WorkloadOperationRequest) -> Result<(), String> {
    if !validate_workload_control_message(&WorkloadControlMessage::MutationRequest(request.clone()))
        .is_empty()
    {
        return Err("Workload Control mutation violates the shared contract".to_owned());
    }
    if request.protocol != WORKLOAD_CONTROL_PROTOCOL
        || !valid_workload_reference(&request.workload)
        || !valid_control_scalar(&request.observed_revision)
        || !valid_control_scalar(&request.idempotency_key)
        || !valid_control_scalar(&request.actor.subject)
    {
        return Err("Workload Control mutation contract is invalid".to_owned());
    }
    Ok(())
}

fn validate_error(error: &WorkloadControlError) -> Result<(), String> {
    if !validate_workload_control_message(&WorkloadControlMessage::Error(error.clone())).is_empty()
    {
        return Err("Workload Control Adapter error violates the shared contract".to_owned());
    }
    if error.protocol != WORKLOAD_CONTROL_PROTOCOL || !valid_control_message(&error.message) {
        return Err("Workload Control Adapter error document is invalid".to_owned());
    }
    for optional in [
        error.operation_id.as_deref(),
        error.current_revision.as_deref(),
        error.active_operation.as_deref(),
    ] {
        if optional.is_some_and(|value| !valid_control_scalar(value)) {
            return Err("Workload Control Adapter error correlation is invalid".to_owned());
        }
    }
    Ok(())
}

type AdapterObserveRequest = WorkloadObservationRequest;
type AdapterMutationRequest = WorkloadOperationRequest;

enum AuthorityCallError {
    Unavailable,
    Incompatible,
    Rejected(WorkloadControlError),
}

impl std::fmt::Debug for AuthorityCallError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable => formatter.write_str("Unavailable"),
            Self::Incompatible => formatter.write_str("Incompatible"),
            Self::Rejected(error) => formatter
                .debug_tuple("Rejected")
                .field(&error.code)
                .finish(),
        }
    }
}

#[derive(Clone, Copy)]
enum AuthorityCallKind {
    Mutation,
    Operation,
}

/// Provider-neutral Console seam. Infrastructure authority configuration stays
/// behind this boundary; callers submit and receive only the shared contract.
trait WorkloadControlAuthorityPort {
    async fn observe(
        &self,
        request: &AdapterObserveRequest,
    ) -> Result<WorkloadObservation, AuthorityCallError>;

    async fn mutate(
        &self,
        request: &AdapterMutationRequest,
    ) -> Result<WorkloadOperationRecord, AuthorityCallError>;

    async fn operation(
        &self,
        operation_id: &str,
    ) -> Result<WorkloadOperationRecord, AuthorityCallError>;
}

struct LocalHttpWorkloadControlAdapter {
    target: Option<AdapterTarget>,
    client: Option<reqwest::Client>,
    response_body_limit: usize,
}

impl LocalHttpWorkloadControlAdapter {
    fn resolve(system_id: &str, adapter_id: &str) -> Self {
        Self {
            target: AdapterDirectory::from_environment()
                .ok()
                .and_then(|directory| directory.resolve(system_id, adapter_id)),
            client: local_adapter_client(),
            response_body_limit: ADAPTER_RESPONSE_BODY_LIMIT,
        }
    }

    fn request(
        &self,
        method: reqwest::Method,
        route: AdapterRoute<'_>,
    ) -> Result<reqwest::RequestBuilder, AuthorityCallError> {
        let target = self
            .target
            .as_ref()
            .ok_or(AuthorityCallError::Unavailable)?;
        if target.bearer_token.trim().is_empty() {
            return Err(AuthorityCallError::Unavailable);
        }
        let client = self
            .client
            .as_ref()
            .ok_or(AuthorityCallError::Unavailable)?;
        let url = target
            .url(route)
            .map_err(|_| AuthorityCallError::Incompatible)?;
        Ok(client
            .request(method, url)
            .bearer_auth(&target.bearer_token))
    }

    async fn decode<T>(
        &self,
        mut response: reqwest::Response,
        expected_status: StatusCode,
    ) -> Result<T, AuthorityCallError>
    where
        T: serde::de::DeserializeOwned,
    {
        let status = response.status();
        if status.is_redirection() {
            return Err(AuthorityCallError::Incompatible);
        }
        if response
            .content_length()
            .is_some_and(|length| length > self.response_body_limit as u64)
        {
            return Err(AuthorityCallError::Incompatible);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| AuthorityCallError::Unavailable)?
        {
            if chunk.len() > self.response_body_limit.saturating_sub(body.len()) {
                return Err(AuthorityCallError::Incompatible);
            }
            body.extend_from_slice(&chunk);
        }
        if status == expected_status {
            return serde_json::from_slice(&body).map_err(|_| AuthorityCallError::Incompatible);
        }
        let error: WorkloadControlError =
            serde_json::from_slice(&body).map_err(|_| AuthorityCallError::Incompatible)?;
        validate_error(&error).map_err(|_| AuthorityCallError::Incompatible)?;
        Err(AuthorityCallError::Rejected(error))
    }

    fn target_fingerprint(&self) -> Option<String> {
        self.target.as_ref().map(AdapterTarget::fingerprint)
    }

    #[cfg(test)]
    fn from_target(target: AdapterTarget) -> Self {
        Self::from_target_with_limits(target, ADAPTER_REQUEST_TIMEOUT, ADAPTER_RESPONSE_BODY_LIMIT)
    }

    #[cfg(test)]
    fn from_target_with_limits(
        target: AdapterTarget,
        timeout: Duration,
        response_body_limit: usize,
    ) -> Self {
        Self {
            target: Some(target),
            client: build_local_adapter_client(timeout).ok(),
            response_body_limit,
        }
    }
}

impl WorkloadControlAuthorityPort for LocalHttpWorkloadControlAdapter {
    async fn observe(
        &self,
        request: &AdapterObserveRequest,
    ) -> Result<WorkloadObservation, AuthorityCallError> {
        let response = self
            .request(reqwest::Method::POST, AdapterRoute::Observe)?
            .json(request)
            .send()
            .await
            .map_err(|_| AuthorityCallError::Unavailable)?;
        self.decode(response, StatusCode::OK).await
    }

    async fn mutate(
        &self,
        request: &AdapterMutationRequest,
    ) -> Result<WorkloadOperationRecord, AuthorityCallError> {
        let response = self
            .request(reqwest::Method::POST, AdapterRoute::Mutate)?
            .json(request)
            .send()
            .await
            .map_err(|_| AuthorityCallError::Unavailable)?;
        self.decode(response, StatusCode::ACCEPTED).await
    }

    async fn operation(
        &self,
        operation_id: &str,
    ) -> Result<WorkloadOperationRecord, AuthorityCallError> {
        let response = self
            .request(
                reqwest::Method::GET,
                AdapterRoute::Operation { operation_id },
            )?
            .send()
            .await
            .map_err(|_| AuthorityCallError::Unavailable)?;
        self.decode(response, StatusCode::OK).await
    }
}

fn local_adapter_client() -> Option<reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| build_local_adapter_client(ADAPTER_REQUEST_TIMEOUT).ok())
        .clone()
}

fn build_local_adapter_client(timeout: Duration) -> Result<reqwest::Client, reqwest::Error> {
    configure_local_adapter_client(reqwest::Client::builder(), timeout)
}

fn configure_local_adapter_client(
    builder: reqwest::ClientBuilder,
    timeout: Duration,
) -> Result<reqwest::Client, reqwest::Error> {
    builder
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .resolve(
            "localhost",
            std::net::SocketAddr::from((std::net::Ipv4Addr::LOCALHOST, 0)),
        )
        .connect_timeout(timeout)
        .timeout(timeout)
        .build()
}

const CONNECTION_SQL: &str = "select topology, management_binding \
    from console.system_connections where system_id = $1";
struct BoundAdapter {
    adapter_id: String,
    interface: WorkloadControlAdapterInterface,
    workload: WorkloadReference,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct StoredOperationBinding {
    workload: WorkloadReference,
    operation_id: String,
    adapter_id: String,
    topology_digest: String,
    adapter_target_fingerprint: String,
    operation_record: WorkloadOperationRecord,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OperationBindingReconciliation {
    KeepStored,
    StoreCandidate,
}

pub(super) fn router() -> ApiOpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(get_workload_access))
        .routes(routes!(observe_workload))
        .routes(routes!(request_workload_operation))
        .routes(routes!(get_workload_operation))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/systems/{systemId}/workload-access/{serviceId}",
    operation_id = "console_get_effective_workload_access",
    tag = "console-workload-control",
    params(
        ("systemId" = String, Path, description = "Stable System identity"),
        ("serviceId" = String, Path, description = "Stable Service identity")
    ),
    responses(
        (status = 200, body = BrowserWorkloadAccessResponse, content_type = "application/json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn get_workload_access(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path((system_id, service_id)): Path<(String, String)>,
) -> Result<Json<BrowserWorkloadAccessResponse>, ApiErrorResponse> {
    reject_console_target(&service_id, &request_ctx)?;
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        Some(&service_id),
        SYSTEM_READ,
        &request_ctx,
    )
    .await?;
    let (topology, binding) = load_connection(&ctx, &system_id, &request_ctx).await?;
    if !binding.service_ids.iter().any(|bound| bound == &service_id)
        || !topology
            .services
            .iter()
            .any(|service| service.service_id == service_id)
    {
        return Err(workload_not_found(&request_ctx));
    }
    let mut capabilities = Vec::new();
    for required in [WORKLOAD_READ, WORKLOAD_CONTROL, WORKLOAD_OPERATION_READ] {
        let binding_grants = binding
            .permissions
            .iter()
            .any(|permission| permission == required);
        let actor_grants = console_access::has_managed_service_capability(
            &ctx,
            &actor,
            Some(&service_id),
            required,
        )
        .await
        .map_err(|error| api_error(error, &request_ctx))?;
        if binding_grants && actor_grants {
            capabilities.push(required.to_owned());
        }
    }
    Ok(json(BrowserWorkloadAccessResponse { capabilities }))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}",
    operation_id = "console_observe_workload_control",
    tag = "console-workload-control",
    params(
        ("systemId" = String, Path, description = "Stable System identity"),
        ("serviceId" = String, Path, description = "Stable Service identity"),
        ("workloadId" = String, Path, description = "Stable Workload identity")
    ),
    responses(
        (status = 200, body = WorkloadObservation, content_type = "application/json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn observe_workload(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path((system_id, service_id, workload_id)): Path<(String, String, String)>,
) -> Result<Json<WorkloadObservation>, ApiErrorResponse> {
    reject_console_target(&service_id, &request_ctx)?;
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        Some(&service_id),
        WORKLOAD_READ,
        &request_ctx,
    )
    .await?;
    let (topology, binding) = load_connection(&ctx, &system_id, &request_ctx).await?;
    require_binding_permission(&binding, WORKLOAD_READ, &request_ctx)?;
    let workload = resolve_workload(&topology, &binding, &service_id, &workload_id, &request_ctx)?;
    let Ok(adapter) = resolve_bound_adapter(&topology, &binding) else {
        return Ok(json(unknown_observation(
            workload,
            BTreeSet::new(),
            WorkloadProtection::Controllable,
            observation_time(&ctx, &request_ctx)?,
        )));
    };
    let protection = workload_protection(&workload, &adapter);
    if protection == WorkloadProtection::ControlPlane {
        return Ok(json(unknown_observation(
            workload,
            BTreeSet::new(),
            protection,
            observation_time(&ctx, &request_ctx)?,
        )));
    }
    if adapter.interface.status != ConnectionStatus::Connected {
        return Ok(json(unknown_observation(
            workload,
            adapter.interface.capabilities.into_iter().collect(),
            protection,
            observation_time(&ctx, &request_ctx)?,
        )));
    }
    let authority =
        LocalHttpWorkloadControlAdapter::resolve(&workload.system_id, &adapter.adapter_id);
    let request = AdapterObserveRequest {
        protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
        workload: workload.clone(),
    };
    if let Ok(observation) = authority.observe(&request).await {
        validate_observation(&observation, &workload, &adapter.interface.capabilities)
            .map_err(|message| incompatible_adapter_error(&message, &request_ctx))?;
        return Ok(json(observation));
    }
    Ok(json(unknown_observation(
        workload,
        adapter.interface.capabilities.into_iter().collect(),
        protection,
        observation_time(&ctx, &request_ctx)?,
    )))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}/operations",
    operation_id = "console_request_workload_control_operation",
    tag = "console-workload-control",
    params(
        ("systemId" = String, Path, description = "Stable System identity"),
        ("serviceId" = String, Path, description = "Stable Service identity"),
        ("workloadId" = String, Path, description = "Stable Workload identity")
    ),
    request_body = BrowserWorkloadMutationRequest,
    responses(
        (status = 202, body = WorkloadOperationRecord, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 409, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn request_workload_operation(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path((system_id, service_id, workload_id)): Path<(String, String, String)>,
    Json(input): Json<BrowserWorkloadMutationRequest>,
) -> Result<(StatusCode, Json<WorkloadOperationRecord>), ApiErrorResponse> {
    reject_console_target(&service_id, &request_ctx)?;
    validate_browser_mutation(&input)
        .map_err(|message| validation_error(&message, &request_ctx))?;
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        Some(&service_id),
        WORKLOAD_CONTROL,
        &request_ctx,
    )
    .await?;
    let (topology, binding) = load_connection(&ctx, &system_id, &request_ctx).await?;
    require_binding_permission(&binding, WORKLOAD_CONTROL, &request_ctx)?;
    let workload = resolve_workload(&topology, &binding, &service_id, &workload_id, &request_ctx)?;
    let adapter = resolve_bound_adapter(&topology, &binding).map_err(|()| {
        incompatible_adapter_error("No exact bound Workload Control Adapter", &request_ctx)
    })?;
    reject_bound_adapter_target(&workload, &adapter, &request_ctx)?;
    if adapter.interface.status != ConnectionStatus::Connected {
        return Err(authority_unavailable_error(&request_ctx));
    }
    let capability = capability_for_action(&input.action);
    if !adapter.interface.capabilities.contains(&capability) {
        return Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "Workload Control Adapter does not advertise the requested capability",
            ),
            &request_ctx,
        ));
    }
    let request: AdapterMutationRequest = WorkloadOperationRequest {
        protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
        workload,
        action: input.action,
        observed_revision: input.observed_revision,
        idempotency_key: input.idempotency_key,
        actor: WorkloadActor {
            kind: WorkloadActorKind::Operator,
            subject: actor.user_id,
        },
    };
    validate_mutation_contract(&request)
        .map_err(|message| validation_error(&message, &request_ctx))?;
    let authority =
        LocalHttpWorkloadControlAdapter::resolve(&request.workload.system_id, &adapter.adapter_id);
    let adapter_target_fingerprint = authority
        .target_fingerprint()
        .ok_or_else(|| authority_unavailable_error(&request_ctx))?;
    let record = authority.mutate(&request).await.map_err(|error| {
        map_authority_call_error(error, AuthorityCallKind::Mutation, &request_ctx)
    })?;
    validate_operation_record(
        &record,
        &adapter.adapter_id,
        &adapter.interface.capabilities,
        None,
        Some(&request),
    )
    .map_err(|message| incompatible_adapter_error(&message, &request_ctx))?;
    let record = sanitize_operation_record(record);
    let record = persist_operation_binding(
        &ctx,
        &StoredOperationBinding {
            workload: request.workload,
            operation_id: record.operation_id.clone(),
            adapter_id: adapter.adapter_id,
            topology_digest: binding.topology_digest,
            adapter_target_fingerprint,
            operation_record: record.clone(),
        },
        &request_ctx,
    )
    .await?;
    Ok((
        StatusCode::ACCEPTED,
        json(sanitize_operation_record(record)),
    ))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/systems/{systemId}/workloads/{serviceId}/{workloadId}/operations/{operationId}",
    operation_id = "console_get_workload_control_operation",
    tag = "console-workload-control",
    params(
        ("systemId" = String, Path, description = "Stable System identity"),
        ("serviceId" = String, Path, description = "Stable Service identity"),
        ("workloadId" = String, Path, description = "Stable Workload identity"),
        ("operationId" = String, Path, description = "Opaque Workload operation handle")
    ),
    responses(
        (status = 200, body = WorkloadOperationRecord, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn get_workload_operation(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path((system_id, service_id, workload_id, operation_id)): Path<(
        String,
        String,
        String,
        String,
    )>,
) -> Result<Json<WorkloadOperationRecord>, ApiErrorResponse> {
    if !valid_path_identity(&operation_id) {
        return Err(validation_error(
            "Workload operation handle must be non-empty, bounded, and URL-safe",
            &request_ctx,
        ));
    }
    reject_console_target(&service_id, &request_ctx)?;
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        Some(&service_id),
        WORKLOAD_OPERATION_READ,
        &request_ctx,
    )
    .await?;
    let (topology, binding) = load_connection(&ctx, &system_id, &request_ctx).await?;
    require_binding_permission(&binding, WORKLOAD_OPERATION_READ, &request_ctx)?;
    let workload = resolve_workload(&topology, &binding, &service_id, &workload_id, &request_ctx)?;
    let stored = load_operation_binding(&ctx, &workload, &operation_id, &request_ctx).await?;
    let adapter = resolve_bound_adapter(&topology, &binding).map_err(|()| {
        incompatible_adapter_error("No exact bound Workload Control Adapter", &request_ctx)
    })?;
    reject_bound_adapter_target(&workload, &adapter, &request_ctx)?;
    validate_operation_binding_topology(&stored, &binding, &adapter)
        .map_err(|message| incompatible_adapter_error(&message, &request_ctx))?;
    if let Some(terminal) =
        terminal_operation_record(&stored, &workload, &adapter.interface.capabilities)
            .map_err(|message| incompatible_adapter_error(&message, &request_ctx))?
    {
        return Ok(json(terminal));
    }
    if adapter.interface.status != ConnectionStatus::Connected {
        return Err(operation_unavailable_error(&request_ctx));
    }
    let authority =
        LocalHttpWorkloadControlAdapter::resolve(&workload.system_id, &adapter.adapter_id);
    validate_operation_binding(&stored, &binding, &adapter, &authority)
        .map_err(|message| incompatible_adapter_error(&message, &request_ctx))?;
    let record = authority.operation(&operation_id).await.map_err(|error| {
        map_authority_call_error(error, AuthorityCallKind::Operation, &request_ctx)
    })?;
    validate_operation_record(
        &record,
        &adapter.adapter_id,
        &adapter.interface.capabilities,
        Some(&operation_id),
        Some(&stored.operation_record.request),
    )
    .map_err(|message| incompatible_adapter_error(&message, &request_ctx))?;
    let record = sanitize_operation_record(record);
    validate_operation_progress(&stored.operation_record, &record)
        .map_err(|message| incompatible_adapter_error(&message, &request_ctx))?;
    let record = update_operation_binding_record(&ctx, &stored, &record, &request_ctx).await?;
    Ok(json(sanitize_operation_record(record)))
}

#[cfg(test)]
fn resolve_operation_workload(
    record: &WorkloadOperationRecord,
    topology: &SystemTopology,
    binding: &ManagementBinding,
    adapter: &BoundAdapter,
    request_ctx: &RequestContext,
) -> Result<WorkloadReference, ApiErrorResponse> {
    let reference = &record.request.workload;
    reject_console_target(&reference.service_id, request_ctx)?;
    reject_bound_adapter_target(reference, adapter, request_ctx)?;
    let resolved = resolve_workload(
        topology,
        binding,
        &reference.service_id,
        &reference.workload_id,
        request_ctx,
    )?;
    if resolved != *reference {
        return Err(incompatible_adapter_error(
            "Workload Control operation references a different bound Workload",
            request_ctx,
        ));
    }
    Ok(resolved)
}

async fn load_connection(
    ctx: &AppContext,
    system_id: &str,
    request_ctx: &RequestContext,
) -> Result<(SystemTopology, ManagementBinding), ApiErrorResponse> {
    let row = sqlx::query(CONNECTION_SQL)
        .bind(system_id)
        .fetch_optional(&ctx.db)
        .await
        .map_err(|error| database_error(error, request_ctx))?
        .ok_or_else(|| {
            api_error(
                AppError::new(ErrorCode::NotFound, "System Connection was not found"),
                request_ctx,
            )
        })?;
    let topology: Value = row
        .try_get("topology")
        .map_err(|error| database_error(error, request_ctx))?;
    let binding: Value = row
        .try_get("management_binding")
        .map_err(|error| database_error(error, request_ctx))?;
    let topology: SystemTopology = serde_json::from_value(topology).map_err(|_| {
        api_error(
            AppError::new(
                ErrorCode::Internal,
                "Stored System topology is invalid for Workload Control",
            ),
            request_ctx,
        )
    })?;
    let binding: ManagementBinding = serde_json::from_value(binding).map_err(|_| {
        api_error(
            AppError::new(
                ErrorCode::Internal,
                "Stored Management Binding is invalid for Workload Control",
            ),
            request_ctx,
        )
    })?;
    if topology.system_id != system_id || binding.system_id != system_id {
        return Err(incompatible_adapter_error(
            "Stored Workload Control System identity does not match the requested System",
            request_ctx,
        ));
    }
    Ok((topology, binding))
}

async fn persist_operation_binding(
    ctx: &AppContext,
    binding: &StoredOperationBinding,
    request_ctx: &RequestContext,
) -> Result<WorkloadOperationRecord, ApiErrorResponse> {
    let record = serde_json::to_value(&binding.operation_record).map_err(|error| {
        api_error(
            AppError::new(
                ErrorCode::Internal,
                "Workload operation correlation could not be stored",
            )
            .with_source(error),
            request_ctx,
        )
    })?;
    sqlx::query(
        "insert into console.workload_control_operations \
            (system_id, service_id, workload_id, operation_id, adapter_id, \
             topology_digest, adapter_target_fingerprint, operation_record) \
         values ($1, $2, $3, $4, $5, $6, $7, $8) \
         on conflict do nothing",
    )
    .bind(&binding.workload.system_id)
    .bind(&binding.workload.service_id)
    .bind(&binding.workload.workload_id)
    .bind(&binding.operation_id)
    .bind(&binding.adapter_id)
    .bind(&binding.topology_digest)
    .bind(&binding.adapter_target_fingerprint)
    .bind(record)
    .execute(&ctx.db)
    .await
    .map_err(|error| database_error(error, request_ctx))?;

    let stored = load_operation_binding_by_authority(
        ctx,
        &binding.workload.system_id,
        &binding.adapter_id,
        &binding.operation_id,
        request_ctx,
    )
    .await?;
    match reconcile_operation_binding(&stored, binding) {
        Ok(OperationBindingReconciliation::KeepStored) => Ok(stored.operation_record),
        Ok(OperationBindingReconciliation::StoreCandidate) => {
            update_operation_binding_record(ctx, &stored, &binding.operation_record, request_ctx)
                .await
        }
        Err(message) => Err(api_error(
            AppError::new(ErrorCode::Conflict, message),
            request_ctx,
        )),
    }
}

async fn load_operation_binding(
    ctx: &AppContext,
    workload: &WorkloadReference,
    operation_id: &str,
    request_ctx: &RequestContext,
) -> Result<StoredOperationBinding, ApiErrorResponse> {
    let row = sqlx::query(
        "select system_id, service_id, workload_id, operation_id, adapter_id, \
                topology_digest, adapter_target_fingerprint, operation_record \
         from console.workload_control_operations \
         where system_id = $1 and service_id = $2 and workload_id = $3 and operation_id = $4",
    )
    .bind(&workload.system_id)
    .bind(&workload.service_id)
    .bind(&workload.workload_id)
    .bind(operation_id)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|error| database_error(error, request_ctx))?
    .ok_or_else(|| {
        api_error(
            AppError::new(
                ErrorCode::NotFound,
                "Workload operation was not accepted through this Console",
            ),
            request_ctx,
        )
    })?;
    operation_binding_from_row(&row, request_ctx)
}

async fn load_operation_binding_by_authority(
    ctx: &AppContext,
    system_id: &str,
    adapter_id: &str,
    operation_id: &str,
    request_ctx: &RequestContext,
) -> Result<StoredOperationBinding, ApiErrorResponse> {
    let row = sqlx::query(
        "select system_id, service_id, workload_id, operation_id, adapter_id, \
                topology_digest, adapter_target_fingerprint, operation_record \
         from console.workload_control_operations \
         where system_id = $1 and adapter_id = $2 and operation_id = $3",
    )
    .bind(system_id)
    .bind(adapter_id)
    .bind(operation_id)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|error| database_error(error, request_ctx))?
    .ok_or_else(|| {
        api_error(
            AppError::new(
                ErrorCode::Conflict,
                "Workload operation handle is already bound to a different authority target",
            ),
            request_ctx,
        )
    })?;
    operation_binding_from_row(&row, request_ctx)
}

fn operation_binding_from_row(
    row: &sqlx::postgres::PgRow,
    request_ctx: &RequestContext,
) -> Result<StoredOperationBinding, ApiErrorResponse> {
    let record: Value = row
        .try_get("operation_record")
        .map_err(|error| database_error(error, request_ctx))?;
    let operation_record = serde_json::from_value(record).map_err(|error| {
        api_error(
            AppError::new(
                ErrorCode::Internal,
                "Stored Workload operation correlation is invalid",
            )
            .with_source(error),
            request_ctx,
        )
    })?;
    Ok(StoredOperationBinding {
        workload: WorkloadReference {
            system_id: row
                .try_get("system_id")
                .map_err(|error| database_error(error, request_ctx))?,
            service_id: row
                .try_get("service_id")
                .map_err(|error| database_error(error, request_ctx))?,
            workload_id: row
                .try_get("workload_id")
                .map_err(|error| database_error(error, request_ctx))?,
        },
        operation_id: row
            .try_get("operation_id")
            .map_err(|error| database_error(error, request_ctx))?,
        adapter_id: row
            .try_get("adapter_id")
            .map_err(|error| database_error(error, request_ctx))?,
        topology_digest: row
            .try_get("topology_digest")
            .map_err(|error| database_error(error, request_ctx))?,
        adapter_target_fingerprint: row
            .try_get("adapter_target_fingerprint")
            .map_err(|error| database_error(error, request_ctx))?,
        operation_record,
    })
}

async fn update_operation_binding_record(
    ctx: &AppContext,
    binding: &StoredOperationBinding,
    next_record: &WorkloadOperationRecord,
    request_ctx: &RequestContext,
) -> Result<WorkloadOperationRecord, ApiErrorResponse> {
    let previous = serde_json::to_value(&binding.operation_record).map_err(|error| {
        api_error(
            AppError::new(
                ErrorCode::Internal,
                "Stored Workload operation correlation is invalid",
            )
            .with_source(error),
            request_ctx,
        )
    })?;
    let next = serde_json::to_value(next_record).map_err(|error| {
        api_error(
            AppError::new(
                ErrorCode::Internal,
                "Workload operation correlation could not be updated",
            )
            .with_source(error),
            request_ctx,
        )
    })?;
    let result = sqlx::query(
        "update console.workload_control_operations \
         set operation_record = $5, updated_at = now() \
         where system_id = $1 and service_id = $2 and workload_id = $3 \
           and operation_id = $4 and operation_record = $6",
    )
    .bind(&binding.workload.system_id)
    .bind(&binding.workload.service_id)
    .bind(&binding.workload.workload_id)
    .bind(&binding.operation_id)
    .bind(&next)
    .bind(previous)
    .execute(&ctx.db)
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    if result.rows_affected() == 1 {
        return Ok(next_record.clone());
    }
    let current =
        load_operation_binding(ctx, &binding.workload, &binding.operation_id, request_ctx).await?;
    authoritative_record_after_cas_loss(next_record, current.operation_record)
        .map_err(|message| incompatible_adapter_error(message, request_ctx))
}

fn authoritative_record_after_cas_loss(
    candidate: &WorkloadOperationRecord,
    current: WorkloadOperationRecord,
) -> Result<WorkloadOperationRecord, &'static str> {
    if current == *candidate || validate_operation_progress(candidate, &current).is_ok() {
        return Ok(current);
    }
    Err("Workload operation advanced concurrently; retry the authoritative observation")
}

fn validate_operation_binding(
    stored: &StoredOperationBinding,
    management_binding: &ManagementBinding,
    adapter: &BoundAdapter,
    authority: &LocalHttpWorkloadControlAdapter,
) -> Result<(), String> {
    validate_operation_binding_topology(stored, management_binding, adapter)?;
    let target_matches = authority
        .target_fingerprint()
        .is_some_and(|fingerprint| fingerprint == stored.adapter_target_fingerprint);
    if !target_matches {
        return Err(
            "Workload operation authority changed after the operation was accepted".to_owned(),
        );
    }
    Ok(())
}

fn validate_operation_binding_topology(
    stored: &StoredOperationBinding,
    management_binding: &ManagementBinding,
    adapter: &BoundAdapter,
) -> Result<(), String> {
    if stored.topology_digest != management_binding.topology_digest
        || stored.adapter_id != adapter.adapter_id
    {
        return Err(
            "Workload operation authority changed after the operation was accepted".to_owned(),
        );
    }
    Ok(())
}

fn terminal_operation_record(
    stored: &StoredOperationBinding,
    workload: &WorkloadReference,
    expected_capabilities: &[WorkloadCapability],
) -> Result<Option<WorkloadOperationRecord>, String> {
    validate_operation_record(
        &stored.operation_record,
        &stored.adapter_id,
        expected_capabilities,
        Some(&stored.operation_id),
        None,
    )?;
    if stored.operation_record.request.workload != *workload {
        return Err("Stored Workload operation references a different Workload".to_owned());
    }
    Ok(stored
        .operation_record
        .phase
        .is_terminal()
        .then(|| sanitize_operation_record(stored.operation_record.clone())))
}

fn reconcile_operation_binding(
    stored: &StoredOperationBinding,
    candidate: &StoredOperationBinding,
) -> Result<OperationBindingReconciliation, String> {
    if stored.workload != candidate.workload
        || stored.operation_id != candidate.operation_id
        || stored.adapter_id != candidate.adapter_id
        || stored.topology_digest != candidate.topology_digest
        || stored.adapter_target_fingerprint != candidate.adapter_target_fingerprint
    {
        return Err(
            "Workload operation handle is already bound to different authority evidence".to_owned(),
        );
    }
    if stored.operation_record == candidate.operation_record
        || validate_operation_progress(&candidate.operation_record, &stored.operation_record)
            .is_ok()
    {
        return Ok(OperationBindingReconciliation::KeepStored);
    }
    validate_operation_progress(&stored.operation_record, &candidate.operation_record)?;
    Ok(OperationBindingReconciliation::StoreCandidate)
}

fn validate_operation_progress(
    previous: &WorkloadOperationRecord,
    next: &WorkloadOperationRecord,
) -> Result<(), String> {
    if previous.operation_id != next.operation_id
        || previous.request != next.request
        || previous.authority != next.authority
        || previous.requested_at_unix_ms != next.requested_at_unix_ms
        || previous.decided_at_unix_ms != next.decided_at_unix_ms
        || next.updated_at_unix_ms < previous.updated_at_unix_ms
        || !previous.phase.can_advance_to(next.phase)
        || (previous.phase.is_terminal() && previous != next)
    {
        return Err("Workload operation record regressed or changed immutable evidence".to_owned());
    }
    Ok(())
}

fn resolve_workload(
    topology: &SystemTopology,
    binding: &ManagementBinding,
    service_id: &str,
    workload_id: &str,
    request_ctx: &RequestContext,
) -> Result<WorkloadReference, ApiErrorResponse> {
    if topology.system_id != binding.system_id
        || !binding.service_ids.iter().any(|bound| bound == service_id)
    {
        return Err(api_error(
            AppError::new(
                ErrorCode::Forbidden,
                "Workload is not part of the active Management Binding",
            ),
            request_ctx,
        ));
    }
    let service = topology
        .services
        .iter()
        .find(|service| service.service_id == service_id)
        .ok_or_else(|| workload_not_found(request_ctx))?;
    let workload = service
        .workloads
        .iter()
        .find(|workload| workload.workload_id == workload_id)
        .ok_or_else(|| workload_not_found(request_ctx))?;
    if workload.role.trim().is_empty() {
        return Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "Stable Workload role is incompatible with Workload Control",
            ),
            request_ctx,
        ));
    }
    let reference = WorkloadReference {
        system_id: topology.system_id.clone(),
        service_id: service.service_id.clone(),
        workload_id: workload.workload_id.clone(),
    };
    if !valid_workload_reference(&reference) {
        return Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "Stable Workload identity is incompatible with Workload Control",
            ),
            request_ctx,
        ));
    }
    Ok(reference)
}

fn resolve_bound_adapter(
    topology: &SystemTopology,
    binding: &ManagementBinding,
) -> Result<BoundAdapter, ()> {
    let mut candidates = topology.adapters.iter().filter_map(|adapter| {
        if !binding
            .adapter_ids
            .iter()
            .any(|bound| bound == &adapter.adapter_id)
        {
            return None;
        }
        adapter
            .workload_control
            .as_ref()
            .map(|interface| (adapter, interface))
    });
    let Some((adapter, interface)) = candidates.next() else {
        return Err(());
    };
    if candidates.next().is_some()
        || interface.protocol != WORKLOAD_CONTROL_PROTOCOL
        || interface.schema_digest != workload_control_schema_digest()
    {
        return Err(());
    }
    let workload = adapter.workload.clone().ok_or(())?;
    let workload_exists = valid_workload_reference(&workload)
        && workload.system_id == topology.system_id
        && topology.services.iter().any(|service| {
            service.service_id == workload.service_id
                && service
                    .workloads
                    .iter()
                    .any(|candidate| candidate.workload_id == workload.workload_id)
        });
    if !workload_exists {
        return Err(());
    }
    Ok(BoundAdapter {
        adapter_id: adapter.adapter_id.clone(),
        interface: interface.clone(),
        workload,
    })
}

fn require_binding_permission(
    binding: &ManagementBinding,
    required: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if binding
        .permissions
        .iter()
        .any(|permission| permission == required)
    {
        return Ok(());
    }
    Err(api_error(
        AppError::new(
            ErrorCode::Forbidden,
            format!("Management Binding does not grant {required}"),
        ),
        request_ctx,
    ))
}

fn unknown_observation(
    workload: WorkloadReference,
    capabilities: BTreeSet<WorkloadCapability>,
    protection: WorkloadProtection,
    observed_at_unix_ms: u64,
) -> WorkloadObservation {
    WorkloadObservation {
        protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
        workload,
        state: WorkloadOperationalState::Unknown,
        observed_revision: None,
        capabilities,
        protection,
        active_operation: None,
        observed_at_unix_ms,
    }
}

fn observation_time(
    ctx: &AppContext,
    request_ctx: &RequestContext,
) -> Result<u64, ApiErrorResponse> {
    u64::try_from(ctx.clock.now().timestamp_millis()).map_err(|error| {
        api_error(
            AppError::new(ErrorCode::Internal, "Console clock is unavailable").with_source(error),
            request_ctx,
        )
    })
}

fn validate_browser_mutation(input: &BrowserWorkloadMutationRequest) -> Result<(), String> {
    if !valid_control_scalar(&input.observed_revision) {
        return Err("observedRevision must be a non-empty stable value".to_owned());
    }
    if !valid_control_scalar(&input.idempotency_key) {
        return Err("idempotencyKey must be a non-empty stable value".to_owned());
    }
    Ok(())
}

pub(super) fn valid_control_scalar(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= WORKLOAD_CONTROL_SCALAR_MAX_LENGTH
}

pub(super) fn valid_path_identity(value: &str) -> bool {
    valid_control_scalar(value) && !matches!(value, "." | "..")
}

pub(super) fn valid_workload_reference(workload: &WorkloadReference) -> bool {
    valid_path_identity(&workload.system_id)
        && valid_path_identity(&workload.service_id)
        && valid_path_identity(&workload.workload_id)
}

fn valid_control_message(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= WORKLOAD_CONTROL_SAFE_MESSAGE_MAX_LENGTH
}

const fn capability_for_action(action: &WorkloadControlAction) -> WorkloadCapability {
    match action {
        WorkloadControlAction::Suspend => WorkloadCapability::Suspend,
        WorkloadControlAction::Resume => WorkloadCapability::Resume,
        WorkloadControlAction::Restart => WorkloadCapability::Restart,
        WorkloadControlAction::Scale { .. } => WorkloadCapability::Scale,
    }
}

fn reject_console_target(
    service_id: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if service_id != CONSOLE_SERVICE_ID {
        return Ok(());
    }
    Err(api_error(
        AppError::new(
            ErrorCode::Forbidden,
            "Console workload is protected from Workload Control",
        ),
        request_ctx,
    ))
}

fn workload_protection(workload: &WorkloadReference, adapter: &BoundAdapter) -> WorkloadProtection {
    if workload.service_id == CONSOLE_SERVICE_ID || workload == &adapter.workload {
        WorkloadProtection::ControlPlane
    } else {
        WorkloadProtection::Controllable
    }
}

fn reject_bound_adapter_target(
    workload: &WorkloadReference,
    adapter: &BoundAdapter,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if workload_protection(workload, adapter) == WorkloadProtection::Controllable {
        return Ok(());
    }
    Err(api_error(
        AppError::new(
            ErrorCode::Forbidden,
            "Active Workload Control Adapter is protected from Workload Control",
        ),
        request_ctx,
    ))
}

fn authority_unavailable_error(request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::ExternalDependency,
            "Workload Control authority is unavailable; mutation was not queued",
        ),
        request_ctx,
    )
}

fn operation_unavailable_error(request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::ExternalDependency,
            "Workload Control authority is unavailable; operation status is unknown",
        ),
        request_ctx,
    )
}

fn map_authority_call_error(
    error: AuthorityCallError,
    kind: AuthorityCallKind,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    match error {
        AuthorityCallError::Unavailable => match kind {
            AuthorityCallKind::Mutation => authority_unavailable_error(request_ctx),
            AuthorityCallKind::Operation => operation_unavailable_error(request_ctx),
        },
        AuthorityCallError::Incompatible => incompatible_adapter_error(
            "Workload Control Adapter returned an incompatible response",
            request_ctx,
        ),
        AuthorityCallError::Rejected(error) => {
            let (code, message) = match error.code {
                WorkloadControlErrorCode::Unauthenticated
                | WorkloadControlErrorCode::AuthorityUnavailable => {
                    return match kind {
                        AuthorityCallKind::Mutation => authority_unavailable_error(request_ctx),
                        AuthorityCallKind::Operation => operation_unavailable_error(request_ctx),
                    };
                }
                WorkloadControlErrorCode::Unauthorized => (
                    ErrorCode::Forbidden,
                    "The bound Workload Control authority denied this actor",
                ),
                WorkloadControlErrorCode::UnsupportedAction => (
                    ErrorCode::Conflict,
                    "The bound Workload Control authority does not support this action",
                ),
                WorkloadControlErrorCode::ProtectedWorkload => (
                    ErrorCode::Forbidden,
                    "The bound Workload Control authority protects this Workload",
                ),
                WorkloadControlErrorCode::StaleRevision => (
                    ErrorCode::Conflict,
                    "The submitted Workload observation revision is stale",
                ),
                WorkloadControlErrorCode::ActiveMutation => (
                    ErrorCode::Conflict,
                    "Another Workload mutation is already active",
                ),
                WorkloadControlErrorCode::IdempotencyConflict => (
                    ErrorCode::Conflict,
                    "The Workload mutation idempotency key conflicts with another request",
                ),
                WorkloadControlErrorCode::IncompatibleProtocol => (
                    ErrorCode::ExternalDependency,
                    "The bound Workload Control authority is protocol-incompatible",
                ),
                WorkloadControlErrorCode::WorkloadNotFound => (
                    ErrorCode::NotFound,
                    "Stable Workload was not found by the bound authority",
                ),
                WorkloadControlErrorCode::OperationNotFound => (
                    ErrorCode::NotFound,
                    "Workload operation was not found by the bound authority",
                ),
                WorkloadControlErrorCode::InvalidCapacity => (
                    ErrorCode::Validation,
                    "The requested Workload capacity is invalid",
                ),
            };
            api_error(AppError::new(code, message), request_ctx)
        }
    }
}

fn incompatible_adapter_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(ErrorCode::ExternalDependency, message),
        request_ctx,
    )
}

fn workload_not_found(request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(ErrorCode::NotFound, "Stable Workload was not found"),
        request_ctx,
    )
}

fn validation_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(AppError::new(ErrorCode::Validation, message), request_ctx)
}

fn database_error(error: sqlx::Error, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::Internal,
            "Workload Control System Connection lookup failed",
        )
        .with_source(error),
        request_ctx,
    )
}

fn api_error(error: AppError, request_ctx: &RequestContext) -> ApiErrorResponse {
    ApiErrorResponse::with_context(error, request_ctx)
}

#[cfg(test)]
mod tests {
    use super::super::connection::{
        ManagementPolicy, SystemTopologyAdapter, SystemTopologyService, SystemTopologyWorkload,
        WorkloadControlAdapterInterface,
    };
    use super::*;
    use lenso::workload_control::{
        WorkloadControlAuthority as WorkloadOperationAuthority, WorkloadControlErrorCode,
        WorkloadControlFailure, WorkloadOperationResult,
    };
    use platform_core::{CorrelationId, RequestId};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct CapturedAdapterCall {
        method: String,
        path: String,
        authorization: Option<String>,
        body: Value,
    }

    #[derive(Clone)]
    struct MockAdapterState {
        calls: Arc<Mutex<Vec<CapturedAdapterCall>>>,
        observation: WorkloadObservation,
        accepted: WorkloadOperationRecord,
        completed: WorkloadOperationRecord,
    }

    async fn mock_adapter_handler(
        axum::extract::State(state): axum::extract::State<MockAdapterState>,
        request: axum::extract::Request,
    ) -> axum::response::Response {
        use axum::response::IntoResponse;

        let method = request.method().to_string();
        let path = request.uri().path().to_owned();
        let authorization = request
            .headers()
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let body = axum::body::to_bytes(request.into_body(), 128 * 1_024)
            .await
            .expect("bounded mock request body");
        let body = if body.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&body).expect("mock request JSON")
        };
        state
            .calls
            .lock()
            .expect("mock calls lock")
            .push(CapturedAdapterCall {
                method: method.clone(),
                path: path.clone(),
                authorization,
                body,
            });

        match (method.as_str(), path.as_str()) {
            ("POST", WORKLOAD_CONTROL_OBSERVE_PATH) => {
                (StatusCode::OK, axum::Json(state.observation)).into_response()
            }
            ("POST", WORKLOAD_CONTROL_OPERATIONS_PATH) => {
                (StatusCode::ACCEPTED, axum::Json(state.accepted)).into_response()
            }
            ("GET", "/workload-control/v1/operations/operation-7") => {
                (StatusCode::OK, axum::Json(state.completed)).into_response()
            }
            _ => StatusCode::NOT_FOUND.into_response(),
        }
    }

    async fn spawn_mock_adapter(
        observation: WorkloadObservation,
        accepted: WorkloadOperationRecord,
        completed: WorkloadOperationRecord,
    ) -> (
        AdapterTarget,
        Arc<Mutex<Vec<CapturedAdapterCall>>>,
        tokio::task::JoinHandle<()>,
    ) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let app = axum::Router::new()
            .fallback(mock_adapter_handler)
            .with_state(MockAdapterState {
                calls: Arc::clone(&calls),
                observation,
                accepted,
                completed,
            });
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("mock loopback listener");
        let address = listener.local_addr().expect("mock loopback address");
        let server = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("mock Adapter server");
        });
        let target = target_for_address(address);
        (target, calls, server)
    }

    fn target_for_address(address: std::net::SocketAddr) -> AdapterTarget {
        target_for_origin(&format!("http://{address}"))
    }

    fn target_for_origin(origin: &str) -> AdapterTarget {
        let directory = AdapterDirectory::parse(
            &serde_json::json!([{
                "systemId": "support-desk",
                "adapterId": "support-control",
                "baseUrl": origin,
                "bearerToken": "adapter-secret"
            }])
            .to_string(),
        )
        .expect("mock Adapter directory");
        directory
            .resolve("support-desk", "support-control")
            .expect("mock Adapter target")
    }

    async fn spawn_test_router(
        app: axum::Router,
    ) -> (std::net::SocketAddr, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("test loopback listener");
        let address = listener.local_addr().expect("test loopback address");
        let server = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("test Adapter server");
        });
        (address, server)
    }

    fn request_context() -> RequestContext {
        RequestContext::new(RequestId::new("request"), CorrelationId::new("correlation"))
    }

    #[test]
    fn pins_the_frozen_workload_control_interface_identity() {
        assert_eq!(WORKLOAD_CONTROL_PROTOCOL, "lenso.workload-control.v1");
        assert_eq!(
            workload_control_schema_digest(),
            "sha256:d3666bb1fd85576f9af4205dbcc70029acd81462678c47d2b315c40ef1a9161d"
        );
    }

    fn exact_topology_and_binding() -> (SystemTopology, ManagementBinding) {
        (
            SystemTopology {
                protocol: "lenso.system.v2".to_owned(),
                system_id: "support-desk".to_owned(),
                services: vec![SystemTopologyService {
                    service_id: "control-service".to_owned(),
                    service_principal: "svc.control-service".to_owned(),
                    revision: 1,
                    workloads: vec![SystemTopologyWorkload {
                        workload_id: "support-control-runtime".to_owned(),
                        role: "control_adapter".to_owned(),
                    }],
                }],
                modules: Vec::new(),
                adapters: vec![SystemTopologyAdapter {
                    adapter_id: "support-control".to_owned(),
                    capabilities: Vec::new(),
                    workload: Some(WorkloadReference {
                        system_id: "support-desk".to_owned(),
                        service_id: "control-service".to_owned(),
                        workload_id: "support-control-runtime".to_owned(),
                    }),
                    workload_control: Some(WorkloadControlAdapterInterface {
                        protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                        schema_digest: workload_control_schema_digest(),
                        status: ConnectionStatus::Connected,
                        capabilities: vec![WorkloadCapability::Suspend, WorkloadCapability::Resume],
                    }),
                }],
            },
            ManagementBinding {
                system_id: "support-desk".to_owned(),
                topology_digest: format!("sha256:{}", "a".repeat(64)),
                service_ids: vec!["control-service".to_owned()],
                adapter_ids: vec!["support-control".to_owned()],
                permissions: vec![
                    WORKLOAD_READ.to_owned(),
                    WORKLOAD_CONTROL.to_owned(),
                    WORKLOAD_OPERATION_READ.to_owned(),
                ],
                policy: ManagementPolicy {
                    policy_id: "support-console".to_owned(),
                    revision: 1,
                    digest: format!("sha256:{}", "b".repeat(64)),
                },
            },
        )
    }

    fn accepted_record(workload: WorkloadReference) -> WorkloadOperationRecord {
        WorkloadOperationRecord {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            operation_id: "operation-7".to_owned(),
            request: WorkloadOperationRequest {
                protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                workload,
                action: WorkloadControlAction::Suspend,
                observed_revision: "revision-4".to_owned(),
                idempotency_key: "control-123".to_owned(),
                actor: WorkloadActor {
                    kind: WorkloadActorKind::Operator,
                    subject: "operator-1".to_owned(),
                },
            },
            authority: WorkloadOperationAuthority {
                adapter_id: "support-control".to_owned(),
                decision: WorkloadAuthorityDecision::Accepted,
            },
            phase: WorkloadOperationPhase::Accepted,
            requested_at_unix_ms: 10,
            decided_at_unix_ms: 11,
            updated_at_unix_ms: 12,
            finished_at_unix_ms: None,
            result: None,
            failure: None,
        }
    }

    #[tokio::test]
    async fn local_http_adapter_round_trips_exact_observe_mutate_and_poll_contract() {
        let workload = WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "support-service".to_owned(),
            workload_id: "support-api".to_owned(),
        };
        let observation = WorkloadObservation {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            workload: workload.clone(),
            state: WorkloadOperationalState::Running,
            observed_revision: Some("revision-4".to_owned()),
            capabilities: BTreeSet::from([WorkloadCapability::Suspend, WorkloadCapability::Resume]),
            protection: WorkloadProtection::Controllable,
            active_operation: None,
            observed_at_unix_ms: 1_787_000_000_000,
        };
        let request = WorkloadOperationRequest {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            workload: workload.clone(),
            action: WorkloadControlAction::Suspend,
            observed_revision: "revision-4".to_owned(),
            idempotency_key: "control-123".to_owned(),
            actor: WorkloadActor {
                kind: WorkloadActorKind::Operator,
                subject: "operator-1".to_owned(),
            },
        };
        let accepted = accepted_record(workload.clone());
        let mut completed = accepted.clone();
        completed.phase = WorkloadOperationPhase::Succeeded;
        completed.updated_at_unix_ms = 13;
        completed.finished_at_unix_ms = Some(13);
        completed.result = Some(WorkloadOperationResult {
            state: WorkloadOperationalState::Suspended,
            observed_revision: "revision-5".to_owned(),
        });
        let (target, calls, server) =
            spawn_mock_adapter(observation.clone(), accepted.clone(), completed.clone()).await;
        let authority = LocalHttpWorkloadControlAdapter::from_target(target);

        assert_eq!(
            authority
                .observe(&WorkloadObservationRequest {
                    protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                    workload: workload.clone(),
                })
                .await
                .expect("live observation"),
            observation
        );
        assert_eq!(
            authority.mutate(&request).await.expect("accepted mutation"),
            accepted
        );
        assert_eq!(
            authority
                .operation("operation-7")
                .await
                .expect("polled operation"),
            completed
        );

        let calls = calls.lock().expect("captured calls").clone();
        assert_eq!(calls.len(), 3);
        assert_eq!(
            calls
                .iter()
                .map(|call| (call.method.as_str(), call.path.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("POST", WORKLOAD_CONTROL_OBSERVE_PATH),
                ("POST", WORKLOAD_CONTROL_OPERATIONS_PATH),
                ("GET", "/workload-control/v1/operations/operation-7"),
            ]
        );
        assert!(
            calls
                .iter()
                .all(|call| { call.authorization.as_deref() == Some("Bearer adapter-secret") })
        );
        assert_eq!(
            calls[0].body,
            serde_json::to_value(WorkloadObservationRequest {
                protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                workload,
            })
            .expect("observation request JSON")
        );
        assert_eq!(
            calls[1].body,
            serde_json::to_value(request).expect("mutation request JSON")
        );
        assert_eq!(calls[2].body, Value::Null);

        server.abort();
    }

    #[test]
    fn adapter_errors_are_mapped_by_typed_code_without_forwarding_untrusted_text() {
        let request = request_context();
        let rejected = AuthorityCallError::Rejected(WorkloadControlError {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            code: WorkloadControlErrorCode::ActiveMutation,
            message: "adapter-secret operator-1".to_owned(),
            operation_id: Some("operation-7".to_owned()),
            current_revision: Some("revision-4".to_owned()),
            active_operation: Some("operation-6".to_owned()),
        });
        let diagnostic = format!("{rejected:?}");
        assert!(!diagnostic.contains("adapter-secret"));
        assert!(!diagnostic.contains("operator-1"));
        let active = map_authority_call_error(rejected, AuthorityCallKind::Mutation, &request);
        assert_eq!(active.error.code, ErrorCode::Conflict);
        assert_eq!(
            active.error.public_message,
            "Another Workload mutation is already active"
        );
        assert!(!active.error.public_message.contains("adapter-secret"));
        assert!(!active.error.public_message.contains("operator-1"));

        let unauthenticated = map_authority_call_error(
            AuthorityCallError::Rejected(WorkloadControlError {
                protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                code: WorkloadControlErrorCode::Unauthenticated,
                message: "token rejected".to_owned(),
                operation_id: None,
                current_revision: None,
                active_operation: None,
            }),
            AuthorityCallKind::Mutation,
            &request,
        );
        assert_eq!(unauthenticated.error.code, ErrorCode::ExternalDependency);
        assert_eq!(
            unauthenticated.error.public_message,
            "Workload Control authority is unavailable; mutation was not queued"
        );

        let missing_operation = map_authority_call_error(
            AuthorityCallError::Rejected(WorkloadControlError {
                protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                code: WorkloadControlErrorCode::OperationNotFound,
                message: "provider detail".to_owned(),
                operation_id: Some("operation-7".to_owned()),
                current_revision: None,
                active_operation: None,
            }),
            AuthorityCallKind::Operation,
            &request,
        );
        assert_eq!(missing_operation.error.code, ErrorCode::NotFound);
        assert_eq!(
            missing_operation.error.public_message,
            "Workload operation was not found by the bound authority"
        );
    }

    #[test]
    fn operation_failure_messages_are_console_owned_before_storage_or_browser_response() {
        let mut record = accepted_record(WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "support-service".to_owned(),
            workload_id: "support-api".to_owned(),
        });
        record.phase = WorkloadOperationPhase::Failed;
        record.updated_at_unix_ms = 13;
        record.finished_at_unix_ms = Some(13);
        record.failure = Some(WorkloadControlFailure {
            code: WorkloadControlErrorCode::AuthorityUnavailable,
            message: "adapter-secret operator-1 provider detail".to_owned(),
        });
        assert!(
            validate_operation_record(
                &record,
                "support-control",
                &[WorkloadCapability::Suspend, WorkloadCapability::Resume],
                Some("operation-7"),
                None,
            )
            .is_ok()
        );

        let sanitized = sanitize_operation_record(record);
        let document = serde_json::to_string(&sanitized).expect("sanitized operation JSON");
        assert_eq!(
            sanitized.failure.expect("operation failure").message,
            "Workload Control authority became unavailable"
        );
        assert!(!document.contains("adapter-secret"));
        assert!(!document.contains("provider detail"));
    }

    #[tokio::test]
    async fn local_http_adapter_does_not_follow_redirects_with_server_credentials() {
        use axum::response::IntoResponse;
        use axum::routing::post;

        let redirected_hits = Arc::new(AtomicUsize::new(0));
        let app = axum::Router::new()
            .route(
                WORKLOAD_CONTROL_OBSERVE_PATH,
                post(|| async {
                    (
                        StatusCode::TEMPORARY_REDIRECT,
                        [(axum::http::header::LOCATION, "/credential-capture")],
                    )
                }),
            )
            .route(
                "/credential-capture",
                post(
                    |axum::extract::State(hits): axum::extract::State<Arc<AtomicUsize>>| async move {
                        hits.fetch_add(1, Ordering::SeqCst);
                        StatusCode::NO_CONTENT.into_response()
                    },
                ),
            )
            .with_state(Arc::clone(&redirected_hits));
        let (address, server) = spawn_test_router(app).await;
        let authority = LocalHttpWorkloadControlAdapter::from_target(target_for_address(address));
        let result = authority
            .observe(&WorkloadObservationRequest {
                protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                workload: WorkloadReference {
                    system_id: "support-desk".to_owned(),
                    service_id: "support-service".to_owned(),
                    workload_id: "support-api".to_owned(),
                },
            })
            .await;

        assert!(matches!(result, Err(AuthorityCallError::Incompatible)));
        assert_eq!(redirected_hits.load(Ordering::SeqCst), 0);
        server.abort();
    }

    #[tokio::test]
    async fn local_http_adapter_bypasses_proxies_and_pins_localhost_to_ipv4_loopback() {
        use axum::response::IntoResponse;

        let workload = WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "support-service".to_owned(),
            workload_id: "support-api".to_owned(),
        };
        let observation = WorkloadObservation {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            workload: workload.clone(),
            state: WorkloadOperationalState::Running,
            observed_revision: Some("revision-4".to_owned()),
            capabilities: BTreeSet::from([WorkloadCapability::Suspend, WorkloadCapability::Resume]),
            protection: WorkloadProtection::Controllable,
            active_operation: None,
            observed_at_unix_ms: 1_787_000_000_000,
        };
        let accepted = accepted_record(workload.clone());
        let (direct_target, _, direct_server) =
            spawn_mock_adapter(observation.clone(), accepted.clone(), accepted).await;
        let direct_port = direct_target
            .base_url
            .port_or_known_default()
            .expect("mock Adapter port");

        let proxy_hits = Arc::new(AtomicUsize::new(0));
        let proxy_app = axum::Router::new()
            .fallback(
                |axum::extract::State(hits): axum::extract::State<Arc<AtomicUsize>>| async move {
                    hits.fetch_add(1, Ordering::SeqCst);
                    StatusCode::BAD_GATEWAY.into_response()
                },
            )
            .with_state(Arc::clone(&proxy_hits));
        let (proxy_address, proxy_server) = spawn_test_router(proxy_app).await;

        let misleading_builder = reqwest::Client::builder()
            .proxy(reqwest::Proxy::all(format!("http://{proxy_address}")).expect("test HTTP proxy"))
            .resolve("localhost", std::net::SocketAddr::from(([192, 0, 2, 1], 0)));
        let client = configure_local_adapter_client(misleading_builder, ADAPTER_REQUEST_TIMEOUT)
            .expect("hardened local Adapter client");
        let authority = LocalHttpWorkloadControlAdapter {
            target: Some(target_for_origin(&format!(
                "http://localhost:{direct_port}"
            ))),
            client: Some(client),
            response_body_limit: ADAPTER_RESPONSE_BODY_LIMIT,
        };
        assert_eq!(
            authority
                .observe(&WorkloadObservationRequest {
                    protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                    workload,
                })
                .await
                .expect("direct localhost observation"),
            observation
        );
        assert_eq!(proxy_hits.load(Ordering::SeqCst), 0);

        proxy_server.abort();
        direct_server.abort();
    }

    #[tokio::test]
    async fn local_http_adapter_bounds_total_time_and_streamed_response_size() {
        use axum::routing::post;

        let timeout_app = axum::Router::new().route(
            WORKLOAD_CONTROL_OBSERVE_PATH,
            post(|| async {
                tokio::time::sleep(Duration::from_millis(100)).await;
                (StatusCode::OK, axum::Json(serde_json::json!({})))
            }),
        );
        let (timeout_address, timeout_server) = spawn_test_router(timeout_app).await;
        let timeout_authority = LocalHttpWorkloadControlAdapter::from_target_with_limits(
            target_for_address(timeout_address),
            Duration::from_millis(20),
            ADAPTER_RESPONSE_BODY_LIMIT,
        );
        let request = WorkloadObservationRequest {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            workload: WorkloadReference {
                system_id: "support-desk".to_owned(),
                service_id: "support-service".to_owned(),
                workload_id: "support-api".to_owned(),
            },
        };
        assert!(matches!(
            timeout_authority.observe(&request).await,
            Err(AuthorityCallError::Unavailable)
        ));
        timeout_server.abort();

        let oversized_app = axum::Router::new().route(
            WORKLOAD_CONTROL_OBSERVE_PATH,
            post(|| async { (StatusCode::OK, "x".repeat(257)) }),
        );
        let (oversized_address, oversized_server) = spawn_test_router(oversized_app).await;
        let oversized_authority = LocalHttpWorkloadControlAdapter::from_target_with_limits(
            target_for_address(oversized_address),
            ADAPTER_REQUEST_TIMEOUT,
            256,
        );
        assert!(matches!(
            oversized_authority.observe(&request).await,
            Err(AuthorityCallError::Incompatible)
        ));
        oversized_server.abort();
    }

    #[tokio::test]
    async fn local_http_adapter_accepts_only_valid_shared_error_documents() {
        use axum::routing::post;

        let typed_error = WorkloadControlError {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            code: WorkloadControlErrorCode::StaleRevision,
            message: "The observed revision is stale.".to_owned(),
            operation_id: None,
            current_revision: Some("revision-5".to_owned()),
            active_operation: None,
        };
        let response_error = typed_error.clone();
        let app = axum::Router::new().route(
            WORKLOAD_CONTROL_OPERATIONS_PATH,
            post(move || {
                let error = response_error.clone();
                async move { (StatusCode::CONFLICT, axum::Json(error)) }
            }),
        );
        let (address, server) = spawn_test_router(app).await;
        let authority = LocalHttpWorkloadControlAdapter::from_target(target_for_address(address));
        let result = authority
            .mutate(&WorkloadOperationRequest {
                protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                workload: WorkloadReference {
                    system_id: "support-desk".to_owned(),
                    service_id: "support-service".to_owned(),
                    workload_id: "support-api".to_owned(),
                },
                action: WorkloadControlAction::Suspend,
                observed_revision: "revision-4".to_owned(),
                idempotency_key: "control-123".to_owned(),
                actor: WorkloadActor {
                    kind: WorkloadActorKind::Operator,
                    subject: "operator-1".to_owned(),
                },
            })
            .await;
        assert!(matches!(
            result,
            Err(AuthorityCallError::Rejected(error)) if error == typed_error
        ));
        server.abort();

        let malformed_app = axum::Router::new().route(
            WORKLOAD_CONTROL_OPERATIONS_PATH,
            post(|| async {
                (
                    StatusCode::CONFLICT,
                    axum::Json(serde_json::json!({
                        "protocol": WORKLOAD_CONTROL_PROTOCOL,
                        "code": "stale_revision",
                        "message": "untrusted",
                        "providerDetails": "must-not-cross"
                    })),
                )
            }),
        );
        let (malformed_address, malformed_server) = spawn_test_router(malformed_app).await;
        let malformed_authority =
            LocalHttpWorkloadControlAdapter::from_target(target_for_address(malformed_address));
        let malformed = malformed_authority
            .mutate(&WorkloadOperationRequest {
                protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
                workload: WorkloadReference {
                    system_id: "support-desk".to_owned(),
                    service_id: "support-service".to_owned(),
                    workload_id: "support-api".to_owned(),
                },
                action: WorkloadControlAction::Suspend,
                observed_revision: "revision-4".to_owned(),
                idempotency_key: "control-124".to_owned(),
                actor: WorkloadActor {
                    kind: WorkloadActorKind::Operator,
                    subject: "operator-1".to_owned(),
                },
            })
            .await;
        assert!(matches!(malformed, Err(AuthorityCallError::Incompatible)));
        malformed_server.abort();
    }

    #[test]
    fn browser_mutation_contains_only_typed_control_input() {
        let extra_authority =
            serde_json::from_value::<BrowserWorkloadMutationRequest>(serde_json::json!({
                "action": { "kind": "suspend" },
                "observedRevision": "revision-4",
                "idempotencyKey": "control-123",
                "adapterId": "attacker-selected",
                "baseUrl": "https://infrastructure.example",
                "bearerToken": "secret"
            }));

        assert!(extra_authority.is_err());

        let input = BrowserWorkloadMutationRequest {
            action: WorkloadControlAction::Suspend,
            observed_revision: "revision-4".to_owned(),
            idempotency_key: "control-123".to_owned(),
        };
        let document = serde_json::to_value(input).expect("browser mutation JSON");
        assert_eq!(
            document
                .as_object()
                .expect("browser mutation object")
                .keys()
                .map(String::as_str)
                .collect::<BTreeSet<_>>(),
            BTreeSet::from(["action", "idempotencyKey", "observedRevision"])
        );

        let scale = BrowserWorkloadMutationRequest {
            action: WorkloadControlAction::Scale {
                target_capacity: NonZeroU32::new(2).expect("positive capacity"),
            },
            observed_revision: "revision-4".to_owned(),
            idempotency_key: "control-124".to_owned(),
        };
        let scale = serde_json::to_value(scale).expect("scale mutation JSON");
        assert_eq!(scale["action"]["kind"], "scale");
        assert_eq!(scale["action"]["targetCapacity"], 2);
        assert!(scale["action"].get("target_capacity").is_none());
        assert!(
            serde_json::from_value::<BrowserWorkloadMutationRequest>(serde_json::json!({
                "action": { "kind": "scale", "targetCapacity": 0 },
                "observedRevision": "revision-4",
                "idempotencyKey": "control-125"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<BrowserWorkloadMutationRequest>(serde_json::json!({
                "action": { "kind": "suspend", "targetCapacity": 2 },
                "observedRevision": "revision-4",
                "idempotencyKey": "control-126"
            }))
            .is_err()
        );
    }

    #[test]
    fn adapter_directory_accepts_only_server_owned_authenticated_origins() {
        let directory = AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"http://127.0.0.1:9470","bearerToken":"adapter-secret"},{"systemId":"billing","adapterId":"support-control","baseUrl":"http://127.0.0.1:9471","bearerToken":"billing-secret"}]"#,
        )
        .expect("loopback adapter configuration");
        let target = directory
            .resolve("support-desk", "support-control")
            .expect("configured adapter");

        assert_eq!(target.system_id, "support-desk");
        assert_eq!(target.adapter_id, "support-control");
        assert_eq!(
            target
                .url(AdapterRoute::Observe)
                .expect("allowlisted route")
                .as_str(),
            "http://127.0.0.1:9470/workload-control/v1/observe"
        );
        assert_eq!(
            target
                .url(AdapterRoute::Mutate)
                .expect("allowlisted mutation route")
                .as_str(),
            "http://127.0.0.1:9470/workload-control/v1/operations"
        );
        assert_eq!(
            target
                .url(AdapterRoute::Operation {
                    operation_id: "operation-7",
                })
                .expect("allowlisted operation route")
                .as_str(),
            "http://127.0.0.1:9470/workload-control/v1/operations/operation-7"
        );
        assert_eq!(
            directory
                .resolve("billing", "support-control")
                .expect("same Adapter identity in a different System")
                .base_url
                .as_str(),
            "http://127.0.0.1:9471/"
        );
        assert!(
            directory
                .resolve("unknown-system", "support-control")
                .is_none()
        );
        assert!(AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"http://deployment.example","bearerToken":"adapter-secret"}]"#
        )
        .is_err());
        assert!(AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"https://user:password@deployment.example","bearerToken":"adapter-secret"}]"#
        )
        .is_err());
        assert!(AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"https://deployment.example","bearerToken":"adapter-secret"}]"#
        )
        .is_err());
        assert!(AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"http://127.0.0.2:9470","bearerToken":"adapter-secret"}]"#
        )
        .is_err());
        assert!(AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"http://[::1]:9470","bearerToken":"adapter-secret"}]"#
        )
        .is_err());
        assert!(AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"http://127.0.0.1:9470/untrusted-prefix","bearerToken":"adapter-secret"}]"#
        )
        .is_err());
        assert!(AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"http://127.0.0.1:9470","bearerToken":"adapter-secret"},{"systemId":"support-desk","adapterId":"support-control","baseUrl":"http://127.0.0.1:9471","bearerToken":"other-secret"}]"#
        )
        .is_err());
    }

    #[test]
    fn adapter_observation_is_correlated_to_the_exact_workload_contract() {
        let workload = WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "support-api".to_owned(),
            workload_id: "support-api".to_owned(),
        };
        let mut observation = WorkloadObservation {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            workload: workload.clone(),
            state: WorkloadOperationalState::Running,
            observed_revision: Some("revision-7".to_owned()),
            capabilities: BTreeSet::from([WorkloadCapability::Resume, WorkloadCapability::Suspend]),
            protection: WorkloadProtection::Controllable,
            active_operation: None,
            observed_at_unix_ms: 1_787_000_000_000,
        };

        let negotiated = [WorkloadCapability::Resume, WorkloadCapability::Suspend];
        assert!(validate_observation(&observation, &workload, &negotiated).is_ok());
        observation.capabilities.insert(WorkloadCapability::Scale);
        assert!(validate_observation(&observation, &workload, &negotiated).is_err());
        observation.capabilities.remove(&WorkloadCapability::Scale);
        observation.protocol = "lenso.workload-control.v2".to_owned();
        assert!(validate_observation(&observation, &workload, &negotiated).is_err());
        observation.protocol = WORKLOAD_CONTROL_PROTOCOL.to_owned();
        observation.workload.workload_id = "different-workload".to_owned();
        assert!(validate_observation(&observation, &workload, &negotiated).is_err());
        observation.workload = workload.clone();
        observation.active_operation = Some("..".to_owned());
        assert!(validate_observation(&observation, &workload, &negotiated).is_err());
    }

    #[test]
    fn unavailable_observation_is_unknown_and_exposes_no_authority_configuration() {
        let observation = unknown_observation(
            WorkloadReference {
                system_id: "support-desk".to_owned(),
                service_id: "support-service".to_owned(),
                workload_id: "support-api".to_owned(),
            },
            BTreeSet::new(),
            WorkloadProtection::Controllable,
            1_787_000_000_000,
        );
        let document = serde_json::to_value(observation).expect("observation JSON");

        assert_eq!(document["state"], "unknown");
        assert!(document.get("observedRevision").is_none());
        assert!(document.get("activeOperation").is_none());
        for forbidden in [
            "adapterId",
            "baseUrl",
            "bearerToken",
            "podId",
            "containerId",
        ] {
            assert!(document.get(forbidden).is_none(), "unexpected {forbidden}");
        }
    }

    #[test]
    fn bound_adapter_selection_requires_one_exact_interface_identity() {
        let (mut topology, binding) = exact_topology_and_binding();
        assert_eq!(
            resolve_bound_adapter(&topology, &binding)
                .expect("exact bound adapter")
                .adapter_id,
            "support-control"
        );

        topology.adapters[0]
            .workload_control
            .as_mut()
            .expect("typed interface")
            .schema_digest = format!("sha256:{}", "c".repeat(64));
        assert!(resolve_bound_adapter(&topology, &binding).is_err());
    }

    #[test]
    fn management_binding_permissions_and_console_protection_are_fail_closed() {
        let (topology, mut binding) = exact_topology_and_binding();
        let mut adapter = resolve_bound_adapter(&topology, &binding).expect("bound adapter");
        let request = request_context();
        assert!(require_binding_permission(&binding, WORKLOAD_CONTROL, &request).is_ok());
        binding.permissions.clear();
        assert!(require_binding_permission(&binding, WORKLOAD_CONTROL, &request).is_err());
        assert!(reject_console_target(CONSOLE_SERVICE_ID, &request).is_err());
        assert!(reject_console_target("support-service", &request).is_ok());

        let explicit_adapter_workload = WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "adapter-service".to_owned(),
            workload_id: "controller".to_owned(),
        };
        adapter.workload = explicit_adapter_workload.clone();
        for workload in [
            WorkloadReference {
                system_id: "support-desk".to_owned(),
                service_id: CONSOLE_SERVICE_ID.to_owned(),
                workload_id: "console-runtime".to_owned(),
            },
            explicit_adapter_workload,
        ] {
            assert_eq!(
                workload_protection(&workload, &adapter),
                WorkloadProtection::ControlPlane
            );
            assert!(reject_bound_adapter_target(&workload, &adapter, &request).is_err());
            let unavailable = unknown_observation(
                workload,
                BTreeSet::new(),
                WorkloadProtection::ControlPlane,
                1_787_000_000_000,
            );
            assert_eq!(unavailable.state, WorkloadOperationalState::Unknown);
            assert!(unavailable.observed_revision.is_none());
            assert!(unavailable.capabilities.is_empty());
        }

        for workload in [
            WorkloadReference {
                system_id: "support-desk".to_owned(),
                service_id: "support-control".to_owned(),
                workload_id: "api".to_owned(),
            },
            WorkloadReference {
                system_id: "support-desk".to_owned(),
                service_id: "support-service".to_owned(),
                workload_id: "support-control".to_owned(),
            },
            WorkloadReference {
                system_id: "support-desk".to_owned(),
                service_id: "support-service".to_owned(),
                workload_id: CONSOLE_SERVICE_ID.to_owned(),
            },
        ] {
            assert_eq!(
                workload_protection(&workload, &adapter),
                WorkloadProtection::Controllable
            );
        }
    }

    #[test]
    fn operation_poll_correlation_resolves_the_specific_bound_service_before_authorization() {
        let (mut topology, mut binding) = exact_topology_and_binding();
        topology.services.push(SystemTopologyService {
            service_id: "support-service".to_owned(),
            service_principal: "svc.support-service".to_owned(),
            revision: 1,
            workloads: vec![SystemTopologyWorkload {
                workload_id: "support-api".to_owned(),
                role: "api".to_owned(),
            }],
        });
        binding.service_ids.push("support-service".to_owned());
        let request = request_context();
        let workload = WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "support-service".to_owned(),
            workload_id: "support-api".to_owned(),
        };
        let mut record = accepted_record(workload);
        let adapter = resolve_bound_adapter(&topology, &binding).expect("bound adapter");

        assert!(
            resolve_operation_workload(&record, &topology, &binding, &adapter, &request,).is_ok()
        );
        record.request.workload.system_id = "different-system".to_owned();
        assert!(
            resolve_operation_workload(&record, &topology, &binding, &adapter, &request,).is_err()
        );
        record.request.workload.service_id = CONSOLE_SERVICE_ID.to_owned();
        assert!(
            resolve_operation_workload(&record, &topology, &binding, &adapter, &request,).is_err()
        );
    }

    #[test]
    fn shared_error_document_has_only_the_final_optional_correlation_fields() {
        let error = WorkloadControlError {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            code: WorkloadControlErrorCode::ActiveMutation,
            message: "Another mutation is active".to_owned(),
            operation_id: Some("operation-7".to_owned()),
            current_revision: Some("revision-5".to_owned()),
            active_operation: Some("operation-6".to_owned()),
        };
        assert!(validate_error(&error).is_ok());
        let document = serde_json::to_value(error).expect("error JSON");
        assert_eq!(
            document
                .as_object()
                .expect("error object")
                .keys()
                .map(String::as_str)
                .collect::<BTreeSet<_>>(),
            BTreeSet::from([
                "activeOperation",
                "code",
                "currentRevision",
                "message",
                "operationId",
                "protocol",
            ])
        );
        assert!(document.get("retryable").is_none());
        assert!(document.get("providerDetails").is_none());

        let mut boundary = WorkloadControlError {
            protocol: WORKLOAD_CONTROL_PROTOCOL.to_owned(),
            code: WorkloadControlErrorCode::AuthorityUnavailable,
            message: "m".repeat(WORKLOAD_CONTROL_SAFE_MESSAGE_MAX_LENGTH),
            operation_id: None,
            current_revision: None,
            active_operation: None,
        };
        assert!(validate_error(&boundary).is_ok());
        boundary.message.push('m');
        assert!(validate_error(&boundary).is_err());
    }

    #[test]
    fn succeeded_operation_result_must_match_the_requested_action() {
        let mut record = accepted_record(WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "support-service".to_owned(),
            workload_id: "support-api".to_owned(),
        });
        record.phase = WorkloadOperationPhase::Succeeded;
        record.finished_at_unix_ms = Some(13);
        record.result = Some(WorkloadOperationResult {
            state: WorkloadOperationalState::Running,
            observed_revision: "revision-5".to_owned(),
        });
        assert!(
            validate_operation_record(
                &record,
                "support-control",
                &[WorkloadCapability::Suspend, WorkloadCapability::Resume],
                Some("operation-7"),
                None,
            )
            .is_err()
        );
        record.result.as_mut().expect("operation result").state =
            WorkloadOperationalState::Suspended;
        assert!(
            validate_operation_record(
                &record,
                "support-control",
                &[WorkloadCapability::Suspend, WorkloadCapability::Resume],
                Some("operation-7"),
                None,
            )
            .is_ok()
        );
        record.request.action = WorkloadControlAction::Restart;
        record.result.as_mut().expect("operation result").state = WorkloadOperationalState::Running;
        assert!(
            validate_operation_record(
                &record,
                "support-control",
                &[WorkloadCapability::Suspend, WorkloadCapability::Resume],
                Some("operation-7"),
                None,
            )
            .is_err()
        );
    }

    #[test]
    fn adapter_operation_handles_must_survive_the_console_url_transport() {
        let mut record = accepted_record(WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "support-service".to_owned(),
            workload_id: "support-api".to_owned(),
        });
        for operation_id in [".", ".."] {
            record.operation_id = operation_id.to_owned();
            assert!(
                validate_operation_record(
                    &record,
                    "support-control",
                    &[WorkloadCapability::Suspend, WorkloadCapability::Resume],
                    None,
                    None,
                )
                .is_err()
            );
        }
    }

    #[test]
    fn operation_binding_pins_authority_request_and_monotonic_progress() {
        let (topology, binding) = exact_topology_and_binding();
        let mut adapter = resolve_bound_adapter(&topology, &binding).expect("bound adapter");
        let target = AdapterDirectory::parse(
            r#"[{"systemId":"support-desk","adapterId":"support-control","baseUrl":"http://127.0.0.1:9470","bearerToken":"adapter-secret"}]"#,
        )
        .expect("adapter directory")
        .resolve("support-desk", "support-control")
        .expect("adapter target");
        let authority = LocalHttpWorkloadControlAdapter::from_target(target.clone());
        let previous = accepted_record(WorkloadReference {
            system_id: "support-desk".to_owned(),
            service_id: "support-service".to_owned(),
            workload_id: "support-api".to_owned(),
        });
        let stored = StoredOperationBinding {
            workload: previous.request.workload.clone(),
            operation_id: previous.operation_id.clone(),
            adapter_id: adapter.adapter_id.clone(),
            topology_digest: binding.topology_digest.clone(),
            adapter_target_fingerprint: target.fingerprint(),
            operation_record: previous.clone(),
        };

        assert!(validate_operation_binding(&stored, &binding, &adapter, &authority).is_ok());
        let mut changed_binding = binding.clone();
        changed_binding.topology_digest = format!("sha256:{}", "c".repeat(64));
        assert!(
            validate_operation_binding(&stored, &changed_binding, &adapter, &authority).is_err()
        );
        adapter.adapter_id = "different-adapter".to_owned();
        assert!(validate_operation_binding(&stored, &binding, &adapter, &authority).is_err());

        let mut next = previous.clone();
        next.phase = WorkloadOperationPhase::Executing;
        next.updated_at_unix_ms += 1;
        assert!(validate_operation_progress(&previous, &next).is_ok());
        next.request.idempotency_key = "changed-request".to_owned();
        assert!(validate_operation_progress(&previous, &next).is_err());
        next.request = previous.request.clone();
        next.updated_at_unix_ms = previous.updated_at_unix_ms - 1;
        assert!(validate_operation_progress(&previous, &next).is_err());

        let mut terminal = previous.clone();
        terminal.phase = WorkloadOperationPhase::Succeeded;
        terminal.updated_at_unix_ms += 1;
        terminal.finished_at_unix_ms = Some(terminal.updated_at_unix_ms);
        terminal.result = Some(WorkloadOperationResult {
            state: WorkloadOperationalState::Suspended,
            observed_revision: "revision-5".to_owned(),
        });
        let mut changed_terminal = terminal.clone();
        changed_terminal
            .result
            .as_mut()
            .expect("result")
            .observed_revision = "revision-6".to_owned();
        assert!(validate_operation_progress(&terminal, &changed_terminal).is_err());

        let mut concurrent_candidate = previous.clone();
        concurrent_candidate.phase = WorkloadOperationPhase::Executing;
        concurrent_candidate.updated_at_unix_ms += 1;
        assert_eq!(
            authoritative_record_after_cas_loss(&concurrent_candidate, terminal.clone()),
            Ok(terminal.clone())
        );
        assert!(authoritative_record_after_cas_loss(&terminal, concurrent_candidate).is_err());

        let mut progressed_binding = stored.clone();
        progressed_binding.operation_record = terminal;
        assert_eq!(
            terminal_operation_record(
                &stored,
                &stored.workload,
                &[WorkloadCapability::Suspend, WorkloadCapability::Resume],
            ),
            Ok(None)
        );
        assert_eq!(
            terminal_operation_record(
                &progressed_binding,
                &progressed_binding.workload,
                &[WorkloadCapability::Suspend, WorkloadCapability::Resume],
            ),
            Ok(Some(progressed_binding.operation_record.clone()))
        );
        assert_eq!(
            reconcile_operation_binding(&stored, &progressed_binding),
            Ok(OperationBindingReconciliation::StoreCandidate)
        );
        assert_eq!(
            reconcile_operation_binding(&progressed_binding, &stored),
            Ok(OperationBindingReconciliation::KeepStored)
        );
        let mut conflicting_retry = progressed_binding.clone();
        conflicting_retry.operation_record.request.idempotency_key = "different-key".to_owned();
        assert!(reconcile_operation_binding(&progressed_binding, &conflicting_retry).is_err());
        let mut reused_for_another_workload = progressed_binding.clone();
        reused_for_another_workload.workload.workload_id = "different-workload".to_owned();
        assert!(
            reconcile_operation_binding(&progressed_binding, &reused_for_another_workload).is_err()
        );
    }
}
