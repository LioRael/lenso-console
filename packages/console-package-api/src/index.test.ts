import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  CONSOLE_HOST_API_VERSION,
  Button,
  StatusMarker,
  Tabs,
  consoleLocalizedLabel,
  consoleSurfaceFromPackageManifest,
  consoleSurfacesFromPackageManifest,
  defineConsoleExtension,
  defineConsoleModule,
  defineConsolePackageManifest,
  isConsoleModule,
} from ".";

describe("console package API", () => {
  test("publishes Tailwind theme tokens for console packages", () => {
    const themeCss = readFileSync(new URL("../theme.css", import.meta.url), {
      encoding: "utf-8",
    });

    expect(themeCss).toContain("--color-card: var(--surface);");
    expect(themeCss).toContain("--color-muted-foreground: var(--secondary);");
    expect(themeCss).toContain(
      "--color-control-hover: var(--bg-control-hover);"
    );
    expect(themeCss).toContain("--radius-control: var(--radius-control);");
    expect(themeCss).toContain("--shadow-overlay: var(--elevation-overlay);");
    expect(themeCss).toContain("--color-panel-gloss: var(--panel-gloss);");
    expect(themeCss).toContain("--color-shadow-strong: var(--shadow-strong);");
    expect(themeCss).toContain('@import "./tokens.css";');
    expect(themeCss).toContain('@import "./components.css";');
    expect(themeCss).toContain(
      "--spacing-control-sm: var(--control-height-sm);"
    );

    const tokensCss = readFileSync(new URL("../tokens.css", import.meta.url), {
      encoding: "utf-8",
    });
    expect(tokensCss).toContain(':root[data-theme="light"]');
    expect(tokensCss).toContain("--content-gutter: 20px;");

    const componentsCss = readFileSync(
      new URL("../components.css", import.meta.url),
      { encoding: "utf-8" }
    );
    expect(componentsCss).toContain(".lenso-ui-button");
    expect(componentsCss).toContain("left: 50%;");
    expect(componentsCss).toContain("transform: translateX(-50%);");
  });

  test("publishes the host version and shared UI primitives", () => {
    expect(CONSOLE_HOST_API_VERSION).toBe("1");
    expect(Button).toBeTypeOf("function");
    expect(Tabs.Tab).toBeTypeOf("function");
    expect(
      StatusMarker({ align: "top", children: "Degraded", tone: "warning" })
        .props
    ).toMatchObject({
      "data-align": "top",
      "data-tone": "warning",
    });
  });

  test("validates console modules at the package boundary", () => {
    const valid = {
      id: "billing",
      surfaces: [
        {
          area: "data",
          component: () => null,
          label: "Billing",
          path: "/billing",
        },
      ],
    } as const;

    expect(isConsoleModule(valid)).toBe(true);
    expect(defineConsoleModule(valid)).toBe(valid);
    expect(isConsoleModule({ id: "empty", surfaces: [] })).toBe(false);
    expect(
      isConsoleModule({
        ...valid,
        surfaces: [{ ...valid.surfaces[0], path: "billing" }],
      })
    ).toBe(false);
  });

  test("resolves extension navigation labels for the active locale", () => {
    const item = {
      label: "Contacts",
      localizedLabels: { "zh-CN": "联系人" },
    } as const;

    expect(consoleLocalizedLabel(item, "zh-CN")).toBe("联系人");
    expect(consoleLocalizedLabel(item, "en")).toBe("Contacts");
  });

  test("binds an extension manifest to matching module routes", () => {
    const manifest = defineConsolePackageManifest({
      area: "data",
      exportName: "billingConsoleModule",
      id: "billing",
      label: "Billing",
      packageName: "@example/billing-console",
      requiredCapabilities: ["billing.read"],
      route: "/billing",
      source: "installed",
      surfaceName: "billing",
    } as const);
    const module = defineConsoleModule({
      id: "billing",
      surfaces: [
        {
          area: "data",
          component: () => null,
          label: "Billing",
          path: "/billing",
        },
      ],
    } as const);

    const generated = defineConsoleExtension({
      components: { billing: () => null },
      manifest,
    });
    expect(generated.module).toMatchObject({
      id: "billing",
      surfaces: [
        {
          area: "data",
          label: "Billing",
          path: "/billing",
        },
      ],
    });

    expect(defineConsoleExtension({ manifest, module })).toEqual({
      manifest,
      module,
    });
    expect(() =>
      defineConsoleExtension({
        manifest,
        module: {
          ...module,
          surfaces: [{ ...module.surfaces[0], path: "/other" }],
        },
      })
    ).toThrow("manifest routes must match");
  });

  test("defines console package manifests for frontend modules", () => {
    const manifest = defineConsolePackageManifest({
      area: "runtime",
      exportName: "billingConsoleModule",
      icon: "database",
      id: "billing",
      label: "Billing",
      packageName: "@lenso/billing-console",
      requiredCapabilities: ["billing.read"],
      route: "/data/billing",
      source: "installed",
      surfaceName: "billing",
      version: "workspace",
    });

    expect(manifest).toEqual({
      area: "runtime",
      exportName: "billingConsoleModule",
      icon: "database",
      id: "billing",
      label: "Billing",
      packageName: "@lenso/billing-console",
      requiredCapabilities: ["billing.read"],
      route: "/data/billing",
      source: "installed",
      surfaceName: "billing",
      version: "workspace",
    });
  });

  test("maps package manifests to Rust console surface metadata", () => {
    const manifest = defineConsolePackageManifest({
      area: "data",
      exportName: "billingConsoleModule",
      icon: "database",
      id: "billing",
      label: "Billing",
      packageName: "@lenso/billing-console",
      requiredCapabilities: ["billing.read"],
      route: "/data/billing",
      source: "installed",
      surfaceName: "billing",
      version: "workspace",
    } as const);

    expect(consoleSurfaceFromPackageManifest(manifest)).toEqual({
      area: "data",
      icon: "database",
      label: "Billing",
      name: "billing",
      package: {
        export: "billingConsoleModule",
        name: "@lenso/billing-console",
      },
      required_capabilities: ["billing.read"],
      route: "/data/billing",
    });
  });

  test("maps multi-surface package manifests to Rust console surface metadata", () => {
    const manifest = defineConsolePackageManifest({
      exportName: "billingConsoleModule",
      id: "billing",
      packageName: "@lenso/billing-console",
      source: "installed",
      surfaces: [
        {
          area: "data",
          icon: "database",
          label: "Invoices",
          requiredCapabilities: ["billing.invoices.read"],
          route: "/billing/invoices",
          surfaceName: "invoices",
        },
        {
          area: "configuration",
          label: "Billing Settings",
          requiredCapabilities: ["billing.settings.read"],
          route: "/billing/settings",
          surfaceName: "settings",
        },
      ],
      version: "workspace",
    } as const);

    expect(consoleSurfacesFromPackageManifest(manifest)).toEqual([
      {
        area: "data",
        icon: "database",
        label: "Invoices",
        name: "invoices",
        package: {
          export: "billingConsoleModule",
          name: "@lenso/billing-console",
        },
        required_capabilities: ["billing.invoices.read"],
        route: "/billing/invoices",
      },
      {
        area: "configuration",
        label: "Billing Settings",
        name: "settings",
        package: {
          export: "billingConsoleModule",
          name: "@lenso/billing-console",
        },
        required_capabilities: ["billing.settings.read"],
        route: "/billing/settings",
      },
    ]);
  });

  test("maps package manifest navigation to Rust console surface metadata", () => {
    const manifest = defineConsolePackageManifest({
      area: "data",
      exportName: "crmConsoleModule",
      icon: "database",
      id: "crm",
      label: "Contacts",
      navigation: {
        group: {
          id: "customers",
          label: "Customers",
          order: 20,
        },
        order: 10,
        workspace: {
          icon: "briefcase",
          id: "crm",
          label: "CRM",
        },
      },
      packageName: "@lenso/crm-console",
      requiredCapabilities: ["crm.contacts.read"],
      route: "/crm/contacts",
      source: "installed",
      surfaceName: "contacts",
      version: "workspace",
    } as const);

    expect(consoleSurfaceFromPackageManifest(manifest)).toEqual({
      area: "data",
      icon: "database",
      label: "Contacts",
      name: "contacts",
      navigation: {
        group: {
          id: "customers",
          label: "Customers",
          order: 20,
        },
        order: 10,
        workspace: {
          icon: "briefcase",
          id: "crm",
          label: "CRM",
        },
      },
      package: {
        export: "crmConsoleModule",
        name: "@lenso/crm-console",
      },
      required_capabilities: ["crm.contacts.read"],
      route: "/crm/contacts",
    });
  });

  test("omits install-only manifest fields from console surface metadata", () => {
    const manifest = defineConsolePackageManifest({
      area: "runtime",
      exportName: "storyConsoleModule",
      id: "lenso/platform-story",
      label: "Stories",
      packageName: "@lenso/story-console",
      requiredCapabilities: [],
      route: "/runtime/stories",
      source: "first_party",
      surfaceName: "stories",
      version: "workspace",
    } as const);

    expect(Object.keys(consoleSurfaceFromPackageManifest(manifest))).toEqual([
      "area",
      "label",
      "name",
      "package",
      "required_capabilities",
      "route",
    ]);
  });
});
