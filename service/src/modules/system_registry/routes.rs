use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, OpenApiRouter, Path, RequestContext, State, UserActor, json, routes,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use sqlx::{Postgres, Row};
use std::time::{SystemTime, UNIX_EPOCH};
use utoipa::ToSchema;

use crate::composition::CONSOLE_SERVICE_ID;
use crate::modules::console_access;
use lenso::system_plane::{
    ActionContributionResolution, ActionContributionResolutionRequest, CoreDocument,
    MODULE_OPERATIONS_FEATURE_CONFIG_READ, MODULE_OPERATIONS_FEATURE_CONFIG_WRITE,
    MODULE_OPERATIONS_FEATURE_CONTRIBUTIONS_RESOLVE, MODULE_OPERATIONS_FEATURE_INVENTORY_READ,
    MODULE_OPERATIONS_PATH, MODULE_OPERATIONS_PROTOCOL, ManagedServiceContext,
    ModuleConfigReadRequest, ModuleConfigReadResponse, ModuleConfigWriteRequest,
    ModuleConfigWriteResponse, ModuleInventoryRequest, ModuleInventorySnapshot,
    module_operations_schema_digest, validate_core_document,
};

use super::REGISTRY_READ;

const LIST_SERVICES_SQL: &str = "select service_id, service_principal, base_url, \
    enrollment_receipt_digest, enrollment_grant_revision, authorization_epoch, \
    enrollment_expires_at_unix_ms, enrollment_state, connection_state, core_document, \
    core_observed_at::text as core_observed_at, last_error_code, version \
    from console.managed_services where service_id <> 'lenso-console' order by service_id";
const GET_SERVICE_SQL: &str = "select service_id, service_principal, base_url, \
    enrollment_receipt_digest, enrollment_grant_revision, authorization_epoch, \
    enrollment_expires_at_unix_ms, enrollment_state, connection_state, core_document, \
    core_observed_at::text as core_observed_at, last_error_code, version \
    from console.managed_services where service_id = $1 and service_id <> 'lenso-console'";
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
enum EnrollmentState {
    Active,
    Revoked,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
enum ConnectionState {
    NeverObserved,
    Ready,
    Unavailable,
    Incompatible,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ManagedServiceResponse {
    service_id: String,
    service_principal: String,
    base_url: String,
    enrollment_receipt_digest: String,
    enrollment_grant_revision: u64,
    authorization_epoch: u64,
    enrollment_expires_at_unix_ms: u64,
    enrollment_state: EnrollmentState,
    connection_state: ConnectionState,
    core_document: Option<Value>,
    core_observed_at: Option<String>,
    last_error_code: Option<String>,
    version: u64,
}

pub fn merge_http(base: ApiOpenApiRouter) -> ApiOpenApiRouter {
    base.merge(router())
}

fn router() -> ApiOpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(list_managed_services))
        .routes(routes!(get_managed_service))
        .routes(routes!(module_inventory))
        .routes(routes!(resolve_action_contributions))
        .routes(routes!(read_module_config))
        .routes(routes!(write_module_config))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/services",
    operation_id = "console_list_managed_services",
    tag = "console-system-registry",
    responses(
        (status = 200, body = Vec<ManagedServiceResponse>, content_type = "application/json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn list_managed_services(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
) -> Result<Json<Vec<ManagedServiceResponse>>, ApiErrorResponse> {
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        None,
        REGISTRY_READ,
        &request_ctx,
    )
    .await?;
    let rows = sqlx::query(LIST_SERVICES_SQL)
        .fetch_all(&ctx.db)
        .await
        .map_err(|error| database_error(error, &request_ctx))?;
    let mut services = Vec::new();
    for row in &rows {
        let service_id: String = value(row, "service_id", &request_ctx)?;
        if console_access::has_managed_service_capability(
            &ctx,
            &actor,
            Some(&service_id),
            REGISTRY_READ,
        )
        .await
        .map_err(|error| api_error(error, &request_ctx))?
        {
            services.push(managed_service_from_row(row, &request_ctx)?);
        }
    }
    Ok(json(services))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/services/{serviceId}",
    operation_id = "console_get_managed_service",
    tag = "console-system-registry",
    params(("serviceId" = String, Path, description = "Managed Service identity")),
    responses(
        (status = 200, body = ManagedServiceResponse, content_type = "application/json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 404, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn get_managed_service(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(service_id): Path<String>,
) -> Result<Json<ManagedServiceResponse>, ApiErrorResponse> {
    console_access::require_managed_service_capability(
        &ctx,
        &actor,
        Some(&service_id),
        REGISTRY_READ,
        &request_ctx,
    )
    .await?;
    if service_id == CONSOLE_SERVICE_ID {
        return Err(api_error(
            AppError::new(ErrorCode::NotFound, "Managed Service was not found"),
            &request_ctx,
        ));
    }
    let row = sqlx::query(GET_SERVICE_SQL)
        .bind(&service_id)
        .fetch_optional(&ctx.db)
        .await
        .map_err(|error| database_error(error, &request_ctx))?
        .ok_or_else(|| {
            api_error(
                AppError::new(ErrorCode::NotFound, "Managed Service was not found"),
                &request_ctx,
            )
        })?;
    Ok(json(managed_service_from_row(&row, &request_ctx)?))
}

const OPERATION_SERVICE_SQL: &str = "select service_id, service_principal, base_url, \
    enrollment_receipt_digest, enrollment_grant_revision, authorization_epoch, \
    enrollment_expires_at_unix_ms, enrollment_state, connection_state, core_document \
    from console.managed_services where service_id = $1 and service_id <> 'lenso-console'";

struct ManagedServiceTarget {
    service_id: String,
    service_principal: String,
    base_url: String,
    enrollment_receipt_digest: String,
    core_document: CoreDocument,
}

#[utoipa::path(
    post,
    path = "/api/console/v1/services/{serviceId}/system-plane/v1/modules",
    operation_id = "console_read_managed_service_module_inventory",
    tag = "console-system-plane-module-operations",
    params(("serviceId" = String, Path, description = "Managed Service identity")),
    request_body = ModuleInventoryRequest,
    responses(
        (status = 200, body = ModuleInventorySnapshot, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn module_inventory(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(service_id): Path<String>,
    Json(request): Json<ModuleInventoryRequest>,
) -> Result<Json<ModuleInventorySnapshot>, ApiErrorResponse> {
    let target = authorize_operation(
        &ctx,
        &actor,
        &request_ctx,
        &service_id,
        &request.context,
        super::MODULE_INVENTORY_READ,
        MODULE_OPERATIONS_FEATURE_INVENTORY_READ,
    )
    .await?;
    let response: ModuleInventorySnapshot =
        forward_operation(&target, MODULE_OPERATIONS_PATH, &request, &request_ctx).await?;
    validate_operation_response(
        &response.protocol,
        &response.context,
        &request.context,
        &request_ctx,
    )?;
    Ok(json(response))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/services/{serviceId}/system-plane/v1/modules/action-contributions/resolve",
    operation_id = "console_resolve_managed_service_action_contributions",
    tag = "console-system-plane-module-operations",
    params(("serviceId" = String, Path, description = "Managed Service identity")),
    request_body = ActionContributionResolutionRequest,
    responses(
        (status = 200, body = ActionContributionResolution, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn resolve_action_contributions(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(service_id): Path<String>,
    Json(request): Json<ActionContributionResolutionRequest>,
) -> Result<Json<ActionContributionResolution>, ApiErrorResponse> {
    let target = authorize_operation(
        &ctx,
        &actor,
        &request_ctx,
        &service_id,
        &request.context,
        super::MODULE_CONTRIBUTIONS_RESOLVE,
        MODULE_OPERATIONS_FEATURE_CONTRIBUTIONS_RESOLVE,
    )
    .await?;
    let response: ActionContributionResolution = forward_operation(
        &target,
        "/system-plane/v1/modules/action-contributions/resolve",
        &request,
        &request_ctx,
    )
    .await?;
    validate_operation_response(
        &response.protocol,
        &response.context,
        &request.context,
        &request_ctx,
    )?;
    if response.slot != request.slot || response.slot_version != request.slot_version {
        return Err(external_operation_error(
            "Managed Service returned contributions for a different slot",
            &request_ctx,
        ));
    }
    Ok(json(response))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/services/{serviceId}/system-plane/v1/modules/config/read",
    operation_id = "console_read_managed_service_module_config",
    tag = "console-system-plane-module-operations",
    params(("serviceId" = String, Path, description = "Managed Service identity")),
    request_body = ModuleConfigReadRequest,
    responses(
        (status = 200, body = ModuleConfigReadResponse, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn read_module_config(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(service_id): Path<String>,
    Json(request): Json<ModuleConfigReadRequest>,
) -> Result<Json<ModuleConfigReadResponse>, ApiErrorResponse> {
    let target = authorize_operation(
        &ctx,
        &actor,
        &request_ctx,
        &service_id,
        &request.context,
        super::MODULE_CONFIG_READ,
        MODULE_OPERATIONS_FEATURE_CONFIG_READ,
    )
    .await?;
    let response: ModuleConfigReadResponse = forward_operation(
        &target,
        "/system-plane/v1/modules/config/read",
        &request,
        &request_ctx,
    )
    .await?;
    validate_operation_response(
        &response.protocol,
        &response.context,
        &request.context,
        &request_ctx,
    )?;
    if response.module_id != request.module_id {
        return Err(external_operation_error(
            "Managed Service returned configuration for a different Module",
            &request_ctx,
        ));
    }
    if response
        .values
        .iter()
        .any(|value| value.sensitive && value.value.is_some())
    {
        return Err(external_operation_error(
            "Managed Service returned a sensitive configuration value",
            &request_ctx,
        ));
    }
    Ok(json(response))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/services/{serviceId}/system-plane/v1/modules/config/write",
    operation_id = "console_write_managed_service_module_config",
    tag = "console-system-plane-module-operations",
    params(("serviceId" = String, Path, description = "Managed Service identity")),
    request_body = ModuleConfigWriteRequest,
    responses(
        (status = 200, body = ModuleConfigWriteResponse, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn write_module_config(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(service_id): Path<String>,
    Json(request): Json<ModuleConfigWriteRequest>,
) -> Result<Json<ModuleConfigWriteResponse>, ApiErrorResponse> {
    let target = authorize_operation(
        &ctx,
        &actor,
        &request_ctx,
        &service_id,
        &request.context,
        super::MODULE_CONFIG_WRITE,
        MODULE_OPERATIONS_FEATURE_CONFIG_WRITE,
    )
    .await?;
    let response: ModuleConfigWriteResponse = forward_operation(
        &target,
        "/system-plane/v1/modules/config/write",
        &request,
        &request_ctx,
    )
    .await?;
    validate_operation_response(
        &response.protocol,
        &response.context,
        &request.context,
        &request_ctx,
    )?;
    if response.module_id != request.module_id {
        return Err(external_operation_error(
            "Managed Service returned configuration evidence for a different Module",
            &request_ctx,
        ));
    }
    if response.evidence.iter().any(|evidence| {
        evidence.operation_id != response.operation_id
            || evidence.module_id != request.module_id
            || !valid_digest(&evidence.new_value_digest)
            || evidence
                .old_value_digest
                .as_deref()
                .is_some_and(|digest| !valid_digest(digest))
    }) {
        return Err(external_operation_error(
            "Managed Service returned invalid configuration audit evidence",
            &request_ctx,
        ));
    }
    Ok(json(response))
}

async fn authorize_operation(
    ctx: &AppContext,
    actor: &UserActor,
    request_ctx: &RequestContext,
    service_id: &str,
    context: &ManagedServiceContext,
    console_scope: &str,
    feature_id: &str,
) -> Result<ManagedServiceTarget, ApiErrorResponse> {
    console_access::require_managed_service_capability(
        ctx,
        actor,
        Some(service_id),
        console_scope,
        request_ctx,
    )
    .await?;
    let target = load_target(ctx, request_ctx, service_id).await?;
    if context.service_id != target.service_id
        || context.target_service_principal != target.service_principal
        || context.delegated_authority_digest != target.enrollment_receipt_digest
    {
        return Err(api_error(
            AppError::new(
                ErrorCode::Forbidden,
                "Managed Service Context does not match the selected Managed Service",
            ),
            request_ctx,
        ));
    }
    if context.delegated_actor_subject != actor.user_id
        || context.system_id.trim().is_empty()
        || context.environment_id.trim().is_empty()
        || context.caller_module_id.trim().is_empty()
        || !valid_digest(&context.delegated_authority_digest)
        || context
            .capabilities
            .iter()
            .any(|capability| capability.trim().is_empty())
    {
        return Err(api_error(
            AppError::new(
                ErrorCode::Forbidden,
                "Managed Service Context is not authorized for the current Console actor",
            ),
            request_ctx,
        ));
    }
    let advertisement = target
        .core_document
        .capabilities
        .iter()
        .find(|capability| capability.contract_id == MODULE_OPERATIONS_PROTOCOL);
    let Some(advertisement) = advertisement else {
        return Err(external_operation_error(
            "Managed Service does not advertise Module Operations",
            request_ctx,
        ));
    };
    if advertisement.major_version != 1
        || advertisement.schema_digest != module_operations_schema_digest()
        || !advertisement.feature_ids.contains(feature_id)
    {
        return Err(external_operation_error(
            "Managed Service Module Operations contract is incompatible",
            request_ctx,
        ));
    }
    Ok(target)
}

async fn load_target(
    ctx: &AppContext,
    request_ctx: &RequestContext,
    service_id: &str,
) -> Result<ManagedServiceTarget, ApiErrorResponse> {
    if service_id == CONSOLE_SERVICE_ID {
        return Err(api_error(
            AppError::new(ErrorCode::NotFound, "Managed Service was not found"),
            request_ctx,
        ));
    }
    let row = sqlx::query(OPERATION_SERVICE_SQL)
        .bind(service_id)
        .fetch_optional(&ctx.db)
        .await
        .map_err(|error| database_error(error, request_ctx))?
        .ok_or_else(|| {
            api_error(
                AppError::new(ErrorCode::NotFound, "Managed Service was not found"),
                request_ctx,
            )
        })?;
    let service_id: String = value(&row, "service_id", request_ctx)?;
    let service_principal: String = value(&row, "service_principal", request_ctx)?;
    let base_url: String = value(&row, "base_url", request_ctx)?;
    let enrollment_receipt_digest: String = value(&row, "enrollment_receipt_digest", request_ctx)?;
    let enrollment_state: String = value(&row, "enrollment_state", request_ctx)?;
    let connection_state: String = value(&row, "connection_state", request_ctx)?;
    let expires_at: i64 = value(&row, "enrollment_expires_at_unix_ms", request_ctx)?;
    let core_document: Option<Value> = value(&row, "core_document", request_ctx)?;
    if enrollment_state != "active" || connection_state != "ready" {
        return Err(external_operation_error(
            "Managed Service is not ready for System Plane operations",
            request_ctx,
        ));
    }
    let now_ms = i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| internal_error(error, request_ctx))?
            .as_millis(),
    )
    .map_err(|error| internal_error(error, request_ctx))?;
    if expires_at <= now_ms {
        return Err(external_operation_error(
            "Managed Service enrollment has expired",
            request_ctx,
        ));
    }
    let core_document = core_document.ok_or_else(|| {
        external_operation_error(
            "Managed Service has not published a System Plane Core document",
            request_ctx,
        )
    })?;
    let core_document: CoreDocument = serde_json::from_value(core_document).map_err(|error| {
        external_operation_error_with_source(
            "Managed Service Core document is invalid",
            error,
            request_ctx,
        )
    })?;
    if !validate_core_document(&core_document).is_empty()
        || core_document.service_id != service_id
        || core_document.service_principal != service_principal
    {
        return Err(external_operation_error(
            "Managed Service Core document is incompatible",
            request_ctx,
        ));
    }
    if !valid_digest(&enrollment_receipt_digest) || base_url.trim().is_empty() {
        return Err(external_operation_error(
            "Managed Service enrollment binding is invalid",
            request_ctx,
        ));
    }
    Ok(ManagedServiceTarget {
        service_id,
        service_principal,
        base_url,
        enrollment_receipt_digest,
        core_document,
    })
}

async fn forward_operation<Request, Response>(
    target: &ManagedServiceTarget,
    path: &str,
    request: &Request,
    request_ctx: &RequestContext,
) -> Result<Response, ApiErrorResponse>
where
    Request: Serialize,
    Response: DeserializeOwned,
{
    let url = operation_url(&target.base_url, path).map_err(|_| {
        external_operation_error("Managed Service endpoint is invalid", request_ctx)
    })?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| {
            external_operation_error_with_source(
                "System Plane client is unavailable",
                error,
                request_ctx,
            )
        })?;
    let mut builder = client.post(url).json(request);
    if let Ok(token) = std::env::var("LENSO_CONSOLE_SYSTEM_PLANE_BEARER_TOKEN")
        && !token.trim().is_empty()
    {
        builder = builder.bearer_auth(token);
    }
    let response = builder.send().await.map_err(|error| {
        external_operation_error_with_source(
            "Managed Service System Plane request failed",
            error,
            request_ctx,
        )
    })?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        external_operation_error_with_source(
            "Managed Service response could not be read",
            error,
            request_ctx,
        )
    })?;
    if !status.is_success() {
        return Err(external_operation_error(
            "Managed Service rejected the typed Module operation",
            request_ctx,
        ));
    }
    serde_json::from_str(&body).map_err(|error| {
        external_operation_error_with_source(
            "Managed Service returned an invalid typed Module operation response",
            error,
            request_ctx,
        )
    })
}

fn operation_url(base_url: &str, path: &str) -> Result<String, String> {
    if ![
        MODULE_OPERATIONS_PATH,
        "/system-plane/v1/modules/action-contributions/resolve",
        "/system-plane/v1/modules/config/read",
        "/system-plane/v1/modules/config/write",
    ]
    .contains(&path)
    {
        return Err("unrecognized System Plane operation path".to_owned());
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

fn validate_operation_response(
    protocol: &str,
    context: &ManagedServiceContext,
    expected_context: &ManagedServiceContext,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if protocol != MODULE_OPERATIONS_PROTOCOL || context != expected_context {
        return Err(external_operation_error(
            "Managed Service returned a response for a different Module Operations contract or Context",
            request_ctx,
        ));
    }
    Ok(())
}

fn valid_digest(value: &str) -> bool {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64 && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn external_operation_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(ErrorCode::ExternalDependency, message).retryable(),
        request_ctx,
    )
}

fn external_operation_error_with_source(
    message: &str,
    source: impl std::error::Error + Send + Sync + 'static,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    api_error(
        AppError::new(ErrorCode::ExternalDependency, message)
            .retryable()
            .with_source(source),
        request_ctx,
    )
}

fn internal_error(
    source: impl std::error::Error + Send + Sync + 'static,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::Internal,
            "System Plane authorization clock is unavailable",
        )
        .with_source(source),
        request_ctx,
    )
}

fn managed_service_from_row(
    row: &sqlx::postgres::PgRow,
    request_ctx: &RequestContext,
) -> Result<ManagedServiceResponse, ApiErrorResponse> {
    let enrollment_state: String = value(row, "enrollment_state", request_ctx)?;
    let connection_state: String = value(row, "connection_state", request_ctx)?;
    Ok(ManagedServiceResponse {
        service_id: value(row, "service_id", request_ctx)?,
        service_principal: value(row, "service_principal", request_ctx)?,
        base_url: value(row, "base_url", request_ctx)?,
        enrollment_receipt_digest: value(row, "enrollment_receipt_digest", request_ctx)?,
        enrollment_grant_revision: positive_integer(
            value(row, "enrollment_grant_revision", request_ctx)?,
            "enrollment grant revision",
            request_ctx,
        )?,
        authorization_epoch: non_negative_integer(
            value(row, "authorization_epoch", request_ctx)?,
            "authorization epoch",
            request_ctx,
        )?,
        enrollment_expires_at_unix_ms: positive_integer(
            value(row, "enrollment_expires_at_unix_ms", request_ctx)?,
            "enrollment expiry",
            request_ctx,
        )?,
        enrollment_state: match enrollment_state.as_str() {
            "active" => EnrollmentState::Active,
            "revoked" => EnrollmentState::Revoked,
            _ => return Err(stored_state_error("enrollment", request_ctx)),
        },
        connection_state: match connection_state.as_str() {
            "never_observed" => ConnectionState::NeverObserved,
            "ready" => ConnectionState::Ready,
            "unavailable" => ConnectionState::Unavailable,
            "incompatible" => ConnectionState::Incompatible,
            _ => return Err(stored_state_error("connection", request_ctx)),
        },
        core_document: value(row, "core_document", request_ctx)?,
        core_observed_at: value(row, "core_observed_at", request_ctx)?,
        last_error_code: value(row, "last_error_code", request_ctx)?,
        version: positive_integer(value(row, "version", request_ctx)?, "version", request_ctx)?,
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
    row.try_get(column)
        .map_err(|error| database_error(error, request_ctx))
}

fn positive_integer(
    value: i64,
    field: &str,
    request_ctx: &RequestContext,
) -> Result<u64, ApiErrorResponse> {
    if value <= 0 {
        return Err(stored_integer_error(field, request_ctx));
    }
    u64::try_from(value).map_err(|_| stored_integer_error(field, request_ctx))
}

fn non_negative_integer(
    value: i64,
    field: &str,
    request_ctx: &RequestContext,
) -> Result<u64, ApiErrorResponse> {
    u64::try_from(value).map_err(|_| stored_integer_error(field, request_ctx))
}

#[cfg(test)]
fn has_scope(actor: &UserActor, required: &str) -> bool {
    actor.scopes.iter().any(|scope| scope == required)
}

fn database_error(error: sqlx::Error, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::Internal,
            "System Registry database operation failed",
        )
        .with_source(error),
        request_ctx,
    )
}

fn stored_state_error(state: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::Internal,
            format!("Stored managed Service {state} state is invalid"),
        ),
        request_ctx,
    )
}

fn stored_integer_error(field: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::Internal,
            format!("Stored managed Service {field} is invalid"),
        ),
        request_ctx,
    )
}

fn api_error(error: AppError, request_ctx: &RequestContext) -> ApiErrorResponse {
    ApiErrorResponse::with_context(error, request_ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use platform_core::{CorrelationId, RequestId};

    #[test]
    fn router_documents_only_console_service_api_routes() {
        let document = router().to_openapi();
        for path in [
            "/api/console/v1/services",
            "/api/console/v1/services/{serviceId}",
            "/api/console/v1/services/{serviceId}/system-plane/v1/modules",
            "/api/console/v1/services/{serviceId}/system-plane/v1/modules/action-contributions/resolve",
            "/api/console/v1/services/{serviceId}/system-plane/v1/modules/config/read",
            "/api/console/v1/services/{serviceId}/system-plane/v1/modules/config/write",
        ] {
            assert!(document.paths.paths.contains_key(path), "missing {path}");
        }
        assert!(
            document
                .paths
                .paths
                .keys()
                .all(|path| path.starts_with("/api/console/v1/"))
        );
    }

    #[test]
    fn enrollment_creation_is_not_exposed_without_signed_contract_support() {
        let document = router().to_openapi();
        assert!(
            !document
                .paths
                .paths
                .contains_key("/api/console/v1/enrollment-offers")
        );
        assert!(
            !document
                .paths
                .paths
                .contains_key("/api/console/v1/enrollment-receipts")
        );
    }

    #[test]
    fn registry_permissions_are_operation_specific() {
        let reader = UserActor {
            user_id: "operator".to_owned(),
            scopes: vec![REGISTRY_READ.to_owned()],
        };
        assert!(has_scope(&reader, REGISTRY_READ));
        assert_eq!(reader.scopes, [REGISTRY_READ]);
    }

    #[test]
    fn operation_proxy_accepts_only_published_paths() {
        assert!(operation_url("https://managed.example/base", MODULE_OPERATIONS_PATH).is_ok());
        assert!(
            operation_url(
                "https://managed.example/base",
                "/system-plane/v1/modules/config/read"
            )
            .is_ok()
        );
        assert!(operation_url("https://managed.example/base", "/admin/data/anything").is_err());
        assert!(
            operation_url(
                "https://managed.example/base?token=secret",
                MODULE_OPERATIONS_PATH
            )
            .is_err()
        );
    }

    #[test]
    fn operation_response_context_is_bound_to_the_request() {
        let context = ManagedServiceContext::new(
            "system",
            "billing",
            "production",
            "svc.billing",
            "acme/billing",
            "operator",
            format!("sha256:{}", "a".repeat(64)),
            ["billing.read"],
        );
        let request_context =
            RequestContext::new(RequestId::new("request"), CorrelationId::new("correlation"));
        assert!(
            validate_operation_response(
                MODULE_OPERATIONS_PROTOCOL,
                &context,
                &context,
                &request_context
            )
            .is_ok()
        );
        let mut changed = context.clone();
        changed.service_id = "other".to_owned();
        assert!(
            validate_operation_response(
                MODULE_OPERATIONS_PROTOCOL,
                &changed,
                &context,
                &request_context
            )
            .is_err()
        );
    }
}
