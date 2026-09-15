<!-- intent-skills:start -->

## Skill Loading

Before editing files for a substantial task:

- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

# Agent instructions

Before planning or changing a release, read the repository-local [`docs/release-process.md`](docs/release-process.md). Registry publication and OCI writes still require the repository's approved Trusted Publisher workflows; do not infer production authority from repository write access or restore the retired central release runtime.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in the central `LioRael/lenso` GitHub repository. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five canonical labels in the central tracker. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

## Testing discipline

- Before adding a test, name the concrete failure it prevents and explain why existing coverage does not catch it.
- Prefer observable behavior, public contracts, and real regressions. Do not add tests for simple prop forwarding, configuration constants, static copy, or purely decorative changes by default.
- Do not couple tests to class names, private DOM structure, complete HTML strings, or a CSS implementation technique unless that detail is an explicit public contract or protects a documented browser, security, or protocol regression.
- Verify a behavior at the lowest-cost layer that proves it. Browser tests must exercise a real browser dependency and should not duplicate an equivalent unit test.
- For visual behavior, focus on theme propagation, visibility, occlusion, overflow, and interaction geometry. Exact visual baselines need a stated acceptance purpose; avoid copying token values across many tests.
- Keep one focused proof for each applicable contract category: visual state and geometry, accessibility semantics, and keyboard behavior. These checks are required for changed interactive surfaces, but overlapping fixtures and broad state matrices should be merged or reduced.
- When behavior changes, update or merge existing coverage instead of mechanically adding another test file.

## UI design and review

Before creating a page, changing controls/layout, or fixing visual details, read [the Lenso UI implementation standard](docs/design/README.md). Follow its component discovery, alignment, and rendered-state acceptance steps. This also applies to plugin pages inside Console; use one shared component owner and record visual verification before claiming completion.

## Marketplace delivery

For changes under `plugins/marketplace/`, require the `catalog`, `event-host`,
and `quality` checks when they apply. A passing Workers check does not replace
the native catalog/browser acceptance check. Inspect every failed check before
merging; do not narrow the required-check list to bypass a failure.
