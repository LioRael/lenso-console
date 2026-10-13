---
name: console-dashboard-widgets
description: "Console dashboards: build or refine widget UI, corner editing controls, layout/drag behavior, configuration editors and revisioned persistence. For user-arranged dashboards only, not ordinary index/list/detail pages."
---

# Console dashboard widgets

Use `@lenso/console-dashboard` only for an intentionally user-arranged dashboard. A host index, ordinary list/detail page, or plugin-authoring route is not a dashboard merely because it contains cards. Console owns page hosting and action scope; the dashboard package supplies an optional binding, widgets, draft editing, and a store contract.

## Workflow

1. **Choose the surface.** Confirm the page needs user-managed widget membership or layout. If it is an ordinary workflow page, implement it with Console's normal page/plugin APIs. Keep plugin authoring and Shell behavior in their own domains.
2. **Read the package contract.** Check `packages/console-dashboard/README.md`, `package.json` exports, and the current source for every API you plan to use. The root entry exports shared JSON/store contracts; `/react` exports `bindDashboard`, `defineDashboardWidget`, widget types and draft helpers; `/server` and its explicit subpaths are server-only. Do not infer helpers from examples or old builds.
3. **Design the surface.** For a dashboard UI or interaction change, read [Dashboard presentation guidance](references/presentation.md) before composing controls; it routes shared icons/corners/context rules. Complete this step with a browser-verifiable content, default-size and editing-placement plan.
4. **Define widgets explicitly.** Give each definition a stable `bindingId` + `widgetId`, title, config version, synchronous `configSchema.parse(unknown)`, JSON default config and bounded default/min/max sizes. Use `defineDashboardWidget` to validate the frontend definition. Add a controlled `ConfigEditor` only when users need configuration. Keep renderer implementation identity (`implementationRevision`) distinct from persisted configuration version. Supply the same application-owned schema/size metadata to server definitions.
5. **Compose the page.** Build an explicit widget list and call `bindDashboard` with a stable dashboard `id`, route, authorized `store`, defaults, and a permission key that changes with session/widget permissions. Host the binding inside the existing `ConsoleShell`; import `@lenso/console-dashboard/styles.css` once. Follow `examples/composed-console/composition.tsx` for composition shape.
6. **Connect trusted storage only when needed.** Expose `read` and `save` through the application's existing authenticated transport. Build a per-trusted-request store with `createAuthorizedDashboardStore`; resolve application/dashboard/target/tenant and personal realm+subject or organization scope from trusted server context. Keep `canRead`, `canWrite`, and `canUseWidget` separate. Its authorization revision must cover identity and all permission facts and is an ephemeral guard—not a storage key or browser permission token.
7. **Own persistence semantics.** A durable `DashboardRepository.transaction` must isolate scope, roll back on exceptions, enforce atomic revision compare-and-swap and unique `(scope, mutationId)` records, and preserve retries for the documented retry lifetime. Configuration migrations and durable schema migrations belong to the application. Optional SQLite/Postgres/D1, Auth and Audit adapters are explicit integrations, not automatically installed infrastructure or production authority. The in-memory repository is single-process only.
8. **Verify the behavior.** Confirm unavailable, missing, version-incompatible, restricted, and unauthorized widgets never mount either renderer or editor; persisted references do not grant authority. Exercise configuration validation, layout editing, failed-save draft retention, same-content retry with the same mutation ID, changed-content retry with a new ID, and conflict requiring explicit reload. Validate the API from its declared package entry points and run the package checks described in its README. For UI completion, perform real-browser checks for editing, restricted/missing renderer non-mount, drag/resize, keyboard controls, conflict/reload, themes and narrow reflow.

### Completion criteria

- Before composing, identify the host route, widget definitions, trusted scope,
  and whether persistence is local-only or connected to a real repository.
- Before adding a backend, identify its schema-initialization owner, transaction
  guarantees, authorization policy, and retry lifetime. An existing service
  adapter is preferable to a second business backend.
- Finish with the selected public imports, concrete behavior checks actually
  run, and remaining limits. A sample store is not durable production evidence.

## Model

- A **definition** is application-owned metadata and renderer code, keyed by stable `bindingId` + `widgetId`.
- An **instance** is a dashboard document's placement-independent membership record: instance ID, definition reference, config version and JSON config. Multiple instances can reference one definition.
- A **document** stores instances and placements; it is not a widget registry or authorization source. Placement edits do not redefine an instance.
- **Draft** is local pending UI state. Save persists it against the snapshot revision; conflict does not silently replace it. Restore defaults replaces the draft until saved.
- **Store** is the `DashboardStore` read/save contract. It does not prescribe a transport, Auth system, or durable database.
- **Widget configuration** is bounded JSON, never executable values. Parsers reject unsupported input. Application-owned migrations handle old config versions. Dashboard documents are separate from the Shell's Dock preferences and presets.
- **Authorization** is scoped server policy. A definition reference or hidden document record cannot establish access. Restricted or unavailable content must remain unmounted; server saves preserve restricted and missing instances rather than deleting hidden data.

## Source of truth

Read only the section needed for the chosen branch:

- [Package guide](../../../packages/console-dashboard/README.md): composition,
  storage, authorization, and existing checks.
- [React exports](../../../packages/console-dashboard/src/react.tsx) and
  [widget definitions](../../../packages/console-dashboard/src/widgets.ts):
  frontend APIs.
- [Contract](../../../packages/console-dashboard/src/contract.ts) and
  [server implementation](../../../packages/console-dashboard/src/server.ts):
  persistence and authorization.
- [Package entries](../../../packages/console-dashboard/package.json):
  supported imports.
- [Composed example](../../../examples/composed-console/composition.tsx):
  executable sample composition, not production storage.

When documentation and code disagree, check current exports and implementation
and report the discrepancy. Update the guide only when that is part of the task.
