# Console documentation-style chrome review

## Scope and reference

- Shared owners: `ConsoleHeader`, `ConsoleSearch`, `console-shell.stylex.ts`, and `console-search.stylex.ts`. Feature content, navigation destinations, permissions and query/session parameters remain in their existing owners.
- Reference: [Lenso UI documentation](https://ui.lenso.dev/en/docs/react/getting-started), inspected in Chromium at 1280×800 and compared with the running Console Settings shell.
- Upstream source: `LioRael/lenso-ui` commit `eaac16280052e5cf70c86eddd54e92861401fe76`, `apps/docs/src/components/fumadocs/layouts/notebook/index.tsx`, `apps/docs/src/styles/{docs,notebook,search}.stylex.ts`, and `apps/docs/src/components/fumadocs/ui/search-dialog.tsx`. Upstream identifies Fumadocs MIT and HeroUI Apache-2.0 adaptations.
- UI role → existing component: navigation/history/search actions → Lenso Button; searchable command list → Lenso Autocomplete; modal/focus boundary → Lenso Modal; Escape hint → Lenso Kbd. Console keeps its existing command data and behavior, rather than adding Fumadocs/Orama or documentation search endpoints.
- Intentional adaptation: only the documentation site's first header row is adopted. Console retains its rail/context sidebar rather than duplicating the docs category tabs. Search is centered between equal flexible side regions; the documentation site's action-specific 48px search offset is not carried over.
- Design direction: existing Lenso tokens and documentation chrome, not a new visual system. ENERGY 1 / RHYTHM 1 / MOTION 1; no new decorative assets or motion. Blur isolates the command overlay; the field shadow identifies the search entry, and the popup shadow identifies its elevation.

## Geometry and rendered checks

Local rendering used `/settings`, Vite mock mode, published `@lenso/ui` / `@lenso/tokens` 0.9.0, and Chromium. Screenshots were captured in the task's temporary scratch directory, not committed as visual baselines.

| Check | Result and evidence |
| --- | --- |
| Desktop | Pass: 1280×800, both themes; toolbar 56px high, search x=440 / width=400, popup x=320 / y=150 / width=640. |
| Breakpoint | Pass: 768×800, both themes; full-width 400px search fits between identity and history actions. |
| Narrow | Pass: 375×800, both themes; toolbar 52px high, search is a 36px icon action; popup x=8 / y=16 / width=359. No document horizontal overflow. |
| Short viewport | Pass: 375×300 captures show a scrollable popup within the viewport. The mounted browser test additionally checks 1024×400 with 41 results: the last result remains entirely inside the popup after scrolling, and the popup remains inside the viewport. |
| Hover / keyboard focus | Pass: captured both themes and sizes. Search retains its bounds and has a visible 2px focus outline. History/navigation actions retain Button pill geometry and their accessible names. |
| Theme propagation | Pass: final dark capture has a dark blurred veil and dark popup; light capture has a light veil and light popup. Selectors follow Console's `data-theme`, including portaled surfaces, not the docs site's `.dark` class. |
| Selection / filtering / empty | Pass: keyboard-selected row remains visible; existing browser proof now checks filtering, filtered-empty state and selection callback as well as dismissal. |
| Overlay / keyboard | Pass: initial input focus, Ctrl K, Escape, explicit close control, focus return, and the command menu above the compact Agent composer are verified in mounted browser tests. |
| Anchors / separators | Pass: brand and navigation share the leading region, search owns the center region, history/actions align to the trailing edge. Toolbar owns its bottom separator; search field owns the popup input separator. Sidebar/page text anchors are unchanged. |
| Loading / failure / permission | No new data lifecycle. Existing permission-filtered command items remain the input. Settings mock mode displays an unrelated locale-request JSON error; this task did not validate or change that backend contract. |
| Long/localized labels | Unverified with a dedicated long-label or Chinese fixture. The trigger uses translated search copy; result labels/groups have wrapping constraints. |
| Live backend navigation | Unverified: captures use mock mode and browser tests use isolated fixtures, not an authenticated production backend. The existing retained Agent destination/query regression passes. |

## Regression fixes and verification

- Field-shadow styling initially hid Button's focus indicator. Explicit StyleX outline longhands restore it; the existing search test now proves a visible focus treatment rather than only DOM focus.
- The docs `.dark` selector does not match Console's theme contract. Theme overrides now use `data-theme='dark'`.
- Inherited Modal viewport bottom padding could clip the last result on short desktop windows. Console now owns a 16px bottom inset; the forty-extra-result browser fixture protects scroll reachability.
- Existing test files were extended rather than adding overlapping fixtures. These additions prevent actual focus and clipping failures that the former focus-return/one-result test did not observe.
- TypeScript project check: pass.
- Focused Oxlint check: pass, no warnings or errors.
- Focused Chromium tests: 6 passed; 22 unrelated Agent tests excluded by the name filter.
- React Doctor changed-scope scan: 100/100, no issues found. Its optional CI setup prompt was not accepted.
- Vitest reports a post-run process-exit timeout warning even though the focused checks exit successfully; this tooling issue was not changed.
- Antislop review is scoped to the requested chrome: existing brand typography/tokens, functional navigation, purposeful field/overlay elevation, and no invented features or decorative content.

## Delivery fixture correction

The existing Plugin Detail Shell browser fixture omitted `/api/console/v1/locale`.
On a Chinese-language browser, the real Host locale provider correctly fell back
to `zh-CN`, while the fixture's navigation assertions expected English. Temporary
diagnostics confirmed a visible 56px rail named `Console 区域`, not a missing rail.
The fixture now returns the public English locale snapshot; its existing
navigation and geometry assertions are unchanged. All six Plugin Detail browser
tests pass with that correction, and temporary diagnostics were removed.
