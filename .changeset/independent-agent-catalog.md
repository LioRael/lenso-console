---
"@lenso/console-web": minor
---

Replace the built-in/connected mode switch with catalog-derived full Agent
identities. Qualify Session navigation and caches by the owning Agent while
preserving separate Console Agent and App Agent state.

Make the Console Host select a durable SQLite configuration authority for the
Console Agent, including revision-fenced publication, history, rollback, and
restart recovery instead of browser-owned configuration state. Keep the
separate managed App outside that authority until it supplies an explicit
configuration Capability. Allow an App Agent Host to opt into
`lenso.agent.plugin-configuration@1`, route only that bounded control contract
through Console, and scope Plugin workbench requests and caches to the selected
Agent.

Let the reference App Agent Host explicitly select local, durable SQLite, or
remote Plugin configuration authority while keeping custom authority injection
at the embedding Host boundary.
