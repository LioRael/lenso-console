---
"@lenso/console-web": minor
---

Add standalone Console and native-only Agent staging, default Console to explicit Agent connections, and improve the floating assistant's project-scoped history and shared session input. Prevent blank assistant views from adopting unrelated background runs.

Move the floating assistant into a separately built optional global UI plugin, with an explicit Agent package dependency and native Host feature. Add a Console-owned global contribution role and lazy shared-runtime mounting. Expose management MCP through an independent native plugin with required Auth and Management bindings and cancellation-aware transport.
