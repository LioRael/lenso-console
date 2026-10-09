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
use the current root and affected package scripts. Console's runtime is the
TypeScript plugin, not the retired native Host. Common Shell checks are:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test:local
bun run build:local
```

For backend changes, run the Console package's typecheck, tests and build.
For SDK changes, run its compile and focused transport/authoring checks.
For packaging changes, consume the actual built archives in a clean external
application, checking declarations and browser/server import boundaries.
Read the current manifests for the exact commands; a script name alone does not
prove it validates the TS implementation.

Browser checks are required for changed interactive surfaces. Backend tests
must exercise real Fetch/oRPC/Auth/Manage calls, instance isolation and applicable
write safeguards. Use only disposable test-owned data. Record skipped checks
and limitations; local results do not cover platform CI. Workflow, executable
script and dependency changes receive focused review and the upstream candidate gate.

### Shared local and CI gate

Use Bun 1.4.2 from `.bun-version`. Node is only used at the publisher and
external npm-compatibility consumer boundary. Inspect the workflow and the
complete command chain before running the shared gate.

Dependencies must resolve with `bun install --frozen-lockfile` in a clean
candidate checkout. Framework dependencies use compatible published npm packages,
including transitive resolutions. Do not inject framework source overrides,
workspace aliases, temporary archives or copied implementation files. An
unavailable published API is a delivery blocker, not permission to patch
`node_modules` or prepare a sibling framework checkout.

CI and local validation use the same frozen installation sequence. Archive
integration packs the candidate Console backend and SDK, then installs those
archives in an isolated application with normal published framework packages. It
checks actual authoring, typed invocation, authentication and browser/server
boundaries. The required staged Shell must exist with every referenced asset;
missing build output fails validation rather than skipping it.

The shared local and CI gate must cover the TS plugin, SDK and Shell, including
actual archive consumption and pinned-browser validation where applicable. The
gate records the source SHA and tool versions; the Linux candidate run remains
authoritative. A focused check or preflight alone is not the complete gate.

Rust/Cargo validation, native Hosts, Agent binaries and development kits are
retired Console requirements. The supported scripts and CI use only TS owners.
If a future change reintroduces a native step, migrate the pipeline before landing
rather than installing the old stack, skipping required checks or weakening
branch protection. In particular, verify the implementation of `bun run check`
before treating it as the shared TS gate.

Browser fixtures retain real StyleX CSS loading and geometry assertions, plus
the existing file-level isolation. Run
`bun run test:browser` for the focused layout and Dock regressions; the browser
fixtures now live under `plugins/console/shell/test/`. An alternate browser executable is diagnostic
evidence and is rejected by the complete pinned gate. macOS proof does not
replace the required Linux candidate result.

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
does not authorize package publication, version bumps, tags, releases,
deployment, or other registry writes. Those remain explicit, separately
controlled maintainer operations.
