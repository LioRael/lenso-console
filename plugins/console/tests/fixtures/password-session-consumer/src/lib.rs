//! Test-only bound Auth owner ports and public test-ingress CSRF policy.
//! Login remains the real Password capability; no HTTP login route is advertised.
use lenso_capability_credential_issuer as issuer;
use lenso_capability_http_endpoint::{
    self as http_endpoint_contract, EndpointHandleInvocationError, HandleResponse, endpoint,
    response::{self, StatusCode},
};
use lenso_capability_password_auth as password;
use lenso_kernel::InvocationContext;

pub const SESSION_COOKIE: &str = "__Host-lenso-session";
pub const CSRF_COOKIE: &str = "__Host-lenso-csrf";
pub const CSRF_HEADER: &str = "x-csrf-token";

#[lenso::plugin]
#[derive(Clone, Debug)]
struct PasswordSessionConsumer {
    password: lenso::Port<password::PasswordClient>,
    issuer: lenso::Port<issuer::CredentialIssuerClient>,
}

#[endpoint]
impl PasswordSessionConsumer {
    /// Projects the exact ingress policy used by the local test Host. This route
    /// neither authenticates a user nor mocks permission or credential issuance.
    #[get("auth.test-password-session.methods", "/auth/methods")]
    async fn methods(
        &self,
        _context: InvocationContext,
    ) -> Result<HandleResponse, EndpointHandleInvocationError> {
        response::json(StatusCode::OK, &serde_json::json!({"methods":[],"csrf":{"cookie_name":CSRF_COOKIE,"header_name":CSRF_HEADER}})).map_err(Into::into)
    }
}
