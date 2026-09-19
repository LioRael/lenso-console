# Contributing to Lenso Console

Lenso Console is maintained through reviewed, immutable source revisions. Delta,
AI assistants, editor integrations, and other agents are optional; ordinary Git
contributors do not need any of them, and no tool invocation grants GitHub
permission.

## Start with an Issue handoff

If you do not have write access, use a fork and open a GitHub Issue describing:

- the problem or change summary;
- the fork URL and branch;
- the immutable, full 40-character commit SHA;
- focused checks run, plus known limitations.

A moving branch is not review evidence. If a fork is impractical, publish a
`git format-patch` series at a durable, accessible location and include its URL
and the source SHA in the Issue. GitHub Issues do not generally accept arbitrary
patch attachments.

```sh
git clone https://github.com/YOUR-ACCOUNT/lenso-console.git
cd lenso-console
git switch -c fix/short-description
# edit, then run the focused checks below
git add . && git commit -m "fix: describe the change"
git push -u origin fix/short-description
# optional durable handoff artifact:
git format-patch --stdout origin/main..HEAD > lenso-console.patch
```

Fork CI and source CI are useful context, but cannot replace the upstream
candidate check. A maintainer reviews the proposed diff, imports the pinned SHA
into an isolated checkout, integrates it onto current `main`, and preserves
contributor authorship and the Issue link.

## Focused validation

Choose the smallest checks that prove the changed behavior. For Console code,
use the relevant scripts from `package.json`; common focused checks are:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:local
pnpm build:local
pnpm service:boundary
```

Browser, distribution, and Rust checks are required when their area changes.
Do not claim that local checks cover platform CI; record skipped checks and
limitations in the Issue. Workflow, executable script, and dependency changes
receive focused syntax/configuration checks and the upstream candidate gate.

## Candidate-first landing

Only an authorized maintainer lands changes. The maintainer records the current
base SHA, obtains meaningful review, and pushes one final revision to a unique
candidate ref such as `delta/verify/lenso-console/<attempt>`. The required
`ci` workflow must be triggered by that candidate push and must report the exact
candidate SHA, ref, workflow, event, run attempt, and successful `quality` job.
The maintainer then normal-fast-forwards that same verified SHA to `main` only
if `main` is unchanged, and reads back the remote SHA and required protection.
A failed or unverified candidate is never promoted.

**Delta Land Changes** opens a dedicated Delta delivery review; **`/land`** can
invoke the repository Land skill in the current task when that host supports
it. `/land` is not a universal shell command, is not available in every app,
and is not a permission grant. Other agents use their supported skill or this
checklist. Plain Git users follow the commands below with a maintainer who has
write access. Delta-managed checkouts are used directly; do not create a nested
Worktrunk worktree.

```sh
git fetch origin main
git rev-parse origin/main                 # record base
# after review fixes:
git push origin HEAD:refs/heads/delta/verify/lenso-console/ATTEMPT
git rev-parse HEAD                          # candidate SHA
# inspect the `ci` run for that exact SHA/ref/event/attempt and quality success
git fetch origin main
git push origin CANDIDATE_SHA:refs/heads/main # only if base is unchanged
git fetch origin main && git rev-parse origin/main
```

Untrusted workflow or executable-script changes are reviewed before a
maintainer runs them with upstream credentials. Candidate validation never
receives publishing credentials. Landing is separate from releases: this guide
does not authorize npm/Cargo publication, version bumps, tags, releases,
deployment, or other registry writes. Those remain explicit, separately
controlled maintainer operations.
