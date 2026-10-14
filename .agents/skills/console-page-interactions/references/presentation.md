# Console presentation

Use for creating or changing a plugin page's UI in either authoring path.
Read the [design direction](../../../../docs/design/console-interaction-direction.md)
for the shared visual rules, [runtime support](runtime-support.md) for available
surfaces, and [safety](safety.md) for execution ownership. This guide turns those
rules into page-authoring decisions; it is not a second Shell or component library.

## 1. Plan the content and its controls

Name the page's job, primary content, real actions and target host. Use
[component decisions](component-decisions.md) for form/selection/disclosure
choices; inspect the installed API and matching example rather than assuming
that importing Button and Input is sufficient library reuse. An ordinary
index/list/detail is not a Dashboard.

Write a short placement plan: task context, corners, inline controls, and any
host-approved selection surface. Start with the content, not a template of
headers, statistics, cards and toolbars.

**Done:** every visible control has an existing operation or destination, and
each piece of information has one presentation owner.

## 2. Separate icons from names

Compact Dock destinations and corner buttons use purpose-specific SVG icon
components from Lenso UI or the application's existing approved icon set.
Provide an explicit `icon` on local navigation and Dock action definitions.
The icon is the visual mark; `label` remains the full accessible name and the
visible name in labelled directories, menus and other presentations.

Keep SVGs decorative with `aria-hidden="true"` when the control already has a
name. Use inherited theme color and consistent size/stroke. Verify the actual
export instead of guessing an icon name.

**Reject:** rendering a label, initial, emoji or Unicode character as the icon.
A Shell text fallback is recovery behavior, not a plugin's finished design.
Necessary text in a confirmation, menu, table footer or directory is not an
icon and should remain readable.

Local React icons are not automatically serializable SDK metadata. The current
compiled navigation descriptor carries labels and paths, not an arbitrary React
`icon` field. When the installed host cannot carry the desired destination icon,
report the host mapping gap; do not extend the descriptor by guesswork. Page
corner icons can still use supported browser-safe components.

**Done:** every contributed compact control has a real icon, a concise accessible
name, and a hover/focus tooltip where the host presents one. Touch operation does
not depend on hovering to discover the action.

## 3. Place necessary persistent page actions

For necessary persistent corner actions, use `ConsoleLayout.Corner` and
`ConsoleIconButton`. Keep field actions, local recovery and small-widget controls
near their content when that better serves the task. Choose an
explicit button variant: the shared button's default is not a design decision.
Quiet standalone controls generally use `secondary`; the principal commit uses
`primary`. A destructive entry can use `danger-soft`, with `danger` for the final
confirmation. `ghost` fits menu/inline utilities, not every floating action.

Follow the design document's contextual defaults, not a fixed corner template.
Read [table contexts](table-contexts.md) for table-specific defaults and
[scenario defaults](scenario-defaults.md) for other content. Leave unused corners
empty. In narrow
windows, combine secondary actions into a Lenso UI popover/menu instead of
shrinking targets or expanding into the bottom-center area.

The Dock is host-owned navigation/Agent space, not a page-wide edit toolbar.
Dashboard add/edit/done/cancel default to compact corner groups during explicit
editing; honor customization and omit actions the current mode does not need. Meaningful table/file/collection multi-selection defaults to a smooth conversion
of the existing Dock to bulk actions via `ConsoleActionScope` when the consuming
host supports it; clear/cancel restores navigation with focus and targets stable.
Explicit user customization may choose a local selection presentation instead.
Real multi-selection is not permission to invent bulk operations; a one-object
Inspect action is available only for exactly one selected object.

`dockViews` and `ConsoleDockContent` remain technical host capabilities. Their
availability does not authorize a plugin to install its own editor in that space.
Never manufacture a selection count just to put a page action in the Dock.

When the task explicitly changes the host's expanded directory, prioritize
labelled destinations and search. Keep mode/Command/settings utilities in a
compact secondary strip, with a concise current-preset control. Reclaim chrome
before shrinking content. This is host work, not permission for a page to alter
Shell internals.

**Done:** necessary standalone corner buttons prefer icon-only with tooltip and
accessible name; compound controls retain needed text. Controls do not overlap
the reserved Dock, content-end controls or focused elements. Check
the whole hit target in both pointer modes, not just its center.

## 4. Keep the island compact

Use `ConsolePageScope` for the supported Context Bar (the central island).
Use a short page/object identity and an explicit return only when a real parent
workflow exists, through the supplied navigation path. Let declared page groups
supply genuine, balanced/symmetric workflow tabs; do not manufacture tabs for
symmetry.
Do not draw a second island with `Foreground`.

The island is not a dashboard of metrics. Put loaded counts in the table footer;
full-page table pagination defaults to a
bottom-right navigation group (see table contexts), with a footer composition
when customization or geometry calls for it. Detailed status and identifiers
belong in content unless they
are needed to disambiguate the current object. When the island already identifies
the page, omit a duplicate visible page heading but retain semantic regions.
Embedded widgets do not publish page context.

Shell owns the context's shape and transitions. Page code does not add corner
navigation merely because selection began, or patch skin geometry to fit a label.
If Shell motion changes, sample both forward and return frames: radius, width,
content clipping, retiring-control inertness and cap retirement, including
keyboard and reduced-motion behavior.

**Done:** context explains location without repeating content or actions, and
return has a real target plus the same dirty/running guards as navigation.

## 5. Use the component contract for lists and details

Use the real Lenso UI compound `Table` for comparable records. `secondary` is
the usual content-first workspace choice; default `primary` is for an
intentionally contained surface. Compare actual styles rather than inventing a
`default` enum value or applying the same variant everywhere.

- Size columns through supported `Table.Column` width/min/max props; ordinary
  styles can be overridden by the renderer. Keep selection narrow and give
  identifiers/timestamps room to wrap. Avoid equally dividing every column.
- Use `Table.SelectionCheckbox` and controlled selection, including select-all
  when applicable. State whether selection covers loaded/current-page rows.
  Preserve global shortcuts from checkbox focus; stop only handled selection
  keys, not every key event.
- Use the installed `Pagination` composition; `Table.Footer` is a supported
  in-content host, while `ConsoleLayout.Corner` can compose a bottom-right
  navigation group for a full-page table. Neither creates a pagination service.
  Opaque forward
  cursors justify an append control and an honest loaded count, not invented
  totals, backward pages or cursor URLs. Read actual demos/types; there is no
  license to invent a `Table.Navigation` component.
- A business object with its own inspection workflow gets a real detail route,
  not an expanding table row by default. Include target/tenant identity where
  IDs are not globally unique. Use generated links, native modified-click
  behavior, and a supported explicit return.
- In detail content, prioritize identity and the facts that drive a decision;
  group supporting metadata. A destructive action is a compact page entry plus
  a Lenso UI confirmation dialog, not an oversized promotional section.

Read the [Auth pages](../../../../packages/auth-console/src/pages.tsx),
[plugin list/detail](../../../../packages/console-plugin-manager/src/plugin-manager.tsx)
and [Orders views](../../../../examples/composed-console/orders-pages.tsx)
for component and owner boundaries, not as permission to copy their fixture data.
Remaining text-glyph controls in source are not examples of the icon standard.

**Done:** rows, selection, footer and detail routes express real service
capabilities; empty/loading/error/running states have meaningful recovery.

## 6. Prove the rendered result

Use StyleX and semantic theme tokens. Inspect extracted/consumed styles, not only
source declarations. Let Shell own top clearance; add only the page's necessary
spacing and unobstructed content-end clearance.

Follow [validation](validation.md). Verify themes, narrow/coarse-pointer bounds,
keyboard operation and focus restoration. Tooltip portals must escape clipped
panels while retaining theme tokens; use supported Lenso UI `ThemeScope`/portal
composition when necessary. Check viewport edges and actual occlusion, not only
the tooltip's rectangle. Development feedback tools are obstacles too.
Keep `ThemeScope` and its tooltip consumer on a compatible shared package entry;
separately prebundled copies can split the theme/portal context.
Allocate overlay theme/portal hosts when needed and retain them through the
library's close lifecycle. Closed tooltips should not keep copying ancestor
styles during unrelated navigation animations.

After resizing, await real settled geometry. For motion/drag bugs, settled
geometry is not sufficient: verify the held/intermediate frames. Disabled
controls should expose their state; they are not failed pointer targets.

**Done:** report the actual host and browser checks, unavailable APIs and remaining
gaps. A successful example build is neither production assembly nor release
authorization.
