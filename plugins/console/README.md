# Console Shell

`shell/` owns the React browser application and its independent package version.
Lenso UI is the base component library. UI work follows the
[Console interaction direction](../../docs/design/console-interaction-direction.md).

The supported backend is the [TypeScript Console plugin](../../packages/console/README.md).
This directory no longer contains a Rust Console provider, Cargo build script,
native Host or Agent launcher.

From the repository root:

```sh
pnpm framework:prepare
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test:local
pnpm build:local
```

`pnpm dev` uses mock data unless explicitly configured for an application-owned
TS backend. It does not establish backend feature availability or authorization.
See [the root guide](../../README.md) for TS serving and focused checks.
