---
"@lenso/console-web": patch
---

Isolate Console convention dependency installs so an interrupted build cannot
block later precompiled development Host builds through Bun's shared cache.
