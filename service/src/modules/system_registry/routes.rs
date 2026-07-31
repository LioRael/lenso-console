use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, JsonBody, OpenApiRouter, Path, RequestContext, State, UserActor,
    json, routes,
};
use lenso::system_plane::{
    Ed25519EnrollmentSigner, Ed25519EnrollmentTrustStore, EnrollmentCapabilityGrant,
    EnrollmentOffer, EnrollmentPolicyGrant, EnrollmentReceipt, EnrollmentSignature,
    EnrollmentSignatureAlgorithm, EnrollmentSigner, VerifiedEnrollmentExchange,
    enrollment_offer_digest, sign_enrollment_offer, verify_enrollment_exchange,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json as json_value};
use sqlx::{Executor, Postgres, Row, Transaction};
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;
use utoipa::ToSchema;

use super::{REGISTRY_ENROLL, REGISTRY_READ, REGISTRY_REVOKE};

const MAX_OFFER_LIFETIME_SECONDS: u64 = 3_600;
const MIN_OFFER_LIFETIME_SECONDS: u64 = 60;
const CONSOLE_SYSTEM_ID_ENV: &str = "LENSO_SYSTEM_ID";
const CONSOLE_PRINCIPAL_ENV: &str = "LENSO_CONSOLE_SERVICE_PRINCIPAL";
const CONSOLE_SIGNING_KEY_ID_ENV: &str = "LENSO_CONSOLE_ENROLLMENT_SIGNING_KEY_ID";
const CONSOLE_SIGNING_KEY_ENV: &str = "LENSO_CONSOLE_ENROLLMENT_SIGNING_KEY_BASE64URL";

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
const REVOKE_SERVICE_SQL: &str = "update console.managed_services \
    set enrollment_state = 'revoked', authorization_epoch = authorization_epoch + 1, \
        version = version + 1, updated_at = now() \
    where service_id = $1 and version = $2 and enrollment_state = 'active' \
    returning service_id, service_principal, base_url, enrollment_receipt_digest, \
        enrollment_grant_revision, authorization_epoch, enrollment_expires_at_unix_ms, \
        enrollment_state, connection_state, core_document, \
        core_observed_at::text as core_observed_at, last_error_code, version";

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RevokeEnrollmentRequest {
    expected_version: u64,
    reason: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateEnrollmentOfferRequest {
    expires_in_seconds: u64,
    requested_capabilities: Vec<EnrollmentCapabilityGrant>,
    requested_policy: EnrollmentPolicyGrant,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ServiceVerifyingKeyInput {
    key_id: String,
    public_key_base64url: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AcceptEnrollmentReceiptRequest {
    base_url: String,
    offer: EnrollmentOffer,
    receipt: EnrollmentReceipt,
    service_verifying_key: ServiceVerifyingKeyInput,
}

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
        .routes(routes!(create_enrollment_offer))
        .routes(routes!(accept_enrollment_receipt))
        .routes(routes!(list_managed_services))
        .routes(routes!(get_managed_service))
        .routes(routes!(revoke_enrollment))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/enrollment/offers",
    operation_id = "console_create_service_enrollment_offer",
    tag = "console-system-registry",
    request_body(content = CreateEnrollmentOfferRequest, content_type = "application/json"),
    responses(
        (status = 200, body = EnrollmentOffer, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 409, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn create_enrollment_offer(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    JsonBody(input): JsonBody<CreateEnrollmentOfferRequest>,
) -> Result<Json<EnrollmentOffer>, ApiErrorResponse> {
    require_scope(&actor, REGISTRY_ENROLL, &request_ctx)?;
    require_management_mutations_allowed(&request_ctx)?;
    let now_unix_ms = current_unix_ms(&request_ctx)?;
    let (signer, system_id, console_principal) =
        enrollment_signer().map_err(|message| configuration_error(message, &request_ctx))?;
    let offer = build_enrollment_offer(input, now_unix_ms, system_id, console_principal, &signer)
        .map_err(|message| validation_error(message, &request_ctx))?;
    let digest = enrollment_offer_digest(&offer);
    sqlx::query(
        "insert into console.enrollment_offers \
         (offer_digest, nonce, offer, expires_at_unix_ms, created_by) \
         values ($1, $2, $3, $4, $5)",
    )
    .bind(&digest)
    .bind(&offer.nonce)
    .bind(json_value!(&offer))
    .bind(storage_integer(
        offer.expires_at_unix_ms,
        "offer expiry",
        &request_ctx,
    )?)
    .bind(&actor.user_id)
    .execute(&ctx.db)
    .await
    .map_err(|error| {
        conflict_database_error(error, "Enrollment Offer already exists", &request_ctx)
    })?;
    Ok(json(offer))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/enrollment/accept",
    operation_id = "console_accept_service_enrollment_receipt",
    tag = "console-system-registry",
    request_body(content = AcceptEnrollmentReceiptRequest, content_type = "application/json"),
    responses(
        (status = 200, body = ManagedServiceResponse, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 409, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn accept_enrollment_receipt(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    JsonBody(input): JsonBody<AcceptEnrollmentReceiptRequest>,
) -> Result<Json<ManagedServiceResponse>, ApiErrorResponse> {
    require_scope(&actor, REGISTRY_ENROLL, &request_ctx)?;
    require_management_mutations_allowed(&request_ctx)?;
    let now_unix_ms = current_unix_ms(&request_ctx)?;
    let (signer, system_id, console_principal) =
        enrollment_signer().map_err(|message| configuration_error(message, &request_ctx))?;
    let service_key = decode_public_key(&input.service_verifying_key)
        .map_err(|message| validation_error(message, &request_ctx))?;
    let console_trust = Ed25519EnrollmentTrustStore::new([(
        signer.key_id().to_owned(),
        signer.verifying_key_bytes(),
    )])
    .map_err(|message| configuration_error(message, &request_ctx))?;
    let service_trust = Ed25519EnrollmentTrustStore::new([(
        input.service_verifying_key.key_id.clone(),
        service_key,
    )])
    .map_err(|message| validation_error(message, &request_ctx))?;
    let verified = verify_enrollment_exchange(
        &input.offer,
        &input.receipt,
        &console_trust,
        &service_trust,
        now_unix_ms,
    )
    .map_err(|_| validation_error("Enrollment exchange is invalid", &request_ctx))?;
    if verified.system_id != system_id || verified.console_service_principal != console_principal {
        return Err(validation_error(
            "Enrollment exchange targets a different Console System",
            &request_ctx,
        ));
    }
    if verified.managed_service_id == crate::composition::CONSOLE_SERVICE_ID
        || verified.managed_service_principal == console_principal
    {
        return Err(validation_error(
            "The Console Service cannot enroll itself",
            &request_ctx,
        ));
    }
    let base_url = normalize_base_url(&input.base_url)
        .map_err(|message| validation_error(message, &request_ctx))?;
    let offer_digest = enrollment_offer_digest(&input.offer);
    let mut tx = ctx
        .db
        .begin()
        .await
        .map_err(|error| database_error(error, &request_ctx))?;
    let stored_offer = sqlx::query(
        "select offer, accepted_service_id from console.enrollment_offers \
         where offer_digest = $1 for update",
    )
    .bind(&offer_digest)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| database_error(error, &request_ctx))?
    .ok_or_else(|| validation_error("Enrollment Offer is not registered", &request_ctx))?;
    let accepted_service_id: Option<String> = stored_offer
        .try_get("accepted_service_id")
        .map_err(|error| database_error(error, &request_ctx))?;
    let stored_offer_document: Value = stored_offer
        .try_get("offer")
        .map_err(|error| database_error(error, &request_ctx))?;
    if accepted_service_id.is_some() || stored_offer_document != json_value!(&input.offer) {
        return Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "Enrollment Offer is consumed or does not match",
            ),
            &request_ctx,
        ));
    }
    let service = insert_enrollment(
        &mut tx,
        &actor.user_id,
        &base_url,
        &input,
        &verified,
        &offer_digest,
        &request_ctx,
    )
    .await?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, &request_ctx))?;
    Ok(json(service))
}

fn build_enrollment_offer(
    input: CreateEnrollmentOfferRequest,
    now_unix_ms: u64,
    system_id: String,
    console_service_principal: String,
    signer: &Ed25519EnrollmentSigner,
) -> Result<EnrollmentOffer, &'static str> {
    if !(MIN_OFFER_LIFETIME_SECONDS..=MAX_OFFER_LIFETIME_SECONDS)
        .contains(&input.expires_in_seconds)
    {
        return Err("Enrollment Offer lifetime must be between 60 and 3600 seconds");
    }
    let lifetime_ms = input
        .expires_in_seconds
        .checked_mul(1_000)
        .ok_or("Enrollment Offer lifetime exceeds the supported range")?;
    let expires_at_unix_ms = now_unix_ms
        .checked_add(lifetime_ms)
        .ok_or("Enrollment Offer expiry exceeds the supported range")?;
    let nonce = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 24]>());
    sign_enrollment_offer(
        EnrollmentOffer {
            protocol: String::new(),
            system_id,
            console_service_principal,
            nonce,
            issued_at_unix_ms: now_unix_ms,
            expires_at_unix_ms,
            requested_capabilities: input.requested_capabilities,
            requested_policy: input.requested_policy,
            signature: EnrollmentSignature {
                algorithm: EnrollmentSignatureAlgorithm::Ed25519,
                key_id: String::new(),
                subject_digest: String::new(),
                value: String::new(),
            },
        },
        signer,
    )
    .map_err(|_| "Enrollment Offer contract is invalid")
}

fn enrollment_signer() -> Result<(Ed25519EnrollmentSigner, String, String), String> {
    let system_id = required_environment(CONSOLE_SYSTEM_ID_ENV)?;
    let console_principal = required_environment(CONSOLE_PRINCIPAL_ENV)?;
    let key_id = required_environment(CONSOLE_SIGNING_KEY_ID_ENV)?;
    let encoded_secret = required_environment(CONSOLE_SIGNING_KEY_ENV)?;
    let decoded = URL_SAFE_NO_PAD
        .decode(&encoded_secret)
        .map_err(|_| format!("{CONSOLE_SIGNING_KEY_ENV} is not canonical base64url"))?;
    let secret_key: [u8; 32] = decoded
        .try_into()
        .map_err(|_| format!("{CONSOLE_SIGNING_KEY_ENV} must contain exactly 32 bytes"))?;
    let signer = Ed25519EnrollmentSigner::new(key_id, secret_key)
        .map_err(|_| "Console enrollment signing key configuration is invalid".to_owned())?;
    Ok((signer, system_id, console_principal))
}

fn required_environment(name: &str) -> Result<String, String> {
    let value = std::env::var(name).map_err(|_| format!("{name} is required"))?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{name} must not be empty"));
    }
    Ok(trimmed.to_owned())
}

fn decode_public_key(input: &ServiceVerifyingKeyInput) -> Result<[u8; 32], &'static str> {
    if input.key_id.trim().is_empty() {
        return Err("Service enrollment verifying key identity is required");
    }
    let decoded = URL_SAFE_NO_PAD
        .decode(&input.public_key_base64url)
        .map_err(|_| "Service enrollment verifying key is not canonical base64url")?;
    if URL_SAFE_NO_PAD.encode(&decoded) != input.public_key_base64url {
        return Err("Service enrollment verifying key is not canonical base64url");
    }
    decoded
        .try_into()
        .map_err(|_| "Service enrollment verifying key must contain exactly 32 bytes")
}

fn normalize_base_url(value: &str) -> Result<String, &'static str> {
    let mut url = Url::parse(value).map_err(|_| "Managed Service base URL is invalid")?;
    let loopback = url
        .host_str()
        .is_some_and(|host| matches!(host, "localhost" | "127.0.0.1" | "::1"));
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err("Managed Service base URL requires HTTPS outside loopback development");
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Managed Service base URL must not contain credentials");
    }
    url.set_fragment(None);
    url.set_query(None);
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path());
        url.set_path(&path);
    }
    Ok(url.to_string())
}

fn current_unix_ms(request_ctx: &RequestContext) -> Result<u64, ApiErrorResponse> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            api_error(
                AppError::new(ErrorCode::Internal, "System clock is before the Unix epoch")
                    .with_source(error),
                request_ctx,
            )
        })?;
    u64::try_from(elapsed.as_millis()).map_err(|error| {
        api_error(
            AppError::new(ErrorCode::Internal, "System clock exceeds enrollment range")
                .with_source(error),
            request_ctx,
        )
    })
}

async fn insert_enrollment(
    tx: &mut Transaction<'_, Postgres>,
    actor_user_id: &str,
    base_url: &str,
    input: &AcceptEnrollmentReceiptRequest,
    verified: &VerifiedEnrollmentExchange,
    offer_digest: &str,
    request_ctx: &RequestContext,
) -> Result<ManagedServiceResponse, ApiErrorResponse> {
    let grant_revision = storage_integer(verified.grant_revision, "grant revision", request_ctx)?;
    let authorization_epoch = storage_integer(
        verified.authorization_epoch,
        "authorization epoch",
        request_ctx,
    )?;
    let expires_at = storage_integer(
        verified.expires_at_unix_ms,
        "enrollment expiry",
        request_ctx,
    )?;
    let row = sqlx::query(
        "insert into console.managed_services (\
            service_id, service_principal, base_url, enrollment_receipt_digest, \
            enrollment_grant_revision, authorization_epoch, enrollment_expires_at_unix_ms, \
            enrollment_state, connection_state\
         ) values ($1, $2, $3, $4, $5, $6, $7, 'active', 'never_observed') \
         returning service_id, service_principal, base_url, enrollment_receipt_digest, \
            enrollment_grant_revision, authorization_epoch, enrollment_expires_at_unix_ms, \
            enrollment_state, connection_state, core_document, \
            core_observed_at::text as core_observed_at, last_error_code, version",
    )
    .bind(&verified.managed_service_id)
    .bind(&verified.managed_service_principal)
    .bind(base_url)
    .bind(&verified.receipt_digest)
    .bind(grant_revision)
    .bind(authorization_epoch)
    .bind(expires_at)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| {
        conflict_database_error(error, "Managed Service is already enrolled", request_ctx)
    })?;
    tx.execute(
        sqlx::query(
            "insert into console.enrollment_records (\
                service_id, system_id, managed_service_revision, offer_digest, offer, receipt, \
                service_verifying_key_id, service_verifying_key_base64url, \
                granted_capabilities, granted_policy\
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(&verified.managed_service_id)
        .bind(&verified.system_id)
        .bind(&verified.managed_service_revision)
        .bind(offer_digest)
        .bind(json_value!(&input.offer))
        .bind(json_value!(&input.receipt))
        .bind(&input.service_verifying_key.key_id)
        .bind(&input.service_verifying_key.public_key_base64url)
        .bind(json_value!(&verified.granted_capabilities))
        .bind(json_value!(&verified.granted_policy)),
    )
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    tx.execute(
        sqlx::query(
            "update console.enrollment_offers set accepted_service_id = $2, accepted_at = now() \
             where offer_digest = $1 and accepted_service_id is null",
        )
        .bind(offer_digest)
        .bind(&verified.managed_service_id),
    )
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    tx.execute(
        sqlx::query(
            "insert into console.system_registry_audit \
             (service_id, event_type, actor_user_id, evidence) \
             values ($1, 'enrollment_accepted', $2, $3)",
        )
        .bind(&verified.managed_service_id)
        .bind(actor_user_id)
        .bind(json_value!({
            "offerDigest": verified.offer_digest,
            "receiptDigest": verified.receipt_digest,
            "grantRevision": verified.grant_revision,
            "authorizationEpoch": verified.authorization_epoch
        })),
    )
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    managed_service_from_row(&row, request_ctx)
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

#[utoipa::path(
    post,
    path = "/api/console/v1/services/{serviceId}/enrollment/revoke",
    operation_id = "console_revoke_managed_service_enrollment",
    tag = "console-system-registry",
    params(("serviceId" = String, Path, description = "Managed Service identity")),
    request_body(content = RevokeEnrollmentRequest, content_type = "application/json"),
    responses(
        (status = 200, body = ManagedServiceResponse, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 409, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn revoke_enrollment(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Path(service_id): Path<String>,
    JsonBody(input): JsonBody<RevokeEnrollmentRequest>,
) -> Result<Json<ManagedServiceResponse>, ApiErrorResponse> {
    require_scope(&actor, REGISTRY_REVOKE, &request_ctx)?;
    require_management_mutations_allowed(&request_ctx)?;
    let reason = input.reason.trim();
    if reason.is_empty() {
        return Err(api_error(
            AppError::new(ErrorCode::Validation, "Revocation reason is required"),
            &request_ctx,
        ));
    }
    let expected_version = i64::try_from(input.expected_version).map_err(|error| {
        api_error(
            AppError::new(
                ErrorCode::Validation,
                "Expected version exceeds storage range",
            )
            .with_source(error),
            &request_ctx,
        )
    })?;
    let mut tx = ctx
        .db
        .begin()
        .await
        .map_err(|error| database_error(error, &request_ctx))?;
    let row = sqlx::query(REVOKE_SERVICE_SQL)
        .bind(&service_id)
        .bind(expected_version)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| database_error(error, &request_ctx))?
        .ok_or_else(|| {
            api_error(
                AppError::new(
                    ErrorCode::Conflict,
                    "Enrollment is missing, revoked, or changed concurrently",
                ),
                &request_ctx,
            )
        })?;
    append_audit(
        &mut tx,
        &service_id,
        &actor.user_id,
        reason,
        input.expected_version,
        &request_ctx,
    )
    .await?;
    let service = managed_service_from_row(&row, &request_ctx)?;
    tx.commit()
        .await
        .map_err(|error| database_error(error, &request_ctx))?;
    Ok(json(service))
}

fn require_management_mutations_allowed(
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    match crate::recovery_mode() {
        Ok(mode) if management_mutations_allowed(mode) => Ok(()),
        Ok(_) => Err(api_error(
            AppError::new(
                ErrorCode::Conflict,
                "Console recovery mode blocks management mutations",
            ),
            request_ctx,
        )),
        Err(_) => Err(api_error(
            AppError::new(
                ErrorCode::Internal,
                "Console recovery mode configuration is invalid",
            ),
            request_ctx,
        )),
    }
}

fn management_mutations_allowed(mode: crate::ConsoleRecoveryMode) -> bool {
    mode == crate::ConsoleRecoveryMode::Normal
}

async fn append_audit(
    tx: &mut Transaction<'_, Postgres>,
    service_id: &str,
    actor_user_id: &str,
    reason: &str,
    previous_version: u64,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    tx.execute(
        sqlx::query(
            "insert into console.system_registry_audit \
             (service_id, event_type, actor_user_id, evidence) \
             values ($1, 'enrollment_revoked', $2, $3)",
        )
        .bind(service_id)
        .bind(actor_user_id)
        .bind(json_value!({
            "reason": reason,
            "previousVersion": previous_version
        })),
    )
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    Ok(())
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

fn storage_integer(
    value: u64,
    field: &str,
    request_ctx: &RequestContext,
) -> Result<i64, ApiErrorResponse> {
    i64::try_from(value).map_err(|error| {
        api_error(
            AppError::new(
                ErrorCode::Validation,
                format!("Enrollment {field} exceeds the storage range"),
            )
            .with_source(error),
            request_ctx,
        )
    })
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

fn conflict_database_error(
    error: sqlx::Error,
    message: &str,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    if matches!(&error, sqlx::Error::Database(database) if database.is_unique_violation()) {
        return api_error(
            AppError::new(ErrorCode::Conflict, message).with_source(error),
            request_ctx,
        );
    }
    database_error(error, request_ctx)
}

fn validation_error(message: impl Into<String>, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(ErrorCode::Validation, message.into()),
        request_ctx,
    )
}

fn configuration_error(
    message: impl Into<String>,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    api_error(
        AppError::new(ErrorCode::Internal, message.into()),
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
            "/api/console/v1/enrollment/offers",
            "/api/console/v1/enrollment/accept",
            "/api/console/v1/services",
            "/api/console/v1/services/{serviceId}",
            "/api/console/v1/services/{serviceId}/enrollment/revoke",
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
    fn enrollment_base_url_requires_https_outside_loopback() {
        assert_eq!(
            normalize_base_url("https://service.example/system"),
            Ok("https://service.example/system/".to_owned())
        );
        assert_eq!(
            normalize_base_url("http://127.0.0.1:8080"),
            Ok("http://127.0.0.1:8080/".to_owned())
        );
        assert!(normalize_base_url("http://service.example").is_err());
        assert!(normalize_base_url("https://user:secret@service.example").is_err());
    }

    #[test]
    fn enrollment_offer_lifetime_is_bounded_and_signed() {
        let signer = Ed25519EnrollmentSigner::new("console-key", [7; 32]).unwrap();
        let request = |expires_in_seconds| CreateEnrollmentOfferRequest {
            expires_in_seconds,
            requested_capabilities: Vec::new(),
            requested_policy: EnrollmentPolicyGrant {
                policy_id: "default".to_owned(),
                policy_revision: "1".to_owned(),
                policy_digest: format!("sha256:{}", "a".repeat(64)),
            },
        };
        assert!(
            build_enrollment_offer(
                request(59),
                1_000,
                "system".to_owned(),
                "spiffe://console".to_owned(),
                &signer,
            )
            .is_err()
        );
        let offer = build_enrollment_offer(
            request(60),
            1_000,
            "system".to_owned(),
            "spiffe://console".to_owned(),
            &signer,
        )
        .unwrap();
        assert_eq!(offer.expires_at_unix_ms, 61_000);
        assert_eq!(offer.signature.key_id, "console-key");
        assert_eq!(
            offer.signature.subject_digest,
            enrollment_offer_digest(&offer)
        );
    }

    #[test]
    fn registry_permissions_are_operation_specific() {
        let reader = UserActor {
            user_id: "operator".to_owned(),
            scopes: vec![REGISTRY_READ.to_owned()],
        };
        assert!(has_scope(&reader, REGISTRY_READ));
        assert!(!has_scope(&reader, REGISTRY_ENROLL));
        assert!(!has_scope(&reader, REGISTRY_REVOKE));
    }

    #[test]
    fn recovery_mode_blocks_registry_mutations() {
        assert!(management_mutations_allowed(
            crate::ConsoleRecoveryMode::Normal
        ));
        assert!(!management_mutations_allowed(
            crate::ConsoleRecoveryMode::Restore
        ));
    }
}
