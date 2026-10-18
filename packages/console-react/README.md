# Standalone Console React

`@lenso/console-react` is a frontend shell, not an Engine runtime or router.
Import `@lenso/tokens/styles.css` and `@lenso/console-react/styles.css` in the host.
The published JavaScript contains lowered StyleX styles; consumers do not need
to compile the package's source.

Hosts with a separate login entry can import
`@lenso/console-react/login/styles.css` there and load the complete
`@lenso/console-react/styles.css` with the admitted workspace. The login sheet
contains the login surface and shared layout, without Shell or Dock rules.
With the `lenso-source` export condition, both stylesheet entries defer to the
host's StyleX extraction instead of duplicating precompiled rules. That host
must extract styles for its actual module graph and load lazy component styles
before revealing those components.

```tsx
import { bindConsole, ConsoleShell, defineConsolePlugin } from "@lenso/console-react";
import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";

const records = defineConsolePlugin<{ list(): Promise<string[]> }>({
  id: "records",
  pages: { list: { component: RecordsPage } },
  navigation: [
    { id: "records", label: "Records", page: "list", defaultPlacement: "primary" },
  ],
});

const plugins = [
  bindConsole(records, {
    id: "primary-records",
    routes: { list: "/records" },
    services: recordsService,
  }),
];

<ConsoleShell plugins={plugins} router={hostRouter} basePath="/console" />;
```

`router` supplies `pathname`, `navigate(href)` and `match(pattern, pathname)`.
Patterns and generated links are base-qualified. Binding route paths are local
to `basePath`; do not prepend the base yourself. Parameters use `:name` segments.
Ambiguous static/parameter paths, duplicate normalized paths and duplicate
binding IDs fail assembly rather than depend on matcher ordering.

Definitions can be installed repeatedly with different binding IDs, routes and
typed services. Page navigation is local to its binding. Only explicit
`navigation` entries enter the global catalog; tabs and detail pages do not.
Page groups declare their default tab and explicitly map related detail pages
to an active tab. Lenso UI Tabs render route anchors, preserving modified clicks
and providing arrow-key navigation. By default they occupy the top Context Bar;
The UI tab scroller keeps additional tabs reachable. `tabsPosition`
may select another edge or `"content"`; `topEdge` forwards the existing layout
effect options. Fixed corner rows compose multiple `Corner` children without
overlapping independent contributions or losing their React context.

### Plugin settings directory

An application can explicitly install a navigation-only Settings page:

```tsx
const provider = defineConsolePlugin({
  id: "author-provider",
  pages: { connections: { component: ConnectionsPage } },
  settings: [{
    id: "connections", page: "connections", label: "Connections",
    description: "Configure your author account",
    group: { id: "providers", label: "Providers" },
  }],
});
const plugins = [bindConsole(provider, {
  id: "author-provider", services: ownerServices,
  routes: { connections: "/author/connections" },
})];
<ConsoleShell plugins={plugins} router={hostRouter} settings={{ path: "/settings" }} />;
```

Entries target existing static bound pages. Duplicate local IDs and missing or
dynamic targets fail assembly. The host's existing `canAccess(bindingId,pageId)`
filters entries and routes; admit `console.settings` / `index` to expose the
directory itself. A registered page receives a Settings return context unless
the Plugin supplies its own. Plugins retain the second-level UI, service scope,
write validation and existing change callbacks. No values or drafts are stored
by this directory. `status` is optional safe static display text, never secrets.

`ConsoleSettingsDirectory` is also the public presentation used by the compiled
SDK host. External hosts supply already-admitted `{id,label,href,...}` entries,
`navigate`, and an `isCurrent` lease check. Directory visibility grants no service
permission. Directory-authored SDK applications register through
`defineWorkspace.settings`; they do not need local React bindings.

### First-time initialization

`ConsoleInitialization` presents the opt-in Core initialization status and one
recoverable setup flow. It installs no HTTP routes, Auth fallback, account store,
secret provider or deployment controller. Register a Plugin-owned second-level
page through the Settings contract above; an incomplete application instead needs
an independently admitted minimal bootstrap host, before business Auth starts.

```tsx
import { ConsoleInitialization } from "@lenso/console-react";

function SetupPage({ services, signal }) {
  const setup = services.initialization; // supplied by this trusted application host
  return <ConsoleInitialization
    scopeKey={setup.scopeKey} signal={signal} target={setup.target}
    client={setup.client} requestId={setup.requestId}
    draft={setup.nonSecretDraft} onDraftChange={setup.updateNonSecretDraft}
    form={OwnerSetupForm} repair={setup.repairInstructions}
  />;
}
```

The application's stable `OwnerSetupForm` uses existing Lenso `Form`, `TextField`,
`Input`, `FieldError`, etc. Its `ConsoleInitializationFormProps<Input,Draft>`
receives a controlled **non-secret** `draft`, `onDraftChange`, and `onSubmit(input)`.
Keep password/key state inside that form; it unmounts on close, submission and
retirement. The host retains only explicitly selected non-secret fields and a
stable request ID, scoped by the trusted instance/owner. No browser storage,
URL, global form cache or polling is installed. The request ID is idempotency
metadata, never authorization. See the concrete native-sample form and Settings
binding in `test/browser/initialization.fixture.tsx`.

The injected `ConsoleInitializationClient<Input>` has `status({signal})`,
`apply({requestId,input},{signal})`, and `activate({signal})`. This is a transport
adapter, not Core's authorization contract. The server must independently verify
current, short-lived, target-bound bootstrap evidence for **each action**, then
call the existing `initialization.status(evidence)`, `apply(request,evidence)` or
`activate(evidence)`. Never expose native `initializationBinding` to a browser or
accept a JSON actor, UI lease, first visitor or ordinary pre-initialization Auth
as that evidence. Abort does not roll back a dispatched write.

The flow renders `uninitialized`, `blocked`, `awaiting_activation` and `ready` from
the fixed version-1 DTO. Callback extras and raw error/diagnostic messages are
discarded. Unavailable status is never treated as a new instance. A synchronous
lock blocks repeated submissions; failed/unknown mutations require a fresh status
before retrying. A committed revision offers activation without re-entering
credentials. Ready closes first-owner input and means qualification for startup,
not a running server, validated upstream provider key or billing operation.

Native and Workers are host labels, not inferred capabilities. Workers blockers
point to supplied existing deployment-owner instructions. Uploading a secret is
not considered activation; only the host's current status qualifies the selected
revision. This UI cannot stage platform credentials or repair missing D1 adapters.

**Current integration gaps:** Core candidate
`8934209473a75bd886f259d9dec37231a48c9aed` and native CLI candidate
`2eed5d6c6d818e12fee8333c525baeaa4455cd33` are unpublished. Registry Core 0.3.1
does not provide setup. They supply no production browser bootstrap route,
remote authorization issuer, input-form descriptor, or Workers claim/deployment
adapter. Those remain application-owner work. Core's invalid-input error does not
carry a field-error DTO, so this flow keeps it at form level; it does not invent
field mappings. A host with no client/form receives an honest connection/owner
guide with no submit action. This package adds no Core source override.

### Login presentation

`ConsoleLogin` is the default, replaceable login/status surface. It needs no
Plugin binding or Auth-domain import. A host supplies admission state, discovered
method descriptors, and callbacks; the SDK's `useConsoleAdmission` in
`@lenso/console-sdk/browser` supplies those for cookie-backed Console hosts.
Standalone `ConsoleShell` remains presentation-only: applications choose their
authentication guard explicitly.

Password entries use Lenso UI inputs with browser autofill. Redirect entries call
the host redirect callback. `renderers` selects trusted local components by custom
`renderer` key or built-in method kind. A renderer calls `onCustom(method, input)`
for a host-owned POST flow; discovery never supplies executable UI.
`renderPage(props)` replaces the whole login/status page, including forbidden and
unavailable states, rather than installing an Auth administration page:

```tsx
<ApplicationConsoleGate
  login={{
    allowedReturnRoots: ["/console"],
    renderers: { "device-code": (method, props) => (
      <DeviceCodeLogin method={method} onSubmit={(input) => props.onCustom?.(method, input)} />
    ) },
    renderPage: (props) => <ApplicationSignIn {...props} />,
  }}
>
  {(session) => <ApplicationWorkspace session={session} />}
</ApplicationConsoleGate>
```

`ApplicationConsoleGate` is the checked local example in
`examples/ts-console/login.tsx`; the named custom components above are supplied
by the consuming application. Remove `renderPage` to retain the default surface
and use only the extra entry. Custom UI must retain cancellation, visible errors,
keyboard access, and the unavailable-versus-unauthenticated distinction.

### Local Dock views

Plugins may contribute `dockViews` independently of pages. The application
chooses leading order explicitly through `ConsoleShell.dock.leading`, separately
from navigation preferences and installation order. Dock-only definitions use
`pages: {}` and bindings use `routes: {}`.

Leading controls retain the application's explicit order. Capacity reserves the
navigation-directory entry and, when needed, a **More Dock views** entry.
That separate menu keeps remaining views available in order, including with no
navigation pins or during selection. It uses a themed portal outside the Dock
clip; views are not lost in the navigation-only directory. Capacity follows the
actual control size, safe-area padding, and available viewport axis. The Dock
does not add an internal horizontal scroller.

```tsx
import { useRef, useState } from "react";
import {
  bindConsole, ConsoleDockContent, ConsoleShell, defineConsolePlugin,
  type ConsoleDockViewProps,
} from "@lenso/console-react";

type ComposerServices = { send(text: string, signal: AbortSignal): Promise<void> };

function Composer({ services, signal, activation, dock }: ConsoleDockViewProps<ComposerServices>) {
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function send() {
    if (!activation.isCurrent() || running || !draft.trim()) return;
    setRunning(true);
    setError(null);
    try {
      await services.send(draft, signal);
      if (activation.isCurrent()) setDraft("");
    } catch {
      if (activation.isCurrent()) setError("Message could not be sent.");
    } finally {
      if (activation.isCurrent()) setRunning(false);
    }
  }
  return (
    <ConsoleDockContent
      initialFocus={input}
      beforeExit={() => !running}
      bar={
        <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <input ref={input} aria-label="Message" value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => dock.expand()} />
          <button disabled={running || !draft.trim()}>Send</button>
        </form>
      }
      tray={{ label: "Conversation", content:
        error ? <p role="alert">{error}</p> : <p role="status">
          {running ? "Sending message." : "Messages will appear here."}
        </p>
      }}
    />
  );
}

const composer = defineConsolePlugin<ComposerServices>({
  id: "composer", pages: {},
  dockViews: [{ id: "compose", label: "Composer", icon: composerIcon, component: Composer }],
});
const composerBinding = bindConsole(composer, {
  id: "local-composer", routes: {}, services: composerService,
});

<ConsoleShell plugins={[composerBinding]} router={hostRouter}
  dock={{ leading: [{ bindingId: "local-composer", viewId: "compose" }] }} />;
```

`composerIcon`, `composerService`, and `hostRouter` are supplied by the app.
This is local React composition, not Agent service installation, remote
registration, a capability registry, or a server authorization grant.
`session.canAccessDockView(bindingId, viewId)` is an independent UI projection;
Dock admission never calls `canAccess` with invented page IDs.

Each admitted view mounts lazily once and retains its owner and bar across
bar/tray changes, exit, and route changes in the same trusted session. Portals
preserve providers contributed by the view. `dock.state` is `"inactive"`,
`"bar"`, or `"tray"` for the current render, not a live getter. Read it from
the latest props rather than retaining an old render's snapshot in a subscription.
Controller methods remain lease-checked and operate on the committed presentation;
`expand()` and `collapse()` return whether a transition was accepted.
`requestExit("back-button" | "escape" | "navigation")` uses the optional
`beforeExit` guard. Rejected or failed guards leave the view open;
late resolutions cannot close a replacement presentation.

Actual route changes close presentation without a guard, retaining the local
draft. Admission loss, a scope change, or definition/service identity replacement
revokes the activation, aborts its signal, and discards the old view instance.
Plugins own business state, server policies, and disposal of subscriptions.
Stable definitions and service objects avoid accidental identity replacement.
Shell provides Back and Expand/Collapse controls, focuses `initialFocus` only
when the bar is ready, and leaves expansion to explicit controls or the plugin's
real focus handler. Trays are nonmodal, including on narrow screens.
When a narrow screen hides the sidebar, the contextual Dock retains plugin
entries without duplicating navigation pins; global navigation keeps its corner entry.

Dock views can temporarily replace non-running selection presentation without
clearing it. Exit restores the current contribution, not a saved snapshot.
Use selection `running` during execution and optional `blocked` during
confirmation to prevent opening another view and yield an active view.
Launcher and Command temporarily suspend rich presentation without discarding
the plugin owner or draft. They share one measured shape, physical clip and
interaction guard; keyboard/reduced-motion changes remain immediate.

Compiled SDK definitions and `ConsoleInteractionHost` do not install local
plugin Dock views. Exporting `ConsoleDockContent` into an admitted workspace
does not provide its required view host. An application must explicitly compose
local bindings into `ConsoleShell`; this adds no compiled descriptor field.

### Destination names and descriptions

`navigation[].label` is the single source of truth for the visible name in the
sidebar, launcher, and pin editor, and the accessible name in the icon-only Dock.
It is required and does not fall back to a tooltip or a page title.
`navigation[].tooltip` is an optional supplemental hover/keyboard-focus description.
Omitting it preserves existing behavior: the icon-only Dock explains the label,
and labelled links do not add a redundant tooltip. Page `title`, group `label`,
and tab `label` continue to describe their own location/page scopes.

```tsx
navigation: [
  {
    id: "workforce",
    label: "Workforce",
    tooltip: "Inspect workforce authentication information",
    page: "info",
  },
]
```

The Dock's separated **Expand Dock** entry opens the full navigation directory
by morphing the Dock's own surface into a non-modal tray, not an adjacent popup.
Motion layout projection preserves the selected docking edge and can reverse
in flight; keyboard and reduced-motion changes are immediate. Lenso Popover
retains directory focus and dismissal behavior inside that local surface.
The launcher shows the current preset first, then **All destinations** excluding
those already shown. Search covers the entire permitted catalog. Quick controls
include **Customize navigation** and separate **Navigation settings** for mode
and position. Customization shows only the current preset's ordered collection,
with **Save** and **Cancel** at the top. Removing a tile removes it from this
collection, not from the catalog. A trailing **Add destinations** tile opens a
searchable picker; existing members are marked **Added** and cannot be duplicated.
Holding a Dock or launcher destination for 550ms
also enters editing. Movement beyond 8px cancels that hold, allowing touch
scrolling; navigation after a held/moved gesture is suppressed. Grips capture
pointers on the stable collection and support touch. A themed, unclipped lift
follows the pointer while siblings animate into their new slots. Escape or
pointer cancellation restores the order from before the drag. Focused grips
support arrow-key reordering with retained focus and position announcements.
**Preset actions** contains rename, create, and confirmed delete. Switching
presets inside editing retains every change in the same draft; Save and Cancel
apply to the complete draft. New presets start empty and can be named for any
purpose; they never uninstall destinations or delete business data.
Cancel or Escape discards the editor draft; outside dismissal cannot drop it. Save
commits it through the host store; a failed save keeps editing open with the
draft intact. Cancel or save returns to the launcher and focuses its
originating customization/settings entry; search text is retained. Escape from the launcher closes
the tray and restores focus to the opening control. Search and dismissal remain
outside the bounded destination scroller; the normal bar never scrolls. The corner navigation
button is hidden in normal Dock browsing; `navigationButton` opts into showing
it as well. Sidebar mode and selection actions retain the corner entry so the
directory and presentation preferences remain reachable without a navigation Dock.
Host `children` can contribute existing `ConsoleLayout.Corner`/`Foreground`
content, such as a local preview marker, inside the Shell's layering context.

The optional `session` projects trusted host access checks into the UI.
Changing its `scopeKey` revokes the old page activation and aborts its signal;
leaving a page or replacing its definition/services also revokes it. Late
results must check `activation.isCurrent()`. Aborting does not undo a write.
Changing presentation preferences does not remount pages.
Low-level hosts can use `useConsoleActivation(scope, parentSignal)` with the
same lifecycle rule. The SDK's admitted and preview hosts use it as well.

### Command view

Cmd+K on Mac (Ctrl+K elsewhere) opens **Command inside the Dock surface**,
independently of preset count, navigation presentation, and selection scope.
The launcher and desktop sidebar also provide a labelled Command entry.
It is not the More Launcher and does not open a separate top modal.
Repeated invocation focuses the existing search input without resetting its query.
The input focuses immediately; keyboard opening/restoration does not animate.
Tab reaches results, ArrowDown from the search focuses the first enabled result,
and Enter in the search invokes the first enabled match.

Results are grouped into opt-in current-page actions, permitted navigation
destinations, and actual Dock presets. There is no implicit business-data search,
action discovery from arbitrary controls, or executable preference content.
Destination commands use the host `router.navigate`, including its dirty-page
and running-action guards. The host router remains the navigation authority.
Preset commands use the same preference persistence as the launcher selector.

Escape closes the innermost overlay first. Closing Command restores the previous
Dock view: the launcher keeps its query, editor draft, open picker and focus;
navigation/selection restores its current geometry and scope, not a stale snapshot.
Selection and page contributions remain live while Command is open. Opening it
never clears a selection or remounts a page. IME composition, repeated keys,
already-handled shortcuts and open inner dialogs/menus do not invoke Command.
Ordinary text input is eligible, unlike preset-switching shortcuts.

### Externally routed host integration

`ConsoleInteractionHost` is the public presentation seam for admitted and SDK
preview pages. Place it inside `ConsoleLayout`, pass the authorized host router's
`pathname`/`navigate` and the mount lifetime `signal`, and render the page as its
children. It consumes selection and page contributions using the same Dock,
Command, Context Bar, shortcut guards and focus restoration as local Shell.
Pass `destinations` (stable `id`, visible `label`, authorized `href`, SVG `icon`)
to show host-supplied navigation in the Dock and Command. The bar shows up to four
destinations; Command reaches the full supplied list. The host derives these
entries from admitted navigation, not page commands or service discovery.
It adds no destination discovery, preset store or navigation editor.
The host remains responsible for admitted routes, services and navigation guards.
Mount/session changes must retire the host lifetime.

These APIs belong to the updated local candidate; verify the actual installed
host before using them with an older artifact.

### Table controls and contextual defaults

The repository's full-page table surfaces use this shared presentation:

| Surface | Query ownership and controls |
| --- | --- |
| Identity | Directory-supported name/status expression evaluated before cursor pagination |
| Plugins | Search and filter over the complete admitted catalog snapshot |
| Auth Subjects | Search and filter over the complete authorized `listSubjects` snapshot |
| Auth Sessions | Real cursor/append navigation; no unsupported query controls over a partial page |
| Observed events | Real cursor navigation; the current service rejects search, so no fictitious filter is exposed |
| Orders Manage | Complete client snapshot, scoped search and filters; only applied changes clear selection |
| Orders By status | Filter aggregate rows while retaining the complete snapshot as the percentage denominator |

Permission/credential forms with tables, Runtime's multi-section diagnostics,
capability directories and object-detail tables remain mixed or embedded surfaces.
They are not silently converted into full-page collection editors.
The Orders pages are an explicit sample host, not installed business routes in
the TypeScript operator host.

`ConsoleTableContext` declares a table's content scope and semantic operation
groups. `ConsoleLayout` supplies the shared coordinator; `ConsoleShell` uses
that same layout. Both local and compiled pages import the public
`@lenso/console-react` entry. Business query, paging, selection and write state
remain with the page.

```tsx
<ConsoleTableContext
  scopeKey={activation.key}
  label="Identities"
  mode="page"
  locked={saving}
  filters={{
    label: "Filter identities",
    fields: availableFilterFields,
    value: filterTree,
    onValueChange: updateFilterTree,
  }}
  groups={[
    { id: "query", kind: "query", label: "Search and filters", children: queryControls },
    { id: "paging", kind: "navigation", label: "Pagination", children: pagination },
  ]}
>
  {table}
</ConsoleTableContext>
```

Groups have stable owner-local IDs and accessible target-qualified labels.
Use `ConsoleTableSearch` (`label`, controlled `value`/`onValueChange`, optional
`disabled`) for the default compact search: an SVG button expands in place,
focuses the search field and keeps the page's filter when collapsed. Escape
returns focus to the button; a live filter remains indicated there. Pointer
opening/closing uses a short clipped reveal, without scaling text or moving
table rows. Keyboard and reduced-motion operation are immediate.
Use `ConsoleTableContext.filters` for the condition builder. Its `fields` registry
declares stable IDs, labels and supported text, enum, numeric or calendar-date rules.
The controlled `value` is a `ConsoleFilterGroup` with an `id`, `operator: "and" | "or"`
and `children` containing conditions or groups. `onValueChange` stays page-owned.
Choosing an available field starts a query draft, not a request. Text fields can declare `maxLength`
to match their owner contract.

The corner contains one compound filter-state control, defaulting to the top right.
It shows Filters when inactive, a readable summary for one simple condition,
or Custom filters with a condition count for complex expressions. Boolean groups
are not flattened into a misleading sentence. The accessible name includes the
target label and visible state; a hover/focus tooltip preserves the full text.
Individual condition/group buttons are not projected outside.
The entry opens an editor containing the complete tree from its root:
title, Match logic, condition rows, nested groups and local add actions all stay
inside that panel. This single-entry presentation also applies to the flat API.
The whole panel edits one draft. Adding, editing, removing, changing logic or
collapsing rows/groups never calls the page's change callback. Apply filters
validates the complete tree and publishes it once. Invalid conditions stay in
the panel with field-associated errors and keyboard focus.
Cancel, Escape, close and outside dismissal discard the session without changing
the applied query. Clear resets the draft to an empty AND root; it also requires
Apply filters. Enter in a value field only collapses that row, not the panel's
transaction. There is no per-condition Apply or global Done.
Set `filters.disabled` while the table owner is executing a guarded operation.
It disables opening and applying filters, while cancellation remains available.
The page still owns activation/write guards; this UI flag is not authorization.

The host measures available corner space, avoids the task context and search,
and reserves only the actual top clearance needed by the controls. Scrolling
does not increase this clearance. A draft locks its active table context and
stays controlled by the filter component, including through placement changes.
`ConsoleTableFilters.renderGroup` projects the complete group, not only its entry.
The root panel uses a vertical editor presentation: a Match all/any header,
a vertical list of condition rows, and local Add condition / Add group actions.
Conditions edit inline within that list. Child groups are labelled, nested
fieldset containers in the same panel, not more summary buttons or stacked
editor popovers. Nested groups can collapse in place without changing their data.
Fields may repeat, including within one OR group. Trees are bounded to four group
levels and 50 total nodes. Empty editing groups contribute no predicate, including
inside OR. Removing a group removes its subtree and focuses the parent's add control.
Closing restores focus to the single filter entry.
Desktop uses an anchored Lenso UI Popover. At 600px and below the same draft is
presented in a near-full-screen Lenso UI Modal with focus trapping. Resizing an
open editor preserves its query data. Header and footer remain separate from
the scrolling body; nested groups use structural boundaries instead of shrinking
stacks of cards. Modal dropdown portals stay within its accessible boundary.
The earlier `conditions`/`onConditionsChange` form remains available for flat,
one-predicate-per-field AND service contracts. It uses the same entry and panel,
but keeps Match all fixed and omits unsupported Boolean/group controls.

Numeric ranges require finite ordered bounds. Date fields declare
`kind: "date"` and supported operators `on`, `before`, `after`, `between`. Values
are valid `YYYY-MM-DD` calendar dates; before/after are strict and ranges include
both endpoints. Lenso `Input type="date"` uses the browser's native date entry/calendar.
Owners decide which calendar/timezone a timestamp belongs to before comparing it;
the component does not silently truncate local timestamps or invent relative-date rules.
`evaluateConsoleFilter` evaluates a tree with an owner-provided condition matcher;
`matchesConsoleFilterDate` applies the calendar rules. These are not a backend query engine.
Pages bind finalized predicates to an explicitly capable service (before paging)
or to a complete admitted snapshot. Show only actual owner-supported date fields.

Defaults place `query` (quick search) at top left and `filter` at top right.
Both entries share the same desktop/coarse-pointer icon-button geometry.
Moving focus into filtering collapses expanded quick search without clearing it.
If a narrow viewport leaves no readable expansion width, search opens below the
occupied corner row instead of covering conditions.
`insertion` and `commit` default to top right,
`view` at bottom left and `navigation` at bottom right. Omit nonexistent
capabilities. Pagination uses the actual service contract: a forward cursor
does not imply totals, previous pages or arbitrary page jumps.

For a mixed-content page, use `mode="embedded"` around the table rather than the
whole article. The shared host observes document and nested scrolling, clips
viewport eligibility to ancestor scroll bounds, and uses enter/exit coverage
and dwell before switching. Focus, explicit context choice, open menus/dialogs,
pointer-down and `locked` protect the current target. Unmount/scope replacement
retires registration; leaving an embedded table restores the page candidate.
Keep the page-level scope around mixed content if it has fallback controls.
Small embedded tables also expose an explicit, keyboard-accessible activation
button. Context switching never replaces the table content or business state.

Business pages do not show a layout/configuration button by default. Hosts can
opt into `tableControls.customization: true` to expose the active table's
**Table controls** popover for automatic/explicit context and per-kind placement,
including **Beside content**. A group's optional
`placement` changes its default; user choices take precedence. Defaults leave
unused corners empty. These are table-specific groups, not a universal action
registry, chart coordinator or another Dock.

`ConsoleLayout.tableControls` (also `ConsoleShell.tableControls`) accepts
`customization`, `enterCoverage`, `exitCoverage`, `dwellMs`, and optional controlled `placements`
with `onPlacementsChange`. Without controlled placements, choices last for this
layout lifetime. Hosts may persist the bounded placement map in their own
trusted preference store; no business state, activation IDs or credentials
belong in it. Controlled placements without a change handler are read-only.
This preference is separate from navigation presets and does not imply a
new server persistence contract.

### Scoped task context and page commands

`ConsolePageScope` projects one active page contribution through the same local
host as selection actions. It does not own business state. A page can consume
its own `createConsolePageContext<T>()` handle and derive this projection from
the controlled committed state; there is no second global page store or control registry.

```tsx
import { ConsolePageScope, type ConsoleLocalPageProps } from "@lenso/console-react";

function OrderContext({
  activation, navigation, order, filter, clearFilter,
}: Pick<ConsoleLocalPageProps, "activation" | "navigation"> & {
  order: { id: string; status: string };
  filter: string;
  clearFilter(): void;
}) {
  return (
    <ConsolePageScope
      scopeKey={activation.key}
      value={{
        context: {
          kind: "object",
          label: "Order",
          id: order.id,
          status: order.status,
          return: {
            label: "Return to orders",
            onInvoke: () => navigation.go("list"),
          },
        },
        commands: [{
          id: "clear-filter",
          label: "Clear order filter",
          disabled: !filter,
          onInvoke: clearFilter,
        }],
      }}
    />
  );
}
```

Omit `context` to retain the plugin's existing `pageGroups` tabs. Use
`{ kind: "hidden" }` to explicitly hide task context, or
`{ kind: "tabs", label, activeId, tabs: [{ id, label, href }] }` to contribute
task-specific route tabs. Use `navigation.href(...)` for binding-local links.
Tabs use the guarded host router and preserve modified anchor clicks. The page
must contribute only tabs/actions it is allowed to show; presentation is not
server authorization.

Object context shows a label, optional identifier, and optional real status.
Tabs and objects may provide an explicit labelled `return` action. No history
Back or inferred parent route is supplied. The Shell owns centering in the main
region, responsive clearance, and the return control's short interruptible
split transition; keyboard/reduced-motion changes are immediate. Explicit page
context replaces the fallback even when `tabsPosition="content"`.

Use `activation.key` as `scopeKey`; unmounting or changing it revokes the old
projection. Retained command/return handles become inert, and stale cleanup
cannot remove a newer owner. IDs are local to the current page contribution.
An old handle in the same live scope reads the current committed callback and
disabled state. Page code still owns target snapshots, permissions,
confirmation, locking, errors, and asynchronous outcomes. Opt a command in only
when it reuses that existing execution path. Selection actions are not
automatically searchable; the Orders example contributes clear-filter but leaves
archive behind its existing selection and confirmation workflow.

Pages contribute controlled selection actions with
`<ConsoleActionScope scopeKey={activation.key} value={selection} />`.
`selection` is the existing `ConsoleDockSelection` shape: count, scopeLabel,
actions with onInvoke, running and onExit. The page owns target snapshots,
confirmation, execution and feedback. The host protects retained callbacks,
stale cleanup and pointer-down/up across retiring scopes.

`navigationDefaults` selects initial pins, mode and position. A preference
snapshot of `null` uses defaults; `pinned: []` intentionally pins nothing.
Defaults seed a scope once; later installation does not insert new primary pins.
`dockPresets` is an optional versioned document containing `version: 1`,
`activeId`, and `presets: [{ id, name, pinned }]`. Legacy snapshots migrate to
one **Default** preset without replacing explicit empty pins or unavailable
references. `pinned` mirrors the active preset for existing readers; writers
must keep that projection coherent with the active preset. Presentation mode
and position remain global, not duplicated in every preset. Names are user
copy, not contribution labels, and transport projects only bounded names,
stable references and presentation fields, not unknown metadata or components.
Unknown or temporarily forbidden pin references remain stored but do not
expose labels. Keyboard move controls and dragging change the same order.
Saving uses the last loaded revision. Failed saves retain the local draft;
explicit Reload discards it. Preset selection and quick presentation switching
save immediately, while editing uses an isolated save/cancel draft. Hosts
without a store retain preferences only for this mounted Shell.
Store adapters must preserve and echo the complete projected preset document;
a response that drops/changes explicit preferences is treated as a failed save,
not a successful migration back to legacy pins.

### Preset switching

The labelled **Dock preset** selector is always available in the launcher.
Outside input/select/contenteditable fields and composition, Cmd+Option+1–9
on Mac or Ctrl+Alt+1–9 elsewhere selects the corresponding preset by order.
AltGraph, repeated keys, Shift and extra modifiers are excluded. Cmd+1–9
and Ctrl+1–9 remain native browser tab shortcuts; no plain digit is intercepted.
Hosts should check OS/accessibility/browser extensions that reserve the
recommended combination and use the selector when it conflicts.
Holding Cmd alone for 550ms reveals previous/next chevrons at the ends of the
navigation Dock; other keys cancel the hold, and key release, window blur and
tab hiding exit it. A quick copy/tab shortcut never flashes switching UI.
Preset switching is disabled during page selection/running actions or while
the launcher is open. It changes pins only, not the route, page lifetime,
selection, placement or permission access. Keyboard/reduced-motion changes
are immediate; the existing shared Dock indicator and morph remain intact.

`renderStatus(status)` may replace the minimal empty, loading, sign-in,
forbidden, unavailable, not-found and page-error surfaces.

## Checks

- `bun build.ts` lowers StyleX and emits `dist/index.js` and `dist/styles.css`.
- `bunx tsc -p tsconfig.build.json` emits declarations.
- `bunx tsc -p tsconfig.json` checks source and heterogeneous binding contracts.
- `bun test test/console-model.test.ts` proves composition validation and pin rules.
- After building, `bun test test/browser/console-shell.browser.test.ts` exercises
  the compiled distribution in a real browser. Set
  `LENSO_BROWSER_EXECUTABLE_PATH` when using a system Chromium executable.

The existing Shell imports compatibility re-exports, so standalone pages,
SDK pages and the original layout consume the same React contexts and Dock.
