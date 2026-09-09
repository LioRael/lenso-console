# Lenso Console

[![CI](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml/badge.svg)](https://github.com/LioRael/lenso-console/actions/workflows/ci.yml)

Lenso Console is the local management and Agent workspace for one Lenso App.
The Console service owns the React Shell, Agent catalog, and same-origin proxy.
The separately released `lenso-agent-web` binary owns Agent execution and its
reviewed Plugin compositions; Console no longer links Agent's private Rust
workspace.

## Product direction

The long-term direction is an extensible App administration and development
workbench, with Plugin-owned business pages, observability, and team tools.
See the [product direction](docs/console-direction.md), [domain vocabulary](CONTEXT.md),
and [native page contribution decision](docs/adr/0004-prefer-native-console-page-contributions.md).
Plan-bound linked Workspaces and the first Observe tracer ship in the reference
Host. The [Workspace service transport](docs/workspace-service-transport.md)
and [observability](docs/console-observability.md) documents distinguish the
implemented local-development slice from its production follow-ups. The
[marketplace](docs/plugin-marketplace.md) remains a design awaiting its first
implementation.

## Run

To start a normal Harness together with its Console Web UI:

```sh
pnpm install
pnpm agent:web
```

This launcher requires `lenso-agent-web` and `lenso-agent-console-web` v0.1.3
or later on `PATH`; set `LENSO_AGENT_WEB_BIN` or
`LENSO_CONSOLE_AGENT_WEB_BIN` to an absolute binary path for a nonstandard
install. It starts separate loopback App Agent and Console Agent processes,
then exposes both through Console's same-origin API. The generated Host-only
control token never reaches the browser.

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
App Agent Host. Trusted package lifecycle is separately exposed as
`lenso.agent.plugin-package-management@1`; configuration authority does not
imply package-source authority.

To run Console against an already-running Console Agent:

```sh
pnpm install
test -f service/.env || cp service/.env.example service/.env
pnpm service:serve
```

The Console Agent defaults to `http://127.0.0.1:8788`; override it with
`LENSO_CONSOLE_AGENT_URL`. Privileged control requires the matching
`LENSO_CONSOLE_AGENT_CONTROL_TOKEN` in both processes.

Open `http://127.0.0.1:3030`.

The private Console Agent Home defaults to `~/.lenso/console/agent`. The App
being managed is a separate root selected with `LENSO_APP_ROOT`, defaulting to
the launcher directory. The Console Agent admits the reviewed inspection,
configuration, rollback, enablement, trusted-catalog installation, and
recoverable-removal Tools by default. Set
`LENSO_CONSOLE_AGENT_TOOLS` to an exact comma-separated subset to narrow access,
or to an empty value to disable all model-visible Tools. `ask_user` remains
available as the web interaction primitive. Every apply operation and the
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

- `service`: the `lenso.console.web` lifecycle Plugin, its Plan-bound
  `lenso.ui.contribution@1` Workspace catalog, same-origin Agent proxy, and thin
  supervisor for released Agent Web processes.
- `service/crates/lenso-capability-ui-contribution`: generated Rust and
  TypeScript contract projections for Plugin-owned Console- and App-scoped
  Workspaces.
- `service/crates/lenso-console-welcome-workspace-plugin`: a real reference
  provider with embedded ESM and CSS assets.
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

### Explicit coding Profile

Install the official coding Profiles into a fresh Agent Home before starting
its Host. Named Profile Plugin management requires `local_plugin_root`;
SQLite and remote managed configuration do not support live Profile import.
The default launcher remains SQLite-managed.

```sh
export LENSO_AGENT_HOME="$(mktemp -d)"
lenso-agent-cli profiles install coding
export LENSO_AGENT_PLUGIN_CONFIGURATION_AUTHORITY=local_plugin_root
export LENSO_AGENT_PROFILE=code
export LENSO_AGENT_TOOLS=read,edit,run_process,checkpoint_create,checkpoint_accept
lenso-console-with-agent
```

Run the launcher from the workspace the Agent should operate on and configure
its Provider authentication through the Auth Plugin. Tool grants are explicit:
`LENSO_AGENT_TOOLS` is a comma-separated allowlist, not an automatic grant to
all Tools introduced by a Profile. Profile installation into an already managed
Home is rejected before writing; stopping its Host does not release ownership.

## Packaged Agent Web

Run Agent and Console from the current workspace with Node.js 22.12 or newer:

```sh
npx @lenso/agent web
```

Available on npm since 1.6.0 for macOS 15+ on Apple Silicon and Ubuntu 24.04+
x64. No Rust toolchain or source checkout is required. The package includes the
Console client and exact native runtime cohort. Use `--port` to choose a port,
`--no-open` to skip opening the browser, or `@1.6.0` to pin the package version.
See [distribution and release instructions](docs/agent-npm-distribution.md).
