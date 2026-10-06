# @lenso/console-web

## 1.21.0

### Minor Changes

- 805c0dd: Expose a shared Console locale context, Plugin translation namespaces, lazy catalog loading, and locale-aware date and number formatting. Ordinary authenticated accounts can open personal Settings, persist their language, or follow a global default. Global default changes require the explicit `console.locale.default.manage` Access Control permission and a durable locale-store provider.
- 7e2ed87: Unify Console page authoring in one SDK/compiler/scaffold package, generate typed owner-service clients from service declarations, and preserve public diagnostic codes across the Workspace HTTP bridge. Local package readiness does not publish the SDK or a compatible Engine Host.

  Give the Shell, reference Host, providers, contracts, private runtime support and tooling explicit owners. Root commands forward to the Shell package; packaged cohort versions come from its version. Project typed Console defaults and descriptor defaults from the same reviewed JSON source while retaining Host authority and deployment configuration.

- 61b741a: Compile natural workspace directories or explicit workspace options through one pipeline. Reuse each page implementation across Plugin Instances with stable owner-bound mount identity, relative navigation, exact App path overrides and administrator access checks. Resolve registered pages independently of static assets and keep requests and caches scoped to the mounted instance and authenticated subject.
- f11a7d9: Add standalone Console and native-only Agent staging, default Console to explicit Agent connections, and improve the floating assistant's project-scoped history and shared session input. Prevent blank assistant views from adopting unrelated background runs.

  Move the floating assistant into a separately built optional global UI plugin, with an explicit Agent package dependency and native Host feature. Add a Console-owned global contribution role and lazy shared-runtime mounting. Expose management MCP through an independent native plugin with required Auth and Management bindings and cancellation-aware transport.

  Add an explicitly enabled background completion adapter over the existing Workspace Service capability. Preserve Host-bound caller identity, exact model/provider pricing policy and SQLite budget reservations without writing assistant session history.

  Add separately bounded multi-round Agent tasks using the existing Loop, plugin/user/project Session namespaces, explicit revocable Session-write grants, live credential checks, and fail-closed execution concurrency across cancellation failures and restarts. Preserve stop-only access for exact admitted assertion snapshots after expiry while keeping Host control private.

  Include checksum-pinned matching CLI and ACP companions in native-only Agent packages; add actual offline npm consumer smoke checks for dispatcher commands. Keep floating entry visibility compatible with typed LensoUI styles.

### Patch Changes

- 4e56e4d: Follow App dev backend activation through its URL file while retaining the Vite frontend process and existing browser request checks.
- ccd5b06: Support fixed Shell, API, and Auth paths per Console instance, including isolated
  operator workspaces with explicit authorization and optional Management binding.
- ccd5b06: Serialize password login and durable logout with origin-wide Web Locks. Retire session requests and private query caches when another same-origin identity surface changes Cookies, and revalidate after its transition completes.
