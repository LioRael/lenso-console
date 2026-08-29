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

The first start creates the Console Agent Home at `~/.lenso/console/agent`.
Its visible App configuration is the ordinary Plugin Root:

```text
~/.lenso/console/agent/
  .lenso/
    host-catalog.json
  plugins/
    <plugin-id>/
      <instance>.toml
      <instance>.disabled
```

This is a standard Lenso App root. The regular CLI can validate and inspect the
same resolved App:

```sh
lenso app check --root ~/.lenso/console/agent
lenso app show --root ~/.lenso/console/agent
lenso plugins list --root ~/.lenso/console/agent
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
