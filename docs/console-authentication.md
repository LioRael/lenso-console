# Console authentication through Plugins

Console consumes `lenso.auth@1`. The App owner chooses login methods through the
normal `plugins/` Plugin Root; Console has no password/SSO selection switch and
stores no passwords, provider tokens, or browser credentials.

## Composition

| Plugin | Responsibility |
| --- | --- |
| `lenso.auth.account` | Identity, sessions, signed actor assertions and revocation |
| `lenso.auth.web-session` | Browser methods, secure cookies, login callbacks and logout |
| `lenso.auth.password` (optional) | Email/password authentication |
| `lenso.auth.oidc-client` and `lenso.auth.oauth-flow` (optional) | Enterprise OIDC login and callback state |
| `lenso.secrets.env` | Resolve explicit secret references from the Host environment |
| `lenso.http-egress` (OIDC) | Outbound identity-provider requests |
| `lenso.web-ingress` | One Console HTTP listener, credential selection and CSRF enforcement |

These implementations are linked into the Host Catalog but are inactive until
selected in the Plugin Root. Enabling password, OIDC, or both determines the
methods returned by `GET /auth/methods`. Public self-registration is not exposed.
Account provisioning remains an Auth-owned administrative operation.

## Required configuration

Configure the `lenso.console.web/default` instance with
`require_user_session: true` and `administrator_subjects` containing the actual
Auth subject IDs allowed to operate this Console. Never use display names,
email addresses guessed to be subject IDs, or a shared Agent control token.
The default administrator list is empty and denies access.

Configure `lenso.web-ingress/default.session_cookie` with:

```json
{
  "name": "__Host-lenso-session",
  "csrf_cookie_name": "__Host-lenso-csrf",
  "csrf_header_name": "x-csrf-token"
}
```

Configure the Auth Web Session instance with the matching
`session_cookie_name` and `csrf_cookie_name`. Password login also requires
`origin`, the exact browser origin, for example `https://console.example.com`.
The Host rejects missing or mismatched cookie extraction before startup.
Use the existing typed Plugin configuration schemas for database schemas,
secret references, assertion keys, OIDC issuer/client settings and callback URL.
Prepare Auth-owned PostgreSQL schemas with their explicit operators before
starting the App. Activation never silently migrates production storage.

The launcher remains loopback-only. An HTTPS deployment places its reverse
proxy in front of this shared listener. Secure `__Host-` cookies must not be
weakened to accommodate an insecure deployment.

## Session behavior

- Password login sends credentials only to the selected same-origin Auth action.
  The resulting credential stays in a Secure, HttpOnly cookie.
- Console authenticates every API request; missing/revoked sessions return 401,
  unavailable Auth returns 503, and non-administrators receive 403.
- The frontend waits before mounting data providers. Login expiry and identity
  changes clear query caches; logout revokes the session through Auth.
- Unsafe same-origin requests carry the ingress CSRF token. External requests
  never receive this cookie-derived header.
- Authenticated assertions are propagated through the workspace dispatcher,
  including streaming calls. Browser headers never become an asserted actor.

## Scope of this migration

The current protected Console is an administrator workbench. Existing Agent and
Workspace interfaces contain shared Host data, so authentication does not yet
grant ordinary team members access. Business-user workspace authorization and
per-user Agent sessions must be implemented before opening those interfaces to
members. The existing Projects remote adapter remains external during that
migration; this change does not remove its separately running fixture.

Local mode remains explicit: `require_user_session: false`, no Auth binding.
It is the existing local operator experience, not a fabricated authenticated user.

## Acceptance coverage

The ignored Rust test `auth_plugins::live` uses a disposable PostgreSQL schema
pair selected by `LENSO_POSTGRES_TEST_URL` and a test-only signing input from
`CONSOLE_TEST_SECRET`. It runs real Auth, password, secrets and Web Ingress
Plugins in the Console process, verifies login, denied member access, session
persistence across restart with an explicit administrator, and logout revocation.
Only the unrelated Agent readiness endpoint is stubbed. Tests do not install
fixture identities or secrets into a user's Console.
