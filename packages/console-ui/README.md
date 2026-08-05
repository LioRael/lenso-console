# @lenso/console-ui

The public React adapter and UI primitives for dynamically loaded Lenso Console
Module UI.

`@lenso/console-ui` depends on `@lenso/console-module-api`; the API package does
not depend on React. A Module UI build exports one `ConsoleUiModule` as its
default ESM export:

```tsx
import {
  CONSOLE_MODULE_API_PROTOCOL,
  defineConsoleManifest,
} from "@lenso/console-module-api";
import { ConsolePage, defineConsoleUiModule } from "@lenso/console-ui";

const manifest = defineConsoleManifest({
  protocol: CONSOLE_MODULE_API_PROTOCOL,
  moduleId: "acme/billing",
  hostApi: "^1.0.0",
  consoleUi: "^1.0.0",
  surfaces: [
    {
      id: "invoices",
      path: "/billing/invoices",
      label: "Invoices",
      area: "data",
    },
  ],
});

function Invoices() {
  return <ConsolePage>Invoices</ConsolePage>;
}

export default defineConsoleUiModule({
  manifest,
  surfaces: { invoices: Invoices },
});
```

The Console Shell is built once and loads a reviewed `console_ui_esm` artifact
from a same-origin receipt. This is trusted ESM execution, not a browser
sandbox; capability checks and artifact review remain host responsibilities.
The existing isolated Bridge artifact is a compatibility path while its service
receipt and delivery protocol are migrated.

Import the shared visual language from the package CSS entry points when
building a Module UI:

```css
@import "@lenso/console-ui/theme.css";
@import "@lenso/console-ui/components.css";
```
