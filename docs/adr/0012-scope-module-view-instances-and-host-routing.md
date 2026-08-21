---
status: accepted
---

# Scope Module View instances and let the Host own routing

Every mount of a Module View creates an independent Module View Instance keyed
by its Console Generation, Module Instance, stable View identity, mount
identity, and Target App binding. Two windows, panes, mounts, or Target Apps do
not share transient Component state. Shared state requires an explicit owner
outside the UI instance.

A Target App binding is immutable for the instance lifetime. Selecting another
Target App retires the old instance and creates a new one with a newly resolved
and attenuated context; Console never delivers a target-changed event into
state created for another App.

The Console Host owns navigation and routing on both native and Web targets. A
Module View declares a stable identity and typed parameter schema. The Host
validates and delivers typed parameters, encodes and decodes Web URLs, resolves
navigation conflicts, supports deep links, and restores navigation. A Module UI
does not read browser location or declare an authoritative raw URL path.

## Consequences

Mount lifecycle and routing are testable without GPUI or a browser. Host-owned
navigation intent may survive generation replacement, but Module-local
transient state and Target App context do not cross an instance seam.
