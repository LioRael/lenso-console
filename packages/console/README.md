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

The published baseline is TS Lenso `0.2.0`. Additional Core/Engine/Manage seams
are pinned to an immutable source commit in
`tooling/distribution/framework-source.json`. Local preparation and CI fetch the
same revision and build the same archives before dependency installation:

```sh
node tooling/distribution/prepare-ts-framework.mjs
pnpm install --frozen-lockfile
pnpm --filter @lenso/console typecheck
pnpm --filter @lenso/console build
```

Archives and their source revision/hashes are generated under `.artifacts/framework`.
Relative overrides cover transitive dependencies. No machine path is committed,
and the archives are not a registry release. An optional existing checkout must
be clean at that exact revision; dirty source and mismatched commits are rejected
without reset or patch fallback. Update the pin and lockfile together when the
framework revision changes.

The full shell cutover, Agent removal and live browser acceptance are still in
progress. API integration tests and a neutral Fetch import graph do not establish
Workers deployment, production data migration or feature parity.
