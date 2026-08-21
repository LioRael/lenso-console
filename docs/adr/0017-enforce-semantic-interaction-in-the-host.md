---
status: accepted
---

# Enforce semantic interaction in the Host

The View Tree includes a semantic Form that coordinates field identities,
dirty state, submission, pending state, and field errors. The Host owns
structural and basic type constraints, accessible error presentation, and focus
movement. The Component owns product validation and submission state, while the
Target App Operation remains authoritative for business validation.

Operation contracts carry authoritative read, write, destructive, or
privileged risk. A Module UI may describe the current intent but cannot lower
the contract risk. The Host enforces confirmation, typed confirmation,
reauthentication, or policy denial; presentation rendered by the Module is not
a security confirmation boundary.

Module Commands are declared statically. The Host owns the command palette,
menus, shortcut mapping and conflicts, authorization, and platform dispatch. A
Component may publish enabled and visible state and receives execution as an
ordinary event, but cannot install a global key handler.

Clipboard, file selection, and external-link actions are bounded Host effects.
They require declared permission and current policy; sensitive reads require a
direct Operator gesture. File pickers return bounded handles or content rather
than ambient paths, and external schemes are validated before opening.

The Host derives native and Web accessibility from semantic nodes. Missing
accessible names, invalid focus relationships, or structural errors that make a
View unusable invalidate the tree and fault its instance; lesser defects produce
structured diagnostics. A Component supplies product labels, descriptions, and
state rather than platform accessibility objects.

## Consequences

Security and accessibility cannot be replaced by visual imitation inside a
Module View. The Operation contract, Host policy, semantic tree, and current
Operator gesture remain independently testable enforcement inputs.
