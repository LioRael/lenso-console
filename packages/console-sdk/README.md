# Console page SDK

A page is an ordinary React component. Import `PageProps` or `definePage` from
`@lenso/console-sdk`; import React hooks normally. The convention compiler binds
React to the Shell's singleton. Do not import Console source or create a React root.

`console/page.tsx` is the workspace root; nested `page.tsx` files create local
routes. `[id]` supplies `params.id`. Static segments precede dynamic segments;
ambiguous patterns fail compilation. Navigation stays inside the mount. Services
are explicitly admitted owner-service aliases, not arbitrary upstream URLs.

Console is independent of Agent. Browser pages do not grant Agent tool authority.
The SDK and build support are local packages in this migration, not registry releases.

The package also exports `@lenso/console-sdk/contribution` and
`@lenso/console-sdk/workspace-service`: generated TypeScript projections from the
same Console-owned descriptors as native Rust. Handwritten browser helpers do
not replace these backend contracts. Domain authorization stays in the owning
business Plugin; a navigation handoff is never an authorization grant.

## Directory boundaries

`layout.tsx` receives `LayoutProps.children` and wraps descendant pages. Nested
layouts compose from the root inward. `loading.tsx` supplies a React Suspense
fallback; `error.tsx` receives `{ error, reset }` and catches descendant render
failures. A layout's own failures bubble to its parent boundary. The boundary
resets on route changes. A root `not-found.tsx` handles unmatched routes.

`[id]` produces a string; `[...path]` produces a nonempty string array;
`[[...path]]` permits an empty array. Catch-all segments must be terminal.
Static routes precede named parameters, then required and optional catch-all.
Ambiguous equivalent parameter patterns fail before compilation.

All authored `.ts` / `.tsx` files and entry component signatures are checked
with TypeScript before assets are generated. Private frontend dependencies may
be declared in `console/package.json`; the compiler supplies its pinned checker
and React/Bun types. This uses an isolated strict configuration, not arbitrary
parent-project tsconfig plugins. Compilation never evaluates authored services.

## Owner services

An optional `console/services.ts` default export uses `defineServices` and
`operation` from `@lenso/console-sdk/server`. See the executable
[orders example](../../../examples/app-console/app/orders/console/services.ts).
Each operation must parse its input and explicitly authorize it before handling
it. The generated contribution and service adapter share one Plugin Instance,
so service aliases are bound through the existing owner-scoped Plan contract.

A page calls its admitted alias through the supplied SDK:

```ts
const order = await props.services.invoke<
  { id: string },
  { id: string; title: string }
>("orders", "read", { id: "42" }, { signal: props.signal });
```

Service source and server SDK imports are rejected in the browser dependency
graph. Only the server Plugin contains handlers. The convention currently
exports request operations; handwritten contract providers retain stream support.
It does not infer another Plugin's contracts, grant identity-based permissions,
or expose private domain storage. An existing domain Plugin remains the owner
of its state and final authorization; explicit cross-Plugin dependencies keep
using the normal generated Capability SDK.
