# Changesets

Run `pnpm changeset` for every user-facing change to the public Console Module
packages or the private Console Service root package. The version pull request
updates the package changelogs and the root Service version when an OCI release
is required.

The merged version update publishes `@lenso/console-module-api` and
`@lenso/console-ui` through npm Trusted Publishing. A root-package version bump
also publishes the digest-pinned Console Service image through the repository's
OCI workflow.
