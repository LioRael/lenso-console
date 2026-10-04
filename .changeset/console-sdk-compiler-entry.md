---
"@lenso/console-sdk": patch
---

Expose the existing directory compiler through `@lenso/console-sdk/compiler` so ordinary npm consumers can resolve it without a Console checkout. Add the owner package metadata and an opt-in npm distribution workflow without changing the SDK's workspace or scoped-read behavior.
