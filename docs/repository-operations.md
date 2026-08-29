# Repository Operations

This repository owns the Agent-focused Lenso Console. It contains the TanStack
Start application, bounded server-side Agent Harness bridges, and their quality and
delivery gates.

For the framework runtime, see
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

This repository owns the Console Shell, Agent routes, and Console-specific
release artifacts. Shared design primitives come from published `@lenso/ui` and
`@lenso/tokens` packages; this repository does not publish another UI layer.

The framework repository owns Plugin Plan and Kernel runtime contracts. The
Console does not embed or compose that runtime.

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

## Agent Harness boundary

Normal Agent traffic targets the configured Agent Harness. The same-origin
Agent Control route forwards only Tool policy reads and updates with a
server-only Harness credential.

## GitHub Repository Metadata

Current repository metadata should stay aligned with the README:

- Description: `Agent-focused Lenso Console.`
- Topics: `agent`, `lenso`, `react`, `typescript`, `vite`

Update GitHub metadata when the repository role changes materially.

## Release and Rename Invariants

The coordinated rename and independent-release cutover keep these invariants:

1. `LioRael/lenso-console` owns its Console OCI image; no central publisher is a
   normal release dependency.
2. Update the repository-local Changesets and OCI release configuration before
   attempting another release.
3. Repository write access alone is not release authority; GHCR writes use the
   approved GitHub OIDC workflow.
4. Application metadata, OCI source labels, CI checkout paths, and the
   repository-boundary test must change together; never leave old and new live
   identities mixed.
5. Verify `main` branch protection and the required `quality` check after the
   rename.
6. Use the repository-local Changesets and OCI workflows for a release. Verify
   the digest-pinned GHCR image and GitHub attestation before production activation.
