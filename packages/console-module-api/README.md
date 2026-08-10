# @lenso/console-module-api

The framework-owned public contract for a Lenso Console Module.

This package consumes the framework-owned Console Module and `console_ui_esm`
contracts, explicit Managed Service Context, typed Module Inventory,
declarative Action Contributions, and descriptor-bound configuration operations.
It has no React, DOM, HTTP, or browser-runtime dependency.

```ts
import {
  CONSOLE_MODULE_API_PROTOCOL,
  defineConsoleManifest,
} from "@lenso/console-module-api";

export const manifest = defineConsoleManifest({
  protocol: CONSOLE_MODULE_API_PROTOCOL,
  moduleId: "acme/billing",
  hostApi: "^2.0.0",
  consoleUi: "^2.0.0",
  surfaces: [
    {
      id: "invoices",
      path: "/billing/invoices",
      label: "Invoices",
      area: "data",
    },
  ],
});

// The host supplies an explicit ManagedServiceContext for every operation.
export const readBillingInventory = (client: ConsoleClient, context: ManagedServiceContext) =>
  client.inventory({ context });
```

The API package is intentionally independent from the UI package. A Module
can keep its business contract and its React implementation in separate
builds, while the prebuilt Console Shell resolves the exact framework artifact
and routes typed operations through the selected Managed Service.
