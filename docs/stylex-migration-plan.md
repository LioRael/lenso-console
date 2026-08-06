# StyleX Migration Plan

## Status

Accepted after the shared-understanding grilling confirmation. Implementation
and automatic local verification are complete; manual Approved Figma Frame
comparison and visual approval remain a separate review step. Publishing,
merging, and production changes require separate authorization.

## Outcome

Replace Tailwind and Console-owned component/utility styling with StyleX while
preserving current appearance and behavior strictly. Keep the Host-owned reset,
page-contract, and temporary private parity stylesheet explicit: they preserve
document-wide behavior and the approved pre-StyleX component geometry during
visual validation, while the public UI package exposes only precompiled StyleX
CSS. The parity stylesheet is not a Module Surface API and is retired only
after visual equivalence is approved. Deliver a generated, typed token contract
for Module Surface authors and a complete Theme Bundle system with installable themes and
executable Console UI compositions.

Visual changes are allowed only to correct an explicit difference against the
Approved Figma Frame under review. Visual approval is manual: an agent performs
the comparison and the user gives final approval. The repository stores no Figma
frame registry, baseline screenshots, or pixel-diff suite.

## Scope

The migration includes:

- the Console Shell, pages, runtime visualizations, and official Module Surfaces;
- `@lenso/console-ui` React primitives and named typed style slots;
- new `@lenso/console-tokens` and `@lenso/console-composition-api` packages;
- `console_ui_esm` style assets and a new `console_theme_bundle` artifact;
- official dark and light Theme Variants;
- third-party Theme Packages and arbitrary React/JavaScript Console Compositions;
- Console administrator installation and browser-local Bundle selection;
- one functional browser-test project without screenshot assertions.

External dependency CSS and third-party Module CSS remain permitted. Their use of
shared tokens, Surface Root scoping, and avoidance of global selectors is advice,
not an admission rule.

## Styling architecture

### Compilation

- Use `@stylexjs/unplugin/vite` and pin its version.
- Allow StyleX-generated CSS assets; remove Tailwind dependencies,
  configuration, directives, utilities, and the former public CSS entry points.
  Keep `src/styles.css`, the token variable layer, and the restored
  Host-private component parity layer as Host-only global implementation
  contracts; they are not part of the public Module Surface styling API.
- Remove static inline styles. Express runtime styles through StyleX dynamic
  styles; retain SVG geometry as SVG attributes and keep only documented runtime
  exceptions.

### Tokens

- Store the authority as DTCG-compatible JSON in `@lenso/console-tokens`.
- Generate typed StyleX variables, stable CSS custom-property references,
  TypeScript metadata, Figma Variables import data, and an agent-facing catalog.
- Theme Bundles may override the published `--lenso-token-*` variables through
  the typed `tokenCssVariables` map; this keeps StyleX authoring static while
  allowing arbitrary future Theme Variants to provide their own values.
- Expose reference, semantic, component, spacing, breakpoint, control-size, and
  content-density tokens to Module authors.
- Keep Shell layout tokens private to Module Surfaces but available as Themeable
  Host Tokens to validated Theme Packages.
- Treat shared-token usage as mandatory in Console-owned code and advisory in
  third-party Module Surfaces.

### Public components

- Publish precompiled JavaScript, CSS assets, types, and React primitives from
  `@lenso/console-ui`; consumers do not need the Console compiler version.
- Keep generated class names and DOM structure private.
- Replace unrestricted `className` passthrough with named typed slots such as
  root, label, and icon where extension is needed.
- Generate component catalogs from typed component metadata; maintain only
  guidance, counterexamples, and sample Surfaces by hand.

## Artifact contracts

### Module Surface styles

Extend receipts with ordered style assets. Verify paths, archive/file integrity,
and load completion before mounting the ESM Surface. Do not inspect or reject CSS
selectors. The Host does not scan or compile third-party source.

### Theme Bundles

Add a distinct `console_theme_bundle` manifest and receipt containing:

- publisher-namespaced bundle ID, display name, semver, and `consoleUi` range;
- one or more Theme Variants and a default variant;
- DTCG token overrides and packaged fonts, icons, and images;
- optional Console UI Composition ESM and ordered CSS assets;
- archive and asset integrity metadata.

Theme resources are packaged and digest-verified; remote resource URLs are not
allowed. The declarative Theme Package must provide complete semantic tokens and
pass schema, reference, format, and contrast validation. Its Console UI
Composition may contain arbitrary trusted same-realm React/JavaScript.

Use `@lenso/console-composition-api` and `defineConsoleUiComposition()` for
versioned Host slots, navigation data, theme context, and primitives. Do not
reuse `ConsoleServiceComposition`, which models mandatory backend Modules.
Composition authors are advised, but not forced, to keep every Console capability
reachable.

## Theme lifecycle

- Console administrators install, atomically update, and remove Theme Bundles by
  reusing content-addressed artifact materialization. These inventory changes
  produce administration audit evidence.
- The official default Bundle is embedded; official bundles use the same public
  contract as third-party bundles.
- Browser local storage holds bundle ID plus Theme Variant/system preference. It
  is intentionally neither Operator-ID isolated nor audit recorded.
- Updating an installed bundle ID changes its digest for the next full load.
- Removing the selected ID clears the browser preference and restores default.
- After authentication, bootstrap resolves the preference, validates the receipt,
  loads CSS, imports Composition ESM, and only then mounts the Shell.
- Switching bundles saves the preference and fully reloads the Console.
- Load, compatibility, or render failure falls back atomically to the embedded
  default and presents a recovery diagnostic.
- Stable stylesheet insertion order is Host reset, Module Surface assets, then
  Theme Bundle assets. Normal cascade specificity, inheritance, and `!important`
  still apply.

## Migration sequence

1. Add the DTCG schema, generators, `@lenso/console-tokens`, and freshness tests.
2. Add StyleX compilation and migrate `@lenso/console-ui` primitives.
3. Migrate Shell and global document presentation without visual or behavioral
   changes.
4. Migrate product pages and runtime visualizations in bounded vertical slices.
5. Migrate all official Module Surfaces and their artifact builds.
6. Add ordered Module style assets to manifest, receipt, materialization, and
   the frontend loader.
7. Add Theme Bundle contract, inventory management, audit evidence, bootstrap,
   Theme Variants, `@lenso/console-composition-api`, Settings UI, and fallback.
8. Remove Tailwind, old public CSS exports, unused compatibility code, and the
   visual-matrix generator/tests. Keep only the documented Host reset/page
   contract layer, its token aliases, and the non-public parity layer until
   Approved Figma visual equivalence is accepted; Module Surface CSS remains
   external to the Host build.
9. Run all automatic gates, then perform agent Figma comparison and user visual
   approval.

Development commits may contain temporary dual-stack slices, but the complete
migration lands through one PR. No dual-stack version is published.

## Verification

Use existing package builds and Vitest rather than adding feature-specific
scripts. Token generation, manifest/receipt validation, loaders, compatibility,
fallback, preferences, and component contracts live with their owning packages.

Add one Vitest Browser Mode project using Chromium and one consolidated suite for:

- authenticated startup and pre-Shell Bundle loading;
- official dark/light and system resolution;
- Bundle selection followed by full reload;
- ordered CSS load before Composition mount;
- invalid, missing, incompatible, and crashing Bundle fallback;
- core routes, interactions, official Module Surfaces, and runtime-error absence.

Do not add screenshots, pixel comparisons, StyleX-specific smoke scripts, or
Theme-specific shell scripts. Remove the unused visual matrix. Preserve the two
existing high-cost container and recovery smoke tests for later script cleanup.

The automated completion gate is:

- no Tailwind dependency, directive, configuration, or utility usage remains;
- Host-only global CSS is limited to the documented reset/page contract and
  temporary private parity layers;
- generated outputs are deterministic and fresh;
- package build, type checking, unit/contract tests, browser suite, artifact
  checks, and existing service gates pass;
- artifact paths, digests, ordering, compatibility, and failure recovery are
  covered;
- advisory third-party CSS/token diagnostics do not block artifacts;
- agent comparison reports strict visual and behavioral equivalence;
- the user approves the final visual result.

## Delivery boundary

Implementation and local verification are authorized only after shared-understanding
confirmation. Do not merge, publish npm/OCI artifacts, create a release, or make
production changes without a later explicit instruction. Keep the PR draft until
the user completes visual approval.
