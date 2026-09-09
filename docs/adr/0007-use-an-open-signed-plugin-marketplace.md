# ADR-0007: Use an open signed Plugin marketplace

Status: Accepted design; implementation pending.

## Context

An extensible team workbench needs discovery, identity, compatibility, risk
context, and updates. A GitHub URL alone does not provide these product facts.
A mandatory central store would unnecessarily combine discovery, source,
artifact hosting, and target execution authority.

## Decision

Lenso maintains an official signed directory while allowing other signed
catalogs, source hosts, artifact origins, and explicit direct Bundle installs.
Catalog records reference immutable verified Bundles by digest and derive
executable contract facts from those Bundles.

Publisher identity verification, source linkage, artifact verification, review,
official ownership, advisories, yanks, and revocations are independent facts.
The target Host remains final authority for download admission, installation,
configuration, Plan resolution, readiness, execution, and business permission.

Every install names exactly one App or Console extension target. Companion
products produce two explicit proposals. Installed Plugins remain usable while
the marketplace is offline and never resolve mutable `latest`, branch, or tag
references during execution.

The detailed schema boundary and first Observe tracer are in
[Console Plugin marketplace](../plugin-marketplace.md).

## Consequences

- The official marketplace improves discovery without monopolizing hosting.
- Catalog inclusion and a trust badge cannot grant execution authority.
- Console reuses Bundle verification and target configuration authorities; it
  does not create a second installer.
- A Console-owned durable Plugin Root and packaged implementation runtime are
  prerequisites for the discovery-to-Workspace tracer.

