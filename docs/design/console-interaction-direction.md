# Lenso Console interaction design and prototype direction

**Design date: October 9, 2026. Status: interaction design and prototype direction; not yet finalized or implemented.**

Lenso Console puts content first. It uses screen edges and corners for essential controls, lets navigation become more compact during scrolling, and adapts the available actions to the current task. A bottom-centered Dock is the default presentation, with a sidebar available as an alternative.

The inspiration from Liquid Glass is its use of space, content hierarchy, and contextual transitions—not glass materials, refraction, or glare. This design supersedes earlier prototype suggestions to keep navigation in a single form or avoid scroll-driven transitions. It retains the principles of discoverability, customization, and preserving page state.

## Content and action hierarchy

Text, tables, editors, and business objects occupy the main workspace. Global navigation, page actions, and selection actions each have a clear scope. Do not fill all four corners simply for symmetry or force every action into the Dock.

Floating controls do not reserve a permanent full-width strip in the layout; content can scroll behind them. Fading, transparency, and blur do not replace actual clearance: the end of a list, form buttons, and keyboard-focused controls must be reachable in an unobstructed position.

Navigation may recede, but task context must remain understandable. The current application, environment, page, and selection scope should always have a clear representation.

## Roles of the screen corners

The four corners serve different purposes. The following defaults are proposed for the first prototype and can be adjusted through use.

| Area | Default purpose | Principle |
| - | - | - |
| Top left | Back, navigation or sidebar toggle, current location, and application switching | Communicate where I am and where I can go without crowding every destination here |
| Top right | Primary page actions and additional actions, such as create, save, or share | Communicate what I can do with this content, distinct from the top-left navigation role |
| Bottom left | View switching, filter summary, or layout preferences when needed | Leave it empty when there is no useful function; avoid a permanent catch-all status area |
| Bottom right | Assistant or task-feedback entry point when needed | Avoid duplicating the top-right primary action or the bottom Dock |
| Bottom center | Default global Dock or current selection toolbar | Reuse the same location according to an explicit task state |

Users can customize position and presentation. The first version does not need arbitrary dragging of every button. Local controls may form compact groups without recreating a heavy, full-width navigation bar.

Group related controls by meaning, such as navigation, view options, content insertion, discussion, or primary page actions. Groups may grow as real capabilities are added; do not copy unavailable actions from a reference merely to populate a group. Desktop controls should be visually compact (about 32–36px), while coarse-pointer/touch controls retain at least 44px hit targets. Reduce surrounding padding before reducing icon readability or focus clearance.

**Corner button standard: prefer icon-only controls.** Buttons in the top-left, top-right, bottom-left, and bottom-right corners show only an icon by default. Add visible text only when the icon cannot communicate the meaning clearly and a label is genuinely necessary. Every corner button must provide a concise, explicit tooltip describing its action and, where applicable, its keyboard shortcut. Tooltips must appear on pointer hover and keyboard focus; do not rely solely on the native title attribute. Icon buttons must also have accurate accessible names; tooltips do not replace accessible names. Touch users must not need hover to understand or use an action. This standard applies to corner buttons and does not require removing necessary location indicators or task status.

## Default Dock and scroll-driven compaction

By default, an expanded Dock sits at the bottom center and shows a small set of frequently used modules as compact, icon-only controls. Each destination has an accurate accessible name and a short tooltip on hover and keyboard focus. The current module remains clear through its selected state and the workspace location indicator. Keep the wrapper and item spacing compact enough to accommodate additional destinations without enlarging every item. Additional plugins belong in a searchable full directory. Installing a plugin must not automatically rearrange pinned items.

The Dock is a soft floating pill with restrained elevation and a quiet boundary, not a heavily outlined rounded card. Its wrapper owns sizing once; avoid combining intrinsic widths, negative margins, and percentage constraints on inner panes. The Dock never scrolls internally. Destinations beyond its available capacity belong behind an explicit directory/overflow entry, and selection actions reflow deliberately in narrow windows without horizontal scrolling or changing pinned preferences.

Hover, press, and active states do not magnify icons. Tooltips explain destinations without changing their geometry; keyboard focus also provides the explanation and a visible focus ring. The selected destination uses one neutral shared indicator with the same visible radius as its button, moving between items during pointer navigation. Keyboard-initiated changes remain immediate. Touch interaction does not depend on hover; the stable navigation entry also opens a fully labelled directory. Tooltips must remain within viewport edges.

During sustained downward scrolling, the Dock smoothly contracts into a shorter navigation handle or capsule, retaining the current module or a clear navigation cue. It expands on upward scrolling, an explicit click, or a keyboard command. Use thresholds and hysteresis to prevent small trackpad movements from causing repeated transitions. These thresholds are tunable prototype parameters, not final product constants.

Once compacted by downward scrolling, the Dock stays compact at the page end. Scroll-driven expansion requires an explicit upward wheel, touch, or keyboard gesture. A negative scroll-position delta caused by scroll anchoring, layout correction, or end-of-page rebound is not upward intent. Hover and ordinary focus do not expand the compact handle; click or keyboard activation still can.

Overlays and selection actions pause scroll reactions without resetting the page's compact-browsing latch. A contextual toolbar temporarily replaces browsing controls; clearing its scope restores the previous compact/expanded browsing state. Explicit navigation interaction and pinned-open preferences may still expand navigation.

Users can pin the Dock open and disable scroll-driven compaction. Scrolling inside a menu, programmatic page positioning, and layout changes should not accidentally trigger compaction. The Dock must not disappear because the page scrolls while it has keyboard focus, a menu is open, items are selected, or an action is running.

Use lightweight transitions that preserve spatial continuity and communicate purpose. Avoid exaggerated bouncing. With reduced motion enabled, retain all functionality using immediate changes or short fades.

Use Motion for the Dock's purposeful layout transitions and shared active-item indicator. Keep travel short and interruptible, without bounce or icon scaling. Do not apply whole-page snapshot transitions, animate every state, or replay entrances while users read or type. Frequent keyboard navigation and command-palette opening remain immediate. Preserve page state, focus, and action scope; reduced motion removes layout and indicator travel. Existing Lenso overlay components retain their own focus and dismissal behavior.

Choreograph navigation-to-selection and selection-to-navigation as one continuous pill. Keep the shell's end caps circular and synchronized with its visual boundary rather than stretching the whole pill and its contents. The outgoing content uses a short fade with at most 2px of local blur; incoming content follows with a small stagger. Avoid hard wipes or simultaneous competing effects. The content and hit-test clip track the same physical shell geometry, including while shrinking. Do not overlap two readable sets of controls or leave an interactive invisible action underneath outgoing navigation. Retiring controls become inert immediately; incoming destructive controls are unavailable until their presentation is ready. Keep the whole swap short (under 300ms), interruptible, and immediate for keyboard/reduced-motion use. Settled padding must keep counts and focus rings within the rounded shell; decorative layers never receive pointer events.

## Dashboard density

The dashboard uses a compact overview heading, a tight row of summary surfaces, horizontally aligned activity rows, and a dense recent-items list. Keep the heading close to the upper content edge rather than reserving an oversized header area. Reduce container padding and gaps before reducing type size or hit targets. Related elements should be close enough to read as a group, with modest separation between sections. Narrow windows reflow the same hierarchy rather than endlessly shrinking labels. Floating controls still require real focus and content-end clearance.

## Style authoring

Write component and shared-layout styles in StyleX, applying styles directly to their owning elements. Use explicit state variants, media/container conditions, and composable `xstyle` props instead of descendant selector sheets. Reuse Lenso UI components and semantic theme tokens; do not introduce a parallel palette or reset.

Use supported longhands for backgrounds and borders (`backgroundColor`/`backgroundImage`, and border width/style/color). The current compiler can omit unsupported shorthand declarations without failing typecheck or build. Verify the resulting visible states in a real browser, not only the source declarations.

Motion owns continuously changing animation values. Static geometry, responsive rules, focus treatment, masks, and visual states still belong in StyleX. Keep handwritten CSS limited to global reset, font/theme infrastructure, and library stylesheet imports, not Dashboard or Dock component styling. A diagnostic class or data attribute may remain as a runtime hook, but it is not a selector-based styling API.

## Switching between navigation and bulk actions

Selecting the first table item transforms the existing Dock into a selection toolbar at the same visual location. Do not add a second toolbar or modify the global navigation configuration.

The selection toolbar shows the selection count, the target scope, available bulk actions, additional actions, and an exit-selection control. Labels must distinguish items selected on the current page from all filtered results. The first version only needs correct current-page selection; it must not imply cross-page selection.

Clearing the selection or explicitly exiting restores the original navigation items, position, and pinned preference. Finishing a bulk action does not always mean clearing the selection. Success, failure, and partial success should have explicit outcomes. At minimum, the prototype should demonstrate retaining the selection after failure.

Transitions must prevent accidental activation. A navigation button must not become a delete action between pointer-down and pointer-up. Confirmation and execution use an explicit snapshot of the target set; later selection changes must not silently expand a confirmed action. Destructive actions still require an explanation of impact and confirmation, even when they occupy a familiar navigation position.

Global navigation remains reachable through the top-left entry point and search. Before leaving a page, handle unfinished edits, confirmations, or running actions according to their actual state. Do not silently discard them or carry the previous page's selection into a new page.

## States and restoration rules

| State | Visible content | Exit or transition |
| - | - | - |
| Expanded browsing | Frequently used navigation | Scroll down or explicitly compact |
| Compact browsing | Small navigation handle | Click, use a shortcut, or scroll up |
| Selection actions | Selection scope and bulk actions | Clear the selection or exit selection mode |
| Action in progress | Current action and actual feedback | Restore according to the outcome |

Dialogs and menus retain their own focus management. Escape closes the innermost overlay first, then handles exiting selection mode. It must not dismiss every layer at once.

The page or component owns selection state. The workspace shell only presents actions contributed by the active scope. Multiple tables must not compete for the Dock. Leaving a route or unmounting a component revokes its contribution; an old handle must not clear the next page's toolbar.

Changing the Dock's presentation must not unmount the entire page or clear forms, filters, scroll position, or selected items. Do not persist transient selection as shared cross-page local storage.

## Sidebar and customization

The Dock is not the only global navigation presentation. A stable top-left navigation or sidebar button lets users choose a floating Dock or left sidebar. The Dock can also be positioned at the top, bottom, left, or right.

Both presentations consume the same navigation data, permission results, and routes. Do not maintain two separate feature catalogs. A settings panel can temporarily reveal the full directory without requiring it to duplicate a pinned sidebar.

In sidebar mode, global navigation may remain in the sidebar. When table items are selected, the same contextual-action system provides a selection toolbar at the bottom, without adding a second navigation Dock. This is a default to evaluate in the prototype; the two presentations do not require identical animations.

Persist only non-sensitive preferences such as position, mode, pinned items, and compaction behavior. Narrow windows need sensible overflow behavior for navigation and corner actions, rather than endlessly shrinking text.

## Edge treatment and visual language

The reference effect combines floating control groups with an edge fade. As content approaches an edge, it gradually blends into the background while the controls remain legible. There is no full-width opaque bar.

Prefer a small gradient scrim or edge fade. Add subtle progressive blur only where it helps. Do not confuse a gradient in opacity with a progressively changing blur radius. Decorative edge layers must not receive pointer events.

Do not pursue refraction, liquid highlights, heavy frosted glass, or large blurred areas. Theme contrast, text readability, visible focus, and reduced-motion behavior take precedence over material effects.

### Shared top edge

The shared layout owns a fixed decorative overlay, starting at 96px high, rather than a navigation bar or reserved strip. Content can pass behind it during document scrolling or an internal main-content scroll. Only background content physically crossing this region receives the effect; lower nested scrollers need no special treatment.

Expose height, maximum blur radius, and background-mask opacity independently, along with enable and reduced-transparency controls. Start with 8px maximum blur and 0.32 mask opacity. These are adjustable prototype defaults, not product constants. Favor fading over blur. A small number of differently masked, fixed-radius backdrop layers may approximate decreasing blur strength; a single fixed blur with changing opacity is not a continuously varying blur radius.

Keep corner groups in a separate foreground layer above the effect. The overlay must not capture pointers, scrolling, or text selection, or blur foreground buttons, tooltips, dialogs, and menus. Both themes use their existing semantic background. Unsupported backdrop/mask features and reduced-transparency preferences retain only the lightweight background gradient. Verify transitions with mixed text, cards, images, tables, and forms, including content crossing the edge and content below it.

## Plugin and page integration

Separate navigation data from presentation. Plugins contribute destinations and necessary metadata; Console decides whether to show them in the Dock, directory, or sidebar. Pages contribute actions for their current context rather than modifying global DOM or forcing themselves into a particular screen corner.

A small amount of typed configuration or React context can express page and selection actions. The first version should serve the actual prototype needs without adding a universal slot engine or requiring changes to Lenso Engine, Manage, or Auth protocols.

When integrating real Manage capabilities later, reuse their actual visibility conditions, scopes, permissions, confirmations, and execution feedback. Hiding or disabling a UI button is not server-side authorization.

### Frontend composition and page context

`ConsoleLayout` owns content, decoration, and foreground layering without choosing a scroll container. `ConsoleLayout.Corner` accepts an area and arbitrary React children: Lenso button groups, state indicators, and richer controls compose together rather than being reduced to an action array. `ConsoleLayout.Foreground` supports other foreground surfaces, including the Dock. Portals preserve the contributing page's React context; removing a contribution removes only its own nodes.

`createConsolePageContext<T>()` creates a page-specific controlled Provider and hook. The page owns the typed value and updates; foreground consumers can read the rendered value, get the last committed snapshot, or request updates. This supports a dirty editor enabling its save control without exposing editor internals to the generic layout. Canonical facts such as running actions remain owned and validated by the page, not writable through presentation preferences.

Each Provider has an explicit activation `scopeKey`. Changing it revokes old handles even if the page layout stays mounted. A stale setter is inert and a closed getter fails explicitly. Activation identity is not a route label, cache namespace, Plugin definition ID, or persistent preference key. Keep persistent forms and panes outside the keyed foreground projection. Revocation also requires disposing subscriptions and discarding late results; aborting a request does not undo an already dispatched write.

These are local frontend composition APIs, not new SDK or backend protocol fields. Existing admitted page mounts and optional sidebar contributions retain their contracts.

### Dock extension direction

Separate what the Dock contains from how it is presented. The proposed content model includes navigation destinations, owner-qualified actions, semantic separators, and locally composed rich content. Presentation preferences select ordering, visibility, position, and whether an additional-actions group is shown; they cannot create capabilities. A divider separates navigation from optional additional controls rather than dividing every item.

Treat compact handle, normal bar, and expanded tray as presentation states independent of navigation versus contextual-action scope. The expanded tray accommodates labelled actions or richer content instead of making the bar indefinitely wider. Expansion is explicit, has an accessible control and dismissal path, preserves the active scope, and respects running actions and confirmations. Narrow layouts reflow within viewport bounds; neither the bar nor a hidden overflow region becomes an accidental horizontal scroller.

Installed contribution definitions and user presentation preferences remain separate sources of truth. A local React callback is not a registered Plugin action. Future action registration requires admitted owner identity, stable owner-local IDs, actual service requirements, visibility rules, and execution feedback. The current prototype does not yet implement that registry, configurable action groups, or an expanded tray.

### Dashboard widget direction

Dashboard is an optional application-installed page, not the Console home contract.
The application chooses its index route. Dashboard owns explicitly selected widget
definitions, user-created instances and draft layout editing; the core Shell does
not know the grid or its save protocol. Stable binding and widget IDs identify a
definition; multiple instances may use it. A versioned document stores instance
configuration separately from placement geometry.

Removing an instance does not unregister its definition or delete business data.
Missing definitions leave recoverable unavailable states. Unauthorized renderers
must not load, and the server redacts hidden configuration while preserving its
original data during visible edits. Dashboard scope comes from trusted server
context and saves use revision CAS. Dock preferences are a separate small store.
Neither store grants service access or stores credentials/executable asset URLs.
Existing admitted page mounts are not implicitly widget definitions.

## Current frontend stage

The default `/` entry is an empty home surface. Demo pages, mock data, demo navigation, and corner controls are removed rather than hidden behind a toggle. Shared layout, theme, page-context, and Dock foundations remain available; the empty home does not mount a Dock or contribute corner controls. Add actual home content and Plugin capabilities in subsequent steps.

## Interaction acceptance direction

When real pages are added, validate browsing, scroll-driven compaction and expansion, selection-driven transformation, action feedback, and navigation restoration with actual page scopes. Also cover sidebar switching, all four Dock positions, and returning between pages. Do not restore the removed mock pages merely to populate the interface.

The key outcomes are preserving page state, keeping navigation discoverable, preventing accidental activation during animation, making selection scope explicit, and avoiding permanent obstruction of content. Run proportionate build and type checks and a real browser walkthrough without creating a large testing or verification-documentation system.

This prototype is for experiencing and choosing the interaction model. It does not represent completed production integration, backend changes, code merging, or release.
