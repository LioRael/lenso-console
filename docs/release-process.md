# Release Process

`LioRael/lenso-console` owns its Console application and service. It
does not use a repository-wide release plan, shadow registry, central publisher,
release nonce, or cross-repository receipt channel.

## Versioning

Create a changeset for every user-facing Console change:

```sh
pnpm changeset
```

The Changesets workflow opens or updates a version pull request for the private
`@lenso/console-web` application. The private application itself is not published to npm. The separately staged
`@lenso/agent` launcher and platform packages use the opt-in
[Agent npm distribution workflow](agent-npm-distribution.md). Historical package versions and tags remain historical
records; the application version identifies the source release. The former OCI pipeline
was retired; versioning does not publish a container image.

## Generated release PR checks

Release PRs use the repository `GITHUB_TOKEN`; no dedicated Release App or
central coordinator is required. Keep Actions pull-request creation enabled and
retain the workflow's scoped `contents: write` and `pull-requests: write` permissions.
The separate opt-in Agent publisher retains its own OIDC workflow.

GitHub places workflows for `github-actions[bot]` pull requests behind an
[approval gate](https://github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved/).
During delivery:

1. Review the generated version/lockfile changes and record the PR's current head SHA.
2. Open the pending CI run for that same head and use **Approve and run**.
3. Wait for all required checks on the reviewed head before merging. If the bot
   updates the PR, review the new head and approve its pending runs again.

`action_required` and an expired approval are delivery blockers, not executed
test failures. Approving CI does not approve a merge or publication. Do not bypass
required checks or dispatch a publisher to compensate for a pending PR approval.

## Distribution boundary

Merge the reviewed Changesets version PR after its quality checks pass. The
source distribution runs Console using the documented
`pnpm agent:web` launcher and separately released Agent Web binaries.

There is no active OCI build or publication workflow. A Changesets version bump
does not create an immutable image, GitHub binary release, or npm publication.
Do not claim an image digest or restore the retired pipeline as part of routine
versioning. The Agent npm workflow separately builds, verifies, and publishes
its bundled binary distribution; a version bump alone does not run it.

## Accepted installation cohort

The coding setup flow requires Lenso Agent 0.1.4 or newer, including its separate
App Web and Console Web binaries. Use Lenso Agent 0.1.7 or newer for working-directory context in the task
workbench. Use Lenso Agent 0.1.8 or newer for first-time startup without an
existing account login. Browser-authorized Projects connections require Agent
0.1.9 or newer and a business App with Auth consent and Projects HTTP ingress.
Install the matching Agent release before running `pnpm agent:web`. Portable Plugin packaging and lifecycle management use
Cargo `lenso-cli 0.5.2` or npm `@lenso/cli 0.16.2`.

SQLite-managed Agents can import official coding Profiles while running. Select
an Agent in its chat page, open **Set up coding**, import the Profiles, and
activate Code to validate the environment. Review and save explicit Tool access,
then choose Plan or Code. Import and Profile activation do not grant Tools.
A failed activation keeps the previous mode active. Conflicts require reloading
the relevant configuration; custom Profile files are never overwritten.

The source launcher persists each Agent's Tool policy in its own Home. Keep the
Agent Home outside the coding workspace, and install the programs required by
the Profile in the Agent process's PATH. Older Agents and authorities without
hot import do not display the setup entry. Authentication and model configuration
remain in the Agent's existing settings.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm changeset status --output /tmp/lenso-console-changesets.json
pnpm check:preflight
pnpm build
pnpm test
```

`pnpm check:preflight` runs lint/format checks, Rust workspace formatting,
locked service metadata/ownership checks and generated contract typechecking
before CI downloads Chromium. `pnpm check` runs this preflight followed by
`pnpm check:full`, preserving browser, distribution, build and Rust checks.
The checked-in Rust toolchain matches CI.

`pnpm build` includes TypeScript validation. `pnpm test` runs both the local
Vitest suite and the browser suite.

## Standalone Rust contract packages

`contracts/` owns the UI Contribution and Workspace Service packages;
`plugins/observe/crates/lenso-capability-observability-query` owns the Observe
query package. Each is `publish = true` and passes independent `cargo package`
verification with registry dependencies. This establishes package readiness,
not registry availability. No Rust contract publisher is configured by this
extraction, and the existing npm workflow does not publish these crates.

Before dependent Plugin registry publication, configure the approved crates.io
Trusted Publisher workflow and release environment, publish the reviewed contract
versions, and verify their registry availability. Then replace the Projects
Workspace's pinned Git contract dependencies and Observe's local contract paths
with the published versions, verify their package builds, and configure their
own releases. The implementation packages remain unpublished until that work
is complete. Console's source App pins both Projects packages to one immutable owner Git
revision and aligns native UI contract sources through repository-relative manifest
patches. A clean checkout does not require temporary or machine-specific overrides.
