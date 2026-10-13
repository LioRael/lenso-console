# Dashboard presentation

Load this reference when building or changing a Dashboard page's layout,
widgets, density, editing controls, or drag interactions. For Shell-wide
navigation, corner, Dock, icon and typography rules, use the shared
[Console presentation guidance](../../console-page-interactions/references/presentation.md)
as the source of truth.

## Page and widget hierarchy

- The Shell's compact context island owns the page title. Avoid a redundant page
  `h1`; let the workspace begin at the clearance supplied by Shell rather than
  adding a second top offset.
- Choose compact default placements from actual content and honor each widget's
  declared minimum and maximum dimensions. Content should fit its measured
  container; do not treat any sample layout (including the Auth 4×3 example) as
  a universal size prescription.
- Browsing is content-first: render the semantic widget surface without a
  decorative frame or shadow. Keep editing affordances out of the content
  surface until the user enters edit mode.
- A Dashboard document is not a Dock preset. The host may register its page as
  a navigation destination; its editing controls do not belong in that Dock.
  Preserve existing
  saved membership and layout when changing presentation; never rewrite saved
  geometry merely to apply a new visual default.
- Use the iOS home-screen / Control Center reference only for clear hierarchy
  and explicit edit mode. Do not copy jiggle, glass, or a forced platform clone.

## Editing controls

Use the existing role-based corner composition: leave top left to host
navigation; top right offers Edit and, in edit mode, Done; bottom left offers
Add and layout options such as Undo and Restore; bottom right may offer scoped
Cancel. Clean completion can exit immediately; dirty cancellation confirms.
Keep Dashboard actions in page corners, never in
the Agent-reserved Dock or its selection actions. Do not restore a removed
Dock-editing API.

Apply the shared presentation guide's icon and corner standards. Use native
Lenso controls, modals, and tooltips. Editing-only affordances (including drag
handles and remove buttons) appear only in edit mode; settings and removal
remain explicit, keyboard accessible actions.

Check smaller viewports and richer host Dock contents, not just a single default
pin. Secondary layout actions fit a popover; corner targets may lift above the
bottom-center region. Keep real content-end clearance. At small widget sizes,
provide accessible scrolling or a supported detail affordance rather than
silently clipping required information.

## Layout interaction

Use the package's existing layout and keyboard controls. The documented
react-grid-layout 2.3.0 same-cell drag/resize memoization limitation is handled
by the internal pointer-grid-layout helper; consumers should reuse the public
Dashboard integration rather than copy that workaround or patch dependencies.
Preserve continuous drag/resize updates within a cell, stable widget identity
across placement changes, and cancellation/cleanup across unmount and
StrictMode lifecycle.
Keep held pixel movement transient; update canonical placement on stop and
persist only through the page's explicit commit.

Treat headless DOM geometry as interaction evidence, not proof of physical
frame rate. Verify real browser behavior for same-cell movement and resizing,
cross-cell persistence, keyboard editing, narrow reflow, and retained widget
state.

## State and safety

Keep edits in the local draft until an explicit save. Confirm destructive
restore/removal; preserve draft content on failed saves. A dirty cancel requires
confirmation, and revision conflicts require explicit reload rather than
silently replacing the user's draft. Preserve the package's existing
authorization and renderer-mount rules while changing presentation.

## Completion evidence

Record browser evidence for browse/edit separation, all changed corner controls,
settings and confirmations, touch targets, themes, content fit and keyboard focus.
Sample held movement before release and verify cross-cell drop/resize survives
save without remounting the renderer. Permission retirement must abort child
work even if the parent lease remains live; aborted writes are not claimed undone.

Consult the [public React entry](../../../../packages/console-dashboard/src/react.tsx),
[Dashboard implementation](../../../../packages/console-dashboard/src/dashboard.tsx)
and [internal pointer adapter](../../../../packages/console-dashboard/src/pointer-grid-layout.tsx)
as evidence, not private imports for consumers. Reuse the focused
[drag proof](../../../../examples/composed-console/dashboard-drag.browser.mjs)
and [lifetime proof](../../../../examples/composed-console/dashboard-lifetime.browser.mjs)
when changing those contracts. Use the consuming host's actual validation commands;
the composed sample is not production persistence evidence.
