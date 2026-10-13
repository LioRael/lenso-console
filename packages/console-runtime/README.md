# Runtime Console inspection

Optional, read-only diagnostics owned by Runtime and mounted explicitly by the
application. The package does not install a Runtime host, listener or user system.
Its compiled `console/` page uses the public Console SDK and the application's
Lenso UI theme.

`createConsoleRuntimeInspection` from `@lenso/console-runtime/server` requires the
exact Runtime and Console authentication plugins, plus the host-selected target
and tenant. It exposes only `status`, a read operation with strict empty input.
Trusted entry binding supplies `{ context: { evidence: { identity, resource,
request } } }`. Input cannot select a principal, target or arbitrary Runtime
method. The service rechecks current authenticated administrator access before
reading and before returning; only bounded kernel metadata is projected.

The existing authenticated `examples/ts-console` host opts in through
`LENSO_RUNTIME_PORT` or `local.json`'s `runtimePort`. Without that setting it does
not load or connect Runtime. The port identifies this local operator application's
kernel; all instances visible in that kernel are diagnostics for the selected
target, not a tenant-filtered multi-user kernel.

From this Console workspace, prepare the checksum-pinned public
`@lenso/runtime` and `@lenso/runtime-sdk` candidates before installing.
Preparation writes ignored, workspace-relative `.runtime-deps` artifacts and
verified Runtime sources; it does not require a sibling checkout or rewrite
the lockfile. Use Bun 1.4.3 and the existing host preparation:

```sh
bun run prepare:runtime
bun install --frozen-lockfile --ignore-scripts
bun run service:ts:prepare
bun run service:runtime:prepare
LENSO_RUNTIME_PORT=<kernel-port> bun examples/ts-console/serve.ts
```

To use current unpublished Runtime changes, replace the preparation command with
`bun run prepare:runtime --runtime-root ../lenso-runtime` (adjust the checkout path).
That explicit local mode records current source hashes instead of claiming the
remote snapshot pin; the Console adapter remains pinned. Both modes need Cargo
for native fixture binaries and are source preparation, not npm publication.

Use the existing operator token/session login and open
`/plugins/local/runtime/runtime/` in the example host. The owner page is admitted
through the Shell's existing generic plugin route, not a hardcoded Shell page.
`service:ts:prepare` builds the original Shell and authorization page;
`service:runtime:prepare` builds, typechecks and tests this package, then compiles
the Runtime page.
Generated compiler artifacts live under `.artifacts/ts-console/runtime`; edit
the package-owned source instead.

For the actual browser/Auth proof, use the verified sources from preparation
and Rust toolchain 1.94.0. The fixture builds only the kernel and batch service
with the checked-in Cargo lockfile, under `.runtime-deps/runtime-target`:

```sh
bun tooling/checks/prepare-runtime-fixture.mjs
bun --bun x --no-install playwright install chromium
LENSO_RUNTIME_ROOT="$PWD/.runtime-deps/runtime" \
  LENSO_RUNTIME_BIN_DIR="$PWD/.runtime-deps/runtime-target/debug" \
  LENSO_REQUIRE_RUNTIME=1 \
  bun test examples/ts-console/runtime.browser.test.ts
```

The proof uses the original Shell, real Auth login and a live kernel; its generated
operator token and temporary session database are owned and cleaned up by the
fixture. The complete `bun run check` gate also prepares these binaries and
requires this browser proof, rather than silently skipping it.

Design: ENERGY 1 / RHYTHM 1 / MOTION 1. Semantic theme colors and inherited
typography keep diagnostics in the existing Console language. Plain lists group
instance/capability and call facts without a Dashboard template. Wrapping metadata
fits narrow screens; content-end clearance protects the final row from floating
navigation. A single Lenso UI Refresh button refreshes the real scoped read, with
explicit loading, empty and failure states. No assets or decorative motion.
