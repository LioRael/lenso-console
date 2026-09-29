//! Test-only bound owner ports; no HTTP login endpoint or production registration route.
use lenso_capability_credential_issuer as issuer;
use lenso_capability_password_auth as password;

#[lenso::plugin(consumer)]
#[derive(Clone, Debug)]
struct PasswordSessionConsumer {
    password: lenso::Port<password::PasswordClient>,
    issuer: lenso::Port<issuer::CredentialIssuerClient>,
}
