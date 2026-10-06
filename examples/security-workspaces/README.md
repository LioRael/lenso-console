# Ordinary App security workspaces

This native Host has a business `/health` endpoint and optional Console support.
Access Control and Audit each own their contribution, workspace and service;
this App selects Instances in its `plugins/` directory. No Agent or Relay is
needed. The Host links Account, Password, Web Session, Access Postgres, Audit
Postgres and environment secret providers as available implementations. Optional
Auth workspace and browser adapters are linked by their feature selections.
Plugins are activated only when explicitly selected. Startup never initializes storage,
issues credentials or grants roles.

Place the Console, Auth, Access and Audit repositories next to each other as
`lenso-console`, `lenso-auth-plugin`, `lenso-access-control-plugin` and
`lenso-audit-log-plugin`. This candidate builds on Console `f27b0ed`, Auth
`cbaa561` and the optional Access/Audit/Auth packages from these slices. These native UI
packages are private source candidates; their headless owner packages have no
Console or Agent dependency.

Build each owner's browser assets from TypeScript before compiling the native
packages. The Account workspace uses the published npm Console SDK. Native
packages embed generated assets; no manually maintained `.mjs` source is added.

```sh
(cd ../lenso-access-control-plugin/console && bun install --ignore-scripts && bun run build)
(cd ../lenso-audit-log-plugin/console && bun install --ignore-scripts && bun run build)
(cd ../lenso-auth-plugin/console && bun install --ignore-scripts && bun run build)
(cd ../lenso-auth-plugin/session-console && bun install --ignore-scripts && bun run build)
(cd ../lenso-auth-plugin/adapters/password-web-session && bun install --ignore-scripts && bun run build)
```

Run the Host with an absolute App directory and an optional loopback address:

```sh
cargo run --manifest-path examples/security-workspaces/Cargo.toml --features browser-auth -j 1 -- /absolute/app 127.0.0.1:3032
```

The binary publishes `.lenso/host-catalog.json`; the existing Lenso App tools
inspect the derived composition. Configure real Auth and storage owners using
their schemas and explicit environment secret references. Selected password
login and renewal adapters must agree with Web Ingress on session/CSRF cookie
names. UI verification
keys are public; signing keys, database URLs and peppers remain secret-provider
references. Owner setup/bootstrap commands are separate operator actions.

`src/app-template/plugins/` supplies explicit two-scope configuration. Copy that
directory into a fresh App root, replace the public-key, approved-subject,
built-Shell-path and exact HTTPS-origin placeholders, then supply the three referenced environment
secrets. The placeholders intentionally fail validation until reviewed values
are supplied. `security.provisioning/default` is reserved for a separately
selected operator/setup consumer; it is not activated or granted by this Host.
Run Account's `AccountAuthOperator::setup_managed` and the other required owner
setup operations explicitly before startup. Provision scopes and read roles
through the existing owner APIs as separate operator actions.
The template contains no binding registry, signing key, password, database URL
or startup bootstrap. Audit readers are restricted again by storage-owner
`reader_scopes`; the browser cannot substitute another scope.

The template explicitly selects Password with `managed_sessions = true`, the
thin password browser adapter, existing session-renewal adapter, matching
ingress cookie extraction, Account workspace and separate global session
consumer. The adapter implements HTTP login over Password's public Capability
and logout over Account's issuer. Its `/auth/methods` discovery response supplies
the existing Shell with the `/auth/password/login` password action and matching CSRF
cookie/header policy. Console's existing SessionBoundary still
authenticates the ingress-selected session. The real owner integration test and
its optional HTTPS browser hook below exercise this composition.
Serve the browser through HTTPS at the configured exact origin so Secure
Cookies are usable. The native loopback listener alone is not that TLS boundary.
`Authorization: Session <credential>` also uses Account's lowercase `session`
scheme; literal `Bearer` is not accepted. No Federated/OIDC provider is selected.

Account owns the explicit managed policy: idle timeout 1800 seconds, absolute
timeout 43200 seconds and renew interval 300 seconds. Issue callers are exactly
`lenso.auth.password/default`; renew callers are exactly
`lenso.auth.session-renewal/default`. Account Admin and credential-state caller
allowlists admit `lenso.auth.account.console/default`. The template's finite
management ceiling permits only `auth.subject.read` and `auth.session.read` for
deployment `security-workspaces`, scope `app/alpha`; Account workspace
`allowed_mutations = []` stays read-only. A ceiling does not grant a role:
ordinary members still fail current scoped Access policy. Subject status changes
and session revocation require separately approved policy, scoped grants and
explicit mutation configuration.

The global session consumer belongs to `console-global-extensions` and can be
removed independently of the Account workspace and business storage. It uses
the existing Shell contribution contract; no Shell defaults are changed.

Select `lenso.access-control.console/<instance>` with `issuer`, `public_key`,
`assertion_max_ttl_seconds`, `caller_instances:["lenso.console.web/console"]`
and `scope:{kind,id}`. Select `lenso.audit-log.console/<instance>` with the same
authority/caller fields, `access_scope:{kind,id}` and
`audit_scope:{module,type,id}`. Use distinct Instance names for distinct scopes.
The App also chooses each Instance's mount in Console `workspace_mounts`:
Access `alpha`/`beta` use `/access/alpha` and `/access/beta`; Audit `alpha`/`beta`
use `/audit/alpha` and `/audit/beta`. These explicit mounts let both Instances
of each workspace coexist. Console publishes canonical `basePath` values with
a trailing slash. The template and both native tests use these App-owned mounts.
Console's existing session admission permits navigation; each owner rechecks
the caller's signed assertion and current scoped Access policy before reading.
Neither workspace grants permissions or exposes mutation operations.

The focused native integration test uses **deterministic in-memory Capability
fixtures**, not live Account credentials or PostgreSQL persistence. Its requests
cross a real socket, Web Ingress, Console's existing SessionBoundary and the
actual owner workspace adapters. It checks role/binding reads, Audit pagination,
two Instance scopes, ordinary-member/cross-scope/revoked denials before domain
reads, absence of Audit append, and UI removal while the business owner port and
health remain available. It must not be reported as live storage qualification.
Access revocation is also exercised while the session remains valid; its current
policy is checked again on the next workspace request.

The separately ignored `postgres_tests` path uses the real Postgres Access and
Audit implementations. Supply an explicitly disposable database named
`lenso_security_test*` in `LENSO_SECURITY_TEST_DATABASE_URL` and run that test
with `--ignored`. It explicitly invokes owner schema setup and public bootstrap,
role, binding and event APIs in a headless fixture phase before starting UI.
Stored reader bindings can then be revoked while fixture Auth stays valid, and
stored audit records remain accessible to the business reader after UI removal.
Auth signing keys and session credentials in this path are generated test
fixtures; it qualifies real Access/Audit persistence, not live Account login.
The caller owns disposal of the temporary database after the test.

`auth_tests::postgres_auth_login_management_rotation_and_durable_revocation`
adds a separate real Auth integration path. It explicitly sets up Account's
managed-session schema, Password, Access and Audit storage, then registers test
subjects through Password's public Capability and provisions scoped management
roles through Access Admin before starting the UI. It uses the actual environment
Secrets provider: `LENSO_SECURITY_TEST_SIGNING_KEY` and
`LENSO_SECURITY_TEST_TOKEN_PEPPER` must contain independent, freshly generated
test-only secrets. They never enter Plugin configuration or test output. Use a
fresh disposable `lenso_security_test*` database; this test does not clear a
previous database or operate on production accounts.

Compile this path with the optional `browser-auth` feature. It explicitly selects
`lenso.auth.password-web-session/default`, the
existing `lenso.auth.session-renewal/default`, and
`lenso.auth.account.console/default`, plus the optional
`lenso.auth.session-console/default` global session surface with the same explicit
session/CSRF cookie names. Login uses the real Password HTTP endpoint
and Account-issued managed credentials, with a fixed HTTPS `allowed_origin` and
matching ingress session/CSRF cookies. Test requests use a loopback HTTP socket
and manually supply Cookie/Origin headers; they do not qualify browser TLS or
browser automation. The four original Access/Audit mounts coexist with the
App-selected `/accounts` mount. The Account workspace has explicit mutation
allowance and confirmed inputs; its signed and current management ceilings,
current credential state and scoped Access policy remain owner checks.

The test covers real subject/session pagination, member and cross-scope denial,
session revocation, disable followed by enable without restoring old sessions,
Origin/CSRF rejection, two simultaneous renewals with exactly one new credential,
and current state after renewal. The competing HTTP request may return a stale
409 or a 503 from existing bounded provider admission; neither sets cookies.
A subsequent serial replay of the old credential must return stale 409 without
cookies. A historical
credential remains rejected by Auth while CSRF-admitted logout may revoke its
same current session through the issuer. Failed login, renewal and logout must
not set cookies. Business storage continuity after removing UI remains covered
by the first PostgreSQL test above; it is not repeated here.

The integration test explicitly opts into all four management permissions and
both allowed mutations for synthetic subjects through its fixture setup. That
test configuration differs from the read-only product template; it is not a
startup grant or a default product permission. The App template fixes Account
Instance, deployment/scope, caller allowlists and a read-only ceiling. Linking
these plugins does not provision accounts, grant roles or enable mutations.

For a separate browser pass against that disposable fixture, optionally set
`LENSO_SECURITY_TEST_SHELL_ROOT` to an absolute existing built Shell directory
and `LENSO_SECURITY_TEST_ALLOWED_ORIGIN` to the exact HTTPS proxy origin (default
`https://app.example`). With `LENSO_SECURITY_BROWSER_READY_FILE` set, the test
publishes only `{origin,subjects}` at that exact path after UI startup and pauses
before automatic HTTP assertions or mutations. Create `<ready-file>.done` after
the browser pass to continue; it polls every 250ms for at most 120 seconds and
requires a fresh completion-marker path. This hook does not write credentials,
change TLS configuration or create accounts beyond the explicit fixture setup.
Before publishing readiness, the test checks the login page, generated asset and
method discovery through real HTTP, including their no-cookie responses.
Without these variables the normal native test path is unchanged.

```sh
cargo test --locked --manifest-path examples/security-workspaces/Cargo.toml --lib -j 1
cargo test --locked --manifest-path examples/security-workspaces/Cargo.toml --no-default-features --lib -j 1
LENSO_SECURITY_TEST_DATABASE_URL=postgres://localhost/lenso_security_test_workspaces \
  cargo test --locked --manifest-path examples/security-workspaces/Cargo.toml --lib -j 1 \
  postgres_owners_keep_real_readonly_scopes_and_state_after_ui_removal -- --ignored
# With a fresh test database and independently generated test-only
# LENSO_SECURITY_TEST_SIGNING_KEY / LENSO_SECURITY_TEST_TOKEN_PEPPER already set:
cargo test --locked --manifest-path examples/security-workspaces/Cargo.toml --features browser-auth --lib -j 1 \
  postgres_auth_login_management_rotation_and_durable_revocation -- --ignored
```

`--no-default-features` omits Console and its optional workspace UI dependencies. Storage facts and
Auth implementations remain independently owned by their headless plugins.
