//! Console's session boundary consumes Auth; login methods and credentials stay Auth-owned.

use crate::http::{IntoResponse, Json, Response};
use http::StatusCode;
use lenso_auth_sdk::{AuthOutcome, CredentialEvidence, authenticate_request, decode_auth_response};
use lenso_capability_auth::{AuthClient, AuthInvocationError};
use lenso_kernel::InvocationContext;

#[derive(Clone, Debug)]
pub(super) struct SessionBoundary {
    pub required: bool,
    pub administrator_subjects: Vec<String>,
    pub auth: Option<AuthClient>,
}

impl SessionBoundary {
    pub async fn prepare(
        &self,
        context: InvocationContext,
        method: &str,
        path: &str,
        credential: Option<(&str, &str)>,
    ) -> Result<InvocationContext, Box<Response>> {
        let session_request = path == "/api/console/v1/session";
        if session_request && method != "GET" {
            return Err(problem(
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
            ));
        }
        if !self.required {
            return if session_request {
                Err(session_response("local", None))
            } else {
                Ok(context)
            };
        }
        if !path.starts_with("/api/") {
            return Ok(context);
        }
        let Some(auth) = &self.auth else {
            return Err(problem(
                StatusCode::SERVICE_UNAVAILABLE,
                "authentication_unavailable",
            ));
        };
        let evidence = credential.map(|(scheme, value)| CredentialEvidence::new(scheme, value));
        let response = auth
            .authenticate_with_context(context.clone(), authenticate_request(evidence))
            .await
            .map_err(|error| match error {
                AuthInvocationError::Domain(_) => {
                    problem(StatusCode::UNAUTHORIZED, "authentication_required")
                }
                AuthInvocationError::Runtime(_) => problem(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "authentication_unavailable",
                ),
            })?;
        let outcome = decode_auth_response(response)
            .map_err(|_| problem(StatusCode::BAD_GATEWAY, "invalid_authentication_response"))?;
        let AuthOutcome::Authenticated(assertion) = outcome else {
            return Err(problem(StatusCode::UNAUTHORIZED, "authentication_required"));
        };
        if assertion.actor_kind() != "user" {
            return Err(problem(StatusCode::FORBIDDEN, "user_session_required"));
        }
        // Existing Console workspaces and shared Agent proxies contain Host data.
        // A login alone must never inherit that authority. Business-user access
        // requires a separate, explicitly scoped workspace authorization path.
        if !self
            .administrator_subjects
            .iter()
            .any(|subject| subject == assertion.subject())
        {
            return Err(problem(
                StatusCode::FORBIDDEN,
                "console_administrator_required",
            ));
        }
        if session_request {
            return Err(session_response("required", Some(assertion.subject())));
        }
        assertion
            .attach(context)
            .map_err(|_| problem(StatusCode::BAD_GATEWAY, "invalid_authentication_context"))
    }
}

fn session_response(mode: &str, subject: Option<&str>) -> Box<Response> {
    Box::new((
        StatusCode::OK,
        [(http::header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"mode":mode,"authenticated":subject.is_some(),"subject":subject})),
    )
        .into_response())
}

fn problem(status: StatusCode, code: &str) -> Box<Response> {
    Box::new(
        (
            status,
            [(http::header::CACHE_CONTROL, "no-store")],
            Json(serde_json::json!({"code":code,"status":status.as_u16()})),
        )
            .into_response(),
    )
}

#[cfg(test)]
mod tests;
