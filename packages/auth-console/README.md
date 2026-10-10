# @lenso/auth-console

Optional Auth administration adapter and ordinary React Console binding. Nothing is
automatically installed, registered, exposed over HTTP, or granted administration rights.

## Actual Auth boundary

Inject the standard domain service created by `createSessionAdministration` from
the released `@lenso/auth/sessions` entry through the `administration` option.
The structural `SessionAdministration<P>` interface accepts its `list`, `get` and
`revoke` methods without importing unpublished Framework source. The domain factory
owns the exact staff Access, explicit target realm/policy, and strict
`Audit.prepare`/`Audit.complete` lifecycle. The application does not need to invent
an administration repository. Build the service for the same exact target and
staff Access supplied to this adapter.

`SessionStore` remains trusted credential-bearing storage, not an authorized
administration service. Console never uses it directly and never copies a staff
actor into customer Access.

The legacy explicit `sessions: AdminSessionRepository` seam remains available:
`list`, `read`, and `revoke` are independently optional. Do not supply both seams.
Legacy records use `createdAt`, not `issuedAt`, and may omit revision. Absence of
either backend omits server methods and UI capabilities, never fake empty lists
or successful no-ops.

## Server

Import `createAuthConsoleServer` from `@lenso/auth-console/server`.
Supply:

- `target: { plugin, access }`: the **exact installed customer Auth Plugin** and its
  exact Access reference, obtained from the application's assembly. Same realm names
  do not identify the same target instance. Neither object goes to the browser.
- `staff`: a trusted staff Auth Access, separate from customer authentication.
- `policy`: a mandatory target-instance/action/session policy. The adapter first
  calls `staff.required(evidence)` and then `staff.enforce` with that staff actor.
  It never passes a staff actor to customer `target.access.enforce`.
- Optional domain `administration` service (or the legacy explicit `sessions` seam)
  and `subjects` application-owned directory.
  The directory is read-only. It does not imply Auth owns accounts or profiles.
- Optional `info: { realm, source, policy }`: explicitly projected descriptions safe
  for staff display. No configuration introspection or arbitrary configuration dump.

All methods accept trusted-entry evidence and an optional AbortSignal. Evidence
must come from the host's verified credential extraction, never from business JSON
claiming to be an actor. Every invocation authenticates and checks policy. The
domain service receives the exact verified staff actor and signal, never evidence
or a reconstructed actor. Legacy repositories receive that actor, exact target
references and signal. The adapter cannot infer storage ownership from realm names.

The domain path exposes `listSessionPage(evidence, { limit?, cursor? }, signal?)`,
`readSession(evidence, id, signal?)`, and
`revokeSession(evidence, id, signal?, expectedRevision)`. Pages are bounded by
`maxResults` (default 100, at most 1000); an excessive request/output fails rather
than silently truncating. `nextCursor` is opaque and is `null` at the end. The legacy
`listSessions(evidence, signal?)` still returns an array and does not invent pagination.
Domain `issuedAt` maps to DTO `createdAt`; revision is a positive safe integer.
DTOs include kind, last-active time, absolute stored expiry and optional revocation
time, but no digest, credential or assurance. Stored expiry is not an idle-expiry
prediction.

Outputs are reconstructed from an allowlist and validated server-side. Unknown
fields, including token digests, tokens and arbitrary metadata, are discarded.
Session/detail IDs and realm IDs are checked; invalid output fails closed.
Do not put secrets into approved display fields. Host transport adapters should
map exceptions to safe errors, not serialize raw thrown repository errors.
Preserve stale-revision and audited outcome-unknown semantics in safe transport
errors. An unknown audit/write outcome is not proof of failure or success. Reload
or inspect the session and audit intent before retrying; never automatically retry
destructive requests.

The host explicitly wires these async services to its existing SDK/transport. This
package introduces no RPC engine, routes, authorization backend, Organization or
APIKey business service.

## React

```ts
import { authConsole } from "@lenso/auth-console/react";

const customerAuthBinding = authConsole({
  id: "customer-auth-production",
  client: existingSdkAuthConsoleClient,
  routes: {
    info: "/customer-auth",
    sessions: "/customer-auth/sessions",
    session: "/customer-auth/sessions/:id",
    subjects: "/customer-auth/subjects",
  },
});
```

Plain clients can import types from `@lenso/auth-console/client` without pulling in
React or Framework. The SDK client implements `AuthConsoleClient`. Capabilities
are server-derived UI projections, never authorization grants. Only a supported
method with an explicit host route contributes a page/navigation destination.
Detail links require the detail route; revoke controls require the revoke capability
and method. There is no user CRUD page. Two bindings retain independent clients/routes.

The return value is an ordinary `ConsoleBinding`, using only type imports from
`@lenso/console-react`. No server Plugin is passed to browser code. The host owns
trusted session scope and must replace the binding/activation on subject, target or
permission changes. Pages abort reads on retirement and discard late results.
Paginated clients implement `listSessionPage(input, { signal? })`; the UI refreshes
from the first page and loads real cursor pages, aborting superseded requests and
discarding late results even if a backend ignores abort. Legacy clients retain
`listSessions({ signal? })` and do not show Load more.
Revocation confirms the displayed session and passes its captured revision through
`revokeSession(id, { expectedRevision, signal? })`. A failed/unknown response blocks
retry in that view and asks for reload/inspection. Cancellation cannot undo a write
already dispatched.

Default pages use semantic HTML and Lenso UI `Button` controls with large (44px)
targets, plus loading/empty/error and real action-result messages. Pages remain in
the host's shared Layout/Dock context without a second shell or activation lease.
They inherit the host's typography/theme; no palette, icons or assets are generated.
Optional `pages` overrides let the application use its existing Lenso UI renderers.
Design direction is content-first Console, ENERGY 1 / RHYTHM 1 / MOTION 1:
native reading hierarchy keeps the target/session content primary without decorative
cards or new floating controls. Host browser/theme/geometry checks remain required.

## Local checks

Use `bun test`, `bun run typecheck`, and `bun run build` in this package after the
integration owner has supplied manifests and installed built Auth/Core/Console
artifacts. `build.ts` emits public `server`, plain `client`, and `react` entries and declarations.
Tests prevent staff/target confusion across two same-realm instances, secret-bearing
raw output, fabricated unsupported capabilities and cross-binding client reuse.
