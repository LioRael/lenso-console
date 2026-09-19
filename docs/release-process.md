# Release Process

`LioRael/lenso-console` owns its Console application and service. It
does not use a repository-wide release plan, shadow registry, central publisher,
release nonce, or cross-repository receipt channel.

## Versioning

Create a changeset for every user-facing Console change:

```sh
pnpm changeset
```

The Changesets workflow is a manually dispatched, read-only dry-run that inspects
pending release intent at an exact landed SHA. It does not open a version pull
request or modify the repository. The private `@lenso/console-web` application
itself is not published to npm. The separately staged
`@lenso/agent` launcher and platform packages use the opt-in
[Agent npm distribution workflow](agent-npm-distribution.md). Historical package versions and tags remain historical
records; the application version identifies the source release. The former OCI pipeline
was retired; versioning does not publish a container image.

## Read-only release inspection

Run the Changesets workflow manually on `main` with an exact landed `source_sha`
and `mode=dry-run`. It installs locked dependencies and runs `pnpm changeset
status`; it does not create commits, pull requests, tags, releases, or registry
writes. Version changes require a separately authorized maintainer change and
review. The Agent npm and development-kit workflows retain their independent
manual gates and publishing environments.

## Distribution boundary

After separately authorized version work passes its review and candidate checks,
the source distribution runs Console using the documented
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

## Console development kit prereleases

The `Console development Host matrix` workflow builds macOS ARM64 and Linux x64
kits against an exact Engine commit. It archives the executables in tar.gz files,
extracts each archive, and repeats the no-Rust acceptance test before uploading
the archives and SHA-256 checksums. GitHub artifact ZIP files are only transport
containers; install the tar.gz inside them to preserve executable permissions.

After the reviewed source merges, dispatch the workflow on `main` with the Engine
repository, its full reviewed commit SHA, and `publish=true`. Only a successful
matrix can create the GitHub development prerelease. The release records both
source revisions and has a unique run-specific tag. This does not publish the
Console SDK to npm, or publish Rust contracts or production container images.
