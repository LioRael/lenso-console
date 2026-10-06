# @lenso/console-sdk

## 0.2.0

### Minor Changes

- 805c0dd: Expose a shared Console locale context, Plugin translation namespaces, lazy catalog loading, and locale-aware date and number formatting. Ordinary authenticated accounts can open personal Settings, persist their language, or follow a global default. Global default changes require the explicit `console.locale.default.manage` Access Control permission and a durable locale-store provider.
- 7e2ed87: Unify Console page authoring in one SDK/compiler/scaffold package, generate typed owner-service clients from service declarations, and preserve public diagnostic codes across the Workspace HTTP bridge. Local package readiness does not publish the SDK or a compatible Engine Host.

  Give the Shell, reference Host, providers, contracts, private runtime support and tooling explicit owners. Root commands forward to the Shell package; packaged cohort versions come from its version. Project typed Console defaults and descriptor defaults from the same reviewed JSON source while retaining Host authority and deployment configuration.

- 61b741a: Compile natural workspace directories or explicit workspace options through one pipeline. Reuse each page implementation across Plugin Instances with stable owner-bound mount identity, relative navigation, exact App path overrides and administrator access checks. Resolve registered pages independently of static assets and keep requests and caches scoped to the mounted instance and authenticated subject.

### Patch Changes

- fb05d6d: Expose the existing directory compiler through `@lenso/console-sdk/compiler` so ordinary npm consumers can resolve it without a Console checkout. Add the owner package metadata and an opt-in npm distribution workflow without changing the SDK's workspace or scoped-read behavior.
