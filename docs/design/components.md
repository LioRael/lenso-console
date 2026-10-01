# Component reuse and ownership

Read this before authoring UI markup. Inspect the installed `@lenso/ui` exports/types and the current reference source; APIs and package versions may differ between repositories.

## Choose an owner

| Scope | Owner and action |
| --- | --- |
| Color, typography, radius, spacing meaning | Existing semantic Lenso token; add a token through the token owner only when the meaning is absent |
| Reusable control behavior and appearance | `@lenso/ui`; extend an existing primitive/variant in its owner when the capability is shared |
| Repeated product composition with the same behavior | Shared component in that product repository, built from UI primitives |
| Business data, authorization, navigation state | Owning feature/plugin, passed into the composition |
| One page's arrangement | Page layout styles, without redefining primitive internals |

Search in that order. A raw button or anchor is appropriate for native document semantics; reconstructing an existing Lenso control with raw markup is not. A wrapper should remove repeated behavior or composition, not merely rename a primitive.

## Discovery map

| UI role | Starting point | What to preserve |
| --- | --- | --- |
| Two-level shell and navigation | `src/components/runtime/console-frame.tsx`, `console-navigation-rail.tsx`, `context-navigation.tsx` | Shared 48px toolbar, 56px rail, 248px context sidebar, desktop collapse, mobile focus and close behavior |
| Plugin sidebar | `src/features/extensions/workspace-sidebar-slot.tsx`; `docs/console-page-contributions.md` | Plugin provider context through the shared slot; one context sidebar |
| Toolbar, context identity, page heading | `console-header.tsx`, `console-workspace-header.tsx`, `console-page-header.tsx` in `src/components/runtime/` | Separate global history/search, current context selection, and feature title/actions; shared anchors and wrapping |
| Action / icon-only action | `@lenso/ui/button`, `isIconOnly` | Variant, loading/disabled states, focus, accessible name; all icon-only actions use the primitive's pill radius without local corner overrides |
| Workspace or action menu | `@lenso/ui/menu`; existing product switchers | Trigger anchor, selected state, keyboard movement, Escape, portal |
| Selecting a value | `@lenso/ui/select` or `combobox` according to search need | Current value, labels, keyboard behavior; use a menu for actions |
| Small contextual help | `@lenso/ui/tooltip`, `popover` | Portal, collision handling, clipping, focus access |
| Task requiring a modal | `@lenso/ui/modal` | Focus return, Escape policy, meaningful title; workspace selection uses a menu |
| Settings fields | Console `src/components/lenso/recipes/settings-row.tsx`, `@lenso/ui/label`, existing Settings compositions | Label/control alignment, help placement, shared control sizes |
| Loading / empty / error | `src/app/route-states.tsx` and the owning feature's existing state composition | Useful explanation and recovery action, correct permission behavior |

Discover other controls from package exports instead of assuming they are absent. Use the repository's existing router link via the primitive's supported composition API (for example `render`), preserving native anchor behavior. Never nest interactive elements.

## Console chrome composition

`ConsoleShell` selects the active feature, permission-filtered catalog, and App context. `consoleNavigationModel` creates the shared rail, workspace-menu, and global-search destinations from those inputs. Keep App/workspace/session parameters in the router destination; selecting an active Agent must retain its conversation and project query.

`ConsoleFrame` owns the two-level geometry and mobile drawer. `ConsoleHeader` owns global history/search/actions; `ConsoleWorkspaceHeader` owns the context identity and switcher. `ConsoleNavigationRail` owns primary destinations and appearance actions. `ContextNavigationContent`/`Item`/`Section` give feature sidebars common spacing and selection. Page titles and actions use `ConsolePageHeader`.

The desktop toolbar follows Pencil's three regions: equal 360px side regions and a centered 336px address group containing a workspace mark, page icon and 272px context-search trigger. Its global navigation actions use 40px Lenso icon-only buttons. Below 1050px the identity/address group contracts to the icon-only search; action regions must not overlap. Do not position the field independently at 50% of the window: it belongs inside the centered group, whose other identity elements account for its offset.

`Sidebar.Item` already composes Lenso Button directly. Context items use `ghost` when idle and `secondary` when selected, retaining the Button's pill radius and hover surface. Do not nest another Button through `render`, or restore small corner/background overrides in the context-navigation styles. The row's width, height, padding and text alignment remain Console layout concerns.

Plugin sidebar contributions still enter through `WorkspaceSidebarSlot` with their provider context. Supply sidebar content rather than another frame, toolbar, or workspace identity. The Console composition owns that chrome once. Feature/plugin code continues to own its data, controls, and authorization.

When composing a router anchor through Lenso Button, use `nativeButton={false}` and `role="link"`; otherwise the Button's default role overrides native anchor semantics. Menu destinations retain menu-item semantics. Verify the rendered element and destination rather than assuming `render={<Link />}` alone establishes its accessible role.

## Icon-only actions and page context

Use Lenso Button with `isIconOnly` for icon-only actions, including close, clear, attachment removal, toolbar history, primary navigation and submit/stop controls. Its installed pill geometry is the shared owner. Preserve accessible names and any existing disabled/loading behavior; use the supported router render API for destinations. Do not override the radius with a rectangular local style.

Failure: a selected rail icon has small rounded corners while the adjacent theme action is a pill, or a composer submit icon restores a square corner style. Acceptance: the default, hover, selected, focus and disabled surfaces remain pill-shaped with stable geometry.

Plugin detail pages use the Console rail/context navigation and global history toolbar for orientation. Do not add a second breadcrumb toolbar or leave an empty reserved header row after removing it. Keep the existing explicit recovery link in unavailable/not-found states.

## Before adding a new component or override

Record the existing candidates inspected, why their semantics/API do not fit, and whether another consumer needs the same capability. Prefer a shared variant over a second near-identical control. Do not force an unrelated component into the role merely to claim reuse.

Use public props, slots, tokens, and supported style overrides. Avoid generated class names, CSS that targets package internals, arbitrary icon/line-height resets, and page-specific copies of shared controls. Console styles follow [StyleX authoring](../stylex-authoring.md); plugin CSS stays scoped to that plugin.

Changing layout spacing is a page concern. Changing every Button's height or every Menu item's selection color is a design-system concern. Verify the other consumers when changing a shared owner.
