---
name: console-page-interactions
description: "Console page UI and interactions: real icons, icon-only corners, compact task context, list/detail composition, selection actions and host preferences. Check local versus compiled/admitted host support before projecting into Shell."
---

# Console page interactions

**Scope** identifies a live UI activation. **Ownership** stays with the page for business state and execution, with the host for navigation and presentation. **Projection** exposes current page facts and existing actions without creating another store.

## Workflow

1. **Classify the host.** Read [runtime support](references/runtime-support.md) and inspect the consuming host, not just package exports. Identify local `ConsoleLocalPageProps` versus SDK `PageProps`, available activation, and the renderer for each requested surface. Import public modules only; private Shell sources are evidence, not page dependencies.
   **Complete when:** every requested interaction has an identified public API and a host that actually presents it. For an unsupported surface, report the host gap and ask for a supported alternative; do not patch host internals as page work.

2. **Assign ownership and scope.** Read [safety](references/safety.md). Name canonical page state, the activation key, the single selection owner, and the existing execution/navigation path. For UI changes, read [presentation](references/presentation.md), which applies the shared design direction to icons, corners, context, tables and detail pages.
   **Complete when:** a retiring activation cannot update the next page, persistent state is outside keyed projections, and each contributed action has real guards and an outcome.

3. **Implement only the chosen projection.** For definitions, bindings, page groups, or host preference integration, read [local composition](references/composition.md). For page behavior, read the applicable section of [recipes](references/recipes.md): controlled context/corners, selection, or local-Shell commands/task context. Consult source types for fields rather than inventing protocol extensions. Keep page actions separate from navigation preferences; do not mount a second Dock.
   **Complete when:** the contribution is derived from page state, empty selection withdraws it, async work checks liveness, and commands reuse the same guarded action as visible controls.

4. **Validate the contract.** Read [validation](references/validation.md), choose the lowest-cost existing coverage for the changed behavior, and typecheck with public imports. Actual interactive UI changes require real-browser evidence; this skill's documentation alone does not.
   **Complete when:** applicable scope, execution, accessibility and geometry checks have evidence, unsupported or unrun checks are explicit, and the handoff names files, host branch and remaining gaps.
