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
existing account login. Install the matching Agent release before running `pnpm agent:web`. Portable Plugin packaging and lifecycle management use
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
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

`pnpm build` includes TypeScript validation. `pnpm test` runs both the local
Vitest suite and the browser suite.
