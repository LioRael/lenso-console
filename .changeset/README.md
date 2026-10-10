# Changesets

Run `bun run changeset` for user-facing Console changes. Keep library release
versions separate from the private workspace and development Shell application.

The approved `console-sdk-npm.yml` workflow publishes explicit Console library
sets through the protected `npm` environment and npm Trusted Publishing. Its
`frontend` scope selects the SDK, React Shell and optional domain adapters; its
`backend` scope selects only the TypeScript `@lenso/console` plugin. Publication
requires separate release authorization and environment approval. Neither scope
publishes the root workspace, development Shell, examples or native binaries.
