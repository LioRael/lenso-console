# Console authentication through Plugins

Console consumes `lenso.auth@1`. The App owner chooses login methods through the
normal `plugins/` Plugin Root; Console has no password/SSO selection switch and
stores no passwords, provider tokens, or browser credentials.

## Composition

| Plugin | Responsibility |
| --- | --- |
| `lenso.auth.account` | Identity, sessions, signed actor assertions and revocation |
| `lenso.auth.web-session` | OIDC browser start, callback, secure cookies and logout |
| `lenso.auth.password` (optional) | Email/password authentication |
| `lenso.auth.oidc-client` and `lenso.auth.oauth-flow` (optional) | Enterprise OIDC login and callback state |
| `lenso.secrets.env` | Resolve explicit secret references from the Host environment |
| `lenso.http-egress` (OIDC) | Outbound identity-provider requests |
| `lenso.web-ingress` | One Console HTTP listener, credential selection and CSRF enforcement |

These implementations are linked into the Host Catalog but are inactive until
selected in the Plugin Root. The current Web Session Plugin requires the OIDC
Federated and Account CredentialIssuer roles; it does not expose password login
or `/auth/methods`. Password is a typed owner role. A selected HTTP projection
must bind that role, advertise its own method, and apply origin, cookie and CSRF
policy. The ordinary Ops reference App's Management Web Plugin supplies this
projection for its human profile. It keeps enrollment in a separate private
bootstrap Plugin rather than exposing public registration.

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
`session_cookie_name` and `csrf_cookie_name`. A password HTTP projection instead
uses its own explicit browser origin, such as `https://console.example.com`;
`origin` is not a Web Session configuration field.
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
  unavailable Auth returns 503, and unauthorized routes return 403.
- The frontend waits before mounting data providers. Login expiry and identity
  changes clear query caches; logout revokes the session through Auth.
- Unsafe same-origin requests carry the ingress CSRF token. External requests
  never receive this cookie-derived header.
- Authenticated assertions are propagated through the workspace dispatcher,
  including streaming calls. Browser headers never become an asserted actor.

## Scope of this migration

Ordinary members can access explicitly enabled native workspaces. The existing
shared Agent control plane remains administrator-only until per-user Agent
sessions and delegation are complete. Authentication alone does not make those
shared interfaces safe for team members. Existing external-App connections retain
their separate connection flow; the built-in Projects workspace uses native binding.

Local mode remains explicit: `require_user_session: false`, no Auth binding.
It is the existing local operator experience, not a fabricated authenticated user.

## Acceptance coverage

The legacy `auth_plugins::live` acceptance used a password HTTP surface that the
current OIDC Web Session Plugin no longer provides. Its adapter must use current
bound Password and Account CredentialIssuer roles before it is an acceptance
receipt for this source cohort. A compiled ignored test is not a passing receipt.
The ordinary Ops reference human profile separately qualifies the actual
password HTTP adapter, Console browser, reviewed operations and personal tokens.
That qualification records its exact source inputs and owner storage setup.

The Console integration scenario uses disposable PostgreSQL schemas selected by
`LENSO_POSTGRES_TEST_URL` and a test-only signing input from `CONSOLE_TEST_SECRET`.
Its native Projects variant checks
real Projects, Organization and Access Control Plugins, two users without identity crossover, workspace discovery,
unauthorized organization denial and shared-Agent isolation. No separate Projects
listener is used. Only the unrelated Agent readiness endpoint is stubbed. Tests do not install
fixture identities or secrets into a user's Console.

## Native Projects workspace

Select these additional instances in the same Console App Plugin Root:

- `lenso.console.workspace.projects/default`, without `origin`.
- `lenso.projects.web/default`, with `invocation_auth_issuer` and
  `invocation_auth_public_key` matching the Account Auth issuer and public key.
- `lenso.projects.postgres/default`, `lenso.organization.postgres/default`, and
  `lenso.access-control.postgres/default`, with explicit database secret references,
  prepared schemas, verification keys and exact caller instance allowlists.

The workspace binds directly to the Projects Web capability. It does not make an
HTTP request to a separate Projects service and does not store a shared grant.
Keep `origin` only for an explicitly external App connection.

Set Console `member_workspace_ids: ["projects"]` to admit authenticated members
into that workspace. This exposes only its catalog entry, assets and service
routes. It does not grant project data access: Projects still checks the signed
actor, organization membership and Access Control permissions for each operation.
System administration and the shared Agent proxy remain administrator-only.

The browser-session audience must include `lenso.ui.workspace-service@1:invoke`,
`lenso.http.endpoint@1:handle`, and the exact Projects operations the session may
perform, such as `lenso.projects@1:list_projects`. The Kernel filters assertions
at each capability boundary; authorizing only the final operation is insufficient.
Do not add wildcard audiences or replace the current actor with a shared account.

For caller allowlists, use canonical keys such as `lenso.projects.web/default`.
Login to Console is the only login for this built-in workspace. Changing
`member_workspace_ids` takes effect through the normal resolved-generation flow.
An App configured for member Projects access cannot use an external shared-grant
Projects adapter.

## HTTP request admission

The reference Console Host derives HTTP bindings from the selected Plugin Root, records their exact provider sets and bounded admission in its generated Host Catalog, and resolves the final immutable Plan before starting it. HTTP bindings allow 16 concurrent calls and 64 queued calls; saturation remains bounded rather than spawning unlimited work. Other Capability policies and streaming bindings remain unchanged.

This accommodates browser resource bursts without inheriting the generic single-permit, zero-queue policy. The Host regenerates this authority at startup, so restart after changing the Plugin composition. Authentication and workspace permissions remain enforced by their existing providers. The real Host regression sends 32 simultaneous shell requests without retries, and the authentication acceptance tests resolve the same admission policy.
