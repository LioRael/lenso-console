# Lenso Console Service

For a minimal App using the current high-level Lenso Host API, use [the optional Plugin example](../../examples/plugin-host/README.md) and `pnpm plugin:dev`. It needs no Agent and proves removal independently of this repository's reference App assembly. Rust dependencies and their immutable source patches now have one authority in the root `Cargo.toml` and `Cargo.lock`.

## Account connections

Agent settings consume `lenso.agent.auth-connection@1` through the Agent Web management routes (`auth/connections` and `auth/connections/actions`). Run this Console with a Harness binary containing those routes; older binaries cannot serve this section. No credentials are sent to the browser.

App Agents opt in separately with `with_app_agent_auth_connections(id)` after registering the identity. Plugin configuration and chat permissions do not grant account management. The target Host must also authorize management requests. The Console Agent uses the existing server-owned management authorization.

The Console Service is one local Lenso Web App with one same-origin Web Shell. Its Resolved App Plan binds `lenso.web-ingress` to the Console Plugin's buffered and streaming HTTP Endpoint capabilities. The Host owns the loopback listener, limits, and protocol lifecycle; Console owns routes and product behavior. The production service does not depend on Axum; tests use it only for upstream HTTP fixtures. Its default App contains the Console Web Plugin and the Host-owned Web Ingress; Projects and Observe are selected only when their Host inputs exist. Welcome is a test-only fixture. It does not contain compatibility-era System Registry, Story, Surface Gateway, generic managed-Service, deployment, or recovery subsystems.

The reference executable atomically publishes its exact Host Catalog beneath `LENSO_CONSOLE_HOME/.lenso/`, preserves the App-owned `plugins/` directory, and resolves that visible Plugin Root before passing the immutable Plan to the Kernel. A missing Plugin Root selects Host defaults; disabling a disableable Workspace removes it and its derived bindings on the next Host start. Inspect or change this Root with Lenso CLI 0.6.0 or later; older CLI builds use an earlier Host Catalog schema and fail closed.

## Start

Start an Agent App together with its Console surface:

```sh
pnpm install
pnpm agent:web
```

This starts the Console surface on `127.0.0.1:3030`. The App Agent and the separate private Console Agent use dynamically allocated loopback ports. The Agent page discovers both full identities and keeps their Sessions, profiles, memory, tasks, trajectory, and Tools independently scoped.

Both reference launchers resolve and start an ordinary Lenso App Plan. The Console Shell is the required `console` Plugin. Each selected `console-workspaces` instance contributes a first-class item to the far-left Workspace rail; linking a package alone does not activate it.

The reference App Agent Host defaults to its durable SQLite authority. Select one concrete authority before `pnpm agent:web`:

```sh
# Built-in local Plugin Root authority (no publication history).
LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY=local_plugin_root pnpm agent:web

# Durable SQLite authority; the database defaults inside LENSO_AGENT_HOME.
LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY=sqlite_configuration_store \
LENSO_AGENT_PLUGIN_CONFIGURATION_STORE=/absolute/path/plugin-configuration.sqlite3 \
pnpm agent:web

# Remote authority; the token is read only by the App Agent Host.
LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY=remote_configuration_service \
LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_URL=https://configuration.example.com \
LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_APP=my-agent \
LENSO_AGENT_PLUGIN_CONFIGURATION_REMOTE_ENVIRONMENT=production \
LENSO_PLUGIN_CONFIGURATION_REMOTE_TOKEN=replace-me \
pnpm agent:web
```

The selector is exclusive: settings belonging to a non-selected authority are rejected instead of being ignored. This prevents an ambient remote token or stale database path from silently changing which authority owns desired state.

Trusted package installation is a separate Host capability. The reference App Agent accepts a JSON object whose keys are opaque catalog entry IDs and whose values are absolute reviewed Bundle paths:

```sh
LENSO_AGENT_TRUSTED_PLUGIN_BUNDLES='{"reviewed.tools":"/opt/lenso/plugins/reviewed-tools"}' \
pnpm agent:web
```

For Console Agent's own managed App, use the same object shape in `LENSO_CONSOLE_TRUSTED_PLUGIN_BUNDLES` (or `trusted_plugin_bundles` in the Console Plugin configuration).

Console Agent sees catalog metadata but never receives these paths or package bytes. Install and removal use their own explicit capability; choosing a local, SQLite, remote, or custom configuration authority does not grant package-source authority. Removal is recoverable and does not purge Plugin data.

An embedding Rust Host may instead inject its own `PluginConfigurationAuthority` and optional `PluginConfigurationHistoryAuthority` into its Agent Web surface before contributing `lenso.agent.plugin-configuration@1` to Console. Custom authority selection remains Host code rather than serialized Console configuration.

Start only the standalone Console and its private Agent:

```sh
pnpm install
test -f plugins/console/.env || cp plugins/console/.env.example plugins/console/.env
pnpm service:serve
```

Open `http://127.0.0.1:3030`.

## Embed in a Lenso App Host

`lenso-console-plugin` provides the Console HTTP and streaming endpoints with Plugin ID `lenso.console.web`. A Console-capable native Host links it once:

```rust
lenso_console_plugin::link();
```

The reference distribution lives in `apps/reference-host`. It owns the `lenso-console` and `lenso-console-with-agent` binaries, concrete Plugin dependencies, Host Catalog, listener configuration and Kernel lifecycle. `ConsoleAppConfig` contains an explicit `shell: ConsoleConfig`; Rust embedders import `start_host` and `serve_host` from `lenso_console_app`. The Shell crate can be checked independently with `cargo check --manifest-path plugins/console/Cargo.toml -p lenso-console-plugin --lib` from the repository root. See [ADR-0010](../../docs/adr/0010-separate-console-shell-from-app-assembly.md) for the enforced ownership and reproducible App composition.

Local directory registration, Home seeding and subprocess supervision live in the independent [local Agent launcher](../../packages/console-runtime/local-agent-launcher/README.md). Shell supplies its Agent protocol client and retains HTTP admission and proxy translation. The independent [Agent turn relay](../../packages/console-runtime/agent-turn-relay/README.md) owns stream detachment, bounded browser queues and transient activity. The launcher has no Console, Lenso or HTTP dependencies; local directories are unrelated to Projects Issue records.

Workspace packages link in the App. The reference App makes linked Workspace packages available, but activation comes from explicit App defaults or Plugin Root configuration. It binds selected `lenso.ui.contribution@1` providers to Console through the immutable Plan. Welcome is a dev-only fixture and is absent from production binaries. The launcher does not scan frontend directories to discover production Workspaces.

The target App selects and configures the ordinary Plugin instance at `plugins/lenso.console.web/console.toml`:

```toml
agent_configuration_store = ".lenso/console/agent-configuration.sqlite3"
agent_home = ".lenso/console/agent"
allowed_tools = [
  "inspect_app",
  "list_plugins",
  "inspect_plugin",
  "check_plugin_change",
  "apply_plugin_change",
  "list_plugin_changes",
  "check_plugin_rollback",
  "apply_plugin_rollback",
  "set_plugin_enabled",
]
managed_app_root = "."
web_root = "console-web"
connected_agent_url = "http://127.0.0.1:8787"
connected_agent_label = "Lenso Agent"
connected_agent_plugin_configuration = false
```

Relative paths resolve from the App Host working directory. Activation binds the listener and verifies the separately owned Console Agent before the Plugin reaches Ready; generation cancellation shuts down the Console server and any local project processes. Removing or disabling this Plugin removes only the Console surface.

Console publishes `GET /health/live` and `GET /health/ready` by default, including for existing configurations that omit `liveness_readiness_routes`. When the App owns those routes (for example, readiness checks its database), set `liveness_readiness_routes = false` in the ordinary Console Plugin configuration. Console then omits both routes and rejects their dedicated route IDs; its Shell wildcard returns 404 for those paths. `GET /health/startup` remains available.

For a Git dependency with the `embedded-shell` feature, build the Shell in a separate checkout of the same full Console source revision, using Node 24.18.0 and pnpm 11.5.0:

```sh
git clone https://github.com/LioRael/lenso-console console-source
git -C console-source checkout --detach "$CONSOLE_SOURCE_SHA"
cd console-source
pnpm install --frozen-lockfile
pnpm service:web-build
```

Set `CONSOLE_SOURCE_SHA` to the same immutable 40-character revision used by the Rust dependency. When building the consuming Host, set `LENSO_CONSOLE_SHELL_ROOT` to that checkout's absolute `apps/shell/dist/client` path. The build script embeds those assets without writing to Cargo's Git cache; it requires `index.html` and regular files, rejects symlink entries, and tracks the asset directory and environment variable for rebuilds. Without an override, repository builds still use `apps/shell/dist/client`.

Alternatively, leave `embedded-shell` disabled and configure `web_root` with the built Shell directory; the Host then serves those files at runtime.

### Wasm Hosts

`wasm32` Hosts use the same Console Plugin and HTTP, Auth, management, and workspace service contracts. Build with `embedded-shell` and the asset input above. Target-specific dependencies keep native filesystem, process supervision, and Tokio listener features out of this build; native Hosts retain their existing features and APIs by default. The Wasm response adapter accepts local Fetch streams, and workspace subscriptions use the generation's managed task scope.

Wasm configuration requires `web_root = "embedded:"`. Local project launching, filesystem control-token files, trusted Bundle paths, and managed-App environment tokens are native-only and fail configuration validation when supplied on Wasm. `ConsoleConfig::load`, local project launch methods, and the filesystem token method remain native APIs. Typed Auth and management bindings remain available. The Host supplies the runtime and capability providers; a successful target check proves compilation, not a deployed Worker or an exercised service flow.

`connected_agent_url` is a compatibility configuration key for the optional App Agent Adapter. Use an empty string to omit it. The value must be a clean loopback HTTP origin and identifies an Agent Web surface already owned by the embedding Host. Console does not start another Agent process. It forwards bounded Agent data-plane routes and streams SSE responses. The embedding Host may set `connected_agent_plugin_configuration = true` only when that Agent Host provides Host-authorized durable Plugin configuration. Console then advertises `lenso.agent.plugin-configuration@1` and forwards only configuration management, proposal, publication, history, rollback, reset, and operation receipt routes. Install, selection, removal, and Tool-policy control remain blocked.

The current generic `lenso run` binary does not yet link this native package. This slice defines the real Plugin and reference launcher; making it available in every stock Host is a separate distribution step, not a compatibility Module.

The first start creates the private Console Agent Home at `~/.lenso/console/agent`. The App being managed is selected independently with `LENSO_APP_ROOT`; it defaults to the directory where the launcher is run:

```text
<managed-app>/
  plugins/
    <plugin-id>/
      <instance>.toml
      <instance>.disabled
```

This is a standard Lenso App root. The regular CLI can validate and inspect the same resolved App:

```sh
lenso app check --root <managed-app>
lenso app show --root <managed-app>
lenso plugins list --root <managed-app>
```

The same-origin Agent surface authorizes mutations only for the Console Agent's own Plugin Root. Install, configuration, selection, and removal requests resolve the complete candidate Agent App before changing files. Successful mutations return as accepted desired state; its Host then stages the candidate and switches routing only after its Generation reaches Ready.

The Console Host selects `agent_configuration_store` as the persistent configuration authority for the Console Agent. Its SQLite database owns compare-and-swap revisions, reviewed proposals, publication history, rollback evidence, and crash recovery. Published desired state is still materialized atomically into the Agent's visible Plugin Root; the Shell is a client of this Host authority and never owns configuration files directly. The standalone launcher defaults the database to `~/.lenso/console/agent-configuration.sqlite3`.

The separate `managed_app_root` remains the Host-selected target for future App-management capabilities. This slice does not expose its files or Generation to the Console Agent. Its configuration must be supplied through an explicit Host/Capability port; Console Agent membership does not grant that authority.

The standalone Console Agent admits nine Plugin management Tools by default: `inspect_app`, `list_plugins`, `inspect_plugin`, `check_plugin_change`, `apply_plugin_change`, `list_plugin_changes`, `check_plugin_rollback`, `apply_plugin_rollback`, and `set_plugin_enabled`. Set `LENSO_CONSOLE_AGENT_TOOLS` to an exact comma-separated subset to narrow access, or to an empty value to disable all model-visible Tools. Embedded Apps own the same policy explicitly through `allowed_tools`; `[]` disables every Tool. `apply_plugin_change`, `apply_plugin_rollback`, and `set_plugin_enabled` remain subject to the interactive approval hook before the selected authority changes desired state. Plugin history receipts expose only publication metadata; retained configuration values stay inside the selected authority. Selection and rollback support are authority-specific; unsupported remote or custom authorities fail explicitly instead of falling back to direct Plugin Root mutation.

The process binds only to loopback until Console identity and authorization are implemented as vNext Plugins. Agent sessions, Tool policy, and Host runtime state remain under the Console Agent Home; PostgreSQL and the retired Console Service composition are not required.

## Independent package workspaces

Shared UI contracts live in `contracts/` and Observe owns `plugins/observe/`, including its query contract and lock. Neither workspace needs Projects or the Console App to build. `pnpm service:check` includes their dedicated checks and contract package verification. Only test code depends on `plugins/console/tests/fixtures/welcome-workspace-plugin`.
