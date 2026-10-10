# Standalone Console React

`@lenso/console-react` is a frontend shell, not an Engine runtime or router.
Import `@lenso/tokens/styles.css` and `@lenso/console-react/styles.css` in the host.
The published JavaScript contains lowered StyleX styles; consumers do not need
to compile the package's source.

```tsx
import { bindConsole, ConsoleShell, defineConsolePlugin } from "@lenso/console-react";
import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";

const records = defineConsolePlugin<{ list(): Promise<string[]> }>({
  id: "records",
  pages: { list: { component: RecordsPage } },
  navigation: [
    { id: "records", label: "Records", page: "list", defaultPlacement: "primary" },
  ],
});

const plugins = [
  bindConsole(records, {
    id: "primary-records",
    routes: { list: "/records" },
    services: recordsService,
  }),
];

<ConsoleShell plugins={plugins} router={hostRouter} basePath="/console" />;
```

`router` supplies `pathname`, `navigate(href)` and `match(pattern, pathname)`.
Patterns and generated links are base-qualified. Binding route paths are local
to `basePath`; do not prepend the base yourself. Parameters use `:name` segments.
Ambiguous static/parameter paths, duplicate normalized paths and duplicate
binding IDs fail assembly rather than depend on matcher ordering.

Definitions can be installed repeatedly with different binding IDs, routes and
typed services. Page navigation is local to its binding. Only explicit
`navigation` entries enter the global catalog; tabs and detail pages do not.
Page groups declare their default tab and explicitly map related detail pages
to an active tab. Tabs are ordinary route anchors, preserving modified clicks.
By default they occupy the opposite edge from the Dock with content clearance.
Narrow and sidebar presentations use the same links in-content. `tabsPosition`
may select another edge or `"content"`; `topEdge` forwards the existing layout
effect options. Fixed corner rows compose multiple `Corner` children without
overlapping independent contributions or losing their React context.

The optional `session` projects trusted host access checks into the UI.
Changing its `scopeKey` revokes the old page activation and aborts its signal;
leaving a page or replacing its definition/services also revokes it. Late
results must check `activation.isCurrent()`. Aborting does not undo a write.
Changing presentation preferences does not remount pages.
Low-level hosts can use `useConsoleActivation(scope, parentSignal)` with the
same lifecycle rule. The SDK's admitted and preview hosts use it as well.

Pages contribute controlled selection actions with
`<ConsoleActionScope scopeKey={activation.key} value={selection} />`.
`selection` is the existing `ConsoleDockSelection` shape: count, scopeLabel,
actions with onInvoke, running and onExit. The page owns target snapshots,
confirmation, execution and feedback. The host protects retained callbacks,
stale cleanup and pointer-down/up across retiring scopes.

`navigationDefaults` selects initial pins, mode and position. A preference
snapshot of `null` uses defaults; `pinned: []` intentionally pins nothing.
Defaults seed a scope once; later installation does not insert new primary pins.
Preference transport projects only stable references, mode and position, not
unknown metadata or component objects.
Unknown or temporarily forbidden pin references remain stored but do not
expose labels. Keyboard move controls and dragging change the same order.
Saving uses the last loaded revision. Failed saves retain the local draft;
explicit Reload discards it, while Reset restores defaults.

`renderStatus(status)` may replace the minimal empty, loading, sign-in,
forbidden, unavailable, not-found and page-error surfaces.

## Checks

- `bun build.ts` lowers StyleX and emits `dist/index.js` and `dist/styles.css`.
- `bunx tsc -p tsconfig.build.json` emits declarations.
- `bunx tsc -p tsconfig.json` checks source and heterogeneous binding contracts.
- `bun test test/console-model.test.ts` proves composition validation and pin rules.
- After building, `bun test test/browser/console-shell.browser.test.ts` exercises
  the compiled distribution in a real browser. Set
  `LENSO_BROWSER_EXECUTABLE_PATH` when using a system Chromium executable.

The existing Shell imports compatibility re-exports, so standalone pages,
SDK pages and the original layout consume the same React contexts and Dock.
