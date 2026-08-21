---
status: accepted
---

# Let the Host own visual and locale realization

Module UI expresses bounded semantic intent such as tone, emphasis, density,
semantic size, and limited layout constraints. The Console Host Theme owns the
actual color, typography, spacing, shape, shadow, animation, and focus
realization. A Module cannot introduce global tokens, override another View, or
ship an independent styling runtime.

A Module UI artifact may include digest-bound, budgeted images, SVGs, and icons
that the Host validates, decodes, and caches. Module fonts, remote URLs, and
runtime asset downloads are not supported in v1.

Localization catalogs are digest-bound Module UI assets keyed by BCP 47 locale.
The View Tree references message identities with typed arguments; the Host
selects locale and fallback and formats dates, numbers, time zones, and plurals.
Business text returned by a Target App remains data rather than an implicit
localization key.

## Consequences

Native and Web Clients share visual meaning, localization behavior, and asset
policy even when their renderer mechanics differ. Theme and locale changes can
re-render active Views without replacing Module UI code or mutating the Console
App graph.
