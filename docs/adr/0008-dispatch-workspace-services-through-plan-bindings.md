# ADR-0008: Dispatch Workspace services through Plan bindings

Status: Accepted design; implementation pending.

## Context

Native Workspace modules need backend behavior, but accepting provider URLs or
adding one Console route per business tool would bypass Plugin ownership and
make Console a universal privileged proxy. The current page contribution
contract declares service requirements but cannot invoke them.

## Decision

Keep domain contracts authoritative and add one Console integration Capability,
`lenso.ui.workspace-service@1`. A contributing Plugin implements the adapter
using its domain's generated codecs. Console pairs contribution and service
providers by Plan-bound instance identity, freezes the allowlist at activation,
and exposes only mount-scoped unary and server-stream browser calls.

Browser requests can name a mount-local service and declared Operation, but not
a provider, URL, credential, or arbitrary route. The first release supports
owner-provided services. Subject-provided services require the explicit
cross-App Connector.

The complete contract and lifecycle are in
[Workspace service transport](../workspace-service-transport.md).

## Consequences

- Console core gains a reusable transport seam but no observability, users, or
  project-management business API.
- Providers retain decoding, domain errors, and final authorization.
- Mount removal or Generation replacement revokes dispatch server-side.
- Observe has a legitimate implementation path without a temporary core route.
- Generic arbitrary HTTP forwarding and ambient current-App targeting remain rejected.

