---
name: console-page-authoring
description: >-
  Author compiled Lenso Console pages in a plugin-owned console directory, declare
  typed owner services or workspaces, preview a page, or admit compiled output into
  a TypeScript application. Not for ordinary ConsoleShell React bindings or Shell
  presentation internals.
---

# Author and admit Console pages

Compilation, installation, admission, and authorization are separate steps.
Follow the application's installed package contracts, not a guessed central
registry or an unpublished source example.

## 1. Confirm the directory-authoring path

Read the application's manifest and existing `console/` entry. Check the installed
`@lenso/console-sdk` exports and author executable; in this repository use the
[authoring guide](../../../packages/console-authoring/README.md).

If the host explicitly composes ordinary React definitions with `bindConsole`,
read [page interactions](../console-page-interactions/SKILL.md) instead.

**Done:** identify the owning plugin, authored entry, target host, and SDK artifact.
Source availability is not proof that a released artifact includes that API.

## 2. Write owner source

Read [pages and services](references/pages-and-services.md) for routing,
workspace declarations, browser imports, and owner-local clients.
For page UI, also read [Console presentation](../console-page-interactions/references/presentation.md)
before choosing icons, controls or layout. Compiled pages follow the same design
rules; use only the surfaces their installed host actually supports.

Start from the existing convention or the installed scaffold. Edit the source
`console/` directory; generated `.lenso/console/` is reproducible output.
Use an ordinary page for a list/detail workflow. Reach for a Dashboard only when
the user needs widget membership/layout editing.

**Done:** page routes and navigation have real destinations; each service has
one domain owner and an explicit validation/authorization path. Browser code
imports browser-safe entries, not the server implementation.

## 3. Check and build

From the application that installed the executable:

```sh
bun run lenso-console-author check --entry console
bun run lenso-console-author build --entry console --plugin-id example.orders
```

Replace the example plugin ID with the owner's stable ID. `check` exercises
the type/projection/bundle path without starting the host or evaluating services.
Use the generated authoring tsconfig to resolve the owner-local client alias.

**Done:** generated plugin, declarations, descriptor, and assets correspond to
the authored source; errors are fixed in source rather than generated output.

## 4. Select the real runtime branch

Read [admission and preview](references/admission-and-preview.md).

- **Preview:** explicitly select example data or an already authenticated backend.
- **Application installation:** install exact generated Plugin/Manage objects and
  register exact mounts, services, assets, and trusted entry binding.

Compilation alone does neither. For page interactions, read the
[runtime support check](../console-page-interactions/references/runtime-support.md)
before adding a Shell contribution to compiled output.

**Done:** the actual host admits the intended owner/instance/workspace, resolves
non-overlapping mount paths, and enforces its existing authorization and writes.

## 5. Verify the boundary changed

Use the application's own focused scripts and the public compiler commands.
When maintaining the authoring package itself, inspect current root/package
scripts for SDK checks and convention tests. A changed browser/server boundary
requires a clean artifact-consumer proof, not only `lenso-source`.

For real services, prove allowed and denied requests, invalid input before
handler dispatch, retirement/late results, and required write confirmation.
For interactive pages, record actual host/browser behavior, themes, narrow
geometry, accessible semantics, and keyboard operation.

**Done:** distinguish compiler success, preview behavior, runtime admission, and
trusted authorization in the report. None grants release or production authority.
