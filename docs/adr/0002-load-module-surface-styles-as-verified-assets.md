---
status: superseded by ADR-0004
---

# Load Module Surface styles as verified assets

A Module Surface artifact declares its built CSS assets alongside its ESM entry.
The Host verifies their paths and digests, loads them in declared order, and only
then mounts the Surface. The artifact contract does not expose or require a
shared StyleX compiler, runtime, or generated class-name scheme.

Every third-party rule must be owned by content within its assigned Surface Root.
Unique atomic class selectors are valid without a literal Surface Root ancestor;
element, root, body, universal, and cross-Surface selectors are not. The
authoring SDK rejects global styling, artifact checks inspect the final CSS, and
runtime contract tests mount multiple Surfaces to detect cross-Surface or Host
Theme pollution. The trusted same-realm execution model remains unchanged;
stronger runtime isolation is a separate architectural decision.

## Considered Options

- Runtime JavaScript style injection was rejected because it obscures asset
  identity, loading order, integrity verification, and failure handling.
- Folding Module styles into the Host build was rejected because independently
  published artifacts must not depend on Host source scanning or recompilation.

## Consequences

The artifact manifest and receipt gain ordered style assets and digests. The new
contract is released atomically with the rebuilt Host and official Module
artifacts as a breaking `consoleUi` major; artifacts built for the former CSS
contract are rejected rather than loaded with a compatibility layer.
