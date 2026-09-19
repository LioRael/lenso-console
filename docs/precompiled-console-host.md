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

The Console page compiler declares a five-minute per-compiler budget for its
first-time Bun dependency setup. This is an explicit Convention bound, not a
global Host timeout change: ordinary processors retain Engine's 60-second and
1-MiB defaults. The extracted-kit consumer test grants that first build a
30-second assembly margin and keeps its complete lifecycle test bounded to seven
minutes. Unless the caller explicitly configures `BUN_INSTALL_CACHE_DIR`, the
compiler also uses and removes a private temporary Bun cache for that build, so
an interrupted install cannot block later Console builds through a shared cache.

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

The SDK is bundled with the development kit. A kit release does not publish an
npm SDK alias or sign the executables.

## Native platform acceptance

`.github/workflows/console-development-host.yml` builds and tests macOS ARM64 and
Linux x64 on their native runners. Linux passed the no-Rust gate in run
`35457714751`; macOS has also passed locally. Dispatch requires an immutable
Engine repository revision because Engine is independently owned. Each kit is
archived as tar.gz, extracted and tested again, then uploaded with a SHA-256
checksum. This preserves executable modes across GitHub artifact transport.

After merging, dispatch on `main` with `publish=true` to publish a development
prerelease only after both platform gates pass. Download the archive for your
platform, verify its checksum, and extract it with `tar -xzf`. Add the extracted
`development-host/bin` directory to PATH and follow the package README. The
release records the Console and Engine source revisions. No Windows launcher
is included in this POSIX package.
