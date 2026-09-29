//! Console's session boundary consumes Auth; login methods and credentials stay Auth-owned.

use crate::http::{IntoResponse, Json, Response};
use http::StatusCode;
use lenso_auth_sdk::realm::RealmAssertionVerifier;
use lenso_auth_sdk::{ActorAssertion, ActorProjectionError, FixedClock, TypedActor};
use lenso_auth_sdk::{AuthOutcome, CredentialEvidence, authenticate_request, decode_auth_response};
use lenso_capability_auth::{AuthClient, AuthInvocationError};
use lenso_kernel::InvocationContext;

#[derive(Clone, Debug)]
pub(super) struct SessionBoundary {
    pub required: bool,
    pub administrator_subjects: Vec<String>,
    pub member_workspace_ids: Vec<String>,
    pub auth: Option<AuthClient>,
    pub operators_profile: Option<crate::OperatorsProfile>,
    pub access_control: Option<lenso_capability_access_control::AccessControlClient>,
}

struct OperatorSubject(String);
impl TypedActor for OperatorSubject {
    fn from_assertion(assertion: &ActorAssertion) -> Result<Self, ActorProjectionError> {
        if assertion.actor_kind() != "user" {
            return Err(ActorProjectionError::UnexpectedActorKind {
                expected: "user".to_owned(),
                actual: assertion.actor_kind().to_owned(),
            });
        }
        Ok(Self(assertion.subject().to_owned()))
    }
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
                Err(session_response("local", None, true, &[], false, false))
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
        if let Some(profile) = &self.operators_profile {
            let context = assertion
                .attach(context)
                .map_err(|_| problem(StatusCode::FORBIDDEN, "operators_session_required"))?;
            let verifier = RealmAssertionVerifier::new(
                "operators",
                &profile.issuer,
                &profile.public_key,
                profile.max_assertion_ttl_seconds,
                None,
            )
            .map_err(|_| {
                problem(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "authentication_unavailable",
                )
            })?;
            let subject = verifier
                .project_context::<OperatorSubject>(
                    &context,
                    lenso_capability_http_endpoint::CAPABILITY_ID,
                    "handle",
                    &FixedClock::new(time::OffsetDateTime::now_utc()),
                )
                .map_err(|_| problem(StatusCode::FORBIDDEN, "operators_session_required"))?;
            let access = self.access_control.as_ref().ok_or_else(|| {
                problem(StatusCode::SERVICE_UNAVAILABLE, "authorization_unavailable")
            })?;
            let permission = access
                .check_permission_with_context(
                    context.clone(),
                    lenso_capability_access_control::CheckPermissionRequest {
                        subject: subject.0.clone(),
                        scope: lenso_capability_access_control::CheckPermissionRequestScope {
                            kind: "deployment".to_owned(),
                            id: profile.deployment.clone(),
                        },
                        permission: "console.operator".to_owned(),
                    },
                )
                .await
                .map_err(|_| {
                    problem(StatusCode::SERVICE_UNAVAILABLE, "authorization_unavailable")
                })?;
            if !permission.allowed {
                return Err(problem(StatusCode::FORBIDDEN, "console_access_required"));
            }
            if session_request {
                return Err(session_response(
                    "required",
                    Some(&subject.0),
                    false,
                    &self.member_workspace_ids,
                    true,
                    profile.human_interface,
                ));
            }
            let workspace_path = method == "GET" && path == "/api/console/v1/pages"
                || path
                    .strip_prefix("/api/console/v1/pages/")
                    .and_then(|tail| tail.split('/').next())
                    .is_some_and(|id| {
                        self.member_workspace_ids
                            .iter()
                            .any(|allowed| allowed == id)
                    });
            let management_path = method == "GET" && path == "/api/console/v1/management/catalog"
                || method == "POST" && path == "/api/console/v1/management/invoke"
                || method == "GET"
                    && path
                        .strip_prefix("/api/console/v1/management/operations/")
                        .is_some_and(|id| !id.is_empty() && id.len() <= 128 && !id.contains('/'));
            let human_path = profile.human_interface
                && (method == "POST" && path == "/api/console/v1/human-management/decide"
                    || method == "GET"
                        && path
                            .strip_prefix("/api/console/v1/human-management/intents/")
                            .is_some_and(|id| {
                                !id.is_empty() && id.len() <= 128 && !id.contains('/')
                            }));
            if !workspace_path && !management_path && !human_path {
                return Err(problem(
                    StatusCode::FORBIDDEN,
                    "controlled_management_required",
                ));
            }
            return Ok(context);
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
                    false,
                    false,
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
    management_enabled: bool,
    human_management_enabled: bool,
) -> Box<Response> {
    Box::new((
        StatusCode::OK,
        [(http::header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"mode":mode,"authenticated":subject.is_some(),"subject":subject,"administrator":administrator,"workspace_ids":workspace_ids,"management_enabled":management_enabled,"human_management_enabled":human_management_enabled})),
    )
        .into_response())
}

fn problem(status: StatusCode, code: &str) -> Box<Response> {
    let detail = match code {
        "authentication_required" => "Sign in to continue.",
        "user_session_required" => "A user session is required.",
        "console_access_required" => "Your account does not have access to this Console.",
        "method_not_allowed" => "This endpoint requires GET.",
        _ => "The Console could not complete the request. Try again later.",
    };
    Box::new(
        (
            status,
            [
                (http::header::CACHE_CONTROL, "no-store"),
                (http::header::CONTENT_TYPE, "application/problem+json"),
            ],
            Json(lenso_capability_http_endpoint::response::Problem::new(
                status, code, detail,
            )),
        )
            .into_response(),
    )
}

#[cfg(test)]
mod tests;
