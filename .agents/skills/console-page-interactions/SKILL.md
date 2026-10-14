---
name: console-page-interactions
description: "Choose installed Lenso UI form, field, selection, disclosure and dialog components for Console pages; implement scoped page interactions and supported Shell contributions."
---

# Console page interactions

**Scope** identifies a live UI activation. **Ownership** stays with the page for business state and execution, with the host for navigation and presentation. **Projection** exposes current page facts and existing actions without creating another store.

## Workflow

1. **Classify the host.** Read [runtime support](references/runtime-support.md) and inspect the consuming host, not just package exports. Identify local `ConsoleLocalPageProps` versus SDK `PageProps`, available activation, and the renderer for each requested surface. Import public modules only; private Shell sources are evidence, not page dependencies.
   **Complete when:** every requested interaction has an identified public API and a host that actually presents it. For an unsupported surface, report the host gap and ask for a supported alternative; do not patch host internals as page work.

2. **Choose components and ownership.** For controls/forms, read [component decisions](references/component-decisions.md) and verify the consumer's installed exports and a matching example before JSX. Load the available `lenso-ui` skill for component contracts; this Console skill does not replace it. Read [safety](references/safety.md) for state and execution, and [presentation](references/presentation.md) for Shell placement.
   **Complete when:** each interactive region has an identified component/API (or an explained native choice), a single state owner and the existing guarded execution path. A retiring activation cannot update the next page.

3. **Implement only the chosen projection.** For definitions, bindings, page groups, or host preference integration, read [local composition](references/composition.md). For page behavior, read the applicable section of [recipes](references/recipes.md): controlled context/corners, selection, or local-Shell commands/task context. Consult source types for fields rather than inventing protocol extensions. Keep page actions separate from navigation preferences; do not mount a second Dock.
   **Complete when:** the contribution is derived from page state, empty selection withdraws it, async work checks liveness, and commands reuse the same guarded action as visible controls.

4. **Validate the contract.** Read [validation](references/validation.md), choose the lowest-cost existing coverage for the changed behavior, and typecheck with public imports. Actual interactive UI changes require real-browser evidence; this skill's documentation alone does not.
   **Complete when:** the handoff names component choices and installed versions, the exercised primary interaction and screenshots, and any native deviations or unrun checks. Documentation-only work needs export/example checks; do not add a CSS snapshot system.
