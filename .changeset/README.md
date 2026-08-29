# Changesets

Run `pnpm changeset` for every user-facing Console change. The version pull
request updates the private application changelog and version when an OCI
release is required.

There is no Console-owned npm publication. A merged root-version bump publishes
the digest-pinned Console image through the repository's OCI workflow.
