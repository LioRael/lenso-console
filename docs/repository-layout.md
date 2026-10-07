# Repository layout

Console owns its production infrastructure, public contracts, authoring SDK and
reference Host. Plugin authors consume released packages; they do not copy this
repository's infrastructure or need a Console checkout for page preview.

| Directory | Owner |
| --- | --- |
| `plugins/console/` | Console backend, configuration and tests; `shell/` is the only maintained Shell source |
| `plugins/assistant/console/` | Assistant browser contribution |
| `plugins/observe/console/` | Observe browser contribution and its module types |
| `contracts/<contract>/` | Cross-Plugin public Descriptor, schemas and generated projections |
| `packages/console-authoring/` | `@lenso/console-sdk`: public SDK, compiler, scaffolding and preview |
| `packages/console-support/` | Native authoring support |
| `packages/agent-turn-relay/`, `packages/local-agent-launcher/` | Private stream and process support, with independent responsibilities |
| `packages/console/`, `packages/agent/` | Existing production launcher packages |
| `apps/reference-host/` | Production example binaries and development Host assembly entry |
| `tooling/checks/` | Repository validation and development-loop checks |
| `tooling/distribution/` | Build preparation, packaging, distribution checks and smoke tests |
| `examples/` | Consumer application examples |
| `docs/` | Design, authoring and release documentation |

## Ordinary installation and preview

See the [SDK instructions](../packages/console-authoring/README.md) for installation,
page declarations and optional example services. From an installed Plugin:

```sh
./node_modules/.bin/lenso-console-author init ./console
./node_modules/.bin/lenso-console-author check --entry ./console
./node_modules/.bin/lenso-console-author build --entry ./console
./node_modules/.bin/lenso-console-author dev --entry ./console --open
```

React and ReactDOM in the consumer must have matching versions, as enforced by
the preview runtime. Page-only preview requires Node and Bun, not Rust. Backend
mode uses the compatible backend's public bootstrap and retains login,
authorization, Origin and CSRF checks.

Maintainers build the same Shell into production assets and stage generated
preview source inside the same-version SDK:

```sh
pnpm install --frozen-lockfile
pnpm sdk:prepare
```

`tooling/distribution/prepare-sdk-shell.mjs` stages the built assets;
`prepare-sdk-preview.mjs` derives the preview closure from
`plugins/console/shell/src`. Neither output is independently maintained.
The SDK's existing `./shell` export and its packaged paths remain unchanged.
The development Host packager consumes the same production assets. Publication
still requires the [release process](release-process.md).

## Migration mapping

| Previous directory | Current directory |
| --- | --- |
| `apps/shell/` | `plugins/console/shell/` |
| `plugins/assistant/web/` | `plugins/assistant/console/` |
| `plugins/observe/workspace.{mjs,css,d.mts}` | `plugins/observe/console/workspace.{mjs,css,d.mts}` |
| `contracts/crates/<contract>/` | `contracts/<contract>/` |
| `packages/console-runtime/agent-turn-relay/` | `packages/agent-turn-relay/` |
| `packages/console-runtime/local-agent-launcher/` | `packages/local-agent-launcher/` |
| `tooling/check*.mjs`, `tooling/devloop-smoke.mjs` | `tooling/checks/` |
| `tooling/clean-console-web.mjs`, `tooling/package-development-host.mjs` | `tooling/distribution/` |

Old directories have no runtime fallback, copy or symlink. Dated acceptance
records and ADRs retain the paths used when their evidence was collected;
this mapping describes the current checkout, not rewritten history.
