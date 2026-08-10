use axum::http::Method;
use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, OpenApiRouter, Path, RequestContext, State, UserActor, json, routes,
};
use lenso::host::prelude::*;
use lenso::system_plane::{CoreDocument, ManagedServiceContext, validate_core_document};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row};
use std::time::{SystemTime, UNIX_EPOCH};
use utoipa::ToSchema;

use crate::composition::CONSOLE_SERVICE_ID;
use crate::modules::console_access;
use crate::modules::system_registry::connection::{
    self, ManagementBinding, ModuleDelivery, ModuleRuntimeStatus, SystemConnectRequest,
    SystemTopology, SystemTopologyModule,
};

pub const MODULE_NAME: &str = "lenso/console-surface-gateway";
pub const SURFACE_GATEWAY_READ: &str = "console.module.business.read";
pub const SURFACE_GATEWAY_WRITE: &str = "console.module.business.write";
pub const SURFACE_GATEWAY_PROTOCOL: &str = "lenso.console-surface-gateway.v1";

const SUPPORT_TICKET_CONTRACT: &str = include_str!(
    "../../../packages/support-ticket-console/src/support-ticket-business-api.v1.json"
);
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
    #[serde(default)]
    #[serde(rename = "segmentId")]
    pub segment: Option<String>,
    #[serde(default)]
    #[serde(rename = "correlationId")]
    pub correlation: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SurfaceOperationRequestContext {
    #[serde(default)]
    pub tenant_id: Option<String>,
    pub deadline_unix_ms: u64,
    #[serde(default)]
    pub idempotency_key: Option<String>,
    #[serde(default)]
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
struct ContractOperation {
    operation_id: String,
    method: Method,
    target_path: String,
    capability: String,
    idempotency: String,
}

#[derive(Debug, Clone)]
struct ManagedServiceTarget {
    service_id: String,
    service_principal: String,
    base_url: String,
    enrollment_receipt_digest: String,
}

#[derive(Debug, Clone)]
struct TargetCall {
    method: Method,
    path: String,
    query: Vec<(String, String)>,
    body: Option<Value>,
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
    let operation = resolve_operation(&request.operation_id)
        .map_err(|message| validation_error(message, &request_ctx))?;
    let contract_digest = support_ticket_contract_digest();
    validate_request_shape(
        &request,
        &service_id,
        &operation,
        &contract_digest,
        &request_ctx,
    )?;

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
    authorize_surface_grant(&module, &binding, &request, &operation, &request_ctx)?;

    let target = load_target(&ctx, &request_ctx, &service_id).await?;
    validate_target_context(&target, &module, &request, &actor, &request_ctx)?;
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        Some(&service_id),
        &operation_console_capability(&operation),
        &request_ctx,
    )
    .await?;

    let call = build_target_call(&operation, &request.input, &request_ctx)?;
    let output = forward_target(&target, &call, &request, &request_ctx).await?;
    let output = normalize_output(&operation, &request.input, output, &request_ctx)?;

    Ok(json(SurfaceOperationResponse {
        protocol: SURFACE_GATEWAY_PROTOCOL,
        module_id: request.module_id,
        contract_digest,
        operation_id: request.operation_id,
        output,
        request_context: request.request_context,
    }))
}

fn validate_request_shape(
    request: &SurfaceOperationRequest,
    service_id: &str,
    operation: &ContractOperation,
    contract_digest: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if request.protocol != SURFACE_GATEWAY_PROTOCOL {
        return Err(validation_error(
            "Surface Gateway protocol is unsupported",
            request_ctx,
        ));
    }
    if request.contract_digest != contract_digest
        || !valid_digest(&request.module_release_digest)
        || !valid_digest(&request.ui_artifact_digest)
    {
        return Err(forbidden_error(
            "Surface request digest is not bound to a committed contract",
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
    let now = now_ms(request_ctx)?;
    if request.request_context.deadline_unix_ms <= now {
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
    if request
        .request_context
        .story
        .as_ref()
        .is_some_and(|story| story.story.trim().is_empty())
    {
        return Err(validation_error(
            "Surface operation Story id must be non-empty",
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

fn authorize_surface_grant(
    module: &SystemTopologyModule,
    binding: &ManagementBinding,
    request: &SurfaceOperationRequest,
    operation: &ContractOperation,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if module.module_release_digest != request.module_release_digest
        || module.console_ui_artifact_digest.as_deref() != Some(request.ui_artifact_digest.as_str())
    {
        return Err(forbidden_error(
            "Surface request is not bound to the connected Module release",
            request_ctx,
        ));
    }
    if module.runtime_status == Some(ModuleRuntimeStatus::Unavailable)
        || module.runtime_status == Some(ModuleRuntimeStatus::Incompatible)
        || module.runtime_status == Some(ModuleRuntimeStatus::Unmanaged)
    {
        return Err(external_error(
            "Connected Module workload is not available",
            request_ctx,
        ));
    }
    if let ModuleDelivery::Linked = module.delivery
        && module.service_id.is_some()
    {
        return Err(forbidden_error(
            "Linked Surface Module must not reference a Service",
            request_ctx,
        ));
    }
    let Some(grant) = module.surface_api_grant.as_ref() else {
        return Err(forbidden_error(
            "Surface artifact has no Surface API Grant",
            request_ctx,
        ));
    };
    if grant.artifact_digest != request.ui_artifact_digest
        || grant.module_release_digest != request.module_release_digest
        || grant.contract_digest != request.contract_digest
        || !grant
            .operation_ids
            .iter()
            .any(|operation_id| operation_id == &operation.operation_id)
    {
        return Err(forbidden_error(
            "Surface API Grant does not allow this contract operation",
            request_ctx,
        ));
    }
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
    Ok(())
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

fn resolve_operation(operation_id: &str) -> Result<ContractOperation, String> {
    let document: Value = serde_json::from_str(SUPPORT_TICKET_CONTRACT)
        .map_err(|error| format!("Support Ticket contract is invalid: {error}"))?;
    let paths = document
        .get("paths")
        .and_then(Value::as_object)
        .ok_or_else(|| "Support Ticket contract has no paths".to_owned())?;
    for path_item in paths.values() {
        let Some(path_item) = path_item.as_object() else {
            continue;
        };
        for method_name in ["get", "post", "patch", "put", "delete"] {
            let Some(operation) = path_item.get(method_name).and_then(Value::as_object) else {
                continue;
            };
            if operation.get("operationId").and_then(Value::as_str) != Some(operation_id) {
                continue;
            }
            let target = operation
                .get("x-lenso-connected-route")
                .and_then(Value::as_object)
                .ok_or_else(|| format!("Surface operation {operation_id} has no target route"))?;
            let method = target
                .get("method")
                .and_then(Value::as_str)
                .ok_or_else(|| format!("Surface operation {operation_id} has no target method"))?;
            let method = Method::from_bytes(method.as_bytes()).map_err(|error| {
                format!("Surface operation {operation_id} has an invalid target method: {error}")
            })?;
            let target_path = target
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| format!("Surface operation {operation_id} has no target path"))?;
            let capability = operation
                .get("x-lenso-capability")
                .and_then(Value::as_str)
                .ok_or_else(|| format!("Surface operation {operation_id} has no capability"))?;
            let idempotency = operation
                .get("x-lenso-idempotency")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    format!("Surface operation {operation_id} has no idempotency policy")
                })?;
            return Ok(ContractOperation {
                operation_id: operation_id.to_owned(),
                method,
                target_path: target_path.to_owned(),
                capability: capability.to_owned(),
                idempotency: idempotency.to_owned(),
            });
        }
    }
    Err(format!(
        "Surface operation is not in the committed contract: {operation_id}"
    ))
}

fn operation_console_capability(operation: &ContractOperation) -> String {
    if operation.capability == "support_ticket.tickets.read" {
        SURFACE_GATEWAY_READ.to_owned()
    } else {
        SURFACE_GATEWAY_WRITE.to_owned()
    }
}

fn build_target_call(
    operation: &ContractOperation,
    input: &Value,
    request_ctx: &RequestContext,
) -> Result<TargetCall, ApiErrorResponse> {
    let object = input.as_object().ok_or_else(|| {
        validation_error("Surface operation input must be a JSON object", request_ctx)
    })?;
    let operation_id = operation.operation_id.as_str();
    let (path, query, body) = if operation_id == "support-ticket/http/GET:/tickets" {
        assert_exact_keys(object, &["limit", "cursor"], request_ctx)?;
        let mut query = Vec::new();
        if let Some(limit) = object.get("limit") {
            let limit = limit.as_u64().ok_or_else(|| {
                validation_error("Support Ticket limit must be an integer", request_ctx)
            })?;
            if !(1..=100).contains(&limit) {
                return Err(validation_error(
                    "Support Ticket limit must be between 1 and 100",
                    request_ctx,
                ));
            }
            query.push(("limit".to_owned(), limit.to_string()));
        }
        if let Some(cursor) = object.get("cursor") {
            let cursor = cursor.as_str().ok_or_else(|| {
                validation_error("Support Ticket cursor must be a string", request_ctx)
            })?;
            if cursor.is_empty() {
                return Err(validation_error(
                    "Support Ticket cursor must be non-empty",
                    request_ctx,
                ));
            }
            query.push(("cursor".to_owned(), cursor.to_owned()));
        }
        (operation.target_path.clone(), query, None)
    } else if operation_id == "support-ticket/http/POST:/tickets" {
        assert_exact_keys(object, &["title", "priority", "assignee"], request_ctx)?;
        let title = required_text(object, "title", request_ctx)?;
        validate_priority(object.get("priority"), request_ctx)?;
        optional_text(object.get("assignee"), "assignee", request_ctx)?;
        let mut body = Map::new();
        body.insert("title".to_owned(), Value::String(title));
        copy_optional(object, &mut body, "priority");
        copy_optional(object, &mut body, "assignee");
        (
            operation.target_path.clone(),
            Vec::new(),
            Some(Value::Object(body)),
        )
    } else if operation_id == "support-ticket/http/PATCH:/tickets/{id}" {
        assert_exact_keys(
            object,
            &["ticketId", "title", "status", "priority", "assignee"],
            request_ctx,
        )?;
        let ticket_id = required_path_segment(object, request_ctx)?;
        let mut body = object.clone();
        body.remove("ticketId");
        if body.is_empty() {
            return Err(validation_error(
                "Support Ticket update requires at least one mutable field",
                request_ctx,
            ));
        }
        optional_text(body.get("title"), "title", request_ctx)?;
        optional_text(body.get("assignee"), "assignee", request_ctx)?;
        validate_status(body.get("status"), request_ctx)?;
        validate_priority(body.get("priority"), request_ctx)?;
        (
            operation.target_path.replace("{ticketId}", &ticket_id),
            Vec::new(),
            Some(body_to_value(body)),
        )
    } else if operation_id == "support-ticket/http/POST:/tickets/{id}/close" {
        assert_exact_keys(object, &["ticketId"], request_ctx)?;
        let ticket_id = required_path_segment(object, request_ctx)?;
        (
            operation.target_path.replace("{ticketId}", &ticket_id),
            Vec::new(),
            Some(json!({ "status": "closed" })),
        )
    } else {
        return Err(validation_error(
            "Surface operation input adapter is not implemented",
            request_ctx,
        ));
    };
    Ok(TargetCall {
        method: operation.method.clone(),
        path,
        query,
        body,
    })
}

fn assert_exact_keys(
    object: &Map<String, Value>,
    allowed: &[&str],
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if let Some(key) = object.keys().find(|key| !allowed.contains(&key.as_str())) {
        return Err(validation_error(
            format!("Surface operation input contains unsupported field: {key}"),
            request_ctx,
        ));
    }
    Ok(())
}

fn required_text(
    object: &Map<String, Value>,
    field: &str,
    request_ctx: &RequestContext,
) -> Result<String, ApiErrorResponse> {
    let value = object.get(field).and_then(Value::as_str).map(str::trim);
    match value.filter(|value| !value.is_empty()) {
        Some(value) => Ok(value.to_owned()),
        None => Err(validation_error(
            format!("Support Ticket {field} must be non-empty"),
            request_ctx,
        )),
    }
}

fn optional_text(
    value: Option<&Value>,
    field: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if let Some(value) = value
        && value.as_str().is_none_or(|value| value.trim().is_empty())
    {
        return Err(validation_error(
            format!("Support Ticket {field} must be non-empty"),
            request_ctx,
        ));
    }
    Ok(())
}

fn validate_priority(
    value: Option<&Value>,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    validate_enum(value, "priority", &["low", "normal", "high"], request_ctx)
}

fn validate_status(
    value: Option<&Value>,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    validate_enum(
        value,
        "status",
        &["open", "pending", "escalated", "closed"],
        request_ctx,
    )
}

fn validate_enum(
    value: Option<&Value>,
    field: &str,
    allowed: &[&str],
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if let Some(value) = value {
        let Some(value) = value.as_str() else {
            return Err(validation_error(
                format!("Support Ticket {field} must be a string"),
                request_ctx,
            ));
        };
        if !allowed.contains(&value) {
            return Err(validation_error(
                format!("Support Ticket {field} is not supported"),
                request_ctx,
            ));
        }
    }
    Ok(())
}

fn required_path_segment(
    object: &Map<String, Value>,
    request_ctx: &RequestContext,
) -> Result<String, ApiErrorResponse> {
    let ticket_id = required_text(object, "ticketId", request_ctx)?;
    if !ticket_id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || b"._~-".contains(&byte))
    {
        return Err(validation_error(
            "Support Ticket id contains an unsafe path character",
            request_ctx,
        ));
    }
    Ok(ticket_id)
}

fn copy_optional(object: &Map<String, Value>, body: &mut Map<String, Value>, field: &str) {
    if let Some(value) = object.get(field) {
        body.insert(field.to_owned(), value.clone());
    }
}

fn body_to_value(body: Map<String, Value>) -> Value {
    Value::Object(body)
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
    request: &SurfaceOperationRequest,
    request_ctx: &RequestContext,
) -> Result<Value, ApiErrorResponse> {
    let url = target_url(&target.base_url, &call.path)
        .map_err(|message| external_error(&message, request_ctx))?;
    let remaining_ms = request
        .request_context
        .deadline_unix_ms
        .saturating_sub(now_ms_value());
    if remaining_ms == 0 {
        return Err(external_error(
            "Surface operation deadline expired",
            request_ctx,
        ));
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| {
            internal_source_error("Surface Gateway client is unavailable", error, request_ctx)
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
        .header(
            "x-lenso-console-capability",
            operation_target_capability(&request.operation_id),
        )
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
            internal_source_error(
                "Surface Story context could not be encoded",
                error,
                request_ctx,
            )
        })?;
        builder = builder.header("x-lenso-console-story-context", story);
    }
    if let Some(body) = call.body.as_ref() {
        builder = builder.json(body);
    }
    let response = builder.send().await.map_err(|error| {
        external_source_error(
            "Managed Service Surface operation failed",
            error,
            request_ctx,
        )
    })?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        external_source_error(
            "Managed Service Surface response could not be read",
            error,
            request_ctx,
        )
    })?;
    if !status.is_success() {
        return Err(match status.as_u16() {
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
        });
    }
    serde_json::from_str(&body).map_err(|error| {
        external_source_error(
            "Connected Module returned an invalid Business API response",
            error,
            request_ctx,
        )
    })
}

fn operation_target_capability(operation_id: &str) -> &'static str {
    if operation_id == "support-ticket/http/GET:/tickets" {
        "support_ticket.tickets.read"
    } else {
        "support_ticket.tickets.write"
    }
}

fn normalize_output(
    operation: &ContractOperation,
    input: &Value,
    mut output: Value,
    request_ctx: &RequestContext,
) -> Result<Value, ApiErrorResponse> {
    if operation.operation_id == "support-ticket/http/GET:/tickets" {
        let limit = usize::try_from(input.get("limit").and_then(Value::as_u64).unwrap_or(100))
            .map_err(|error| {
                internal_source_error("Support Ticket page limit is invalid", error, request_ctx)
            })?;
        let object = output.as_object_mut().ok_or_else(|| {
            external_error(
                "Connected Module returned an invalid ticket page",
                request_ctx,
            )
        })?;
        let records = object
            .get_mut("records")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| {
                external_error(
                    "Connected Module returned an invalid ticket page",
                    request_ctx,
                )
            })?;
        records.truncate(limit);
        if !object.contains_key("next_cursor") {
            object.insert("next_cursor".to_owned(), Value::Null);
        }
    } else if output
        .as_object()
        .and_then(|object| object.get("ticket"))
        .and_then(Value::as_object)
        .is_none()
    {
        return Err(external_error(
            "Connected Module returned an invalid ticket result",
            request_ctx,
        ));
    }
    Ok(output)
}

fn target_url(base_url: &str, path: &str) -> Result<String, String> {
    if !path.starts_with("/modules/support-ticket/")
        || path.contains('?')
        || path.contains('#')
        || path.contains("..")
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

fn support_ticket_contract_digest() -> String {
    let digest = Sha256::digest(SUPPORT_TICKET_CONTRACT.as_bytes());
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(hex, "{byte:02x}");
    }
    format!("sha256:{hex}")
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
    AppError::new(ErrorCode::Validation, message).into_api(request_ctx)
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
    AppError::new(ErrorCode::Internal, message).into_api(request_ctx)
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
    use platform_core::{CorrelationId, RequestId};

    fn request_context() -> RequestContext {
        RequestContext::new(
            RequestId::new("request-1"),
            CorrelationId::new("correlation-1"),
        )
    }

    #[test]
    fn resolves_all_granted_support_ticket_operations_from_the_committed_contract() {
        for operation_id in [
            "support-ticket/http/GET:/tickets",
            "support-ticket/http/POST:/tickets",
            "support-ticket/http/PATCH:/tickets/{id}",
            "support-ticket/http/POST:/tickets/{id}/close",
        ] {
            let operation = resolve_operation(operation_id).expect("operation");
            assert_eq!(operation.operation_id, operation_id);
            assert!(
                operation
                    .target_path
                    .starts_with("/modules/support-ticket/")
            );
        }
    }

    #[test]
    fn contract_digest_matches_the_generated_client_digest() {
        assert_eq!(
            support_ticket_contract_digest(),
            "sha256:5b319cc7b4dbfe965cca4f770d5dc32c7d5cac984b2f374286d62ce1b5d6f1f9"
        );
    }

    #[test]
    fn rejects_unknown_input_fields_before_target_resolution() {
        let operation = resolve_operation("support-ticket/http/GET:/tickets").expect("operation");
        let error = build_target_call(
            &operation,
            &json!({ "rawUrl": "/arbitrary" }),
            &request_context(),
        )
        .expect_err("raw URL");
        assert_eq!(error.error.code, ErrorCode::Validation);
    }

    #[test]
    fn maps_typed_list_parameters_to_the_committed_target_query() {
        let operation = resolve_operation("support-ticket/http/GET:/tickets").expect("operation");
        let call = build_target_call(
            &operation,
            &json!({ "cursor": "cursor/1", "limit": 2 }),
            &request_context(),
        )
        .expect("target call");
        assert_eq!(call.path, "/modules/support-ticket/tickets");
        assert_eq!(
            call.query,
            vec![
                ("limit".to_owned(), "2".to_owned()),
                ("cursor".to_owned(), "cursor/1".to_owned()),
            ]
        );
        assert!(call.body.is_none());
    }

    #[test]
    fn maps_close_to_the_connected_module_update_route_without_exposing_a_target_url() {
        let operation =
            resolve_operation("support-ticket/http/POST:/tickets/{id}/close").expect("operation");
        let call = build_target_call(
            &operation,
            &json!({ "ticketId": "ticket_1" }),
            &request_context(),
        )
        .expect("target call");
        assert_eq!(call.method, Method::PATCH);
        assert_eq!(call.path, "/modules/support-ticket/tickets/ticket_1");
        assert_eq!(call.body, Some(json!({ "status": "closed" })));
    }

    #[test]
    fn rejects_target_paths_outside_the_connected_module_prefix() {
        assert!(target_url("http://127.0.0.1:4110", "/admin/tickets").is_err());
        assert!(target_url("http://example.com", "/modules/support-ticket/tickets").is_err());
    }

    #[test]
    fn declares_the_same_origin_surface_gateway_route_without_a_generic_data_surface() {
        let module = linked_module();
        let manifest = (module.manifest)();

        assert_eq!(module.module_name, MODULE_NAME);
        assert_eq!(manifest.http_routes, http_routes());
        assert_eq!(
            manifest.capabilities,
            [SURFACE_GATEWAY_READ, SURFACE_GATEWAY_WRITE]
        );
        assert!(manifest.console.is_empty());
        assert!(module.http_binding.is_some());
    }
}
