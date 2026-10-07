# Precompiled Console development Host

The `lenso` command below is the Engine executable bundled in this kit. Its
development protocol differs from the standalone Lenso CLI. Source contributors
using the current native Plugin API should start with
[the embedding example](../../examples/plugin-host/README.md).

This package contains the Engine CLI, a native Host with Console and Web ingress,
the embedded Console Shell, Bun, the Console directory compiler, and Console SDK
with its compiler dependencies frozen from the owner's pnpm lockfile.
Application authors need no Cargo, rustc, Node, pnpm, or local Console checkout.
Initial page-provider dependency installation uses the npm registry; this is not
an offline dependency cache. Built App distributions run offline.
Page compilation uses the installed kit's tools without installing or copying
another SDK into each App. Registry access belongs to dependency installation,
not source type checking.

Add this package's `bin` directory to PATH, then run:

```sh
lenso app create my-app --console
lenso app dev --root my-app
lenso app build --root my-app
lenso app start --from my-app/dist
```

Open the HTTP address printed by `app dev` or `app start`. The App owns its Console;
no Agent is started. Edit `app/orders/console/page.tsx` or add nested pages.
`orders/[id]/page.tsx` receives `params.id`. Development watches source and
rebuilds complete generations; it is not React Fast Refresh. A failed rebuild
keeps the previous generation running. Successful replacement may print a new
HTTP address when using the default dynamic listener port.

The scaffold records this installed package in `lenso.toml` as `development_host`
and `plugin_sources`. These are local installation paths. Keep the package at
that location, or update both paths if relocating it. Other Apps can use the same
package; it is not copied or recompiled per App.

`plugins/lenso.console.web/default.toml` explicitly selects Console. Add an empty
`default.disabled` alongside it to disable Console and page compilation. The Host
may contain factories that an App does not select; they are not activated.

Custom native Rust Plugins require a different compatible precompiled Host, or
removing `development_host` and building from source with Cargo. Changed native
support source, unsupported targets and tampered binaries are rejected, without
silently falling back to Cargo. TS page edits do not change native support source.

This local package was validated on macOS ARM64. There is no registry publication
or downloadable multi-platform release implied by its existence.

The package also includes strict page-source type checking, nested
`layout.tsx` / `loading.tsx` / `error.tsx`, catch-all routes and optional
`console/services.ts`. See `packages/console-authoring/README.md` in this package for
exact APIs and authorization boundaries. The default starter is page-only.
The optional `service-example` implements `orders/read`, permitting order 42 and
rejecting other IDs, but needs a Host admitting the complete WorkspaceService role,
including Request and Stream. Verify the exact kit's admission and compiled
framework sources: pinning the Engine producer alone does not pin the independently
built native Host. The installed Console support facility declares the framework
source that Engine uses to unify that Host. Source compilation and helper
authorization tests do not prove runtime admission or production identity policy.
Do not remove contract operations to bypass admission.

The default no-Rust gate verifies the page-only kit. Set
`LENSO_CONSOLE_DEV_KIT_SERVICES=1` for the distinct full service gate against a
qualified Host; failure of that gate must remain visible in the review evidence.
