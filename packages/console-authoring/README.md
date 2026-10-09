# Console authoring

One `@lenso/console-sdk` package owns the page SDK, server declarations, typed
client projection, directory compiler and scaffold. Business authors maintain
one `console/` directory. They do not handwrite contribution descriptors, service
exports, central registries or a second parallel server layer.

## Start

This is a local package candidate, not a published npm version. Pack this directory
with `pnpm pack --out /tmp/console-sdk.tgz`, install that archive in a clean project,
and use Bun to run its `lenso-console-author` executable. Dependencies require npm
registry access on first installation; application source compilation uses the
installed authoring tools. No Console checkout, Cargo or Git patches are needed
for this page compilation path.

Both npm and Bun's isolated installation layout are supported. The compiler
resolves its own declared tools; it never installs dependencies or creates a
second tool cache in the application's generated output. Install the App's
locked dependencies once before compilation.

```sh
bun install --ignore-scripts /tmp/console-sdk.tgz
bun run lenso-console-author init console
bun run lenso-console-author check --entry console
bun run lenso-console-author build --entry console --plugin-id example.orders
```

`check` deliberately exercises the same type/projection/bundle path as `build`.
It never evaluates authored services, starts a Host, selects a model or grants
permissions. Generated files default to `console/.lenso/console/`; configure your
editor with that directory's generated `tsconfig.authoring.json`. `@lenso/console-sdk/services`
is a compiler-provided, owner-local alias, not a globally shared service registry.
Use the [TypeScript Console plugin](../console/README.md) for application
assembly. Native development kits and embedding Hosts have been retired.
Page compilation alone does not install its emitted provider into a TS app.

## Compiler package entry

After the owner publishes this candidate, ordinary Apps can pin
the new `@lenso/console-sdk` release in their normal dependency manifest and lockfile.
The public `@lenso/console-sdk/compiler` entry resolves to the existing Bun
compiler; it is an executable stdin/stdout protocol, not an importable function:

```js
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url); // in the package owning the SDK dependency
const compiler = require.resolve("@lenso/console-sdk/compiler");
const result = spawnSync("bun", [compiler], {
  input: JSON.stringify({
    schema: "lenso.convention-compile.v1",
    entry: "/absolute/path/to/console",
    output: "/absolute/path/to/output",
    plugin_id: "example.console",
    release_version: "0.1.0",
  }),
  encoding: "utf8",
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr);
```

Success returns `{"schema":"lenso.convention-compiled.v1"}` and writes the same
descriptor and provider assets as `lenso-console-author`. Existing workspace
options, authorization, scoped reads and generated dependencies are unchanged.
Node resolves the entry; Bun runs it. A repository's private workspace root is
not this npm package.

The default scaffold has pages and navigation only. `init console --services`
adds the typed source example. Its provider protocol is retained as a public SDK
contract, but compilation is not automatic runtime integration. Supported TS apps
select exact service instances and Manage operations explicitly; see the backend
guide. The compiler neither grants permissions nor bypasses runtime admission.

## What you write

```text
console/
  page.tsx
  orders/[id]/page.tsx
  services.ts                 # optional: once per owner
  layout.tsx                  # optional
  loading.tsx / error.tsx      # optional
  package.json                # optional: private frontend dependencies
  .lenso/console/             # generated, ignored
```

`services.ts` imports `defineServices` and `operation` from
`@lenso/console-sdk/server`. Every operation declares `parse`, `authorize` and
`handle`. Input/output types are inferred once, retained in declaration-only
projections, and consumed by pages without importing or evaluating server code:

```ts
import { bindServices } from "@lenso/console-sdk/services";
const client = bindServices(props.services);
const order = await client.orders.read({ id: "42" }, { signal: props.signal });
```

Wrong service/operation names, input types and inferred output properties fail
source checking. The Promise-like member `then` is reserved for both aliases and
operations and rejected when defining services. Type information is not runtime validation: `parse` validates
untrusted input and the domain owner performs final authorization on every call.
Owner service aliases, explicit application admission, authentication and cancellation
continue to apply. Existing cross-Plugin domain contracts keep using their normal
generated SDK; the page helper does not grant access to private domain storage.
Streaming remains available through the low-level mount transport and explicit
TS read-stream declarations; `services.ts` currently declares unary operations.

## Pages and navigation

A page is an ordinary React component. Import `PageProps` or `definePage` from
`@lenso/console-sdk`; React hooks use the Shell's singleton. Do not import Console
source or create another React root. `console/page.tsx` is the Workspace root.
Static routes precede `[id]`, required `[...path]` and optional `[[...path]]` routes;
ambiguous patterns fail compilation. Named parameters are strings; catch-all
parameters are arrays and must be terminal. Navigation stays within the mount.

`layout.tsx` receives children and wraps descendants. Nested layouts compose from
the root inward. `loading.tsx` is a Suspense fallback; `error.tsx` receives
`{ error, reset }` and handles descendant render failures. A layout's own failure
bubbles to its parent boundary. Boundaries reset on route changes. Root
`not-found.tsx` handles unmatched routes. All authored TS/TSX and entry signatures
are checked under an isolated strict configuration, without executing services
or inheriting arbitrary parent tsconfig plugins.

`@lenso/console-sdk/contribution` and `/workspace-service` retain the generated
public contract projections. Native providers retain request/stream support.
The Shell injects scoped navigation, theme/locale, subject identity and an unmount
cancellation signal; handoffs remain context, never authorization.

## Multiple workspaces and instances

A single Plugin can declare ordinary workspace directories:

```text
console/
  user/workspace.ts
  user/page.tsx
  user/details/page.tsx
  admin/workspace.ts
  admin/page.tsx
  services.ts                 # optional: still once per Plugin implementation
```

```ts
// console/user/workspace.ts
import { defineWorkspace } from "@lenso/console-sdk";
export default defineWorkspace({
  id: "user", title: "Users", path: "/console", access: "member",
});
```

Declare administrator pages with `access: "administrator"` and a path such as
`/admin`. This requests the existing Console administrator boundary; it grants
no permission. `index` optionally selects relative segments for the mount root;
omission selects `page.tsx`. A workspace using owner services lists their aliases
in `services: ["users"]`; its emitted requirements are a checked subset of the
Plugin's root declaration. Existing single-root `console/page.tsx` remains valid.
Compiler options `workspaces: [{ entry: "user", path: "/members" }]` select the
same pipeline with explicit metadata overrides, rather than another compiler.

Use `Link` and `useWorkspace` from `@lenso/console-sdk` for relative links:

```tsx
import { Link, useWorkspace } from "@lenso/console-sdk";
export default function Page() {
  const { mount } = useWorkspace();
  return <section><h1>{mount.owner.instance}</h1><Link to={["details"]}>Details</Link></section>;
}
```

Layouts and `not-found.tsx` receive the same instance scope. Links retain native
keyboard, modified-click and download behavior. Cross-workspace navigation uses
`navigation.openWorkspace` with an admitted catalog mount ID.

Install the implementation twice in the App Composition and configure Console's
`workspace_mounts` by exact Plugin Instance and local workspace ID:

```json
{
  "workspace_mounts": [
    { "instance": "example.users/one", "workspace": "user", "path": "/team-one" },
    { "instance": "example.users/two", "workspace": "user", "path": "/team-two" }
  ]
}
```

Both instances render the same compiled page. Changing a mount path changes only
URL metadata; mount IDs, executable identity and service bindings remain stable.
Declared workspace IDs are local to the Plugin. Catalog mount IDs include the
owner and subject; use those actual IDs in existing `member_workspace_ids`
permission selectors. Legacy single-workspace responses keep their existing
default-instance selector. Reserved paths, duplicate paths, overlapping prefixes
and ambiguous root/child routes fail activation before publication. Dotted page
segments are valid; unknown files and unregistered deep paths return 404.

Each mount receives its own factory, React state, owner service transport,
subject scope and cancellation signal. A switch retires old callbacks and requests;
late responses cannot update the new instance or expire its session. The immutable
implementation import can be shared, but mutable instance state cannot.
The runtime catalog changes on App activation. This does not add a live
workspace-metadata HMR protocol or native development Host.

## Ownership and repository map

| Category | Owner / location | Author responsibility |
| --- | --- | --- |
| Business source | your `console/` and business Plugin | pages, domain logic, explicit authorization |
| Authoring package | `packages/console-authoring` | consume one package/command |
| Runtime | `packages/console` | application selects exact TS plugins, services and authorities |
| Generated projections | `.lenso/console`, SDK `src/generated` | maintain the SDK-owned TS public contracts without duplicate crate projections |
| Console maintenance | `plugins`, `packages`, `tooling`, `docs`, `examples` | maintainers only; these are not App author scaffolding |

The SDK/compiler/scaffold have one package closure. `plugins/console/shell`
owns the browser application; `packages/console` owns the TS backend;
`examples/ts-console` owns the runnable local assembly. `tooling` owns validation
and SDK distribution. Rust support, reference Hosts and process/stream launchers
have been removed. Generated page metadata remains a verifiable public contract,
not runtime or permission authority.

## Diagnostics and verification

Compiler/type errors identify authored files before a generation is published.
The compiler rejects ambiguous routes, server imports in browser bundles and
unsupported assets. A failed App dev rebuild retains its previous generation.
`defineServices` reports alias/operation context and validates bounded metadata
when the server declaration is activated, without evaluating it during compilation.
Invalid requests remain `codec_mismatch`; denied calls remain `denied`. Neither
runs domain handlers. Browser errors name their public service/operation; missing
requirements list public contract/version/source, without credentials or policy
internals. Author-created parsing exception text is not reflected to the browser.

Run package type checks and the compiler/consumer tests. The clean consumer gate
packs this package, installs the archive outside the repository, invokes the public
scaffold/compiler, proves typed mistakes fail, checks server-code exclusion and
runs allowed/denied requests through the emitted server provider. It grants no
model or production authority. TS backend archive consumption separately proves
real Fetch/Auth/Manage invocation and browser/server import boundaries.

## Shared language and Plugin catalogs

Import `useConsoleLocale` from `@lenso/console-sdk/locale`; the Console compiler
keeps this module external and the Shell supplies its single runtime context.
Do not store language in a workspace cache key or create another React context.
The context exposes the effective `locale`, account `preference`, public
`globalDefault`, persistence availability, and independently checked
`canManageDefault`. Personal Settings uses `setPreference("global" | "en" | "zh-CN")`.

Use `createTranslations` from `@lenso/console-sdk/i18n` with one stable Plugin
namespace, an English fallback catalog, and optional lazy catalog loaders. For
compiled single-file pages, bounded catalogs can be supplied in the fourth
`initialCatalogs` argument. Await `load(locale)` before rendering a lazy catalog;
missing keys retain English or their source text. Loading is deduplicated per
locale and retryable after failure. `formatConsoleDate` and
`formatConsoleNumber` use the effective locale and accept normal Intl options;
number formatting preserves bigint inputs.

The server, account preference, permission checks, initial HTML locale and
migration responsibilities are owned by the Console repository. A compatible
SDK release and Shell are required together;
this changeset does not publish either one.

### Shell assets

The next SDK release includes the owner-built Shell in the compiler archive.
Public `0.2.0` has no Shell export. After installing the new release, resolve:

```js
const shellRoot = path.dirname(require.resolve("@lenso/console-sdk/shell"));
```

Supply that directory to the application-owned TS shell response adapter.
Source maintainers stage the assets with `pnpm sdk:prepare`
before packing; App consumers only install the SDK. An explicit custom Shell
root remains supported.

## Develop one plugin page

Install the SDK and the dependencies your pages import in the plugin's own
`package.json`. Node 22.18+ and Bun 1.4.2+ are required; Rust, a database and a
Console source checkout are unnecessary. The SDK archive includes its page-only
preview source and Vite/React/StyleX closure, not built-in Console application pages.

```sh
cd plugins/orders
npm install --save-dev @lenso/console-sdk
npm install react@19.2.8 react-dom@19.2.8 @lenso/ui @stylexjs/stylex
./node_modules/.bin/lenso-console-author dev --entry ./console --open
```

The same installed executable works after `pnpm install` or `bun install`.
`--entry`, `--plugin-id` and the existing `workspace.ts` / `page.tsx` / layout,
loading, error and not-found declarations retain their existing meanings. There
is no additional project configuration language. Use `--plugin-id` when the
workspace has no explicit ID. `--port` defaults to 5174, binds only 127.0.0.1,
and fails if occupied. `--open` opens the local URL. Ctrl+C closes the Vite
listener, watchers and its Node child.

Page-only component and StyleX edits use Fast Refresh and retain compatible
React state. Changing workspace metadata, adding/removing routes, changing
component exports or hook signatures may reload/remount. Compilation errors
appear in Vite's overlay; rendering failures use the SDK preview error boundary.
Service implementations and `@lenso/console-sdk/server` cannot
be imported into browser pages.

UI preview is visibly marked **example data only**. Unconfigured service calls
fail explicitly. For data pages, pass an author-owned browser module that exports
an explicit `WorkspaceServices` implementation (it may reject unsupported
operations):

```sh
./node_modules/.bin/lenso-console-author dev --entry ./console --examples ./examples.ts
```

`examples.ts` is inside the plugin directory and is never inferred from server
`services.ts`; it runs in the browser. It is a development input and is not added
to production plugin output.

To render local pages against an already compatible Console backend:

```sh
./node_modules/.bin/lenso-console-author dev --entry ./console --backend http://127.0.0.1:8787/console/
```

Supply the backend's Console URL. It must expose its normal public
`lenso-console-http-paths` bootstrap. The preview follows those fixed Shell/API/
Auth paths, reads the normal authenticated catalog and replaces only matching
plugin page implementations. A backend must admit the same page identity;
unavailable/unauthorized pages do not become locally authorized pages. Services
keep the backend's owner, revision, implementation and expected-subject headers.
Authenticate through the application owner's supported mechanism; the SDK
preview no longer includes Console's removed login page. Do not copy tokens. The backend must
explicitly trust the preview origin and use browser-compatible cookies. The
proxy preserves Origin, cookies, CSRF and permission failures, never changes
Origin or synthesizes credentials, and rejects foreign-origin writes. Redirects
and Secure/Domain cookie policies remain the backend's policy. `--backend` and
`--examples` are mutually exclusive.

`check` and `build` remain the production validation/artifact commands. The
preview server and Vite client are not included in their generated plugin output
or in the production Shell assets. SDK release staging runs `pnpm sdk:prepare`;
normal consumers use the complete published archive, not repository aliases.

Preview uses the SDK-owned page outlet and scoped-read runtime, with shared
appearance and transport primitives only. It does not bundle the removed Agent,
Plugins, Settings or management pages. Locale defaults to English without
pretending to persist preferences. `pnpm test:preview` exercises authored-page
navigation, explicit example reads and unauthenticated TS backend refusal.
