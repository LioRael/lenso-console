//! Contract-driven adapter from Console Surface operations to Module Business APIs.

use std::time::{Instant, SystemTime, UNIX_EPOCH};

use axum::http::Method;
use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, OpenApiRouter, Path, RequestContext, State, UserActor, json, routes,
};
use lenso::host::prelude::*;
use lenso::system_plane::{CoreDocument, ManagedServiceContext, validate_core_document};
use platform_core::{CorrelationId, ProviderHttpCallRecord, insert_provider_http_call};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Postgres, Row};
use utoipa::ToSchema;

use crate::composition::CONSOLE_SERVICE_ID;
use crate::modules::console_access;
use crate::modules::surface_contract::{
    ContractOperation, TargetCall, build_target_call, resolve_operation, validate_output,
};
use crate::modules::system_registry::connection::{
    self, ManagementBinding, ModuleRuntimeStatus, SurfaceApiGrant, SystemConnectRequest,
    SystemTopology, SystemTopologyModule,
};

pub const MODULE_NAME: &str = "lenso/console-surface-gateway";
pub const SURFACE_GATEWAY_READ: &str = "console.module.business.read";
pub const SURFACE_GATEWAY_WRITE: &str = "console.module.business.write";
pub const SURFACE_GATEWAY_PROTOCOL: &str = "lenso.console-surface-gateway.v1";

const SYSTEM_CONNECTION_SQL: &str = "select system_id, topology_digest, topology, \
    management_binding from console.system_connections \
    where system_id = $1 limit 1";
const SERVICE_SQL: &str = "select service_id, service_principal, base_url, \
    enrollment_receipt_digest, enrollment_expires_at_unix_ms, enrollment_state, \
    connection_state, core_document from console.managed_services \
    where service_id = $1 and service_id <> 'lenso-console'";

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SurfaceStoryContext {
    #[serde(rename = "storyId")]
    pub story: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(rename = "segmentId")]
    pub segment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(rename = "correlationId")]
    pub correlation: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SurfaceOperationRequestContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<String>,
    pub deadline_unix_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub story: Option<SurfaceStoryContext>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SurfaceOperationRequest {
    pub protocol: String,
    pub module_id: String,
    pub module_release_digest: String,
    pub ui_artifact_digest: String,
    pub contract_digest: String,
    pub operation_id: String,
    pub input: Value,
    pub context: ManagedServiceContext,
    pub request_context: SurfaceOperationRequestContext,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceOperationResponse {
    pub protocol: &'static str,
    pub module_id: String,
    pub contract_digest: String,
    pub operation_id: String,
    pub output: Value,
    pub request_context: SurfaceOperationRequestContext,
}

#[derive(Debug, Clone)]
struct ManagedServiceTarget {
    service_id: String,
    service_principal: String,
    base_url: String,
    enrollment_receipt_digest: String,
}

#[derive(Debug)]
struct TargetResponse {
    output: Value,
    status: u16,
}

#[derive(Debug)]
struct TargetFailure {
    error: ApiErrorResponse,
    provider_status: Option<u16>,
}

impl TargetFailure {
    fn before_response(error: ApiErrorResponse) -> Self {
        Self {
            error,
            provider_status: None,
        }
    }

    fn after_response(error: ApiErrorResponse, provider_status: u16) -> Self {
        Self {
            error,
            provider_status: Some(provider_status),
        }
    }
}

pub fn linked_module() -> HostLinkedModule {
    HostLinkedModule::manifest_only(MODULE_NAME, manifest, &[]).with_http_binding(http_binding)
}

pub fn http_routes() -> Vec<ModuleHttpRoute> {
    vec![ModuleHttpRoute {
        method: ModuleHttpMethod::Post,
        path: "/api/console/v1/services/{serviceId}/surface-gateway".to_owned(),
        capability: None,
        display_name: Some("Invoke Module Business API Surface Operation".to_owned()),
        story_title: Some("Module Business API operation invoked".to_owned()),
        operation: None,
    }]
}

fn manifest() -> ModuleManifest {
    ModuleManifest::builder(MODULE_NAME)
        .dependencies(vec![
            crate::modules::console_access::MODULE_NAME.to_owned(),
            crate::modules::system_registry::MODULE_NAME.to_owned(),
        ])
        .capabilities(vec![
            SURFACE_GATEWAY_READ.to_owned(),
            SURFACE_GATEWAY_WRITE.to_owned(),
        ])
        .http_routes(http_routes())
        .build()
}

pub fn merge_http(base: ApiOpenApiRouter) -> ApiOpenApiRouter {
    base.merge(router())
}

fn http_binding() -> LinkedBinding {
    LinkedBinding::builder()
        .http(LinkedHttpContribution {
            public_prefixes: &["/api/console/v1/"],
            merge: merge_http,
        })
        .build()
}

fn router() -> ApiOpenApiRouter {
    OpenApiRouter::new().routes(routes!(surface_gateway))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/services/{serviceId}/surface-gateway",
    operation_id = "console_invoke_surface_gateway_operation",
    tag = "console-surface-gateway",
    params(("serviceId" = String, Path, description = "Managed Service identity")),
    request_body = SurfaceOperationRequest,
    responses(
        (status = 200, body = SurfaceOperationResponse, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 409, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
#[allow(clippy::too_many_lines)]
async fn surface_gateway(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(service_id): Path<String>,
    Json(request): Json<SurfaceOperationRequest>,
) -> Result<Json<SurfaceOperationResponse>, ApiErrorResponse> {
    validate_request_shape(&request, &service_id, &request_ctx)?;

    let (topology, binding) =
        load_system_connection(&ctx, &request.context.system_id, &request_ctx).await?;
    if topology.system_id != request.context.system_id {
        return Err(forbidden_error(
            "Managed Service Context does not belong to the connected System",
            &request_ctx,
        ));
    }
    let module = topology
        .modules
        .iter()
        .find(|module| module.module_id == request.module_id)
        .cloned()
        .ok_or_else(|| {
            forbidden_error(
                "Surface Module is not part of the connected System topology",
                &request_ctx,
            )
        })?;
    let grant = authorize_surface_identity(&module, &request, &request_ctx)?;
    let contract_artifact = grant.contract_artifact.as_ref().ok_or_else(|| {
        external_error(
            "Surface API contract artifact is unavailable for the connected Module release",
            &request_ctx,
        )
    })?;
    let operation = resolve_operation(
        contract_artifact,
        &request.contract_digest,
        &request.operation_id,
    )
    .map_err(|message| external_error(&message, &request_ctx))?;
    authorize_surface_operation(&binding, &request, &operation, &request_ctx)?;

    let target = load_target(&ctx, &request_ctx, &service_id).await?;
    crate::modules::system_registry::validate_surface_authority(&ctx, &service_id, &request_ctx)
        .await?;
    validate_target_context(&target, &module, &request, &actor, &request_ctx)?;
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        Some(&service_id),
        &operation_console_capability(&operation),
        &request_ctx,
    )
    .await?;
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        Some(&service_id),
        &operation.capability,
        &request_ctx,
    )
    .await?;

    let call = build_target_call(&operation, &request.input)
        .map_err(|message| validation_error(message, &request_ctx))?;
    let started_at = Instant::now();
    let forwarded = forward_target(&target, &call, &operation, &request, &request_ctx).await;
    let provider_status = match &forwarded {
        Ok(response) => Some(response.status),
        Err(failure) => failure.provider_status,
    };
    let output = forwarded
        .map_err(|failure| failure.error)
        .and_then(|response| {
            validate_output(&operation, response.status, &response.output)
                .map_err(|message| external_error(&message, &request_ctx))?;
            Ok(response.output)
        });
    record_surface_provider_call(
        &ctx,
        &operation,
        &call,
        &request,
        &request_ctx,
        started_at,
        provider_status,
        output.as_ref().err(),
    )
    .await;
    let output = output?;

    Ok(json(SurfaceOperationResponse {
        protocol: SURFACE_GATEWAY_PROTOCOL,
        module_id: request.module_id,
        contract_digest: request.contract_digest,
        operation_id: request.operation_id,
        output,
        request_context: request.request_context,
    }))
}

fn validate_request_shape(
    request: &SurfaceOperationRequest,
    service_id: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if request.protocol != SURFACE_GATEWAY_PROTOCOL {
        return Err(validation_error(
            "Surface Gateway protocol is unsupported",
            request_ctx,
        ));
    }
    if !valid_digest(&request.contract_digest)
        || !valid_digest(&request.module_release_digest)
        || !valid_digest(&request.ui_artifact_digest)
    {
        return Err(forbidden_error(
            "Surface request is not bound to valid release artifacts",
            request_ctx,
        ));
    }
    if request.module_id.trim().is_empty() || request.operation_id.trim().is_empty() {
        return Err(validation_error(
            "Surface request module and operation identity are required",
            request_ctx,
        ));
    }
    if request.context.service_id != service_id
        || request.context.caller_module_id != request.module_id
        || request.context.system_id.trim().is_empty()
        || request.context.environment_id.trim().is_empty()
        || !valid_digest(&request.context.delegated_authority_digest)
        || request
            .context
            .capabilities
            .iter()
            .any(|capability| capability.trim().is_empty())
    {
        return Err(forbidden_error(
            "Surface Managed Service Context is invalid for this request",
            request_ctx,
        ));
    }
    if request.request_context.deadline_unix_ms <= now_ms(request_ctx)? {
        return Err(AppError::new(
            ErrorCode::Validation,
            "Surface operation deadline has expired",
        )
        .into_api(request_ctx));
    }
    if request
        .request_context
        .tenant_id
        .as_deref()
        .is_some_and(str::is_empty)
    {
        return Err(validation_error(
            "Surface operation tenant id must be non-empty",
            request_ctx,
        ));
    }
    validate_story_context(request.request_context.story.as_ref(), request_ctx)
}

fn validate_story_context(
    story: Option<&SurfaceStoryContext>,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    let Some(story) = story else {
        return Ok(());
    };
    if story.story.trim().is_empty() {
        return Err(validation_error(
            "Surface operation Story id must be non-empty",
            request_ctx,
        ));
    }
    if story
        .segment
        .as_deref()
        .is_some_and(|segment| segment.trim().is_empty())
    {
        return Err(validation_error(
            "Surface operation Story segment id must be non-empty",
            request_ctx,
        ));
    }
    if story
        .correlation
        .as_deref()
        .is_some_and(|correlation| correlation.trim().is_empty())
    {
        return Err(validation_error(
            "Surface operation Story correlation id must be non-empty",
            request_ctx,
        ));
    }
    Ok(())
}

fn authorize_surface_identity<'a>(
    module: &'a SystemTopologyModule,
    request: &SurfaceOperationRequest,
    request_ctx: &RequestContext,
) -> Result<&'a SurfaceApiGrant, ApiErrorResponse> {
    if module.module_release_digest != request.module_release_digest
        || module.console_ui_artifact_digest.as_deref() != Some(request.ui_artifact_digest.as_str())
    {
        return Err(forbidden_error(
            "Surface request is not bound to the connected Module release",
            request_ctx,
        ));
    }
    if matches!(
        module.runtime_status,
        Some(
            ModuleRuntimeStatus::Unavailable
                | ModuleRuntimeStatus::Incompatible
                | ModuleRuntimeStatus::Unmanaged
        )
    ) {
        return Err(external_error(
            "Connected Module workload is not available",
            request_ctx,
        ));
    }
    let grant = module
        .surface_api_grant
        .as_ref()
        .ok_or_else(|| forbidden_error("Surface artifact has no Surface API Grant", request_ctx))?;
    if grant.artifact_digest != request.ui_artifact_digest
        || grant.module_release_digest != request.module_release_digest
        || grant.contract_digest != request.contract_digest
        || !grant
            .operation_ids
            .iter()
            .any(|operation_id| operation_id == &request.operation_id)
    {
        return Err(forbidden_error(
            "Surface API Grant does not allow this contract operation",
            request_ctx,
        ));
    }
    Ok(grant)
}

fn authorize_surface_operation(
    binding: &ManagementBinding,
    request: &SurfaceOperationRequest,
    operation: &ContractOperation,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    let console_capability = operation_console_capability(operation);
    if !binding
        .permissions
        .iter()
        .any(|permission| permission == &console_capability)
    {
        return Err(forbidden_error(
            "System Management Binding does not grant this Surface operation",
            request_ctx,
        ));
    }
    if operation.idempotency == "requires_key"
        && request
            .request_context
            .idempotency_key
            .as_deref()
            .is_none_or(str::is_empty)
    {
        return Err(validation_error(
            "This Surface operation requires an idempotency key",
            request_ctx,
        ));
    }
    Ok(())
}

fn operation_console_capability(operation: &ContractOperation) -> String {
    if operation.surface_method == Method::GET {
        SURFACE_GATEWAY_READ.to_owned()
    } else {
        SURFACE_GATEWAY_WRITE.to_owned()
    }
}

fn validate_target_context(
    target: &ManagedServiceTarget,
    module: &SystemTopologyModule,
    request: &SurfaceOperationRequest,
    actor: &UserActor,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if module
        .service_id
        .as_deref()
        .is_some_and(|id| id != target.service_id)
        || request.context.target_service_principal != target.service_principal
        || request.context.delegated_authority_digest != target.enrollment_receipt_digest
        || request.context.delegated_actor_subject != actor.user_id
    {
        return Err(forbidden_error(
            "Surface Managed Service Context does not match the connected target",
            request_ctx,
        ));
    }
    Ok(())
}

async fn load_system_connection(
    ctx: &AppContext,
    system_id: &str,
    request_ctx: &RequestContext,
) -> Result<(SystemTopology, ManagementBinding), ApiErrorResponse> {
    let row = sqlx::query(SYSTEM_CONNECTION_SQL)
        .bind(system_id)
        .fetch_optional(&ctx.db)
        .await
        .map_err(|error| {
            internal_source_error("System Connection lookup failed", error, request_ctx)
        })?
        .ok_or_else(|| not_found_error("System Connection was not found", request_ctx))?;
    let system_id: String = value(&row, "system_id", request_ctx)?;
    let topology_digest: String = value(&row, "topology_digest", request_ctx)?;
    let topology_value: Value = value(&row, "topology", request_ctx)?;
    let binding_value: Value = value(&row, "management_binding", request_ctx)?;
    let topology: SystemTopology = serde_json::from_value(topology_value).map_err(|error| {
        internal_source_error("Stored System topology is invalid", error, request_ctx)
    })?;
    let management_binding: ManagementBinding =
        serde_json::from_value(binding_value).map_err(|error| {
            internal_source_error("Stored Management Binding is invalid", error, request_ctx)
        })?;
    let validation_request = SystemConnectRequest {
        system_id,
        topology_digest,
        topology: topology.clone(),
        management_binding: management_binding.clone(),
    };
    if let Err(errors) = connection::validate_connect_request(&validation_request) {
        return Err(internal_error(
            format!("Stored System Connection is invalid: {}", errors.join("; ")),
            request_ctx,
        ));
    }
    Ok((topology, management_binding))
}

async fn load_target(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    service_id: &str,
) -> Result<ManagedServiceTarget, ApiErrorResponse> {
    if service_id == CONSOLE_SERVICE_ID {
        return Err(not_found_error(
            "Managed Service was not found",
            request_ctx,
        ));
    }
    let row = sqlx::query(SERVICE_SQL)
        .bind(service_id)
        .fetch_optional(&ctx.db)
        .await
        .map_err(|error| {
            internal_source_error("Managed Service lookup failed", error, request_ctx)
        })?
        .ok_or_else(|| not_found_error("Managed Service was not found", request_ctx))?;
    let service_id: String = value(&row, "service_id", request_ctx)?;
    let service_principal: String = value(&row, "service_principal", request_ctx)?;
    let base_url: String = value(&row, "base_url", request_ctx)?;
    let enrollment_receipt_digest: String = value(&row, "enrollment_receipt_digest", request_ctx)?;
    let enrollment_expires_at_unix_ms: i64 =
        value(&row, "enrollment_expires_at_unix_ms", request_ctx)?;
    let enrollment_state: String = value(&row, "enrollment_state", request_ctx)?;
    let connection_state: String = value(&row, "connection_state", request_ctx)?;
    let core_document: Option<Value> = value(&row, "core_document", request_ctx)?;
    if enrollment_state != "active" || connection_state != "ready" {
        return Err(external_error(
            "Managed Service is not ready for Surface operations",
            request_ctx,
        ));
    }
    if u64::try_from(enrollment_expires_at_unix_ms)
        .ok()
        .is_none_or(|expiry| expiry <= now_ms_value())
    {
        return Err(external_error(
            "Managed Service enrollment has expired",
            request_ctx,
        ));
    }
    let core_document = core_document.ok_or_else(|| {
        external_error(
            "Managed Service has not published a Core document",
            request_ctx,
        )
    })?;
    let core_document: CoreDocument = serde_json::from_value(core_document).map_err(|error| {
        internal_source_error(
            "Managed Service Core document is invalid",
            error,
            request_ctx,
        )
    })?;
    if !validate_core_document(&core_document).is_empty()
        || core_document.service_id != service_id
        || core_document.service_principal != service_principal
        || !valid_digest(&enrollment_receipt_digest)
        || base_url.trim().is_empty()
    {
        return Err(external_error(
            "Managed Service enrollment binding is invalid",
            request_ctx,
        ));
    }
    Ok(ManagedServiceTarget {
        service_id,
        service_principal,
        base_url,
        enrollment_receipt_digest,
    })
}

#[allow(clippy::too_many_lines)]
async fn forward_target(
    target: &ManagedServiceTarget,
    call: &TargetCall,
    operation: &ContractOperation,
    request: &SurfaceOperationRequest,
    request_ctx: &RequestContext,
) -> Result<TargetResponse, TargetFailure> {
    let url = target_url(&target.base_url, &call.path)
        .map_err(|message| TargetFailure::before_response(external_error(&message, request_ctx)))?;
    let remaining_ms = request
        .request_context
        .deadline_unix_ms
        .saturating_sub(now_ms_value());
    if remaining_ms == 0 {
        return Err(TargetFailure::before_response(external_error(
            "Surface operation deadline expired",
            request_ctx,
        )));
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| {
            TargetFailure::before_response(internal_source_error(
                "Surface Gateway client is unavailable",
                error,
                request_ctx,
            ))
        })?;
    let mut builder = client
        .request(call.method.clone(), url)
        .timeout(std::time::Duration::from_millis(remaining_ms))
        .header("accept", "application/json")
        .header(
            "x-lenso-console-delegated-actor",
            &request.context.delegated_actor_subject,
        )
        .header(
            "x-lenso-console-delegated-authority",
            &request.context.delegated_authority_digest,
        )
        .header("x-lenso-console-service-id", &target.service_id)
        .header("x-lenso-console-contract-digest", &request.contract_digest)
        .header("x-lenso-console-operation-id", &request.operation_id)
        .header("x-lenso-console-capability", &operation.capability)
        .header(
            "x-lenso-deadline-unix-ms",
            request.request_context.deadline_unix_ms,
        );
    if !call.query.is_empty() {
        builder = builder.query(&call.query);
    }
    if let Some(tenant_id) = request.request_context.tenant_id.as_deref() {
        builder = builder.header("x-lenso-console-tenant-id", tenant_id);
    }
    if let Some(idempotency_key) = request.request_context.idempotency_key.as_deref() {
        builder = builder.header("idempotency-key", idempotency_key);
    }
    if let Some(story) = request.request_context.story.as_ref() {
        let story = serde_json::to_string(story).map_err(|error| {
            TargetFailure::before_response(internal_source_error(
                "Surface Story context could not be encoded",
                error,
                request_ctx,
            ))
        })?;
        builder = builder.header("x-lenso-console-story-context", story);
    }
    if let Some(body) = call.body.as_ref() {
        builder = builder.json(body);
    }
    let response = builder.send().await.map_err(|error| {
        TargetFailure::before_response(external_source_error(
            "Managed Service Surface operation failed",
            error,
            request_ctx,
        ))
    })?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        TargetFailure::after_response(
            external_source_error(
                "Managed Service Surface response could not be read",
                error,
                request_ctx,
            ),
            status.as_u16(),
        )
    })?;
    if !status.is_success() {
        let error = match status.as_u16() {
            401 | 403 => {
                forbidden_error("Connected Module denied the Surface operation", request_ctx)
            }
            404 => not_found_error("Connected Module resource was not found", request_ctx),
            409 => conflict_error(
                "Connected Module rejected a stale Surface update",
                request_ctx,
            ),
            _ => external_error(
                "Connected Module rejected the Surface operation",
                request_ctx,
            ),
        };
        return Err(TargetFailure::after_response(error, status.as_u16()));
    }
    let output = serde_json::from_str(&body).map_err(|error| {
        TargetFailure::after_response(
            external_source_error(
                "Connected Module returned an invalid Business API response",
                error,
                request_ctx,
            ),
            status.as_u16(),
        )
    })?;
    Ok(TargetResponse {
        output,
        status: status.as_u16(),
    })
}

#[allow(clippy::too_many_arguments)]
async fn record_surface_provider_call(
    ctx: &AppContext,
    operation: &ContractOperation,
    call: &TargetCall,
    request: &SurfaceOperationRequest,
    request_ctx: &RequestContext,
    started_at: Instant,
    provider_status: Option<u16>,
    error: Option<&ApiErrorResponse>,
) {
    let story_context =
        surface_provider_request_context(request_ctx, request.request_context.story.as_ref());
    let record = ProviderHttpCallRecord {
        module_name: request.module_id.clone(),
        method: operation.target_method.as_str().to_owned(),
        declared_path: operation.target_path.clone(),
        provider_path: call.path.clone(),
        capability: Some(operation.capability.clone()),
        display_name: operation.display_name.clone(),
        story_title: request
            .request_context
            .story
            .as_ref()
            .map(|story| story.story.clone()),
        provider_status,
        duration_ms: i64::try_from(started_at.elapsed().as_millis()).unwrap_or(i64::MAX),
        success: error.is_none(),
        error_code: error.map(|error| error.error.code.as_str().to_owned()),
        retryable: error.is_some_and(|error| error.error.retryable),
        path_params: call.path_params.clone(),
        error_details: Value::Array(Vec::new()),
    };
    if let Err(error) =
        insert_provider_http_call(&ctx.db, ctx.ids.as_ref(), &story_context, record).await
    {
        tracing::warn!(
            error = ?error,
            module_name = %request.module_id,
            operation_id = %request.operation_id,
            request_id = %story_context.request_id.0,
            correlation_id = %story_context.correlation_id.0,
            "failed to persist Surface Gateway provider call"
        );
    }
}

fn surface_provider_request_context(
    request_ctx: &RequestContext,
    story: Option<&SurfaceStoryContext>,
) -> RequestContext {
    let mut context = request_ctx.clone();
    if let Some(story) = story {
        context.correlation_id = CorrelationId::new(
            story
                .correlation
                .clone()
                .unwrap_or_else(|| story.story.clone()),
        );
        context.causation_id = None;
    }
    context
}

fn target_url(base_url: &str, path: &str) -> Result<String, String> {
    if !path.starts_with('/')
        || path.contains('\\')
        || path.contains('?')
        || path.contains('#')
        || path.split('/').any(|segment| segment == "..")
    {
        return Err("Connected Module route is outside the committed contract".to_owned());
    }
    let mut url = reqwest::Url::parse(base_url).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Managed Service base URL must be an HTTP(S) origin without query or fragment"
                .to_owned(),
        );
    }
    if url.scheme() == "http"
        && !url.host_str().is_some_and(|host| {
            host == "localhost"
                || host
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        })
    {
        return Err("Managed Service HTTP is allowed only for loopback targets".to_owned());
    }
    let base_path = url.path().trim_end_matches('/');
    url.set_path(&format!("{base_path}{path}"));
    Ok(url.to_string())
}

fn valid_digest(value: &str) -> bool {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64 && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn now_ms_value() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

fn now_ms(request_ctx: &RequestContext) -> Result<u64, ApiErrorResponse> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            internal_source_error("Surface Gateway clock is unavailable", error, request_ctx)
        })?;
    u64::try_from(now.as_millis()).map_err(|error| {
        internal_source_error("Surface Gateway clock value is invalid", error, request_ctx)
    })
}

fn value<T>(
    row: &sqlx::postgres::PgRow,
    column: &str,
    request_ctx: &RequestContext,
) -> Result<T, ApiErrorResponse>
where
    for<'a> T: sqlx::Decode<'a, Postgres> + sqlx::Type<Postgres>,
{
    row.try_get(column).map_err(|error| {
        internal_source_error(
            "Surface Gateway database row is invalid",
            error,
            request_ctx,
        )
    })
}

fn validation_error(message: impl Into<String>, request_ctx: &RequestContext) -> ApiErrorResponse {
    AppError::new(ErrorCode::Validation, message.into()).into_api(request_ctx)
}

fn forbidden_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    AppError::new(ErrorCode::Forbidden, message).into_api(request_ctx)
}

fn not_found_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    AppError::new(ErrorCode::NotFound, message).into_api(request_ctx)
}

fn conflict_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    AppError::new(ErrorCode::Conflict, message).into_api(request_ctx)
}

fn external_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    AppError::new(ErrorCode::ExternalDependency, message)
        .retryable()
        .into_api(request_ctx)
}

fn external_source_error(
    message: &str,
    source: impl std::error::Error + Send + Sync + 'static,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    AppError::new(ErrorCode::ExternalDependency, message)
        .retryable()
        .with_source(source)
        .into_api(request_ctx)
}

fn internal_error(message: impl Into<String>, request_ctx: &RequestContext) -> ApiErrorResponse {
    AppError::new(ErrorCode::Internal, message.into()).into_api(request_ctx)
}

fn internal_source_error(
    message: &str,
    source: impl std::error::Error + Send + Sync + 'static,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    AppError::new(ErrorCode::Internal, message)
        .with_source(source)
        .into_api(request_ctx)
}

trait IntoApiError {
    fn into_api(self, request_ctx: &RequestContext) -> ApiErrorResponse;
}

impl IntoApiError for AppError {
    fn into_api(self, request_ctx: &RequestContext) -> ApiErrorResponse {
        ApiErrorResponse::with_context(self, request_ctx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use platform_core::RequestId;
    use serde_json::json;

    fn request_context() -> RequestContext {
        RequestContext::new(
            RequestId::new("surface-request"),
            CorrelationId::new("surface-correlation"),
        )
    }

    #[test]
    fn omits_absent_optional_fields_from_the_surface_response_wire_contract() {
        let response = SurfaceOperationResponse {
            protocol: SURFACE_GATEWAY_PROTOCOL,
            module_id: "example/widgets".to_owned(),
            contract_digest: format!("sha256:{}", "a".repeat(64)),
            operation_id: "example/http/GET:/widgets".to_owned(),
            output: json!({ "records": [] }),
            request_context: SurfaceOperationRequestContext {
                tenant_id: None,
                deadline_unix_ms: 1,
                idempotency_key: None,
                story: None,
            },
        };
        let value = serde_json::to_value(response).expect("response JSON");
        let context = value["requestContext"]
            .as_object()
            .expect("request context");
        assert!(!context.contains_key("tenantId"));
        assert!(!context.contains_key("idempotencyKey"));
        assert!(!context.contains_key("story"));
    }

    #[test]
    fn surface_story_context_owns_the_recorded_provider_correlation() {
        let request_ctx = request_context();
        let story = SurfaceStoryContext {
            story: "widget.created".to_owned(),
            segment: Some("segment-1".to_owned()),
            correlation: Some("correlation-1".to_owned()),
        };
        let provider_ctx = surface_provider_request_context(&request_ctx, Some(&story));
        assert_eq!(provider_ctx.correlation_id.0, "correlation-1");
        assert!(provider_ctx.causation_id.is_none());
    }

    #[test]
    fn rejects_unsafe_or_non_loopback_targets() {
        assert!(target_url("http://127.0.0.1:4110", "/../admin").is_err());
        assert!(target_url("http://example.com", "/modules/example/widgets").is_err());
        assert_eq!(
            target_url("http://127.0.0.1:4110", "/modules/example/widgets/widget_1")
                .expect("target URL"),
            "http://127.0.0.1:4110/modules/example/widgets/widget_1"
        );
    }

    #[test]
    fn declares_the_same_origin_surface_gateway_route_without_a_generic_data_surface() {
        let manifest = manifest();
        assert_eq!(manifest.module_id, MODULE_NAME);
        assert_eq!(manifest.http_routes, http_routes());
        assert!(manifest.admin.is_none());
        assert_eq!(manifest.capabilities.len(), 2);
    }

    #[test]
    fn authorizes_a_linked_surface_bound_to_its_managed_owner_service() {
        let artifact_digest = format!("sha256:{}", "a".repeat(64));
        let release_digest = format!("sha256:{}", "b".repeat(64));
        let contract_digest = format!("sha256:{}", "c".repeat(64));
        let operation_id = "auth/http/GET:/users".to_owned();
        let module = SystemTopologyModule {
            module_id: "lenso/auth".to_owned(),
            delivery: connection::ModuleDelivery::Linked,
            service_id: Some("taste-host".to_owned()),
            module_release_digest: release_digest.clone(),
            console_ui_artifact_digest: Some(artifact_digest.clone()),
            surface_api_grant: Some(SurfaceApiGrant {
                artifact_digest: artifact_digest.clone(),
                module_release_digest: release_digest.clone(),
                contract_digest: contract_digest.clone(),
                operation_ids: vec![operation_id.clone()],
                contract_artifact: None,
            }),
            runtime_status: Some(ModuleRuntimeStatus::Active),
        };
        let request = SurfaceOperationRequest {
            protocol: SURFACE_GATEWAY_PROTOCOL.to_owned(),
            module_id: module.module_id.clone(),
            module_release_digest: release_digest,
            ui_artifact_digest: artifact_digest,
            contract_digest,
            operation_id,
            input: json!({}),
            context: ManagedServiceContext::new(
                "taste-system",
                "taste-host",
                "local",
                "spiffe://taste/host",
                "lenso/auth",
                "operator-1",
                format!("sha256:{}", "d".repeat(64)),
                [SURFACE_GATEWAY_READ],
            ),
            request_context: SurfaceOperationRequestContext {
                tenant_id: None,
                deadline_unix_ms: u64::MAX,
                idempotency_key: None,
                story: None,
            },
        };

        let grant = authorize_surface_identity(&module, &request, &request_context())
            .expect("linked owner-bound Surface grant");
        assert_eq!(grant.contract_digest, request.contract_digest);
    }
}
