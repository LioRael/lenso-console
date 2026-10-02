# Generic Plugin Detail

## Scope and reference

- Repository: `LioRael/lenso-console`; base `7e2ed879c67c4267c595d7e06a0de3c465a37228`; isolated branch `feat/pencil-console-pages`.
- Route: `/plugins/$agentId/$packageId/$instanceKey`. The existing route parameter `agentId` remains the App management target; it does not force an Agent identity. Console Shell and global navigation are unchanged.
- Reference: the user identified Pencil node `TcZvX` as a generic Plugin Detail; Auth is an example. The parent supplied its hierarchy: identity/revision/description, status, Overview/Configuration/Dependencies, capability and runtime cards, resource access and change impact. This is a bounded contract-backed implementation of that hierarchy, not an Auth-specific page.
- Exact Pencil pixels remain unverified: direct Pencil MCP `get_app_state` failed connection or timed out; Library image metadata was readable but materialization failed. No raw `.pen` data was read, and no exact visual fidelity claim is made.
- Approved product compositions inspected: current Console Shell, Plugin inspector/configuration source, Lenso design standards, and the existing two-level Shell review. Relay's supplied Native account-denied screenshot was opened for the separate sidebar triage, not used as a Plugin Detail acceptance baseline.

## Ownership and real data

| UI role | Reused owner |
| --- | --- |
| Shell/orientation | Existing Console Shell and route |
| Tabs/actions/status | Installed Lenso Tabs/Button/Chip through existing PluginStatus |
| Distinct overview cards | Installed Lenso Surface; local product layout |
| Configuration | Existing fields/TOML editor, proposal/publication, draft store and navigation guard |
| Identity, capabilities and requirements | Existing `readPluginInventory`, `readPluginManagement` and typed workbench projection |

The active selection is preferred for runtime/capability facts; preparing or desired selection is used only when there is no active selection, with an explicit phase label. Missing selection is distinguished from an empty capability declaration. Description comes from existing metadata/category presentation; absent description is not replaced with guessed Auth copy.

The current inventory reports declared capability IDs and execution metadata. It does not report provider bindings, dependent Plugins, physical resource mappings, access purposes, contribution details or Plugin health. These are explicitly unavailable; health is Unknown. No sample D1/KV resources, invented degraded health, synthetic production version or guessed provider edge is rendered. Existing activation status is separate from health.

Configuration remains the existing permission/authority/revision-aware preview-and-publication flow. Edit/View configuration and View dependencies navigate between real panels; no new write endpoint, Validate or Preview disable operation is invented. Agent-imported configuration drafts open Configuration. A denied initial read now shows the existing unavailable/retry state instead of being masked indefinitely by the disabled dependent query's pending state. The independent-review follow-up also handles later revocation: 401/403 immediately hides data, cancels and removes both App-scoped cache halves and history, resets ETag and clears this detail route's drafts. Explicit recovery keeps content hidden until both fresh reads succeed. Header revision uses the same labelled selection phase as the capability cards; a different Desired revision is shown separately.

## Geometry and rendered review

- Page heading, identity, status and tabs share the content anchor. Each distinct card owns its own inset and border. There is one separator under the tab group.
- Header groups wrap intrinsically; cards use auto-fit. Long package/revision and capability IDs wrap. Existing editor actions wrap. An inapplicable Restore Host value control is now omitted with conditional rendering; its intended CSS hiding had left a visible, irrelevant disabled action in the captured configuration state. Shell chrome and shared component styles are not copied or overridden.
- Desktop 1440×900 and narrow 390×844, light/dark, hover and keyboard focus: focused fixture review. Button geometry stays stable, header actions move below the identity on narrow widths, and focus rings remain visible. Arrow navigation plus Enter activates the existing manual-activation tabs. Panel navigation buttons return focus to the destination tab.
- Initial HTTP denial, unavailable selection, no required capabilities, revision-mismatched read-only authoring, no selection authority, App/plugin navigation and draft retention across tabs have focused proofs. These are isolated HTTP/contract fixtures through the real API client/decoder, not Native Host validation.
- The two representative identities are descriptor-derived `lenso.auth.web-session` and `lenso.console.workspace.observe`. Fixture revisions are labelled as fixtures. A separate long-capability fixture protects overflow and does not claim that invented role exists in production.
- Screenshot directory (ignored local evidence): `apps/shell/src/features/plugins/__screenshots__/`. Overview files: `plugin-detail-auth-overview.png`, `plugin-detail-observe-overview.png`, `plugin-detail-{light,dark}-{1440,390}.png`. Configuration files: `plugin-detail-configuration-{light,dark}-{1440,390}.png`. These capture the route fixture without the full Shell. Scroll-contained narrow screenshots do not show all below-fold content at once.
- New overlays/menus: not applicable. Existing draft navigation protection is preserved; no new overlay composition is added.

## Validation and delivery boundary

- Original API browser proof: `VITE_CONSOLE_MODE=api VITE_API_BASE_URL=/ VITE_CONSOLE_DX_SCREENSHOTS=1 pnpm --dir apps/shell exec vitest run --config vitest.browser.config.ts src/features/plugins/plugin-detail.browser.test.tsx`: 3 passed on source frozen in `61284e9`. The earlier label “18:55 UTC” was incorrect and is withdrawn. Its full test log was not retained, so no exact ending time is asserted. Original screenshot mtimes include `2026-10-02T10:55:40.632168Z` and `10:55:40.798671Z`; these are file timestamps, not a test completion receipt. The process timezone has now been measured as `Asia/Shanghai`, UTC+08:00.
- Existing scope/locale browser proof: `pnpm --dir apps/shell exec vitest run --config vitest.browser.config.ts src/features/plugins/plugin-scope.browser.test.tsx`: 1 passed.
- `plugin-agent-workbench-request.test.ts` and `console-i18n.test.ts`: 7 passed.
- `pnpm typecheck:local`, changed-file `oxlint --deny-warnings`, `oxfmt --check`, and `git diff --check`: passed.
- `pnpm bundle:local`: passed including client/server build and one prerendered page. The first sandboxed attempt compiled but could not bind localhost; retry with approved localhost access completed. Build log: `/tmp/plugin-detail-bundle.log`.
- Browser commands exit 0 on passing runs but emit the existing 10-second server shutdown warning. This was not silently treated as a clean shutdown.
- Environment: Node 26.10.0, pnpm 11.5.0, Vitest 4.1.10, Playwright 1.62.1 Chromium.
- No Native Host/real Plugin management target, remote candidate CI, Delta review, landing, push, publication, deployment, payment or key creation occurred. Source/contract binding is implemented; those delivery and integration checks are separate, unverified facts. A changed base/candidate must be validated again before exact-SHA landing.

New coverage prevents concrete failures absent from the old single demo journey: capabilities from one Plugin/phase shown under another, missing selection presented as an empty declaration, denied reads stuck loading, lost drafts when Configuration unmounts, and header/editor/action geometry or focus failure at real narrow widths. The existing scope journey was updated instead of duplicated.

Original source SHA-256 at the `61284e9` validation (retained as historical evidence; see the follow-up for current fingerprints):

| File | SHA-256 |
| --- | --- |
| Detail page | `ba359df7e592c7dafa8ad82bb49c0bc695f8689219c758a9bfe17b34116251b8` |
| Inspector | `d8961289140eb0e0a1bc1732c31fe1c7d24de2386b1dec4a1afbfff094854eb3` |
| Overview/dependencies | `591cf3965cc28f4342844aa4787327ca351ea49cc37efe536f2e106ae72d03e7` |
| API browser proof | `db5ead88f5267e33fd864c924daeaa911ea9eca8f765ee5c7e4931ceddc554b8` |
| Scope browser proof | `39744847356a07017bed0f87ece12ae817675a63a193a0e10e2d1085657ab77b` |
| Chinese messages | `46807465388223f9bd5a047c114a13bad5dc9342c03e6c7016cae73ec4aba5bc` |

The independent-review fixes and current validation are recorded in [remaining acceptance](2026-10-02-console-slice-remaining-acceptance.md). The latest API browser log has 5 passing tests and explicitly records the measured local start time; original passing receipts are not reused as validation of changed source.
