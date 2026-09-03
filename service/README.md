# Lenso Console Service

The Console Service is one local Lenso Agent Host with one same-origin Web
Shell. Its default App contains only the Agent Web Surface and the Agent
Plugins linked by the Harness Host. It does not contain compatibility-era
System Registry, Story, Surface Gateway, generic managed-Service, deployment,
or recovery subsystems.

## Start

Start an Agent App together with its Console surface:

```sh
pnpm install
pnpm agent:web
```

This starts the App Agent on `127.0.0.1:8787` and the Console surface on
`127.0.0.1:3030`. Console still owns a separate private Agent. The Agent page
discovers both full identities and keeps their Sessions, profiles, memory,
tasks, trajectory, and Tools independently scoped.

The reference App Agent Host defaults to its durable SQLite authority. Select
one concrete authority before `pnpm agent:web`:

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

The selector is exclusive: settings belonging to a non-selected authority are
rejected instead of being ignored. This prevents an ambient remote token or
stale database path from silently changing which authority owns desired state.

Trusted package installation is a separate Host capability. The reference App
Agent accepts a JSON object whose keys are opaque catalog entry IDs and whose
values are absolute reviewed Bundle paths:

```sh
LENSO_AGENT_TRUSTED_PLUGIN_BUNDLES='{"reviewed.tools":"/opt/lenso/plugins/reviewed-tools"}' \
pnpm agent:web
```

For Console Agent's own managed App, use the same object shape in
`LENSO_CONSOLE_TRUSTED_PLUGIN_BUNDLES` (or `trusted_plugin_bundles` in the
Console Plugin configuration).

Console Agent sees catalog metadata but never receives these paths or package
bytes. Install and removal use their own explicit capability; choosing a local,
SQLite, remote, or custom configuration authority does not grant package-source
authority. Removal is recoverable and does not purge Plugin data.

An embedding Rust Host may instead inject its own
`PluginConfigurationAuthority` and optional
`PluginConfigurationHistoryAuthority` into its Agent Web surface before
contributing `lenso.agent.plugin-configuration@1` to Console. Custom authority
selection remains Host code rather than serialized Console configuration.

Start only the standalone Console and its private Agent:

```sh
pnpm install
test -f service/.env || cp service/.env.example service/.env
pnpm service:serve
```

Open `http://127.0.0.1:3030`.

## Embed in a Lenso App Host

`lenso-console-plugin` is an endpoint-free lifecycle Plugin with Plugin ID
`lenso.console.web`. A Console-capable native Host links it once:

```rust
lenso_console_plugin::link();
```

The target App selects and configures the ordinary Plugin instance at
`plugins/lenso.console.web/console.toml`:

```toml
address = "127.0.0.1:3030"
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

Relative paths resolve from the App Host working directory. Activation binds
the listener and starts the restricted Console Agent before the Plugin reaches
Ready; generation cancellation shuts down both. Removing or disabling this
Plugin removes only the Console surface.

`connected_agent_url` is a compatibility configuration key for the optional
App Agent Adapter. Use an empty string to omit it. The value must be a clean
loopback HTTP origin and identifies an Agent Web surface already owned by the
embedding Host. Console does not start another Agent process. It forwards
bounded Agent data-plane routes and streams SSE responses. The embedding Host
may set `connected_agent_plugin_configuration = true` only when that Agent Host
provides Host-authorized durable Plugin configuration. Console then advertises
`lenso.agent.plugin-configuration@1` and forwards only configuration
management, proposal, publication, history, rollback, reset, and operation
receipt routes. Install, selection, removal, and Tool-policy control remain
blocked.

The current generic `lenso run` binary does not yet link this native package.
This slice defines the real Plugin and reference launcher; making it available
in every stock Host is a separate distribution step, not a compatibility
Module.

The first start creates the private Console Agent Home at
`~/.lenso/console/agent`. The App being managed is selected independently with
`LENSO_APP_ROOT`; it defaults to the directory where the launcher is run:

```text
<managed-app>/
  plugins/
    <plugin-id>/
      <instance>.toml
      <instance>.disabled
```

This is a standard Lenso App root. The regular CLI can validate and inspect the
same resolved App:

```sh
lenso app check --root <managed-app>
lenso app show --root <managed-app>
lenso plugins list --root <managed-app>
```

The same-origin Agent surface authorizes mutations only for the Console Agent's
own Plugin Root. Install, configuration, selection, and removal requests resolve
the complete candidate Agent App before changing files. Successful mutations
return as accepted desired state; its Host then stages the candidate and
switches routing only after its Generation reaches Ready.

The Console Host selects `agent_configuration_store` as the persistent
configuration authority for the Console Agent. Its SQLite database owns compare-and-swap
revisions, reviewed proposals, publication history, rollback evidence, and
crash recovery. Published desired state is still materialized atomically into
the Agent's visible Plugin Root; the Shell is a client of this Host authority
and never owns configuration files directly. The standalone launcher defaults
the database to `~/.lenso/console/agent-configuration.sqlite3`.

The separate `managed_app_root` remains the Host-selected target for future
App-management capabilities. This slice does not expose its files or
Generation to the Console Agent. Its configuration must be supplied through
an explicit Host/Capability port; Console Agent membership does not grant that
authority.

The standalone Console Agent admits nine Plugin management Tools
by default: `inspect_app`, `list_plugins`, `inspect_plugin`,
`check_plugin_change`, `apply_plugin_change`, `list_plugin_changes`,
`check_plugin_rollback`, `apply_plugin_rollback`, and `set_plugin_enabled`. Set
`LENSO_CONSOLE_AGENT_TOOLS` to an exact comma-separated subset to narrow access,
or to an empty value to disable all model-visible Tools. Embedded Apps own the
same policy explicitly through `allowed_tools`; `[]` disables every Tool.
`apply_plugin_change`, `apply_plugin_rollback`, and `set_plugin_enabled` remain
subject to the interactive approval hook before the selected authority changes
desired state. Plugin history receipts expose only publication metadata;
retained configuration values stay inside the selected authority. Selection and
rollback support are authority-specific; unsupported remote or custom
authorities fail explicitly instead of falling back to direct Plugin Root
mutation.

The process binds only to loopback until Console identity and authorization are
implemented as vNext Plugins. Agent sessions, Tool policy, and Host runtime
state remain under the Console Agent Home; PostgreSQL and the retired Console
Service composition are not required.
