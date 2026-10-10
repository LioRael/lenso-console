# Explicit frontend composition

`composition.tsx` composes Dashboard, plugin management, two independently bound
Auth clients and an application-owned orders page group. It contains no login
provider, server Plugin object, guessed service URL or sample business results.
The host supplies a router adapter, trusted session projection, scoped stores and
admitted typed clients. Its real operations must validate public inputs/outputs
and authorize on the server.
The host also supplies `confirmArchive(ids)`, implemented with its confirmation
surface; the page locks execution and retains an explicit target snapshot while
awaiting it. Auth navigation labels distinguish workforce and customers.

Import `@lenso/tokens/styles.css`, `@lenso/console-react/styles.css` and
`@lenso/console-dashboard/styles.css` alongside the application's Lenso UI theme.
The host router matches the explicit routes, including the detail parameter.
`/` is this application's choice of index, not a Shell default.

Auth capabilities come from explicitly selected administrator services. The
framework candidate adds `createSessionAdministration` in `@lenso/auth/sessions`
for bounded session pages, safe detail reads and revision-checked, audited revoke.
Inject that service through the adapter's `administration` option; the existing
application-owned repository seam remains supported. Missing capabilities
contribute no routes or navigation. Passing clients for workforce
and customers does not authorize copying an actor between those Auth instances.
Configure server services in a separate application assembly file using
`@lenso/auth-console/server`, exact running instances and trusted staff policy.

For a standalone host, replace the injected catalog/Auth clients with whatever
real services that host explicitly trusts; it need not start Lenso. An empty
`ConsoleShell` needs only the host router. Dashboard and navigation preferences
remain separate stores. Memory storage is suitable for local examples, not a
durable multi-device CAS guarantee.

For durable Dashboard layouts, select `/server/sqlite`, `/server/postgres` or
`/server/d1` from `@lenso/console-dashboard`. Schema initialization is explicit.
The optional `/server/auth` and `/server/audit` adapters connect trusted ownership,
versioned policy facts and strict Audit receipts. Keep this server assembly
separate from `composition.tsx`; never put actor, tenant or audit credentials in
the browser's layout document. See the Dashboard package README for the complete
scope, replay and uncertain-outcome contracts.

The new adapter and UI packages are candidate source, not published packages.
Use built candidate archives for external application integration until their owners
authorize release; do not add sibling framework source overrides.
