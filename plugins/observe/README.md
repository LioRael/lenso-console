# Observe Plugin

`lenso-observe-plugin` is a standalone Cargo workspace within this repository. It
owns OTLP/HTTP ingestion, bounded SQLite storage and retention, query/feed
behavior, native Workspace resources and the domain query Capability. The stable
Plugin ID remains `lenso.console.workspace.observe`; existing Plugin Root
configuration continues to select that ID.

## Plugin card

- **Provides:** UI Contribution, Workspace Service, Observability Query and HTTP
  Stream Endpoint Capabilities.
- **Owns:** trace/log ingestion, telemetry database, ingestion token file,
  worker lifecycle, retention, redaction and bounded queues, query/feed and UI.
- **Configuration:** source ID/label, database and token-file paths, retention
  days and bytes. Console App supplies default instances and ingress bindings.
- **Lifecycle:** one fresh worker/store generation; shutdown cancels managed work
  and closes its resources. Removing the Plugin removes its contributed services
  and page, while preserving its durable database.
- **Authorization:** token admission for ingestion and Plan-bound owner-service
  dispatch. Telemetry labels do not grant business or target-Host authority.
- **Implementation:** linked Rust. No portable implementation is claimed.
- **Consumers:** Console's generic page catalog and Workspace transport. The
  package does not depend on Console Shell implementation.

`crates/lenso-capability-observability-query` is the domain-owned public query
contract (`lenso.observability.query@1`, Descriptor 1.1.0). Its request and stream
schemas and generated projections are unchanged. UI integration contracts come
from the independent `contracts/` workspace. The Plugin and query contract no
longer belong to `service`'s Cargo workspace.

## Checks

```sh
cargo test --locked --manifest-path plugins/observe/Cargo.toml --workspace
cargo clippy --locked --manifest-path plugins/observe/Cargo.toml --workspace --all-targets -- -D warnings
cargo package --locked --allow-dirty --manifest-path plugins/observe/Cargo.toml -p lenso-capability-observability-query
```

Inside the Lenso workspace use the shared `lenso-cargo` wrapper for local Cargo
commands. CI runs these through `pnpm observe:check` and
`pnpm contracts:package`. Console retains an integration browser test for the
native module and an App test for real OTLP ingress, removal and retained data.
The standalone tests cover ingestion, queries and store behavior.

The three contract packages are registry-package ready. The Observe implementation
remains `publish = false` until those contracts are published and its own release
path is configured. It is still distributed by local App composition; this
workspace extraction is not an independent repository or release.
