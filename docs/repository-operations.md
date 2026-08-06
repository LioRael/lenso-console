# Repository Operations

This repository owns the complete Lenso Console product and deployable Console
Service. It contains the React Shell, Console Service API, Worker and Migration
Workloads, Console-owned Store migrations, Console Module UI packages, and the
quality and delivery gates that verify them together.

For the framework and managed-Service side of the seam, see
[`LioRael/lenso`](https://github.com/LioRael/lenso).

## Repository Boundary

The active GitHub repository is `LioRael/lenso-console`. Keep the framework and
Console checkouts in this sibling layout:

```text
framework/
  lenso/
  lenso-console/
```

- Lenso Console: `LioRael/lenso-console`
- Lenso framework: `LioRael/lenso`

This repository owns the Console Shell, Console Service API, Console Operator
identity integration, System Registry Module, Management Intents, Console
Projections, reconciliation, System Operations, the `lenso/platform-story`
Module backend and UI artifact, and Console-specific release artifacts.

The framework repository owns public cross-repository contracts and the
managed-Service System Plane Capability Providers that expose authoritative
Observations and Operations. Managed Services retain their own state and must
not depend on this repository. Lenso Console consumes the published `lenso`
facade and System Plane contracts without directly reading a managed Service
Store.

## Branch Protection

Both repositories protect `main` with the same baseline:

- Changes must enter through pull requests.
- The required status check is `quality`.
- Status checks are strict, so branches must be up to date before merge.
- Linear history is required.
- Force pushes are disabled.
- Branch deletion is disabled.
- Required approval count is `0`.
- Admin enforcement is disabled so repository admins retain an emergency escape hatch.

Use squash merges for small maintenance PRs unless there is a reason to preserve
multiple commits.

## Continuous Integration

The Lenso Console `ci` workflow runs on pull requests and pushes to `main`.

The `quality` job runs:

```sh
pnpm check
```

The workflow checks out only `lenso-console` at the workflow SHA. Cross-repository
compatibility is validated through published package and contract versions rather
than a central integration-set checkout. The workflow uses Node 24 with Node
24-native GitHub Actions.

## Backend Compatibility

The Console Service consumes published framework and Module contracts. Local
development may still use sibling checkouts, but CI does not fetch a central
integration set or depend on a shared release repository.

## GitHub Repository Metadata

Current repository metadata should stay aligned with the README:

- Description: `Lenso Console frontend, Console Service backend, extension packages, and service SDKs.`
- Topics: `admin-console`, `lenso`, `react`, `service-management`, `system-plane`, `typescript`, `vite`

Update GitHub metadata when the repository role changes materially.

## Release and Rename Invariants

The coordinated rename and independent-release cutover keep these invariants:

1. `LioRael/lenso-console` owns its public npm packages and Console Service OCI
   image; no central publisher is a normal release dependency.
2. Update the repository-local Changesets and OCI release configuration before
   attempting another release.
3. Repository write access alone is not release authority; registry writes use
   the approved Trusted Publisher workflows.
4. Package metadata, OCI source labels, CI checkout paths, and the
   repository-boundary test must change together; never leave old and new live
   identities mixed.
5. Verify `main` branch protection and the required `quality` check after the
   rename.
6. Configure npm Trusted Publisher bindings for both public packages before
   the next production release; do not add a long-lived npm token.
7. CI validates this checkout against published framework and Module contracts;
   it does not require a deploy key or a central integration-set checkout.
8. Run the Console quality gate and the framework's main-branch gate when a
   release consumes a new framework contract.
9. Use the repository-local Changesets and OCI workflows for a post-rename
   release. Verify public npm metadata, the digest-pinned GHCR image, the
   release manifest, and the GitHub attestation before production activation.
