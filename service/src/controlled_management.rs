//! HTTP projection over one Host-bound Management port.
use crate::http::{IntoResponse, Json, Request, Response};
use http::{Method, StatusCode};
use lenso_capability_management as contract;

pub(super) async fn handle(
    client: &contract::ManagementClient,
    request: &Request,
) -> Option<Response> {
    let path = request.path.strip_prefix("/api/console/v1/management/")?;
    Some(match (request.method.clone(), path) {
        (Method::GET, "catalog") => match client
            .catalog_with_context(request.context.clone(), contract::CatalogRequest {})
            .await
        {
            Ok(response) => Json(response).into_response(),
            Err(contract::ManagementCatalogInvocationError::Domain(
                contract::CatalogError::PermissionDenied,
            )) => problem(StatusCode::FORBIDDEN, "permission_denied"),
            Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "management_unavailable"),
        },
        (Method::POST, "invoke") => {
            if request.body.len() > 300_000 {
                return Some(problem(StatusCode::PAYLOAD_TOO_LARGE, "invalid_input"));
            }
            let Ok(value) = serde_json::from_slice::<serde_json::Value>(&request.body) else {
                return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
            };
            if !value.as_object().is_some_and(|object| {
                object.keys().all(|key| {
                    matches!(
                        key.as_str(),
                        "entry_id"
                            | "version"
                            | "input_json"
                            | "idempotency_key"
                            | "expected_revision"
                    )
                })
            }) {
                return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
            }
            let Ok(input) = serde_json::from_value::<contract::InvokeRequest>(value) else {
                return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
            };
            match client
                .invoke_with_context(request.context.clone(), input)
                .await
            {
                Ok(response) => Json(response).into_response(),
                Err(contract::ManagementInvokeInvocationError::Domain(error)) => {
                    let (status, code) = match error {
                        contract::InvokeError::PermissionDenied => {
                            (StatusCode::FORBIDDEN, "permission_denied")
                        }
                        contract::InvokeError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
                        contract::InvokeError::InvalidInput => {
                            (StatusCode::UNPROCESSABLE_ENTITY, "invalid_input")
                        }
                        contract::InvokeError::Conflict => {
                            (StatusCode::CONFLICT, "stale_or_changed_intent")
                        }
                        contract::InvokeError::Cancelled => {
                            (StatusCode::REQUEST_TIMEOUT, "cancelled")
                        }
                        contract::InvokeError::DeadlineExceeded => {
                            (StatusCode::GATEWAY_TIMEOUT, "deadline_exceeded")
                        }
                        _ => (StatusCode::SERVICE_UNAVAILABLE, "management_unavailable"),
                    };
                    problem(status, code)
                }
                Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "management_unavailable"),
            }
        }
        (Method::GET, path) if path.starts_with("operations/") => {
            let id = &path["operations/".len()..];
            if id.is_empty() || id.len() > 128 || id.contains('/') {
                return Some(problem(StatusCode::BAD_REQUEST, "invalid_input"));
            }
            match client
                .status_with_context(
                    request.context.clone(),
                    contract::StatusRequest {
                        operation_id: id.into(),
                    },
                )
                .await
            {
                Ok(response) => Json(response).into_response(),
                Err(contract::ManagementStatusInvocationError::Domain(
                    contract::StatusError::PermissionDenied,
                )) => problem(StatusCode::FORBIDDEN, "permission_denied"),
                Err(contract::ManagementStatusInvocationError::Domain(
                    contract::StatusError::NotFound,
                )) => problem(StatusCode::NOT_FOUND, "not_found"),
                Err(contract::ManagementStatusInvocationError::Domain(
                    contract::StatusError::Conflict,
                )) => problem(StatusCode::CONFLICT, "binding_changed"),
                Err(_) => problem(StatusCode::SERVICE_UNAVAILABLE, "management_unavailable"),
            }
        }
        _ => problem(StatusCode::NOT_FOUND, "not_found"),
    })
}
fn problem(status: StatusCode, code: &str) -> Response {
    (
        status,
        Json(serde_json::json!({"type":"about:blank","status":status.as_u16(),"code":code})),
    )
        .into_response()
}
