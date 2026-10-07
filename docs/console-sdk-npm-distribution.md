# Console SDK npm distribution

`packages/console-authoring` owns `@lenso/console-sdk`. Public `0.2.0` contains
the SDK and compiler, but **does not contain the Shell export**. The next reviewed
release adds the owner-built Shell to the same archive; preparing this candidate
with unchanged package metadata does not make that release publicly installable.
The existing immutable `0.2.0` must never be overwritten.

## Consumer contract

Declare the released SDK version and generate the App's ordinary dependency lock.
Resolve `@lenso/console-sdk/compiler` from the
package owning that dependency using Node `createRequire`, and run the resolved
file with Bun. The existing `lenso.convention-compile.v1` stdin request and
`lenso.convention-compiled.v1` stdout response are unchanged. The archive contains
`src`, the compiler's sibling modules and `router.ts`, scaffold and service example.
The next release also contains `shell/index.html` and all owner-built static assets.
Resolve `@lenso/console-sdk/shell` using the same dependency-owning `createRequire`,
then pass its directory as `LENSO_CONSOLE_SHELL_ROOT` when embedding Console.
An explicitly supplied Shell directory remains supported. Compiler and Shell now
share one package version and archive; Apps do not build the owner frontend.
It needs neither a Console checkout nor a portable Plugin package.

This compiler is an executable entry, not a JavaScript function to import into
the build process. App scripts outside the dependency-owning `console/` package
can use `createRequire(new URL("../console/package.json", import.meta.url))`.
The existing `lenso-console-author` CLI remains available. Examples live in the
[package README](../packages/console-authoring/README.md#compiler-package-entry).

## Candidate preparation

The opt-in `console-sdk-npm.yml` workflow accepts an exact reviewed `source_sha`.
Its default `publish=false` packs that revision, records archive integrity and
source SHA, then installs the exact archive with ordinary npm in an isolated
consumer. The consumer resolves the public compiler export and checks compilation,
workspace/service declarations, generated provider types and denial behavior.
It uploads `console-sdk-npm` with the archive, `pack.json` and `source.json`.
The preparation job has read-only repository permission and no publishing token.

Local equivalent:

```sh
pnpm install --frozen-lockfile
pnpm sdk:prepare
node --test tooling/distribution/sdk-shell.test.mjs
mkdir -p /tmp/console-sdk-candidate
npm pack ./packages/console-authoring --ignore-scripts --pack-destination /tmp/console-sdk-candidate
LENSO_AUTHOR_ARCHIVE=/tmp/console-sdk-candidate/lenso-console-sdk-0.2.0.tgz bun test packages/console-authoring/compiler/test/consumer.test.mjs
```

The Shell archive is a validation artifact; until npm exposes a new version with
this export, an App
cannot replace its source copy with a registry version and claim the migration
is complete. Installing this candidate tarball proves package readiness, not
registry availability or a released Host's compatibility.

## Separate publication authorization

Push, exact CI, landing and npm publication require their own explicit approval.
After the package candidate lands and its exact gates pass, dispatch the workflow
on `main` with `source_sha` equal to that main SHA and `publish=true`. The `npm`
environment gates only the publication job. It downloads and verifies the tested
archive, uses npm Trusted Publishing, and waits for public metadata and tarball
integrity before declaring the version installable. It never changes versions,
creates tags/releases or deploys an App. An accepted but withheld publication
must be inspected before retrying; immutable versions cannot be overwritten.

The registry owner must initialize the package and configure its Trusted Publisher
for repository `LioRael/lenso-console`, workflow `console-sdk-npm.yml`, environment
`npm`, allowing direct `npm publish`. Public E404 does not establish that this
configuration exists. First-time package initialization is a separately authorized
registry-owner action; this candidate introduces no token/bootstrap bypass.
No Trusted Publisher or registry credentials are read or configured during local
preparation. npm's [Trusted Publishing documentation](https://docs.npmjs.com/trusted-publishers/)
defines the provider settings and npm/Node requirements; the workflow reuses the
owner's existing Node and npm publishing tool versions.
