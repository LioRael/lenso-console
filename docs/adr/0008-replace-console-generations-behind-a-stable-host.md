---
status: accepted
---

# Replace Console generations behind a stable Host

The Console Client keeps a stable GPUI Host while running each immutable
Resolved App Plan as a Console Generation. When Console App Composition
changes, the Host starts a candidate generation without mutating the active
one, waits for its Ready Gate, atomically activates it, and then retires the
previous generation.

The Host owns the window, Operator session, selected Target App, and navigation
continuity, so activating a new Module UI does not close the native window or
reload the Web page. A failed candidate never replaces the healthy active
generation. This generation replacement is a Host and Runtime Driver concern;
it does not weaken Kernel plan immutability or grant runtime graph mutation.

Only Host-owned state crosses the activation seam: the Operator session,
selected Target App, route and navigation history, window layout, theme, and
accessibility preferences. Module UI-local transient state resets. Durable
product or operational state must remain with its explicit owner rather than
being recovered from an old UI generation.

## Consequences

For a bounded interval the Host may own active and candidate generations at the
same time. A failed candidate produces activation evidence while the active
generation remains available. After activation, the previous generation drains
for a bounded period, and its exact Plan and artifacts remain available as the
last known good rollback generation until the replacement passes its stability
window. Module UI code cannot assume that one process lifetime corresponds to
one Console Generation.
