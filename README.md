# Lenso Console

[![CI](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml)

Operator-facing System Plane for one Lenso System. This repository owns the
independently installed Console Service, its React Shell, and Console Module UI
contracts.

The console runs with seeded data by default, and switches core runtime views to the
local backend when `VITE_RUNTIME_CONSOLE_MODE=api` and `VITE_API_BASE_URL` are set.

## Repository shape

- Lenso Console: this repository owns the standalone Lenso Service, Console Shell,
  System Registry Module, Console package host, and delivery gates.
- Lenso framework: [`LioRael/lenso`](https://github.com/LioRael/lenso) owns the
  public framework and host crates consumed by the Console Service.

Keep both repositories checked out as siblings for backend-backed Console work:

```text
framework/
  lenso/
  lenso-console/
```

Repository operations notes, including branch protection and backend checkout
secrets, live in [docs/repository-operations.md](docs/repository-operations.md).

Local API calls use a development service token. The backend accepts this token
only in local/development environments; configured API deployments should provide
their own `VITE_API_AUTH_TOKEN`.

```text
Authorization: Bearer dev-service:admin:runtime.stories.read,remote_crm.contacts.read,remote_crm.contacts.sync,hello-action:greetings:write
```

## Run the Console Service

```bash
pnpm install
cp service/.env.example service/.env
docker compose --env-file service/.env -f service/docker-compose.yml up -d postgres
pnpm service:migrate
pnpm service:serve
```

Open:

```text
http://localhost:3030
```

For the container installation path, including the migration-first Compose stack,
see [service/README.md](service/README.md).

## Shell development

Run Vite separately when working on the Shell with hot reload:

```bash
VITE_RUNTIME_CONSOLE_MODE=api VITE_API_BASE_URL=http://localhost:3030 pnpm dev
```

The production build always uses `/` because the Shell and Console API share one
origin. The retired hosted archive and `/console/` embedding path are unsupported.

Override the development service token when needed:

```bash
VITE_API_AUTH_TOKEN=dev-service:admin:runtime.stories.read,remote_crm.contacts.read,remote_crm.contacts.sync,hello-action:greetings:write pnpm dev
```

## Service API QA

From the repo root, start the legacy service API QA fixture:

```bash
just console-api-demo
```

Then seed and verify the remote story path:

```bash
just console-api-qa
```

Useful focused commands:

```bash
just console-api-fixture
just console-api-smoke
```

The QA fixture creates a remote proxy call with
`correlation_id = corr_console_api_fixture`, then verifies the Remote Calls page
data, Runtime Story remote node/timeline shape, Technical Operations, payloads,
and logs.

If Postgres is already running and migrated:

```bash
SKIP_DB_SETUP=1 just console-api-demo
```

If default ports are busy:

```bash
REMOTE_MODULE_ADDR=127.0.0.1:4101 HTTP_PORT=3001 VITE_API_BASE_URL=http://localhost:3001 CONSOLE_PORT=5176 just console-api-demo
```

## Architecture

- `src/app`: router and root providers.
- `src/components/ui`: small Tailwind-composed primitives.
- `src/components/runtime`: Console Shell, search, command palette, drawer, timeline nodes.
- `src/data`: seeded mock runtime data.
- `src/hooks`: keyboard and runtime query hooks with API/mock switching.
- `src/lib`: formatting, query client, and ky HTTP client foundation.
- `src/pages`: route-level screens.
- `packages/console-package-api`: public host API for console package authors.
- `packages/story-console`: first-party Story workbench package.
- `service/modules/story`: Console-owned Story backend, federation, projections,
  and Store migrations released with the Story workbench.
- `packages/identity-console`: installed module package fixture used to exercise
  framework wiring; it is not a product-default business module.

## Console Packages

Console frontend modules are local workspace packages under `packages/*`.
They must import host capabilities through `@lenso/console-package-api`, define a
`ConsolePackageManifest`, and export a `ConsoleModule`.

Lenso provides the package framework and fixtures. Product projects choose and
own their real business modules.

Generate a linked Rust module scaffold first when starting a new project module:

```bash
pnpm create:module billing
```

This creates `modules/billing`, adds it to the Rust workspace, and registers it
in `crates/app-bootstrap` as a linked module.

Add `--with-console` to generate and register the matching Console
package in the same command:

```bash
pnpm create:module billing --with-console
```

For a third-party service that should not compile into the host workspace, use
the service kit, register the local workspace entry, and install the service
manifest:

```bash
lenso service create support-suite-provider --lang ts --output-dir services --port 4110
lenso service dev
lenso service install https://example.com/lenso/service/v1/manifest
```

Run `pnpm demo:remote-module-package` for the legacy temp-directory remote
module fixture. The older `pnpm demo:remote-module-install` command is kept as
an alias.

Runnable service examples that use the published `@lenso/service-kit` package
live in
[LioRael/lenso-examples](https://github.com/LioRael/lenso-examples). The demos
in this repository remain release and CLI fixtures for the Lenso Console
workspace.

See `docs/console-package-template.md` before adding a package. The short path is:

1. Add `packages/<name>/package.json`.
2. Define `src/manifest.ts` with `defineConsolePackageManifest`.
3. Export `<name>ConsoleModule` from `src/index.tsx`.
4. Register the package in host dependencies, test includes, manifest exports, and module export mapping.
5. Run `pnpm check:console-packages`, `pnpm install --lockfile-only`, and `pnpm check`.

For the standard workspace package shape, generate the frontend skeleton and host
registration with:

```bash
pnpm create:console-package billing
```

The underlying CLI command is:

```bash
lenso console package create billing
```

The generator also writes `console-surface.json` and `console-surface.rs` so the
frontend manifest and Rust `ModuleManifest.console` declaration can share the
same package/export/route/capability values.

### Console Package Dev Server

Use the local dev shell to preview a package inside Lenso Console while
editing it:

```bash
pnpm console-package:dev --package ../lenso-auth-module/packages/auth-console
```

The default mode is standalone mock mode. It starts the Lenso Console Shell,
loads the package through a temporary `/console/dev/registry.json`, and serves
the package bundle from a temporary `/console/dev/extensions/*` path.

Proxy a real Lenso host when the package needs real admin data or capabilities:

```bash
pnpm console-package:dev \
  --package ../lenso-auth-module/packages/auth-console \
  --host http://localhost:3000
```

Dev mode does not install packages into the host. Production Console packages
are composed and delivered by the Console Service release.

## Checks

The console uses Ultracite with the Oxlint/Oxfmt provider:

- `oxlint.config.ts` extends `ultracite/oxlint/core`, `ultracite/oxlint/react`, and `ultracite/oxlint/tanstack`.
- `oxfmt.config.ts` extends `ultracite/oxfmt`.
- No ESLint, Prettier, or Biome stack is configured.

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm check:console-packages
pnpm typecheck
pnpm build
pnpm check
```
