---
status: accepted
---

# Standardize Module UI on a WebAssembly Component world

Every Module UI publishes one immutable WebAssembly Component implementing the
versioned Lenso Module UI WIT world. The identical artifact digest executes in
native and Web Console Clients and exchanges only renderer-neutral metadata,
input, view, and Host-effect values. GPUI, browser, filesystem, network,
clipboard, storage, and process Interfaces are absent from the Component.

A Console-specific Execution Adapter owns Component instantiation, WIT
translation, mailbox scheduling, resource enforcement, and failure translation
inside a Console Generation. The portable Kernel does not load Wasm or know
about UI, and the GPUI Host consumes the Adapter's typed Module endpoint rather
than reaching into Component memory.

Console uses one artifact admission, provenance, digest, compatibility,
instantiation, resource-limit, and failure model for all Module UI. A build tool
may generate a small Component from a declarative Bun or TypeScript source, and
an author may implement the same world directly in Rust. How source code is
authored does not create a second runtime artifact kind.

## Considered options

- Separate declarative-data and executable-Wasm artifacts were rejected because
  they would duplicate lifecycle, versioning, admission, and failure semantics.
- Linking Rust UI code into Console was rejected because it would require a new
  Console build and would not support independently admitted Module UI.
- Language-specific runtime formats were rejected because a Module's backend
  execution language is independent from its Console presentation.

## Consequences

The Module UI World becomes a compatibility contract owned by Lenso. Its first
version must be small enough to implement across languages, deterministic
enough to test without GPUI, and portable enough to run the same Component in
native and browser hosts. Browser Component Model support, resource limits, and
cross-runtime conformance are release gates rather than assumptions inferred
from successful compilation.
