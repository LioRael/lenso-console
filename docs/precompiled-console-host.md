# Precompiled Console development Host

The consumer workflow is documented in
[the package README](../packages/console-dev/README.md). Consumers use prebuilt
binaries; only producers need the Rust and frontend build toolchains.

## Produce a package locally

Build the Engine Host from the sibling Engine workspace, then from Console:

```sh
pnpm service:web-build
/path/to/lenso-engine-host app build --root examples/app-console --out /tmp/console-host-seed
node scripts/package-development-host.mjs \
  --engine-host /path/to/lenso-engine-host \
  --host-distribution /tmp/console-host-seed \
  --out /tmp/console-development-host
LENSO_CONSOLE_DEV_KIT=/tmp/console-development-host \
  node --test scripts/distribution/development-host.test.mjs
```

Outputs must not already exist. The seed is built using the normal App assembly
path; the packager verifies its native Host and Bun against the distribution
lock, checks target compatibility and native support source identity, then copies
the complete consumer tool closure. It does not ship an Agent application.

The generic Engine `development_host` field selects a local
`lenso.precompiled-host.v1` manifest. The manifest pins an executable, target,
SHA-256 digest, exact native support releases, their source digests, and linked
companions. Engine validates these before native contract synchronization, then
uses the binary's own Host Catalog. It copies the verified executable and records
its manifest in the App distribution lock. Portable page providers still use
normal Bun Plugin assembly, contracts and immutable App Plan admission.

Factories present in the binary do not imply active Instances. Console disabled
through Plugin Root produces no pages or listener. Existing source compilation
remains available for Apps without `development_host`.

## Verified locally

The opt-in integration test creates a fresh App with PATH containing only the
package's bin directory, builds it, runs the readiness/shutdown check, disables
Console and verifies a zero-Instance App, and rejects a wrong-target Host before
publication. It also checks that no Cargo Host cache is created. Engine has an
admission regression test for changed native source, unadmitted native Plugins,
and tampered Host binaries.

A real `app dev` run under the same restricted PATH served the Console, retained
the previous generation after invalid TSX, then replaced it after correction.
The rebuilt page was inspected in the browser. These checks do not claim React
Fast Refresh, all platform targets, or offline first-time npm installation.

The package and implementation remain local; publication, signing, registry
aliases and remote delivery have not been performed.

## Native platform acceptance

`.github/workflows/console-development-host.yml` builds and tests macOS and
Linux on their native runners. Dispatch requires an immutable Engine repository
revision because Engine is independently owned. The workflow only builds and
uploads verification artifacts; it does not publish packages. It has not been
run for these local changes. Linux remains unverified while the local Docker
daemon is unavailable. No Windows launcher is included in this POSIX package.
