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

## Contextual design capability boundary

Source check for this design update: verified remote main snapshot `608c5c1`. Recheck
these contracts in the consuming artifact before page implementation. All names
below are current public primitives, not the proposed table/scenario preset API.

| Design need | Verified capability / boundary |
| --- | --- |
| Corner query or pagination groups | [ConsoleLayout](../../../../packages/console-react/src/console-layout.tsx): `Corner` takes `area`, React `children`, `active`, `xstyle`; it portals composed controls. It does not arbitrate contexts or declare semantic groups. Use accessible React/library composition for group meaning; no invented `group` prop. |
| Necessary icon-only button | [ConsoleIconButton](../../../../packages/console-react/src/console-icon-button.tsx): `label`, optional `tooltip`, SVG children; supplies accessible name and tooltip composition. Pagination is composed separately, not forced through this button. |
| Page facts and task context | [Page context](../../../../packages/console-react/src/console-page-context.tsx) and [scopes](../../../../packages/console-react/src/console-action-scope.tsx): controlled Provider/activation plus `ConsolePageScope` context/commands. Context kinds are hidden/tabs/object with supported return; there is no table-context kind or viewport policy. |
| Multi-select Dock transformation | `ConsoleActionScope` publishes `ConsoleDockSelection`: count, scopeLabel, flat actions, running/blocked and exit. [Dock](../../../../packages/console-react/src/console-dock.tsx) renders selection; the current action type has no arbitrary semantic-group registry. Existing host ownership checks prevent stale owners executing/clearing a successor; they are not focus/viewport arbitration. |
| Host presentation | [Local Shell](../../../../packages/console-react/src/console-shell.tsx) consumes page/selection contributions and page groups; [interaction host](../../../../packages/console-react/src/console-interaction-host.tsx) consumes admitted/preview projections. [Admission](../../../../plugins/console/shell/src/app/console-admission.tsx) mounts that host. Check installation: importing the public export alone does not install a renderer. |
| User customization | Local Shell preferences cover navigation Dock collections/position/mode and tab placement. They do not implement arbitrary per-context corner layouts or scenario presets. Custom design requests guide composition within supported contracts; persistence of new layout choices requires host scope. |

### Minimum extension needed (design proposal only)

The missing capability is a Shell-owned contextual operation coordinator: a small
content-owner declaration for identity/target and operation groups; one active
owner; page fallback; viewport eligibility with tunable enter/exit hysteresis and
brief dwell; real focus/explicit-choice precedence and interaction locks; cleanup
on retirement. Shell, not each plugin, should own positioning and observation.
A semantic-group presentation contract would also be needed where a flat selection
array cannot faithfully express group boundaries. If persistent user-defined
corner placements are required, add a bounded host preference contract separately.

No callable coordinator, automatic table/chart focus hook, generic group registry
or scenario preset is verified in this snapshot. These are the smallest design
extensions to discuss, not exported names or implementation instructions. This
skill update does not implement them. Report a missing capability and its concrete
minimum extension; do not claim the recommended combinations can be invoked as a
preset, patch private Shell internals, or quietly add misleading fallback buttons.
