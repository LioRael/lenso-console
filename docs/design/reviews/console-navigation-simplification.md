# Console navigation simplification review

This records the earlier chrome simplification. The subsequent primitive migration and restored workspace title are reviewed in [Sidebar primitive migration](sidebar-primitive-migration.md).

## Scope and reference

- User feedback: `/settings` at 1512×777; remove Back/Forward and the duplicate workspace header, and correct primary rail control/icon proportions.
- Shared owners changed: `ConsoleHeader`, `ConsoleFrame`, `ConsoleNavigationRail`, `ConsoleShell`, and `console-shell.stylex.ts`.
- Reference: existing Settings shell and context items; Agent shell source and its existing browser fixture preserve conversation/project destinations.
- Primary destination → public Lenso `Button` with router `Link`, `Tooltip`, and `Button.Icon`.
- Appearance action → public Lenso `Button`, `Button.Icon`, and `Menu`.
- Context sidebar → existing Console-owned `Sidebar` recipe. Installed `@lenso/ui` 0.9.0 has no Sidebar export.
- Mobile close → public Lenso `Button`, owned by `ConsoleFrame`; no desktop header or blank reserved row.
- Direction: preserve Lenso's existing typography, semantic palette, pill controls and two-level navigation. Reduce redundant chrome rather than redesign business pages or introduce assets/motion.

## Geometry and rendered checks

Evidence: actual Chromium with standalone Vite in mock development mode; not a live backend acceptance.
Screenshots were captured and inspected in the task's scratch output, not committed as visual baselines.

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop `/settings`, 1512×777 | Pass | Back/Forward and workspace identity/switcher removed; context search and feature rows start without the former 80px header |
| Light and dark | Pass | Both themes rendered; shell, selection, icons and focus use installed semantic tokens |
| Narrow `/settings`, 375×800 | Pass | Both themes; drawer opens, close control remains visible, no document horizontal overflow |
| Primary rail proportions | Pass | Before: destination controls 40×40 with 20px icons, appearance 32×32 with 18px icon. After: all 32×32/16px at desktop and 36×36/16px at narrow size, supplied by the primitive |
| Icon alignment | Pass | Measured SVG and control centres differ by no more than 1 CSS px |
| Hover and keyboard focus | Pass | Existing pill hover surface and blue focus ring retained; no local radius or focus override |
| Drawer dismissal | Pass | Close button and Escape dismiss; focus returns to the toolbar trigger and main content loses inertness |
| Menu Escape and resize | Pass | Existing browser test uses the appearance menu; Escape returns to its trigger without closing the drawer, desktop resize releases inertness |
| Global search | Pass | Existing browser test verifies keyboard opening, focus return, result selection and short-viewport scrolling; desktop search remains centred |
| Sidebar collapse and scrolling | Pass | Existing browser tests verify content expansion, primary rail visibility, navigation scrolling and sticky actions |
| Context/content text anchors | Not applicable | Feature rows and page content styles unchanged; the duplicate workspace-label anchor no longer exists |
| Separators | Pass | No new boundary or duplicate separator added |
| Long/localized labels | Unverified | Existing tooltip and truncation owners unchanged; no full localization matrix run |
| Loading/error/permission policies | Not applicable | No data, permission or loading policy changed |
| Agent sibling `/agent/new` | Limited | Shared shell rendered, but local Agent API returned 500; real Agent conversation acceptance remains unverified |

## Verification and limits

- `context-navigation.browser.test.tsx`: 5/5 passed. Updated the existing menu fixture and added close/focus-return assertions within the existing drawer test.
- Typecheck, focused formatting and lint, and production build passed.
- React Doctor changed-scope scan reported no issues.
- Vitest reported a teardown timeout after successful tests; this is not recorded as a clean process shutdown.
- `/settings` showed a locale JSON parsing error containing an HTML doctype. The shell is reviewed, but the settings data workflow is not certified. This work did not change locale requests or hide their error.
- No API publication, landing, navigation permission change, new theme palette, or component-library migration.
- Runtime: `@lenso/ui` and `@lenso/tokens` 0.9.0, React 19.2.8, Vite 8.2.0, Playwright 1.62.1.
