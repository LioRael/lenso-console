---
name: console-page-interactions
description: "Design or review Console page controls, table contexts and semantic action groups; choose verified Lenso UI components and supported Shell contributions. Apply contextual defaults, not a fixed four-corner template."
---

# Console page interactions

**Scope** identifies a live UI activation. **Ownership** stays with the page for business state and execution, with the host for navigation and presentation. **Projection** exposes current page facts and existing actions without creating another store.

## Design defaults

Content comes first: keep the host Dock, symmetric page tabs for genuine workflows,
and floating corner groups without reserving meaningless layout strips. Four
corners are available space, not four required buttons. Page controls serve the
current content; leave unused corners empty. Theme, logout, generic refresh and
home belong at appropriate Shell entries, not every business page. A real parent
return, error retry or deliberate monitoring update can be justified by context.
Necessary corner buttons prefer SVG icons with tooltips and accessible names;
pagination and other compound controls retain meaningful text.

For meaningful table/file/collection multi-selection, the preferred default is
for the existing Dock to smoothly become a bulk action bar: selection count and
target, valid operations, and clear/cancel selection. Clearing selection restores
its previous navigation state. Keep focus and targets stable; respect reduced
motion and allow an explicit user choice of another selection presentation.
Use the supported host's `ConsoleActionScope`, never a second Dock or fabricated
selection.

Use [table contexts and groups](references/table-contexts.md) for full-page or
embedded tables, and [scenario defaults](references/scenario-defaults.md) to reason
about forms, details, analysis and other content. These are recommended combinations,
not callable presets or mandatory positions. Explicit user customization takes
priority while keeping targets clear, controls accessible, content unobstructed
and context stable during interaction. Do not generalize table rules to all pages
or add glass/refraction decoration.

## Workflow

1. **Classify the host.** Read [runtime support](references/runtime-support.md) and inspect the consuming host, not just package exports. Identify local `ConsoleLocalPageProps` versus SDK `PageProps`, available activation, and the renderer for each requested surface. Import public modules only; private Shell sources are evidence, not page dependencies.
   **Complete when:** every requested interaction has an identified public API and a host that actually presents it. For an unsupported surface, report the host gap and the minimum extension needed. Do not invent APIs, silently substitute controls that violate the design, or implement host internals as page work; obtain separate scope for host changes.

2. **Choose components and ownership.** For controls/forms, read [component decisions](references/component-decisions.md) and verify the consumer's installed exports and a matching example before JSX. Load the available `lenso-ui` skill for component contracts; this Console skill does not replace it. Read [safety](references/safety.md) for state and execution, and [presentation](references/presentation.md) for Shell placement.
   **Complete when:** each interactive region has an identified component/API (or an explained native choice), a single state owner and the existing guarded execution path. A retiring activation cannot update the next page.

3. **Implement only the chosen projection.** For definitions, bindings, page groups, or host preference integration, read [local composition](references/composition.md). For page behavior, read the applicable section of [recipes](references/recipes.md): controlled context/corners, selection, or local-Shell commands/task context. Consult source types for fields rather than inventing protocol extensions. Keep page actions separate from navigation preferences; do not mount a second Dock.
   **Complete when:** the contribution is derived from page state, empty selection withdraws it, async work checks liveness, and commands reuse the same guarded action as visible controls.

4. **Validate the contract.** Read [validation](references/validation.md), choose the lowest-cost existing coverage for the changed behavior, and typecheck with public imports. Actual interactive UI changes require real-browser evidence; this skill's documentation alone does not.
   **Complete when:** the handoff names component choices and installed versions, the exercised primary interaction and screenshots, and any native deviations or unrun checks. Documentation-only work needs frontmatter, link, source/API and contradiction checks; skip full application CI and browsers. Use the short [design self-check](references/validation.md#design-self-check).
