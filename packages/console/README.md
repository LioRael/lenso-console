# TypeScript Console plugin

This directory is a local TypeScript replacement candidate for the old native
launcher. It is private and not a published replacement for
`@lenso/console@1.5.2`. The same version number does not establish registry
compatibility. Use the exact built archive with the matching SDK candidate.

`createConsolePlugin` installs into the application's existing Lenso graph.
`createConsoleService` is the lower-level Fetch adapter. Neither starts an app,
owns a listener, launches Agent, nor stops a borrowed `RunningApp`.

## Current TypeScript Lenso model

The following code evidence was checked against official
[`LioRael/lenso` main at `9dc049e`](https://github.com/LioRael/lenso/tree/9dc049e695d3063c960be861b53004f1def92573),
not the older local framework archive or the Rust workbench:

- **Runtime assembly is explicit.** A `Plugin<T>` declares an ID, exact
  `requires` objects and `setup`; `defineApp` returns the supplied plugin array.
  Core validates unique IDs, exact installed dependencies and cycles, then
  performs dependency-first serial setup. `context.get` can access only declared
  dependencies; `app.get` addresses an installed exact instance.
  Sources: [plugin declarations](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/packages/lenso/src/plugin.ts#L30-L59),
  [graph validation](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/packages/lenso/src/diagnostics.ts#L113-L148).
- **Services remain ordinary TypeScript.** Notes composes database, Auth and
  business plugin instances in an application factory. The business service
  exposes ordinary async methods, validates input and enforces audience/owner
  policy itself; it does not need a management descriptor to exist or run.
  Sources: [application factory](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/examples/notes/src/application.ts#L7-L27),
  [Notes service and plugin](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/examples/notes/src/notes.ts#L68-L153).
- **Cleanup belongs to resource acquisition.** Register `onCleanup` during
  setup immediately after acquisition. Its returned disposer and automatic
  cleanup share one completion. `stop()` is idempotent, awaits LIFO finalizers
  and attempts all of them; failed setup drains registered resources too.
  This startup rollback is resource cleanup, not rollback of business effects.
  Source: [Core lifecycle](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/packages/lenso/src/lifecycle.ts#L120-L247).
- **Plugins own schemas; applications choose values and sources.**
  `definePluginConfig` declares the contract and `bindConfig` accepts direct
  values or explicit sources. Core reads sources in order (later top-level
  fields win), validates all bound configuration before any plugin setup and
  exposes startup provenance without values or opaque revisions. Notes selects
  environment adapters explicitly; database/store functions remain structural
  dependencies, not serialized config.
  Sources: [binding and resolver](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/packages/lenso/src/config.ts#L158-L420),
  [Notes configuration boundary](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/examples/notes/CONFIGURATION.md#L1-L27).
- **Entries are opt-in adapters.** Notes Web explicitly selects service/Auth
  instances and routes; its server adds the listener and calls `startApp`.
  CLI operations and optional Manage collections select existing methods;
  named `operations`, `manage`, `mcpOperations` and `operationBinding` exports
  are application choices. Trusted entry context supplies evidence, while the
  service retains business authorization. Manage borrows the narrow
  `instanceId`/`get`/`logger` runtime (including a scoped `PluginContext`), not
  application start/stop authority.
  Sources: [Web](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/examples/notes/src/web.ts#L23-L113),
  [server](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/examples/notes/src/server.ts#L28-L63),
  [entry selections and binding](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/examples/notes/lenso.config.ts#L29-L60),
  [Manage runtime boundary](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/packages/manage/README.md#L1-L45).
- **Engine is authoring tooling, not the runtime container.** Defaults discover
  `lenso.config.ts`, optionally use `src/server.ts`/`src/router.ts`, generate
  manifest/server/client outputs and register the Bun build target. Discovery
  imports trusted application code without running plugin setup. Optional
  `lenso.engine.ts` extends authoring stages; supervised dev restarts processes,
  rather than promising in-place business-service replacement.
  Sources: [Engine defaults](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/packages/engine/src/engine-defaults.ts#L9-L68),
  [application discovery](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/packages/engine/src/application.ts#L66-L133),
  [Engine lifecycle and dev](https://github.com/LioRael/lenso/blob/9dc049e695d3063c960be861b53004f1def92573/packages/engine/README.md#L27-L110).

**Console direction (recommendation):** compose Console into that same graph,
choose explicit targets, pages and Manage operations, and route it through the
application-owned Web/listener with explicit Auth evidence binding. Do not add a
second container, generic configuration CAS/publication/history/rollback layer
or runtime hot-replacement mechanism to reproduce the Rust workbench model.
Those are not prerequisites of the demonstrated TS path. Any separately
requested product workflow must define its own owner and safety contract.
Retained legacy endpoint limitations below describe compatibility, not missing
mandatory Framework layers or completed feature migrations.

## Application assembly

The application supplies:

- One exact `Plugin<ConsoleAuthentication>`, normally made with
  `createConsoleAuthPlugin` from `@lenso/console/auth`.
- Explicit targets with stable IDs, tenant boundaries, exact plugin objects and
  chosen Manage collections. No host-wide plugin scan occurs.
- A trusted operation binding. Business services retain their own Auth/object
  policy; the Console actor is not automatically the actor for a business audience.
- Optional owner-built page mounts and fixed assets.
- Optional shell response and route-match callbacks. Unmatched routes remain
  with the application's other Fetch adapters.

The Web adapter forwards requests to `app.get(consolePlugin).fetch(request)`.
Pass the Web request-lifetime signal through the Request. The application's Web
or platform listener remains the only listener owner.

Installing pages does not enable RPC. `management: true` explicitly enables
`/api/console/v2/rpc`; source files alone expose nothing. Writes default closed.
`canWrite` records the service owner's write-safety choice but cannot satisfy
required confirmation, approval, idempotency or durable audit.

Pass `config: { contract: consoleConfiguration, sources }` with Core's normal
sources. Core resolves it before setup. Safe configuration discovery reports captured
startup metadata only, not values, opaque revisions, live updates or writability.

## Auth and SDK

Auth integration borrows a host Access view, evidence extractor, current membership
policy, permission revision and session projection. Browser login, discovery,
renewal and logout are explicitly supplied host handlers; their response headers
are preserved. There is no User table or built-in password provider.

Cookie mode requires distinct `__Host-` cookies, exact Origin and double-submit
CSRF. Bearer mode requires the host-issued Authorization credential. JSON actors,
roles and approvals are not evidence. Expected-subject mismatches remain HTTP 412.

Browser clients import `@lenso/console-sdk/transport` or `/protocol`, not server
routers, plugins or Auth objects. Existing page/client/read APIs remain unchanged.
Workspace invokes use oRPC `2.0.0-beta.42` JSON transport. Streaming is explicitly
separate from the finite Manage adapter. Explicit read subscriptions use the
existing oRPC async-iterator transport; finite `invoke` never buffers or invokes
a stream-only method. TS page descriptors select `lenso-console-rpc/2`.
The Shell retains a separate browser-only v1 adapter for older descriptors
without that field, preserving their error, stream and identity semantics during
cutover. Remove that adapter after the remaining qualified v1 Hosts upgrade;
the TS backend does not mount those routes. Legacy `/server` and generated
capability exports remain available, but this backend does not execute their
Rust provider or base64 dispatch path.

Catalog keys belong to one Console startup revision, not durable receipts. Old
keys fail with 409 after replacement. Request cancellation discards responses
and prevents dispatch after pending gates; it cannot roll back completed effects.
Controlled legacy writes requiring persistent receipts/journals remain closed
unless the correct business owner provides equivalent guarantees.

### Explicit workspace subscriptions

Declare the ordinary service's own read method with `defineOperation`, its shared
input schema and an owner-selected public item schema. Select it in that exact
mount service's `streams`, separate from finite `operations`:

```ts
services: {
  events: {
    manage,                    // Installed exact owner; finite operations only.
    operations: [read],
    streams: [{ operation: watch, output: publicItemSchema }],
  },
}
```

The mount requirement lists the selected method names. Console derives
`streaming_operations` from installed declarations and current permissions; a
descriptor cannot supply executable dispatch or grant authority. The unchanged
SDK `services.subscribe(service, operation, input, { signal })` signature uses
these declarations. Hosts with no stream declaration remain unavailable.

Subscriptions must be explicitly read-only and ungated: write/unknown,
destructive, confirmation- or approval-required declarations are rejected rather
than bypassed. Input validation precedes trusted binding; entry authorization is
checked on both sides of that asynchronous binding. Each delivered item uses
fresh credential, identity, scope and policy checks, including after asynchronous
item validation. Scope changes end the stream and require new session admission.
The public item schema owns safe DTO projection. Raw and projected items are
bounded before delivery; the default is 48 KiB per item, with an explicit limit
up to 1 MiB. Align larger limits with the host Web adapter's chunk limit.

There is no automatic stream-result cache, reconnect or replay. Initial, late and
cleanup failures use opaque public errors. Early iterator return, caller/mount
cancellation and owned Console shutdown abort the producer signal and await its
return. The standalone service's `close()` drains its subscriptions without
stopping a borrowed app. Producer waits must honor the signal, and providers own
any detached work: an uncooperative wait can delay cleanup indefinitely. Neither
a timeout nor an abort signal proves that detached work has stopped.

## Local framework consumption

The bridge uses the immutable framework commit
`9dc049e695d3063c960be861b53004f1def92573`, including application composition,
borrowed-runtime seams and reusable Manage selections. Its cohort is Core
`0.3.1`, Engine `0.5.0`, Manage `0.4.1`, Auth `0.3.1`, Web `0.3.2`, and the
matching optional companion builds. Several of these exact versions are not
yet published. They resolve from the source archives, not from guessed registry
releases.

Console prepares one Manage selection per target. Request adapters supply fresh
listing policy and invocation evidence without rebuilding that selection.
Catalog keys are opaque, including when display names are redacted. Console
shutdown closes its selections and drains owned subscriptions without stopping
borrowed applications. This is in-memory selection cleanup, not a publication,
history or hot-replacement workflow.

Preparation works from a clean Console checkout without a sibling worktree:

```sh
node tooling/distribution/prepare-ts-framework.mjs
pnpm install --frozen-lockfile
pnpm --filter @lenso/console typecheck
pnpm --filter @lenso/console build
```

Archives and their source revision and artifact SHA-256
are generated under `.artifacts/framework`. Filenames include the full source SHA,
and relative overrides align direct/transitive dependencies. No machine path is
committed. An optional checkout argument must be clean at that exact commit;
dirty patches are never accepted. The script checks its source before and after
building. It does not reset, merge, publish or claim registry availability.
Refresh the source pin, archives and lockfile together. Remove the bridge only
after the required public exports are available in compatible registry artifacts.
Framework release metadata alone does not establish registry availability.
The source review and consumed archive now use the same commit, but that does
not prove published tarball contents. Do not replace the cohort using version
numbers alone.

## Run the application-owned TypeScript host

`examples/ts-console/serve.ts` is a runnable local isolation candidate, not a
production identity provider or a replacement for every Rust Console feature.
It imports the explicitly selected trusted `lenso.config.ts` through Engine's
`applicationConfigPath` and `readApplication`, then calls Core `startApp`.
TypeScript config executes trusted application code; never point it at an
unreviewed upload or a browser-selected path.

Build the backend and the original Shell before starting:

```sh
pnpm --filter @lenso/console build
VITE_CONSOLE_MODE=api pnpm bundle:local
pnpm service:ts
```

Before the last command, supply your own `LENSO_TS_TOKEN` in the process
environment. It must be 16–4096 characters. There is no default credential,
generated setup secret, injected preview identity, or anonymous administrator.
Do not commit credentials. Open `http://127.0.0.1:3100/authorization`, enter
`operator@localhost.test` in the Shell's account field and your token in its
password field. `LENSO_TS_SUBJECT` changes the configured local operator email.
The existing Auth source verifies the token and issues a bounded, one-hour,
in-memory session. Sessions disappear on restart; the persistent locale
database does not store tokens or session IDs.

This example deliberately binds only `127.0.0.1` on an unprivileged HTTP port.
Browsers accepting Secure `__Host-` cookies on trustworthy loopback origins
can use the original Shell login form. No Authorization-header injection is
needed. Login discovery supplies a separate readable CSRF cookie; unsafe
requests require exact Origin and double-submit CSRF. Session cookies are
HttpOnly, Secure and SameSite=Strict. Listener ingress validates Host and Origin
before any Shell, asset, Auth or API dispatch. This is local isolation, not
TLS, SSO, production rate limiting, session revocation infrastructure or
deployment acceptance.

The trusted config composes Core's optional JSON file source
(`examples/ts-console/local.json`, ignored) followed by its explicit environment
adapter. Core resolves and validates those sources; environment fields take
precedence, and token provenance is marked sensitive. Relative file paths are
resolved against the example directory. Supported environment fields:

| Variable | Default or requirement |
| --- | --- |
| `LENSO_TS_TOKEN` | Required user-supplied local operator token |
| `LENSO_TS_SUBJECT` | `operator@localhost.test` |
| `LENSO_TS_ORIGIN` | `http://127.0.0.1:3100`, exact origin with explicit port |
| `LENSO_TS_API_PREFIX` | `/api` |
| `LENSO_TS_AUTH_PREFIX` | `/auth`, separate from the API prefix |
| `LENSO_TS_SHELL` | `plugins/console/shell/dist/client` in this checkout |
| `LENSO_TS_DATABASE` | `.artifacts/ts-console/locale.sqlite` in this checkout |

For example, select `/operator/api` and `/operator/auth` through those two
environment variables. Both prefixes must avoid Shell-owned namespaces such as
`/assets`, `/authorization`, `/management`, `/settings`, and `/plugins`; invalid
overlaps fail schema validation before acquiring a listener. The host injects the trusted paths into the original
built Shell's JSON bootstrap, not into an alternative frontend. Static files
must remain inside the built directory after realpath resolution; traversal,
symlink escapes and missing asset/API routes never become SPA HTML. The Shell
stays at `/` in this example.

The app explicitly installs the local Auth source, its scoped RBAC policy,
the real Authorization inspection companion and packaged Authorization page,
and an application-owned SQLite locale provider. The inspection returns the
actual policy used for this local operator, not a fabricated service response.
Locale preferences are keyed by realm and subject. Global-default writes use
the independently bound `console.locale.default.manage` permission. The SQLite
adapter owns its schema version and startup migration and rejects unknown
versions. A null global default removes that stored default.

The locale store binds its real database-path startup input with Core
`bindConfig` and is selected for Console inspection. Its metadata reports the
actual direct `values` source and sensitive field provenance, not invented
JSON/environment provenance. The configured path and operator token are never
returned by the inspector. The earlier host JSON/environment resolution is
not repeated for this binding.

There is one `createWebPlugin` and one `createBunListenerPlugin`. Core owns their
cleanup alongside Auth/session storage and the database, including rollback
after failed startup. The embedded Console never starts another listener or
stops a borrowed app. The Web adapter permits packaged response chunks up to
8 MiB because Bun file responses and built page assets can arrive as a single
chunk; this does not remove the backend's separate bounded-request rules.

`pnpm service:ts` consumes built backend/framework entries.
`pnpm service:ts:dev` uses the same trusted config with `lenso-source` conditions
for source development. Changing conditions is not archive/publication evidence.
An alternate trusted config can be passed as the command's sole positional
argument. Tests live in `examples/ts-console/host.test.ts` (listener, original
SDK, persistence, shutdown and static safety) and `cli.test.ts` (both official
commands, original Shell cookie login and protected locale writes with isolated
credentials/databases). Run `bun test examples/ts-console` after building the
original Shell; Chromium must be installed for the command/browser test.

## Current Shell endpoint migration

These are the candidate's current boundaries, not a whole-product cutover:

| Shell contract | TypeScript candidate |
| --- | --- |
| Auth methods, login and logout | Explicit host-owned handlers; this example uses user-supplied local token evidence and real session cookies |
| `/api/console/v1/session` | Authenticated session projection; TS management advertised, Agent and human-management capability unavailable |
| `/api/console/v1/apps` | Authorized, explicit application targets; no host-wide discovery |
| `/api/console/v1/pages` | Authorized owner-selected page mounts, including the real Authorization companion |
| `/api/console/v1/surfaces` | Explicit global contributions only; empty when no global mounts are registered |
| `/api/console/v1/locale` and its preference/default PUT routes | Application-owned durable provider; public default snapshot, authenticated preference, independently authorized global-default write |
| `/api/console/v2/rpc` | Original SDK catalog/invoke and finite workspace Manage calls; protected by current identity, scope and request evidence |
| Workspace `subscribe` | Explicit authorized read subscriptions over oRPC; not generic Manage streaming or automatic replay |
| Plugin workbench discovery/config inspection | TS read-only application metadata replacement; no live configuration write authority |
| Plugin install/select/delete, TOML proposal/history/publication | Retained Rust workbench workflows are unported; not prerequisites of explicit TS application assembly |
| Agent sessions/chat/tools and Agent installation | Unported; no TS Agent transport installed |
| Organization and human/token management | Unported; not enabled by an operator session |

Prefixes above are defaults and are remapped by the trusted host config. Without
a locale provider, the public snapshot reports `available: false` with an
explicit `unavailableReason`, and locale writes return 503. That is an
unavailable capability, not successful fake storage.

The Rust `service:serve` and `agent:web` commands remain explicitly available.
Runnable TS startup and a real management workflow do not establish native
feature parity, production auth, deployment parity or data migration. They are
not authority to remove the retained Rust workflow.

## Optional backend capabilities

Select only the entries your host installs:

| Console entry | Current backend capability |
| --- | --- |
| `/audit` | Host-bound scope query, filters, cursor pagination and authorized event detail |
| `/authorization` | Existing Auth policy adapter, scoped RBAC and read-only role/binding inspection |
| `/api-keys` | Host-bound subject metadata list/read/revoke; separate issue/rotation Fetch adapter |
| `/tasks` | Bounded authorized job list/detail, explicitly safe retry and cancellation request |
| `/scheduler` | Registered-task schedules, revision checks and occurrence reservations |
| `/limits` | Explicit rate/quota binding, execution lease helper and route-scoped pre-auth admission |

These are optional peer dependencies, not a new required database or identity
system. The Console root does not import them. Returned exact plugins and Manage
declarations must be installed/selected by the application. Audit/Tasks/Scheduler
helpers return their trusted `binding`. API Key and Authorization companions use
`{ context: { identity, resource, request }, signal: request.signal }` from the
host's binding for their explicitly selected operations; services recheck authority
after asynchronous host mapping. Console also rechecks entry authority after binding.

Issue/rotation paths have no defaults and must be routed to
`createConsoleApiKeyCredentials` before Console's broad API route owner.
The raw credential is never returned through generic Manage. Replay or a lost
response cannot recover the original secret and must not trigger blind reissuance.
Revoke still needs `canWrite` and its service's current management authorization.
Role mutations remain closed: current service APIs lack the required stale-page
revision and audit guarantees.

Tasks list reads only one provider page, then checks each actual job's ownership.
Filtered pages may be empty with a continuation cursor. Cursors are encrypted,
bound to target/tenant/mount/identity revision and valid only for the installed
service's lifetime; refresh after a restart or permission change. Retries require an explicit
business replay-safety policy. Cancellation and schedule pause do not roll back
external effects.

Frequency/quota use trusted host policy values, not browser buckets. `retryAfterMs`
is milliseconds; HTTP `Retry-After` is rounded up to seconds. An unknown estimate
has no header. Backend faults remain 503. Concurrency leases wrap actual service
execution; expiry is not fencing or proof of stopped execution.

Pass the host logger to Lenso startup and use the host's existing OTel context.
Engine calls reuse that logger and OTel API; Console does not initialize another
SDK or provide log-query storage.

## Install an optional management page

`createConsoleManagementMount` from `@lenso/console/pages` selects the packaged,
owner-built page assets. It does not install a service or start resources:

```ts
const auditMount = createConsoleManagementMount({
  id: "audit",
  page: "audit",
  title: "Audit",
  subject: { kind: "console" },
  manage: auditIntegration.manage,
});
```

Add that mount to the intended target's `mounts`, its exact plugin to `plugins`,
and its declaration to `manage`. Compose the target's binding using exact
operation/plugin references, not a host-wide scan. The other page names are
`api-keys`, `authorization`, `tasks` and `scheduler`. Application subjects use
their canonical `/apps/<appId>/.../` paths; Console keeps its existing frame,
navigation, scoped TanStack reads and page lifecycle.

For API Keys, pass the separately mounted credential adapter as the mount's
`credentials` option. The catalog advertises each path only after its current
authorization check, and the Shell supplies the explicit one-time credential
channel. Issue/rotate results never enter Manage, query caches or result history.
Dismissal and identity/mount retirement clear local credential state. A failed
metadata refresh cannot hide and later resurrect an acknowledged credential.

Scheduler creation uses the real registered-task `catalog` and its JSON schemas.
Supply `authorizeCatalog` to the Scheduler integration; absence returns no task
schemas. Unsupported schema forms keep creation disabled, with no raw-JSON
fallback. The host remains responsible for tick/worker startup.

The v2 protocol survives catalog parsing. Non-admin workspace navigation waits
for discovery before redirecting. The TS session explicitly advertises v2
management; its Management directory uses SDK metadata and links to owner pages,
while qualified older Hosts retain their v1 adapter. No v1 Rust execution path
is used by the TypeScript management pages.

Build and run the existing Shell against the real isolated services:

```sh
pnpm --filter @lenso/console build
VITE_CONSOLE_MODE=api pnpm bundle:local
node --test tooling/distribution/management-ui.test.mjs
```

The browser fixture owns one loopback listener and closes its app, queue and
in-memory databases. It verifies workflows plus 1280px light and 390px dark
focus/target/overflow geometry. Its SQLite D1-shaped adapter is explicitly a
local fixture, not online Workers proof. Provider/native-workerd tests are
separate evidence. Production migrations, deployment and data parity remain
unverified.

The full shell cutover, Agent removal and live browser acceptance are still in
progress. API integration tests and a neutral Fetch import graph do not establish
Workers deployment, production data migration or feature parity.
