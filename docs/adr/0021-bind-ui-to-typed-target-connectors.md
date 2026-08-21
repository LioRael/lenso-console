---
status: accepted
---

# Bind Module UI to typed Target Connectors

A Module UI Operation requirement is statically bound in the Console Plan to a
Console-local typed Connector client. At runtime the Host supplies the selected
Target App as validated, attenuated context to that fixed Adapter. The Adapter
may invoke only an Operation whose Capability and contract digest are explicitly
exported by that Target App, and the Target App remains the final authorization
authority.

Changing the selected Target App changes data context, not the Console graph or
Capability binding. If the selected Target App lacks an exact requirement, the
corresponding Module View is unavailable. Console does not select a fallback
provider, expose a global registry, or let UI name an arbitrary remote
Capability.

## Consequences

One Console Generation can operate several Target Apps without dynamic graph
rebinding. Connector clients need typed discovery evidence, target-scoped
authority attenuation, contract-digest checks, deadlines, cancellation, and
structured mismatch diagnostics.
