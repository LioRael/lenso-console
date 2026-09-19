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

The repositories use candidate-first protection for `main`:

- Changes enter through a reviewed immutable candidate revision; a GitHub Issue
  handoff is supported for contributors without write access.
- The required status check is `quality`, reported by candidate CI.
- The verified candidate is normal-fast-forwarded to `main` at the same SHA.
- Force pushes are disabled and required protection is read back after landing.

See [Contributing](../CONTRIBUTING.md) for the maintainer checklist and the
plain Git alternative.

## Continuous Integration

The Lenso Console `ci` workflow runs for candidate pushes under `delta/verify/**`; the verified revision is then fast-forwarded to `main` without a duplicate full run.

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

1. Console source delivery and release inspection remain separate. The
   Changesets workflow is read-only until separately authorized version work is
   reviewed and landed.
2. Repository write access alone is not release authority. Agent npm and
   development-kit publication retain their explicit manual gates, environments,
   package selection, action pins, and OIDC identities.
3. Console does not currently publish an OCI image or Rust contracts. Do not
   claim registry availability, image digests, attestations, or deployment as a
   result of source landing.
4. Verify `main` protection and the required `quality` check after delivery;
   preserve Console's framework and repository boundaries.
