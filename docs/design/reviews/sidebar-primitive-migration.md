# Sidebar primitive migration review

## Scope and ownership

- Request: use `@lenso/primitives/sidebar` for both sidebar levels and show the current workspace title at the top of the secondary sidebar.
- Dependency: `@lenso/primitives` 0.7.0. Frozen installation passed repository supply-chain policies.
- Primary rail uses primitive Root, Panel rendered as a navigation landmark, Content, Footer, Menu, MenuItem and Item.
- Secondary sidebar uses a controlled primitive Root, Panel and Header. The shared frame renders the navigation model's title as an `h2`, with truncation and a native title tooltip.
- Console's local recipe is now a visual adapter over real primitives, not an independent sidebar state/semantic implementation.
- Lenso Button and Button.Icon retain control appearance and geometry. Console owns the 56px rail, 248px context panel, semantic colors, content spacing and mobile composition.
- Primitive panels own Escape handling and the targeted toolbar Trigger restores secondary-panel focus. Console retains drawer Tab trapping and explicit close/backdrop restoration; it no longer has a competing document Escape handler.
- No Back/Forward, workspace switcher, or duplicate search control restored.

## Reference and direction

Preserve the existing Settings/Agent shell, Lenso typography, semantic themes and compact control scale.
The title is a context label, not another product-navigation control.
Title and section-label text share a 22px inset inside the secondary panel.
No new palette, assets, decorative effects or animation.

## Rendered evidence

Actual Chromium against standalone Vite development mode, not live backend acceptance.
Screenshots were captured in task scratch output and inspected; they are not committed visual baselines.

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop `/settings`, 1512×777 | Pass | Settings heading visible above search and section rows; no old switcher or oversized header |
| Light and dark | Pass | Both rendered with existing semantic colors and Lenso control surfaces |
| Primary control geometry | Pass | Every rail control 32×32 with a centred 16px icon at desktop; centres differ by no more than 1 CSS px |
| Hover and keyboard focus | Pass | Hover does not shift geometry; keyboard focus is visible with the primitive Button ring |
| Workspace title update | Pass | Selecting Welcome replaces Settings with Welcome; returning to Preferences restores Settings |
| Narrow `/settings`, 375×800 | Pass | Both themes; title and close control visible; all rail controls 36×36; no document horizontal overflow |
| Drawer dismissal | Pass | Close button and Escape from the secondary search dismiss the drawer, release main inertness and restore toolbar-trigger focus |
| Long/localized titles | Limited | Truncation and full native title retained; no full localization matrix or long-title rendered matrix run |
| Business data and permissions | Unverified | Shell checks use development data; settings locale error still visible |

## Focused regressions

Updated the existing five Chromium tests instead of adding a new test suite:

- A non-default workspace name, Research lab, must flow through the real catalog/navigation model; Settings and Plugins headings must also reflect their active areas.
- Header text start must match section-label text start.
- Closed uncontrolled Root must actually remain closed until the real Trigger opens it; the former fake Root ignored `defaultOpen`.
- Escape from either sidebar level must restore drawer-trigger focus; Escape from the appearance menu must close only that menu.
- Preserve mobile Tab wrapping, active Agent conversation/project href, desktop collapse, global search, hover and navigation scrolling.

All five tests passed in the parent checkout after migration.
Typecheck, focused lint and format, and production build also passed in the parent checkout.
Independent review found no actionable issues in primitive composition, controlled state, Escape/focus ownership, router semantics or title propagation.
React Doctor found no diagnostics, but its reported `main → origin/main` comparison does not prove a strict working-tree score regression check.

## Limits

- Settings still renders a locale JSON parsing error containing an HTML doctype; no data request or error policy was changed.
- Browser tests report a teardown timeout after successful assertions; this is not recorded as clean shutdown.
- Production build retains its large-chunk warning.
- No landing or publication performed.
