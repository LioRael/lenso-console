# Lenso Console

[![CI](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml)

Console is an optional TypeScript Lenso plugin with a React Shell and page-authoring SDK.
TypeScript Lenso is the only supported runtime. Rust Hosts, native Agent bundles,
Cargo workspaces and precompiled development kits have been retired.

See [Contributing](CONTRIBUTING.md) for focused validation, fork and Issue handoffs,
optional Delta/AI/editor workflows, and candidate-first landing. Publication and
deployment require separate maintainer authorization.

## Ownership

- [`packages/console`](packages/console/README.md): the TypeScript plugin, Fetch
  service and explicit Auth/Manage integrations. The application owns its listener,
  service instances, configuration and authorization.
- [`packages/console-authoring`](packages/console-authoring/README.md): the public
  page SDK, compiler, typed service declarations, scaffold and page preview.
- `plugins/console/shell`: the browser application, built on Lenso UI.
- `examples/ts-console`: an application-owned local TS host with Engine discovery,
  loopback Web ingress, explicit Auth and SQLite locale persistence.
- `examples/app-console`: page/compiler source examples, not a runtime assembly.
- `tooling`: focused validation and SDK distribution.

Marketplace source and delivery belong to `LioRael/lenso-marketplace`, not Console.
Product and visual work follows the
[Console interaction direction](docs/design/console-interaction-direction.md).

## Install and develop

Use Bun 1.4.2 from `.bun-version` and Node from `.node-version` only at the
publisher and external npm-compatibility consumer boundary. Framework dependencies resolve from the public
registry; no sibling framework checkout or source-archive preparation is required:

```sh
bun install --frozen-lockfile
bun run dev
```

`bun run dev` is the Shell-only development loop. It does not start a backend.
For the application-owned local TypeScript host:

```sh
bun run service:ts:prepare
bun examples/ts-console/locale-store/migrate.ts .artifacts/ts-console/locale.sqlite
bun run service:ts
```

The locale command explicitly initializes or migrates the local database. Existing
schema version 1 data is preserved; unknown versions are rejected. If you configure
a different database path, pass that resolved path to the command. Serving never
automatically migrates the database. This local operator example is not a
production migration or multi-user authentication policy.

Preparation also compiles the existing authorization inspection page. The host
admits its owner-built assets and exact Manage operation; the Shell loads the page
only after session and catalog authorization.

Supply your own `LENSO_TS_TOKEN` in the process environment before serving.
Do not commit credentials. The local host defaults to `http://127.0.0.1:3100`;
see the [backend guide](packages/console/README.md) for authentication and
configuration. `bun run service:serve` prepares and runs that same TS host.
`bun run service:ts:dev` selects source imports; it never launches a native fallback.

For Shell hot reload against the local TS service:

```sh
VITE_CONSOLE_MODE=api VITE_CONSOLE_DEV_MODE=production \
VITE_API_BASE_URL=http://127.0.0.1:3100 bun run dev
```

The development server defaults to loopback and protects its diagnostics and
same-origin proxy. Remote development requires the explicit
`LENSO_CONSOLE_DEV_REMOTE_ORIGIN` opt-in; use it only on a trusted network.

## Checks

Read manifests and choose focused checks for your change:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test:local
bun run service:check
bun run sdk:check
bun run build:local
```

`bun run check` is the shared TS gate: tool versions, format/lint/type checks,
backend/SDK/Shell tests, builds, actual archive consumption and pinned Chromium
checks. It contains no Cargo, native binary download or legacy kit requirement.
Install Chromium with `bun --bun x --no-install playwright install chromium` for focused browser
checks. Alternate browser executables are diagnostic evidence, not full-gate proof.
Linux candidate CI remains authoritative; local checks do not prove deployment,
production data migration or package publication.
