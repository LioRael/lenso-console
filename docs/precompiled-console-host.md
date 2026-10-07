# Precompiled Console development Host

This kit uses the separately pinned Engine producer and its `app create/dev/build`
protocol. The current standalone Lenso CLI has a different App authoring API;
do not substitute it for that Engine executable. For the current Lenso native
Plugin workflow, use [the embedding example](../examples/plugin-host/README.md).

The consumer workflow is documented in
[the package README](../packages/console-authoring/development-host.md). Consumers use prebuilt
binaries; only producers need the Rust and frontend build toolchains.

## Produce a package locally

The current CI producer is Core
`eaa5bc489e8f8d245fd30821b4a4fbe1a9e35551`: facade 0.5.29,
Kernel 0.3.12, native macros 0.2.9 and Console role codec 0.4.4.
Console's normal Cargo dependencies require these exact versions. A Git producer
pin alone does not constrain a broad registry requirement: Cargo can select a
newer registry Kernel beside the pinned Git Kernel, splitting public Rust types.
The facility guard checks these owner requirements before compilation; the runtime
guard still verifies the actual generated lock, source identities and packaged
assets. A newer Core producer requires a coordinated Console/Auth cohort update.

The following local producer/consumer example describes the earlier candidate:

Build a producer from a cohort matching Console's pinned SDK dependencies.
For this local candidate that producer is core `119b9af7` (SDK 0.5.28).
Current core `29b01e47` supplies Engine 0.2.5 as the precompiled consumer;
its automatic native producer currently conflicts with the Auth/codegen pins.
Record both revisions when they differ. From Console:

```sh
pnpm service:web-build
/path/to/compatible-engine-host app build --root /path/to/page-only-app --out /tmp/console-host-seed
node tooling/distribution/package-development-host.mjs \
  --engine-host /path/to/current-engine-host \
  --host-distribution /tmp/console-host-seed \
  --out /tmp/console-development-host
LENSO_CONSOLE_DEV_KIT=/tmp/console-development-host \
  node --test tooling/distribution/development-host.test.mjs
```

Outputs must not already exist. The seed is built using the normal App assembly
path; the packager verifies its native Host and Bun against the distribution
lock, checks target compatibility and native support source identity, then copies
the complete consumer tool closure. It does not ship an Agent application.

The producer App must explicitly select `packages/console-support`. The existing
`examples/app-console` has services and is not a page-only seed: its complete
WorkspaceService role includes Stream, which the generic Engine Bun App Host
does not currently admit. The kit starter therefore defaults to pages/navigation.
Run the distinct service gate with `LENSO_CONSOLE_DEV_KIT_SERVICES=1` only against
a Host qualifying that role; retain its failure as evidence rather than claiming
page-only acceptance proves service startup.

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

The authoring candidate's current-Engine consumer, matching native producer and
extracted page-only acceptance are recorded in
[the implementation review](reviews/console-authoring-dx-2026-10-02.md).
That record also includes the failing service admission gate. Historical checks
below do not establish this candidate's service or multi-platform acceptance.

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

After an explicitly authorized release decision, dispatch on `main` with `publish=true` to publish a development
prerelease only after both platform gates pass. Download the archive for your
platform, verify its checksum, and extract it with `tar -xzf`. Add the extracted
`development-host/bin` directory to PATH and follow the package README. The
release records the Console and Engine source revisions. No Windows launcher
is included in this POSIX package.
