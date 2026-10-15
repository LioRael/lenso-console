# Runtime support

Use this matrix before choosing recipes. Public export availability is necessary, not sufficient: the consuming host must render the contribution.

| Surface | Local composed `ConsoleShell` page | Current compiled/admitted SDK page and SDK preview |
| --- | --- | --- |
| Controlled `createConsolePageContext<T>()` | Supported with its Provider | Supported with its Provider |
| `ConsoleLayout.Corner` / `Foreground` | Shell supplies layout | Admitted/preview hosts supply layout |
| `ConsoleTableContext` semantic groups and table arbitration | Layout supplies one shared coordinator | Supported inside the updated Layout; check the installed artifact |
| Selection `ConsoleActionScope` | Shell renders selection | Hosts render selection through `ConsoleActionHost` and `ConsoleDock` |
| `ConsolePageScope` commands and hidden/tabs/object/return Context Bar | Shell consumes page contribution and presents Command/Context Bar | Updated candidate admission and preview hosts consume both projections through `ConsoleInteractionHost` |
| Plugin `dockViews` / `ConsoleDockContent` bar and tray | Explicit local bindings selected by `ConsoleShell.dock.leading` | Not installed by compiled descriptors or `ConsoleInteractionHost` |

Check the consuming host and its installed artifact, not just the package version or export. Older admission/preview artifacts render selection only. Require an updated host using `ConsoleInteractionHost` (or an equivalent verified consumer) before promising page Command/Context Bar. These candidate changes are not proof of a published release.

The admitted/preview interaction host offers page commands and selection at the shared Dock, with explicit hidden/tabs/object/return context. Its optional `destinations` are supplied by the host; production admission derives them from authorized mounts. It does not discover destinations or supply a navigation preference store/editor. SDK navigation still uses segment arrays; tab hrefs come from `navigation.href(segments)`.

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

## Contextual design capability boundary

The current local candidate adds a table-specific coordinator; this is not proof
of a published release. Recheck the installed artifact before page implementation.

| Design need | Verified capability / boundary |
| --- | --- |
| Corner query or pagination groups | [ConsoleLayout](../../../../packages/console-react/src/console-layout.tsx): `Corner` takes `area`, React `children`, `active`, `xstyle`; it portals composed controls. It does not arbitrate contexts or declare semantic groups. Use accessible React/library composition for group meaning; no invented `group` prop. |
| Table context and semantic operation groups | [ConsoleTableContext](../../../../packages/console-react/src/console-table-context.tsx): `scopeKey`, `label`, `mode`, `groups`, `filters`, `locked`, content children. Query/filter/insertion/view/navigation/commit kinds have overridable default placements. `filters` projects conditions and actions together as one semantic corner group, with measured wrapping and content clearance. Layout owns observation, focus/explicit precedence, dwell, hysteresis and retirement. See the [table controls contract](../../../../packages/console-react/README.md#table-controls-and-contextual-defaults). |
| Necessary icon-only button | [ConsoleIconButton](../../../../packages/console-react/src/console-icon-button.tsx): `label`, optional `tooltip`, SVG children; supplies accessible name and tooltip composition. Pagination is composed separately, not forced through this button. |
| Page facts and task context | [Page context](../../../../packages/console-react/src/console-page-context.tsx) and [scopes](../../../../packages/console-react/src/console-action-scope.tsx): controlled Provider/activation plus `ConsolePageScope` context/commands. Context kinds are hidden/tabs/object with supported return; there is no table-context kind or viewport policy. |
| Multi-select Dock transformation | `ConsoleActionScope` publishes `ConsoleDockSelection`: count, scopeLabel, flat actions, running/blocked and exit. [Dock](../../../../packages/console-react/src/console-dock.tsx) renders selection; the current action type has no arbitrary semantic-group registry. Existing host ownership checks prevent stale owners executing/clearing a successor; they are not focus/viewport arbitration. |
| Host presentation | [Local Shell](../../../../packages/console-react/src/console-shell.tsx) consumes page/selection contributions and page groups; [interaction host](../../../../packages/console-react/src/console-interaction-host.tsx) consumes admitted/preview projections. [Admission](../../../../plugins/console/shell/src/app/console-admission.tsx) mounts that host. Check installation: importing the public export alone does not install a renderer. |
| User customization | Business pages have no layout editor by default. Hosts can enable `tableControls.customization` for automatic/explicit context and per-kind corner or inline placement. `ConsoleLayout.tableControls` / `ConsoleShell.tableControls` accept a controlled placement map and change handler. Durable preferences remain host-owned and separate from navigation presets. |

### Remaining boundaries

The coordinator is table-specific, not a chart observer or universal scenario
registry. It does not change selection-Dock action types, business state or
authorization. Persistent placement storage needs host integration. Existing
callers of raw `Corner` remain independent; migrate a page's related table groups
together rather than mixing competing projections.
