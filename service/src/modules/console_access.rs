use std::collections::BTreeSet;

use auth::models::{AuthSessionRecord, AuthUser, AuthUserId};
use auth::repositories::{AuthUserRepository, PostgresAuthUserRepository};
use auth_password::config::AuthPasswordConfig;
use auth_password::repositories::{AuthToken, PasswordAuthRepository};
use axum::extract::{Path, Query};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Duration, Utc};
use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, JsonBody, ModuleHttpMethod, OpenApiRouter, RequestContext, State,
    UserActor, json, routes,
};
use lenso::host::prelude::*;
use lenso::{ConsoleNavigation, ConsoleSurface, ConsoleSurfacePresentation, ConsoleWorkspaceRef};
use organization::models::{Membership, Organization, Role};
use organization::repositories::PostgresOrganizationRepository;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Postgres, Row};
use utoipa::ToSchema;

use crate::composition::CONSOLE_SERVICE_ID;

pub const MODULE_NAME: &str = "lenso/console-access";

pub const CONSOLE_SUPERADMIN_SCOPE: &str = "console.superadmin";
pub const CONSOLE_ACCESS_READ: &str = "console.access.read";
pub const CONSOLE_ACCESS_MANAGE: &str = "console.access.manage";
pub const CONSOLE_USERS_READ: &str = "console.users.read";
pub const CONSOLE_USERS_MANAGE: &str = "console.users.manage";
pub const CONSOLE_SESSIONS_READ: &str = "console.sessions.read";
pub const CONSOLE_SESSIONS_REVOKE: &str = "console.sessions.revoke";
pub const CONSOLE_ORGANIZATIONS_READ: &str = "console.organizations.read";
pub const CONSOLE_ORGANIZATIONS_MANAGE: &str = "console.organizations.manage";
pub const CONSOLE_GRANTS_READ: &str = "console.managed-service.access-grants.read";
pub const CONSOLE_GRANTS_MANAGE: &str = "console.managed-service.access-grants.manage";

const BOOTSTRAP_STATUS_SCHEMA: &str = "lenso.console-bootstrap-status.v1";
const RECOVERY_TOKEN_HEADER: &str = "x-lenso-console-recovery-token";
const RECOVERY_TOKEN_ENV: &str = "CONSOLE_BOOTSTRAP_RECOVERY_TOKEN";
const RECOVERY_MODE_ENV: &str = "CONSOLE_RECOVERY_MODE";
const SESSION_TTL_HOURS: i64 = 12;

const MIGRATIONS: &[Migration] = &[Migration {
    name: "lenso/console-access/0001_create_console_access",
    sql: include_str!("console_access/migrations/0001_create_console_access.sql"),
}];

pub fn linked_module() -> HostLinkedModule {
    HostLinkedModule::manifest_only(MODULE_NAME, manifest, MIGRATIONS)
        .with_http_binding(http_binding)
}

fn manifest() -> ModuleManifest {
    ModuleManifest::builder(MODULE_NAME)
        .dependencies(vec!["auth".to_owned(), "organization".to_owned()])
        .capabilities(capabilities())
        .http_routes(http_routes())
        .console(vec![ConsoleSurface {
            name: "console-access".to_owned(),
            label: "Console Access".to_owned(),
            route: "/access".to_owned(),
            presentation: ConsoleSurfacePresentation::Declarative {
                schema: serde_json::json!({
                    "component": MODULE_NAME,
                    "version": 1,
                }),
            },
            icon: Some("shield".to_owned()),
            required_capabilities: vec![CONSOLE_ACCESS_READ.to_owned()],
            navigation: Some(ConsoleNavigation {
                workspace: ConsoleWorkspaceRef {
                    id: "system".to_owned(),
                    label: "System".to_owned(),
                    icon: Some("shield".to_owned()),
                },
                group: None,
                order: Some(10),
            }),
        }])
        .build()
}

fn capabilities() -> Vec<String> {
    [
        CONSOLE_SUPERADMIN_SCOPE,
        CONSOLE_ACCESS_READ,
        CONSOLE_ACCESS_MANAGE,
        CONSOLE_USERS_READ,
        CONSOLE_USERS_MANAGE,
        CONSOLE_SESSIONS_READ,
        CONSOLE_SESSIONS_REVOKE,
        CONSOLE_ORGANIZATIONS_READ,
        CONSOLE_ORGANIZATIONS_MANAGE,
        CONSOLE_GRANTS_READ,
        CONSOLE_GRANTS_MANAGE,
    ]
    .into_iter()
    .map(ToOwned::to_owned)
    .collect()
}

#[allow(clippy::too_many_lines)]
fn http_routes() -> Vec<ModuleHttpRoute> {
    vec![
        route(
            ModuleHttpMethod::Get,
            "/bootstrap/v1/status",
            None,
            "Inspect Console Bootstrap Status",
        ),
        route(
            ModuleHttpMethod::Post,
            "/bootstrap/v1/recovery",
            None,
            "Create Local Recovery Bootstrap Superadmin",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/users",
            Some(CONSOLE_USERS_READ),
            "List Console Users",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/users",
            Some(CONSOLE_USERS_MANAGE),
            "Create Console User",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/users/{userId}",
            Some(CONSOLE_USERS_READ),
            "Get Console User",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/users/{userId}/disable",
            Some(CONSOLE_USERS_MANAGE),
            "Disable Console User",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/users/{userId}/enable",
            Some(CONSOLE_USERS_MANAGE),
            "Enable Console User",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/sessions",
            Some(CONSOLE_SESSIONS_READ),
            "List Console Sessions",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/sessions/{sessionId}/revoke",
            Some(CONSOLE_SESSIONS_REVOKE),
            "Revoke Console Session",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/organizations",
            Some(CONSOLE_ORGANIZATIONS_READ),
            "List Console Organizations",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/organizations",
            Some(CONSOLE_ORGANIZATIONS_MANAGE),
            "Create Console Organization",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/organizations/{organizationId}/members",
            Some(CONSOLE_ORGANIZATIONS_READ),
            "List Console Organization Members",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/organizations/{organizationId}/roles",
            Some(CONSOLE_ORGANIZATIONS_READ),
            "List Console Organization Roles",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/organizations/{organizationId}/roles",
            Some(CONSOLE_ORGANIZATIONS_MANAGE),
            "Create Console Organization Role",
        ),
        route(
            ModuleHttpMethod::Patch,
            "/api/console/v1/access/roles/{roleId}",
            Some(CONSOLE_ORGANIZATIONS_MANAGE),
            "Update Console Organization Role",
        ),
        route(
            ModuleHttpMethod::Patch,
            "/api/console/v1/access/memberships/{membershipId}",
            Some(CONSOLE_ORGANIZATIONS_MANAGE),
            "Update Console Organization Membership",
        ),
        route(
            ModuleHttpMethod::Delete,
            "/api/console/v1/access/memberships/{membershipId}",
            Some(CONSOLE_ORGANIZATIONS_MANAGE),
            "Remove Console Organization Membership",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/organizations/{organizationId}/invitations",
            Some(CONSOLE_ORGANIZATIONS_MANAGE),
            "Create Console Organization Invitation",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/administrators",
            Some(CONSOLE_ACCESS_READ),
            "List Console Administrators",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/administrators",
            Some(CONSOLE_ACCESS_MANAGE),
            "Grant Console Administrator Authority",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/administrators/{userId}/revoke",
            Some(CONSOLE_ACCESS_MANAGE),
            "Revoke Console Administrator Authority",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/grants",
            Some(CONSOLE_GRANTS_READ),
            "List Managed Service Access Grants",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/grants",
            Some(CONSOLE_GRANTS_MANAGE),
            "Create Managed Service Access Grant",
        ),
        route(
            ModuleHttpMethod::Post,
            "/api/console/v1/access/grants/{grantId}/revoke",
            Some(CONSOLE_GRANTS_MANAGE),
            "Revoke Managed Service Access Grant",
        ),
        route(
            ModuleHttpMethod::Get,
            "/api/console/v1/access/effective/{serviceId}",
            Some(CONSOLE_GRANTS_READ),
            "Inspect Effective Managed Service Access",
        ),
    ]
}

fn route(
    method: ModuleHttpMethod,
    path: &str,
    capability: Option<&str>,
    display_name: &str,
) -> ModuleHttpRoute {
    ModuleHttpRoute {
        method,
        path: path.to_owned(),
        capability: capability.map(ToOwned::to_owned),
        display_name: Some(display_name.to_owned()),
        story_title: Some(display_name.to_owned()),
        operation: None,
    }
}

fn http_binding() -> LinkedBinding {
    LinkedBinding::builder()
        .http(LinkedHttpContribution {
            public_prefixes: &["/bootstrap/v1", "/api/console/v1/access"],
            merge: merge_http,
        })
        .build()
}

fn merge_http(base: ApiOpenApiRouter) -> ApiOpenApiRouter {
    base.merge(
        OpenApiRouter::new()
            .routes(routes!(get_bootstrap_status))
            .routes(routes!(create_bootstrap_superadmin))
            .routes(routes!(list_console_users))
            .routes(routes!(create_console_user))
            .routes(routes!(get_console_user))
            .routes(routes!(disable_console_user))
            .routes(routes!(enable_console_user))
            .routes(routes!(list_console_sessions))
            .routes(routes!(revoke_console_session))
            .routes(routes!(list_console_organizations))
            .routes(routes!(create_console_organization))
            .routes(routes!(list_organization_members))
            .routes(routes!(list_organization_roles))
            .routes(routes!(create_organization_role))
            .routes(routes!(update_organization_role))
            .routes(routes!(update_organization_membership))
            .routes(routes!(remove_organization_membership))
            .routes(routes!(create_organization_invitation))
            .routes(routes!(list_console_administrators))
            .routes(routes!(grant_console_administrator))
            .routes(routes!(revoke_console_administrator))
            .routes(routes!(list_access_grants))
            .routes(routes!(create_access_grant))
            .routes(routes!(revoke_access_grant))
            .routes(routes!(get_effective_access)),
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
enum ConsoleBootstrapState {
    OperatorRequired,
    Ready,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ConsoleBootstrapStatus {
    schema: &'static str,
    status: ConsoleBootstrapState,
    next_action: &'static str,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BootstrapRecoveryRequest {
    identifier: String,
    password: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct BootstrapRecoveryResponse {
    user_id: String,
    token: String,
    expires_at: DateTime<Utc>,
    authority: &'static str,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateConsoleUserRequest {
    identifier: String,
    password: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DisableConsoleUserRequest {
    reason: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleUserResponse {
    id: String,
    is_anonymous: bool,
    created_at: DateTime<Utc>,
    disabled_at: Option<DateTime<Utc>>,
    disabled_reason: Option<String>,
    disabled_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleUserListResponse {
    data: Vec<ConsoleUserResponse>,
    page: PageResponse,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleSessionResponse {
    id: String,
    user_id: String,
    device_id: Option<String>,
    client_ip: Option<String>,
    user_agent: Option<String>,
    created_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleSessionListResponse {
    data: Vec<ConsoleSessionResponse>,
    page: PageResponse,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct PageResponse {
    limit: i64,
    next_cursor: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListQuery {
    limit: Option<i64>,
    cursor: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleOrganizationResponse {
    id: String,
    name: String,
    slug: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    archived_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleOrganizationListResponse {
    data: Vec<ConsoleOrganizationResponse>,
    page: PageResponse,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleMembershipResponse {
    id: String,
    organization_id: String,
    auth_user_id: String,
    role_id: String,
    role_name: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    removed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleRoleResponse {
    id: String,
    organization_id: String,
    name: String,
    permissions: Vec<String>,
    system_key: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateOrganizationRequest {
    name: String,
    slug: String,
    owner_user_id: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateRoleRequest {
    name: String,
    permissions: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateRoleRequest {
    permissions: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateMembershipRequest {
    role_id: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateInvitationRequest {
    email: String,
    role_id: String,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleInvitationResponse {
    id: String,
    organization_id: String,
    email: String,
    role_id: String,
    token: String,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
enum ConsoleAdministratorRole {
    Superadmin,
    Administrator,
}

impl ConsoleAdministratorRole {
    fn as_str(self) -> &'static str {
        match self {
            Self::Superadmin => "superadmin",
            Self::Administrator => "administrator",
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GrantAdministratorRequest {
    user_id: String,
    role: ConsoleAdministratorRole,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleAdministratorResponse {
    user_id: String,
    role: ConsoleAdministratorRole,
    source: String,
    created_by: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
enum GrantSubjectType {
    User,
    Organization,
}

impl GrantSubjectType {
    fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Organization => "organization",
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateAccessGrantRequest {
    subject_type: GrantSubjectType,
    subject_id: String,
    service_id: String,
    capabilities: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct ConsoleAccessGrantResponse {
    id: String,
    subject_type: GrantSubjectType,
    subject_id: String,
    service_id: String,
    capabilities: Vec<String>,
    created_by: String,
    created_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
    revision: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct EffectiveAccessResponse {
    user_id: String,
    service_id: String,
    capabilities: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GrantListQuery {
    service_id: Option<String>,
}

#[utoipa::path(
    get,
    path = "/bootstrap/v1/status",
    operation_id = "console_get_bootstrap_status",
    tag = "console-bootstrap",
    responses((status = 200, body = ConsoleBootstrapStatus))
)]
async fn get_bootstrap_status(State(ctx): State<AppContext>) -> Response {
    match console_administrator_exists(&ctx).await {
        Ok(true) => (
            StatusCode::OK,
            axum::Json(ConsoleBootstrapStatus {
                schema: BOOTSTRAP_STATUS_SCHEMA,
                status: ConsoleBootstrapState::Ready,
                next_action: "Sign in with a Console Auth identity.",
            }),
        )
            .into_response(),
        Ok(false) => (
            StatusCode::OK,
            axum::Json(ConsoleBootstrapStatus {
                schema: BOOTSTRAP_STATUS_SCHEMA,
                status: ConsoleBootstrapState::OperatorRequired,
                next_action: "Set CONSOLE_RECOVERY_MODE=restore and call POST /bootstrap/v1/recovery with the local recovery token.",
            }),
        )
            .into_response(),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(serde_json::json!({
                "status": "unavailable",
                "message": "Console Access bootstrap state is unavailable"
            })),
        )
            .into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/bootstrap/v1/recovery",
    operation_id = "console_create_bootstrap_superadmin",
    tag = "console-bootstrap",
    request_body = BootstrapRecoveryRequest,
    responses(
        (status = 200, body = BootstrapRecoveryResponse),
        (status = 400, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 409, body = ErrorResponse),
        (status = 500, body = ErrorResponse)
    )
)]
async fn create_bootstrap_superadmin(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    HttpRequestContext(request_ctx): HttpRequestContext,
    JsonBody(input): JsonBody<BootstrapRecoveryRequest>,
) -> Result<Json<BootstrapRecoveryResponse>, ApiErrorResponse> {
    require_local_recovery(&headers, &request_ctx)?;
    if console_administrator_exists(&ctx)
        .await
        .map_err(|error| database_error(error, &request_ctx))?
    {
        return Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "Console Bootstrap Superadmin already exists",
            ),
            &request_ctx,
        ));
    }

    let now = ctx.clock.now();
    let password_config = AuthPasswordConfig::from_context(&ctx)
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    let user_id = ctx.ids.new_id("usr");
    let token = PasswordAuthRepository::new(ctx.db.clone())
        .register(
            &input.identifier,
            &input.password,
            user_id,
            ctx.ids.new_id("auth_identity"),
            ctx.ids.new_id("sess"),
            now,
            now + Duration::hours(SESSION_TTL_HOURS),
            &password_config,
        )
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    let (user_id, token, expires_at) = auth_token_parts(token);

    let inserted = sqlx::query(
        "insert into console.console_administrators
            (user_id, role, source, created_by, created_at)
         values ($1, 'superadmin', 'local_recovery', 'local_recovery', $2)
         on conflict (user_id) do nothing",
    )
    .bind(&user_id)
    .bind(now)
    .execute(&ctx.db)
    .await
    .map_err(|error| database_error(error, &request_ctx))?;
    if inserted.rows_affected() == 0 {
        return Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "Console Bootstrap Superadmin already exists",
            ),
            &request_ctx,
        ));
    }

    Ok(json(BootstrapRecoveryResponse {
        user_id,
        token,
        expires_at,
        authority: CONSOLE_SUPERADMIN_SCOPE,
    }))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/users",
    operation_id = "console_access_list_users",
    tag = "console-access",
    params(("limit" = Option<i64>, Query), ("cursor" = Option<String>, Query)),
    responses((status = 200, body = ConsoleUserListResponse, content_type = "application/json"))
)]
async fn list_console_users(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<ConsoleUserListResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_USERS_READ, &request_ctx).await?;
    let limit = bounded_limit(query.limit);
    let users = PostgresAuthUserRepository::new(ctx.db.clone())
        .list(limit + 1, query.cursor.as_deref())
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    let (users, next_cursor) = page_by_id(users, limit, |user| user.id.0.clone());
    Ok(json(ConsoleUserListResponse {
        data: users.into_iter().map(user_response).collect(),
        page: PageResponse { limit, next_cursor },
    }))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/users",
    operation_id = "console_access_create_user",
    tag = "console-access",
    request_body = CreateConsoleUserRequest,
    responses((status = 200, description = "Console user created"))
)]
async fn create_console_user(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    JsonBody(input): JsonBody<CreateConsoleUserRequest>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_USERS_MANAGE, &request_ctx).await?;
    let now = ctx.clock.now();
    let password_config = AuthPasswordConfig::from_context(&ctx)
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    let token = PasswordAuthRepository::new(ctx.db.clone())
        .register(
            &input.identifier,
            &input.password,
            ctx.ids.new_id("usr"),
            ctx.ids.new_id("auth_identity"),
            ctx.ids.new_id("sess"),
            now,
            now + Duration::hours(SESSION_TTL_HOURS),
            &password_config,
        )
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    let (user_id, session_token, expires_at) = auth_token_parts(token);
    let user = PostgresAuthUserRepository::new(ctx.db.clone())
        .find_by_id(&AuthUserId(user_id.clone()))
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?
        .ok_or_else(|| {
            api_error(
                AppError::new(ErrorCode::Internal, "Created Console user is missing"),
                &request_ctx,
            )
        })?;
    Ok(json(serde_json::json!({
        "user": user_response(user),
        "session": {
            "token": session_token,
            "expires_at": expires_at,
        }
    })))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/users/{userId}",
    operation_id = "console_access_get_user",
    tag = "console-access",
    params(("userId" = String, Path)),
    responses((status = 200, body = ConsoleUserResponse))
)]
async fn get_console_user(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(user_id): Path<String>,
) -> Result<Json<ConsoleUserResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_USERS_READ, &request_ctx).await?;
    let user = PostgresAuthUserRepository::new(ctx.db.clone())
        .find_by_id(&AuthUserId(user_id))
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?
        .ok_or_else(|| {
            api_error(
                AppError::new(ErrorCode::NotFound, "Console user was not found"),
                &request_ctx,
            )
        })?;
    Ok(json(user_response(user)))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/users/{userId}/disable",
    operation_id = "console_access_disable_user",
    tag = "console-access",
    params(("userId" = String, Path)),
    request_body = DisableConsoleUserRequest,
    responses((status = 200, body = ConsoleUserResponse))
)]
async fn disable_console_user(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(user_id): Path<String>,
    JsonBody(input): JsonBody<DisableConsoleUserRequest>,
) -> Result<Json<ConsoleUserResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_USERS_MANAGE, &request_ctx).await?;
    let changed = PostgresAuthUserRepository::new(ctx.db.clone())
        .set_user_disabled_at(
            &AuthUserId(user_id.clone()),
            Some(ctx.clock.now()),
            input.reason.as_deref(),
            None,
        )
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    if !changed {
        return Err(api_error(
            AppError::new(ErrorCode::NotFound, "Console user was not found"),
            &request_ctx,
        ));
    }
    get_console_user(
        State(ctx),
        actor,
        HttpRequestContext(request_ctx.clone()),
        Path(user_id),
    )
    .await
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/users/{userId}/enable",
    operation_id = "console_access_enable_user",
    tag = "console-access",
    params(("userId" = String, Path)),
    responses((status = 200, body = ConsoleUserResponse))
)]
async fn enable_console_user(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(user_id): Path<String>,
) -> Result<Json<ConsoleUserResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_USERS_MANAGE, &request_ctx).await?;
    let changed = PostgresAuthUserRepository::new(ctx.db.clone())
        .set_user_disabled_at(&AuthUserId(user_id.clone()), None, None, None)
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    if !changed {
        return Err(api_error(
            AppError::new(ErrorCode::NotFound, "Console user was not found"),
            &request_ctx,
        ));
    }
    get_console_user(
        State(ctx),
        actor,
        HttpRequestContext(request_ctx.clone()),
        Path(user_id),
    )
    .await
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/sessions",
    operation_id = "console_access_list_sessions",
    tag = "console-access",
    params(("limit" = Option<i64>, Query), ("cursor" = Option<String>, Query)),
    responses((status = 200, body = ConsoleSessionListResponse))
)]
async fn list_console_sessions(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<ConsoleSessionListResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_SESSIONS_READ, &request_ctx).await?;
    let limit = bounded_limit(query.limit);
    let sessions = PostgresAuthUserRepository::new(ctx.db.clone())
        .list_sessions(limit + 1, query.cursor.as_deref())
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    let (sessions, next_cursor) = page_by_id(sessions, limit, |session| session.id.clone());
    Ok(json(ConsoleSessionListResponse {
        data: sessions.into_iter().map(session_response).collect(),
        page: PageResponse { limit, next_cursor },
    }))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/sessions/{sessionId}/revoke",
    operation_id = "console_access_revoke_session",
    tag = "console-access",
    params(("sessionId" = String, Path)),
    responses((status = 200, description = "Console session revoked"))
)]
async fn revoke_console_session(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(session_id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_SESSIONS_REVOKE, &request_ctx).await?;
    let revoked = PostgresAuthUserRepository::new(ctx.db.clone())
        .revoke_session_by_id(&session_id, ctx.clock.now())
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    if !revoked {
        return Err(api_error(
            AppError::new(ErrorCode::NotFound, "Console session was not found"),
            &request_ctx,
        ));
    }
    Ok(json(serde_json::json!({
        "session_id": session_id,
        "revoked": true,
    })))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/organizations",
    operation_id = "console_access_list_organizations",
    tag = "console-access",
    params(("limit" = Option<i64>, Query), ("cursor" = Option<String>, Query)),
    responses((status = 200, body = ConsoleOrganizationListResponse))
)]
async fn list_console_organizations(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Query(query): Query<ListQuery>,
) -> Result<Json<ConsoleOrganizationListResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_READ, &request_ctx).await?;
    let limit = bounded_limit(query.limit);
    let values = PostgresOrganizationRepository::new(ctx.db.clone())
        .list("organizations", limit + 1, query.cursor.as_deref())
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    let organizations = values
        .into_iter()
        .map(|value| decode_contract(value, &request_ctx))
        .collect::<Result<Vec<ConsoleOrganizationResponse>, _>>()?;
    let (organizations, next_cursor) =
        page_by_id(organizations, limit, |organization| organization.id.clone());
    Ok(json(ConsoleOrganizationListResponse {
        data: organizations,
        page: PageResponse { limit, next_cursor },
    }))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/organizations",
    operation_id = "console_access_create_organization",
    tag = "console-access",
    request_body = CreateOrganizationRequest,
    responses((status = 200, body = ConsoleOrganizationResponse))
)]
async fn create_console_organization(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    JsonBody(input): JsonBody<CreateOrganizationRequest>,
) -> Result<Json<ConsoleOrganizationResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_MANAGE, &request_ctx).await?;
    let owner_id = input.owner_user_id.unwrap_or_else(|| actor.user_id.clone());
    ensure_auth_user(&ctx, &owner_id, &request_ctx).await?;
    let organization = organization::public::create_organization_with_owner(
        &ctx.db,
        &input.name,
        &input.slug,
        &AuthUserId(owner_id),
        ctx.clock.now(),
    )
    .await
    .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    Ok(json(organization_response(organization)))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/organizations/{organizationId}/members",
    operation_id = "console_access_list_organization_members",
    tag = "console-access",
    params(("organizationId" = String, Path)),
    responses((status = 200, description = "Console organization members"))
)]
async fn list_organization_members(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(organization_id): Path<String>,
) -> Result<Json<Vec<ConsoleMembershipResponse>>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_READ, &request_ctx).await?;
    let members = PostgresOrganizationRepository::new(ctx.db.clone())
        .list_members(&organization_id)
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    Ok(json(members.into_iter().map(membership_response).collect()))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/organizations/{organizationId}/roles",
    operation_id = "console_access_list_organization_roles",
    tag = "console-access",
    params(("organizationId" = String, Path)),
    responses((status = 200, description = "Console organization roles"))
)]
async fn list_organization_roles(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(organization_id): Path<String>,
) -> Result<Json<Vec<ConsoleRoleResponse>>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_READ, &request_ctx).await?;
    let roles = PostgresOrganizationRepository::new(ctx.db.clone())
        .list("roles", 1000, None)
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?
        .into_iter()
        .filter(|role| {
            role.get("organization_id").and_then(Value::as_str) == Some(&organization_id)
        })
        .map(|value| decode_contract(value, &request_ctx))
        .collect::<Result<Vec<ConsoleRoleResponse>, _>>()?;
    Ok(json(roles))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/organizations/{organizationId}/roles",
    operation_id = "console_access_create_organization_role",
    tag = "console-access",
    params(("organizationId" = String, Path)),
    request_body = CreateRoleRequest,
    responses((status = 200, body = ConsoleRoleResponse))
)]
async fn create_organization_role(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(organization_id): Path<String>,
    JsonBody(input): JsonBody<CreateRoleRequest>,
) -> Result<Json<ConsoleRoleResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_MANAGE, &request_ctx).await?;
    let role = PostgresOrganizationRepository::new(ctx.db.clone())
        .create_role(
            &organization_id,
            &input.name,
            &input.permissions,
            ctx.clock.now(),
        )
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    Ok(json(role_response(role)))
}

#[utoipa::path(
    patch,
    path = "/api/console/v1/access/roles/{roleId}",
    operation_id = "console_access_update_organization_role",
    tag = "console-access",
    params(("roleId" = String, Path)),
    request_body = UpdateRoleRequest,
    responses((status = 200, description = "Console organization role updated"))
)]
async fn update_organization_role(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(role_id): Path<String>,
    JsonBody(input): JsonBody<UpdateRoleRequest>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_MANAGE, &request_ctx).await?;
    let updated = PostgresOrganizationRepository::new(ctx.db.clone())
        .update_role_permissions(&role_id, &input.permissions, ctx.clock.now())
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    if !updated {
        return Err(api_error(
            AppError::new(
                ErrorCode::NotFound,
                "Console organization role was not found",
            ),
            &request_ctx,
        ));
    }
    Ok(json(
        serde_json::json!({ "role_id": role_id, "updated": true }),
    ))
}

#[utoipa::path(
    patch,
    path = "/api/console/v1/access/memberships/{membershipId}",
    operation_id = "console_access_update_organization_membership",
    tag = "console-access",
    params(("membershipId" = String, Path)),
    request_body = UpdateMembershipRequest,
    responses((status = 200, description = "Console organization membership updated"))
)]
async fn update_organization_membership(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(membership_id): Path<String>,
    JsonBody(input): JsonBody<UpdateMembershipRequest>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_MANAGE, &request_ctx).await?;
    let updated = PostgresOrganizationRepository::new(ctx.db.clone())
        .update_member_role(&membership_id, &input.role_id, ctx.clock.now())
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    if !updated {
        return Err(api_error(
            AppError::new(
                ErrorCode::NotFound,
                "Console organization membership was not found",
            ),
            &request_ctx,
        ));
    }
    Ok(json(serde_json::json!({
        "membership_id": membership_id,
        "role_id": input.role_id,
        "updated": true,
    })))
}

#[utoipa::path(
    delete,
    path = "/api/console/v1/access/memberships/{membershipId}",
    operation_id = "console_access_remove_organization_membership",
    tag = "console-access",
    params(("membershipId" = String, Path)),
    responses((status = 200, description = "Console organization membership removed"))
)]
async fn remove_organization_membership(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(membership_id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_MANAGE, &request_ctx).await?;
    let removed = PostgresOrganizationRepository::new(ctx.db.clone())
        .remove_member(&membership_id, ctx.clock.now())
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    if !removed {
        return Err(api_error(
            AppError::new(
                ErrorCode::NotFound,
                "Console organization membership was not found",
            ),
            &request_ctx,
        ));
    }
    Ok(json(serde_json::json!({
        "membership_id": membership_id,
        "removed": true,
    })))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/organizations/{organizationId}/invitations",
    operation_id = "console_access_create_organization_invitation",
    tag = "console-access",
    params(("organizationId" = String, Path)),
    request_body = CreateInvitationRequest,
    responses((status = 200, body = ConsoleInvitationResponse))
)]
async fn create_organization_invitation(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(organization_id): Path<String>,
    JsonBody(input): JsonBody<CreateInvitationRequest>,
) -> Result<Json<ConsoleInvitationResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ORGANIZATIONS_MANAGE, &request_ctx).await?;
    let invitation = PostgresOrganizationRepository::new(ctx.db.clone())
        .create_invitation(
            &organization_id,
            &input.email,
            &input.role_id,
            input.expires_at,
            ctx.clock.now(),
        )
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, &request_ctx))?;
    Ok(json(ConsoleInvitationResponse {
        id: invitation.invitation.id,
        organization_id: invitation.invitation.organization_id,
        email: invitation.invitation.email,
        role_id: invitation.invitation.role_id,
        token: invitation.token,
        expires_at: invitation.invitation.expires_at,
    }))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/administrators",
    operation_id = "console_access_list_administrators",
    tag = "console-access",
    responses((status = 200, description = "Console administrators"))
)]
async fn list_console_administrators(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
) -> Result<Json<Vec<ConsoleAdministratorResponse>>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ACCESS_READ, &request_ctx).await?;
    let rows = sqlx::query(
        "select user_id, role, source, created_by, created_at
         from console.console_administrators order by user_id",
    )
    .fetch_all(&ctx.db)
    .await
    .map_err(|error| database_error(error, &request_ctx))?;
    rows.into_iter()
        .map(|row| administrator_response(&row, &request_ctx))
        .collect::<Result<Vec<_>, _>>()
        .map(json)
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/administrators",
    operation_id = "console_access_grant_administrator",
    tag = "console-access",
    request_body = GrantAdministratorRequest,
    responses((status = 200, description = "Console administrator authority granted"))
)]
async fn grant_console_administrator(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    JsonBody(input): JsonBody<GrantAdministratorRequest>,
) -> Result<Json<ConsoleAdministratorResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ACCESS_MANAGE, &request_ctx).await?;
    ensure_auth_user(&ctx, &input.user_id, &request_ctx).await?;
    let row = sqlx::query(
        "insert into console.console_administrators
            (user_id, role, source, created_by, created_at)
         values ($1, $2, 'administrative', $3, $4)
         on conflict (user_id) do update set
            role = excluded.role,
            source = excluded.source,
            created_by = excluded.created_by,
            created_at = excluded.created_at
         returning user_id, role, source, created_by, created_at",
    )
    .bind(&input.user_id)
    .bind(input.role.as_str())
    .bind(&actor.user_id)
    .bind(ctx.clock.now())
    .fetch_one(&ctx.db)
    .await
    .map_err(|error| database_error(error, &request_ctx))?;
    Ok(json(administrator_response(&row, &request_ctx)?))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/administrators/{userId}/revoke",
    operation_id = "console_access_revoke_administrator",
    tag = "console-access",
    params(("userId" = String, Path)),
    responses((status = 200, description = "Console administrator authority revoked"))
)]
async fn revoke_console_administrator(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(user_id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_ACCESS_MANAGE, &request_ctx).await?;
    if user_id == actor.user_id {
        return Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "A Console administrator cannot revoke their own authority",
            ),
            &request_ctx,
        ));
    }
    let result = sqlx::query("delete from console.console_administrators where user_id = $1")
        .bind(&user_id)
        .execute(&ctx.db)
        .await
        .map_err(|error| database_error(error, &request_ctx))?;
    if result.rows_affected() == 0 {
        return Err(api_error(
            AppError::new(ErrorCode::NotFound, "Console administrator was not found"),
            &request_ctx,
        ));
    }
    Ok(json(serde_json::json!({
        "user_id": user_id,
        "revoked": true,
    })))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/grants",
    operation_id = "console_access_list_managed_service_grants",
    tag = "console-access",
    params(("service_id" = Option<String>, Query)),
    responses((status = 200, description = "Managed Service Access Grants"))
)]
async fn list_access_grants(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Query(query): Query<GrantListQuery>,
) -> Result<Json<Vec<ConsoleAccessGrantResponse>>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_GRANTS_READ, &request_ctx).await?;
    let rows = match query.service_id.as_deref() {
        Some(service_id) => {
            sqlx::query(
                "select id, subject_type, subject_id, service_id, capabilities,
                    created_by, created_at, revoked_at, revision
             from console.managed_service_access_grants
             where service_id = $1 order by id",
            )
            .bind(service_id)
            .fetch_all(&ctx.db)
            .await
        }
        None => {
            sqlx::query(
                "select id, subject_type, subject_id, service_id, capabilities,
                    created_by, created_at, revoked_at, revision
             from console.managed_service_access_grants order by id",
            )
            .fetch_all(&ctx.db)
            .await
        }
    }
    .map_err(|error| database_error(error, &request_ctx))?;
    rows.into_iter()
        .map(|row| access_grant_response(&row, &request_ctx))
        .collect::<Result<Vec<_>, _>>()
        .map(json)
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/grants",
    operation_id = "console_access_create_managed_service_grant",
    tag = "console-access",
    request_body = CreateAccessGrantRequest,
    responses((status = 200, description = "Managed Service Access Grant created"))
)]
async fn create_access_grant(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    JsonBody(input): JsonBody<CreateAccessGrantRequest>,
) -> Result<Json<ConsoleAccessGrantResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_GRANTS_MANAGE, &request_ctx).await?;
    let service_id = normalize_required(&input.service_id, "service_id", &request_ctx)?;
    if service_id == CONSOLE_SERVICE_ID {
        return Err(api_error(
            AppError::new(
                ErrorCode::Validation,
                "Console Service cannot be a Managed Service Access Grant target",
            ),
            &request_ctx,
        ));
    }
    ensure_managed_service_target(&ctx, &service_id, &request_ctx).await?;
    let subject_id = normalize_required(&input.subject_id, "subject_id", &request_ctx)?;
    ensure_grant_subject(&ctx, input.subject_type, &subject_id, &request_ctx).await?;
    let capabilities = normalized_capabilities(&input.capabilities, &request_ctx)?;
    let subject_type = input.subject_type.as_str();
    let duplicate = sqlx::query_scalar::<_, Option<String>>(
        "select id from console.managed_service_access_grants
         where subject_type = $1 and subject_id = $2 and service_id = $3 and revoked_at is null",
    )
    .bind(subject_type)
    .bind(&subject_id)
    .bind(&service_id)
    .fetch_one(&ctx.db)
    .await
    .map_err(|error| database_error(error, &request_ctx))?;
    if duplicate.is_some() {
        return Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "An active Managed Service Access Grant already exists for this subject",
            ),
            &request_ctx,
        ));
    }
    let now = ctx.clock.now();
    let grant_id = ctx.ids.new_id("console_grant");
    let row = sqlx::query(
        "insert into console.managed_service_access_grants
            (id, subject_type, subject_id, service_id, capabilities, created_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, subject_type, subject_id, service_id, capabilities,
                   created_by, created_at, revoked_at, revision",
    )
    .bind(&grant_id)
    .bind(subject_type)
    .bind(&subject_id)
    .bind(&service_id)
    .bind(serde_json::to_value(&capabilities).expect("grant capabilities serialize"))
    .bind(&actor.user_id)
    .bind(now)
    .fetch_one(&ctx.db)
    .await
    .map_err(|error| database_error(error, &request_ctx))?;
    write_grant_audit(
        &ctx,
        &grant_id,
        "created",
        &actor.user_id,
        now,
        &request_ctx,
    )
    .await?;
    Ok(json(access_grant_response(&row, &request_ctx)?))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/access/grants/{grantId}/revoke",
    operation_id = "console_access_revoke_managed_service_grant",
    tag = "console-access",
    params(("grantId" = String, Path)),
    responses((status = 200, description = "Managed Service Access Grant revoked"))
)]
async fn revoke_access_grant(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(grant_id): Path<String>,
) -> Result<Json<ConsoleAccessGrantResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_GRANTS_MANAGE, &request_ctx).await?;
    let now = ctx.clock.now();
    let row = sqlx::query(
        "update console.managed_service_access_grants
         set revoked_at = $2, revision = revision + 1
         where id = $1 and revoked_at is null
         returning id, subject_type, subject_id, service_id, capabilities,
                   created_by, created_at, revoked_at, revision",
    )
    .bind(&grant_id)
    .bind(now)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|error| database_error(error, &request_ctx))?
    .ok_or_else(|| {
        api_error(
            AppError::new(
                ErrorCode::NotFound,
                "Managed Service Access Grant was not found",
            ),
            &request_ctx,
        )
    })?;
    write_grant_audit(
        &ctx,
        &grant_id,
        "revoked",
        &actor.user_id,
        now,
        &request_ctx,
    )
    .await?;
    Ok(json(access_grant_response(&row, &request_ctx)?))
}

#[utoipa::path(
    get,
    path = "/api/console/v1/access/effective/{serviceId}",
    operation_id = "console_access_get_effective_managed_service_access",
    tag = "console-access",
    params(("serviceId" = String, Path)),
    responses((status = 200, body = EffectiveAccessResponse))
)]
async fn get_effective_access(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(service_id): Path<String>,
) -> Result<Json<EffectiveAccessResponse>, ApiErrorResponse> {
    require_console_capability(&ctx, &actor, CONSOLE_GRANTS_READ, &request_ctx).await?;
    if service_id == CONSOLE_SERVICE_ID {
        return Err(api_error(
            AppError::new(
                ErrorCode::NotFound,
                "Console Service is not a Managed Service target",
            ),
            &request_ctx,
        ));
    }
    ensure_managed_service_target(&ctx, &service_id, &request_ctx).await?;
    let capabilities = effective_capabilities(&ctx, &actor, Some(&service_id))
        .await
        .map_err(|error| api_error(error, &request_ctx))?;
    Ok(json(EffectiveAccessResponse {
        user_id: actor.user_id,
        service_id,
        capabilities: capabilities.into_iter().collect(),
    }))
}

/// Check a Host-owned Console Access capability. The Auth resolver supplies
/// only the authenticated user identity; durable Console administrator
/// authority is owned by this module rather than Auth runtime configuration.
pub async fn has_console_capability(
    ctx: &AppContext,
    actor: &UserActor,
    required: &str,
) -> Result<bool, AppError> {
    if actor_has_scope(actor, required) {
        return Ok(true);
    }
    console_administrator_exists_for_user(ctx, &actor.user_id).await
}

pub async fn require_console_capability(
    ctx: &AppContext,
    actor: &UserActor,
    required: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if has_console_capability(ctx, actor, required)
        .await
        .map_err(|error| api_error(error, request_ctx))?
    {
        return Ok(());
    }
    Err(api_error(
        AppError::new(
            ErrorCode::Forbidden,
            format!("Missing Console Access capability: {required}"),
        ),
        request_ctx,
    ))
}

pub async fn has_managed_service_capability(
    ctx: &AppContext,
    actor: &UserActor,
    service_id: Option<&str>,
    required: &str,
) -> Result<bool, AppError> {
    let capabilities = effective_capabilities(ctx, actor, service_id).await?;
    Ok(capabilities.contains("*") || capabilities.contains(required))
}

pub async fn require_managed_service_capability(
    ctx: &AppContext,
    actor: &UserActor,
    service_id: Option<&str>,
    required: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if has_managed_service_capability(ctx, actor, service_id, required)
        .await
        .map_err(|error| api_error(error, request_ctx))?
    {
        return Ok(());
    }
    Err(api_error(
        AppError::new(
            ErrorCode::Forbidden,
            format!("Missing effective Managed Service Access capability: {required}"),
        ),
        request_ctx,
    ))
}

async fn effective_capabilities(
    ctx: &AppContext,
    actor: &UserActor,
    service_id: Option<&str>,
) -> Result<BTreeSet<String>, AppError> {
    let mut capabilities = actor.scopes.iter().cloned().collect::<BTreeSet<_>>();
    if console_administrator_exists_for_user(ctx, &actor.user_id).await? {
        capabilities.insert("*".to_owned());
    }

    let direct = grant_capabilities_for_subject(ctx, "user", &actor.user_id, service_id).await?;
    capabilities.extend(direct);
    let organizations =
        organization::public::list_user_organizations(&ctx.db, &AuthUserId(actor.user_id.clone()))
            .await
            .map_err(|error| {
                AppError::new(ErrorCode::Internal, "Console organization lookup failed")
                    .with_source(error)
            })?;
    for organization in organizations {
        capabilities.extend(
            grant_capabilities_for_subject(ctx, "organization", &organization.id, service_id)
                .await?,
        );
    }
    Ok(capabilities)
}

async fn grant_capabilities_for_subject(
    ctx: &AppContext,
    subject_type: &str,
    subject_id: &str,
    service_id: Option<&str>,
) -> Result<BTreeSet<String>, AppError> {
    let values = match service_id {
        Some(service_id) => sqlx::query_scalar::<_, Value>(
            "select capabilities from console.managed_service_access_grants
             where subject_type = $1 and subject_id = $2 and service_id = $3 and revoked_at is null",
        )
        .bind(subject_type)
        .bind(subject_id)
        .bind(service_id)
        .fetch_all(&ctx.db)
        .await,
        None => sqlx::query_scalar::<_, Value>(
            "select capabilities from console.managed_service_access_grants
             where subject_type = $1 and subject_id = $2 and revoked_at is null",
        )
        .bind(subject_type)
        .bind(subject_id)
        .fetch_all(&ctx.db)
        .await,
    }
    .map_err(|error| {
        AppError::new(ErrorCode::Internal, "Console access grant lookup failed")
            .with_source(error)
    })?;
    let mut capabilities = BTreeSet::new();
    for value in values {
        capabilities.extend(parse_capabilities(&value)?);
    }
    Ok(capabilities)
}

fn parse_capabilities(value: &Value) -> Result<BTreeSet<String>, AppError> {
    let Some(values) = value.as_array() else {
        return Err(AppError::new(
            ErrorCode::Internal,
            "Stored Console Access Grant capabilities are invalid",
        ));
    };
    let mut capabilities = BTreeSet::new();
    for value in values {
        let Some(capability) = value
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Err(AppError::new(
                ErrorCode::Internal,
                "Stored Console Access Grant capability is invalid",
            ));
        };
        capabilities.insert(capability.to_owned());
    }
    Ok(capabilities)
}

fn actor_has_scope(actor: &UserActor, required: &str) -> bool {
    actor.scopes.iter().any(|scope| {
        scope == required
            || scope == "*"
            || scope == CONSOLE_SUPERADMIN_SCOPE
            || scope == "console.admin"
    })
}

async fn console_administrator_exists(ctx: &AppContext) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar("select exists(select 1 from console.console_administrators)")
        .fetch_one(&ctx.db)
        .await
}

async fn console_administrator_exists_for_user(
    ctx: &AppContext,
    user_id: &str,
) -> Result<bool, AppError> {
    sqlx::query_scalar::<_, bool>(
        "select exists(select 1 from console.console_administrators where user_id = $1)",
    )
    .bind(user_id)
    .fetch_one(&ctx.db)
    .await
    .map_err(|error| {
        AppError::new(ErrorCode::Internal, "Console administrator lookup failed").with_source(error)
    })
}

fn require_local_recovery(
    headers: &HeaderMap,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if std::env::var(RECOVERY_MODE_ENV).ok().as_deref() != Some("restore") {
        return Err(api_error(
            AppError::new(
                ErrorCode::Forbidden,
                "Console Bootstrap recovery is available only in restore mode",
            ),
            request_ctx,
        ));
    }
    let Some(expected) = std::env::var(RECOVERY_TOKEN_ENV)
        .ok()
        .filter(|token| !token.trim().is_empty())
    else {
        return Err(api_error(
            AppError::new(
                ErrorCode::Forbidden,
                "Console Bootstrap recovery token is not configured",
            ),
            request_ctx,
        ));
    };
    let actual = headers
        .get(RECOVERY_TOKEN_HEADER)
        .and_then(|value| value.to_str().ok());
    if actual != Some(expected.as_str()) {
        return Err(api_error(
            AppError::new(
                ErrorCode::Forbidden,
                "Console Bootstrap recovery token is invalid",
            ),
            request_ctx,
        ));
    }
    Ok(())
}

async fn ensure_auth_user(
    ctx: &AppContext,
    user_id: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    let user = PostgresAuthUserRepository::new(ctx.db.clone())
        .find_by_id(&AuthUserId(user_id.to_owned()))
        .await
        .map_err(|error| ApiErrorResponse::with_context(error, request_ctx))?;
    if user.is_none() {
        return Err(api_error(
            AppError::new(ErrorCode::NotFound, "Console Auth user was not found"),
            request_ctx,
        ));
    }
    Ok(())
}

async fn ensure_grant_subject(
    ctx: &AppContext,
    subject_type: GrantSubjectType,
    subject_id: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    match subject_type {
        GrantSubjectType::User => ensure_auth_user(ctx, subject_id, request_ctx).await,
        GrantSubjectType::Organization => {
            let organization = PostgresOrganizationRepository::new(ctx.db.clone())
                .get("organizations", subject_id)
                .await
                .map_err(|error| ApiErrorResponse::with_context(error, request_ctx))?;
            if organization.is_none() {
                return Err(api_error(
                    AppError::new(ErrorCode::NotFound, "Console Organization was not found"),
                    request_ctx,
                ));
            }
            Ok(())
        }
    }
}

async fn ensure_managed_service_target(
    ctx: &AppContext,
    service_id: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    let exists = sqlx::query_scalar::<_, bool>(
        "select exists(
            select 1 from console.managed_services
            where service_id = $1 and service_id <> 'lenso-console'
        )",
    )
    .bind(service_id)
    .fetch_one(&ctx.db)
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    if !exists {
        return Err(api_error(
            AppError::new(ErrorCode::NotFound, "Managed Service was not found"),
            request_ctx,
        ));
    }
    Ok(())
}

fn normalized_capabilities(
    values: &[String],
    request_ctx: &RequestContext,
) -> Result<Vec<String>, ApiErrorResponse> {
    let mut capabilities = BTreeSet::new();
    for value in values {
        let value = value.trim();
        if value.is_empty() || value == "*" {
            return Err(api_error(
                AppError::new(
                    ErrorCode::Validation,
                    "Managed Service Access Grant capabilities must be explicit non-empty values",
                ),
                request_ctx,
            ));
        }
        capabilities.insert(value.to_owned());
    }
    if capabilities.is_empty() {
        return Err(api_error(
            AppError::new(
                ErrorCode::Validation,
                "Managed Service Access Grant requires at least one capability",
            ),
            request_ctx,
        ));
    }
    Ok(capabilities.into_iter().collect())
}

fn normalize_required(
    value: &str,
    field: &str,
    request_ctx: &RequestContext,
) -> Result<String, ApiErrorResponse> {
    let value = value.trim();
    if value.is_empty() {
        return Err(api_error(
            AppError::new(ErrorCode::Validation, format!("{field} is required")),
            request_ctx,
        ));
    }
    Ok(value.to_owned())
}

async fn write_grant_audit(
    ctx: &AppContext,
    grant_id: &str,
    action: &str,
    actor_user_id: &str,
    occurred_at: DateTime<Utc>,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    sqlx::query(
        "insert into console.managed_service_access_grant_audit
            (id, grant_id, action, actor_user_id, occurred_at)
         values ($1, $2, $3, $4, $5)",
    )
    .bind(ctx.ids.new_id("console_grant_audit"))
    .bind(grant_id)
    .bind(action)
    .bind(actor_user_id)
    .bind(occurred_at)
    .execute(&ctx.db)
    .await
    .map(|_| ())
    .map_err(|error| database_error(error, request_ctx))
}

fn user_response(user: AuthUser) -> ConsoleUserResponse {
    ConsoleUserResponse {
        id: user.id.0,
        is_anonymous: user.is_anonymous,
        created_at: user.created_at,
        disabled_at: user.disabled_at,
        disabled_reason: user.disabled_reason,
        disabled_until: user.disabled_until,
    }
}

fn session_response(session: AuthSessionRecord) -> ConsoleSessionResponse {
    ConsoleSessionResponse {
        id: session.id,
        user_id: session.user_id.0,
        device_id: session.device_id,
        client_ip: session.client_ip,
        user_agent: session.user_agent,
        created_at: session.created_at,
        expires_at: session.expires_at,
        revoked_at: session.revoked_at,
    }
}

fn organization_response(organization: Organization) -> ConsoleOrganizationResponse {
    ConsoleOrganizationResponse {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        created_at: organization.created_at,
        updated_at: organization.updated_at,
        archived_at: organization.archived_at,
    }
}

fn role_response(role: Role) -> ConsoleRoleResponse {
    ConsoleRoleResponse {
        id: role.id,
        organization_id: role.organization_id,
        name: role.name,
        permissions: role.permissions,
        system_key: role.system_key,
        created_at: role.created_at,
        updated_at: role.updated_at,
    }
}

fn membership_response(membership: Membership) -> ConsoleMembershipResponse {
    ConsoleMembershipResponse {
        id: membership.id,
        organization_id: membership.organization_id,
        auth_user_id: membership.auth_user_id.0,
        role_id: membership.role_id,
        role_name: membership.role_name,
        created_at: membership.created_at,
        updated_at: membership.updated_at,
        removed_at: membership.removed_at,
    }
}

fn administrator_response(
    row: &sqlx::postgres::PgRow,
    request_ctx: &RequestContext,
) -> Result<ConsoleAdministratorResponse, ApiErrorResponse> {
    let role: String = row_value(row, "role", request_ctx)?;
    let role = match role.as_str() {
        "superadmin" => ConsoleAdministratorRole::Superadmin,
        "administrator" => ConsoleAdministratorRole::Administrator,
        _ => return Err(stored_state_error("administrator role", request_ctx)),
    };
    Ok(ConsoleAdministratorResponse {
        user_id: row_value(row, "user_id", request_ctx)?,
        role,
        source: row_value(row, "source", request_ctx)?,
        created_by: row_value(row, "created_by", request_ctx)?,
        created_at: row_value(row, "created_at", request_ctx)?,
    })
}

fn access_grant_response(
    row: &sqlx::postgres::PgRow,
    request_ctx: &RequestContext,
) -> Result<ConsoleAccessGrantResponse, ApiErrorResponse> {
    let subject_type: String = row_value(row, "subject_type", request_ctx)?;
    let subject_type = match subject_type.as_str() {
        "user" => GrantSubjectType::User,
        "organization" => GrantSubjectType::Organization,
        _ => return Err(stored_state_error("grant subject type", request_ctx)),
    };
    let capabilities_value: Value = row_value(row, "capabilities", request_ctx)?;
    let capabilities = parse_capabilities(&capabilities_value)
        .map_err(|error| api_error(error, request_ctx))?
        .into_iter()
        .collect();
    Ok(ConsoleAccessGrantResponse {
        id: row_value(row, "id", request_ctx)?,
        subject_type,
        subject_id: row_value(row, "subject_id", request_ctx)?,
        service_id: row_value(row, "service_id", request_ctx)?,
        capabilities,
        created_by: row_value(row, "created_by", request_ctx)?,
        created_at: row_value(row, "created_at", request_ctx)?,
        revoked_at: row_value(row, "revoked_at", request_ctx)?,
        revision: row_value(row, "revision", request_ctx)?,
    })
}

fn decode_contract<T: DeserializeOwned>(
    value: Value,
    request_ctx: &RequestContext,
) -> Result<T, ApiErrorResponse> {
    serde_json::from_value(value).map_err(|error| {
        api_error(
            AppError::new(
                ErrorCode::Internal,
                "Organization administration contract is invalid",
            )
            .with_source(error),
            request_ctx,
        )
    })
}

fn auth_token_parts(token: AuthToken) -> (String, String, DateTime<Utc>) {
    match token {
        AuthToken::Session(session) => (session.user_id.0, session.token, session.expires_at),
        AuthToken::Jwt {
            user_id,
            token,
            expires_at,
        } => (user_id, token, expires_at),
    }
}

fn page_by_id<T>(
    mut values: Vec<T>,
    limit: i64,
    id: impl Fn(&T) -> String,
) -> (Vec<T>, Option<String>) {
    let limit = usize::try_from(limit).expect("page limit must be positive");
    let has_more = values.len() > limit;
    if has_more {
        values.truncate(limit);
    }
    let next_cursor = has_more.then(|| values.last().map(id)).flatten();
    (values, next_cursor)
}

fn bounded_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(50).clamp(1, 100)
}

fn row_value<T>(
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

fn stored_state_error(state: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::Internal,
            format!("Stored Console Access {state} is invalid"),
        ),
        request_ctx,
    )
}

fn database_error(error: sqlx::Error, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::Internal,
            "Console Access database operation failed",
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
    use super::*;
    use platform_core::{CorrelationId, RequestId};

    #[test]
    fn module_declares_console_owned_access_and_recovery_routes() {
        let module = linked_module();
        let manifest = (module.manifest)();

        assert_eq!(module.module_name, MODULE_NAME);
        assert!(
            manifest
                .requires
                .iter()
                .any(|requirement| requirement.module_id == "lenso/auth")
        );
        assert!(
            manifest
                .requires
                .iter()
                .any(|requirement| requirement.module_id == "lenso/organization")
        );
        assert!(
            manifest
                .http_routes
                .iter()
                .any(|route| route.path == "/bootstrap/v1/recovery")
        );
        assert!(
            manifest
                .http_routes
                .iter()
                .any(|route| route.path == "/api/console/v1/access/grants")
        );
        assert_eq!(manifest.console.len(), 1);
        assert!(matches!(
            &manifest.console[0].presentation,
            ConsoleSurfacePresentation::Declarative { .. }
        ));
    }

    #[test]
    fn grant_capabilities_are_explicit_and_deduplicated() {
        let request =
            RequestContext::new(RequestId::new("request"), CorrelationId::new("correlation"));
        let values = vec!["module.read".to_owned(), "module.read".to_owned()];
        assert_eq!(
            normalized_capabilities(&values, &request).unwrap(),
            ["module.read"]
        );
        assert!(normalized_capabilities(&["*".to_owned()], &request).is_err());
        assert!(normalized_capabilities(&[], &request).is_err());
    }

    #[test]
    fn actor_scope_matching_preserves_explicit_scope_compatibility() {
        let actor = UserActor {
            user_id: "operator".to_owned(),
            scopes: vec![CONSOLE_USERS_READ.to_owned()],
        };
        assert!(actor_has_scope(&actor, CONSOLE_USERS_READ));
        assert!(!actor_has_scope(&actor, CONSOLE_USERS_MANAGE));
        assert!(actor_has_scope(
            &UserActor {
                user_id: "superadmin".to_owned(),
                scopes: vec![CONSOLE_SUPERADMIN_SCOPE.to_owned()],
            },
            CONSOLE_GRANTS_MANAGE
        ));
    }
}
