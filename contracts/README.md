# Console integration contracts

This Cargo workspace owns the reusable UI integration interfaces. It builds and
packages independently of the Console Shell, reference App and business Plugins.
It remains maintained in the Console repository; extracting a workspace does not
claim a separate repository or a published registry release.

| Package | Capability | Descriptor | Operations |
| --- | --- | --- | --- |
| `lenso-capability-ui-contribution` | `lenso.ui.contribution@1` | 1.3.0 | `describe_contribution` request |
| `lenso-capability-workspace-service` | `lenso.ui.workspace-service@1` | 1.0.0 | `describe_exports`, `invoke` requests; `subscribe` stream |

Both package versions remain `0.1.0`. This is a packaging/ownership change: the
Descriptors, schemas, generated Rust and TypeScript, error variants and wire
versions are unchanged. Projects, Observe and the Welcome test fixture implement
these roles; Shell discovers contributions and dispatches admitted services.
Provider selection, activation and final business authorization remain outside
these packages.

Each package owns its `capability.json`, local schemas and generated projections.
Its build script uses the pinned `lenso-contract-codegen` dependency to reject
stale projections. The handwritten Rust facade preserves existing public aliases.
No generated file is edited as part of extraction.

From the repository root:

```sh
cargo test --locked --manifest-path contracts/Cargo.toml --workspace
cargo package --locked --allow-dirty --manifest-path contracts/Cargo.toml -p lenso-capability-ui-contribution
cargo package --locked --allow-dirty --manifest-path contracts/Cargo.toml -p lenso-capability-workspace-service
pnpm contract:typecheck
```

Inside the Lenso workspace use the shared `lenso-cargo` wrapper for local Cargo
commands. `pnpm contracts:check` and `pnpm contracts:package` are CI gates. A
successful package verification builds the unpacked source with registry
dependencies; it does not publish a version. See the repository release process
for remaining publisher and dependent-package handoffs.
