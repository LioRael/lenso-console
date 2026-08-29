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

The private Console Agent Home defaults to `~/.lenso/console/agent`. The App
being managed is a separate root selected with `LENSO_APP_ROOT`, defaulting to
the launcher directory. The Console Agent admits no model-visible Tools by
default; `ask_user` remains available as the web interaction primitive.

The installed CLI can inspect the same App without Console-specific adapters:

```sh
lenso app check --root <managed-app>
lenso app show --root <managed-app>
lenso plugins list --root <managed-app>
```

Console and the CLI share the managed App's ordinary Plugin Root.
Console-authorized mutations are candidate-resolved before files are changed.

The local Host currently binds only to loopback. A remotely reachable Console
must first provide identity and authorization as reviewed vNext Plugins.

## Architecture

- `service`: the `lenso.console.web` lifecycle Plugin, reusable Console Surface,
  and thin standalone launcher.
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
