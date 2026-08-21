---
status: accepted
---

# Run Module UI as sequential state machines

Each Module UI Component implements an initialization, update, and view state
machine. The Console Host delivers one event at a time through a FIFO mailbox;
the Component updates its transient state and returns a complete
renderer-neutral View Tree plus zero or more Module UI Effects. Reentrant or
concurrent updates to one Component instance are forbidden.

The Host reconciles each complete View Tree into GPUI by stable node identity.
The Component does not send renderer commands or calculate incremental patches.
This keeps the first Module UI World deterministic and leaves diff strategy and
renderer optimization inside Console.

A Module UI Effect is data, not a synchronous Host import. It references only
an Operation selected and bound by App Composition or a bounded Host-owned UI
action. The Host authorizes and executes effects, may run independent effects
concurrently, and returns each result or failure as a request-identified event
through the same mailbox. Effects never carry an arbitrary URL, credential, or
Capability name.

## Consequences

Rust, generated Bun or TypeScript, native, Web, and headless conformance tests
share the same observable transition model. Component state remains private and
transient; durable state belongs to an explicit owner. A future patch protocol
requires measured evidence and a new compatible Interface rather than changing
the meaning of the v1 View Tree.
