---
status: accepted
---

# Hide WIT bindings behind language SDKs

Rust authors use a `lenso-console-ui` SDK with a state-machine trait, typed View
builders, Event and Effect values, generated Operation bindings, stable-key
helpers, a test harness, and a component export macro. Generated `wit-bindgen`
types remain an implementation detail, and the SDK has no GPUI, Tokio, network,
filesystem, process, or operating-system dependency.

Module UI World packages are immutable and fully versioned. An artifact
declares the exact world version and semantic features it requires. The Host
supports a finite, explicit version matrix and tested adapters rather than
assuming structural compatibility from semver alone. Semantic breaks require a
new major; support for an old major is a deliberate product window, not a
permanent promise.

## Consequences

Language SDKs may differ ergonomically but must pass the same transition,
artifact, native, Web, and failure conformance suite. An SDK cannot expose a
capability absent from the Module UI World or make renderer internals part of
the authoring contract.
