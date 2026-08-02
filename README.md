# Lenso Console

[![CI](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml)

Operator-facing System Plane for one Lenso System. This repository owns the
independently installed Console Service, its React Shell, and Console Module UI
contracts.

The console runs with seeded data by default, and switches core runtime views to the
local backend when `VITE_CONSOLE_MODE=api` and `VITE_API_BASE_URL` are set.

## Repository shape

- Lenso Console: this repository owns the standalone Lenso Service, Console Shell,
  System Registry Module, isolated UI artifact host, and delivery gates.
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
Authorization: Bearer dev-service:admin:runtime.stories.read,crm_service.contacts.read,crm_service.contacts.sync,hello-action:greetings:write
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
VITE_CONSOLE_MODE=api VITE_API_BASE_URL=http://localhost:3030 pnpm dev
```

The production build always uses `/` because the Shell and Console API share one
origin. The retired hosted archive and `/console/` embedding path are unsupported.

Override the development service token when needed:

```bash
VITE_API_AUTH_TOKEN=dev-service:admin:runtime.stories.read,crm_service.contacts.read,crm_service.contacts.sync,hello-action:greetings:write pnpm dev
```

## Architecture

- `src/app`: router and root providers.
- `src/app/isolated-console-module.tsx`: digest-bound sandbox and Console Bridge host.
- `src/components/ui`: small Tailwind-composed primitives.
- `src/components/runtime`: Console Shell, search, command palette, drawer, timeline nodes.
- `src/data`: seeded mock runtime data.
- `src/hooks`: keyboard and runtime query hooks with API/mock switching.
- `src/lib`: formatting, query client, and ky HTTP client foundation.
- `src/pages`: route-level screens.
- `packages/console-ui-internal`: private UI primitives for the Shell and linked
  Console Modules; it is not an authoring or runtime extension SDK.
- `packages/console-bridge`: the public protocol used by isolated Module UI.
- `packages/story-console`: linked Runtime Stories Console Module UI.
- `service/modules/story`: Console-owned Story backend, federation, projections,
  and Store migrations released with the Story workbench.
- `packages/system-registry-console`: linked mandatory System Registry Console
  Module UI.

## Module Console UI

Installable Modules may bind an immutable isolated `ConsoleUiArtifact` to the
same Module Release. The authenticated
`POST /api/console/v1/artifacts/reconcile` endpoint downloads reviewed
artifacts, verifies their SHA-256 digests and Console Bridge contract, and
materializes content-addressed objects plus an atomic composition receipt.
Container deployments give only the Console Service write access to this
persistent artifact store. Executable UI is never dynamically imported as a
same-origin Shell extension. The artifact has no independent product identity
or version: its Module ID, Module Release digest, artifact digest, semantic
entries, requested permissions, and Bridge revision are verified together.

The private `@lenso/console-ui-internal` workspace is only for linked Modules
owned by this Console Service. External Module UI communicates exclusively
through `lenso.console-bridge.v1` and the exact permissions granted by the
reviewed Console composition.

Generate a Module and its Console UI artifact scaffold with the framework CLI:

```bash
lenso module create billing --with-console-ui
```

For a Service-delivered Module, use the framework-owned Service SDK and ordinary
Module lifecycle commands:

```bash
lenso service create support-suite --lang ts --output-dir services --port 4110
lenso service dev
lenso module install <module-release-reference>
```

Runnable third-party Service examples use the framework-owned
`@lenso/service-kit` package and live in
[LioRael/lenso-examples](https://github.com/LioRael/lenso-examples). Use
`lenso module dev --console-ui` to preview UI through the same isolated Bridge
boundary used by a materialized release.

## Checks

The console uses Ultracite with the Oxlint/Oxfmt provider:

- `oxlint.config.ts` extends `ultracite/oxlint/core`, `ultracite/oxlint/react`, and `ultracite/oxlint/tanstack`.
- `oxfmt.config.ts` extends `ultracite/oxfmt`.
- No ESLint, Prettier, or Biome stack is configured.

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm check
```
