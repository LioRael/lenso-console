# @lenso/console-package-api

Shared declarations and host capabilities for Lenso Console packages.

Use `defineConsolePackageManifest` to describe installable surfaces and
`defineConsoleModule` to export their React implementation. Runtime access to
records, actions, configuration, capabilities, and navigation is provided by
`consoleHostApi` when the package is loaded by Lenso Console.

```tsx
import {
  consoleHostApi,
  defineConsoleModule,
  defineConsolePackageManifest,
} from "@lenso/console-package-api";

export const billingConsoleManifest = defineConsolePackageManifest({
  area: "data",
  exportName: "billingConsoleModule",
  id: "billing",
  label: "Billing",
  packageName: "@example/billing-console",
  requiredCapabilities: ["billing.invoices.read"],
  route: "/billing/invoices",
  source: "installed",
  surfaceName: "invoices",
});

export const billingConsoleModule = defineConsoleModule({
  id: billingConsoleManifest.id,
  surfaces: [
    {
      area: billingConsoleManifest.area,
      component: () => {
        const invoices = consoleHostApi.adminData.useRecords({
          entityName: "Invoice",
          moduleName: "billing",
        });
        return <pre>{JSON.stringify(invoices.data, null, 2)}</pre>;
      },
      label: billingConsoleManifest.label,
      path: billingConsoleManifest.route,
    },
  ],
});
```

Console packages should declare this package and React as peer dependencies.
Import `@lenso/console-package-api/theme.css` when a package needs the shared
Tailwind theme tokens.
