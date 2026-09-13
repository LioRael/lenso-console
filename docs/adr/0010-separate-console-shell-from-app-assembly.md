# ADR-0010: Separate Console Shell from App assembly

Status: Accepted. Shell/App extraction, Projects ownership migration, test-only Welcome, standalone contracts/Observe workspaces, the local Agent launcher and turn relay are implemented and validated as a reproducible source composition. Repository separation and registry publication are separate distribution choices.

## Context

Console's generic page catalog and Workspace dispatch already use Plan-bound Capabilities. However, the Shell crate also links Projects, Observe, Auth and storage providers, builds the default Host Catalog, configures listeners, and starts the Kernel. Projects frontend artifacts are copied into this repository. A Plugin-shaped directory alone therefore does not make the Shell independently buildable or the business UI independently deliverable.

## Decision

Keep `lenso-console-plugin` responsible for Shell behavior and generic integration. Introduce `lenso-console-app` as the reference distribution's assembly crate. The App depends on the Shell and concrete providers; the Shell never depends on the App or concrete providers, including through transitive build dependencies. Static native linking belongs in the App and remains supported. Same-process composition, shared ingress and shared authentication remain the direction in ADR-0009.

`ConsoleAppConfig` owns the App root, ingress addresses and optional Projects origin. Its explicit `shell` field contains `ConsoleConfig`, which constructs the serializable `ConsolePluginConfig`. The App owns the Host Catalog, default instances, bindings, session-composition validation, private token-file writing, Kernel startup and shutdown. Shell configuration does not select business providers or configure their listeners.

The existing `lenso-console` and `lenso-console-with-agent` binary names stay unchanged. The Cargo workspace selects both Shell and App by default so existing workspace-level build and launcher commands continue to work. Rust callers of `start_host` and `serve_host` must now import them from `lenso_console_app` and supply `ConsoleAppConfig`; no reverse dependency shim is added to the Shell.

## Plugin ownership and distribution

- Projects Web now owns the `lenso-projects-workspace-plugin` package, its service adapter and browser tests. The adapter reads embedded assets from `lenso-projects-web-plugin::workspace_assets`; Console no longer stores a copied bundle or an import script. The existing `lenso.console.workspace.projects` Plugin ID remains stable for Plugin Root compatibility. Projects retains records, migrations, business rules and authorization.
- `plugins/observe` is an independent Cargo workspace owning the Observe implementation and Observability Query contract. It has its own lock and checks, and keeps the existing Plugin ID. Its source remains maintained in this repository; independent repository hosting is not required for the enforced package boundary.
- `contracts` independently builds and packages the UI Contribution and Workspace Service contracts; the domain query contract stays with Observe. All three packages pass registry-source package verification. Their wire contracts remain unchanged. No registry publication or publisher setup is part of this source delivery.
- Welcome lives in `service/tests/fixtures` as an App dev-dependency. Production binaries neither link nor activate it. Tests select it explicitly through Plugin Root; linked availability alone no longer activates arbitrary Workspaces.
- `runtime/local-agent-launcher` independently owns local directory registration, Home seeding and child-process supervision behind `AgentClient`. It has no Console, Lenso or HTTP dependencies. Shell keeps identity/intent/route checks and supplies the Agent HTTP client, including Profile policy and concurrency preconditions. This is local launcher infrastructure, not the Projects Issue domain or a new Lenso Execution Adapter. The independent `runtime/agent-turn-relay` owns detachable turn streams, transient activity and duplicate-start admission. Shell supplies the authenticated target and translates its response; it cannot mutate the relay state. Session facts and task execution remain owned by Agent.
- A separately distributed App may move to its own repository once released Shell and Plugin packages are available. The current source distribution enforces the same inward dependency direction within separate packages.

A linked native distribution still needs rebuilding to include a previously unavailable provider. Enabling or removing an available provider uses the Plugin Root and the supported Generation lifecycle. This extraction does not introduce native hot installation.

## Invariants

The Shell discovers admitted contributions without business-ID branches. Browser calls remain mount-scoped and Plan-bound; providers decode domain requests and make the final authorization decision. Preserve InvocationContext across calls, including streams. Console-owned Workspaces and selected-App Workspaces remain distinct; target changes must not silently retarget a service.

Generation shutdown revokes old dispatch. Removing a Plugin must not implicitly delete its durable data. Telemetry remains operational evidence, not runtime or business authority.

## Validation

`pnpm service:boundary` traverses Cargo's resolved normal/build dependency graph and rejects concrete Plugin packages beneath the Shell. It runs in `pnpm service:check`. The check fails against the pre-extraction graph and passes against the extracted graph.

The dependency gate also rejects production App dependencies on test fixtures and Lenso/HTTP implementation dependencies beneath the local launcher. The relay gate rejects reverse dependencies on Lenso implementation packages and tests real loopback streams, including slow/disconnected readers and upstream failure. The launcher gate exercises actual child processes; a separate Shell test exercises the authenticated Agent protocol. Host assembly and real HTTP/OTLP tests move to the App crate. Shell contract, transport and session tests stay with the Shell. The App integration scenario selects the Welcome fixture explicitly, removes optional Workspaces, restarts, and checks both an empty mount catalog and a successful Shell response. The Observe integration scenario also disables Observe, checks that its service is unavailable, and verifies that its database bytes remain intact. Database-backed authentication acceptance keeps its explicit environment requirements; ordinary test success does not claim those ignored tests ran.

## Reproducible App composition

The App pins both Projects packages to the same immutable owner-repository commit.
No copied frontend bundle, machine-specific Cargo configuration or sibling checkout
is required. The service manifest aligns the owner's Git UI contracts with this
repository's contract workspace using repository-relative Cargo patches.

That alignment is required by native Rust type identity: compiling the same
Descriptor from both a Git and a path source produces distinct Rust types and fails
Host startup with `ProtocolViolation`. The dependency gate rejects duplicate UI
contract sources, and the real Host composition test verifies dispatch across the
Projects package boundary. This source alignment belongs to the App composition
root; it introduces no concrete Plugin dependency into Shell.

Contracts and the private implementation packages are delivered as source here.
Registry publication and new repository creation are distinct distribution choices,
not requirements for the enforced dependency boundaries. Publishing the contracts
would let a future distribution replace source alignment with exact registry
versions shared by all participants.
