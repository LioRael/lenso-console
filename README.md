# Lenso Console

[![CI](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml)

Operator-facing System Plane for one Lenso System. This repository owns the independently installed Console Service, its React Shell, and Console Module UI contracts.

The console runs with seeded data by default, and switches core runtime views to the local backend when `VITE_CONSOLE_MODE=api` and `VITE_API_BASE_URL` are set.

## Repository shape

- Lenso Console: this repository owns the standalone Lenso Service, prebuilt Console Shell, ESM UI artifact host, and delivery gates.
- Lenso framework: [`LioRael/lenso`](https://github.com/LioRael/lenso) owns the public framework and host crates consumed by the Console Service.

Keep both repositories checked out as siblings for backend-backed Console work:

```text
framework/
  lenso/
  lenso-console/
```

Repository operations notes, including branch protection and backend checkout secrets, live in [docs/repository-operations.md](docs/repository-operations.md).

Local API calls use a development service token. The backend accepts this token only in local/development environments; configured API deployments should provide their own `VITE_API_AUTH_TOKEN`.

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

For the container installation path, including the migration-first Compose stack, see [service/README.md](service/README.md).

## Shell development

Run TanStack Start (through Vite) separately when working on the Shell with hot reload. `bun dev` and `pnpm dev` use the seeded mock Console by default:

```bash
bun dev
```

To use the local Console Service instead, explicitly enable API mode and turn off the mock host:

```bash
VITE_CONSOLE_MODE=api VITE_CONSOLE_DEV_MODE=production VITE_API_BASE_URL=http://localhost:3030 bun dev
```

The production build always uses `/` because the Shell and Console API share one origin. The retired hosted archive and `/console/` embedding path are unsupported.

Override the development service token when needed:

```bash
VITE_API_AUTH_TOKEN=dev-service:admin:runtime.stories.read,crm_service.contacts.read,crm_service.contacts.sync,hello-action:greetings:write pnpm dev
```

## Architecture

- `src/routes` and `src/router.tsx`: TanStack Start SPA file routes, document shell, and the single router factory; `src/app`: root providers, route lifecycle states, and Console Module runtime seams.
- `src/app/dynamic-console-module.tsx`: receipt-bound ESM Module loader and route host.
- `src/app/console-module-runtime.ts`: same-origin ESM Module UI receipt validation and loader.
- `src/components/ui`: small StyleX-composed primitives.
- `src/components/runtime`: Console Shell, search, command palette, drawer, timeline nodes.
- `src/data`: seeded mock runtime data.
- `src/hooks`: keyboard and runtime query hooks with API/mock switching.
- `src/lib`: formatting, query client, and ky HTTP client foundation.
- `src/features`: route-level Console screens and product data.
- `src/pages`: shared page models and test fixtures.
- `packages/console-module-api`: public framework-neutral Module contract.
- `packages/console-ui`: public React adapter and shared Module UI primitives.
- `packages/story-console`: linked Runtime Stories Console Module UI.
- `service/modules/story`: Console-owned Story backend, federation, projections, and Store migrations released with the Story workbench.
- `packages/system-registry-console`: linked mandatory System Registry Console Module UI.

### Plugin Workbench v1

`/plugins` is the first read-only Console slice for a Lenso Host. It answers a
small operator question: which immutable App Generation is active, which exact
Plugin packages and receipts it contains, and whether new evidence is still
arriving. It does not install, switch, drain, or roll back a Generation.

The browser reads one versioned snapshot from
`GET /api/console/v1/plugin-workbench`, then connects to the same-origin stream
path returned by that snapshot. The stream uses `text/event-stream` and emits
`workbench.snapshot` envelopes carrying the full
`lenso.console.plugin-workbench.v1` projection. The Browser client uses
streaming `fetch` so it can preserve the Console bearer token and
`Last-Event-ID`; malformed or future-version projections are ignored.

The production endpoint is intended to be a Host-owned Console projection
Module bound to `lenso-web`'s `lenso.http.endpoint@1` snapshot route and
`lenso.http.sse-endpoint@1` event route. Console owns presentation and
read-model semantics; `lenso-web` owns the HTTP listener and SSE transport; the
Host remains the only Generation authority. The Vite development middleware
provides a clearly labeled demo stream and proxies a configured Host response
incrementally rather than buffering it.

## Module Console UI

The intended installable Module path binds an immutable `console_ui_esm` UI artifact to the same Module Release. The prebuilt Console Shell validates its receipt, verifies the public Module manifest, and dynamically imports the same-origin ESM entry without rebuilding the Shell. `@lenso/console-module-api` and `@lenso/console-ui` are the authoring boundary for that path.

The authenticated `POST /api/console/v1/artifacts/reconcile` endpoint downloads reviewed `console_ui_esm` artifacts, verifies their SHA-256 digests and public Module manifest, and materializes content-addressed objects plus an atomic composition receipt. The prebuilt Shell reads that receipt and dynamically imports the declared same-origin ESM entry; Module UI is never compiled into the Shell release.

Generate a Module and its Console UI artifact scaffold with the framework CLI:

```bash
lenso module create billing --with-console-ui
```

For a Service-delivered Module, use the framework-owned Service SDK and ordinary Module lifecycle commands:

```bash
lenso service create support-suite --lang ts --output-dir services --port 4110
lenso service dev
lenso module install <module-release-reference>
```

Runnable third-party Service examples use the framework-owned `@lenso/service-kit` package and live in [LioRael/lenso-examples](https://github.com/LioRael/lenso-examples). Use `lenso module dev --console-ui` to preview UI through the same ESM entry contract used by a materialized release.

Business Module repositories own their Business API contracts, generated Surface clients, and `console_ui_esm` builds. This repository builds only Console-owned platform Module artifacts; it consumes external artifacts through the same receipt-bound reconciliation API.

Build first-party UI artifacts only when the reviewed Module Release digests are available; the command refuses to invent release identity:

```bash
LENSO_MODULE_RELEASE_DIGESTS='{"lenso/platform-story":"sha256:<64-hex>","lenso/system-registry":"sha256:<64-hex>"}' \
  pnpm build:module-artifacts
```

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
