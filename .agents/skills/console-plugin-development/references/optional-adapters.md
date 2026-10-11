# Optional application adapters

Read this only when reusing an existing Console panel. These are explicit
application choices, not pages automatically installed by Console.

## Auth administration

Use `authConsole` for the frontend and `createAuthConsoleServer` for a real
server adapter. Read [Auth Console](../../../../packages/auth-console/README.md)
and the installed package entries before wiring them.

The adapter selects an exact customer Auth target and a separate trusted staff
Access/policy. Inject an existing owner-provided service satisfying the structural
`SessionAdministration` contract only when that service is actually available.
Verify the installed Auth exports: a README's factory example is not proof that
the application's locked version exports it.

If the application already owns the explicit, authorized `AdminSessionRepository`
seam, use the adapter's `sessions` option instead; select one seam, not both.
A raw SessionStore or token-expiry map is not that administration service.
If neither backend exists, leave its capabilities unavailable and ask the owner
for a supported integration rather than copying a credential store.

Capabilities come from the server: unsupported routes are absent, not fake
successful operations. Frontend navigation metadata may override visible labels
and supplemental tooltips without changing access.

## Dashboard

Read [Dashboard widgets](../../console-dashboard-widgets/SKILL.md). Use an
explicit widget collection and Dashboard store, not Shell preference JSON.

## Plugin inspection

Use `pluginManagerConsole` over the application's existing Console client.
Read [Plugin manager](../../../../packages/console-plugin-manager/README.md).
This is read-only target/plugin/catalog inspection and configuration provenance,
not configuration values, install/uninstall, restart, or arbitrary Manage.

## Consumer boundary

[Composed Console](../../../../examples/composed-console/README.md) demonstrates
explicit client injection and routes with labelled sample data. Copy its
composition shape only. A sample client does not establish trusted staff policy,
durable storage, or Marketplace installation authority.
