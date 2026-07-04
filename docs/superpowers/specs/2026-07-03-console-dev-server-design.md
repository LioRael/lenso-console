# Console Dev Server Design

**Date:** 2026-07-03
**Status:** Approved design, pending written-spec review
**Primary repo:** `lenso-runtime-console`
**Related repos:** `lenso-cli`, `lenso`, module repos such as `lenso-auth-module`

---

## Goal

Give module authors a `next dev`-style workflow for Runtime Console packages:
they should be able to edit a console package, see it inside the real Lenso
Runtime Console shell immediately, and switch between mock host data and a real
local Lenso host.

The target experience is:

```sh
lenso console dev
lenso console dev --package packages/auth-console
lenso console dev --host http://localhost:3000

lenso module dev --console
lenso module dev --console --host http://localhost:3000
```

Default mode is standalone mock shell. Passing `--host` connects the same dev
shell to a real Lenso host while continuing to load the local package bundle.

## Context

Runtime Console already has the right production extension shape:

- `console-surface.json` describes package/export/routes/capabilities.
- `@lenso/runtime-console-api` is the host facade for packages.
- Runtime bundles are loaded through `/console/extensions/registry.json`.
- The backend serves same-origin extension bundles from
  `.lenso/console/extensions`.
- The CLI and admin APIs already know how to copy built console bundles and
  update the extension registry during installs.

The current authoring problem is not protocol absence. It is the feedback loop:
authors write React, manifest JSON, package config, and sometimes Rust metadata
without seeing the surface inside the shell until after packaging or host
registration work.

## Non-Goals

- No drag-and-drop UI builder.
- No browser-side package installation.
- No marketplace trust, signatures, payments, or package review flow.
- No automatic publishing to npm or jsdelivr.
- No new arbitrary global bridge; packages continue to use
  `@lenso/runtime-console-api`.
- No replacement for the production install path. Dev mode must exercise the
  same runtime-bundle contract production uses.

## Key Decisions

| Decision          | Choice                                                     | Why                                                                                       |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Core product      | Dev server, not visual builder                             | The pain is seeing and debugging code in context, not generating all UI.                  |
| Default data mode | Mock host shell                                            | Fast first run; no Postgres/API setup required.                                           |
| Real host mode    | `--host <url>` proxy                                       | Authors can verify real data, capabilities, and module metadata when needed.              |
| Loading mechanism | Temporary runtime bundle registry                          | Reuses the production `/console/extensions/registry.json` contract.                       |
| Discovery         | Support package directory and module repo root             | Package authors and module authors both get natural entrypoints.                          |
| Multiple packages | One shell, multiple local bundles                          | A module repo can expose several surfaces without port sprawl.                            |
| Ownership         | Runtime Console owns shell/dev UI; CLI owns command facade | Keeps package preview behavior near package API while preserving public `lenso` commands. |

## User Experience

### Package Directory

When run inside a console package directory, `lenso console dev` discovers:

- nearest `package.json`;
- `console-surface.json` from the package or `package.json#lenso.console.surface`;
- Vite build config when present;
- package export name and bundle output names.

It starts a local dev shell and prints:

```text
Lenso Console Dev
Package: @lenso/auth-console
Surface: /data/auth/users
Mode: mock
Console: http://localhost:5174/console/dev
```

### Module Repository Root

When run from a module repo root, `lenso module dev --console` discovers console
packages by scanning package workspaces and known package shapes:

- `packages/*/console-surface.json`;
- `package.json#lenso.console`;
- package names ending in `-console`;
- optional Rust manifest snippets only for diagnostics, not for rendering.

If multiple packages are found, the dev shell loads all of them and provides a
small dev-only package/surface switcher. The normal Runtime Console navigation
also renders from the package manifests, so authors see real workspace and
navigation placement.

### Real Host Mode

`--host http://localhost:3000` keeps the local bundle override but proxies host
API calls to the real service:

- `/admin/data/*`
- `/admin/runtime/*`
- `/admin/config/*`
- module metadata and capabilities endpoints

The local bundle wins over a matching real host bundle with the same
`packageName#exportName`. This lets authors debug an already-installed module
without uninstalling the production bundle.

## Architecture

Add a narrow dev orchestration layer with four units.

### 1. Package Discovery

`console-package-dev-discovery` resolves dev targets:

- input cwd plus optional `--package`;
- package manifest;
- console surface contract;
- bundle entry, style output, and export name;
- package source mode: local package or module repo package.

Discovery returns structured diagnostics instead of throwing early whenever
possible, so the shell can show actionable errors.

### 2. Bundle Watcher

`console-package-dev-bundler` builds each package in watch mode.

The first implementation should prefer the package's existing Vite config. If a
package has no config, it can use the standard Runtime Console package defaults:

- library entry `src/index.tsx`;
- ESM output;
- React, `react/jsx-runtime`, and `@lenso/runtime-console-api` externalized to
  `/console/extensions/host/*`;
- CSS output loaded through the registry.

The watcher writes bundle assets to a temporary dev extension directory, not to
the host's `.lenso/console/extensions` directory.

### 3. Dev Registry

`console-package-dev-registry` writes a transient registry:

```json
{
  "version": 1,
  "bundles": [
    {
      "moduleName": "auth",
      "packageName": "@lenso/auth-console",
      "exportName": "authConsoleModule",
      "entry": "/console/extensions/dev/auth-console.js",
      "hostApi": "1",
      "styles": ["/console/extensions/dev/auth-console.css"],
      "requiredCapabilities": ["auth.users.read"]
    }
  ]
}
```

The dev shell points the existing runtime bundle loader at this registry. No
separate package mounting path is added.

### 4. Dev Shell

`console-package-dev-shell` starts the Runtime Console app with a dev overlay.

The shell must use the existing router, navigation, runtime bundle loader, and
host facade. It may add dev-only UI for:

- package/surface switcher;
- current mode: mock or real host;
- diagnostics;
- fixture selector;
- open route buttons.

The dev overlay should not appear in production builds.

## Host API Modes

### Mock Mode

Mock mode provides a local implementation of `runtimeConsoleHostApi` backed by
fixtures. It should support the host facade groups used by current packages:

- `adminData.useRecords`;
- `adminData.useInvokeAction`;
- `config.useValues`;
- `config.useWriteValue`;
- `capabilities.useAvailable`;
- `contributions.useSlot`;
- `modules.useMetadata`;
- routing and common UI helpers.

Fixture lookup is convention-based:

```text
fixtures/console/
  capabilities.json
  modules.json
  config-values.json
  admin-data/<module>/<entity>.json
  contributions/<slot-id>.json
```

If a fixture is absent, mock mode returns empty successful data plus a
diagnostic. Authors can still see empty states without first writing fixtures.

### Real Host Mode

Real host mode proxies API requests to `--host`. It should not copy bundles into
the real host and should not modify `.lenso` state.

The proxy injects no admin token by default. If the host requires auth, authors
can pass an explicit header/token option later. First implementation can support
an environment variable such as `LENSO_CONSOLE_DEV_AUTH_TOKEN` because the
existing Runtime Console already accepts token-style local development.

## Diagnostics

Diagnostics are part of the product, not just terminal logs. The dev shell
should show:

- `console-surface.json` parse errors;
- missing `packageName`, `exportName`, or route;
- unsupported `hostApi`;
- missing exported console module;
- bundle import failures;
- CSS load failures;
- capability filters hiding a surface;
- route collisions;
- package manifest and Rust `ModuleManifest.console` mismatch when detectable;
- real host proxy failures.

Diagnostics should be available in the browser and mirrored to terminal output.
Terminal output remains concise, with detailed stack traces behind `--verbose`.

## Data Flow

Mock mode:

```text
author edits package
  -> package watcher rebuilds JS/CSS
  -> temp registry points to rebuilt assets
  -> Runtime Console dev shell reloads bundle
  -> package calls runtimeConsoleHostApi
  -> mock adapter returns fixture data
  -> diagnostics update in shell
```

Real host mode:

```text
author edits package
  -> package watcher rebuilds JS/CSS
  -> temp registry points to rebuilt local assets
  -> Runtime Console dev shell reloads bundle
  -> package calls runtimeConsoleHostApi
  -> dev proxy forwards host API calls to --host
  -> local bundle renders against real data
```

## CLI Surface

The public command surface belongs in `lenso-cli`:

```sh
lenso console dev [--package <path>] [--host <url>] [--port <port>] [--open]
lenso module dev --console [--host <url>] [--port <port>] [--open]
```

The CLI should delegate the implementation to the Runtime Console dev package
where possible. In local repo development, this can call the sibling
`lenso-runtime-console` script. In published use, it can resolve an installed
Runtime Console dev runner.

The Runtime Console repo should also expose a package-local script for direct
development:

```sh
pnpm console-package:dev --package ../lenso-auth-module/packages/auth-console
```

That script is not the long-term public UX; it is the repo-local implementation
entrypoint used by the CLI.

## Testing

Focused tests should cover each unit.

Runtime Console:

- discovery tests for package cwd, explicit `--package`, module repo root, and
  multiple packages;
- registry generation tests;
- bundle loader tests for local dev registry precedence;
- mock host API tests for empty fallback and fixture-backed records;
- diagnostics model tests;
- router/navigation tests showing dev-loaded surfaces appear in workspaces;
- browser smoke test for one sample package in mock mode.

CLI:

- argument parsing for `lenso console dev`;
- argument parsing for `lenso module dev --console`;
- delegation command construction;
- clear error when no console package is found.

Backend/host:

- no first-slice backend changes are required.
- real host mode should be validated with an integration smoke after the dev
  proxy exists.

## Rollout Plan

1. Runtime Console internal dev runner:
   - package discovery;
   - temp registry;
   - mock host adapter;
   - one-package dev shell.
2. Multi-package module root discovery and package/surface switcher.
3. Real host proxy mode.
4. `lenso-cli` command facade.
5. Docs and examples using `lenso-auth-module` or another package-backed module.

Each step must preserve the production bundle contract and should be usable
without creating or modifying host `.lenso` state.

## Success Criteria

- A module author can run one command from a console package directory and see
  the package inside Runtime Console with mock data.
- A module author can run one command from a module repo root and see all local
  console packages.
- Editing package React code updates the browser without manual packaging.
- Editing `console-surface.json` updates route/navigation diagnostics and, when
  possible, the displayed route.
- Passing `--host` renders the same local bundle against a real Lenso host.
- Common failure cases are visible in the browser with actionable diagnostics.
- The dev path and install path both use the same runtime bundle registry shape.
