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
Shell and `examples/ts-console` backend unchanged. Open
`http://127.0.0.1:5175/review` for the complete page directory, or follow
**Sample preview · all pages** above the content. This is an explicitly labelled
sample-data review host, not a complete backend assembly. Do not expose it to a
network or enter real credentials.

### Page coverage

The directory links to every route below, including representative detail IDs.
Existing package pages are reused, not copied into mock screens.

| Surface | Routes |
| --- | --- |
| Dashboard and widget editors | `/` |
| Plugin list and detail | `/plugins`, `/plugins/sample-local/sample-auth` |
| Orders | `/orders`, `/orders/manage`, `/orders/status`, `/orders/detail/sample-order-1` |
| Workforce Auth | `/workforce`, `/workforce/subjects`, `/workforce/sessions`, `/workforce/sessions/sample-workforce-1` |
| Customer Auth | `/customers`, `/customers/subjects`, `/customers/sessions`, `/customers/sessions/sample-customers-1` |
| Identity directory and user detail | `/identity`, `/identity/users/sample-operator` |
| Console members, permissions and roles | `/access`, `/access/roles` |
| Personal tokens, credential dialogs and events | `/agent-connections`, `/agent-connections/events` |
| Authorization inspection | `/authorization` |
| Runtime diagnostics, capability schemas and greeting trial | `/runtime` |
| OAuth applications and consent | `/connected-applications`, `/oauth/consent/sample-request` |
| Standalone login/status screens | `/review/auth/unauthenticated`, `/review/auth/expired`, `/review/auth/forbidden`, `/review/auth/unavailable`, `/review/auth/loading`, `/review/auth/error` |

Administration and OAuth changes affect browser memory only. Token delivery uses
the literal `SAMPLE_ONLY_NOT_A_VALID_CREDENTIAL`, never a usable credential. The
displayed MCP resource is `https://sample.invalid/mcp`; no MCP endpoint exists.
Runtime diagnostics and greeting results are sample responses, not observations
of a running kernel. Login submits no network request and returns to the page
directory; its form must receive disposable sample text only.

The SDK-authored pages receive the public `WorkspaceScope`/scoped-read contract
from `review-workspace.tsx`, with a separate cache per activation. Their production
transport, cookie policy and admission fences are not simulated by this host.

The directory separates Workspace, Administration and Authentication, with modules
and page links aligned within each section. It retains all 31 destination links.
Orders, administration, inspection and OAuth page code loads on first visit;
navigation declarations and sample clients remain stable across those imports.
Shared React, UI, Motion and grid dependencies have separate cacheable chunks.
CSS stays shared, and the build's large-chunk warning threshold is unchanged.

Access and Agent tab groups are declared by the host, like Orders. Their page
components use `tabs="host"` so navigation keeps the same Shell tab surface
instead of replacing a page-owned contribution. Compiled workspaces retain the
default `tabs="workspace"` behavior.

Agent connections uses a token list with modal creation and a detail drawer for
permissions, rotation and revocation. MCP setup is available from the bottom-left
information button. Events keeps the table focused on action, subject, time and
result, with full records in a drawer. Both retain server cursor navigation;
neither offers a misleading search over only the currently loaded page.

Authorization separates policy roles and bindings into read-only tables, with
scope/revision information in a corner popover. Runtime keeps declared
capabilities distinct from live diagnostics; schemas open in a drawer and the
restricted greeting trial opens from the flask button. Connected applications
supports searching the complete grant list, inspecting a connection in a drawer,
and confirming revocation without leaving that context.

The Dock's **Expand Dock** button morphs the bar itself into its full directory,
including the original Dashboard/Plugins/Orders/Auth destinations and the added
Identity, Access, Agent, inspection and OAuth destinations.
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
The sample notice links back to the page directory from Console's host foreground
layer. Use `?theme=dark` or `?theme=light` when opening a page to review its theme.
These clients are not examples of trusted server-side authorization or durable storage. Plugin inventory is
read-only, not a Marketplace installer.

Vite uses the packages' `lenso-source` export condition and explicit local
Auth React, administration and OAuth entry aliases (that package has no source
condition). Auth source edits hot reload. Console React uses its built entry to avoid the current StyleX
development media-query transform failure; its JS and stylesheet aliases must
both point to the same built output. A `lenso-source` stylesheet is intentionally
empty when the source graph supplies StyleX, so pairing it with compiled JS loses
layout and focus rules. Rebuild Console React after Shell changes.
SDK/type exports and infrastructure styles still require the initial builds above.

The full-page Subjects, Orders Manage and By status views share Console's corner
search and transactional filter-state control. Queries operate on complete
authorized client snapshots, not on one server page. Applied order queries clear
the bulk selection; drafts and cancellation do not. Status percentages retain
the complete order snapshot as their denominator. Sessions keep their real
forward cursor controls and do not pretend to support server-side filtering.
Orders Overview and detail/diagnostic tables retain their embedded or mixed roles.

### Development checks

Use `bun run dev:composed` and inspect the affected page while iterating on UI/UX.
Starting the preview does not run tests. Visual edits do not require a preview
test suite, CSS assertions, animation-frame sampling or a theme/position matrix.
Check the changed view and relevant interaction directly; do not turn each design
adjustment into a permanent automated constraint.

Use these checks only when their contracts change:

```sh
bun run check:composed
bun test examples/composed-console/sample-clients.test.ts
bun run --bun vite build --config examples/composed-console/vite.config.ts
```

Two opt-in browser regressions remain for specific failures that model tests
cannot expose:

- `dashboard-drag.browser.mjs`: held pointer movement must update the grid before
  release, and the resulting layout must survive save.
- `dashboard-lifetime.browser.mjs`: permission changes must retire pending reads
  and writes even when the parent activation remains live.

Run either with Bun only when changing that behavior. They require Playwright
Chromium and a running preview; set `COMPOSED_PREVIEW_URL=http://127.0.0.1:5175`
for the default preview port. They are not startup checks or a general UI gate.
Backend authorization, isolation, CAS and archive-consumer coverage remains
independent of this visual preview.

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
