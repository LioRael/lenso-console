---
"@lenso/console-web": minor
---

Run Console and Observe OTLP as a Lenso Web App whose Resolved Plan binds Plugin-owned buffered and streaming HTTP Endpoints to Host-owned `lenso.web-ingress` instances. Remove Axum from production service dependencies and make the UI contribution Operation name composable with HTTP providers.

Publish the reference Host Catalog beneath `LENSO_CONSOLE_HOME`, resolve the visible Console Plugin Root before Kernel startup, and preserve normal `lenso app` and `lenso plugins` configuration semantics.
