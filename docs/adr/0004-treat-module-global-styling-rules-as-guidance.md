---
status: superseded by ADR-0006
---

# Treat Module global styling rules as guidance

Module Surface artifacts may include CSS from any styling system or dependency,
including global selectors that affect the Host or other Surfaces. Scoping,
shared-token usage, and avoidance of root, body, universal, or cross-Surface
selectors are authoring recommendations rather than artifact admission rules.

## Considered Options

- Rejecting unsafe selectors during artifact admission was rejected to keep the
  trusted same-realm ecosystem permissive.
- Requiring all third-party styling to use StyleX was rejected so Module authors
  can choose their own styling systems and dependencies.

## Consequences

StyleX atomic names and Surface Roots do not provide style isolation. Artifact
checks verify declared assets, paths, digests, and deterministic loading, but do
not reject selectors. Stylesheets have a stable insertion order of Host reset,
Module Surface styles, then Theme Bundle styles. Normal specificity, inheritance,
and `!important` rules still determine the result. Cross-Surface conformance
checks may provide diagnostics but cannot block installation or loading.
