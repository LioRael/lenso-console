# ADR-0004: Prefer native Console page contributions

Status: Accepted; Console- and App-scoped Workspace routing implemented.

The [page contribution design](../console-page-contributions.md) records the
implemented `lenso.ui.contribution@1` contract, runtime API, routing, loading,
and lifecycle details, while keeping later App-scoped service binding explicit.

## Context

Console must support complete App administration pages and independent tool
workspaces, including complex project-management interfaces. Defaulting every
Plugin to an iframe would make native navigation, layouts, shared context, and
cross-page interaction depend on an extensive message bridge. Schema-only pages
would restrict the business interfaces developers can build.

## Decision

Native frontend modules are the primary page-contribution mode. Plugins can
contribute full pages and multi-page workspaces using Console's supported route,
theme, and context integrations. Iframes remain an optional way to embed external
pages, not the required extension boundary.

App administration pages and Console tool workspaces share the contribution
mechanism while retaining separate business owners, target identities, and
lifecycles. The Shell owns integration, not user-management, order-management,
or project-management rules. Optional UI components and generated forms must not
be the only way to implement Plugin pages.

The intended installation workflow does not require editing or recompiling
Console source. This does not select a module loader, dependency-sharing scheme,
SDK format, or universal backend hot-reload mechanism.

## Trust and consequences

Native contributions execute as trusted code in the same JavaScript environment.
An SDK permission declaration is not a browser isolation boundary. Installation
and enablement must make the code trust decision explicit; backend providers
retain final business authorization. Backend authorization cannot isolate one
native Plugin from another Plugin acting with the same browser session authority.

A connected App advertising a page does not automatically authorize executing
its code. App installation and Console extension installation remain explicit
targets. This preserves ADR-0002's authority separation while adding a future UI
extension path.

Compatibility, shared dependencies, CSS scope, routing, cleanup, and failure
handling become platform responsibilities. Recoverable errors should be
contained, but native modules cannot promise hard isolation from global mutation,
resource exhaustion, or malicious code. Use a separate isolation/deployment
boundary when that is a requirement.

## Alternatives

- **Iframe by default:** rejected as the primary mode because it prioritizes
  isolation over the desired native developer freedom and interaction model.
- **Schema-only UI:** rejected as the general model; useful as an optional
  productivity tool for routine forms and tables.
- **Static imports into Console source:** insufficient as the extension model
  because adding a Plugin would require changing and rebuilding the Shell.

## Remaining proof before claiming target-bound business support

The baseline proves a Plan-bound provider, direct primary-rail Workspace, both
Console- and App-scoped deep links, immutable same-origin assets, a shared React
runtime, environment context, scoped navigation, cancellation, and contained
failures. App-scoped business administration still requires the cross-App
Connector and typed service-transport work. A connected App remains unable to
advertise or inject executable UI into Console.
