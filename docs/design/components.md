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
| Global rail, context sidebar | Console `src/components/runtime/console-shell.tsx`, `context-navigation.tsx`; `@lenso/ui/sidebar` | Existing shell, item states, icon size, row rhythm, mobile close behavior |
| Plugin sidebar | `src/features/extensions/workspace-sidebar-slot.tsx`; `docs/console-page-contributions.md` | Plugin provider context through the shared slot; one context sidebar |
| Header | `@lenso/ui/page-header`; `src/features/agent/agent-page.tsx` and its styles | Existing single-row sizing, action alignment, wrapping, one separator owner |
| Breadcrumb | `@lenso/ui/breadcrumb`; `src/features/plugins/plugin-detail-page.tsx` | Root/List/Item/Link/Page/Separator semantics, current page, link hit areas, keyboard navigation |
| Action / icon-only action | `@lenso/ui/button`, `@lenso/ui/icon-button` | Variant, loading/disabled states, focus, accessible name |
| Workspace or action menu | `@lenso/ui/menu`; existing product switchers | Trigger anchor, selected state, keyboard movement, Escape, portal |
| Selecting a value | `@lenso/ui/select` or `combobox` according to search need | Current value, labels, keyboard behavior; use a menu for actions |
| Small contextual help | `@lenso/ui/tooltip`, `popover` | Portal, collision handling, clipping, focus access |
| Task requiring a modal | `@lenso/ui/dialog` | Focus return, Escape policy, meaningful title; workspace selection uses a menu |
| Settings fields | `@lenso/ui/settings-row`, `label`, existing Settings compositions | Label/control alignment, help placement, shared control sizes |
| Loading / empty / error | `@lenso/ui/content-state`, `inline-alert` | Useful explanation and recovery action, correct permission behavior |
| Compact inline shortcut | `@lenso/ui/quick-link` | Inspect its inline sizing and icon slots; it is not automatically a full-width collection row |

Discover other controls from package exports instead of assuming they are absent. Use the repository's existing router link via the primitive's supported composition API (for example `render`), preserving native anchor behavior. Never nest interactive elements.

## Breadcrumb example

Compose the hierarchy with `Breadcrumb.Root`, `Breadcrumb.List`, `Breadcrumb.Item`, `Breadcrumb.Link`, `Breadcrumb.Separator`, and `Breadcrumb.Page`. Supply the real router link through the supported link API. The current item uses Page. Separators belong to the primitive.

Failure: each page assembles links and chevrons with independent gaps, colors, truncation, and hover styles. Even if the initial screenshot looks similar, the behavior and subsequent tuning diverge.

Acceptance: all breadcrumbs in the changed feature share the same composition; changing their presentation has one owner. Long names and narrow layouts remain usable, and parent links work with keyboard and modifier-click.

## Before adding a new component or override

Record the existing candidates inspected, why their semantics/API do not fit, and whether another consumer needs the same capability. Prefer a shared variant over a second near-identical control. Do not force an unrelated component into the role merely to claim reuse.

Use public props, slots, tokens, and supported style overrides. Avoid generated class names, CSS that targets package internals, arbitrary icon/line-height resets, and page-specific copies of shared controls. Console styles follow [StyleX authoring](../stylex-authoring.md); plugin CSS stays scoped to that plugin.

Changing layout spacing is a page concern. Changing every Button's height or every Menu item's selection color is a design-system concern. Verify the other consumers when changing a shared owner.
