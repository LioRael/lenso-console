# Repository Operations

This repository is the frontend half of the Lenso repo pair. It owns the
Runtime Console React/Vite workspace, console package host, module console
package fixtures, and frontend quality gate.

For the backend side of the pair, see
[`LioRael/lenso`](https://github.com/LioRael/lenso).

## Repository Pair

Keep the Runtime Console and backend checked out as siblings:

```text
framework/
  lenso/
  lenso-runtime-console/
```

- Runtime Console: `LioRael/lenso-runtime-console`
- Backend: `LioRael/lenso`

The backend owns the admin APIs, module manifests, contracts, and generated
TypeScript SDK consumed here.

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

The Runtime Console `ci` workflow runs on pull requests and pushes to `main`.

The `quality` job runs:

```sh
pnpm check
```

The workflow checks out both repositories:

- `lenso-runtime-console` at the workflow SHA.
- `lenso` from `LioRael/lenso` so this workspace can consume the backend SDK.

The workflow uses Node 24 with Node 24-native GitHub Actions.

## Backend Checkout Secret

Runtime Console CI reads the private backend repository through a read-only
deploy key:

- Backend deploy key: `lenso-runtime-console CI read key`
- Backend deploy key mode: read-only
- Runtime Console secret: `LENSO_REPO_DEPLOY_KEY`

If the backend repository is recreated, transferred, or renamed, recreate the
read-only deploy key on `LioRael/lenso` and update the
`LENSO_REPO_DEPLOY_KEY` secret in this repository with the matching private key.

## GitHub Repository Metadata

Current repository metadata should stay aligned with the README:

- Description: `Frontend workspace for the Lenso Runtime Console, module admin surfaces, and runtime observability views`
- Topics: `admin-console`, `lenso`, `react`, `runtime-console`, `tailwindcss`, `typescript`, `vite`

Update GitHub metadata when the repository role changes materially.

## Migration Checklist

When moving this repo pair to a new owner or recreating either repository:

1. Push both repositories and keep them as private repos unless intentionally publishing them.
2. Reapply `main` branch protection in both repositories.
3. Verify the required check name is still `quality`.
4. Recreate the backend read-only deploy key for Runtime Console CI.
5. Recreate `LENSO_REPO_DEPLOY_KEY` in this repository.
6. Verify the CI workflow still checks out the backend repository successfully.
7. Run both main-branch CI workflows and confirm they pass.
8. Update README repository links and GitHub metadata if owner or repo names changed.
