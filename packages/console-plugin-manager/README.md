# @lenso/console-plugin-manager

An optional, read-only Console page for inspecting the targets and Plugins visible
to an explicitly supplied `@lenso/console-sdk` client.

```ts
import "@lenso/console-plugin-manager/styles.css";
import { pluginManagerConsole } from "@lenso/console-plugin-manager/react";

const binding = pluginManagerConsole({
  id: "plugin-manager",
  path: "/plugins",
  catalog: visibleConsoleClient,
});
```

The caller supplies only the Console client it already owns. The page reads the
existing `targets`, `plugins`, and `catalog` endpoints. It shows admitted
operation metadata and configuration provenance, never configuration values.
Live health stays unknown: declaration or configuration resolution is not
evidence that a Plugin is running. No install, remove, restart, update, or
arbitrary Manage controls are provided.

Each target has a compact secondary Lenso UI table with natural column widths.
Plugin names link to a read-only detail page with visible operations and
configuration field and source metadata. The binding retains `index` at `path`
and derives `detail` at `${path}/:targetId/:pluginId` (ignoring a trailing slash).
Both identity parameters are required, so the same Plugin on different targets
has distinct URLs. Use binding-local `navigation.href("detail", { targetId,
pluginId })` and `navigation.go` to let the host encode parameters, qualify the
base path, and apply navigation guards. Existing callers need no new options.
The shared page context supplies the Plugins identity on the index and a Plugin
identity with an explicit guarded Return to plugin list on detail. This is
inspection, not selection, and never replaces the Dock with artificial actions.
Failed catalog requests offer an inline retry; an unlisted target/plugin pair
shows a not-found state without claiming unsupported permissions.

The package build lowers StyleX at build time and emits `dist/styles.css`; it
does not rely on runtime `stylex.create` evaluation.
Import the stylesheet when consuming built output. The composed preview resolves
the existing `lenso-source` export for live page edits while keeping the Shell on
its compiled `console-react` alias; no additional plugin-manager alias is needed.
