# Native Console page contributions

Status: Console- and App-scoped Workspace routing implemented; target service binding deferred.

This document now separates the shipped Workspace path from the remaining
cross-App design. The implementation includes a typed
`lenso.ui.contribution@1` request Capability (descriptor 1.1.0), a `many` Port on
`lenso.console.web`, an immutable activation-time catalog, a reference provider
Plugin, direct primary-rail Workspaces, and a browser runtime API. The contract
crate and reference Plugin are repository-local and are not published releases.

Both default launchers now start the Console lifecycle Plugin through an
immutable Resolved App Plan. Every linked `console-workspaces` package is a
disableable Host default and contributes through its bound Capability Port.
The explicitly untrusted `development-filesystem` adapter remains available
only to direct development/test embedding APIs; default product launch does not
scan `public/contributions`. Connected Apps cannot push code.

Regenerate and verify the checked-in Rust and TypeScript contract projections:

```sh
LENSO_UPDATE_CONTRACT_SNAPSHOT=1 \
  /Users/leosouthey/Projects/framework/.lenso-tools/bin/lenso-cargo \
  check --manifest-path service/Cargo.toml \
  -p lenso-capability-ui-contribution
```

## 1. Design summary

An author supplies a typed Capability provider containing Workspace metadata, a
native React module, and compiled assets. Console snapshots admitted providers
during activation and renders the selected module inside its existing Shell.
A contribution may implement a full multi-page workspace; it is not restricted
to forms, widgets, or an iframe.

The small public interface has three parts:

1. **Capability response:** Workspace identity, revision, navigation, entry
   module, immutable assets, and future typed service requirements.
2. **Workspace module:** `apiMajor: 1` plus `createWorkspace(runtime)` returning
   a root `Page` and optional shared `Provider`.
3. **Workspace props:** immutable mount metadata, scoped navigation, reactive
   theme/locale, location, and an unmount cancellation signal.

The Capability response is the provider declaration. A mount is a Host-derived
projection for a particular owner and contribution. App owners do not
hand-author provider bindings or resolved plans.

Choose one browser history owner, immutable versioned assets, and explicit
service requirements. Do not expose Console's source imports, entire router,
global query client, or Agent state as an extension SDK.

## 2. Current implementation and gaps

Implemented now:

- `lenso.console.web` requires `lenso.ui.contribution@1` with `many`
  cardinality and calls every bound provider exactly once during activation.
- Provider instance identity, revision, declared requirements, and trust source
  are preserved in the catalog. Duplicate Workspace IDs, navigation paths,
  unsafe paths, missing entry assets, oversized assets, and invalid base64 fail
  admission before the server starts.
- Assets live in an owned in-memory snapshot and are served same-origin with
  exact media types, `nosniff`, immutable caching, and no SPA fallback.
- The Shell passes its React singleton, theme, locale, mount-local navigation,
  and cancellation to the Plugin module. A Plugin `Provider` wraps its page so
  internal pages can share state.
- The far-left item is a Workspace. Selecting it reveals only its own declared
  second-sidebar navigation; there is no top-level Tools aggregator.
- App-scoped mounts use canonical `/apps/<appId>/pages/<mountId>/...` URLs.
  Admission rejects unknown App identities and the Shell never substitutes the
  currently selected App for the URL subject. The primary rail shows Console
  Workspaces plus Workspaces for the selected or deep-linked App.
- `service:serve` and `agent:web` both run this composition through the Kernel;
  the bundled Welcome provider proves the real launcher path rather than a
  test-only or custom-embedding path.

Not implemented by this baseline:

- Target-bound business requests. These require the explicit cross-App
  Connector; a Managed App connection is not code-install authority.
- Hot graph mutation. Install, enable, disable, and upgrade publish a new Plugin
  Root/Generation; the active catalog is intentionally immutable.
- Hard isolation between native Plugin modules. They are trusted application
  code and share a browser realm.

| Current source | Consequence for this design |
| --- | --- |
| [Console Shell](../src/components/runtime/console-shell.tsx#L31) has a fixed area union and sidebar selection | Add a contribution outlet and catalog-derived navigation, not another business-specific area branch |
| [Root](../src/routes/__root.tsx#L27) mounts the application after hydration; [Vite](../vite.config.ts#L21) uses SPA mode | First-generation contributions are client-rendered; arbitrary Plugin SSR is not needed |
| [App context](../src/features/apps/app-management-context.tsx#L108) chooses a preferred or first target | This convenience selection cannot be the identity source for a deep-linked page or in-flight mutation |
| [Providers](../src/app/providers.tsx#L11) include Agent and shared Query contexts | Those private providers are not public extension contracts |
| [App proxy](../service/src/app_management.rs#L122) allowlists Plugin control routes | Business APIs and page discovery need a new explicit projection, not an arbitrary suffix added to that proxy |
| [App connection model](../service/src/app_management.rs#L9) is loopback-only | This slice does not silently enable remote targets, operator federation, or arbitrary credential forwarding |
| [Catch-all route](../src/routes/$.tsx#L5) handles legacy links then returns not-found | Dedicated extension route prefixes must coexist with legacy routing |

The current React 19 / Vite 8 stack now has a native Workspace loader, the
generic `lenso.ui.contribution@1` provider Capability, and App-subject routing.
Service transports below remain design notation until the cross-App Connector
is implemented.

## 3. Ownership and identity

### One contribution mechanism, two subjects

- `app`: the page is about one Managed App. User administration is the primary
  example. A Console-installed observability tool may also expose an App-scoped
  page backed by its own telemetry store.
- `console`: the page belongs to a Console tool workspace. Project management
  need not select an App in order to work.

The subject is not the installation owner. An App-owned users Plugin can supply
its own administration assets; a Console-owned observability Plugin can expose a
page about many Apps. Installing the latter does not install it into those Apps.

### Identities

| Identity | Meaning |
| --- | --- |
| Owner | Host identity plus Plugin package ID and instance key that owns the contribution |
| Contribution ID | Stable ID within that Plugin, such as `users` or `observe` |
| Subject | `{ kind: "app", appId }` or `{ kind: "console" }` |
| Mount ID | Stable URL-safe identity derived from owner, contribution ID, and subject |
| Mount revision | Changes when executable assets, resolved service connections, or admission change |
| Catalog epoch and revision | Distinguish Host lifetimes and complete catalog snapshots |

A mount ID is never reassigned to another owner or subject. Labels and artifact
versions do not define identity. Two instances of the same Plugin produce
distinct mounts. Upgrading an instance retains the mount ID but changes its
revision. A missing target produces an unavailable page, never a fallback to the
first App. Catalog metadata is not evidence of target readiness.

## 4. What an author supplies

The implemented Workspace declaration is a generated Capability
response, versioned independently from Plugin business contracts and emitted by
a Plugin selected in Console's composition. The JSON below remains an
illustrative projection that includes future service aliases; it is not a
second Plugin package manager or App-authored provider selection.

Descriptor 1.1.0 adds `subject` compatibly: an omitted field from a 1.0.0
provider means `{ "kind": "console" }`. App scope must declare both
`{ "kind": "app" }` and a clean `app_id`; Console rejects any App identity that
is not already present in its configured application catalog.

Illustrative descriptor for a Plugin-owned users page:

```json
{
  "schema": "console.page-contribution/1",
  "id": "users",
  "title": "Users",
  "subject": { "kind": "app", "app_id": "support" },
  "runtime": {
    "apiMajor": 1,
    "react": ">=19.2.0 <20"
  },
  "module": "./console/users.mjs",
  "styles": ["./console/users.css"],
  "navigation": {
    "label": "Users",
    "icon": "./console/users.svg",
    "items": [
      { "label": "Overview", "path": [] },
      { "label": "Invitations", "path": ["invitations"] }
    ]
  },
  "services": {
    "users": {
      "contract": "example.users.administration@1",
      "source": "subject",
      "required": true
    }
  }
}
```

The example contract is illustrative and must be authored by the users domain;
it is not a currently available Lenso Capability.

Descriptor rules:

- `id` is a stable, bounded slug unique within the owner's contribution set.
- Titles and navigation are discoverable without executing JavaScript. The
  Plugin may render richer navigation after loading; it cannot redefine its
  owner or subject.
- Each declarative navigation item has a non-empty label and a bounded list of
  clean relative path segments. The Shell resolves those segments beneath the
  owning Workspace; absolute paths and traversal are rejected.
- Asset paths are relative to the reviewed artifact. Arbitrary remote module
  URLs are not part of this declaration. Local development uses a separate
  explicit development source, described below.
- `services` names semantic requirements, not URLs, provider package IDs, or
  credentials. `source` is either `owner` or `subject`; `subject` requires an
  App-scoped contribution. Resolution and ambiguous-provider rejection belong to
  Host policy. All first-slice declared services are required.
- The host validates required protocol features and compatibility before import.
  Unknown optional metadata can be ignored; unknown required features cannot.
- Frontend assets are a facet of a Plugin product, not necessarily a separately
  installable Plugin. A separately released companion still declares its
  requirements instead of accessing another Plugin's private state.

Do not add a generic layout JSON language, workflow DSL, database schema, or
React component registry to this descriptor.

## 5. Page module and author experience

The implemented API-major-1 module surface is injected by the Shell, so a
Workspace uses the Console's React singleton and does not import private Shell
modules:

```ts
import type * as React from "react";

type WorkspaceModule = {
  apiMajor: 1;
  createWorkspace(runtime: {
    createElement: typeof React.createElement;
    react: typeof React;
  }): {
    Page: React.ComponentType<WorkspaceProps>;
    Provider?: React.ComponentType<React.PropsWithChildren>;
  };
};

type WorkspaceProps = {
  mount: Readonly<{
    id: string;
    title: string;
    revision: string;
    owner: { instance: string; source: string; trusted: boolean };
    requirements: readonly CapabilityRequirement[];
  }>;
  environment: Readonly<{ theme: "light" | "dark"; locale: "en" | "zh-CN" }>;
  navigation: {
    href(segments: readonly string[]): string;
    go(segments: readonly string[]): void;
  };
  signal: AbortSignal;
  location: {
    segments: readonly string[];
    search: string;
    hash: string;
  };
};
```

The module exports `apiMajor` and `createWorkspace`. A Plugin supplies normal
React components and owns its internal routes, state, and interactions. The
runtime validates the export before mounting it and contains loading, import,
and render failures per Workspace.

The Shell owns React mounting. The optional `Provider` wraps the page and stays
mount-local; it is not a way to wrap unrelated pages or register global
application providers. The second sidebar remains declarative in API major 1.
Rich Plugin-rendered navigation, navigation guards, caches, and typed service
transports require additive reviewed contracts before they can be claimed.

Context semantics:

- Owner, mount revision, and cancellation scope
  remain fixed for a mounted experience. A change creates a new context and
  React subtree.
- Location and environment updates are reactive props. Theme changes do not
  create a new mount or reset business state.
- Plugin code combines its work with the mount `AbortSignal` and still owns
  cleanup of its subscriptions, timers, workers, and external libraries.

A Plugin may use its own state library, editor, canvas, charts, or data cache.
Official UI components are optional. Direct browser APIs are not forbidden or
pretended to be sandboxed, but code bypassing scoped services owns the resulting
correctness and lifecycle obligations.

### Keep the first public surface small

Initially support full pages, contextual navigation, scoped URLs, environment,
services, and unsaved-work guards. Commands, global search providers, badges,
notifications, and cross-Plugin actions should use later explicit contracts when
a concrete workflow requires them. Do not build a universal extension-slot
registry before these two pages work.

## 6. Routing and navigation

Use static Shell route prefixes with an extension-local remainder:

```text
/apps/<appId>/pages/<mountId>/<extension-path>
/workspaces/<mountId>/<extension-path>
```

The first is App-scoped; the second is Console-scoped. The canonical URL does
not depend on whichever App is selected in memory. The server and browser both
validate that `appId` agrees with the mount's subject.

Add root/index and splat routes for each prefix using TanStack's `$` splat.
The Shell knows the static prefix; it does not mutate the generated route tree
when a Plugin is installed. SDK navigation supplies typed Shell route parameters,
not string interpolation into typed `to` paths.

Inside its mount, a Plugin receives decoded path segments and owns the remainder
of the URL, including query and fragment. The SDK preserves repeated query keys,
round-trips encoding, and rejects attempts to escape the mount. An optional
router adapter can drive an extension-local router from these props. There is
only one browser-history owner: the Shell. Plugins do not install a competing
BrowserRouter or call `pushState` behind it.

Back/forward, reload, deep links, internal not-found, and dirty-navigation guards
are conformance cases. Mount revision is not embedded in bookmarks.

Navigation is projected from the catalog:

- App pages appear under the selected App's administration area.
- Console contributions appear as independent Workspaces directly in the
  primary rail. There is no intermediate Tools destination. Selecting a
  Workspace reveals only that Workspace's contextual navigation in the second
  sidebar.
- One contribution may supply rich contextual navigation and many internal
  pages; it does not need one top-level item per business route.
- Disabled contributions leave active navigation, while bookmarked mounts show
  an explicit unavailable state. Missing required services show a reason rather
  than pretending the page is an empty dataset.

Existing Agent, Plugins, Settings, and legacy routes remain intact in the first
slice. This does not force the other workstream to migrate Agent UI into the
new extension contract.

## 7. Module loading, shared dependencies, and CSS

### Recommended implementation

Use browser ESM with a small, boot-time shared-runtime import map. Choose this
over a Module Federation runtime for the first implementation: we need lazy
native modules and explicit compatibility, not negotiation of every dependency.

Both the browser Shell build and extension builds must use the same external
React modules. The runtime map is emitted before any module/preload executes and
maps `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `react-dom`, and
`react-dom/client` to one compatible runtime set. It cannot merely redirect
Plugin imports while leaving a second React copy bundled into the Shell.

This is a recommendation gated by a production-build spike. The current
`manualChunks` configuration is not itself a shared-runtime contract.

Build responsibilities:

- Console publishes a coherent runtime set with its Shell build; extensions
  declare compatibility instead of choosing another React singleton.
- The extension builder externalizes that small runtime set and bundles private
  dependencies. It rejects a bundled second React or unresolved bare imports.
- Optional SDK runtime imports, if introduced, join the explicit shared set;
  the first interface can use type-only SDK imports and context props.
- Chunks and other assets use relative immutable paths inside the artifact.
  There is no mutable CDN lookup on page entry and no per-Plugin import-map
  mutation at runtime.
- Extension modules do not import Console's router, QueryClient, Agent contexts,
  or private source tree.

First-generation modules must be side-effect-free at import. Effects start when
the contribution mounts and clean up when it unmounts. A violation is a Plugin
bug, not something ESM can isolate or reverse.

### Assets and styles

The current contract admits JavaScript entry assets and CSS before exposing them
under an immutable digest path. Every declared entry and stylesheet is verified;
asset requests never fall back to the SPA HTML document. Lazy chunks, fonts, and
images require an additive media-type contract before support can be claimed.

Load CSS before rendering; reference-count artifact styles while contributions
are mounted. Authors can use CSS Modules, compiled StyleX, or their own compiled
styles, with a documented contribution root and shared theme tokens. Global
resets are not installed by Plugin styles. This is a compatibility convention,
not CSS isolation. Portal styles and resources must participate in cleanup.

The Shell renders an accessible loading/error state while preparing the page.
One broken import or React render should not replace the whole workbench. A
React error boundary does not promise recovery from infinite loops, global
mutation, arbitrary event-handler errors, or resource exhaustion.

### Development without rebuilding Console

Provide an explicit local development registration that serves a descriptor and
build output through the same catalog and mount interfaces. Start with watch
build plus reload on changed digest; HMR is an optional later improvement.
Production never falls back to a development origin.

Development and production must resolve the same React instance within each
browser document. Vite's optimizer is a specific compatibility test, not a reason
to share arbitrary `node_modules` URLs as a public SDK.

## 8. Backend services, not a universal privileged proxy

Each descriptor service alias is resolved by the owner/subject Host against an
explicitly exported, versioned domain service. The receiving business Plugin
owns input validation, authorization, revision checks, and durable outcomes.

The browser gets no upstream origin, credential, or provider-selection ability.
The Console service keeps a mount-revision-bound connection record derived from
the Host's permitted exports. `ServiceTransport` addresses only its service's
relative paths and operations.

Illustrative Console-owned HTTP projection:

| Route | Purpose |
| --- | --- |
| `GET /api/console/v1/pages` | Complete admitted mount catalog, epoch/revision, availability, and browser compatibility |
| `/<immutable-assets-prefix>/<digest>/<path>` | Verified artifact assets; never SPA fallback |
| `/api/console/v1/pages/<mountId>/services/<alias>/<path>` | Explicit exported domain HTTP operations, not arbitrary upstream forwarding |

Requests carry the expected catalog epoch and mount revision. The service rejects
stale or revoked connections before dispatch; it never resolves an old request
against a newly selected provider. These headers are concurrency guards, not
secrets or per-Plugin authentication. HTTP export metadata defines allowed
methods, path templates, content types, size limits, and streaming support.

The transport rejects absolute URLs, traversal, credentials supplied by the
browser, and undeclared operations. It preserves domain statuses, response
headers needed for revision checks, and bounded streaming bodies. Reserved
connection/concurrency headers come from the Host context, not caller overrides.
There is no automatic replay of a mutation after a network failure.

Errors remain distinct:

- **Integration:** missing service, incompatible contract, stale mount, denied
  export, unavailable target.
- **Domain:** business validation, conflict, or denied user action.
- **Transport/runtime:** interruption, timeout, malformed response, or failed
  provider execution.

Native code is trusted within the browser session. Neither the descriptor nor
the alias path authenticates one native Plugin against another. Final backend
authorization is still necessary, and does not supply browser isolation.

### Contract ownership and missing prerequisites

The browser descriptor/catalog/SDK are owned by Console. Source schemas should
be authored once with checked projections for the Rust service and TypeScript
consumer; do not maintain two independent handwritten decoders.

The page-source and service-export roles between a contributing Host and Console
need explicit versioned contracts before general App discovery ships. Their
first operations are:

- Read a contribution snapshot and its immutable artifact references.
- Read permitted named service exports and their compatibility/revision.
- Transfer admitted artifact bytes through the packaging authority's supported
  mechanism, not through a generic arbitrary URL fetcher.
- Invoke each service through its own domain request or bounded stream contract.

These are candidate Console integration roles, not a claim of an existing
portable `lenso.*` Capability. Package ownership, descriptors, generated targets,
and the exact interaction shape must be reviewed against the framework's actual
contracts before publication. Business roles remain owned by their domains.
An event bus is not necessary for the first snapshot-based catalog.

Console's existing Plugin management connection does not grant these new
authorities. The first real App must explicitly supply them. No implementation
should obtain users by proxying a private Agent route or reading its database.

## 9. Catalog and lifecycle

The catalog is a Console-owned projection of admitted sources, not a new Kernel
registry or a durable business database. Installation history and trust decisions
remain with the relevant packaging/configuration authority. Store only the
Console-specific admission decision there if it is not already represented;
do not create competing installation truth.

Derivation:

1. Read owner and subject identities plus contribution metadata without executing
   browser code.
2. Verify admitted assets and runtime compatibility.
3. Resolve declared service requirements using Host policy.
4. Publish an atomic catalog snapshot, including unavailable mounts and reasons.
5. Import and mount a compatible contribution lazily when entered.

For the first slice use ETag-based snapshot refresh on focus, connection recovery,
and a bounded refresh interval. Catalog revision changes only with catalog facts,
not every telemetry event. A later push mechanism must retain snapshot recovery.

| Transition | Behavior |
| --- | --- |
| First install | Publish the ready mount after preparation; no Shell rebuild |
| Required service missing | Publish an unavailable reason; do not execute the page |
| Target goes offline | Keep target identity; show disconnected/stale data, stop dispatch to unavailable services, retain independently available owner services |
| Target returns with unchanged connection revision | Reads may retry explicitly; mutations are not replayed |
| Service connection/revision changes | Invalidate the old context; remount explicitly with newly bound services |
| Navigation leaves a page | Run guards, unmount, abort context work, release registrations |
| Disable or remove | Revoke new service dispatch server-side; remove navigation, unmount, release resources |
| Upgrade candidate fails preparation | Keep the previous admitted version; report candidate failure |
| Successful upgrade | Publish the new revision and require a browser reload before executing the replacement version |

The reload policy is deliberate: ESM modules cannot be unloaded. Do not advertise
an atomic live upgrade that leaves old top-level effects running. An executable
or shared-runtime change makes the old view stale/read-only, lets the user
preserve local edits, and offers reload. A service-only revision change can
remount the same code after resolving unsaved work; it still revokes the old
transport immediately. An administrative revocation cannot be vetoed by a
dirty-form guard. Assets for active browser builds need a grace policy; preserve
old assets until reload/expiry rather than deleting lazy chunks under an open
document.

Unmounting or aborting a fetch does not roll back a backend mutation that already
started. A mutation needs its owner's durable result or reconciliation path.
After an interrupted response the UI says outcome unknown, not failure/success.

## 10. Two contributions that exercise the design

### A. App users administration

- **Owner:** the users Plugin in a real non-Agent sample App.
- **Subject:** that App; no Agent provider is required.
- **Module:** users list and detail/edit pages, filters in the URL, dirty guard.
- **Required service:** domain-owned users administration from the subject.
- **Operations:** paginated list, read user, update selected fields with expected
  user revision; domain validation, denied access, and conflict are explicit.
- **Proof:** load two Apps containing the same user ID. Navigate between them
  during a pending edit; neither the request destination nor cached result moves
  to the other App. Refresh a user deep link and preserve the exact target.
- **Deletion:** remove the contribution and its routes disappear without changing
  Shell source. Business data is not implicitly deleted.

The sample owner must define allowed fields and authorization for these
operations; this design does not standardize every App's user model.

### B. App-scoped observability

- **Owner:** a Console-side observability Plugin.
- **Subject:** a selected App, distinct from the tool's own installation owner.
- **Module:** request list, trace detail, waterfall, related logs, runtime panel.
- **Required services:** telemetry query from the owner; runtime inspection from
  the subject. Later optional services require an explicit contract extension.
- **Operations:** bounded request/trace/log queries and runtime snapshot. The
  transport must also prove cancellation/backpressure of an incremental feed.
- **Proof:** a real sample Web request produces telemetry displayed with its App
  identity; missing/sampled data and disconnected runtime inspection are
  distinguished. Switching Apps cancels the old view's consumption, not the App.
- **Deletion:** removing the tool stops its queries/feeds and removes its UI
  without changing the observed App's behavior. Retention belongs to the tool.

Deterministic fake adapters can prove the SDK first, but do not count as the
completed observability product. OTel ingestion and storage selection remain in
the dedicated observability design.

### Future project-management workspace

The same descriptor uses `subject: "console"` and owner-provided business
services. Boards, editors, issues, and project rules stay inside that Plugin.
Changing the current Managed App must not implicitly change its team/project.
No new Console business branch is needed to support it.

## 11. First-slice ownership and artifacts

| Work | Primary owner/workflow | Concrete artifact and proof |
| --- | --- | --- |
| Browser contribution contract | Console; capability-authoring discipline for source/projections | Descriptor and catalog schemas, SDK declarations, two independently built modules, malformed/unknown-major fixtures |
| Native loading and route outlet | Console Host mechanics; runtime-extension | Production ESM/runtime spike, immutable asset serving, route/context/lifecycle tests |
| Host contribution and service exports | Console integration contract owner with contributing Host owners; capability-authoring | Reviewed contracts and generated clients/providers before enabling generic discovery |
| Users domain and administration page | Sample App users Plugin; plugin-authoring | Real domain endpoint, page artifact, authorized/denied/conflicting edit proof |
| Observability query and page | Observability Plugin; plugin-authoring | Query provider, independently built trace UI, bounded feed and disconnect proof |
| App/Console configuration | Each App owner; app-configuration | Explicit Plugin Instances and export/admission configuration, no handwritten bindings or Plan |
| Marketplace attachment | Packaging authority plus Console discovery | Immutable artifact/compatibility fields usable by later marketplace, not a new publication workflow |

The first fixture graph needs one Console web instance, one observability tool
instance, and a non-Agent sample App supplying users and runtime inspection.
Repeat the App instance under a second target identity for isolation tests.
Removing any required role must produce a declared unavailable state.

Candidate implementation locations are `src/features/extensions/` for the
browser adapter and `service/src/page_contributions.rs` for Console HTTP
projection. These paths do not exist yet. Contracts/build tooling should have
one owner in this repository initially; creating a public SDK package or changing
workspace layout is a separate reviewed packaging decision.

## 12. Review and verification gates

Before treating the contract as stable:

1. Build Console and both contributions independently, then serve them with the
   real Rust service. Add a third test-only contribution without editing Shell
   imports or rebuilding its route tree.
2. Prove one React runtime, lazy chunk loading, CSS/portal cleanup, runtime
   incompatibility rejection before import, and SPA/asset fallback separation.
3. Exercise nested routes, repeated query parameters, back/forward, reload,
   Unicode IDs, invalid mount/subject combinations, and dirty-navigation guards.
4. Check service denial, revision conflict, target outage, stale mount requests,
   removal during a pending mutation, and no automatic mutation replay.
5. Check malformed catalog recovery, two instances of one Plugin, epoch changes,
   failed upgrade preserving the old version, and reload-required activation.
6. Confirm that Agent routes, selection, Sessions, and existing Plugin management
   still work without knowing about either business contribution.
7. Run schema freshness, service HTTP tests, browser conformance, and a production
   build. Typechecking alone does not establish runtime loading compatibility.

### Decisions still requiring proof or review

- **ESM/import-map build spike:** prove compatibility with the current
  TanStack Start SPA and Vite development/build pipeline before freezing the
  shared-runtime artifact layout. Reconsider the loader adapter, not the native
  contribution model, if that spike fails.
- **Host export contracts:** inspect/author real domain and Console integration
  contracts before registering any new framework Capability identifiers.
- **Packaging lifecycle:** confirm asset-facet support and admission persistence
  with existing packaging authority; do not invent a parallel installer.
- **Observability backend:** select ingestion/query/storage separately; the page
  interface should not depend on a particular vendor.
- **Multi-user operation:** identity, workspace membership, and remote operator
  policy are not supplied by native extension loading and remain separate work.
