---
name: land
description: >-
  Land changes in Lenso Console using its reviewed immutable candidate workflow.
  Invoke only when the user explicitly requests landing or merging the relevant
  changes, not for review, preparation, successful checks, or skill installation.
metadata:
  delta-action: land
---

# Land Console changes

This is the optional agent entry point for the common contribution and delivery
contract in [`CONTRIBUTING.md`](../../../CONTRIBUTING.md). Read that guide first.

In Delta, **Land Changes** opens a dedicated delivery review and `/land` invokes
this skill in the current task when supported. `/land` is not a universal shell
command or permission grant. Other agents use their supported invocation; plain
Git maintainers use the documented commands. Use the Delta-managed checkout
directly—never create a nested Worktrunk worktree.

Landing requires explicit authorization, meaningful review, a final immutable
candidate push, successful `ci` `quality` evidence for that exact candidate ref,
and a normal same-SHA fast-forward to `main`. Keep publication, versioning,
tags, releases, and deployment separate; this skill never authorizes them.

## Execution adapter

Execute the candidate-first landing procedure in `CONTRIBUTING.md`; that
document owns the contribution requirements, validation and promotion steps.
The following instructions supply preparation and execution details missing
from that procedure, rather than replacing it.

### Intent, scope and destination

- An explicit landing request, including `/land`, supplies landing intent.
  Proceed without asking for the same authorization again. Skill installation,
  a review approval or a successful check alone does not supply that intent.
- Identify the requested diff, existing commits and uncommitted files. Preserve
  unrelated staged and unstaged changes. If scope is ambiguous, ask one focused
  question before changing Git state.
- Inspect the configured remotes and authenticated account. The expected
  upstream is `LioRael/lenso-console`, currently named `origin`; publish only
  after verifying its identity and maintainer write authority. The `local`
  backlink is not a publication destination.
- Query the current `main` branch protection and applicable rulesets before
  preparation and again before promotion. Satisfy all applicable checks,
  review and signature requirements without changing or bypassing protection.
  If current requirements contradict the documented direct fast-forward
  procedure, report the conflict rather than inventing a different route.

### Prepare the final revision

- Follow the contribution guide's fork/Issue handoff requirements only when
  applicable. If landing an external contribution, import its pinned revision,
  preserve contributor authorship and retain its Issue link. For a linked
  central ticket or PR, follow `docs/agents/issue-tracker.md`, including blocker
  verification and repo-qualified closure syntax; do not close it early.
- Integrate the requested change onto the freshly fetched upstream base using
  an isolated local topic branch. Use the contribution guide's fetch/base
  recording commands, and retain the full base SHA for the eventual promotion.
  Keep unrelated work out of this branch; stop if it cannot be safely preserved.
- Resolve conflicts automatically when the intended result is clear. Preserve
  unrelated changes and pause for a decision on ambiguous or unsafe conflicts.
  Any integration or conflict resolution invalidates earlier verification for
  the affected revision.
- Stage only named, reviewed paths and create any necessary commits with a
  descriptive message. Preserve the repository/user signing configuration and
  contributor identity; a signing failure is a blocker, not permission to
  disable signing. Use `GIT_EDITOR=true` for commits, merges or rebases and
  non-interactive arguments throughout.
- Obtain meaningful review of the final diff and address findings before the
  final candidate push. Review untrusted workflow and executable-script changes
  before using upstream credentials. The contribution guide owns that review
  requirement; record what was reviewed and any remaining limits.

### Verification prerequisites and evidence

- Use the exact Node version in `.node-version`, pnpm version in
  `package.json#packageManager`, and Rust version in `rust-toolchain.toml`.
  `tooling/checks/check-environment.mjs` enforces these versions. Inspect actual
  versions instead of assuming executable availability proves compatibility.
  If suitable tools are unavailable, report the concrete blocker; do not
  silently substitute a different version or modify global tool configuration.
- Run the contribution guide's focused validation for the changed areas and
  its shared local gate. The authoritative definitions are:
  - `pnpm install --frozen-lockfile`: `.github/workflows/ci.yml`, dependency
    installation step, with `pnpm-lock.yaml`.
  - `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:local`,
    `pnpm build:local`, and `pnpm service:boundary`: the identically named
    `package.json` scripts. Choose applicable focused checks.
  - `pnpm test:browser src/components/runtime/context-navigation.browser.test.tsx`:
    `package.json#scripts.test:browser` forwards to
    `plugins/console/shell/package.json#scripts.test:browser`, whose Vitest invocation
    accepts the file filter. Other browser changes need their relevant tests.
  - `pnpm check`: `package.json#scripts.check` invokes `tooling/checks/check.mjs`,
    which runs preflight, installs pinned Chromium, then runs `check:full`.
    `RUSTUP_TOOLCHAIN=nightly-2026-10-04 pnpm check` is the documented override for the
    checked-in toolchain; recheck `rust-toolchain.toml` before using it.
- Keep diagnostic evidence distinct from the required gate. An alternate
  browser executable may be used for focused diagnostics but is rejected by
  `tooling/checks/check.mjs`; preflight alone, synthetic distribution fixtures and
  macOS results do not replace the complete Linux candidate proof.
- Confirm checks exercised the final source revision and inspect the working
  tree afterward for generated or external changes. Review and commit any
  intended changes, then rerun affected checks before publishing. Unrelated
  changes stay excluded. Required failing, pending, missing or unverifiable
  checks block promotion.

### Complete the documented promotion

- Execute the contribution guide's unique candidate push, exact-candidate
  verification and normal same-SHA fast-forward procedure. Candidate naming
  must match the push triggers in `.github/workflows/ci.yml`; a fresh
  `delta/verify/lenso-console/` attempt is supported.
- Use GitHub's run and job metadata to verify the candidate's full SHA, branch,
  workflow file `.github/workflows/ci.yml`, `push` event, run attempt and
  completed successful `ci` run with a successful `quality` job. Check all
  additional destination-required checks/reviews/signatures against that same
  final revision and the current protection configuration. A similarly named
  job, a prior SHA or another branch's run is not qualifying evidence.
- If upstream `main` advances, integrate onto the new base and repeat final
  review and validation with a new immutable candidate. Do not force-push,
  overwrite concurrent work or reuse verification for a changed revision.
- Complete promotion, then read back upstream `main` and its protection as
  required by the contribution guide. Success means the destination points to
  the exact verified candidate, not merely that a commit, candidate branch or
  CI run exists.
- Retain the candidate ref and record the base, candidate SHA and exact CI
  evidence. Do not delete remote refs or discard unrelated local work as
  incidental cleanup.
- On a genuine blocker, state that the requested changes have not landed and
  identify the failed prerequisite or evidence needed to continue.
