---
status: accepted
---

# Compile declarative TypeScript Module UI

Bun and TypeScript Module authors use a bounded declarative Lenso authoring
language for View descriptors, typed state, transitions, semantic View Trees,
and generated Operation bindings. The Lenso compiler analyzes that source and
produces the same Module UI World Component used by every language without
embedding Bun or a JavaScript engine in the artifact.

Arbitrary JavaScript componentization is not a supported v1 authoring path.
Experimental tooling may explore it, but Console compatibility, performance,
security, and release gates do not depend on ComponentizeJS or an embedded
SpiderMonkey runtime. Complex executable Module UI uses the Rust SDK until
another language path meets the same conformance bar.

Module UI source cannot import a backend implementation or handwrite an
Operation name. Lenso generates typed bindings from Capability contracts and
the compiler resolves each use into the static requirements checked by App
Composition, including input, output, error, risk, and stream schemas.

`lenso module build` produces deterministic Component, descriptor, catalog,
provenance, and SBOM outputs from pinned source, lockfile, SDK, compiler, and
target inputs. Timestamps, machine paths, and other nondeterministic values are
excluded from artifact identity.

Development preview may rebuild on save, but each replacement is admitted and
activated as a new dev generation. Headless transition and View Tree tests,
native GPUI preview, gpui_web preview, Operation fakes, accessibility checks,
and cross-target conformance fixtures exercise the production artifact model.

## Consequences

Using Bun for backend execution does not place Bun in the Console Client. The
declarative compiler becomes a language implementation of the Module UI World
and must reject source that cannot preserve its bounded, deterministic
semantics rather than silently emitting runtime JavaScript.
