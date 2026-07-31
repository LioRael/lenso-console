# @lenso/console-package-api

Stable extension contract, host capabilities, UI primitives, and theme tokens
for Lenso Console packages.

Use `defineConsolePackageManifest` to describe installable surfaces and
`defineConsoleExtension` to bind those surfaces to React components. It derives
the runtime module from the manifest, so route, label, icon, workspace, and area
do not have to be declared twice. Runtime access to records, actions,
configuration, capabilities, and navigation is provided by `consoleHostApi`.

```tsx
import {
  Badge,
  ConsolePage,
  Panel,
  consoleHostApi,
  defineConsoleExtension,
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

function BillingPage() {
  const invoices = consoleHostApi.adminData.useRecords({
    entityName: "Invoice",
    moduleName: "billing",
  });

  return (
    <ConsolePage>
      <ConsolePage.Header>
        <ConsolePage.Heading>
          <ConsolePage.Title>Invoices</ConsolePage.Title>
        </ConsolePage.Heading>
        <ConsolePage.Actions>
          <Badge>{invoices.data?.data.length ?? 0} records</Badge>
        </ConsolePage.Actions>
      </ConsolePage.Header>
      <ConsolePage.Body>
        <Panel>
          <Panel.Header>
            <Panel.Title>Recent invoices</Panel.Title>
          </Panel.Header>
          <Panel.Content padding="md">
            <pre>{JSON.stringify(invoices.data, null, 2)}</pre>
          </Panel.Content>
        </Panel>
      </ConsolePage.Body>
    </ConsolePage>
  );
}

export const billingConsoleExtension = defineConsoleExtension({
  components: { billing: BillingPage },
  manifest: billingConsoleManifest,
});

// The bundle registry still points at this named ConsoleModule export.
export const billingConsoleModule = billingConsoleExtension.module;
```

## UI and theme contract

The package exports `ConsolePage`, `Panel`, `Button`, `IconButton`, `Badge`,
`StatusMarker`, `Tabs`, `SettingsGroup`, `SettingsRow`, `Field`, `Input`,
`Select`, `Textarea`, `EmptyState`, and `DataTable`. These primitives are also
present in the runtime host bundle, so a
dynamically loaded extension does not ship a second design system or React
runtime.

Import the complete theme from an extension stylesheet:

```css
@import "tailwindcss";
@import "@lenso/console-package-api/theme.css";
```

`theme.css` includes three layers:

- `tokens.css`: light/dark semantic CSS variables on `:root` and
  `:root[data-theme="light"]`.
- `components.css`: low-specificity styles for the shared React primitives.
- Tailwind v4 `@theme inline` mappings for colors, radii, shadows, fonts, and
  Console dimensions.

An extension can use the components, Tailwind utilities such as
`bg-panel text-fg-primary`, or the underlying CSS variables such as
`var(--bg-panel)` and `var(--line)`. The variables are the supported escape
hatch when a use case is more specialized than the component set.

Console packages should declare this package and React as peer dependencies.
The host API version is available as `CONSOLE_HOST_API_VERSION`; runtime bundle
registries must declare the same `hostApi` value.
