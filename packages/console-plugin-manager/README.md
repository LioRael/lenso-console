# @lenso/console-plugin-manager

An optional, read-only Console page for inspecting the targets and Plugins visible
to an explicitly supplied `@lenso/console-sdk` client.

```ts
import { pluginManagerConsole } from "@lenso/console-plugin-manager";

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

The package build lowers StyleX at build time and emits `dist/styles.css`; it
does not rely on runtime `stylex.create` evaluation.
