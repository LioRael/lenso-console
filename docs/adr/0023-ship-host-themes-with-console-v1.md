---
status: accepted
---

# Ship Host Themes with Console v1

Console v1 ships its Host Themes with the Console product. Module UI may express
only the semantic visual intent defined by the Module UI World and may package
only admitted Module UI Assets. It cannot install a theme, replace Host
presentation, execute composition code, or reorganize global navigation.

The rebuilt Console does not carry forward executable Theme Bundles, arbitrary
React composition slots, Module CSS, or per-Module fonts. A future third-party
theme format must be declarative, renderer-neutral, integrity-bound, and unable
to add executable authority; it requires a separate architecture decision.

## Consequences

Theme and locale changes remain dynamic Host state and do not replace a Console
Generation. The first GPUI design system can evolve without simultaneously
stabilizing a public theme-authoring ecosystem.
