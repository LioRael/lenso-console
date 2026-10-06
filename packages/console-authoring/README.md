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
Use the precompiled [development Host](development-host.md) for an executable
App, or the [native embedding example](https://github.com/LioRael/lenso-console/tree/main/examples/plugin-host).
Page compilation alone does not prove compatibility with a released Engine Host.

## Compiler package entry

After the owner publishes this candidate, ordinary Apps can pin
`@lenso/console-sdk` at `0.1.0` in their normal dependency manifest and lockfile.
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
not this npm package. See the owner's [npm distribution process](https://github.com/LioRael/lenso-console/blob/main/docs/console-sdk-npm-distribution.md)
for the candidate archive and separate publication requirements.

The default scaffold has pages and navigation only. `init console --services`
adds the typed service example for source compilation and a qualified Host.
Services require a Host that qualifies the complete WorkspaceService role,
including Request and Stream, even for unary business operations. Qualification
belongs to an exact kit and its compiled framework sources: the Engine producer
and the generated native Host are separate builds. Console's native support
facility declares its framework source for Engine to unify during Host generation.
Keep the default page-only starter when the selected Host is not qualified; this
compiler does not remove operations or raise admission flags to bypass that boundary.

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
Owner service aliases, immutable Plan admission, authentication and cancellation
continue to apply. Existing cross-Plugin domain contracts keep using their normal
generated SDK; the page helper does not grant access to private domain storage.
Streaming remains available through the low-level mount transport and native
providers; `services.ts` currently declares unary request operations.

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
The runtime catalog changes on App activation. This slice does not add a live
workspace-metadata HMR protocol; source development uses the selected development
Host's existing rebuild behavior.

## Ownership and repository map

| Category | Owner / location | Author responsibility |
| --- | --- | --- |
| Business source | your `console/` and business Plugin | pages, domain logic, explicit authorization |
| Authoring package | `packages/console-authoring` | consume one package/command |
| Independently installable products | Console Host, `plugins/assistant`, `plugins/management-mcp`, Agent | Host explicitly selects compatible packages and authorities |
| Generated projections | `.lenso/console`, SDK `src/generated`, contract crate projections | regenerate/check; never maintain parallel declarations |
| Console maintenance | `apps`, `plugins`, `contracts`, `packages`, `tooling`, `docs`, `examples` | maintainers only; these are not App author scaffolding |

The three previous SDK/compiler/scaffold directories have one owner and package
closure. Rust `console-support` remains a separate native Host build boundary,
not a second page authoring SDK. Shell UI, optional assistant/MCP and domain
contracts keep their independent lifecycle/security boundaries.

The repository now separates application and provider ownership: `apps/shell`
owns the browser application, `apps/reference-host` owns executable composition,
`plugins/console` owns the Console provider, and `packages/console-runtime` owns
private process/stream support. `tooling` owns validation and distribution. Root
commands forward to the Shell owner. The tracked root directory set is `apps`,
`contracts`, `plugins`, `packages`, `examples`, `tooling`, `docs`, `.agents`,
`.changeset` and `.github`. The authoring package consolidation is:

```text
before packages/                 after packages/
  console-sdk/                     console-authoring/
  console-convention/                src/       # SDK, server declarations, client
  console-dev/                       compiler/  # one compiler/type projection
                                    template/  # one author scaffold
  console-support/                 console-support/
  console/                         console/
  agent/                           agent/
```

This unifies page authoring, not every internal Console authority. Core Capability
descriptors/schemas still own their Rust/TypeScript projections; native Plugin
macros own their runtime descriptors; the Host explicitly admits instances and
bindings. The source checkout still has separate Shell assets, service runtime,
runtime support, configuration and contract maintenance. Further maintenance
layout/configuration/release simplification is outside this change. Generated
page metadata is no longer an author-maintained declaration, but it still exists
because Engine needs a verifiable Plugin and the Host needs explicit admission.

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
model or production authority. The separate development-kit gate proves actual
HTTP Host startup/removal for an exact compatible Engine/Console cohort.

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
migration responsibilities are described in `docs/console-locale.md` in the
Console repository. A compatible SDK release and Shell are required together;
this changeset does not publish either one.
