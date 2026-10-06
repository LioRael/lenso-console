# Console language preferences

Console owns language resolution and the HTTP boundary. The selected
`lenso.console.locale-store@1` provider owns durable preferences and its standard
storage migrations. Console does not write account tables, create tables at
runtime, or treat browser storage as account persistence.

## Resolution and account admission

The supported preferences are `global`, `en`, and `zh-CN`. Resolution uses the
account's explicit language first, then the configured global default, then a
supported browser language, then English. `global` means follow the global
default; clearing the global default enables the browser/product fallback.

A verified user may obtain a Console session and enter personal settings with
an empty workspace allowlist and no administrator, operator, or assistant grant.
This does not grant access to workspace services or administration APIs. The
Operators profile continues to verify its separate realm, signed assertion,
audience, validity, and absence of scoped delegation before admitting locale
requests. Its other routes retain the existing `console.operator` policy.

Console derives the preference key from the sealed, authenticated assertion's
`issuer` and `subject`. The wire issuer must match sealed extension metadata,
and the actor must be a user. Request bodies cannot specify either identity.
For two Console tool workspaces or Console instances to share preferences,
the App must bind them to the same durable provider and deployment scope. A
store provider must restrict callers to the configured Console instances and
retain the sealed assertion when checking a personal preference request.
The Auth issuance owner must include the exact signed audiences
`lenso.console.locale-store@1:read_preference` and
`lenso.console.locale-store@1:write_preference`. Kernel filters sealed extensions
for each target operation; Console cannot add audiences to an existing signature.
The locale snapshot fails closed if the configured authority does not issue the
required audience. Existing sessions may need reauthentication after an authority
audience configuration change.

## Default-language permission

Changing a global default requires the Access Control permission
`console.locale.default.manage`. Console checks it independently on each HTTP
write. Being listed in `administrator_subjects` does not implicitly grant it.

In an Operators profile, the default permission scope is the profile's
`deployment` with scope kind `deployment`. Other authenticated profiles need
an explicit Console configuration, for example:

```json
{
  "require_user_session": true,
  "locale_permission_scope": {
    "scope_kind": "deployment",
    "scope_id": "my-deployment"
  }
}
```

The App supplies the corresponding Access Control binding and grants through
its existing authority. `locale_permission_scope` may also explicitly override
an Operators profile's permission scope. Its kind and ID must be nonempty
canonical values. When a locale, assistant, or Operators permission policy is
selected, Console requires exactly one shared Access Control binding; the
locale store permits zero or one binding. Without a scope or Access Control
client, the global-default write is forbidden. The UI's permission flag is
advisory; direct HTTP requests receive the same server check.

## HTTP contract

These are canonical Console API paths. Instance-specific API prefixes follow
[the existing HTTP path projection](console-instance-http-paths.md).

| Method and path | Body | Authorization |
| --- | --- | --- |
| `GET /api/console/v1/locale` | None | Public defaults without credentials; account snapshot with a valid user credential |
| `PUT /api/console/v1/locale/preference` | `{"preference":"global"}` or a supported language | Verified user; modifies only the derived account |
| `PUT /api/console/v1/locale/default` | `{"locale":"en"}`, `{"locale":"zh-CN"}`, or `{"locale":null}` | Verified user plus `console.locale.default.manage` |

Successful reads and writes return a current snapshot:

```json
{
  "global_default": "en",
  "preference": "global",
  "locale": "en",
  "can_manage_default": false,
  "available": true
}
```

A null resolved `locale` asks the client to use browser/product resolution.
Public reads return preference `global` and no management permission; no other
account data is exposed. The ingress projects a configured session cookie to a
credential, so a request carrying a session cookie is authenticated rather than
silently treated as anonymous. Invalid credentials receive the existing Auth
response. Existing origin and CSRF checks apply to cookie-authenticated writes.

Unknown body fields and unsupported values are rejected with 400. Anonymous
writes receive 401; global writes without permission receive 403. Missing or
failed store bindings return 503 `locale_store_unavailable`; they never report
a change as persisted. API responses use `Cache-Control: no-store`.

## Initial HTML and session stability

The Shell HTML includes an `application/json` script with ID
`lenso-console-locale`, containing only the public `global_default` and resolved
`locale`. Its `lang` uses that public default or supported `Accept-Language`
priorities, including quality values. Store read failures use browser/product
fallback and do not invent storage availability. HTML responses use
`Cache-Control: no-store` and `Vary: Accept-Language`.

The account preference is prepared before session content is admitted. Changing
language does not change the session read scope, remount identity, refresh
callback dependencies, or query-cache admission. Catalog loading and account
transitions use generations so a retired locale response cannot apply to a new
account or override a later selection. Translation providers retain the English
catalog for missing-key fallback; dates and numbers use the shared locale-aware
formatters.

## Focused validation

The generated-client fixture uses an actual Kernel capability binding and
endpoint. Its in-memory store is test-only and is not a production provider.

```sh
cargo test -p lenso-console-plugin generated_store_enforces_personal_identity_and_independent_default_permission
cargo test -p lenso-console-plugin bound_auth_rechecks_each_user_and_revocation_without_fallback
cargo test -p lenso-console-plugin public_shell_bootstrap_uses_supported_language_quality
```

The first test covers personal writes, subject override rejection, subject and
issuer isolation, sealed identity preservation across capability calls,
explicit default permission, absence of a permission scope, explicit language
overrides, and following the global default. The second covers a user with no
workspace grants, management rejection, invalid Operators realm, delegation,
and personal settings independent of `console.operator`. These tests do not
replace actual Postgres/D1 migration checks or browser refresh/relogin checks.
