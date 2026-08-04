# System / Dark alignment QA

## Source and implementation

- Source visual truth: Figma `Lenso Console — Product UI Upgrade`, node `34:2` (`System / Dark`).
- Source screenshot: `/tmp/lenso-console-design-audit-2026-08-04/01-figma-system-dark.png`.
- Implementation screenshot: `/tmp/lenso-console-design-audit-2026-08-04/05-code-system-aligned.png`.
- Combined comparison: `/tmp/lenso-console-design-audit-2026-08-04/06-side-by-side.png`.
- Viewport: `1440 × 900` CSS px.
- Source pixels: `1440 × 900`; implementation pixels: `1440 × 900`.
- Density normalization: none; both captures use 1 CSS px per screenshot pixel.
- State: System route, dark theme, default filters, default selected row, demo data projection.

## Full-view comparison

The shell, sidebar, toolbar, page header, filter band, split workspace, table geometry, and inspector now occupy the same major regions as the Figma frame. The current implementation remains data-backed, so its demo projection has four rows and different entity names from the Figma's six-row static sample. That content variance is intentional and was not replaced with design-only strings.

## Focused comparison evidence

- Page content: `x=224, y=48, w=1216, h=852`.
- System body: `x=224, y=144, h=756`; filters: `x=264, y=144, w=1136, h=48`.
- Filter controls: `x=264/356/458`, widths `84/94/139`, top `y=154`.
- Split workspace: `x=264, y=192, w=1136, h=676`; main pane `760px`; inspector `376px`.
- Table header: `x=264, y=242, w=732, h=38`; data rows are `64px` high.
- Typography and tokens: title `24/32/600`; description `13/20` in `--fg-secondary`; meta `11/16` in `--fg-tertiary`; filters `11/16/500` in `--fg-secondary`; command shortcut `10/14`.
- No image assets are present in this frame; icon components remain library-backed.

## Comparison history

### Initial comparison

- The System split workspace ended around `y=694` instead of the Figma target `y=868`.
- The description used tertiary text, the page meta used `16/24` primary text, and filters used the stronger border and default text weight.
- The active toolbar breadcrumb was brighter than the Figma breadcrumb and the command shortcut was one type scale too large.

### Fixes

- Added System-only body/workspace sizing and bottom spacing to reach the Figma `676px` workspace.
- Bound System description, meta, filter colors, weights, borders, and widths to the measured Figma values.
- Matched toolbar breadcrumb and shortcut typography.
- Added the System table's trailing divider.

### Post-fix evidence

- The revised screenshot and side-by-side comparison show no actionable P0/P1/P2 visual findings.
- `Kind=Service` was selected through the native filter: the table reduced to two service rows and the Inspector changed to `support`; restoring `All kinds` returned four rows and `support-ticket`.
- Browser console check returned no `error` or `warn` entries.
- `pnpm typecheck:local` passed.
- `git diff --check` passed.

## Residual / accepted variance

- The Figma sample content (`Auth`, `Billing sync`, and related rows) differs from the runtime/demo fixture (`support-ticket`, `invoice`, and related rows). Replacing the fixture would change product data semantics, so it is left as an intentional data-backed variance.

final result: passed
