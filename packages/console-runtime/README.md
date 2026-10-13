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

For local development, install the built public `@lenso/runtime` and
`@lenso/runtime-sdk` candidates, build this package, then run:

```sh
bun examples/ts-console/build-runtime.ts
LENSO_RUNTIME_PORT=<kernel-port> bun examples/ts-console/serve.ts
```

Use the existing operator token/session login and open
`/plugins/local/runtime/runtime/` in the example host. The owner page is admitted
through the Shell's existing generic plugin route, not a hardcoded Shell page.
The normal
host preparation, Shell build and authorization page build still apply.
Generated compiler artifacts live under `.artifacts/ts-console/runtime`; edit
the package-owned source instead.
With Runtime binaries prepared, run the actual browser proof:
`LENSO_RUNTIME_ROOT=/absolute/runtime bun test examples/ts-console/runtime.browser.test.ts`.

Design: ENERGY 1 / RHYTHM 1 / MOTION 1. Semantic theme colors and inherited
typography keep diagnostics in the existing Console language. Plain lists group
instance/capability and call facts without a Dashboard template. Wrapping metadata
fits narrow screens; content-end clearance protects the final row from floating
navigation. A single Lenso UI Refresh button refreshes the real scoped read, with
explicit loading, empty and failure states. No assets or decorative motion.
