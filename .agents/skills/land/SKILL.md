---
name: land
description: >-
  Land TypeScript Lenso Console changes using its reviewed immutable candidate workflow.
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
  central ticket or PR, use the central `LioRael/lenso` GitHub repository.
  Verify blockers and use repo-qualified closure syntax; do not close it early.
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

### TypeScript verification and evidence

- Read the current root and affected package manifests, lockfile and
  `.github/workflows/ci.yml` before choosing checks. Use Node from `.node-version`,
  pnpm from `package.json#packageManager`, and a Bun version satisfying the
  affected packages and any exact CI pin. Inspect the installed versions;
  unavailable tools are blockers, not permission to change global configuration.
- Console is a TypeScript plugin and SDK. Use the contribution guide's checks
  for backend/Auth/Manage, browser SDK, Shell and packaging according to the diff.
  Inspect their actual scripts and imported tool configuration before running
  them; a scoped lint command must apply the repository's existing overrides.
- Establish dependency reproducibility before installation. Prefer compatible
  published TS packages. If a candidate depends on unpublished framework changes,
  record their immutable source revision and provide a reviewed archive/workspace
  preparation that works in a clean candidate checkout and CI. Include transitive
  resolutions; ignored local archives and a dirty framework patch are not CI
  evidence. Installing dependencies must preserve the committed lockfile.
- The required local and candidate gates must validate the TS runtime. If current
  scripts or CI still invoke retired Rust/Cargo checks, native launchers or Agent
  binary downloads, report the stale pipeline as a blocker and have it migrated
  under the appropriate scope. Do not install the retired stack to satisfy it,
  silently skip required checks, or weaken destination protection.
- Exercise the real Fetch/oRPC/Auth/Manage boundary and exact instance bindings
  when backend behavior changes. SDK or packaging changes need a built archive
  consumed outside source aliases, including declaration and browser import
  boundaries. Only use disposable test-owned data for write checks.
- Keep focused diagnostics distinct from the full gate. Browser changes need
  actual browser evidence with the repository-pinned Playwright revision.
  Unit fixtures, preflight alone and macOS results do not replace the required
  successful Linux candidate proof.
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
