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
editor with that directory's generated `tsconfig.json`. `@lenso/console-sdk/services`
is a compiler-provided, owner-local alias, not a globally shared service registry.
Use the precompiled [development Host](development-host.md) for an executable
App, or the [native embedding example](https://github.com/LioRael/lenso-console/tree/main/examples/plugin-host).
Page compilation alone does not prove compatibility with a released Engine Host.

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
source checking. Type information is not runtime validation: `parse` validates
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

## Ownership and repository map

| Category | Owner / location | Author responsibility |
| --- | --- | --- |
| Business source | your `console/` and business Plugin | pages, domain logic, explicit authorization |
| Authoring package | `packages/console-authoring` | consume one package/command |
| Independently installable products | Console Host, `plugins/assistant`, `plugins/management-mcp`, Agent | Host explicitly selects compatible packages and authorities |
| Generated projections | `.lenso/console`, SDK `src/generated`, contract crate projections | regenerate/check; never maintain parallel declarations |
| Console maintenance | `src`, `service`, `runtime`, `contracts`, `config`, `scripts`, `docs`, `examples` | maintainers only; these are not App author scaffolding |

The three previous SDK/compiler/scaffold directories have one owner and package
closure. Rust `console-support` remains a separate native Host build boundary,
not a second page authoring SDK. Shell UI, optional assistant/MCP and domain
contracts keep their independent lifecycle/security boundaries.

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
