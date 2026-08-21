---
status: accepted
---

# Separate generation readiness from Target App availability

A candidate Console Generation is ready only when every composed Module UI
Component passes admission, instantiates, verifies its descriptors, and reaches
its required initialization state. Whether the currently selected Target App
provides every View requirement is not a generation-readiness condition. A View
with an absent or incompatible Target Operation remains declared but is marked
unavailable with a Host-owned explanation and no fallback binding.

Updating or removing a Module UI resolves and activates a new generation. The
previous exact Plan and artifacts remain the last known good rollback set until
the replacement passes its stability window. Artifact or publisher revocation
immediately blocks future candidate activation; a critical active-artifact
revocation causes the Host to construct a safe replacement generation without
that Module UI rather than mutating the active graph. If no safe generation can
be activated, the Host retains only Console-owned recovery presentation and
reports the blocked state.

## Consequences

Target outages and heterogeneous Target App compositions do not make Console
itself unready. Supply-chain response remains explicit, evidence-producing, and
generation-based. Policy must classify revocation severity and may not silently
substitute another artifact or publisher.
