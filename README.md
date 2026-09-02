# Lenso Console

[![CI](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml)

Lenso Console is the local management and Agent workspace for one Lenso App.
The installable Service is one process: it starts a latest-generation Lenso
Agent Host, links a reviewed Plugin inventory, and serves the React Shell and
Agent HTTP/SSE surface from the same origin.

## Run

To start a normal Harness together with its Console Web UI:

```sh
pnpm install
pnpm agent:web
```

Open `http://127.0.0.1:3030`. Console discovers two complete Agent identities:
the App Agent (`Lenso Agent`) and Console's own `Console Agent`. Each Agent owns
its Sessions, Profiles, Tools, Tasks, Trajectory, and conversation state. The
Agent selector changes identity rather than switching connection modes, and
canonical Session URLs include the owning Agent identity.

The App Agent Host selects its configuration authority explicitly with
`LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY`. It defaults to
`sqlite_configuration_store`; `local_plugin_root` and
`remote_configuration_service` are also supported. Remote selection requires
the service URL, App and environment identities, and
`LENSO_PLUGIN_CONFIGURATION_REMOTE_TOKEN`. Those credentials remain inside the
App Agent Host—Console still consumes only the common configuration Capability.

To run Console without an App Agent:

```sh
pnpm install
test -f service/.env || cp service/.env.example service/.env
pnpm service:serve
```

Open `http://127.0.0.1:3030`.

The private Console Agent Home defaults to `~/.lenso/console/agent`. The App
being managed is a separate root selected with `LENSO_APP_ROOT`, defaulting to
the launcher directory. The Console Agent admits six Plugin
management Tools by default: `inspect_app`, `list_plugins`, `inspect_plugin`,
`check_plugin_change`, `apply_plugin_change`, and `set_plugin_enabled`. Set
`LENSO_CONSOLE_AGENT_TOOLS` to an exact comma-separated subset to narrow access,
or to an empty value to disable all model-visible Tools. `ask_user` remains
available as the web interaction primitive. `apply_plugin_change` and the
direct `set_plugin_enabled` lifecycle action pass through the interactive
approval hook.

The Console Host also links `lenso.agent.console-instructions`, a stateless
Prompt Provider used only by the Console Agent identity. It instructs the Agent
to inspect current Host and Capability state, respect the Plugin's reported
configuration authority, keep review requests read-only, validate proposals
before publication, and apply only after an explicit user request. App Agents
remain independent and do not inherit this instruction.

An App Host embedding `lenso.console.web` can contribute one App Agent by
setting `connected_agent_url` to its loopback Agent Web origin. The setting is
an Adapter detail retained for configuration compatibility; the Agent catalog
exposes a stable App Agent identity instead of connection topology. Console
proxies the Agent data plane. Plugin configuration control is exposed only
when the App Host explicitly contributes
`lenso.agent.plugin-configuration@1`; Tool-policy and Plugin lifecycle control
remain owned by the App Agent's Host.

The installed CLI can inspect the same App without Console-specific adapters:

```sh
lenso app check --root <managed-app>
lenso app show --root <managed-app>
lenso plugins list --root <managed-app>
```

The Console Host persists the Console Agent's proposal, compare-and-swap
publication, history, and recovery state in
`~/.lenso/console/agent-configuration.sqlite3` by default. The Web Shell does
not own this state, and the Console Agent's authority cannot mutate the
separate managed App implicitly. The `agent:web` launcher enables a durable
configuration authority on the App Agent Host and contributes that capability
to Console. Other embedding Hosts must opt in explicitly; catalog membership
alone grants no control authority.

The local Host currently binds only to loopback. A remotely reachable Console
must first provide identity and authorization as reviewed vNext Plugins.

## Architecture

- `service`: the `lenso.console.web` lifecycle Plugin, reusable Console Surface,
  and thin standalone launcher.
- `src/routes`: Agent, Plugins, and Settings routes.
- `src/features/agent`: Agent conversation, trajectory, history, editing, and
  ask-user UI.
- `src/features/plugins`: installed Plugin inventory for the current App.
- `src/features/settings`: local Console and Agent policy settings.

System Registry, Runtime Story, Surface Gateway, generic managed-Service,
PostgreSQL migration, worker, deployment-recovery, and dynamic Console Module
composition are not part of this Host or its frontend source.

## Development

For Shell-only work with seeded frontend adapters:

```sh
pnpm dev
```

For hot reload against a running local Console Service:

```sh
VITE_CONSOLE_MODE=api \
VITE_CONSOLE_DEV_MODE=production \
VITE_API_BASE_URL=http://127.0.0.1:3030 \
pnpm dev
```

The development server binds `127.0.0.1` by default. Its diagnostics and Host
proxy routes require a trusted socket peer and Host. Requests must either carry
the exact same Origin, or be an Origin-less `GET`/`HEAD` browser fetch with
same-origin Fetch Metadata (`same-origin`, `cors`, and `empty`). Cross-site
metadata and requests without either browser signal are rejected. To opt into
remote development, set `LENSO_CONSOLE_DEV_REMOTE_ORIGIN` to the exact HTTP(S)
Origin opened in the browser. That single opt-in binds Vite to all interfaces
and trusts only the configured Origin and Host for non-loopback requests; use
it only on a trusted network. The privileged proxy also rejects request bodies
larger than 1 MiB.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm service:check
```

Browser tests use Playwright-managed Chromium. Install it with
`pnpm exec playwright install chromium`; set `LENSO_BROWSER_EXECUTABLE_PATH`
only when a local environment must use a specific Chromium-compatible binary.

Repository operations notes live in
[docs/repository-operations.md](docs/repository-operations.md).
