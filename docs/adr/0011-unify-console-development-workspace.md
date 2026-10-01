# ADR-0011: One Console development workspace

Status: Accepted.

Console's contracts, Shell, reference Host, Management and MCP implementations,
Observe, and runtime helpers previously had seven independent Cargo workspaces.
They repeated the same framework patches and locks. A framework upgrade could
therefore compile one package against a different Rust contract type identity
from another, and full checks rebuilt overlapping dependency graphs.

Use one root Cargo workspace and `Cargo.lock`, with immutable framework and
owner-source alignment in the root manifest. Keep package paths and dependency
ownership from ADR-0010. Workspace membership does not activate a Plugin, grant
an App authority, or let Shell depend on a concrete business provider.

The default members are the Console Plugin and reference App. Full checks use
`--workspace`; focused checks use `-p`. Formatting runs once from the root.
`packages/console-support` stays an excluded standalone package because it is
an explicitly adopted Engine support source and is copied into a precompiled
development kit. Its packaging protocol is not the repository's Cargo workspace.

The page SDK is an explicit pnpm workspace member and has its own check. The
reference Agent launcher remains a separately staged distribution.

`examples/plugin-host` demonstrates the selected framework's high-level
`NativeWebHost` API without importing reference App assembly. Removing the
optional Console dependency preserves the App's health endpoint and removes the Shell.
This real consumer is the removal proof; a directory move or a package name is
not sufficient evidence that Console is optional.

UI 0.8.0 uses the reconstructed HeroUI API. Console uses its public Button,
Input, TextField, TextArea, Modal, Autocomplete, Breadcrumbs, Tabs, Chip, Select
and Switch compositions. Console owns navigation and settings row compositions
because those product recipes are absent from this UI release. They do not
implement replacement control primitives. Product StyleX overrides are extracted
without layers so the package base reset cannot override them when a browser
fixture loads styles in a different order. Theme values come from the new public
CSS token contract; Console retains its own font choice and sidebar geometry.
