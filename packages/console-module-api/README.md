# @lenso/console-module-api

The framework-neutral public contract for a Lenso Console Module.

This package contains the Module manifest, the host identity and capability
surfaces, transport-neutral query and command descriptors, and stable host
errors. It has no React, DOM, HTTP, or browser-runtime dependency.

```ts
import {
  CONSOLE_MODULE_API_PROTOCOL,
  consoleCommands,
  consoleQueries,
  defineConsoleManifest,
} from "@lenso/console-module-api";

export const manifest = defineConsoleManifest({
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

export const listInvoices = consoleQueries.records({ entity: "Invoice" });
export const approveInvoice = consoleCommands.action<{ id: string }>("approve");
```

The API package is intentionally independent from the UI package. A Module
can keep its business contract and its React implementation in separate
builds, while the prebuilt Console Shell resolves the contract at runtime.
