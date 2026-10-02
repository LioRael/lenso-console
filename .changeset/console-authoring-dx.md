---
"@lenso/console-web": minor
"@lenso/console-sdk": minor
---

Unify Console page authoring in one SDK/compiler/scaffold package, generate typed owner-service clients from service declarations, and preserve public diagnostic codes across the Workspace HTTP bridge. Local package readiness does not publish the SDK or a compatible Engine Host.

Give the Shell, reference Host, providers, contracts, private runtime support and tooling explicit owners. Root commands forward to the Shell package; packaged cohort versions come from its version. Project typed Console defaults and descriptor defaults from the same reviewed JSON source while retaining Host authority and deployment configuration.
