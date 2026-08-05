import { CONSOLE_MODULE_API_PROTOCOL } from "@lenso/console-module-api";
import { describe, expect, test } from "vitest";

import {
  consoleModuleMetadataWithFallback,
  navigationFromConsoleModuleMetadata,
} from "./console-module-metadata";

describe("Console Module metadata", () => {
  test("keeps missing backend evidence explicit", () => {
    expect(
      consoleModuleMetadataWithFallback({ apiMode: true, data: undefined })
    ).toEqual([]);
  });

  test("adds ESM Module UI navigation without package installation", () => {
    const navigation = navigationFromConsoleModuleMetadata(
      [
        {
          module_name: "lenso/auth",
          console: [
            {
              area: "operations",
              label: "Operators",
              name: "operators",
              presentation: {
                entry: "auth-users",
                kind: "esm",
              },
              route: "/auth/operators",
            },
          ],
        },
      ],
      []
    );

    expect(navigation).toContainEqual(
      expect.objectContaining({
        moduleId: "lenso/auth",
        path: "/auth/operators",
      })
    );
  });

  test("derives navigation from the materialized receipt manifest", () => {
    const navigation = navigationFromConsoleModuleMetadata(
      [],
      ["billing.invoices.read"],
      [
        {
          artifactDigest: `sha256:${"a".repeat(64)}`,
          basePath: "/artifacts/billing/",
          entry: "index.js",
          entries: [{ name: "module", path: "index.js" }],
          format: "console_ui_esm",
          grantedPermissions: [],
          manifest: {
            consoleUi: "^1.0.0",
            hostApi: "^1.0.0",
            moduleId: "acme/billing",
            protocol: CONSOLE_MODULE_API_PROTOCOL,
            surfaces: [
              {
                area: "data",
                id: "invoices",
                label: "Invoices",
                path: "/billing/invoices",
                requiredCapabilities: ["billing.invoices.read"],
              },
            ],
          },
          moduleId: "acme/billing",
          moduleReleaseDigest: `sha256:${"b".repeat(64)}`,
        },
      ]
    );

    expect(navigation).toContainEqual(
      expect.objectContaining({
        moduleId: "acme/billing",
        path: "/billing/invoices",
      })
    );
  });
});
