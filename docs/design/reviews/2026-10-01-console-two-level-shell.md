# Console two-level shell review

## Scope and reference

- Approved direction: the user's request to use the Pencil Console design. Read through Pencil MCP from `/Users/leosouthey/.pencil/documents/2aa91fe4-6bd2-4452-ad8a-6868944dbe28/pencil-new.pen`: Plugins frame `b2Upg` and Settings frame `m1N5iF`, including their toolbar, rail, context sidebar, and content subtrees. AI Relay content was excluded.
- Changed shared chrome: ConsoleFrame, ConsoleHeader, ConsoleNavigationRail, ConsoleWorkspaceHeader, ContextNavigation compositions, and navigation state/model. Settings, Management, Plugins, Profiles, profile editor, and Connections reuse ConsolePageHeader.
- Design Read: calm technical workbench; continuous neutral background, narrow primary rail, rounded context surface, compact neutral selection, Inter typography, and open content space. ENERGY 1 / RHYTHM 1 / MOTION 1. No decorative animation was added.
- Lenso UI 0.8.0 owns Button, Menu, Tooltip, modal/search controls and semantic tokens. Console owns product composition. Existing local Sidebar recipes were inspected and reused; they do not provide the rail/context split or common toolbar. Feature/Plugin owners retain data, permission decisions, and navigation context.
- Intentional differences: use actual Console destinations, App/Agent names, and permissions. The context mark uses PanelsTopLeft rather than inventing an App brand. Pencil-only tabs and sample business facts are not live features. Dark mode comes from Lenso tokens. On narrow screens the workspace-header search shortcut yields space to the close control; global toolbar search and Ctrl/Cmd K remain available.
- Rendered route evidence uses the existing mock development mode, not a live backend. Browser component fixtures provide an Agent to exercise Agent links and drawer behavior. No production-backend qualification is claimed.

## Geometry

- At 1440 × 900, the actual toolbar is 48px high, primary rail 56px wide, and context sidebar 248px wide. The main region starts at x=304. Sidebar header is 80px high; its icon is 36px and surface radius is derived from the shared token (24px with the installed theme).
- Settings content heading/description, section labels, and row text share x=346, a 42px inset from main. Content starts 30px below the toolbar. Cards start 16px before their text. Trailing controls stay in the shared SettingsRow owner.
- Context navigation has 12px outer inset and 12px row inset. Shared content composition is used for Settings, System, and default Workspace navigation. Hover/selection backgrounds enclose text rather than touching its edge.
- The context surface owns its outside boundary; there is no duplicate vertical separator against the main region. Setting-row groups own their internal separators. Button/Menu primitives own hover and focus bounds. No hover layout shift was observed.

## Rendered checks

Evidence is in `.artifacts/console-shell/`; the verification runner is `verify.mjs`. Screenshots are local task artifacts and ignored by Git.

- Pass: desktop `/settings` and `/plugins`, 1440 × 900. `settings-light-focus.png`, `settings-light-hover.png`, `plugins-light.png`, `settings-collapsed.png`, and `settings-dark.png`.
- Pass: narrow 390 × 844, `/settings`, light Chinese and dark English. `settings-mobile-zh.png`, `settings-mobile-dark.png`, `navigation-mobile-dark.png`. Document scroll width is exactly 390px. Labels/help wrap; controls stay inside their row. Long identity labels truncate with their complete value retained in title and menu labels.
- Pass: real rail anchors, history Back/Forward, desktop collapse/restore, appearance menu, global search focus, nested workspace-menu Escape, drawer Escape and focus return. `search-dark.png` records the shared command overlay.
- Pass: browser fixture retains the active Agent link's conversation and project query, exposes it as a link, keeps the page inert while the drawer is open, and restores desktop interaction after resizing. The common frame fixture proves both sidebar widths, toolbar height, and collapse geometry.
- Loading, empty, filtered-empty, failure, and permission content remain feature-owned. Existing feature browser tests cover their relevant behavior; the visual runner does not represent those states as live backend proof.
- Browser plugin not available; rendered checks used repository Playwright and Chromium instead.

## Verification and limits

- Pass: `pnpm build` (TypeScript, client/server build, prerender), `pnpm lint`, `git diff --check`, 39 unit files / 275 tests, and 27 Chromium files / 95 tests. Final build, lint and browser processes exited 0. The browser assertion extends the existing shell test rather than adding a second fixture: it prevents the rail refactor from resetting the active conversation/project or exposing navigation as a button, which the earlier drawer-resize assertion did not cover.
- Corrected during review: Button's default accessible role on anchors; mobile workspace title compressed by three trailing actions; inconsistent System/Workspace sidebar padding; prior search/toolbar collision at narrow widths.
- Mock dev mode requests `/api/console/v1/agents`, which returns 500 with `Only HTML requests are supported here` when no Host is connected. Two such requests occurred in the multi-route/reload visual run. They are recorded separately; there were no unexpected JavaScript/render errors. Agent availability and live service operation require the proper Host and are not proved by these mock screenshots.
- Vitest reported a process-close timeout after all 95 browser tests passed; the process exited 0. React Doctor changed-scope review exited 0 with 25 advisory warnings (24 maintainability and one state warning), and no errors. Its route-change state warning is intentional: navigating away dismisses the mobile drawer. It covers all current changes against HEAD, including the preceding framework/UI upgrade, rather than just this shell refactor.
- Source is the current uncommitted Console worktree with Lenso UI/tokens 0.8.0. Registry publication and remote CI are outside this local UI task.

## Bottom inset correction

The user identified the rounded context surface touching the window bottom at 1192 × 794. The Pencil context-sidebar instance uses fill-container height, so this correction is an intentional adaptation: Console's shared sidebar root now reserves 16px below the surface, matching the primary rail's existing bottom inset. It applies to every feature sidebar and the narrow drawer without changing the main scroll region or navigation widths.

Playwright measured a 16px surface-to-viewport inset at 1192 × 794 in light/dark and 390 × 844 with the drawer open. Evidence: `sidebar-bottom-light.png`, `sidebar-bottom-dark.png`, `sidebar-bottom-mobile.png`. The existing common-frame geometry test now asserts this inset; the earlier width/collapse checks could not detect a surface touching the bottom. No new control behavior was added.

## Breadcrumb removal and icon-only pill consistency

The user requested removal of the Plugin detail breadcrumb and a consistent pill surface for all icon-only buttons. The detail shell now has a single content region, without the breadcrumb toolbar or reserved grid row. Existing unavailable/not-found recovery links remain. Console history and navigation continue to supply orientation.

The installed Lenso Button `isIconOnly` style already supplies the pill radius. Removed rectangular corner overrides from the primary rail, message actions, and main/quick composer submission. Context-reference removal, attachment-notice dismissal, and retained-chat close actions now use Lenso Button with `isIconOnly` rather than raw buttons. Global search uses the same primitive with `isIconOnly` below its existing 1050px compact breakpoint; expanded search keeps its field-like surface. No wrapper or global CSS override was added. Existing pill-shaped controls retain their primitive behavior.

Pass: TypeScript, lint, 27 Chromium files / 95 tests after the detail/composer changes, and the focused shell/search browser file (5 tests) after compact-search migration. Existing browser coverage exercises reference removal, composer behavior, retained-chat close, and search focus return; no decorative-only test was added.

Rendered `/plugins/development/lenso.agent.loop/agent` at 1192 × 794 in light/dark and at 390 × 844 in dark. The breadcrumb is absent; narrow layout has no horizontal overflow; toolbar icon-only actions including global search have a radius at least half their shortest dimension. Verified focus and hover on the primary Plugins link and opening/dismissing narrow search. Evidence: `plugin-detail-no-breadcrumb-focus.png`, `plugin-detail-no-breadcrumb-hover.png`, `plugin-detail-no-breadcrumb-dark.png`, `plugin-detail-no-breadcrumb-mobile.png`. Data remains the local mock fixture.

## Context item Button variants

Following the user's sidebar-item comment, removed the context row's local corner/background/shadow overrides. Sidebar.Item already renders Lenso Button, so ContextNavigationItem now selects its `ghost` / `secondary` variants directly rather than nesting an additional Button through render. Default/selected hover surfaces and the 24px pill radius come from the installed design system. Layout stays 36px high with the existing text anchors. All shared Settings, System, Agent and default Workspace items receive this change.

Pass: typecheck, lint and the existing context-navigation browser file (5 tests, including hover feedback, search keyboard behavior, drawer and frame geometry). `sidebar-button-variants.png` records `/settings` at 1192 × 794 in the local mock preview. Measured selected Preferences as a single BUTTON with 24px radius.

Dark hover/focus and the 390 × 844 drawer were also checked: `sidebar-button-dark-hover.png`, `sidebar-button-dark-focus.png`, `sidebar-button-mobile.png`. The focus ring remains visible and selected/hover surfaces retain their geometry.

## Pencil header correction

Re-read the Window toolbar component `XyXbS` and its Plugins/Settings instances, plus project-header `JMN2N`. The initial implementation had reduced the design to navigation buttons and an independently centered generic search field. It omitted the leading mark, center identity/page icon, three-region geometry, and context address; the navigation buttons were 32px instead of 40px.

The shared ConsoleHeader now owns equal 360px desktop side regions, a centered 336px address group, a 272 × 32 context-search trigger, and 40px navigation Buttons. Real App and page labels supply its text. Compact mode below 1050px shows the pill search action without the address ornaments; below 720px it also hides the leading mark. Search retains its command overlay and keyboard shortcut. Sidebar identity actions now form a single group with the design's short vertical divider, and the workspace mark uses the reference's 12px corner radius.

Intentional differences: keep the user's requested pill action buttons instead of Pencil's original 12px rectangular controls; use the existing PanelsTopLeft Console mark with semantic tokens rather than invent a gradient brand. Pencil's Board/Comments tabs have no corresponding Console feature and are omitted. Actual Assistant actions occupy the right region when available.

The existing shell browser fixture now measures the address field width and its center within the address group, plus the navigation action height. This prevents the earlier independent-centering/size reduction from returning; the previous frame-level width test covered only the outer toolbar and sidebars. Full Chromium suite: 27 files / 95 tests pass. Source typecheck and lint pass. Preview evidence starts with `header-pencil-restored.png`, `/plugins`, 1192 × 794, mock data.

The new geometry assertion caught a second discrepancy: Lenso's `md` size is 36px, so the toolbar composition explicitly supplies the approved 40px navigation hit area through public xstyle. The updated five-test shell file passes. Production client/server build and prerender pass. The sidebar toggle's icon and expanded state now share the actual desktop/drawer state, including a closed mobile drawer.

Final rendered checks pass: at 1192 × 794 the address trigger is 272px wide and its center is 32px to the right of the window center, accounting for the identity elements in the 336px group. Navigation actions are 40px wide. Checked light focus, dark hover, and 390 × 844 compact search open/Escape without horizontal overflow; the closed mobile drawer reports expanded=false. Evidence: `header-pencil-light.png`, `header-pencil-dark.png`, `header-pencil-mobile.png`. Final lint and the shell browser process exited 0.

## Candidate hover-test isolation

The first Linux candidate run passed 94/95 browser checks; the unselected-item hover test captured an already-hovered baseline because the pointer remained over the newly mounted fixture after the prior test. Explicitly unhovering the item and waiting for its existing animations to settle now establishes the resting baseline. The hover action and original background-change assertion are unchanged. The focused five-test file and lint pass locally; independent review found no assertion weakening. The failed candidate was not promoted.
