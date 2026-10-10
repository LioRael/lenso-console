# Current TypeScript Console authoring

The next pre-1.0 minor SDK release replaces the legacy provider API. The browser
wire protocol remains `lenso-console-rpc/2`.

## Browser and React entrypoints

The SDK root is browser-safe without loading React, server declarations, or the
compiler. `PageProps`, `LayoutProps`, `ErrorProps`, `definePage`, `defineWorkspace`,
and pure locale/refresh helpers remain at the root.

Move `Link`, `WorkspaceScope`, `useWorkspace`, `useWorkspaceRead`, and
`useWorkspaceReadClient` imports to `@lenso/console-sdk/react`. This is a source
compatibility break: eager root re-exports would load React and defeat the boundary.
Move locale hooks to `@lenso/console-sdk/react/locale`; the old `/locale` export
remains an alias for the same context. `/browser` keeps its admission and mount
APIs and remains a React-dependent compatibility entrypoint.

Applications invoking the compiler must install `typescript`, `@types/react`,
and `@types/bun` as development dependencies. React pages also require `react`;
pages importing the shared layout API require `@lenso/console-react`. Server
installations need `@lenso/core`, `@lenso/engine`, and `@lenso/manage`. Do not rely
on compiler or UI tooling being installed transitively by the SDK.

Owner-built modules receive `@lenso/console-react` and the locale module through
the existing `runtime.modules` bridge. They reuse host-owned React and layout/locale
contexts, not independently bundled copies. Rebuild authored pages after migrating
imports. This module-sharing mechanism is not a sandbox.

## Service and admission migration

1. Keep `services.ts` declarations using `defineServices` and
   `operation({ parse, authorize, handle })`. Declare operation semantics
   explicitly, for example `effect: "read"`. Undeclared effects remain `unknown`
   and require the Host's normal write guarantees.
2. Regenerate with `lenso-console-author build --entry console`. Do not retain
   generated `contribution.ts`, `workspace-service.ts`, or `server.ts`.
3. Install the generated exact Plugin and Manage declaration, then explicitly
   register its mount on the application's Console target:

   ```ts
   import plugin, { manage, createMount } from "./console/.lenso/console/plugin";

   const mount = createMount({
     id: "orders",
     subject: { kind: "console" },
     basePath: "/orders/",
   });
   // Application assembly installs plugin.
   // Console target uses plugins: [plugin], manage: [manage], mounts: [mount].
   ```

   `apiBasePath` defaults to `/api`; set it to the application's Console API
   prefix when that prefix differs. The mount binds module and stylesheet URLs
   to its immutable asset endpoint.

   `createInstallation("orders/second")` creates an independent owner with its
   own exact Plugin/Manage objects. Do not substitute another Plugin with the
   same ID. Mount IDs and subject/revision lifetimes remain Host-owned.
4. The trusted Host operation binding supplies `WorkspaceOperationContext`:
   `subject`, `owner: { instance }`, `mountId`, `revision`, and `signal`.
   Revision must match `mount.descriptor.revision`. Context is never business
   input; authentication and admission still run at the Host boundary, and
   `authorize` remains final domain policy.
5. Requests return decoded JSON or throw `WorkspaceServiceError`; remove
   `adapter.provider`, `body_base64`, and `InvokeResult` decoding.
   Direct dispatch uses `adapter.invoke(context, { service, operation, input })`.
   Parsing failure is `codec_mismatch`; rejected authorization is `denied`.
6. Declare reads that stream with `streamOperation`. Its handler receives the
   same cancellation signal and returns an `AsyncIterable`. Typed pages use
   `client.orders.watch.subscribe(input, { signal })`; unary calls retain
   `client.orders.read(input, { signal })`. Release domain resources in the
   iterable's `finally` and respect the signal during pending work. Streaming
   declarations accept only read effects and are not finite Manage operations.

The `/contribution` and `/workspace-service` exports and their generated
snapshots are removed, not routed through a compatibility dispatcher. Consume
schemas and inferred wire DTOs from `/protocol`. Compiler output no longer
depends on `@lenso/bun-plugin` or `@lenso/contract-runtime`; the SDK uses published
`@lenso/core`, `@lenso/engine`, and `@lenso/manage` APIs.
