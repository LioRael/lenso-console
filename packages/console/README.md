# TypeScript Console plugin

This directory is a local TypeScript replacement candidate for the old native
launcher. It is private and not a published replacement for
`@lenso/console@1.5.2`. The same version number does not establish registry
compatibility. Use the exact built archive with the matching SDK candidate.

`createConsolePlugin` installs into the application's existing Lenso graph.
`createConsoleService` is the lower-level Fetch adapter. Neither starts an app,
owns a listener, launches Agent, nor stops a borrowed `RunningApp`.

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
unsupported by this finite Manage adapter: `subscribe` retains its signature but
rejects with 501. TS page descriptors explicitly select `lenso-console-rpc/2`.
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

## Local framework consumption

The bridge uses the immutable framework commit
`93dc3a81226d981a861b8afe51e25d07538aded5`, including the delivered borrowed-runtime
seams and optional management companions. Its cohort is Core `0.3.0`,
Engine/Manage `0.4.0`, Auth/Web `0.3.1`, and the matching optional package builds.
Some companion exports are newer than the registry implementation at the same
package version; registry version numbers alone do not identify these archives.

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
