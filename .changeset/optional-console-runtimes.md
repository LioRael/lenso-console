---
"@lenso/console-web": minor
---

Add standalone Console and native-only Agent staging, default Console to explicit Agent connections, and improve the floating assistant's project-scoped history and shared session input. Prevent blank assistant views from adopting unrelated background runs.

Move the floating assistant into a separately built optional global UI plugin, with an explicit Agent package dependency and native Host feature. Add a Console-owned global contribution role and lazy shared-runtime mounting. Expose management MCP through an independent native plugin with required Auth and Management bindings and cancellation-aware transport.

Add an explicitly enabled background completion adapter over the existing Workspace Service capability. Preserve Host-bound caller identity, exact model/provider pricing policy and SQLite budget reservations without writing assistant session history.

Add separately bounded multi-round Agent tasks using the existing Loop, plugin/user/project Session namespaces, explicit revocable Session-write grants, live credential checks, and fail-closed execution concurrency across cancellation failures and restarts. Preserve stop-only access for exact admitted assertion snapshots after expiry while keeping Host control private.
