# Console Shell

`shell/` owns the React browser application and its independent package version.
Lenso UI is the base component library. UI work follows the
[Console interaction direction](../../docs/design/console-interaction-direction.md).

The supported backend is the [TypeScript Console plugin](../../packages/console/README.md).
This directory no longer contains a Rust Console provider, Cargo build script,
native Host or Agent launcher.

From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
bun run typecheck
bun run test:local
bun run build:local
```

The home remains empty. Plugin pages require admission by an authenticated,
application-owned TS backend; development mode does not fabricate product data
or grant authorization.
See [the root guide](../../README.md) for TS serving and focused checks.
