# Console integration contracts

This Cargo workspace owns the reusable UI integration interfaces. It builds and
packages independently of the Console Shell, reference App and business Plugins.
It remains maintained in the Console repository; extracting a workspace does not
claim a separate repository or a published registry release.

| Package | Capability | Descriptor | Operations |
| --- | --- | --- | --- |
| `lenso-capability-ui-contribution` | `lenso.ui.contribution@1` | 1.4.0 | `describe_contribution` request |
| `lenso-capability-workspace-service` | `lenso.ui.workspace-service@1` | 1.0.0 | `describe_exports`, `invoke` requests; `subscribe` stream |

Both package versions remain `0.1.0`. Projects, Observe and the Welcome test
fixture implement these roles; Shell discovers contributions and dispatches admitted services.
Provider selection, activation and final business authorization remain outside
these packages.

UI Contribution 1.4.0 adds an optional `workspaces` list. Each workspace has a
stable local `id`, `title`, default mount `path`, relative homepage `index`,
`access` (`member` or `administrator`), relative `routes` and `navigation`.
Optional workspace `requirements` select a subset of the top-level service
requirements; they do not introduce additional service authority. Existing
responses may omit `workspaces`.

The SDK exposes `defineWorkspace` for local declarations and optional
`PageProps.mount.basePath` for a resolved instance path. These interfaces alone
do not implement custom mount routing, multi-workspace discovery or server-side
access enforcement; those require Console runtime integration. No administrator
identity or permission is granted by declaring `access`.

Each package owns its `capability.json`, local schemas and generated projections.
Its build script uses the pinned `lenso-contract-codegen` dependency to reject
stale projections. The handwritten Rust facade preserves existing public aliases.
Generated projections are updated together with their owning descriptor.

From the repository root:

```sh
pnpm contracts:check
cargo package --locked --allow-dirty -p lenso-capability-ui-contribution
cargo package --locked --allow-dirty -p lenso-capability-workspace-service
pnpm contract:typecheck
```

Inside the Lenso workspace use the shared `lenso-cargo` wrapper for local Cargo
commands. `pnpm contracts:check` and `pnpm contracts:package` are CI gates. A
successful package verification builds the unpacked source with registry
dependencies; it does not publish a version. See the repository release process
for remaining publisher and dependent-package handoffs.
