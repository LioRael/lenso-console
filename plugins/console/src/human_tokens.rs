use crate::http::{IntoResponse, Json, Request, Response};
use http::{Method, StatusCode};
use lenso_capability_human_api_token as pat;

fn problem(status: StatusCode, code: &str) -> Response {
    crate::http::no_store(problem_response(status, code))
}
fn problem_response(status: StatusCode, code: &str) -> Response {
    (
        status,
        Json(serde_json::json!({"type":"about:blank","status":status.as_u16(),"code":code})),
    )
        .into_response()
}
fn success<T: serde::Serialize>(value: T) -> Response {
    crate::http::no_store(Json(value).into_response())
}
pub(super) async fn handle(
    client: &pat::HumanApiTokenClient,
    request: &Request,
) -> Option<Response> {
    let path = request.path.strip_prefix("/api/console/v1/human-tokens/")?;
    if request.method != Method::POST || !matches!(path, "issue" | "list" | "receipt" | "revoke") {
        return Some(problem(StatusCode::NOT_FOUND, "not_found"));
    }
    if request.body.len() > 32768 {
        return Some(problem(StatusCode::PAYLOAD_TOO_LARGE, "invalid_input"));
    }
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&request.body) else {
        return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
    };
    let keys: &[&str] = match path {
        "issue" => &[
            "idempotency_key",
            "name",
            "deployment",
            "permissions",
            "resource_scopes",
            "expires_at",
        ],
        "list" => &["deployment", "limit", "after_credential_id"],
        "receipt" => &["deployment", "idempotency_key"],
        _ => &["deployment", "credential_id"],
    };
    if !value
        .as_object()
        .is_some_and(|object| object.keys().all(|key| keys.contains(&key.as_str())))
        || value.get("resource_scopes").is_some_and(|scopes| {
            !scopes.as_array().is_some_and(|scopes| {
                scopes.iter().all(|scope| {
                    scope.as_object().is_some_and(|scope| {
                        scope
                            .keys()
                            .all(|key| matches!(key.as_str(), "kind" | "id"))
                    })
                })
            })
        })
    {
        return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
    }
    Some(match path {
        "issue" => issue(client, request, value).await,
        "receipt" => receipt(client, request, value).await,
        "list" => list(client, request, value).await,
        _ => revoke(client, request, value).await,
    })
}

async fn issue(
    client: &pat::HumanApiTokenClient,
    request: &Request,
    value: serde_json::Value,
) -> Response {
    let Ok(input) = serde_json::from_value::<pat::IssueRequest>(value) else {
        return problem(StatusCode::BAD_REQUEST, "invalid_input");
    };
    match client
        .issue_with_context(request.context.clone(), input)
        .await
    {
        Ok(response) => success(response),
        Err(pat::HumanApiTokenIssueInvocationError::Domain(error)) => match error {
            pat::IssueError::PermissionDenied => {
                problem(StatusCode::FORBIDDEN, "permission_denied")
            }
            pat::IssueError::Conflict => problem(StatusCode::CONFLICT, "changed_intent"),
            pat::IssueError::InvalidRequest => problem(StatusCode::BAD_REQUEST, "invalid_input"),
            _ => problem(StatusCode::SERVICE_UNAVAILABLE, "unsupported_profile"),
        },
        Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "issuer_unavailable"),
    }
}

async fn receipt(
    client: &pat::HumanApiTokenClient,
    request: &Request,
    value: serde_json::Value,
) -> Response {
    let Ok(input) = serde_json::from_value::<pat::ReceiptRequest>(value) else {
        return problem(StatusCode::BAD_REQUEST, "invalid_input");
    };
    match client
        .receipt_with_context(request.context.clone(), input)
        .await
    {
        Ok(response) => success(response),
        Err(pat::HumanApiTokenReceiptInvocationError::Domain(
            pat::ReceiptError::PermissionDenied,
        )) => problem(StatusCode::FORBIDDEN, "permission_denied"),
        Err(pat::HumanApiTokenReceiptInvocationError::Domain(
            pat::ReceiptError::InvalidRequest,
        )) => problem(StatusCode::BAD_REQUEST, "invalid_input"),
        Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "issuer_unavailable"),
    }
}

async fn list(
    client: &pat::HumanApiTokenClient,
    request: &Request,
    value: serde_json::Value,
) -> Response {
    let Ok(input) = serde_json::from_value::<pat::ListRequest>(value) else {
        return problem(StatusCode::BAD_REQUEST, "invalid_input");
    };
    match client
        .list_with_context(request.context.clone(), input)
        .await
    {
        Ok(response) => success(response),
        Err(pat::HumanApiTokenListInvocationError::Domain(pat::ListError::PermissionDenied)) => {
            problem(StatusCode::FORBIDDEN, "permission_denied")
        }
        Err(pat::HumanApiTokenListInvocationError::Domain(pat::ListError::InvalidRequest)) => {
            problem(StatusCode::BAD_REQUEST, "invalid_input")
        }
        Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "issuer_unavailable"),
    }
}

async fn revoke(
    client: &pat::HumanApiTokenClient,
    request: &Request,
    value: serde_json::Value,
) -> Response {
    let Ok(input) = serde_json::from_value::<pat::RevokeRequest>(value) else {
        return problem(StatusCode::BAD_REQUEST, "invalid_input");
    };
    match client
        .revoke_with_context(request.context.clone(), input)
        .await
    {
        Ok(response) => success(response),
        Err(pat::HumanApiTokenRevokeInvocationError::Domain(
            pat::RevokeError::PermissionDenied,
        )) => problem(StatusCode::FORBIDDEN, "permission_denied"),
        Err(pat::HumanApiTokenRevokeInvocationError::Domain(pat::RevokeError::InvalidRequest)) => {
            problem(StatusCode::BAD_REQUEST, "invalid_input")
        }
        Err(pat::HumanApiTokenRevokeInvocationError::Domain(pat::RevokeError::NotFound)) => {
            problem(StatusCode::NOT_FOUND, "not_found")
        }
        Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "issuer_unavailable"),
    }
}
