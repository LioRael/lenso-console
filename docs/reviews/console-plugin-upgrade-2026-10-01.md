# Console framework, HeroUI and Plugin workspace upgrade

## Scope and versions

Base: `ed1cfec08808dd38e068148224256b663d31fd44`.
UI and tokens: npm `0.8.0`, verified against registry metadata on 2026-10-01.
Framework: immutable remote main `119b9af70b82816588c00c8bf812f7c62d1a18b5`.
The facade still reports `lenso 0.5.28`; a facade version alone does not identify
this source upgrade. Business owner revisions remain pinned to their own sources.

The attached implementation document was a reference. The user's scope excludes
AI Relay design and requests direct Codex implementation. No Relay design or
business provider was adopted. Existing Console runtime helpers remain covered
by the unified workspace checks.

## Development and Plugin boundary

One root Cargo manifest/lock replaces seven repeated workspaces; focused checks
select packages, and full checks use the root. The Console SDK joins the pnpm
workspace. Standalone precompiled Engine support keeps its separate packaging
boundary. Existing reference App, Agent, Management and MCP contracts remain.

`pnpm plugin:dev` builds real Shell assets and embeds `ConsolePlugin` in a native
Host beside an unrelated `/health` endpoint. `pnpm plugin:without-console`
removes the optional dependency using `--no-default-features`. Both compositions
have a real HTTP test proving health, Shell presence/absence and shutdown.

The pinned `NativeWebHost` infers a required slot for a unique linked Plugin.
Omitting selection while retaining Console in the binary fails Plan validation.
This example proves build-time removal. Runtime disabling with that convenience
Host is not claimed; an App needing it must own an explicit optional Host Catalog.
The old precompiled kit uses a separate Engine producer toolchain, which was not
installed or exercised here. No registry, OCI publication or production adoption
is claimed by this local source consumer.

## UI ownership and rendered review

Reference: existing Console settings/navigation, `docs/design/README.md` and
published UI 0.8.0 HeroUI reconstruction. Buttons, fields, dialogs, search,
selects, switches, tabs, breadcrumbs and status chips use the public package API.
The shared Console navigation and settings-row recipes own product layout only.
Theme primitives come from the package tokens. Typography and sidebar layout
remain Console-owned. The subsequent approved shell uses Inter, a 56px rail and
a 248px context sidebar; see
`../design/reviews/2026-10-01-console-two-level-shell.md` for the final geometry.
No new branding or decorative layout was introduced.

Settings row text and controls retain their shared column anchors and a single
separator owner. Hover and focus retain control bounds. Package reset layers
required product StyleX overrides to be extracted without layers. Switch thumb
anatomy, select popover slots and narrow Agent tab width were updated. Vite client
prebundling handles the UI's transitive CommonJS external-store shim; the shim is
an explicit development dependency so pnpm can resolve that entry reliably.

Real development route `/settings` was inspected at 1280×800 and 390×844 in
light and dark. Narrow document width equals viewport width (390px). Search
opens with its combobox focused; Escape returns focus. Screenshots are local
ignored artifacts in `.artifacts/console-ui-0.8.0/`. Data is the existing mock
Console mode, not a live authenticated business backend.

Visual acceptance uses stable geometry, semantics and keyboard interaction,
including existing localized labels, dialogs, menu positioning and permission
fixtures. No new screenshot baseline or private CSS assertion was added.
Production build and preflight pass. Detailed check results follow below.

## Check results

- Frozen pnpm installation, preflight (lint, Cargo formatting, boundary,
  contract TypeScript, human-token projection and independent SDK): pass.
- Production frontend typecheck/build/prerender: pass.
- Frontend unit tests: 275 passed across 39 files.
- Chromium interaction/geometry tests: 95 passed across 27 files.
  Vitest reports a post-success process-close timeout; its command exits zero.
- Root all-target/all-feature Clippy with warnings denied: pass.
- Root all-feature Rust tests: 92 passed, 4 existing ignored.
- Independent native consumer: one test passed with Console and one passed
  with `--no-default-features`.
- Five contract archives: packaged and verified locally; not published.
- Management WASM Clippy and real workerd suite: pass, 4 tests.
- Agent distribution suite: 11 passed, 1 existing skipped.
- Console convention/compiler suite: 3 passed.

Validation artifacts are local to this checkout. Workflow changes update the
root lock/target paths and exact codegen revision; no workflow run, candidate
landing, registry publication, OCI write or release version bump was performed.

Final search-field width correction passed the five focused navigation/browser
checks and another preflight/production build. Manual search review confirmed
8 destinations, a 391px input inside the 436px field, a visible search icon,
keyboard focus and Escape focus return.

React Doctor's automatic base detection fell back to a full scan in this detached
checkout. The explicit `--scope changed --base HEAD --include-untracked` scan
reported no error diagnostics, with 23 maintainability warnings (21 component
complexity reports and 2 compound-component export reports). These are recorded,
not represented as a clean whole-repository health audit; numerical score was
unavailable for the local no-score comparison.
