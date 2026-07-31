# Repository Operations

This repository owns the complete Lenso Console product and deployable Console
Service. It contains the React Shell, Console Service API, Worker and Migration
Workloads, Console-owned Store migrations, Console Module UI packages, and the
quality and delivery gates that verify them together.

For the framework and managed-Service side of the seam, see
[`LioRael/lenso`](https://github.com/LioRael/lenso).

## Repository Boundary

The active GitHub repository remains `LioRael/lenso-runtime-console` until the
coordinated rename cutover. Its target identity and post-cutover sibling layout
are:

```text
framework/
  lenso/
  lenso-console/
```

- Lenso Console: `LioRael/lenso-console`
- Lenso framework: `LioRael/lenso`

This repository owns the Console Shell, Console Service API, Console Operator
identity integration, System Registry Module, Management Intents, Console
Projections, reconciliation, System Operations, and Console-specific release
artifacts.

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

The workflow checks out both repositories:

- `lenso-runtime-console` at the workflow SHA until the rename cutover.
- `lenso` from `LioRael/lenso` so this workspace can consume the backend SDK.

The workflow uses Node 24 with Node 24-native GitHub Actions.

## Backend Checkout Secret

Lenso Console CI reads the private framework repository through a read-only
deploy key:

- Backend deploy key: `lenso-runtime-console CI read key` until the rename
  cutover
- Backend deploy key mode: read-only
- Lenso Console secret: `LENSO_REPO_DEPLOY_KEY`

If the backend repository is recreated, transferred, or renamed, recreate the
read-only deploy key on `LioRael/lenso` and update the
`LENSO_REPO_DEPLOY_KEY` secret in this repository with the matching private key.

## GitHub Repository Metadata

Current repository metadata should stay aligned with the README:

- Description: `Operator-facing System Plane and independently deployable Console Service for Lenso systems`
- Topics: `admin-console`, `lenso`, `react`, `service-management`, `system-plane`, `typescript`, `vite`

Update GitHub metadata when the repository role changes materially.

## Migration Checklist

When renaming or transferring this repository:

1. Retire or migrate the legacy manually dispatched SDK publisher to the
   coordinator-owned reviewed publisher; do not preserve direct publication as
   a normal post-rename path.
2. Update the component entry in `LioRael/lenso-release` through its reviewed
   change path before attempting another release plan.
3. Rename the GitHub repository to `LioRael/lenso-console`; repository write
   access alone is not release authority.
4. In the cutover change, update release config, generated runtime, package
   metadata, OCI source labels, CI checkout paths, and the repository-boundary
   test together; never leave old and new live identities mixed.
5. Reapply or verify `main` branch protection and the required `quality` check.
6. Rename the backend read-only deploy key label to `lenso-console CI read key`;
   rotate `LENSO_REPO_DEPLOY_KEY` only when its key material changes.
7. Update npm trusted-publisher repository bindings for the packages published
   from this repository.
8. Verify CI checks out `lenso` and all package fixtures successfully.
9. Run the Console and framework main-branch quality gates.
10. Use the reviewed Lenso release workflow for the first post-rename shadow
    release and verify its receipt and attestation before production activation.
