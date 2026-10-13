---
name: console-plugin-development
description: >-
  Develop a Lenso Console plugin or page: choose compiled directory authoring or
  local React composition, adapt page UI to Console icons/corners/context,
  connect owner services, or install an optional Dashboard. Not for landing,
  publishing, or merely running an existing Console.
---

# Develop a Console plugin

Use this as the entry point, then read only the skill for the changed boundary.
An exported type, an installed plugin, an admitted page, and a rendered Shell
contribution are different contracts.

For page UI, read [Console presentation](../console-page-interactions/references/presentation.md)
before choosing icons, controls, tables, detail navigation or widget layout.
That branch is mandatory for visual changes in both authoring paths.

## 1. Establish the consumer

Read the application's instructions, dependency manifest, installed package
exports, and actual host assembly. In this repository, read the affected package
README and one working example before choosing an API.

Identify:

- **Compiled page:** an application-owned `console/` directory is built with
  `@lenso/console-sdk`, then explicitly mounted into a TypeScript Console host.
- **Local composition:** `@lenso/console-react` definitions and bindings are
  supplied to an application-owned `ConsoleShell`.
- **Host change:** the task changes assembly, session admission, router guards,
  preference storage, or the renderer that consumes page contributions.

**Done:** name the real host, installed API surface, business owner, and changed
boundary. If the host is absent, ask which application will own it rather than
creating another runtime implicitly.

## 2. Choose the smallest branch

| Outcome | Read |
| --- | --- |
| Compile pages, declare owner services, configure workspaces, or mount the output | [Console page authoring](../console-page-authoring/SKILL.md) |
| Bind local pages, contribute corner controls, selection actions, commands, or task context | [Console page interactions](../console-page-interactions/SKILL.md) |
| Add a Dashboard widget, configure instances, or connect Dashboard persistence | [Dashboard widgets](../console-dashboard-widgets/SKILL.md) |
| Reuse Auth administration or read-only plugin inspection | [Optional adapters](references/optional-adapters.md) |
| Change underlying Lenso service lifecycle, Auth, or explicit Manage exposure | The framework's installed guidance for that package; Console adapts the existing owner |

Read more than one branch only when the task crosses those responsibilities.
For Command and task context, the interactions skill's host-support check is
required even when the public package exports the requested component.

**Done:** select the branch and explain why a smaller existing capability does
not already solve the request.

## 3. Preserve ownership

| Owner | Responsibility |
| --- | --- |
| Business service | Canonical data, validation, authorization, write guarantees |
| Page | Controlled state, selection targets, confirmation, async outcomes |
| Plugin definition | Stable page/destination/widget identities and required services |
| Application host | Exact installations, mounts, router guards, trusted session scope and stores |
| Shell | Navigation presentation, Dock views, task-context layout, focus and motion |
| User preferences | Which admitted destinations to pin and how to present them |

Project existing state into Shell capabilities; keep canonical facts with their
owner. A pin, Command result, or visible navigation item is not a permission.
Use explicit visible `label` and optional supplemental `tooltip`.

The page contributes meaning, not Dock coordinates or a replacement global
navigation container. Ordinary page/editor controls belong in corners; consult
the presentation branch before using a host-reserved Dock surface.
Local plugin bindings can define `dockViews`; the application
must explicitly select them through `ConsoleShell.dock.leading`. Use
`ConsoleDockContent` inside that view host, with its typed services and activation.
Compiled SDK descriptors and the admitted/preview `ConsoleInteractionHost` do
not install local plugin views. Check public exports and the consuming host;
this presentation API does not install an Agent service or transport.

## 4. Prove the selected contract

Use the branch's focused checks. State the concrete regression before adding
coverage; extend existing behavior proofs when they already exercise the seam.
For interactive changes, exercise the real host in a browser: state/geometry,
accessible semantics, keyboard operation, themes, and narrow-screen access.

Examples are scoped evidence, not production assembly:

- `examples/composed-console` is an executable sample-data host.
- `examples/ts-console` is a local operator host, not a complete application
  installing every optional Console page.

**Done:** report the implemented public contract, exact checks actually run,
host limitations, and remaining assumptions. Successful local checks do not
authorize publication or landing.
