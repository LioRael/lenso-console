# Controlled management core

This optional package owns the static management catalog and one durable record
per write invocation. It has no HTTP listener, React dependency, Agent runtime,
model provider or implicit activation. Domain Plugins own operation behavior,
resource rules, transactions and commit receipts. Auth, Access Control, Approval
and Audit keep their own facts.

`contracts/crates/lenso-capability-management` owns the source-first
`lenso.management@1` contract. Its `catalog`, `invoke` and `status` projections
are generated for Rust and TypeScript. Callers cannot supply a deployment URL,
subject, permission or approval flag. A Host accepts exact `Binding` entries;
input is validated against each owner's closed JSON Schema before dispatch.

For explicit local setup, call `Management::initialize_journal(path)` once.
`Management::open` requires the prepared SQLite journal and never creates a
missing file, migrates a configured deployment or falls back to memory. The
journal stores operation metadata, the bounded canonical input and expected revision,
a canonical intent digest and bounded results. It never persists credentials.
Human review reads that sealed input rather than client-supplied replacements.
Schema version 5 must be prepared explicitly; `Management::upgrade_journal` upgrades existing versions 3 or 4 only while no runtime owner holds its lease. A lifetime file lease rejects a second active owner; only
a new exclusive owner may recover unfinished dispatches.

The trusted `Authority` adapter must check current credential validity, operators
realm, deployment qualification, scoped permission and credential/task ceilings
on every call. A write profile must query the Approval owner for an exact `Intent`; a local
hook cannot return approval authority. Approval is rechecked before dispatch,
and current authorization is checked again after approval with the same subject.
The server-created intent includes a fixed expiry in its canonical digest.
Each admission verifies the exact `catalog`, `invoke` or `status` audience.
The separate `lenso-management-authority` package binds generated CredentialState,
Access Control, Approval and Audit clients. Its local qualification store owns only
deployment membership. The selected realm issuer/key and every entry permission
and resource scope come from explicit Host configuration.

`OperatorsAuthority::new` retains the required Approval owner for write profiles.
An explicitly selected read-only App uses `new_read_only` and `ReadOnlyOwnerPorts`,
which omit Approval while retaining Credential State, Access Control and Audit.
That authority rejects every write or approval-requiring entry before admission
and denies human approval methods. The App must expose only read entries and
reject a write configuration with an absent Approval binding during startup.

The domain `Target` adapter receives the original invocation context. Writable
targets must use the server-created operation ID as their stable domain
idempotency identity and supply a commit receipt. A failed transport leaves an
`unknown` invocation; subsequent invoke requests do not replay it. `status`
queries the target receipt after authorization and can establish success.
Native exclusive restart changes unfinished dispatches to `unknown`. Cancellation and expired
deadlines prevent dispatch; abandoning a dispatched future leaves `unknown`. A changed target, schema or
entry version prevents querying the old invocation through a different binding.

A durable audit outbox precedes dispatch. Audit unavailability before dispatch
blocks the write; after commit it preserves the business result and sets
`audit_pending`. An authorized status call retries the same stored audit event
with a stable phase key. It never replays the target to repair audit delivery.

Only explicitly selected operations with bounded, non-secret results belong in
this first catalog. Credential issuance, arbitrary SQL, configuration reflection
and remote code execution are outside it. Target error text never becomes a
successful tool result and is not copied into the operation journal.

Validation:

```sh
cargo test --locked --manifest-path plugins/management/Cargo.toml
cargo check --locked --manifest-path contracts/Cargo.toml -p lenso-capability-management
```

The deterministic note target tests prove immutable approval input, revocation,
unknown receipt recovery, durable manager restart, caller isolation, schema
rejection, target binding changes, subject switching during approval, scoped
cancellation, exclusive restart and audit outbox recovery. A separate Native
PostgreSQL integration test exercises the real generated four-owner ports,
current credentials and grants, a different human approver, and receipt recovery.
That proof does not establish Workers Management storage or remote Hyperdrive
support. The ordinary source App and transport compositions retain separate gates.

Human PAT issuance and revocation use a separate bound human port, never a catalog
or Agent tool. Their original non-secret parameters, metadata-only receipts and
stable audit phases are durable. A cancelled reply cannot overwrite a confirmed
owner receipt. A different issuance key is blocked while this subject/deployment
has an unresolved mutation. Receipt reads refresh active metadata without
recovering a secret or sending a second issue call.

A generic HTTP rejection after submission can follow a committed credential.
The browser therefore retains only the subject/deployment-scoped receipt key
across reloads and keeps issuance locked until an owner receipt confirms it.
It validates known request shape before storing that key. If a request was
rejected before reservation or remains undispatched, an operator may stop the
selected Host, call `Management::abandon_rejected_external(path, deployment,
subject, key)` under the exclusive journal lease, and clear only that exact
browser receipt reference. This API accepts absent, `ready`, or terminal `failed`
records and marks admitted records as `cancelled`; it rejects `executing`, `unknown` and
`succeeded`. A `failed` external issue records a completed typed owner domain
rejection; transport/unknown failures never become `failed`. Post-commit
authorization rejection preserves `succeeded`. It must never be used to clear an
owner receipt that is merely not visible yet. Preserve the recovery receipt and original reference in the
operator's qualification record. The API is not exposed through HTTP or tools.

A lost revoke reply is retained as `unknown` and never replayed. An authorized
list can reconcile it only when the owner reports a token-specific `revoked_at`
for the exact credential, subject and deployment retained in the request. This
confirms the owner postcondition without attributing its timestamp to the lost
invocation. Inactivity or expiry alone leaves the operation unknown; the durable
audit outbox must be delivered before the reconciled response is available.


## Workers owner storage and transport

`storage::Journal` is a finite private owner interface. `Management::from_store`
uses the same catalog, current admission, intent digest, dispatch state machine,
target receipt and audit outbox as Native. Runtime construction checks the prepared
store version; it never creates tables or grants operator membership.

The owner module `lenso-management-core/src/workers/journal.mjs` exports explicit
operator setup and qualification actions separately from its runtime factory.
The selected D1 binding uses a `first-primary` session per event. Invocation records,
qualified subjects and unsent audit phases survive a new Worker instance. Atomic
batch/CAS receipts must report success and bounded mutation counts; an uncertain
receipt returns unavailable even when the transaction may have committed.

A claim records an absolute wall-clock expiry of at most 30 seconds. The selected
Workers Host event budget must also be at most 30 seconds. No startup scans or
rewrites active executions. An authorized status read may recover an expired
claim to unknown and query the business owner's stable receipt; it never replays
its write. Fresh assertion, credential and immutable-intent expiry checks follow
the last asynchronous authorization wait. Relative Driver time controls only the
current invocation's deadline, not a durable lease across events.

`lenso-management-http` projects bound Auth, Management and ManagementHuman ports
to fixed bearer HTTP endpoints. Every request reauthenticates; authorization and
human eligibility remain server-side. Private responses are no-store. Optional
MCP uses the official `@modelcontextprotocol/server` SDK through an event-scoped,
closed owner bundle. Its callback receives an already sealed Rust context, never
a bearer or actor JSON. Read-only is the default tool surface; approved writes
require explicit Host selection and retain the same durable approval guard.

The bundle is built from locked owner sources and checked byte-for-byte. The
ordinary Source App must select its exact reachable owner package/module through
Host facilities; copying SQL, substituting a handwritten Host or forwarding raw
Worker env is outside this interface.

```sh
pnpm management:workers:check
```

Local real workerd/D1 tests qualify durable CAS, restart, receipt monotonicity,
mutation-reply uncertainty and the closed official MCP bundle as components.
They do not qualify the ordinary Worker App's full security graph, deployment or
remote Hyperdrive. Those source assembly and runtime receipts are recorded by the
Examples owner separately. Browser sessions and human PAT lifecycle remain the
explicit Native profile; the initial Worker profile uses owner-issued user API
credentials and the guarded typed human approval endpoint.
