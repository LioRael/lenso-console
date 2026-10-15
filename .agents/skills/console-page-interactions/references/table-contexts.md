# Table contexts and semantic groups

Read for table-dominant pages or tables within mixed content. The local candidate's
`ConsoleTableContext` implements these table defaults; verify the consuming
artifact through [runtime support](runtime-support.md). They are not a fixed position
schema. Explicit user customization takes priority with clear targets,
accessibility, unobstructed content and stable interaction context. Use
[runtime support](runtime-support.md#contextual-design-capability-boundary) before
implementation; do not generalize this table specialization to ordinary pages.

## Full-page table

Search defaults to the `ConsoleTableSearch` button, expanding in place on
activation rather than showing a permanently open input. Keep the query controlled
by the page; collapsing preserves it and indicates an active filter. Keyboard and
reduced-motion activation are immediate; pointer expansion is brief and anchored.
Quick search defaults to top left, with a same-size filter entry at top right.
Use `ConsoleTableContext.filters` to declare owner-supported fields and controlled
conditions. Project one compound filter-state control in the
top-right corner, not individual condition or group summary buttons. Both flat
and tree APIs use this presentation. Show Filters when inactive, a readable
single-condition summary when simple, or Custom filters with a condition count
when complex. Keep Boolean grouping in the editor rather than flattening it.
The entry opens one shared, theme-scoped editor from the root. Titles, Match logic,
conditions, groups and add actions all stay inside.
Conditions edit inline, but all changes belong to one query draft. Only the
panel's Apply filters validates and publishes the whole draft, once. Cancel,
Escape, close and outside dismissal preserve the previously applied query.
Clear resets only the draft until Apply filters; omit per-condition Apply and Done.
Desktop uses an anchored Popover; narrow screens use a near-full-screen Modal
with preserved draft data, accessible dropdowns and a bounded scrolling body.
Separate semantic groups distinguish conditions and actions inside the editor.
Keep the corner free of scattered condition controls and duplicate bars.
The shared host handles measured clearance, search/task-context avoidance and
draft interaction locks. Cancel leaves the query unchanged; applying/removing a
query resets the initial cursor once, on Apply filters. For capable owners, use controlled `value` /
`onValueChange` with `ConsoleFilterGroup`: AND/OR groups, repeated fields and
bounded nesting stay in the same editor. The panel offers local Add condition
and Add group controls.
Inside the shared root popover, use a separate vertical editor: Match logic in the
header, condition rows with inline editing, and child groups as labelled nested
containers. Add condition / Add group are local actions, not another filter-icon
toolbar. Keep the root and its complete subtree in the same editor popover.
Keep removal inside the corresponding condition/group editor. Bind the
tree before pagination, or evaluate a complete snapshot. Calendar-date fields use
`on`/`before`/`after`/inclusive `between`; the owner defines timestamp-to-calendar
conversion. See the public [table contract](../../../../packages/console-react/README.md#table-controls-and-contextual-defaults)
for bounds and empty-group semantics. Keep flat `conditions` / `onConditionsChange`
for services that only support flat AND predicates. Layout customization is separate and
does not get a default business corner button.

When comparable records occupy the page, default to the needed search, filter
and sort controls in compact top-corner query groups. Create/import belong in a
separate content-insertion group, not mixed between query controls. Provide only
capabilities the task and service actually support: no forced search, import,
sort or pagination just to fill corners.

Default pagination to a bottom-right navigation group: page state, previous,
next and jump-to-page where the service supports them. Group navigation tightly;
keep query, insertion and navigation groups visually distinct through modest
spacing or semantic separators. Do not split every control into a floating island.
Previous/next steps use icon buttons with accessible names and hover/focus
tooltips; summaries, page numbers and page-entry controls retain meaningful text.
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

Use `ConsoleTableContext mode="embedded"` for the table's content and groups;
Layout owns the observation and arbitration. Hosts may opt into a controls menu
for automatic or explicit context; small tables also expose a local activation
button. Keep page fallback groups in a page-mode context. On older hosts without
this contract, report the missing host support instead of implementing a private
observer in the plugin.

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
