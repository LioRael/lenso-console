# ADR-0005: Distribute Agent Web through npm

Status: Accepted

## Decision

Console owns the `@lenso/agent` Web launcher and its platform distributions. It
composes the existing Console service, Console client assets, App Agent Web,
and Console Agent Web without merging their Host Catalogs or durable state.
The Agent repository remains the authority for its exact released executables.

The npm launcher has exact-version optional platform dependencies. Each platform
package contains the complete runtime cohort; npm supplies integrity checking
and caching. Startup performs no downloads, compilation, or package mutation.
The launcher only resolves its platform package and owns the Console child
process. The Rust Console launcher retains ownership of Agent processes.

The initial targets are macOS arm64 and Linux x64, matching Agent release
artifacts. Console and launcher versions match; the Agent version and archive
SHA-256 values are pinned in the distribution manifest. Unsupported platforms
fail explicitly. Workspace remains the invoking directory; Agent and Console
Homes retain their existing locations and configuration authority.

Publishing uses a dedicated, manually dispatched GitHub OIDC npm Trusted
Publisher workflow after native builds, package installation, and lifecycle
smokes pass. The private Console Changesets workflow remains version-only.
First-time registry package creation and publisher configuration are external
setup steps, not implied by repository write access.

## Acceptance

A clean supported machine with Node.js can run `npx @lenso/agent web`, open the
real Console, and configure authentication there. `--port`, `--no-open`, SSH
launches, occupied ports, child failure, SIGINT, SIGTERM, persisted Homes, and
installation without lifecycle scripts are covered. The launcher must not
claim Windows support or silently launch an unrelated local binary.
