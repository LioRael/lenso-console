//! Human-only review calls use a separately bound server guard.
use crate::http::{IntoResponse, Json, Request, Response};
use http::{Method, StatusCode};
use lenso_capability_management_human as human;
fn problem(status: StatusCode, code: &str) -> Response {
    (
        status,
        Json(serde_json::json!({"type":"about:blank","status":status.as_u16(),"code":code})),
    )
        .into_response()
}
pub(super) async fn handle(
    client: &human::ManagementHumanClient,
    request: &Request,
) -> Option<Response> {
    let path = request
        .path
        .strip_prefix("/api/console/v1/human-management/")?;
    Some(match (request.method.clone(), path) {
        (Method::GET, path) if path.starts_with("intents/") => {
            let operation_id = &path["intents/".len()..];
            if operation_id.is_empty() || operation_id.len() > 128 || operation_id.contains('/') {
                return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
            }
            match client
                .read_intent_with_context(
                    request.context.clone(),
                    human::ReadIntentRequest {
                        operation_id: operation_id.into(),
                    },
                )
                .await
            {
                Ok(response) => Json(response).into_response(),
                Err(human::ManagementHumanReadIntentInvocationError::Domain(error)) => {
                    match error {
                        human::ReadIntentError::PermissionDenied => {
                            problem(StatusCode::FORBIDDEN, "permission_denied")
                        }
                        human::ReadIntentError::NotFound => {
                            problem(StatusCode::NOT_FOUND, "not_found")
                        }
                        human::ReadIntentError::Conflict => {
                            problem(StatusCode::CONFLICT, "changed_intent")
                        }
                        _ => problem(StatusCode::SERVICE_UNAVAILABLE, "review_unavailable"),
                    }
                }
                Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "review_unavailable"),
            }
        }
        (Method::POST, "decide") => {
            if request.body.len() > 2048 {
                return Some(problem(StatusCode::PAYLOAD_TOO_LARGE, "invalid_input"));
            }
            let Ok(value) = serde_json::from_slice::<serde_json::Value>(&request.body) else {
                return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
            };
            if !value.as_object().is_some_and(|object| {
                object.keys().all(|key| {
                    matches!(key.as_str(), "operation_id" | "intent_digest" | "decision")
                })
            }) {
                return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
            }
            let Ok(input) = serde_json::from_value::<human::DecideRequest>(value) else {
                return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
            };
            match client
                .decide_with_context(request.context.clone(), input)
                .await
            {
                Ok(response) => Json(response).into_response(),
                Err(human::ManagementHumanDecideInvocationError::Domain(error)) => match error {
                    human::DecideError::PermissionDenied => {
                        problem(StatusCode::FORBIDDEN, "permission_denied")
                    }
                    human::DecideError::NotFound => problem(StatusCode::NOT_FOUND, "not_found"),
                    human::DecideError::Conflict => problem(StatusCode::CONFLICT, "changed_intent"),
                    _ => problem(StatusCode::SERVICE_UNAVAILABLE, "review_unavailable"),
                },
                Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "review_unavailable"),
            }
        }
        _ => problem(StatusCode::NOT_FOUND, "not_found"),
    })
}
