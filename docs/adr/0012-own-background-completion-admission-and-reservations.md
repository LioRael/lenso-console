# ADR 0012: Own background completion admission and reservations

Status: Implemented locally for coordinated review.

The independently optional `lenso.console.agent-ai-adapter` Plugin provides
background completion through the existing Workspace Service role, not Shell UI
state. Kernel caller identity and an independently verified operators assertion
select exactly one Host-admitted project/purpose profile. Bodies cannot supply
identity, scope, credentials, price or budget. Auth audience grants and consumer
bindings remain explicit; assistant installation confers neither.

Agent owns keys, exact Model binding, Generation, stream execution and cancellation.
Its optional bridge additionally requires the existing private Host control seam
and a valid signed user assertion. Console never issues a substitute identity or
stores provider signing/API keys. Unknown model limits/prices cannot enter the
paid path, and no alternate model or retry is selected.

The adapter owns SQLite ledger schema version 1, separate from Session history.
The immutable serialized policy and run reservations are durable before a paid
invocation. Immediate transactions serialize budget/concurrency across processes;
WAL/FULL synchronization precedes dispatch. Success settles measured usage and
records binding/Generation plus configured price revision. Unknown results retain
the complete reservation; crashes keep reserved rows blocking concurrency until
reviewed. Foreign/incomplete databases and changed policy fail closed. No implicit
migration, refund, budget reset, prompt history or assistant Session exists.

This first version uses the selected provider catalog's full hard input ceiling
for conservative reservation. It records Host pricing revision rather than
claiming a provider billing receipt. The existing Model response cannot reveal
provider-internal substitution, so exact-model execution depends on the trusted
provider honoring its contract. Live parent credential revocation, multi-round
run/session-write authority and administrative ledger reconciliation are separate
follow-ups. Neither native code nor SQLite files are a hostile-code sandbox.
