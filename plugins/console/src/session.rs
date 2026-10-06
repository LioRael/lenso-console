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
    pub assistant_access: Option<AssistantAccessPolicy>,
    pub member_workspace_ids: Vec<String>,
    pub auth: Option<AuthClient>,
    pub operators_profile: Option<crate::OperatorsProfile>,
    pub access_control: Option<lenso_capability_access_control::AccessControlClient>,
}

const OPERATOR_ADMITTED: &str = "lenso.console.operator-admitted";
/// Host-owned grants. An explicit policy starts disabled and grants nobody.
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssistantAccessPolicy {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub subjects: Vec<String>,
    /// Role names are read only from authenticated, signed Auth claims.
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default)]
    pub allow_administrators: bool,
    #[serde(default)]
    pub permission: Option<AssistantPermission>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssistantPermission {
    pub scope_kind: String,
    pub scope_id: String,
}

impl AssistantAccessPolicy {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.subjects.iter().chain(&self.roles).any(|value| {
            value.is_empty() || value.len() > 256 || value.chars().any(char::is_control)
        }) || self
            .permission
            .as_ref()
            .is_some_and(|p| p.scope_kind.is_empty() || p.scope_id.is_empty())
        {
            return Err(
                "Assistant grants require nonempty canonical identities and permission scope"
                    .into(),
            );
        }
        Ok(())
    }
}

pub(super) const LEGACY_AGENT_CONTROL: &str = "lenso.console.legacy-agent-control";

pub(super) fn assistant_path(path: &str) -> bool {
    path == "/api/console/v1/agents"
        || path.starts_with("/api/console/v1/agents/")
        || path == "/api/console/v1/assistant/settings"
        || path.starts_with("/api/console/v1/agent/")
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
        if assertion.to_wire().claims.as_ref().is_some_and(|claims| {
            claims.contains_key(lenso_auth_sdk::delegation::SCOPED_DELEGATION_CLAIM)
        }) {
            return Err(lenso_auth_sdk::AssertionValidationError::InvalidProof.into());
        }
        Ok(Self(assertion.subject().to_owned()))
    }
}

impl SessionBoundary {
    #[cfg(test)]
    pub async fn prepare(
        &self,
        context: InvocationContext,
        method: &str,
        path: &str,
        credential: Option<(&str, &str)>,
    ) -> Result<InvocationContext, Box<Response>> {
        self.prepare_for_subject(context, method, path, credential, None)
            .await
    }

    pub async fn prepare_for_subject(
        &self,
        context: InvocationContext,
        method: &str,
        path: &str,
        credential: Option<(&str, &str)>,
        expected_subject: Option<&str>,
    ) -> Result<InvocationContext, Box<Response>> {
        let session_request = path == "/api/console/v1/session";
        if path == "/api/console/v1/locale" && method == "GET" && credential.is_none() {
            return Ok(context);
        }
        if session_request && method != "GET" {
            return Err(problem(
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
            ));
        }
        if !self.required {
            if self.assistant_access.is_some() && assistant_path(path) {
                return Err(problem(StatusCode::FORBIDDEN, "assistant_access_required"));
            }
            return if session_request {
                Err(session_response(
                    "local",
                    None,
                    true,
                    &[],
                    false,
                    false,
                    self.assistant_access.is_none(),
                ))
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
        if expected_subject.is_some_and(|subject| subject != assertion.subject()) {
            return Err(problem(StatusCode::PRECONDITION_FAILED, "session_changed"));
        }
        if assertion.actor_kind() != "user" {
            return Err(problem(StatusCode::FORBIDDEN, "user_session_required"));
        }
        if let Some(profile) = &self.operators_profile {
            self.prepare_operator(context, assertion, method, path, session_request, profile)
                .await
        } else {
            self.prepare_legacy(context, &assertion, method, path, session_request)
                .await
        }
    }

    async fn prepare_operator(
        &self,
        context: InvocationContext,
        assertion: ActorAssertion,
        method: &str,
        path: &str,
        session_request: bool,
        profile: &crate::OperatorsProfile,
    ) -> Result<InvocationContext, Box<Response>> {
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
        if crate::locale::is_locale_path(path) {
            return Ok(context);
        }
        let access = self
            .access_control
            .as_ref()
            .ok_or_else(|| problem(StatusCode::SERVICE_UNAVAILABLE, "authorization_unavailable"))?;
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
            .map_err(|_| problem(StatusCode::SERVICE_UNAVAILABLE, "authorization_unavailable"))?;
        if !permission.allowed {
            return Err(problem(StatusCode::FORBIDDEN, "console_access_required"));
        }
        let context = context
            .with_extension(OPERATOR_ADMITTED, b"1".to_vec())
            .map_err(|_| problem(StatusCode::BAD_GATEWAY, "invalid_authentication_context"))?;
        let workspace_ids = self.operator_workspace_ids();
        if session_request {
            return Err(with_read_scope(
                session_response(
                    "required",
                    Some(&subject.0),
                    false,
                    &workspace_ids,
                    profile.management_enabled,
                    profile.human_interface,
                    false,
                ),
                &assertion,
                "operators",
                &format!(
                    "{}:{}:{}",
                    profile.deployment, profile.issuer, profile.public_key
                ),
            ));
        }
        self.require_operator_path(method, path, profile)?;
        Ok(context)
    }

    fn require_operator_path(
        &self,
        method: &str,
        path: &str,
        profile: &crate::OperatorsProfile,
    ) -> Result<(), Box<Response>> {
        let workspace_path = method == "GET" && path == "/api/console/v1/pages"
            || path
                .strip_prefix("/api/console/v1/pages/")
                .and_then(|tail| tail.split('/').next())
                .is_some_and(|id| {
                    self.operator_workspace_ids()
                        .iter()
                        .any(|allowed| allowed == id)
                });
        let management_path = profile.management_enabled
            && (method == "GET" && path == "/api/console/v1/management/catalog"
                || method == "POST" && path == "/api/console/v1/management/invoke"
                || method == "GET"
                    && path
                        .strip_prefix("/api/console/v1/management/operations/")
                        .is_some_and(|id| !id.is_empty() && id.len() <= 128 && !id.contains('/')));
        let human_path = profile.human_interface
            && (method == "POST"
                && (path == "/api/console/v1/human-management/decide"
                    || matches!(
                        path,
                        "/api/console/v1/human-tokens/issue"
                            | "/api/console/v1/human-tokens/list"
                            | "/api/console/v1/human-tokens/receipt"
                            | "/api/console/v1/human-tokens/revoke"
                    ))
                || method == "GET"
                    && path
                        .strip_prefix("/api/console/v1/human-management/intents/")
                        .is_some_and(|id| !id.is_empty() && id.len() <= 128 && !id.contains('/')));
        if !workspace_path && !management_path && !human_path {
            return Err(problem(
                StatusCode::FORBIDDEN,
                "controlled_management_required",
            ));
        }
        Ok(())
    }

    async fn prepare_legacy(
        &self,
        context: InvocationContext,
        assertion: &ActorAssertion,
        method: &str,
        path: &str,
        session_request: bool,
    ) -> Result<InvocationContext, Box<Response>> {
        if crate::locale::is_locale_path(path) {
            return assertion
                .attach(context)
                .map_err(|_| problem(StatusCode::BAD_GATEWAY, "invalid_authentication_context"));
        }
        let administrator = self
            .administrator_subjects
            .iter()
            .any(|subject| subject == assertion.subject());
        let assistant_enabled = if session_request || assistant_path(path) {
            self.assistant_allowed(&context, assertion, administrator)
                .await?
        } else {
            false
        };
        if assistant_path(path) {
            if !assistant_enabled {
                return Err(problem(StatusCode::FORBIDDEN, "assistant_access_required"));
            }
            let context = if self.assistant_access.is_none() && administrator {
                context
                    .with_extension(LEGACY_AGENT_CONTROL, b"1".to_vec())
                    .map_err(|_| {
                        problem(StatusCode::BAD_GATEWAY, "invalid_authentication_context")
                    })?
            } else {
                context
            };
            return assertion
                .attach(context)
                .map_err(|_| problem(StatusCode::BAD_GATEWAY, "invalid_authentication_context"));
        }
        if session_request {
            // A verified user can always enter personal settings. Workspace and
            // administration admission remain independent checks below.
            return Err(with_read_scope(
                session_response(
                    "required",
                    Some(assertion.subject()),
                    administrator,
                    &self.member_workspace_ids,
                    false,
                    false,
                    assistant_enabled,
                ),
                assertion,
                "console-auth",
                assertion.issuer(),
            ));
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
    async fn assistant_allowed(
        &self,
        context: &InvocationContext,
        assertion: &ActorAssertion,
        administrator: bool,
    ) -> Result<bool, Box<Response>> {
        let Some(policy) = &self.assistant_access else {
            return Ok(administrator);
        };
        if !policy.enabled {
            return Ok(false);
        }
        if policy
            .subjects
            .iter()
            .any(|subject| subject == assertion.subject())
            || (policy.allow_administrators && administrator)
        {
            return Ok(true);
        }
        let wire = assertion.to_wire();
        if wire
            .claims
            .as_ref()
            .and_then(|claims| claims.get("roles"))
            .and_then(serde_json::Value::as_array)
            .is_some_and(|roles| {
                roles
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .any(|role| policy.roles.iter().any(|allowed| allowed == role))
            })
        {
            return Ok(true);
        }
        let Some(permission) = &policy.permission else {
            return Ok(false);
        };
        let access = self
            .access_control
            .as_ref()
            .ok_or_else(|| problem(StatusCode::SERVICE_UNAVAILABLE, "authorization_unavailable"))?;
        let context = assertion
            .attach(context.clone())
            .map_err(|_| problem(StatusCode::BAD_GATEWAY, "invalid_authentication_context"))?;
        let result = access
            .check_permission_with_context(
                context,
                lenso_capability_access_control::CheckPermissionRequest {
                    subject: assertion.subject().to_owned(),
                    scope: lenso_capability_access_control::CheckPermissionRequestScope {
                        kind: permission.scope_kind.clone(),
                        id: permission.scope_id.clone(),
                    },
                    permission: "assistant.use".into(),
                },
            )
            .await
            .map_err(|_| problem(StatusCode::SERVICE_UNAVAILABLE, "authorization_unavailable"))?;
        Ok(result.allowed)
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
            if mount["access"] == "administrator" {
                return mount["id"]
                    .as_str()
                    .is_some_and(|id| self.operator_workspace_admitted(context, id));
            }
            mount["id"].as_str().is_some_and(|id| {
                self.member_workspace_ids
                    .iter()
                    .any(|allowed| allowed == id)
                    || self.operator_workspace_admitted(context, id)
            })
        });
        (
            StatusCode::OK,
            [(http::header::CACHE_CONTROL, "no-store")],
            Json(value),
        )
            .into_response()
    }

    fn operator_workspace_ids(&self) -> Vec<String> {
        let mut ids = self.member_workspace_ids.clone();
        if let Some(profile) = &self.operators_profile {
            ids.extend(profile.administrator_workspace_ids.iter().cloned());
        }
        ids.sort();
        ids.dedup();
        ids
    }

    fn operator_workspace_admitted(&self, context: &InvocationContext, id: &str) -> bool {
        context
            .extension(OPERATOR_ADMITTED)
            .is_some_and(|value| value == b"1")
            && self.operators_profile.as_ref().is_some_and(|profile| {
                profile
                    .administrator_workspace_ids
                    .iter()
                    .any(|allowed| allowed == id)
            })
    }

    pub(super) fn admits_workspace_administrator(
        &self,
        context: &InvocationContext,
        path: &str,
    ) -> bool {
        self.admits_administrator(context)
            || path
                .strip_prefix("/api/console/v1/pages/")
                .and_then(|tail| tail.split('/').next())
                .is_some_and(|id| self.operator_workspace_admitted(context, id))
    }

    pub(super) fn admits_administrator(&self, context: &InvocationContext) -> bool {
        !self.required
            || context
                .sealed_extension(lenso_auth_sdk::ACTOR_ASSERTION_EXTENSION)
                .and_then(|extension| {
                    serde_json::from_slice::<serde_json::Value>(extension.value()).ok()
                })
                .and_then(|value| value["subject"].as_str().map(str::to_owned))
                .is_some_and(|subject| self.administrator_subjects.contains(&subject))
    }
}

// These independent capabilities retain the existing session wire contract.
#[allow(clippy::fn_params_excessive_bools)]
fn session_response(
    mode: &str,
    subject: Option<&str>,
    administrator: bool,
    workspace_ids: &[String],
    management_enabled: bool,
    human_management_enabled: bool,
    assistant_enabled: bool,
) -> Box<Response> {
    let mut response = Box::new((
        StatusCode::OK,
        [(http::header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"mode":mode,"authenticated":subject.is_some(),"subject":subject,"administrator":administrator,"workspace_ids":workspace_ids,"management_enabled":management_enabled,"human_management_enabled":human_management_enabled,"assistant_enabled":assistant_enabled})),
    )
        .into_response());
    if mode == "local" {
        response.headers_mut().insert(
            "x-lenso-read-scope",
            http::HeaderValue::from_static("local"),
        );
    }
    response
}

// Public admission metadata only: no proof, cookie, credential or assertion times.
// Realm labels come from the selected boundary, never a claims.realm override.
fn with_read_scope(
    mut response: Box<Response>,
    assertion: &ActorAssertion,
    realm: &str,
    authority: &str,
) -> Box<Response> {
    use sha2::{Digest, Sha256};
    let mut audiences = assertion.audience().to_vec();
    audiences.sort();
    audiences.dedup();
    let claims = assertion.to_wire().claims;
    let namespace = serde_json::to_vec(&(
        realm,
        authority,
        assertion.issuer(),
        assertion.subject(),
        audiences,
        claims,
    ))
    .expect("Auth admission metadata must serialize");
    let digest = format!("{:x}", Sha256::digest(namespace));
    response.headers_mut().insert(
        "x-lenso-read-scope",
        http::HeaderValue::from_str(&digest).expect("SHA256 hex is a header value"),
    );
    response
}

pub(super) fn problem(status: StatusCode, code: &str) -> Box<Response> {
    let detail = match code {
        "assistant_access_required" => {
            "Your account does not have permission to use the assistant."
        }
        "authentication_required" => "Sign in to continue.",
        "user_session_required" => "A user session is required.",
        "console_access_required" => "Your account does not have access to this Console.",
        "method_not_allowed" => "This endpoint does not accept this method.",
        "locale_default_permission_required" => {
            "Your account cannot change the global default language."
        }
        "locale_store_unavailable" => "Language preferences are unavailable on this host.",
        "invalid_locale" | "invalid_locale_preference" => "Choose a supported language preference.",
        "session_changed" => {
            "The signed-in account changed. Refresh the session before continuing."
        }
        "assistant_route_unavailable" => {
            "This assistant operation is not available for user sessions."
        }
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
