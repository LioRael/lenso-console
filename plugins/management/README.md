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
journal stores operation metadata, a canonical intent digest and bounded results;
it does not persist invocation input or any credential. Schema version 2 must be
prepared explicitly. A lifetime file lease rejects a second active owner; only
a new exclusive owner may recover unfinished dispatches.

The trusted `Authority` adapter must check current credential validity, operators
realm, deployment qualification, scoped permission and credential/task ceilings
on every call. It must query the Approval owner for an exact `Intent`; a local
hook cannot return approval authority. Approval is rechecked before dispatch,
and current authorization is checked again after approval with the same subject.
The server-created intent includes a fixed expiry in its canonical digest.
Each admission verifies the exact `catalog`, `invoke` or `status` audience. No production
authority adapter is supplied by this core. Absence of a qualified adapter is a
closed implementation gate.

The domain `Target` adapter receives the original invocation context. Writable
targets must use the server-created operation ID as their stable domain
idempotency identity and supply a commit receipt. A failed transport leaves an
`unknown` invocation; subsequent invoke requests do not replay it. `status`
queries the target receipt after authorization and can establish success.
Restart changes unfinished dispatches to `unknown`. Cancellation and expired
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
cancellation, exclusive restart and audit outbox recovery. They use an explicitly injected test
authority. They do not prove Auth/Access/Approval/Audit integration, Workers
storage, a remote MCP client, all five installation profiles or production
qualification. Those gates remain required before exposing a write tool.
