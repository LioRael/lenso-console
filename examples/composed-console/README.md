# Explicit frontend composition

## Opt-in local sample preview

From the repository root:

```sh
bun install --frozen-lockfile
bun run sdk:build
bun run plugins:build
bun run dev:composed
```

Open `http://127.0.0.1:5175/`. This separate Vite host leaves the production
Shell and `examples/ts-console` backend unchanged. Its bottom-left **Sample preview**
control marks all
data as sample data. No server, credentials, login or production authorization
are involved. Do not expose this development server to a network.

The Dock's **Expand Dock** button morphs the bar itself into its full directory: Dashboard, Plugins,
Orders and both Workforce/Customers Auth information, sessions and subjects.
Session detail is reached from a session link; order tabs and detail links are
also wired. The actual package components and Lenso semantic themes render these
views. Dashboard widget editing/saving, order filtering/archiving, session
pagination/revocation and catalog refresh use typed in-memory sample clients.
Dashboard saves and session revokes check revisions. Business changes reset
on page reload. Scoped Dock presets/presentation persist in this browser's
`lenso.composed-console.local-sample-preview.navigation` local-storage entry
using the same preference snapshot/CAS contract as other hosts. The sample
adapter uses Web Locks on the loopback origin to serialize saves across tabs;
production hosts still own their trusted scoped store and server CAS.
The sample
boundary and theme control compose inside Console's host foreground layer,
below the expanded launcher; there is no permanent top paragraph over the sidebar.
These clients are not examples
of trusted server-side authorization or durable storage. Plugin inventory is
read-only, not a Marketplace installer.

Vite uses the packages' `lenso-source` export condition and an explicit local
Auth React entry alias (that package has no source condition). Auth source edits
hot reload. Console React uses its built entry to avoid the current StyleX
development media-query transform failure; rebuild it after Shell changes.
SDK/type exports and infrastructure styles still require the initial builds above.

Focused validation:

```sh
bun run check:composed
bun test examples/composed-console/sample-clients.test.ts
bun run --bun vite build --config examples/composed-console/vite.config.ts
node examples/composed-console/verify-browser.mjs
```

The browser check requires Playwright Chromium and a running preview. Set
`COMPOSED_PREVIEW_URL` to check a different loopback port. It exercises
navigation, sample writes, keyboard confirmation/dismissal and narrow geometry;
it is not a comprehensive package accessibility or production integration audit.
The host reuses Console's content-first layout, existing Inter typography,
semantic theme colors and restrained package motion to preview real components,
not a parallel visual design.

### Local visual feedback

The development preview lazy-loads [Agentation](https://www.agentation.com/install)
in the browser. Click its bottom-right toolbar icon, click an element, write one
specific note and choose **Add**. Use **Copy** to export Markdown containing the
note and element context, then paste it into this Delta thread. Press **Escape**
to collapse the toolbar and resume normal page interaction.

No MCP endpoint, webhook or telemetry is configured. Feedback stays in browser
local storage until you copy and paste it; annotations can persist across reloads
even though sample business data resets. This is a desktop review tool, not a
mobile preview control.

Direct agent sync is optional, not connected here. It requires a compatible MCP
client, a locally registered `agentation-mcp` server and an explicitly configured
localhost endpoint on the component. Clipboard feedback needs none of these.

Agentation is a development dependency, excluded from production builds and the
published Console packages. Its [PolyForm Shield license](https://github.com/benjitaylor/agentation/blob/main/LICENSE)
and [official licensing guidance](https://www.agentation.com/#licensing) permit
internal project review; redistributing it in a sold product requires separate
commercial licensing. Do not move this toolbar into product distribution.

## Application composition

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
Also import `@lenso/auth-console/styles.css` for the default Auth pages.
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
