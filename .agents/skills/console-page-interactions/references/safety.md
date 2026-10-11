# Scope and ownership

## Activation

Use the supplied `activation.key` for `scopeKey`. It identifies one UI activation, not a plugin ID, route label, read-cache namespace, persisted preference or authorization scope. React context factories belong at module scope; controlled state belongs outside the keyed Provider. Keep persistent editors/panes outside the projection when they must survive projection changes.

`createConsolePageContext<T>()` exposes rendered `context`, committed `getContext()` and guarded `setContext()`. Retained setters become inert after closure; closed getters throw. Read `getContext()` at invocation time when a retained callback needs current committed state. Readonly is a type boundary, not runtime deep immutability.

`ConsolePageScope` retires command/return handles when its scope closes or another page owner replaces it; within a live scope, retained handles use current committed callbacks and command disabled state. `ConsoleActionScope` retires handles when its lease closes and checks current running state. Coordinate a single active selection owner; these components are not arbitration among competing tables. Stale cleanup must not remove a newer contribution.

For async work, pass the supplied `signal`, dispose subscriptions on closure, and check `activation.isCurrent()` before applying late results. Recheck after confirmation and before dispatching a write. Cancellation does not undo a dispatched write; report its actual outcome.

## Execution

The page owns canonical facts: selection targets, dirty state, permissions, locking, confirmation, running, errors and success/partial-failure policy. Expose presentation updates through context only as requests the page validates; do not let a preference or corner consumer manufacture those facts.

Snapshot target IDs before confirmation. A later selection change must not expand a confirmed operation. Use a synchronous execution lock for repeated invocations and a real `running` projection while executing. Preserve or reconcile selection on failure explicitly; clearing selection after every outcome is not a default. `ConsoleDockSelection` has no per-action disabled field: use the supported running behavior, action availability and guarded execution rather than inventing one.

Command contributions are opt-in presentations of existing actions. Their handlers retain the same permission checks, target snapshots, confirmation, lock and feedback as page controls. Selection actions are not automatically searchable. Prefer omitting a dangerous command over creating a second, weaker execution path.

UI visibility, disabled state, `session.canAccess`, and admitted presentation are not server authorization. Server operations enforce their policy independently.

## Presentation and navigation

Pages contribute content; the host owns Dock geometry, motion, position, navigation presets and restoration. Use the existing scoped selection projection rather than altering pins, preferences or Shell DOM.

For destinations and actions, `label` is the concise visible/accessibility name; `tooltip` adds a hover/focus explanation and defaults to the label for `ConsoleIconButton`. Tooltips do not replace accessible names. Use icon-only corner controls where meaningful, with actual hover/keyboard-focus tooltips and touch-understandable actions.

Return is an explicit named task transition through the public navigation/action path, not `history.back()` or an inferred parent URL. Keep dirty/running navigation guards in that path. Route tabs use public generated hrefs, host navigation, and native modified clicks.

Respect overlay focus/dismissal ownership and retiring-control inertness. Do not add page-level autofocus to generic projections; this is not a blanket focus ban. The Shell's Command search owns immediate focus, repeated-open refocus and restoration, and other real dialogs retain their own focus contracts.
