# Local Agent launcher

This private Rust library owns local directory registration, portable Agent Home
seeding, authenticated child-process startup, restart and shutdown. It is separate
from the Projects Issue domain and builds without Console, Lenso, or an HTTP stack.
It remains in the Console repository; it is not independently published.

`LocalProjects<A>` accepts an `AgentClient` implementation. The client translates
source Profile discovery, child readiness and initial Profile activation into the
Agent protocol. The launcher supplies the exact loopback address and fresh private
token; the client must preserve these and share per-process state across clones.
The interface is a local launcher seam, not a Lenso Capability or Execution Adapter.

Console supplies `AppAgentAdapter` in `service/src/local_agent_client.rs`. It keeps
Agent HTTP details, supported coding Profile validation and optimistic-concurrency
preconditions out of this library. Console's local-project routes still enforce
selected Agent identity, request intent and route permissions. The current API and
JSON response shapes remain compatible. Turn-stream relay and activity tracking are supplied by the independent
`runtime/agent-turn-relay` module through that client. The launcher does not depend
on it.

The launcher serializes project creation, maintains private Homes, excludes session
history and credential files from templates, and rejects unsafe template roots.
A failed startup does not publish a registry entry. Shutdown kills and waits for
owned children without deleting Homes, the registry or project files. Calling
`adapter` after shutdown lazily starts a new child; shutdown is not a permanent
admission gate. Callers must stop admitting requests before generation teardown.

## Validation

From the repository root:

```sh
cargo test --locked --manifest-path runtime/local-agent-launcher/Cargo.toml
cargo clippy --locked --manifest-path runtime/local-agent-launcher/Cargo.toml --all-targets -- -D warnings
```

Within the Lenso sibling workspace, replace `cargo` with its `lenso-cargo` wrapper.
`pnpm launcher:check` is included in `pnpm service:check`. The dependency guard
rejects Lenso or HTTP implementation dependencies in the launcher's normal/build
graph. Process tests use real Unix children with a stubbed Agent handshake and
cover spawn failure, working directory, private token propagation, initialization,
restart, child reaping and preserved data. Console separately tests the HTTP client
against a loopback server, including authorization and Profile revision/stream ID.
The credential-dependent real Agent acceptance test remains explicitly ignored.
