# Lenso Runtime Console

[![CI](https://github.com/LioRael/lenso-runtime-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-runtime-console/actions/workflows/ci.yml)

Frontend workspace for the Lenso Runtime Console.

The console runs with seeded data by default, and switches core runtime views to the
local backend when `VITE_RUNTIME_CONSOLE_MODE=api` and `VITE_API_BASE_URL` are set.

## Repository Pair

- Runtime Console: this repository owns the React/Vite frontend, console package host, module console package fixtures, and Runtime Console quality gate.
- Backend platform: [`LioRael/lenso`](https://github.com/LioRael/lenso) owns the admin APIs, module manifests, contracts, and generated TypeScript SDK consumed here.

Keep both repositories checked out as siblings for backend-backed Console work:

```text
framework/
  lenso/
  lenso-runtime-console/
```

Repository operations notes, including branch protection and backend checkout
secrets, live in [docs/repository-operations.md](docs/repository-operations.md).

Local API calls use a development service token. The backend accepts this token
only in local/development environments; configured API deployments should provide
their own `VITE_API_AUTH_TOKEN`.

```text
Authorization: Bearer dev-service:admin:runtime.stories.read,remote_crm.contacts.read,remote_crm.contacts.sync,hello-action:greetings:write
```

## Run

```bash
pnpm install
pnpm dev
```

Open:

```text
http://localhost:5174
```

## Backend Wiring

Start the backend and worker from the sibling `../lenso` repository:

```bash
cd ../lenso
just db-up
just migrate
just api
just worker
```

Run the console against the local API:

```bash
cd ../lenso-runtime-console
VITE_RUNTIME_CONSOLE_MODE=api VITE_API_BASE_URL=http://localhost:3000 pnpm dev
```

Package the hosted console artifact consumed by `lenso console update`:

```bash
LENSO_CONSOLE_BASE=/console/ pnpm build:local
pnpm package:hosted-console
```

The publish workflow uploads `lenso-runtime-console.tar.gz` to the Runtime
Console GitHub Release. Hosts install it under `.lenso/console`.

Override the development service token when needed:

```bash
VITE_API_AUTH_TOKEN=dev-service:admin:runtime.stories.read,remote_crm.contacts.read,remote_crm.contacts.sync,hello-action:greetings:write pnpm dev
```

## Service API QA

From the repo root, start a full service Runtime Console demo:

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
- `src/components/runtime`: Runtime Console shell, search, command palette, drawer, timeline nodes.
- `src/data`: seeded mock runtime data.
- `src/hooks`: keyboard and runtime query hooks with API/mock switching.
- `src/lib`: formatting, query client, and ky HTTP client foundation.
- `src/pages`: route-level screens.
- `packages/console-package-api`: public host API for console package authors.
- `packages/story-console`: first-party Story workbench package.
- `packages/identity-console`: installed module package fixture used to exercise
  framework wiring; it is not a product-default business module.

## Console Packages

Runtime Console frontend modules are local workspace packages under `packages/*`.
They must import host capabilities through `@lenso/runtime-console-api`, define a
`ConsolePackageManifest`, and export a `ConsoleModule`.

Lenso provides the package framework and fixtures. Product projects choose and
own their real business modules.

Generate a linked Rust module scaffold first when starting a new project module:

```bash
pnpm create:module billing
```

This creates `modules/billing`, adds it to the Rust workspace, and registers it
in `crates/app-bootstrap` as a linked module.

Add `--with-console` to generate and register the matching Runtime Console
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
in this repository remain release and CLI fixtures for the Runtime Console
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

Use the local dev shell to preview a package inside Runtime Console while
editing it:

```bash
pnpm console-package:dev --package ../lenso-auth-module/packages/auth-console
```

The default mode is standalone mock mode. It starts the Runtime Console shell,
loads the package through a temporary `/console/dev/registry.json`, and serves
the package bundle from a temporary `/console/extensions/dev/*` path.

Proxy a real Lenso host when the package needs real admin data or capabilities:

```bash
pnpm console-package:dev \
  --package ../lenso-auth-module/packages/auth-console \
  --host http://localhost:3000
```

Dev mode does not write `.lenso/console/extensions` and does not install
packages into the host. Production installs still use the normal service/module
install path.

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
