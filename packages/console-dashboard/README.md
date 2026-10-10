# Optional Console dashboard

`@lenso/console-dashboard` is an ordinary frontend binding and a separately
imported server helper. Console React owns page hosting, foreground composition
and action scope. It never receives dashboard definitions, documents or stores.
No widget is installed implicitly and there is no mock business data.

## Frontend

Import `bindDashboard`, `defineDashboardWidget` and widget types from
`@lenso/console-dashboard/react`. The root export is only the shared JSON/store
contract. Supply an explicit `widgets` list and a `DashboardStore` already bound
to application authorization. Each definition is bound to a stable `bindingId`
and `widgetId`; multiple instance IDs can refer to that definition. A renderer
closes over its admitted services. Neither persisted JSON nor a definition
reference creates service authority.

```tsx
const binding = bindDashboard({
  id: "home",
  route: "/",
  services: {
    store: authorizedStore,
    widgets: applicationWidgets,
    defaults: applicationDefaults,
    permissionKey: sessionPermissionRevision,
  },
});
```

Render inside a `ConsoleShell` host, which supplies `ConsoleLayout` and the
action-scope host. Import `@lenso/console-dashboard/styles.css` once in the
application. The library build lowers StyleX and includes the grid library's
stylesheets in that CSS export. Server-only consumers import `/server`, never
`/react`.

Widgets provide title, configuration version, optional implementation revision,
synchronous `configSchema.parse(unknown)` and
JSON default configuration, default/min/max sizes, renderer, and optionally a
controlled `ConfigEditor`. Parsers must reject unsupported input and return JSON
objects. Configuration migrations are application-owned; this package does not
guess a migration or evaluate executable values from preferences.

Each renderer has a distinct activation/signal, keyed by instance ID, definition,
configuration version/content and permission revision, never by placement.
Renderer props include the stable definition reference and implementation revision
for use with the admitted client's target/subject read scope when forming cache keys.
Replacing renderer code or its implementation revision revokes the old lease.
Changing layout, selecting a widget, or entering edit mode preserves renderer
state. Configuration or permission changes revoke the old activation and abort
its signal. Renderers must still discard late results using `isCurrent()` and
must not treat client visibility as authorization.

Editing uses a local draft. Failed saves keep it intact. Retrying unchanged
content uses the same mutation ID; editing again creates a new mutation. A
conflict requires explicit reload with discard confirmation, not an automatic
draft replacement. Undo affects only layout, not config or instance membership.
Restore defaults replaces the draft, not the server document until save.
Missing/incompatible definitions and restricted instances never mount a
renderer or editor. Unavailable plugin data remains recoverable server-side.

One 12-column logical layout is persisted. At widths below 600px the same grid
reflows to a row/column-ordered single column without changing saved geometry.
Desktop drag/resize uses `react-grid-layout` 2.3.0, not a custom drag engine.
Keyboard-operable move/size controls edit that logical layout in either view.
Grid sizing and placement are integer bounded and cannot overlap. The library's
ordinary drag interaction handles collision movement; keyboard edits reject
occupied positions rather than occluding another widget.

## Server integration

Import `createAuthorizedDashboardStore`, `createMemoryDashboardRepository`,
repository/policy types and typed errors from `/server`. Create a store per
trusted request context, then expose its `read` and `save` through the
application's existing authenticated transport. There is no new RPC/auth layer.

The trusted resolver supplies application/dashboard, applicable target/tenant,
and a realm-qualified personal owner **or** shared organization. The organization
key contains no viewer subject. `canRead`, `canWrite` and `canUseWidget` are
separate policies. `revision(context, scope)` must cover the trusted identity and
all permission facts used by those policies. A change during async authorization
or projection rejects the operation, including deletion of an existing widget.
This permission revision is an ephemeral guard, not a persistence identity.
Context represents a trusted request, not browser-supplied tenant/actor fields.
A durable repository must integrate policy/ownership revocation with its
transaction boundary when stronger cross-process guarantees are needed.

`DashboardRepository.transaction` must isolate a scope, roll back on exceptions,
and implement atomic revision CAS plus unique `(scope, mutationId)` records.
Mutation fingerprint covers expected revision and canonical request content.
An identical replay returns its committed snapshot, projected under current
authorization; a different-content replay is rejected. Persist mutation records
for the application's documented retry lifetime; do not silently evict active
retry identities.

Reads replace restricted config with `{}` and identify restricted IDs.
On save, hidden instances and their configuration and placements are restored
from the transaction's original document. Clients cannot forge hidden config,
rebind it or delete it by omitting it. Missing/version-incompatible plugin
records also survive projected saves. New instances require an allowed admitted
definition and valid version/schema. Configure the server's definition list from
the same application-owned schema/size metadata, without importing React.
Documents enforce unique IDs, one placement per instance, finite JSON, 100
instances, 12 columns, 1000 rows and a 256 KiB serialized ceiling.

The memory repository serializes transactions within **one process**, copies
inputs/outputs and retains mutation results. It is neither durable nor a
distributed consistency mechanism. It does not use localStorage.

## Local verification

From this package run `bun test test`, `bun build.ts` and
`bunx tsc --noEmit -p tsconfig.json` with workspace dependencies installed.
The parent integration owns dependency installation, root manifests and lockfile.
Real browser acceptance must verify renderer preservation through placement,
restricted/missing renderer non-mount, drag/resize, keyboard controls, explicit
reload/conflict, config editing, themes and narrow reflow before UI completion.

Design rationale: existing semantic surface colors and inherited typography
preserve Console theme identity; compact widget headings leave space for actual
content; a top-right save group communicates page ownership; the existing Dock
selection scope owns selected-widget actions; 44px edit controls remain usable
by touch; no page entrances or decorative motion compete with live content.
Direction: ENERGY 1 / RHYTHM 2 / MOTION 1.

## Optional trusted Auth adapter

Import `createDashboardAuthAuthorization`, `createAuthDashboardStore` and
`DashboardAuthResource` from `@lenso/console-dashboard/server/auth`.
The adapter uses the actual `@lenso/auth` `Access.enforce` API on every identity,
policy and revision check. An object containing actor-looking fields, a cloned
actor, an actor from another Auth runtime or an actor for another audience is
not authority. Obtain the principal through the same audience-bound Access;
the adapter never accepts browser actor/tenant fields as scope selectors.

Personal ownership is derived from the verified actor's realm and subject.
Organization ownership is a fixed trusted selection shared by its viewers.
Application, dashboard, target and tenant are also server-owned selections.
Access memberships and explicit read/write/widget callbacks remain application
business rules. The adapter is not an automatic permissions engine.

This example assumes an application's `members.read(subject, scope)` returns
authoritative, versioned membership facts (`revision`, `dashboardRead`,
`dashboardWrite`, `widgets`). Those fields are an application contract, not
additional Auth APIs. `roleStore` is an Authorization `RoleStore`;
`sessionStore` is an Auth `SessionStore`. `trustedSessionId` comes from the
server's verified session context, never a dashboard request parameter.

```ts
import { audience } from "@lenso/auth";
import {
  createDashboardAuthAuthorization,
  type DashboardAuthResource,
} from "@lenso/console-dashboard/server/auth";
import { createAuthorizedDashboardStore } from "@lenso/console-dashboard/server";

const access = auth.for(audience("console:dashboard")).memberships(
  (subject, resource: DashboardAuthResource) =>
    members.read(subject, resource.scope),
);
const principal = await access.required(verifiedRequestEvidence);
// Application-owned policy release; bump whenever these rules change.
const applicationDashboardPolicyRevision = "overview-policy-v1";
const authorization = createDashboardAuthAuthorization({
  access,
  ownership: {
    applicationId: "operations",
    dashboardId: "overview",
    targetId: trustedTarget.id,
    tenantId: trustedTenant.id,
    kind: "organization",
    organizationId: trustedOrganization.id,
  },
  policies: {
    read: ({ membership }) => membership.dashboardRead,
    write: ({ membership }) => membership.dashboardWrite,
    widget: ({ membership, resource }) =>
      resource.widget !== undefined &&
      membership.widgets.some(
        (ref) => ref.bindingId === resource.widget!.bindingId &&
          ref.widgetId === resource.widget!.widgetId,
      ),
  },
  async revision({ principal, membership, signal }) {
    const graph = await roleStore.read({ signal, now: Date.now() });
    const session = await sessionStore.read(
      principal.realmId,
      trustedSessionId,
    );
    if (!session || session.subjectId !== principal.subjectId ||
        session.kind !== principal.kind || session.revokedAt !== null ||
        session.expiresAt <= Date.now() || !membership.revision) {
      return ""; // Missing/retired trusted facts fail closed.
    }
    return JSON.stringify([
      graph.revision,
      membership.revision,
      session.revision,
      session.expiresAt,
      applicationDashboardPolicyRevision,
    ]);
  },
});
const storeOptions = {
  context: principal,
  authorization,
  repository: dashboardRepository,
  definitions: serverWidgetDefinitions,
};
const authorizedStore = createAuthorizedDashboardStore(storeOptions);
// Without audit, createAuthDashboardStore({...authOptions, principal,
// repository: dashboardRepository, definitions: serverWidgetDefinitions})
// is the direct convenience composition.
```

The required revision provider must cover **every** trusted fact used by the
policies, including graph/member/session changes, application policy releases
and any time-dependent permission transitions. For expiring grants, include an
authoritative decision epoch that changes at the deadline, or exclude expired
facts and version that resulting decision. Do not hash callback source, use a
constant revision for mutable policies, or substitute a browser permission key.
Read authoritative versions and fail closed when they cannot be obtained.
The helper adds the verified realm, subject, audience and actor kind to the
revision; it does not invent versions of unversioned business rules.

Use `{ kind: "personal", ...fixedApplicationDashboardTargetTenant }` instead
for personal dashboards; do not supply an owner subject. The generic `/server`
store and memory repository continue to work without installing Auth.

## Optional strict Audit adapter

Import `createAuditedDashboardStore`, `createDashboardMutationReplayReader` and
`DashboardAuditOutcomeUnknownError` from
`@lenso/console-dashboard/server/audit`. Its minimal type-only
`DashboardAuditPort` accepts the published `AuditService`'s `get`, `prepare` and
`complete` methods, including the real branded receipt. There is no runtime
Audit/Auth dependency cycle, best-effort fallback or fabricated receipt.

Configure the real Audit service with a durable-intent repository, trusted
scope-aware authority and this summary allowlist. Keep its storage lifetime at
least as long as the dashboard mutation retry lifetime.

```ts
import { createAuditService } from "@lenso/audit";
import {
  createAuditedDashboardStore,
  createDashboardMutationReplayReader,
} from "@lenso/console-dashboard/server/audit";

const audit = createAuditService({
  repository: durableAuditRepository,
  authority: applicationAuditAuthority,
  summaryPolicy: {
    "dashboard.save": {
      instanceCount: { type: "integer", min: 0, max: 100 },
      placementCount: { type: "integer", min: 0, max: 100 },
    },
  },
});
const store = createAuditedDashboardStore({
  store: authorizedStore,
  audit,
  principal,
  scope: trustedAuditScope,
  // Stable, nonsecret, server-owned identity for this exact dashboard owner.
  targetId: trustedDashboardAuditTargetId,
  replay: createDashboardMutationReplayReader(storeOptions),
});
// Expose only this wrapper's read/save through the existing trusted transport.
```

Audit IDs are deterministic version-8 UUIDs derived from trusted audit scope,
target and mutation ID. The event target remains the actual trusted dashboard
target for audit queries. Its `correlationId` binds a SHA-256 commitment of the
canonical document **and expectedRevision**; summaries record only counts.
Neither widget configuration, raw documents, credentials nor arbitrary
browser-supplied revision strings are copied into audit metadata. Treat these
commitments as internal audit metadata, not a public document-privacy mechanism.

Retries retrieve the original intent timestamp through authorized `Audit.get`
and reuse it in `prepare`, preserving actor/content idempotency. Changed
content or expected revision conflicts. A recorded intent never dispatches
another save: a confirmed success reads the recorded mutation snapshot under
current read/write/widget authorization, a confirmed conflict/denial rethrows
its known error, and a missing/unknown outcome requires reconciliation.
The replay reader never invokes `save` and never substitutes today's snapshot
for a missing historical mutation.

Prepare failure prevents the write. Known forbidden/revision-conflict errors
mean no write only when the wrapped store obeys the staged repository contract.
Any other save error, including uncertain SQL dispatch, is conservatively
recorded as unknown. Completion failure after an effect also reports
`DashboardAuditOutcomeUnknownError`; it does not claim rollback or success.
Do not automatically retry an unknown outcome. Reconcile durable audit intent,
outcome and dashboard mutation records using an application-authorized operator
workflow. This adapter deliberately does not perform recovery writes.

Integration API baseline: published `@lenso/auth` **0.3.1** (`Access.enforce`)
and `@lenso/audit` **0.3.1** (strict branded `prepare`/`complete`).
The optional server entry points do not change the root/browser contract.
