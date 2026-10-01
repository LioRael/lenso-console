# Embed the Console Plugin

This App uses the Lenso revision pinned in the repository's root `Cargo.toml`.
Its own `Health` Plugin serves `/health`. Console adds the Shell and management
transport through its ordinary generated factory and Plan-bound ports:

```rust
use lenso_console_plugin::ConsolePlugin;
use lenso_web_host::NativeWebHost;

let host = NativeWebHost::new()
    .plugin::<Health>()
    .plugin::<ConsolePlugin>();
```

The Host owns listener configuration and App selection. Console owns its routes
and page contribution ports. Neither `Health` nor the Host imports the reference
`lenso-console-app` assembly or any concrete business provider. Console's default
configuration has no Agent and no management authority. This example explicitly
binds a trusted local listener to `127.0.0.1`; it is not a remote management
authentication profile.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm plugin:dev
# http://127.0.0.1:3031/ and /health
```

Stop that process before starting the removal variant on the same port:

```sh
pnpm plugin:without-console
# /health remains available; / returns 404
```

`pnpm plugin:check` builds the real Shell, checks the dependency boundary, then
tests both Cargo feature compositions with the real native Adapter and HTTP listener. The
test verifies the Shell response, health behavior, clean shutdown, and health
after Console removal. The `console` feature owns the optional dependency. Disabling default features
removes Console from the linked catalog as well as the App selection.

At the pinned framework revision, `NativeWebHost` infers a required slot for
each unique linked Plugin slot. Omitting `.plugin::<ConsolePlugin>()` while
keeping that dependency linked fails Plan validation. This example therefore
proves build-time removal, not runtime disabling with that convenience Host.
Hosts needing runtime selection must provide an explicit optional Host Catalog.

`embedded-shell` needs the frontend assets built before Cargo compilation. The
commands above prepare them explicitly. This is a source consumer example,
not a registry publication or an immutable Plugin bundle. The precompiled
development kit is a separate distribution with its own producer toolchain.
