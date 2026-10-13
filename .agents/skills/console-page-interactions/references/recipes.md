# Recipes

Read [runtime support](runtime-support.md) first. These examples use public imports; adapt business handlers and page contracts, not host internals.
For UI, read [presentation](presentation.md). Icon examples below use the
sample application's existing `lucide-react` dependency; other applications
should use their installed approved SVG components, not add a library by default.

## Controlled page context and corner actions

Works in both host branches when the existing layout surrounds the page. Create the context once; page state remains canonical. Here the context requests a presentation change only. For save/delete, call the page's guarded execution path instead.

```tsx
import { useState } from "react";
import { Rows3 } from "lucide-react";
import {
  ConsoleIconButton,
  ConsoleLayout,
  createConsolePageContext,
  type ConsoleActivation,
} from "@lenso/console-react";

const Density = createConsolePageContext<{ compact: boolean }>();

function DensityAction() {
  const { context, setContext } = Density.useConsolePageContext();
  return (
    <ConsoleLayout.Corner area="bottomLeft">
      <ConsoleIconButton
        label={context.compact ? "Use comfortable rows" : "Use compact rows"}
        variant="secondary"
        onClick={() => setContext((previous) => ({ compact: !previous.compact }))}
      >
        <Rows3 size={16} aria-hidden="true" />
      </ConsoleIconButton>
    </ConsoleLayout.Corner>
  );
}

export function DensityProjection({ activation }: { activation: ConsoleActivation }) {
  const [value, setValue] = useState({ compact: false });
  return (
    <Density.Provider scopeKey={activation.key} value={value} onChange={setValue}>
      <DensityAction />
    </Density.Provider>
  );
}
```

Wire the same controlled value into the real page's row presentation. `ConsoleLayout.Corner` portals preserve React providers and compose multiple contributors; `active` can withdraw only this contributor. Use `Foreground` for a genuine non-corner foreground surface, not to replace host Dock controls.

Evidence: `packages/console-react/src/console-page-context.tsx`, `packages/console-react/src/console-layout.tsx`, `packages/console-react/src/console-icon-button.tsx`; lifecycle proof in `plugins/console/shell/test/browser/layout.fixture.tsx`.

## Selection Dock actions

Works in both current host branches. This adapter presents an existing page-owned selection workflow; `archiveSnapshot` must already implement snapshot/confirmation/lock/error handling from [safety](safety.md).

```tsx
import { Archive } from "lucide-react";
import {
  ConsoleActionScope,
  type ConsoleActivation,
} from "@lenso/console-react";

export function SelectionProjection({
  activation, selectedIds, running, archiveSnapshot, exitSelection,
}: {
  activation: ConsoleActivation;
  selectedIds: readonly string[];
  running: boolean;
  archiveSnapshot(): Promise<void>;
  exitSelection(): void;
}) {
  return (
    <ConsoleActionScope
      scopeKey={activation.key}
      value={selectedIds.length ? {
        count: selectedIds.length,
        scopeLabel: "Orders on this page",
        running,
        actions: [{
          id: "archive",
          label: "Archive selected orders",
          icon: <Archive size={20} aria-hidden="true" />,
          onInvoke: () => void archiveSnapshot(),
        }],
        onExit: exitSelection,
      } : null}
    />
  );
}
```

The scope host supplies `activationKey`; page code supplies count and honest scope, not a claim of all-filtered or cross-page selection. Coordinate multiple lists into one current contribution.

Read `OrdersManage` in `examples/composed-console/orders-pages.tsx` for the lock, target snapshot before confirmation, activation recheck, signal, error retention and success reconciliation. The binding lives in `composition.tsx`; `packages/console-react/src/console-dock.tsx` is the source of the supported selection shape.

## Opt-in Command and Context Bar

**Check the actual host against [runtime support](runtime-support.md).** Updated candidate admission/preview hosts and local `ConsoleShell` consume this projection. Derive one `ConsolePageScope` from current state. Keep the execution path shared with visible controls.

```tsx
import {
  ConsolePageScope,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";

export function OrderProjection({
  activation, navigation, order, filter, clearFilter,
}: Pick<ConsoleLocalPageProps, "activation" | "navigation"> & {
  order: { id: string; status: string };
  filter: string;
  clearFilter(): void;
}) {
  return (
    <ConsolePageScope
      scopeKey={activation.key}
      value={{
        context: {
          kind: "object",
          label: "Order",
          id: order.id,
          return: {
            label: "Return to orders",
            onInvoke: () => navigation.go("manage"),
          },
        },
        commands: [{
          id: "clear-filter",
          label: "Clear order filter",
          disabled: !filter,
          onInvoke: clearFilter,
        }],
      }}
    />
  );
}
```

`manage` must be a page in this binding. Show status in content; add it to context
only when it helps the task rather than repeating the detail page.

Choose task context deliberately:

- Omit `context` to retain declared `pageGroups` fallback tabs; a commands-only contribution does not replace them.
- Use `{ kind: "hidden" }` to hide task context explicitly.
- Use `kind: "tabs"` with `label`, current `activeId`, and `{ id, label, href }` entries for task-specific route tabs. Generate hrefs through `navigation.href`; show only allowed destinations.
- Use `kind: "object"` for a real object label, optional identifier and status. Tabs and objects can include an explicit labelled `return`.

Explicit context replaces fallback even with `tabsPosition="content"`. Shell owns centering, responsive clearance and transitions. Command IDs are local to the current contribution; a command may update its disabled state/callback without a new activation.

The example above uses local page-ID navigation. In SDK `PageProps`, use the supplied activation and `navigation.go([])` for an explicit return to the workspace index. Build tab hrefs with `navigation.href(["orders", id])`. The admitted/preview host does not discover commands from arbitrary services or controls.

Evidence and expanded examples: `packages/console-react/src/console-action-scope.tsx`, `packages/console-react/README.md`, `examples/composed-console/orders-pages.tsx` (`OrdersManage` and `OrderDetail`), and `packages/console-react/test/browser/fixture.tsx` (fallback/hidden/tabs/object cases). `console-command.tsx` and `console-context-bar.tsx` are internal presentation implementations, not public page imports.
