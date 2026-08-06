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

Before planning or changing a release, read the repository-local
[`docs/release-process.md`](docs/release-process.md). Registry publication and
OCI writes still require the repository's approved Trusted Publisher workflows;
do not infer production authority from repository write access or restore the
retired central release runtime.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in the central `LioRael/lenso` GitHub repository. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five canonical labels in the central tracker. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.
