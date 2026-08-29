# Lenso Console

[![CI](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml)

Lenso Console is the local management and Agent workspace for one Lenso App.
The installable Service is one process: it starts a latest-generation Lenso
Agent Host, links a reviewed Plugin inventory, and serves the React Shell and
Agent HTTP/SSE surface from the same origin.

## Run

```sh
pnpm install
test -f service/.env || cp service/.env.example service/.env
pnpm service:serve
```

Open `http://127.0.0.1:3030`.

The Console Agent Home defaults to `~/.lenso/console/agent`. It is also a
standard Lenso App root: the Host Catalog lives at
`~/.lenso/console/agent/.lenso/host-catalog.json`, and its ordinary Plugin Root
is visible at `~/.lenso/console/agent/plugins`. The default App admits no
model-visible Tools; `ask_user` remains available as the web interaction
primitive.

The installed CLI can inspect the same App without Console-specific adapters:

```sh
lenso app check --root ~/.lenso/console/agent
lenso app show --root ~/.lenso/console/agent
lenso plugins list --root ~/.lenso/console/agent
```

Console and the CLI share that Plugin Root as their only App-owned
configuration. Console-authorized mutations are candidate-resolved before
write and are reconciled into a new immutable Generation by the embedded Host.

The local Host currently binds only to loopback. A remotely reachable Console
must first provide identity and authorization as reviewed vNext Plugins.

## Architecture

- `service`: the single Console launcher and same-origin web host.
- `src/routes`: Agent, Plugins, and Settings routes.
- `src/features/agent`: Agent conversation, trajectory, history, editing, and
  ask-user UI.
- `src/features/plugins`: installed Plugin inventory for the current App.
- `src/features/settings`: local Console and Agent policy settings.

System Registry, Runtime Story, Surface Gateway, generic managed-Service,
PostgreSQL migration, worker, deployment-recovery, and dynamic Console Module
composition are not part of this Host or its frontend source.

## Development

For Shell-only work with seeded frontend adapters:

```sh
pnpm dev
```

For hot reload against a running local Console Service:

```sh
VITE_CONSOLE_MODE=api \
VITE_CONSOLE_DEV_MODE=production \
VITE_API_BASE_URL=http://127.0.0.1:3030 \
pnpm dev
```

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm service:check
```

Repository operations notes live in
[docs/repository-operations.md](docs/repository-operations.md).
