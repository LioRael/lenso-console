use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, OpenApiRouter, Path, RequestContext, State, UserActor, json, routes,
};
use serde::Serialize;
use serde_json::Value;
use sqlx::{Postgres, Row};
use utoipa::ToSchema;

use super::REGISTRY_READ;

const LIST_SERVICES_SQL: &str = "select service_id, service_principal, base_url, \
    enrollment_receipt_digest, enrollment_grant_revision, authorization_epoch, \
    enrollment_expires_at_unix_ms, enrollment_state, connection_state, core_document, \
    core_observed_at::text as core_observed_at, last_error_code, version \
    from console.managed_services order by service_id";
const GET_SERVICE_SQL: &str = "select service_id, service_principal, base_url, \
    enrollment_receipt_digest, enrollment_grant_revision, authorization_epoch, \
    enrollment_expires_at_unix_ms, enrollment_state, connection_state, core_document, \
    core_observed_at::text as core_observed_at, last_error_code, version \
    from console.managed_services where service_id = $1";
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
    require_scope(&actor, REGISTRY_READ, &request_ctx)?;
    let rows = sqlx::query(LIST_SERVICES_SQL)
        .fetch_all(&ctx.db)
        .await
        .map_err(|error| database_error(error, &request_ctx))?;
    let services = rows
        .iter()
        .map(|row| managed_service_from_row(row, &request_ctx))
        .collect::<Result<Vec<_>, _>>()?;
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
    require_scope(&actor, REGISTRY_READ, &request_ctx)?;
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

fn require_scope(
    actor: &UserActor,
    required: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if has_scope(actor, required) {
        return Ok(());
    }
    Err(api_error(
        AppError::new(
            ErrorCode::Forbidden,
            format!("Missing required scope: {required}"),
        ),
        request_ctx,
    ))
}

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

    #[test]
    fn router_documents_only_console_service_api_routes() {
        let document = router().to_openapi();
        for path in [
            "/api/console/v1/services",
            "/api/console/v1/services/{serviceId}",
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
}
