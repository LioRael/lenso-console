# Runtime Console inspection

Optional diagnostics, read-only by default, owned by Runtime and mounted explicitly by the
application. The package does not install a Runtime host, listener or user system.
Its compiled `console/` page uses the public Console SDK and the application's
Lenso UI theme.

`createConsoleRuntimeInspection` from `@lenso/console-runtime/server` requires the
exact Runtime and Console authentication plugins, plus the host-selected target
and tenant. It exposes `status` and `catalogue`, read operations with strict empty input.
Trusted entry binding supplies `{ context: { evidence: { identity, resource,
request } } }`. Input cannot select a principal, target or arbitrary Runtime
method. The service rechecks current authenticated administrator access before
reading and before returning; only bounded kernel metadata is projected.

`status` reads the connected kernel. `catalogue` reads a host-selected build
manifest once at startup; refreshing the page does not reload that file. Its
`source: "static-build-manifest"` and `availability: "unverified"` fields are
deliberate: a build declaration does not establish a live instance, a matching
registration, current permission or call availability. Runtime status remains
the separate source for registration, active/waiting calls and recent outcomes.
No schema-discovery wire message is added.

Pass `manifestPath` to select a UTF-8 JSON build artifact with this envelope:

```ts
{
  format: "lenso-runtime-build-manifest/1",
  services: [{ namespace: "example", service: "greeting", contract }]
}
```

`contract` is the existing Runtime contract (`version`, `methods`, each method's
`mode`, `input`, `output`, `error`), validated by `@lenso/runtime-sdk/schema`.
Only those contract fields and service identities are disclosed; unrelated
manifest metadata is omitted. Files are limited to 256 KiB, metadata to depth
24 and 16,384 nodes, and the directory to 64 services and 64 methods per service.
Invalid or oversized artifacts fail startup with an opaque error. Live snapshots
are bounded to 256 instances, 1,024 active/waiting calls, 256 capabilities per
instance and the existing 64 recent outcomes, with the same metadata budget.
These limits reject over-budget snapshots rather than silently displaying partial data.

## Explicit greeting trial

The optional `greetingTrial` factory option requires the exact host-selected
`namespace`, `service`, `contractVersion` and `sideEffectFree: true`. The owner
must have reviewed that implementation. It admits only unary `greet`, accepting
`{ name }` (trimmed, 1–80 characters) and returning `{ message }` (1–512 characters).
The SDK enforces the fixed contract, a 2-second deadline and request cancellation.
Current administrator/authentication/policy checks run before and after dispatch.
Input cannot override the target, method, principal, timeout or contract. When a
manifest is also supplied, its target/version must declare unary `greet`.

Without this explicit option, `greet` is absent from Manage and the page presents
disabled trial guidance. Enabling it does not open arbitrary Runtime invocation
or grant authority over production services. Results are shown only in the live
form; call diagnostics never include request/response payloads.

The existing authenticated `examples/ts-console` host opts in through
`LENSO_RUNTIME_PORT` or `local.json`'s `runtimePort`. Without that setting it does
not load or connect Runtime. The port identifies this local operator application's
kernel; all instances visible in that kernel are diagnostics for the selected
target, not a tenant-filtered multi-user kernel.

The local example accepts `LENSO_RUNTIME_MANIFEST` (`runtimeManifestPath` in
`local.json`) and resolves it relative to the configuration root. Its separate
`LENSO_RUNTIME_GREETING_TRIAL=true` (`runtimeGreetingTrial: true`) switch permits
only the reviewed synthetic `console-demo/greeting`, contract `1`; it cannot
choose arbitrary services. Both options require `runtimePort`. Neither option
starts a greeting implementation. The browser fixture below owns that synthetic
service, its temporary build manifest and its kernel.

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

The proof uses the original Shell, real Auth login, a live kernel and the synthetic
greeting owner in `examples/ts-console/test/runtime-greeting.ts`. It includes a
manifest-only service to prove static declarations are not shown as live
instances, rejects invalid/anonymous trial requests before dispatch, exercises
the greeting form with keyboard/touch, and retires an in-flight form safely.
Its generated
operator token and temporary session database are owned and cleaned up by the
fixture. The complete `bun run check` gate also prepares these binaries and
requires this browser proof, rather than silently skipping it.

Design: ENERGY 1 / RHYTHM 1 / MOTION 1. Semantic theme colors and inherited
typography keep diagnostics in the existing Console language. Lenso UI tables
group declarations, instances and call facts; Accordion reveals bounded schemas.
A contextual top-right Refresh icon uses the public Console corner/tooltip APIs.
The greeting uses Lenso Form/TextField with explicit loading, error and response
states. Compact columns, wrapping identifiers and content-end clearance preserve
narrow-screen access. No additional Dock, assets or decorative motion.
