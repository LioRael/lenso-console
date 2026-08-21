---
status: accepted
---

# Contain Module UI faults and bound their effects

A trap, execution timeout, resource-budget violation, or invalid View Tree
faults only the affected Module UI instance after Console activation. The Host
replaces that instance with Host-owned recovery presentation and may
reinstantiate it; the active Console Generation and unrelated Module Views
remain available. A required Module UI that cannot initialize while a candidate
generation is behind its Ready Gate may prevent that candidate from activating.

The Host enforces per-instance policy for memory, execution fuel or time, View
Tree nodes and payload size, outstanding effects, and event rate. Concrete
limits are deployment policy rather than WIT compatibility values, while
termination and isolation on violation are part of the Module UI Interface.

When an instance disappears, effects that have not started are cancelled and
operations with real cancellation semantics receive cancellation. A submitted
write is never reported as rolled back merely because its UI disappeared. Each
effect carries a request identity and deadline; the Operation contract remains
authoritative for idempotency and completion. Late results may remain as
diagnostic or audit evidence but are not delivered to a retired instance.

## Consequences

Artifact admission establishes identity and trust but does not remove the need
for runtime containment. Console must provide Host-owned recovery UI,
per-instance observability, bounded restart policy, and explicit distinction
between UI lifecycle cancellation and business-operation outcome.
