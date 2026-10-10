# @lenso/console-sdk

## 0.3.0

### Minor Changes

- 559d0ad: Add `lenso-console-author dev` for single-plugin page development in the official Console Shell, with Vite React Fast Refresh, StyleX updates, explicit example services, and an optional authenticated compatible backend.
- 559d0ad: Distribute the owner-built Console Shell alongside the compiler through the `@lenso/console-sdk/shell` export. Apps can resolve its asset directory from their ordinary SDK installation instead of building a separate Console checkout.
- ced80f4: Replace legacy capability providers and generated wire snapshots with current TypeScript Plugin, explicit Manage operations, and owner-bound Console mounts. Keep inferred parse/authorize/handle types and browser-only service projections; add explicitly declared streams and canonical validated Console schemas.

  This pre-1.0 minor release removes `/contribution`, `/workspace-service`, `InvocationContext`, and base64 `InvokeResult` authoring APIs. Regenerate compiled output and register its exact Plugin, Manage declaration, and mounts as described in the SDK migration guide. No registry publication or production deployment is performed by this change.

- c30967b: Add optional scoped Audit, Authorization, API Key, Tasks, Scheduler and Limits backend integrations using host-owned services and explicit Manage selections. Keep credential issue/rotation on separate protected no-store routes, default unsafe actions closed, and preserve trusted error classification and cancellation across pending request-body reads.

  Expose bounded retry estimates through workspace errors and add an explicit protected credential channel. Preserve application-selected page contracts, authoring compilation and scoped reads; remove the previous built-in management pages and their factory. These changes remain a private Console candidate; native runtime assemblies are retired and no registry replacement is claimed.

### Patch Changes

- 559d0ad: Resolve authoring tools through the SDK's declared dependencies in npm and isolated Bun/pnpm installations. Compilation no longer installs packages or copies SDK tools into each page output. The Console development kit includes its locked compiler dependencies.

## 0.2.0

### Minor Changes

- 805c0dd: Expose a shared Console locale context, Plugin translation namespaces, lazy catalog loading, and locale-aware date and number formatting. Ordinary authenticated accounts can open personal Settings, persist their language, or follow a global default. Global default changes require the explicit `console.locale.default.manage` Access Control permission and a durable locale-store provider.
- 7e2ed87: Unify Console page authoring in one SDK/compiler/scaffold package, generate typed owner-service clients from service declarations, and preserve public diagnostic codes across the Workspace HTTP bridge. Local package readiness does not publish the SDK or a compatible Engine Host.

  Give the Shell, reference Host, providers, contracts, private runtime support and tooling explicit owners. Root commands forward to the Shell package; packaged cohort versions come from its version. Project typed Console defaults and descriptor defaults from the same reviewed JSON source while retaining Host authority and deployment configuration.

- 61b741a: Compile natural workspace directories or explicit workspace options through one pipeline. Reuse each page implementation across Plugin Instances with stable owner-bound mount identity, relative navigation, exact App path overrides and administrator access checks. Resolve registered pages independently of static assets and keep requests and caches scoped to the mounted instance and authenticated subject.

### Patch Changes

- fb05d6d: Expose the existing directory compiler through `@lenso/console-sdk/compiler` so ordinary npm consumers can resolve it without a Console checkout. Add the owner package metadata and an opt-in npm distribution workflow without changing the SDK's workspace or scoped-read behavior.
