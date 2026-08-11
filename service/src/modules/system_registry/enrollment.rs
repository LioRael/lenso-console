use std::collections::BTreeSet;
use std::time::Duration;

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use lenso::host::http::{
    ApiErrorResponse, ApiOpenApiRouter, AppContext, AppError, ErrorCode, ErrorResponse,
    HttpRequestContext, Json, OpenApiRouter, RequestContext, State, UserActor, json, routes,
};
use lenso::system_plane::{
    CORE_PATH, CoreDocument, Ed25519EnrollmentTrustStore, EnrollmentOffer, EnrollmentReceipt,
    VerifiedEnrollmentExchange, validate_core_document, verify_enrollment_exchange,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Postgres, Row, Transaction};
use utoipa::ToSchema;

use crate::composition::CONSOLE_SERVICE_ID;
use crate::modules::console_access;

use super::connection::{SystemConnectRequest, SystemTopologyService};
use super::{MODULE_NAME, SYSTEM_CONNECT};

const MODULE_CONFIG_ALIAS: &str = "lenso-system-registry";
const ENROLLMENT_TRUST_CONFIG_KEY: &str = "enrollment_trust";
const CORE_RESPONSE_LIMIT: usize = 64 * 1024;

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnrollmentReceiptRegistrationRequest {
    pub offer: EnrollmentOffer,
    pub receipt: EnrollmentReceipt,
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EnrollmentReceiptRegistrationResponse {
    pub system_id: String,
    pub managed_service_id: String,
    pub managed_service_principal: String,
    pub managed_service_revision: String,
    pub offer_digest: String,
    pub receipt_digest: String,
    pub grant_revision: u64,
    pub authorization_epoch: u64,
    pub expires_at_unix_ms: u64,
    pub enrollment_state: &'static str,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EnrollmentTrustConfig {
    console_authority_keys: Vec<ConsoleAuthorityKey>,
    managed_service_keys: Vec<ManagedServiceKey>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsoleAuthorityKey {
    key_id: String,
    public_key_base64url: String,
    console_service_principal: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManagedServiceKey {
    key_id: String,
    public_key_base64url: String,
    system_id: String,
    managed_service_id: String,
    managed_service_principal: String,
    base_url: String,
    system_plane_bearer_token: String,
}

struct EnrollmentTrust {
    console: Ed25519EnrollmentTrustStore,
    service: Ed25519EnrollmentTrustStore,
    console_principals: Vec<(String, String)>,
    services: Vec<ManagedServiceKey>,
}

pub(super) struct VerifiedConnectionService {
    pub service_id: String,
    pub receipt_digest: String,
    pub row_version: i64,
    pub core_document: CoreDocument,
}

struct EnrollmentRowSnapshot {
    service_principal: String,
    base_url: String,
    receipt_digest: String,
    grant_revision: i64,
    authorization_epoch: i64,
    expires_at_unix_ms: i64,
    enrollment_state: String,
    row_version: i64,
    system_id: String,
    offer: Value,
    receipt: Value,
}

struct VerifiedStoredEnrollment {
    snapshot: EnrollmentRowSnapshot,
    verified: VerifiedEnrollmentExchange,
    trusted_service: ManagedServiceKey,
}

enum EnrollmentVerificationMoment {
    Fixed(u64),
    Current,
}

struct DiscoveryFailure {
    connection_state: &'static str,
    sanitized_reason: &'static str,
    response: ApiErrorResponse,
}

pub(super) fn router() -> ApiOpenApiRouter {
    OpenApiRouter::new().routes(routes!(register_enrollment_receipt))
}

#[utoipa::path(
    post,
    path = "/api/console/v1/enrollment-receipts",
    operation_id = "console_register_enrollment_receipt",
    tag = "console-system-enrollment",
    request_body = EnrollmentReceiptRegistrationRequest,
    responses(
        (status = 201, body = EnrollmentReceiptRegistrationResponse, content_type = "application/json"),
        (status = 400, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 401, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 403, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 409, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 502, body = ErrorResponse, content_type = "application/problem+json"),
        (status = 500, body = ErrorResponse, content_type = "application/problem+json")
    )
)]
async fn register_enrollment_receipt(
    State(ctx): State<AppContext>,
    actor: UserActor,
    HttpRequestContext(request_ctx): HttpRequestContext,
    Json(request): Json<EnrollmentReceiptRegistrationRequest>,
) -> Result<
    (
        axum::http::StatusCode,
        Json<EnrollmentReceiptRegistrationResponse>,
    ),
    ApiErrorResponse,
> {
    console_access::require_console_capability(&ctx, &actor, SYSTEM_CONNECT, &request_ctx).await?;
    let (verified, trusted_service) = verify_request(&ctx, &request, &request_ctx)?;
    let response = response_from_verified(&verified);
    persist_enrollment(
        &ctx,
        &actor,
        &request_ctx,
        request,
        &verified,
        &trusted_service.base_url,
    )
    .await?;
    Ok((axum::http::StatusCode::CREATED, json(response)))
}

fn verify_request(
    ctx: &AppContext,
    request: &EnrollmentReceiptRegistrationRequest,
    request_ctx: &RequestContext,
) -> Result<(VerifiedEnrollmentExchange, ManagedServiceKey), ApiErrorResponse> {
    let trust = enrollment_trust(ctx, request_ctx)?;
    let verified = verify_with_trust(
        &request.offer,
        &request.receipt,
        &trust,
        now_unix_ms(ctx, request_ctx)?,
        request_ctx,
    )?;
    let mut service = trusted_service(&trust, &request.receipt)
        .cloned()
        .ok_or_else(|| {
            forbidden_error(
                "Enrollment exchange signer is not allowed for the declared Service identity",
                request_ctx,
            )
        })?;
    let configured_base_url = normalize_loopback_base_url(&service.base_url)
        .map_err(|_| unavailable_trust_error(request_ctx))?;
    let requested_base_url = normalize_loopback_base_url(&request.base_url)
        .map_err(|message| api_error(AppError::new(ErrorCode::Validation, message), request_ctx))?;
    if service.system_id != verified.system_id || configured_base_url != requested_base_url {
        return Err(forbidden_error(
            "Enrollment exchange target does not match the server allowlist",
            request_ctx,
        ));
    }
    service.base_url = configured_base_url;
    Ok((verified, service))
}

fn verify_with_trust(
    offer: &EnrollmentOffer,
    receipt: &EnrollmentReceipt,
    trust: &EnrollmentTrust,
    now_unix_ms: u64,
    request_ctx: &RequestContext,
) -> Result<VerifiedEnrollmentExchange, ApiErrorResponse> {
    let console_identity_allowed = trust.console_principals.iter().any(|(key_id, principal)| {
        key_id == &offer.signature.key_id && principal == &offer.console_service_principal
    });
    if !console_identity_allowed || trusted_service(trust, receipt).is_none() {
        return Err(forbidden_error(
            "Enrollment exchange signer is not allowed for the declared Service identity",
            request_ctx,
        ));
    }
    verify_enrollment_exchange(offer, receipt, &trust.console, &trust.service, now_unix_ms).map_err(
        |_| {
            forbidden_error(
                "Signed Enrollment Offer and Receipt exchange was rejected",
                request_ctx,
            )
        },
    )
}

fn trusted_service<'a>(
    trust: &'a EnrollmentTrust,
    receipt: &EnrollmentReceipt,
) -> Option<&'a ManagedServiceKey> {
    trust.services.iter().find(|service| {
        service.key_id == receipt.signature.key_id
            && service.system_id == receipt.system_id
            && service.managed_service_id == receipt.managed_service_id
            && service.managed_service_principal == receipt.managed_service_principal
    })
}

fn enrollment_trust(
    ctx: &AppContext,
    request_ctx: &RequestContext,
) -> Result<EnrollmentTrust, ApiErrorResponse> {
    let config = ctx
        .config
        .modules
        .get(MODULE_NAME)
        .or_else(|| ctx.config.modules.get(MODULE_CONFIG_ALIAS))
        .and_then(|module| module.values.get(ENROLLMENT_TRUST_CONFIG_KEY))
        .cloned()
        .ok_or_else(|| unavailable_trust_error(request_ctx))?;
    let config: EnrollmentTrustConfig =
        serde_json::from_value(config).map_err(|_| unavailable_trust_error(request_ctx))?;
    if config.console_authority_keys.is_empty() || config.managed_service_keys.is_empty() {
        return Err(unavailable_trust_error(request_ctx));
    }

    let mut console_ids = BTreeSet::new();
    let mut console_key_material = BTreeSet::new();
    let mut console_service_principals = BTreeSet::new();
    let mut console_keys = Vec::with_capacity(config.console_authority_keys.len());
    let mut console_principals = Vec::with_capacity(config.console_authority_keys.len());
    for key in config.console_authority_keys {
        if key.key_id.trim().is_empty()
            || key.console_service_principal.trim().is_empty()
            || !console_ids.insert(key.key_id.clone())
        {
            return Err(unavailable_trust_error(request_ctx));
        }
        let verifying_key = decode_verifying_key(&key.public_key_base64url, request_ctx)?;
        console_key_material.insert(verifying_key);
        console_service_principals.insert(key.console_service_principal.clone());
        console_keys.push((key.key_id.clone(), verifying_key));
        console_principals.push((key.key_id, key.console_service_principal));
    }

    let mut service_key_ids = BTreeSet::new();
    let mut service_keys = Vec::with_capacity(config.managed_service_keys.len());
    for key in &config.managed_service_keys {
        let verifying_key = decode_verifying_key(&key.public_key_base64url, request_ctx)?;
        if key.key_id.trim().is_empty()
            || key.system_id.trim().is_empty()
            || key.managed_service_id.trim().is_empty()
            || key.managed_service_id == CONSOLE_SERVICE_ID
            || key.managed_service_principal.trim().is_empty()
            || console_ids.contains(&key.key_id)
            || console_key_material.contains(&verifying_key)
            || console_service_principals.contains(&key.managed_service_principal)
            || key.system_plane_bearer_token.trim().is_empty()
            || !service_key_ids.insert(key.key_id.clone())
            || core_url(&key.base_url).is_err()
        {
            return Err(unavailable_trust_error(request_ctx));
        }
        service_keys.push((key.key_id.clone(), verifying_key));
    }

    Ok(EnrollmentTrust {
        console: Ed25519EnrollmentTrustStore::new(console_keys)
            .map_err(|_| unavailable_trust_error(request_ctx))?,
        service: Ed25519EnrollmentTrustStore::new(service_keys)
            .map_err(|_| unavailable_trust_error(request_ctx))?,
        console_principals,
        services: config.managed_service_keys,
    })
}

fn decode_verifying_key(
    value: &str,
    request_ctx: &RequestContext,
) -> Result<[u8; 32], ApiErrorResponse> {
    let bytes = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| unavailable_trust_error(request_ctx))?;
    bytes
        .try_into()
        .map_err(|_| unavailable_trust_error(request_ctx))
}

async fn persist_enrollment(
    ctx: &AppContext,
    actor: &UserActor,
    request_ctx: &RequestContext,
    request: EnrollmentReceiptRegistrationRequest,
    verified: &VerifiedEnrollmentExchange,
    trusted_base_url: &str,
) -> Result<(), ApiErrorResponse> {
    let offer_json = serde_json::to_value(&request.offer).map_err(|error| {
        internal_source_error("Enrollment Offer could not be stored", error, request_ctx)
    })?;
    let receipt_json = serde_json::to_value(&request.receipt).map_err(|error| {
        internal_source_error("Enrollment Receipt could not be stored", error, request_ctx)
    })?;
    let mut transaction = ctx
        .db
        .begin()
        .await
        .map_err(|error| database_error(error, request_ctx))?;
    lock_enrollment_evidence(
        &mut transaction,
        verified,
        &request.receipt.nonce,
        request_ctx,
    )
    .await?;

    if let Some(row) = sqlx::query(
        "select exchange.managed_service_id, exchange.offer_digest, \
                exchange.receipt_digest, exchange.nonce, exchange.offer, exchange.receipt, \
                service.service_principal, service.base_url \
         from console.managed_service_enrollment_exchanges exchange \
         join console.managed_services service \
           on service.service_id = exchange.managed_service_id \
         where exchange.managed_service_id = $1 or service.service_principal = $2 \
            or exchange.offer_digest = $3 or exchange.receipt_digest = $4 \
            or exchange.nonce = $5 \
         order by exchange.managed_service_id limit 1",
    )
    .bind(&verified.managed_service_id)
    .bind(&verified.managed_service_principal)
    .bind(&verified.offer_digest)
    .bind(&verified.receipt_digest)
    .bind(&request.receipt.nonce)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| database_error(error, request_ctx))?
    {
        let stored_service_id: String = value(&row, "managed_service_id", request_ctx)?;
        let stored_principal: String = value(&row, "service_principal", request_ctx)?;
        let stored_offer_digest: String = value(&row, "offer_digest", request_ctx)?;
        let stored_receipt_digest: String = value(&row, "receipt_digest", request_ctx)?;
        let stored_nonce: String = value(&row, "nonce", request_ctx)?;
        let stored_offer: Value = value(&row, "offer", request_ctx)?;
        let stored_receipt: Value = value(&row, "receipt", request_ctx)?;
        let stored_base_url: String = value(&row, "base_url", request_ctx)?;
        if stored_service_id != verified.managed_service_id
            || stored_principal != verified.managed_service_principal
            || stored_offer_digest != verified.offer_digest
            || stored_receipt_digest != verified.receipt_digest
            || stored_nonce != request.receipt.nonce
            || stored_offer != offer_json
            || stored_receipt != receipt_json
            || stored_base_url != trusted_base_url
        {
            return Err(conflict_error(
                "Enrollment Receipt was already registered with different evidence",
                request_ctx,
            ));
        }
        transaction
            .commit()
            .await
            .map_err(|error| database_error(error, request_ctx))?;
        return Ok(());
    }

    insert_enrollment_exchange(
        &mut transaction,
        actor,
        request_ctx,
        verified,
        trusted_base_url,
        &request.receipt.nonce,
        (offer_json, receipt_json),
    )
    .await?;
    transaction
        .commit()
        .await
        .map_err(|error| database_error(error, request_ctx))?;
    Ok(())
}

async fn lock_enrollment_evidence(
    transaction: &mut Transaction<'_, Postgres>,
    verified: &VerifiedEnrollmentExchange,
    nonce: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    let mut identities = vec![
        format!("managed-service-id:{}", verified.managed_service_id),
        format!(
            "managed-service-principal:{}",
            verified.managed_service_principal
        ),
        format!("offer-digest:{}", verified.offer_digest),
        format!("receipt-digest:{}", verified.receipt_digest),
        format!("enrollment-nonce:{nonce}"),
    ];
    identities.sort();
    identities.dedup();
    for identity in identities {
        sqlx::query("select pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(identity)
            .execute(&mut **transaction)
            .await
            .map_err(|error| database_error(error, request_ctx))?;
    }
    Ok(())
}

async fn insert_enrollment_exchange(
    transaction: &mut Transaction<'_, Postgres>,
    actor: &UserActor,
    request_ctx: &RequestContext,
    verified: &VerifiedEnrollmentExchange,
    trusted_base_url: &str,
    nonce: &str,
    evidence: (Value, Value),
) -> Result<(), ApiErrorResponse> {
    let (offer_json, receipt_json) = evidence;
    let identity_conflict = sqlx::query_scalar::<_, String>(
        "select service_id from console.managed_services \
         where service_id = $1 or service_principal = $2 limit 1 for update",
    )
    .bind(&verified.managed_service_id)
    .bind(&verified.managed_service_principal)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    if identity_conflict.is_some() {
        return Err(conflict_error(
            "Managed Service already has enrollment evidence",
            request_ctx,
        ));
    }

    sqlx::query(
        "insert into console.managed_services ( \
            service_id, service_principal, base_url, enrollment_receipt_digest, \
            enrollment_grant_revision, authorization_epoch, enrollment_expires_at_unix_ms, \
            enrollment_state, connection_state \
         ) values ($1, $2, $3, $4, $5, $6, $7, 'active', 'never_observed')",
    )
    .bind(&verified.managed_service_id)
    .bind(&verified.managed_service_principal)
    .bind(trusted_base_url)
    .bind(&verified.receipt_digest)
    .bind(to_i64(
        verified.grant_revision,
        "grant revision",
        request_ctx,
    )?)
    .bind(to_i64(
        verified.authorization_epoch,
        "authorization epoch",
        request_ctx,
    )?)
    .bind(to_i64(
        verified.expires_at_unix_ms,
        "enrollment expiry",
        request_ctx,
    )?)
    .execute(&mut **transaction)
    .await
    .map_err(|error| enrollment_write_error(error, request_ctx))?;
    sqlx::query(
        "insert into console.managed_service_enrollment_exchanges ( \
            managed_service_id, system_id, offer_digest, receipt_digest, nonce, offer, receipt \
         ) values ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&verified.managed_service_id)
    .bind(&verified.system_id)
    .bind(&verified.offer_digest)
    .bind(&verified.receipt_digest)
    .bind(nonce)
    .bind(offer_json)
    .bind(receipt_json)
    .execute(&mut **transaction)
    .await
    .map_err(|error| enrollment_write_error(error, request_ctx))?;
    sqlx::query(
        "insert into console.system_registry_audit \
            (service_id, event_type, actor_user_id, evidence) \
         values ($1, 'enrollment_accepted', $2, $3)",
    )
    .bind(&verified.managed_service_id)
    .bind(&actor.user_id)
    .bind(serde_json::json!({
        "systemId": verified.system_id,
        "offerDigest": verified.offer_digest,
        "receiptDigest": verified.receipt_digest,
        "managedServicePrincipal": verified.managed_service_principal,
        "managedServiceRevision": verified.managed_service_revision,
        "grantRevision": verified.grant_revision,
        "authorizationEpoch": verified.authorization_epoch,
        "expiresAtUnixMs": verified.expires_at_unix_ms,
    }))
    .execute(&mut **transaction)
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    Ok(())
}

async fn verify_stored_enrollment(
    ctx: &AppContext,
    service_id: &str,
    verification_moment: EnrollmentVerificationMoment,
    inactive_message: &'static str,
    request_ctx: &RequestContext,
) -> Result<VerifiedStoredEnrollment, ApiErrorResponse> {
    let row = load_enrollment_row(ctx, service_id, request_ctx).await?;
    let snapshot = enrollment_snapshot(&row, request_ctx)?;
    if snapshot.enrollment_state != "active" {
        return Err(forbidden_error(inactive_message, request_ctx));
    }
    let exchange =
        serde_json::from_value::<EnrollmentOffer>(snapshot.offer.clone()).and_then(|offer| {
            serde_json::from_value::<EnrollmentReceipt>(snapshot.receipt.clone())
                .map(|receipt| (offer, receipt))
        });
    let Ok((offer, receipt)) = exchange else {
        persist_failed_observation(
            ctx,
            service_id,
            &snapshot.receipt_digest,
            snapshot.row_version,
            "incompatible",
            "Managed Service enrollment evidence is incompatible",
            request_ctx,
        )
        .await?;
        return Err(incompatible_discovery_error(
            "Managed Service enrollment evidence is incompatible",
            request_ctx,
        ));
    };
    let trust = match enrollment_trust(ctx, request_ctx) {
        Ok(trust) => trust,
        Err(error) => {
            persist_failed_observation(
                ctx,
                service_id,
                &snapshot.receipt_digest,
                snapshot.row_version,
                "unavailable",
                "Signed enrollment trust is unavailable",
                request_ctx,
            )
            .await?;
            return Err(error);
        }
    };
    let verification_time = match verification_moment {
        EnrollmentVerificationMoment::Fixed(value) => value,
        EnrollmentVerificationMoment::Current => now_unix_ms(ctx, request_ctx)?,
    };
    let Ok(verified) = verify_with_trust(&offer, &receipt, &trust, verification_time, request_ctx)
    else {
        persist_failed_observation(
            ctx,
            service_id,
            &snapshot.receipt_digest,
            snapshot.row_version,
            "incompatible",
            "Managed Service enrollment trust is incompatible",
            request_ctx,
        )
        .await?;
        return Err(incompatible_discovery_error(
            "Managed Service enrollment trust is incompatible",
            request_ctx,
        ));
    };
    let Some(trusted_service) = trusted_service(&trust, &receipt).cloned() else {
        persist_failed_observation(
            ctx,
            service_id,
            &snapshot.receipt_digest,
            snapshot.row_version,
            "incompatible",
            "Managed Service enrollment trust is incompatible",
            request_ctx,
        )
        .await?;
        return Err(incompatible_discovery_error(
            "Managed Service enrollment trust is incompatible",
            request_ctx,
        ));
    };
    Ok(VerifiedStoredEnrollment {
        snapshot,
        verified,
        trusted_service,
    })
}

pub(super) async fn verify_connection_services(
    ctx: &AppContext,
    request: &SystemConnectRequest,
    request_ctx: &RequestContext,
) -> Result<Vec<VerifiedConnectionService>, ApiErrorResponse> {
    let business_services = request
        .topology
        .services
        .iter()
        .filter(|service| {
            !super::connection::is_control_plane_authority(&request.topology, &service.service_id)
        })
        .collect::<Vec<_>>();
    if business_services.is_empty() {
        return Ok(Vec::new());
    }
    let now_unix_ms = now_unix_ms(ctx, request_ctx)?;
    let mut services = Vec::with_capacity(business_services.len());
    for topology_service in business_services {
        let stored = verify_stored_enrollment(
            ctx,
            &topology_service.service_id,
            EnrollmentVerificationMoment::Fixed(now_unix_ms),
            "System topology contains a Service without a signed active enrollment",
            request_ctx,
        )
        .await?;
        if validate_connection_binding(
            request,
            topology_service,
            &stored.verified,
            &stored.trusted_service,
            &stored.snapshot,
            request_ctx,
        )
        .is_err()
        {
            persist_failed_observation(
                ctx,
                &topology_service.service_id,
                &stored.snapshot.receipt_digest,
                stored.snapshot.row_version,
                "incompatible",
                "Managed Service enrollment binding is incompatible",
                request_ctx,
            )
            .await?;
            return Err(incompatible_discovery_error(
                "Managed Service enrollment binding is incompatible",
                request_ctx,
            ));
        }
        let core_document = match fetch_core_document(&stored.trusted_service, request_ctx).await {
            Ok(document) => document,
            Err(failure) => {
                persist_failed_observation(
                    ctx,
                    &topology_service.service_id,
                    &stored.snapshot.receipt_digest,
                    stored.snapshot.row_version,
                    failure.connection_state,
                    failure.sanitized_reason,
                    request_ctx,
                )
                .await?;
                return Err(failure.response);
            }
        };
        if validate_core_binding(
            &core_document,
            topology_service,
            &stored.verified,
            request_ctx,
        )
        .is_err()
        {
            persist_failed_observation(
                ctx,
                &topology_service.service_id,
                &stored.snapshot.receipt_digest,
                stored.snapshot.row_version,
                "incompatible",
                "Managed Service Core document is incompatible",
                request_ctx,
            )
            .await?;
            return Err(incompatible_discovery_error(
                "Managed Service Core document is incompatible",
                request_ctx,
            ));
        }
        services.push(VerifiedConnectionService {
            service_id: topology_service.service_id.clone(),
            receipt_digest: stored.verified.receipt_digest,
            row_version: stored.snapshot.row_version,
            core_document,
        });
    }
    Ok(services)
}

pub(crate) async fn validate_surface_authority(
    ctx: &AppContext,
    service_id: &str,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    let stored = verify_stored_enrollment(
        ctx,
        service_id,
        EnrollmentVerificationMoment::Current,
        "Managed Service does not have an active signed enrollment",
        request_ctx,
    )
    .await?;
    if !stored_enrollment_matches(
        service_id,
        &stored.verified,
        &stored.trusted_service,
        &stored.snapshot,
    ) {
        persist_failed_observation(
            ctx,
            service_id,
            &stored.snapshot.receipt_digest,
            stored.snapshot.row_version,
            "incompatible",
            "Managed Service enrollment binding is incompatible",
            request_ctx,
        )
        .await?;
        return Err(incompatible_discovery_error(
            "Managed Service enrollment binding is incompatible",
            request_ctx,
        ));
    }
    Ok(())
}

async fn load_enrollment_row(
    ctx: &AppContext,
    service_id: &str,
    request_ctx: &RequestContext,
) -> Result<sqlx::postgres::PgRow, ApiErrorResponse> {
    sqlx::query(
        "select service.service_principal, service.base_url, \
                service.enrollment_receipt_digest, service.enrollment_grant_revision, \
                service.authorization_epoch, service.enrollment_expires_at_unix_ms, \
                service.enrollment_state, service.version, exchange.system_id, exchange.offer, \
                exchange.receipt \
         from console.managed_services service \
         join console.managed_service_enrollment_exchanges exchange \
           on exchange.managed_service_id = service.service_id \
         where service.service_id = $1",
    )
    .bind(service_id)
    .fetch_optional(&ctx.db)
    .await
    .map_err(|error| database_error(error, request_ctx))?
    .ok_or_else(|| {
        forbidden_error(
            "System topology contains a Service without a signed active enrollment",
            request_ctx,
        )
    })
}

fn enrollment_snapshot(
    row: &sqlx::postgres::PgRow,
    request_ctx: &RequestContext,
) -> Result<EnrollmentRowSnapshot, ApiErrorResponse> {
    Ok(EnrollmentRowSnapshot {
        service_principal: value(row, "service_principal", request_ctx)?,
        base_url: value(row, "base_url", request_ctx)?,
        receipt_digest: value(row, "enrollment_receipt_digest", request_ctx)?,
        grant_revision: value(row, "enrollment_grant_revision", request_ctx)?,
        authorization_epoch: value(row, "authorization_epoch", request_ctx)?,
        expires_at_unix_ms: value(row, "enrollment_expires_at_unix_ms", request_ctx)?,
        enrollment_state: value(row, "enrollment_state", request_ctx)?,
        row_version: value(row, "version", request_ctx)?,
        system_id: value(row, "system_id", request_ctx)?,
        offer: value(row, "offer", request_ctx)?,
        receipt: value(row, "receipt", request_ctx)?,
    })
}

pub(super) async fn persist_connection_observations(
    transaction: &mut Transaction<'_, Postgres>,
    services: &[VerifiedConnectionService],
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    for service in services {
        let core_document = serde_json::to_value(&service.core_document).map_err(|error| {
            internal_source_error(
                "Managed Service Core document could not be stored",
                error,
                request_ctx,
            )
        })?;
        let result = sqlx::query(
            "update console.managed_services \
             set core_document = $3, core_observed_at = now(), connection_state = 'ready', \
                 last_error_code = null, version = version + 1, updated_at = now() \
             where service_id = $1 and enrollment_receipt_digest = $2 \
               and enrollment_state = 'active' and version = $4",
        )
        .bind(&service.service_id)
        .bind(&service.receipt_digest)
        .bind(core_document)
        .bind(service.row_version)
        .execute(&mut **transaction)
        .await
        .map_err(|error| database_error(error, request_ctx))?;
        if result.rows_affected() != 1 {
            return Err(conflict_error(
                "Managed Service enrollment changed while connecting the System",
                request_ctx,
            ));
        }
    }
    Ok(())
}

async fn persist_failed_observation(
    ctx: &AppContext,
    service_id: &str,
    receipt_digest: &str,
    row_version: i64,
    connection_state: &str,
    sanitized_reason: &str,
    request_ctx: &RequestContext,
) -> Result<bool, ApiErrorResponse> {
    let result = sqlx::query(
        "update console.managed_services \
         set core_document = null, core_observed_at = null, connection_state = $4, \
             last_error_code = $5, version = version + 1, updated_at = now() \
         where service_id = $1 and enrollment_receipt_digest = $2 \
           and version = $3 and enrollment_state = 'active'",
    )
    .bind(service_id)
    .bind(receipt_digest)
    .bind(row_version)
    .bind(connection_state)
    .bind(sanitized_reason)
    .execute(&ctx.db)
    .await
    .map_err(|error| database_error(error, request_ctx))?;
    Ok(result.rows_affected() == 1)
}

fn stored_enrollment_matches(
    service_id: &str,
    verified: &VerifiedEnrollmentExchange,
    trusted_service: &ManagedServiceKey,
    snapshot: &EnrollmentRowSnapshot,
) -> bool {
    verified.system_id == snapshot.system_id
        && trusted_service.system_id == snapshot.system_id
        && verified.managed_service_id == service_id
        && trusted_service.managed_service_id == service_id
        && verified.managed_service_principal == snapshot.service_principal
        && trusted_service.managed_service_principal == snapshot.service_principal
        && normalize_loopback_base_url(&trusted_service.base_url)
            .ok()
            .as_deref()
            == Some(snapshot.base_url.as_str())
        && verified.receipt_digest == snapshot.receipt_digest
        && i64::try_from(verified.grant_revision).ok() == Some(snapshot.grant_revision)
        && i64::try_from(verified.authorization_epoch).ok() == Some(snapshot.authorization_epoch)
        && i64::try_from(verified.expires_at_unix_ms).ok() == Some(snapshot.expires_at_unix_ms)
}

fn validate_connection_binding(
    request: &SystemConnectRequest,
    topology_service: &SystemTopologyService,
    verified: &VerifiedEnrollmentExchange,
    trusted_service: &ManagedServiceKey,
    snapshot: &EnrollmentRowSnapshot,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    let policy = &request.management_binding.policy;
    if verified.system_id != request.system_id
        || trusted_service.system_id != request.system_id
        || snapshot.system_id != request.system_id
        || verified.managed_service_id != topology_service.service_id
        || verified.managed_service_principal != topology_service.service_principal
        || snapshot.service_principal != topology_service.service_principal
        || verified.managed_service_revision != topology_service.revision.to_string()
        || normalize_loopback_base_url(&trusted_service.base_url)
            .ok()
            .as_deref()
            != Some(snapshot.base_url.as_str())
        || verified.receipt_digest != snapshot.receipt_digest
        || i64::try_from(verified.grant_revision).ok() != Some(snapshot.grant_revision)
        || i64::try_from(verified.authorization_epoch).ok() != Some(snapshot.authorization_epoch)
        || i64::try_from(verified.expires_at_unix_ms).ok() != Some(snapshot.expires_at_unix_ms)
        || verified.granted_policy.policy_id != policy.policy_id
        || verified.granted_policy.policy_revision != policy.revision.to_string()
        || verified.granted_policy.policy_digest != policy.digest
    {
        return Err(forbidden_error(
            "Management Binding does not match the exact signed Service enrollment",
            request_ctx,
        ));
    }
    Ok(())
}

fn validate_core_binding(
    core: &CoreDocument,
    topology_service: &SystemTopologyService,
    verified: &VerifiedEnrollmentExchange,
    request_ctx: &RequestContext,
) -> Result<(), ApiErrorResponse> {
    if !validate_core_document(core).is_empty()
        || core.service_id != topology_service.service_id
        || core.service_principal != topology_service.service_principal
        || core.service_revision != verified.managed_service_revision
    {
        return Err(forbidden_error(
            "Managed Service Core identity does not match the signed enrollment",
            request_ctx,
        ));
    }
    let all_grants_advertised = verified.granted_capabilities.iter().all(|grant| {
        core.capabilities.iter().any(|advertisement| {
            advertisement.contract_id == grant.contract_id
                && advertisement.schema_digest == grant.schema_digest
                && grant.feature_ids.is_subset(&advertisement.feature_ids)
        })
    });
    if !all_grants_advertised {
        return Err(forbidden_error(
            "Managed Service Core capabilities do not satisfy the signed enrollment",
            request_ctx,
        ));
    }
    Ok(())
}

fn normalize_loopback_base_url(base_url: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(base_url).map_err(|error| error.to_string())?;
    if url.scheme() != "http"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Local enrollment requires a loopback HTTP origin without credentials, query, or fragment"
                .to_owned(),
        );
    }
    let host = url.host_str().unwrap_or_default();
    if host.eq_ignore_ascii_case("localhost") {
        url.set_host(Some("127.0.0.1"))
            .map_err(|_| "Local enrollment base URL is invalid".to_owned())?;
    } else if !host
        .parse::<std::net::IpAddr>()
        .is_ok_and(|address| address.is_loopback())
    {
        return Err("Local enrollment allows only a loopback target".to_owned());
    }
    let path = url.path().trim_end_matches('/').to_owned();
    url.set_path(&path);
    Ok(url.to_string().trim_end_matches('/').to_owned())
}

fn core_url(base_url: &str) -> Result<String, String> {
    let normalized = normalize_loopback_base_url(base_url)?;
    let mut url = reqwest::Url::parse(&normalized).map_err(|error| error.to_string())?;
    url.set_path(CORE_PATH);
    Ok(url.to_string())
}

async fn fetch_core_document(
    service: &ManagedServiceKey,
    request_ctx: &RequestContext,
) -> Result<CoreDocument, DiscoveryFailure> {
    // `core_url` rewrites localhost to 127.0.0.1 and rejects every non-loopback
    // address before the target-scoped credential can leave this process.
    let url = core_url(&service.base_url).map_err(|_| DiscoveryFailure {
        connection_state: "incompatible",
        sanitized_reason: "Managed Service Core document is incompatible",
        response: incompatible_discovery_error(
            "Managed Service Core document is incompatible",
            request_ctx,
        ),
    })?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| {
            unavailable_core_failure(
                "Managed Service Core client is unavailable",
                error,
                request_ctx,
            )
        })?;
    let mut response = client
        .get(url)
        .bearer_auth(&service.system_plane_bearer_token)
        .send()
        .await
        .map_err(|error| {
            unavailable_core_failure(
                "Managed Service Core endpoint is unavailable",
                error,
                request_ctx,
            )
        })?;
    if !response.status().is_success() {
        return Err(DiscoveryFailure {
            connection_state: "unavailable",
            sanitized_reason: "Managed Service Core endpoint is unavailable",
            response: api_error(
                AppError::new(
                    ErrorCode::ExternalDependency,
                    "Managed Service Core endpoint is unavailable",
                )
                .retryable(),
                request_ctx,
            ),
        });
    }
    if response
        .content_length()
        .is_some_and(|length| length > CORE_RESPONSE_LIMIT as u64)
    {
        return Err(incompatible_core_failure(request_ctx));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| {
        unavailable_core_failure(
            "Managed Service Core response could not be read",
            error,
            request_ctx,
        )
    })? {
        if body.len().saturating_add(chunk.len()) > CORE_RESPONSE_LIMIT {
            return Err(incompatible_core_failure(request_ctx));
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| incompatible_core_failure(request_ctx))
}

fn unavailable_core_failure(
    message: &'static str,
    source: impl std::error::Error + Send + Sync + 'static,
    request_ctx: &RequestContext,
) -> DiscoveryFailure {
    DiscoveryFailure {
        connection_state: "unavailable",
        sanitized_reason: "Managed Service Core endpoint is unavailable",
        response: external_error(message, source, request_ctx),
    }
}

fn incompatible_core_failure(request_ctx: &RequestContext) -> DiscoveryFailure {
    DiscoveryFailure {
        connection_state: "incompatible",
        sanitized_reason: "Managed Service Core document is incompatible",
        response: incompatible_discovery_error(
            "Managed Service Core document is incompatible",
            request_ctx,
        ),
    }
}

fn response_from_verified(
    verified: &VerifiedEnrollmentExchange,
) -> EnrollmentReceiptRegistrationResponse {
    EnrollmentReceiptRegistrationResponse {
        system_id: verified.system_id.clone(),
        managed_service_id: verified.managed_service_id.clone(),
        managed_service_principal: verified.managed_service_principal.clone(),
        managed_service_revision: verified.managed_service_revision.clone(),
        offer_digest: verified.offer_digest.clone(),
        receipt_digest: verified.receipt_digest.clone(),
        grant_revision: verified.grant_revision,
        authorization_epoch: verified.authorization_epoch,
        expires_at_unix_ms: verified.expires_at_unix_ms,
        enrollment_state: "active",
    }
}

fn now_unix_ms(ctx: &AppContext, request_ctx: &RequestContext) -> Result<u64, ApiErrorResponse> {
    u64::try_from(ctx.clock.now().timestamp_millis()).map_err(|error| {
        internal_source_error(
            "Enrollment verification clock is unavailable",
            error,
            request_ctx,
        )
    })
}

fn to_i64(value: u64, field: &str, request_ctx: &RequestContext) -> Result<i64, ApiErrorResponse> {
    i64::try_from(value).map_err(|_| {
        api_error(
            AppError::new(
                ErrorCode::Validation,
                format!("Enrollment {field} exceeds the supported range"),
            ),
            request_ctx,
        )
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

fn unavailable_trust_error(request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(
        AppError::new(
            ErrorCode::ExternalDependency,
            "Signed enrollment trust is unavailable",
        )
        .retryable(),
        request_ctx,
    )
}

fn forbidden_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(AppError::new(ErrorCode::Forbidden, message), request_ctx)
}

fn conflict_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    api_error(AppError::new(ErrorCode::Conflict, message), request_ctx)
}

fn incompatible_discovery_error(message: &str, request_ctx: &RequestContext) -> ApiErrorResponse {
    conflict_error(message, request_ctx)
}

fn external_error(
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

fn enrollment_write_error(error: sqlx::Error, request_ctx: &RequestContext) -> ApiErrorResponse {
    if error
        .as_database_error()
        .is_some_and(sqlx::error::DatabaseError::is_unique_violation)
    {
        return conflict_error(
            "Managed Service already has conflicting enrollment evidence",
            request_ctx,
        );
    }
    database_error(error, request_ctx)
}

fn internal_source_error(
    message: &str,
    source: impl std::error::Error + Send + Sync + 'static,
    request_ctx: &RequestContext,
) -> ApiErrorResponse {
    api_error(
        AppError::new(ErrorCode::Internal, message).with_source(source),
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
    fn local_enrollment_normalizes_localhost_without_dns_and_rejects_remote_targets() {
        assert_eq!(
            normalize_loopback_base_url("http://localhost:4100/").expect("localhost target"),
            "http://127.0.0.1:4100"
        );
        assert_eq!(
            normalize_loopback_base_url("http://127.20.30.40:4100/base/").expect("loopback target"),
            "http://127.20.30.40:4100/base"
        );
        assert_eq!(
            core_url("http://127.0.0.1:4100/lenso/service/v1").expect("Core target"),
            "http://127.0.0.1:4100/system-plane/v1"
        );
        for target in [
            "https://127.0.0.1:4100",
            "http://service.example:4100",
            "http://10.0.0.4:4100",
            "http://user:secret@127.0.0.1:4100",
            "http://127.0.0.1:4100?token=secret",
        ] {
            assert!(
                normalize_loopback_base_url(target).is_err(),
                "accepted {target}"
            );
        }
    }
}
