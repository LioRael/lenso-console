# @lenso/auth-console

Optional Auth administration adapter and ordinary React Console binding. Nothing is
automatically installed, registered, exposed over HTTP, or granted administration rights.

## Console-scoped administration

The optional `@lenso/auth-console/administration/server` entry provides
`createConsoleAdministrationService`, its plugin/Manage companion, explicit
input/output schemas and the SQLite Console membership/role store. The browser
entry `@lenso/auth-console/administration/react` provides `IdentityPage`,
`AccessPage` and `AgentPage`; render them under the host's SDK workspace and
shared layout, with the public stylesheet. The original `/server` and `/react`
adapters below retain their contracts.

Access keeps non-sensitive role creation and permission drafts in page-local state
when their Modal or Drawer closes. Reopening the same role restores edits; changing
the role, access revision or page lifetime retires the permission draft. Discard
changes restores the current role snapshot. No draft is written to browser storage,
and credentials never participate in this state. Pre-invocation field validation
errors preserve the draft for correction; uncertain writes still require inspection
and explicit reload before another attempt.

Construct storage and the ordinary service during owned plugin setup. Supply
the real directory, trusted caller-provenance/dispatch/disclosure checks, strict
Audit and supported session administration. The activity predicate
`subjectActiveAtCommit` is mandatory and must participate in the same commit
transaction; an absent or stale external status cache is not a last-active-admin
guarantee. This first store deliberately supports one user binding per subject
and flat exact-Console permissions, not inheritance, expiring bindings or
resource-limited graphs whose semantics the UI cannot project.

Directory predicates are opt-in through `directory.statusFiltering` and
`directory.nameFiltering`. The owner receives `usersList.status` and
`usersList.name: { operator: "contains" | "equals", value }` and applies both
before limit/cursor calculation, together with quick search. Name `contains` is
case-insensitive and `equals` matches the complete display name exactly; the local
example uses SQLite's case matching. The service rejects unsupported predicates
and contradictory output rather than filtering a partial page.
`info.supported.userStatusFilter` / `userNameFilter` project those capabilities
to Identity's condition builder. Existing directories and unfiltered callers
retain their contracts. These capabilities do not imply an age field or user CRUD.

Directories may additionally opt into `directory.expressionFiltering`, projected as
`info.supported.userFilterGroups`. This supports `usersList.filter: DirectoryFilter`:
name/status leaves and recursive AND/OR groups, limited to four group levels and 50
nodes. Identity then exposes repeated fields and nested groups. Empty editing groups
are neutral, including inside OR; the service validates the complete request and
rejects contradictory returned rows. Owners must evaluate parentheses before pagination,
not filter one returned page. Legacy `status`/`name` parameters, when supplied, remain
additional AND constraints. The local SQLite adapter uses whitelisted SQL fragments and
bound values. Identity has no date-bearing directory field, so it exposes no date rule.

Credential creation/rotation remains a protected human-only, one-time channel,
not a generic Manage tool. The server and Console/MCP transports select the same
installed service. See the [local assembly and Codex setup](../../examples/ts-console/README.md)
for explicit initialization, source ownership, protocol release boundaries and
focused checks. Nothing bootstraps a real administrator or publishes a package
without separate approval.

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
  label: "Customers",
  navigation: {
    info: {
      label: "Customers",
      tooltip: "Inspect customer authentication information",
    },
    sessions: {
      label: "Customer sessions",
      tooltip: "Review and revoke customer sign-in sessions",
    },
    subjects: { label: "Customer subjects" },
  },
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

`label` still qualifies page titles, for example `Customers: Sessions`.
For backward compatibility, navigation without explicit overrides still uses
those qualified titles. `navigation.info`, `.sessions`, and `.subjects` may
override `label`, `tooltip`, `icon`, and `defaultPlacement` independently.
The explicit destination label is both visible and accessible; tooltip text
never substitutes for it. Overrides cannot add unsupported destinations or
turn the parameterized session detail into global navigation.

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

Import `@lenso/auth-console/styles.css` alongside the host's Lenso semantic theme
and Console styles. The React build extracts StyleX into this public stylesheet;
plain client and server entries do not import UI styles.

Default pages use semantic HTML and Lenso UI `Button` controls with large (44px)
targets, plus loading/empty/error and real action-result messages. Pages remain in
the host's shared Layout/Dock context without a second shell or activation lease.
They inherit the host's typography/theme; no palette, icons or assets are generated.
Optional `pages` overrides let the application use its existing Lenso UI renderers.
Design direction is content-first Console, ENERGY 1 / RHYTHM 1 / MOTION 1:
aligned session rows make IDs, subjects, stored expiry and revocation state
comparable, reflowing into labelled fields on narrow screens. Metadata uses a
consistent label/value hierarchy; subjects keep display label, ID and realm
distinct. Quiet semantic boundaries group records without decorative cards;
inherited typography and restrained spacing keep content primary. IDs wrap rather
than truncate. The host Shell owns edge/Dock clearance; local end spacing also
lets final actions scroll above taller corner contributions without duplicating
a shell header or footer.
No assets, custom palette, new navigation or animation are introduced.
The existing information widget shares metadata styling without page spacing
or a duplicate heading; Dashboard remains responsible for its title and frame.
Host browser/theme/geometry checks remain required.

## Local checks

Use `bun test`, `bun run typecheck`, and `bun run build` in this package after the
integration owner has supplied manifests and installed built Auth/Core/Console
artifacts. `build.ts` emits public `server`, plain `client`, and `react` entries and declarations.
Tests prevent staff/target confusion across two same-realm instances, secret-bearing
raw output, fabricated unsupported capabilities and cross-binding client reuse.

### First-round UI verification (October 12, 2026)

- Headless Playwright Chromium rendered all four pages in
  `examples/composed-console`, at 1280×900 and 390×844, in light and dark themes.
  This is a sample-data host, not production Auth. A temporary loopback host on
  port 5176 substituted the built `dist/react.js` for the example's source alias
  and imported the exported stylesheet, proving the distributed styles visibly
  render rather than relying only on source compilation.
- Screenshots captured information, sessions, detail and subjects at both sizes
  and themes, plus narrow confirmation, loading, empty, error and uncertain-write
  states. Desktop fields aligned; narrow fields reflowed; a 160-character ID
  stress check had no horizontal overflow. Final actions could scroll above the
  sample host's taller corner controls and retained 44px hit targets.
- Load more appended the third sample session; Refresh returned to the first
  page. Keyboard Tab/Enter opened detail; Cancel and Escape restored the revoke
  opener; Confirm used the displayed revision and focused the success message.
  Revocation persisted when navigating back to the sample list.
- Browser-only client failure injection exercised loading, empty/not-found and
  read-error feedback. Unknown-write feedback received focus and disabled retry.
  No real backend write was involved. Measured label contrast was 5.14:1 light
  and 8.58:1 dark; error feedback was 5.07:1 light and 6.47:1 dark.
- The extended `verify-browser.mjs` passed with no page errors, failed requests or
  external requests. Package `bun test` (10 tests), `bun run typecheck` and
  `bun run build`, composed-host typecheck/build and sample-client tests passed.
  The example build retains its large-chunk warning. React Doctor's changed-scope
  scan reported no findings, with an unchanged 75/100 package score.
- The final persistent narrow-ID/end-action proof and the sample host's compiled
  Console React development workaround were added after that full browser run.
  Those latest edits await the live preview check; equivalent narrow geometry
  was already exercised by the ad hoc Chromium walkthrough.
- Production assembly, real transport/authorization, Safari/Firefox and a manual
  screen-reader walkthrough were not tested. Screenshots are review captures,
  not committed design assets or visual-baseline tests.
