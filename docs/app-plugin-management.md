# App Plugin management

The Plugin workbench separates **App plugins**, **Console extensions**, and
**Management Agent**. Its App selector does not change the conversational Agent.
Configuration and enablement operations use the selected App's authority.
Functional categories, search, and selection filters apply within that target.

Existing configured App Agents appear automatically in App plugins. Their Agent
UI continues to use `/api/console/v1/agents`; Plugin management uses
`/api/console/v1/apps` with the same target identity.

## Connect a non-Agent App

The App must expose the Console Plugin control HTTP adapter under `/api/lenso/v1`.
Configure the Console service using `LENSO_CONSOLE_MANAGED_APPS`:

```json
[
  {
    "id": "support",
    "label": "Support App",
    "origin": "http://127.0.0.1:8790",
    "controlTokenEnv": "SUPPORT_APP_CONTROL_TOKEN"
  }
]
```

The same array is available as `managed_apps` in Console Plugin configuration.
Programmatic launchers can call `ConsoleConfig::with_managed_app` with a
`ManagedAppConnection`. IDs must be unique across App Agent and management
connections. `console` and `console-extensions` are reserved. Only clean loopback
HTTP origins are accepted. If a token environment variable is configured but
missing, startup fails; no anonymous retry is performed.

Set `consoleExtensions: true` on one explicit connection to place its inventory
in Console extensions. Without that connection, the tab reports management as
unavailable. It does not display Management Agent plugins.

## Adapter surface

`GET /api/console/v1/apps` returns `apps` containing:

- `id`, `label`, and `scope` (`application`, `console-extensions`, or
  `management-agent`);
- `pluginConfiguration`, indicating configured Plugin control support;
- `agentId`, the existing Agent identity for legacy Agent connections, or null;
- `localBundleInstall`, true only for the existing Management Agent local install.

The browser addresses `/api/console/v1/apps/<id>/plugins` and
`/api/console/v1/apps/<id>/control/...`. A generic target receives the same suffix
under `/api/lenso/v1`. An existing Agent receives it under its established
`/api/console/v1/agent` prefix. Query validators, response status, ETag, event
cursor, and streaming responses retain their existing semantics.

Generic targets must implement the existing inventory/management/configuration
wire contracts defined in `apps/shell/src/features/plugins/plugin-control-contract.ts` and
the golden fixture in `apps/shell/src/features/plugins/__fixtures__/`. Those payloads still
use their legacy `lenso.agent.*` schema names. Generic connections support Plugin
inventory, configuration proposals/publications/rollback, enabled selection,
instance removal, and operation observation. The proxy is not an arbitrary HTTP
forwarder. Local bundle installation and trusted package lifecycle are not
advertised for generic connections in this slice.

The catalog does not probe or imply readiness. Offline targets show errors and
cannot fall back to another target. Non-Agent Apps never enter the conversational
Agent catalog. Agent-assisted management remains restricted to the existing
Agent Tool targets; generic Apps are managed through the ordinary UI until a
Tool binding is explicitly implemented.

## Validation

Service tests exercise three independent identities through real loopback HTTP,
check configuration routing, reject Agent routes on the generic proxy, and verify
Host-only credentials. Browser regression covers a non-Agent App without any
Agent identity provider, scope switching, target-qualified detail navigation,
search, and the unavailable Console extension authority. Preview mode uses
explicit sample data; API mode never substitutes it on a failed connection.
