---
status: accepted
---

# Separate platform input and bound live data

The Console Host owns platform input mechanics including IME composition,
cursor and selection, focus, key repetition, accessibility input, scrolling,
and viewport measurement. A Module UI Component owns product-semantic state
such as field values, validation, dirty state, pending work, and selection
meaning. The Host emits typed value, commit, focus, and viewport events rather
than exposing native key or pointer machinery as the form model.

Every View Tree node carries a stable identity. SDKs may derive identities for
static nodes, while interactive nodes and dynamic collection items require
stable author keys. Duplicate identities in one sibling scope make the View
Tree invalid and fault the instance.

Large lists, tables, and trees use semantic Virtual Collections. The Host emits
window requests, and the Component returns only the current stable item window
inside its otherwise complete View Tree. The Host owns overscan, measurement,
row reuse, and native or Web scrolling.

An Operation effect may open a Module UI Stream. The Host owns subscription,
bounded buffering, batching, backpressure, reconnect policy, and cancellation;
the Component receives ordered lifecycle and item-batch events. Batches may be
coalesced to respect mailbox and render budgets without reordering items.

Optimistic presentation is explicit Component state associated with a request
identity. Console does not provide an implicit query cache or automatic
rollback, and the Target App Operation result remains authoritative for whether
a write completed.

## Consequences

Native and Web input behavior can differ internally without changing Module UI
semantics. High-volume runtime evidence and logs do not require unbounded trees
or mailboxes. Conformance tests must cover IME, focus, stable identity,
virtualized collections, stream ordering, backpressure, and optimistic failure.
