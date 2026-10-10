# Console authoring

One `@lenso/console-sdk` package owns the page SDK, server declarations, typed
client projection, directory compiler and scaffold. Business authors maintain
one `console/` directory. They do not handwrite contribution descriptors, service
exports, central registries or a second parallel server layer.

## Start

This is a local package candidate, not a published npm version. From this
directory, pack it with
`bun pm pack --ignore-scripts --filename /tmp/console-sdk.tgz`, install that
archive in a clean project, and use Bun to run its `lenso-console-author`
executable. Dependencies require registry access on first installation;
application source compilation uses the
installed authoring tools. No Console checkout, Cargo or Git patches are needed
for this page compilation path.

Both npm and Bun's isolated installation layout are supported at the consumer
boundary. The compiler
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
Page compilation alone does not install its emitted Plugin into a TS app.
See [the migration guide](MIGRATION.md) for the removed legacy provider API.

The shared browser adapter uses unqualified URL paths. Every selected mount must
have a globally distinct, non-overlapping `basePath`, including mounts belonging
to different app subjects. The backend may catalog overlapping paths in separate
subjects for other consumers; Console and backend preview reject that ambiguous
browser selection. Assign distinct paths in Host mount configuration rather than
relying on catalog order.

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
descriptor and Plugin assets as `lenso-console-author`. Existing workspace
options, authorization, scoped reads and generated dependencies are unchanged.
Node resolves the entry; Bun runs it. A repository's private workspace root is
not this npm package.

The default scaffold has pages and navigation only. `init console --services`
adds the typed source example. The generated `plugin.ts` exports a current
TypeScript Plugin, its explicit `manage` declaration, and `createMount`.
Supported TS apps install those exact objects and register mounts explicitly.
The compiler neither grants permissions nor bypasses runtime admission.

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
published SDK; the page helper does not grant access to private domain storage.
Declare streaming reads with `streamOperation` and consume them with
`client.orders.watch.subscribe(input, { signal })`. Both request and stream
handlers validate and authorize before executing domain code.

## Pages and navigation

A page is an ordinary React component. Import `PageProps` or `definePage` from
`@lenso/console-sdk`; import hooks and navigation from `@lenso/console-sdk/react`.
React hooks use the Shell's singleton. Do not import Console
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

`@lenso/console-sdk/protocol` owns validated wire schemas and inferred DTOs.
`/contribution` and `/workspace-service` were removed with the legacy providers.
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

Use `Link` and `useWorkspace` from `@lenso/console-sdk/react` for relative links:

```tsx
import { Link, useWorkspace } from "@lenso/console-sdk/react";
export default function Page() {
  const { mount } = useWorkspace();
  return <section><h1>{mount.owner.instance}</h1><Link to={["details"]}>Details</Link></section>;
}
```

Layouts and `not-found.tsx` receive the same instance scope. Links retain native
keyboard, modified-click and download behavior. Cross-workspace navigation uses
`navigation.openWorkspace` with an admitted catalog mount ID.

Install the implementation twice using independent installations:

```ts
import { createInstallation } from "./console/.lenso/console/plugin";
const one = createInstallation("example.users/one");
const two = createInstallation("example.users/two");
const mounts = [
  one.createMount({ id: "users-one", workspaceId: "user", subject: { kind: "console" }, basePath: "/team-one/" }),
  two.createMount({ id: "users-two", workspaceId: "user", subject: { kind: "console" }, basePath: "/team-two/" }),
];
// Install both exact Plugins and Manage declarations, then register mounts.
```

Both instances render the same compiled page. Changing a mount path changes only
URL metadata; mount IDs, executable identity and service bindings remain stable.
Declared workspace IDs are local to the Plugin. Catalog mount IDs include the
owner and subject; use those actual IDs in existing `member_workspace_ids`
permission selectors. Reserved paths, duplicate paths, overlapping prefixes
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
| Generated projections | `.lenso/console` | consume inferred browser declarations and explicit Plugin/Manage/mount output |
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

Run package type checks and the compiler tests. One clean archive application
installs the candidate SDK and backend outside the repository, invokes the public
scaffold/compiler, rejects typed mistakes and server-code leakage, and exercises
allowed/denied requests and streams through real Fetch/Auth/Manage. The local gate
and SDK distribution workflow reuse this proof rather than maintaining separate
consumer applications. Validation grants no publishing or production authority.

The SDK's default `dist` JavaScript is built with Bun; its declaration files are
emitted with TypeScript. `lenso-source` is an opt-in development condition, not
the package's default runtime path.

## Shared language and Plugin catalogs

Import `useConsoleLocale` from `@lenso/console-sdk/react/locale`; the Console compiler
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
Source maintainers stage the assets with `bun run sdk:prepare`
before packing; App consumers only install the SDK. An explicit custom Shell
root remains supported.

## Develop one plugin page

Install the SDK and the dependencies your pages import in the plugin's own
`package.json`. Bun 1.4.2+ is the project runtime; Node is only needed for npm
compatibility consumers and publishing. Rust, a database and a Console source checkout are unnecessary. The SDK archive includes its page-only
preview source, not built-in Console application pages. Compiler and preview tools
are optional development dependencies supplied by the application, not part of
the SDK's browser-client install.

```sh
cd plugins/orders
npm install --save-dev @lenso/console-sdk typescript @types/react @types/bun
npm install --save-dev vite @vitejs/plugin-react @stylexjs/unplugin
npm install react@19.2.8 react-dom@19.2.8 @lenso/console-react @lenso/ui @lenso/tokens @stylexjs/stylex @tanstack/react-query @tanstack/react-router @fontsource-variable/inter @fontsource/roboto-mono
./node_modules/.bin/lenso-console-author dev --entry ./console --open
```

The same installed executable works after `bun install`; `npm install` is
supported only for external npm-compatibility consumers.
Production builds need the TypeScript/type packages but not the preview's
Vite/StyleX tooling. Pages using the host layout API also install
`@lenso/console-react`. Server bindings require the optional `@lenso/core`,
`@lenso/engine`, and `@lenso/manage` peers.
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
or in the production Shell assets. SDK release staging runs `bun run sdk:prepare`;
normal consumers use the complete published archive, not repository aliases.

Preview uses the SDK-owned page outlet and scoped-read runtime, with shared
appearance and transport primitives only. It does not bundle the removed Agent,
Plugins, Settings or management pages. Locale defaults to English without
pretending to persist preferences. `bun run test:preview` exercises authored-page
navigation, explicit example reads and unauthenticated TS backend refusal.
