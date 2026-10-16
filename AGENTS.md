<!-- intent-skills:start -->

## Skill Loading

Before editing files for a substantial task:

- Run `bunx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

# Console project rules

## Start here

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for focused validation, fork/Issue
  handoffs and candidate-first landing. The optional [Land skill](.agents/skills/land/SKILL.md)
  is an entry point, not a permission grant. Issues/PRDs live in `LioRael/lenso`.
- For plugins and pages, start with [Console plugin development](.agents/skills/console-plugin-development/SKILL.md).
  Check the consuming host and public exports before choosing a presentation API.
- Read [Console interaction direction](docs/design/console-interaction-direction.md)
  before changing controls, layouts or visual details. Keep domain docs local to
  their owner; [CONTEXT.md](CONTEXT.md) defines shared Console terminology.

## Ownership and request paths

- Console composes app-owned pages; plugins retain business facts and final
  authorization. Marketplace source/delivery belongs to `LioRael/lenso-marketplace`.
  Console Agent remains the installation authority and consumes public contracts.
- Initialize schemas/migrations at explicit startup, never in request handlers;
  do not initialize unrelated queues or services on a request path.
- Reuse a request's verified identity, keeping operation authorization, instance
  binding, revocation and commit/disclosure fences independent. Do not cache an
  authorization decision across principals, scopes or revisions.

## UI changes

- Reuse Lenso UI Form, Select and Disclosure components and existing themes.
  Corner actions belong to current page/table content; avoid unrelated refresh,
  theme and Home controls. Preserve user-edited Identity/Access pages.
- Use the built-in browser or isolated headless Playwright; do not launch the
  user's Chrome. Record real browser proof for changed interactive surfaces:
  visible geometry/occlusion, accessibility semantics and keyboard operation.

## Feedback and tests

- Choose the lowest-cost check that proves the changed contract; inspect scripts
  and their full command chain first. Keep full Linux candidate quality required.
  Reuse same-SHA evidence only with matching commands, tools and environment.
- Before adding a test, identify the concrete missed regression. Update existing
  coverage before adding another fixture; avoid simple prop forwarding, static
  copy, class names, private DOM shape and whole-HTML snapshots.
- Keep independent Auth/revocation, instance isolation, CAS/persistence, protocol
  and archive-consumer coverage. Browser tests must need a real browser; retain
  purposeful theme/geometry/keyboard checks without redundant state matrices.
- Measure actual I/O, serial round trips and latency when optimizing requests or
  CI. Report commands, timings and limits; distinguish local, merged, deployed
  and genuinely exercised behavior. Never invent remote validation results.

## Delivery

- Review workflow/executable changes before upstream credentials are available.
  Registry/OCI publication requires explicit release authorization and approved
  Trusted Publisher workflows; repository write access is not release authority.
  Do not restore the retired central release runtime.
