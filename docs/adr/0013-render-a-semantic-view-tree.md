---
status: accepted
---

# Render a semantic View Tree

The Module UI World exposes a renderer-neutral semantic View Tree rather than
GPUI elements, browser elements, low-level display commands, or an arbitrary
canvas. Its initial language combines a small set of layout nodes such as
stack, grid, scroll, and split with Host-rendered semantic content and controls
such as text, button, field, select, table, list, tree, code, tabs, inspector,
and empty state.

The Console Host owns rendering, interaction conventions, focus behavior,
accessibility realization, theme application, and reconciliation by stable node
identity. Module UI describes product meaning and allowed presentation intent;
it does not recreate the Host design system from low-level drawing commands.

## Considered options

- A flexbox-like primitive-only language was rejected because every Module
  would independently rebuild behavior, accessibility, and Console visual
  conventions.
- Arbitrary canvas or display-list commands were rejected because they defeat
  semantic accessibility, cross-target consistency, Host theming, and bounded
  resource policy.

## Consequences

Adding or changing semantic nodes is a Module UI World compatibility decision.
The v1 catalog must stay small and deep, with conformance fixtures rendered and
interacted with on native and Web targets. Specialized visualization requires a
future reviewed semantic node or protocol extension rather than an escape hatch
to renderer internals.
