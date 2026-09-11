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
    pub member_workspace_ids: Vec<String>,
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
                Err(session_response("local", None, true, &[]))
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
        let administrator = self
            .administrator_subjects
            .iter()
            .any(|subject| subject == assertion.subject());
        if session_request {
            return if administrator || !self.member_workspace_ids.is_empty() {
                Err(session_response(
                    "required",
                    Some(assertion.subject()),
                    administrator,
                    &self.member_workspace_ids,
                ))
            } else {
                Err(problem(StatusCode::FORBIDDEN, "console_access_required"))
            };
        }
        let member_path = path == "/api/console/v1/pages" && method == "GET"
            || path
                .strip_prefix("/api/console/v1/pages/")
                .and_then(|tail| tail.split('/').next())
                .is_some_and(|id| {
                    self.member_workspace_ids
                        .iter()
                        .any(|allowed| allowed == id)
                });
        if !administrator && (!member_path || self.member_workspace_ids.is_empty()) {
            return Err(problem(
                StatusCode::FORBIDDEN,
                "console_administrator_required",
            ));
        }
        assertion
            .attach(context)
            .map_err(|_| problem(StatusCode::BAD_GATEWAY, "invalid_authentication_context"))
    }
    pub async fn filter_catalog(
        &self,
        context: &InvocationContext,
        path: &str,
        response: Response,
    ) -> Response {
        if !self.required || path != "/api/console/v1/pages" || !response.status().is_success() {
            return response;
        }
        // Called only after prepare authenticated and attached this request's assertion.
        let subject = context
            .sealed_extension(lenso_auth_sdk::ACTOR_ASSERTION_EXTENSION)
            .and_then(|extension| {
                serde_json::from_slice::<serde_json::Value>(extension.value()).ok()
            })
            .and_then(|value| value["subject"].as_str().map(str::to_owned));
        if subject
            .as_ref()
            .is_some_and(|subject| self.administrator_subjects.contains(subject))
        {
            return response;
        }
        let (_, body) = response.into_parts();
        let Ok(bytes) = body.collect(4 * 1024 * 1024).await else {
            return *problem(StatusCode::BAD_GATEWAY, "invalid_page_catalog");
        };
        let Ok(mut value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
            return *problem(StatusCode::BAD_GATEWAY, "invalid_page_catalog");
        };
        let Some(mounts) = value["mounts"].as_array_mut() else {
            return *problem(StatusCode::BAD_GATEWAY, "invalid_page_catalog");
        };
        mounts.retain(|mount| {
            mount["id"].as_str().is_some_and(|id| {
                self.member_workspace_ids
                    .iter()
                    .any(|allowed| allowed == id)
            })
        });
        (
            StatusCode::OK,
            [(http::header::CACHE_CONTROL, "no-store")],
            Json(value),
        )
            .into_response()
    }
}

fn session_response(
    mode: &str,
    subject: Option<&str>,
    administrator: bool,
    workspace_ids: &[String],
) -> Box<Response> {
    Box::new((
        StatusCode::OK,
        [(http::header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"mode":mode,"authenticated":subject.is_some(),"subject":subject,"administrator":administrator,"workspace_ids":workspace_ids})),
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
