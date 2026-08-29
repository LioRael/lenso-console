# Lenso Console Service

The Console Service is one local Lenso Agent Host with one same-origin Web
Shell. Its default App contains only the Agent Web Surface and the Agent
Plugins linked by the Harness Host. It does not contain compatibility-era
System Registry, Story, Surface Gateway, generic managed-Service, deployment,
or recovery subsystems.

## Start

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
agent_home = ".lenso/console/agent"
allowed_tools = []
managed_app_root = "."
web_root = "console-web"
```

Relative paths resolve from the App Host working directory. Activation binds
the listener and starts the restricted Console Agent before the Plugin reaches
Ready; generation cancellation shuts down both. Removing or disabling this
Plugin removes only the Console surface.

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

The same-origin Agent surface also authorizes Console Plugin Root mutations.
Install, configuration, selection, and removal requests resolve the complete
candidate App before changing files. Successful mutations return as accepted
desired state; the Host then stages the candidate and switches routing only
after its Generation reaches Ready.

The Console Agent admits no Tools by default. Set
`LENSO_CONSOLE_AGENT_TOOLS` to a comma-separated list of exact Tool names only
after the corresponding Tool Plugins are selected by the derived App.

The process binds only to loopback until Console identity and authorization are
implemented as vNext Plugins. Agent sessions, Tool policy, and Host runtime
state remain under the Console Agent Home; PostgreSQL and the retired Console
Service composition are not required.
