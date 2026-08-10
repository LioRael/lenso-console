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
  hostApi: "^2.0.0",
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
The receipt carries the Module identity, release digest, UI digest, entry, and
manifest. The Shell refuses an artifact whose loaded export does not match that
receipt.

The package ships precompiled StyleX CSS for consumers that do not run the
Console compiler themselves. Module authors should prefer the typed StyleX
slots and shared token contract:

```css
@import "@lenso/console-ui/stylex.css";
```

```tsx
import { ConsolePage, SurfaceRoot, pageStyles } from "@lenso/console-ui";

function Invoices() {
  return (
    <SurfaceRoot moduleId="acme/billing" surfaceId="invoices">
      <ConsolePage stylex={pageStyles.page}>Invoices</ConsolePage>
    </SurfaceRoot>
  );
}
```

Use `@lenso/console-tokens` for typed semantic tokens. Legacy global CSS is not
part of the public `@lenso/console-ui` surface.
