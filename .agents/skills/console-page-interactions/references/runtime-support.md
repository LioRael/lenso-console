# Runtime support

Use this matrix before choosing recipes. Public export availability is necessary, not sufficient: the consuming host must render the contribution.

| Surface | Local composed `ConsoleShell` page | Current compiled/admitted SDK page and SDK preview |
| --- | --- | --- |
| Controlled `createConsolePageContext<T>()` | Supported with its Provider | Supported with its Provider |
| `ConsoleLayout.Corner` / `Foreground` | Shell supplies layout | Admitted/preview hosts supply layout |
| Selection `ConsoleActionScope` | Shell renders selection | Hosts render selection through `ConsoleActionHost` and `ConsoleDock` |
| `ConsolePageScope` commands and hidden/tabs/object/return Context Bar | Shell consumes page contribution and presents Command/Context Bar | Updated candidate admission and preview hosts consume both projections through `ConsoleInteractionHost` |
| Plugin `dockViews` / `ConsoleDockContent` bar and tray | Explicit local bindings selected by `ConsoleShell.dock.leading` | Not installed by compiled descriptors or `ConsoleInteractionHost` |

Check the consuming host and its installed artifact, not just the package version or export. Older admission/preview artifacts render selection only. Require an updated host using `ConsoleInteractionHost` (or an equivalent verified consumer) before promising page Command/Context Bar. These candidate changes are not proof of a published release.

The admitted/preview interaction host offers opt-in page commands and selection at the shared Dock, with explicit hidden/tabs/object/return context. It does not invent local Shell destinations, presets or an editor. Those remain host-owned. SDK navigation still uses segment arrays; tab hrefs come from `navigation.href(segments)`.

## Public boundary and evidence

- `packages/console-react/src/index.ts` re-exports composition, activation, layout, page context, icon button, Dock, action-scope and interaction-host APIs. Use `@lenso/console-react`, never its source subpaths or `plugins/console/shell/src/...` imports.
- `packages/console-react/src/console-shell.tsx` supplies `ConsoleActionHost`, passes selection and page contributions to its foreground renderer, and feeds page contributions to Command and Context Bar. `packages/console-react/README.md` describes these local composition contracts.
- `packages/console-authoring/compiler/compiler.mjs` externalizes `@lenso/console-react`; `plugins/console/shell/src/app/console-admission.tsx` injects that same module into compiled workspaces. Its `AdmittedActionHost` uses the public interaction host inside the admitted mount lifetime.
- `packages/console-authoring/dev/preview-shell.tsx` uses the same interaction host in example and backend mode. A local SDK preview is not the standalone composed `ConsoleShell`.
- `tooling/distribution/sdk-preview.test.mjs` checks/builds authored source through the public author executable, exercises its compiled output in the production Shell and its source in both preview modes. `tooling/distribution/console-ts.test.mjs` verifies candidate archives in a clean consumer.
- `packages/console-authoring/src/index.ts` exports SDK `PageProps` through the `@lenso/console-sdk` package. `activation` is optional for compatibility with older hosts. Use supplied activation when present; on an older host, establish an activation with public `useConsoleActivation` tied to the actual page lifetime and parent signal, or report the unsupported lifecycle. Do not substitute a cache key for an activation.

## Different page contracts

Local `ConsoleLocalPageProps` supplies required `activation`, `signal`, typed bound `services`, and binding-local `navigation.go(pageId, params)` / `href(pageId, params)`.

SDK `PageProps` supplies admitted services and mount/location data; navigation uses `go(segments)` / `href(segments)` and `openWorkspace(request)`. Do not copy local page-ID calls into compiled pages. Route/read/cache namespaces belong to the authoring contract, not this skill.

`ConsoleActionHost` and `ConsoleDock` are public low-level host tools, not instructions for a plugin to replace its existing host. Host changes need a separate host-owned task and validation. For local plugin Dock views, follow the `Local Dock views` contract in `packages/console-react/README.md`: define stable views and services, bind them, and explicitly select leading references. `ConsoleDockContent` requires the Shell's view host; importing its export inside a compiled page does not install that host or an Agent service.
