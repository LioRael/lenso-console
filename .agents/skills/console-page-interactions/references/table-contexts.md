# Table contexts and semantic groups

Read for table-dominant pages or tables within mixed content. These are design
conventions and recommended combinations, not a runtime preset or fixed position
schema. Explicit user customization takes priority with clear targets,
accessibility, unobstructed content and stable interaction context. Use
[runtime support](runtime-support.md#contextual-design-capability-boundary) before
implementation; do not generalize this table specialization to ordinary pages.

## Full-page table

When comparable records occupy the page, default to the needed search, filter
and sort controls in compact top-corner query groups. Create/import belong in a
separate content-insertion group, not mixed between query controls. Provide only
capabilities the task and service actually support: no forced search, import,
sort or pagination just to fill corners.

Default pagination to a bottom-right navigation group: page state, previous,
next and jump-to-page where the service supports them. Group navigation tightly;
keep query, insertion and navigation groups visually distinct through modest
spacing or semantic separators. Do not split every control into a floating island.
Give each group a clear accessible purpose and target. Pagination is a compound
control, not an obligation to turn page numbers/inputs into icons. Forward-only
cursors support next/append and honest loaded counts, not fabricated totals,
backwards navigation or jump-to-page. A customized footer is valid when requested
or when it improves geometry; do not show duplicate pagination in both places.

Use the real Table/selection/Pagination contracts from
[component decisions](component-decisions.md) and [presentation](presentation.md).
Corner portals can carry composed controls, but do not reserve blank bars or
oversized margins for hypothetical actions. Provide the actual clearance needed
for the last row, focus rings and Dock in narrow/touch layouts. Content priority
means using available screen space sensibly, not letting controls hide records.

With meaningful multi-selection and real bulk actions, the preferred default is
for the existing host Dock to smoothly become a bulk action bar via
`ConsoleActionScope`; it is not a second Dock. Show target/count/scope, valid
operations and clear/cancel selection; clear/exit restores the previous host
navigation items, position and preferences. Preserve focus and the action target
through the swap, with immediate keyboard/reduced-motion presentation where
needed. Users may explicitly choose a different local selection presentation.
Preserve selection
on failure as appropriate, snapshot confirmed targets and keep operation guards.
Do not convert navigation merely because the table is visible.

## Embedded table: change context only when warranted

If most of the useful viewport is concentrated on a local table, the intended
corner context becomes that table's query/navigation groups; leaving restores
the page groups. This is a Shell-owned context policy, not permission for each
plugin to position global overlays or install independent scroll listeners.
Plugins declare content targets and available operations; Shell chooses the
active context and presentation. Business filters/selection remain page-owned.

Design the policy with these conditions:

- Visibility is evidence, not a replacement for real interaction focus. A table
  passing through the screen while scrolling does not claim context. Active
  editing elsewhere or an explicitly chosen context takes precedence.
- Use separate enter/exit thresholds (hysteresis) and brief dwell/debounce.
  Tune them to content, scroll container and device; no universal fixed ratio or
  duration. A sustained table-dominant viewport can enter when no interaction
  lock conflicts; brief exposure cannot.
- Search input, open menus/popovers, keyboard operation and active confirmations
  keep their current target stable. Defer switching until the interaction ends;
  do not detach a focused input or rebind an action under a pointer/keyboard key.
- Several tables have one active owner at a time. Use explicit selection/focus
  and sustained context to resolve candidates; retain the incumbent on ambiguity.
  Name the table/scope in labels, context or tooltips so the target is clear.
- Restore the page on a genuine exit, dispose retired ownership on unmount/route
  change, and keep stale cleanup from clearing a newer owner. Table visibility
  never changes selection or silently merges selections across tables.
- Provide keyboard/touch access and a deliberate context choice when ambiguity
  remains; do not rely on hover or scrolling alone. Respect reduced motion and
  avoid switching animations for keyboard interaction.

The minimum host extension and currently available primitives are documented in
[runtime support](runtime-support.md#contextual-design-capability-boundary).
Do not write a fictitious observer hook, owner-registration API or preset call.
If that extension is outside scope, report it and a concrete design proposal;
implement a supported alternative only when the user chooses it.

## Real situations: apply the reasoning

| Situation | Useful default and reason | Avoid / exception and customization |
| --- | --- | --- |
| Orders fill the page | Search/filter/sort query group at top; create/import separately if authorized; supported pagination bottom-right; bulk Dock as the preferred selection presentation | Do not add theme/logout/home/refresh to complete four corners. Omit unsupported actions; user may choose a footer navigation group. |
| Article, summary and transactions table | Page context while reading; sustained table focus can activate transaction groups, restoring page context on exit | A brief scroll past rows must not steal the article context. Lock an open table filter until dismissed; user may keep table controls local. |
| Ordinary configuration form | Save/cancel and dirty state relate to the draft; validation beside fields | Do not borrow table search/sort/pagination. Use Form/Select/ComboBox/Accordion as appropriate; see scenario defaults. |
| Payments and audit tables on one detail page | One owner, labelled target, independent filters/selections; focus/explicit choice wins ambiguity | Do not race two observers or let “Next” switch tables while focused. User may keep both sets inline with distinct labels instead of viewport switching. |

Symmetry belongs to genuine page tabs and balanced composition, not an equal
number of actions in each corner. Grouping follows meaning; custom placement
must not make the target ambiguous or compromise focus and content clearance.
