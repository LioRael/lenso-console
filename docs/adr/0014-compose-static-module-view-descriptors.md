---
status: accepted
---

# Compose static Module View descriptors

Every Module View is declared before plan resolution by an immutable descriptor
containing its stable identity, typed parameter schema, required Operations,
presentation metadata, and bounded placement hints. The signed manifest and
the Module UI Component metadata must agree exactly. Runtime data may change
content, actions, and navigation visibility but cannot create a new View
identity, parameter schema, or Capability requirement.

The Console Host owns placement and routing. Hints such as primary, detail,
utility, or settings do not entitle a Module to a tab, pane, drawer, or window.
A Module UI may request navigation to a declared View through an effect; the
Host chooses the realization for the current device, window, layout, and
Operator action.

## Consequences

Authoring can detect identity and navigation conflicts and resolve every
Operation binding before boot. A connected Target App cannot reshape Console
navigation or create executable UI identities at runtime.
