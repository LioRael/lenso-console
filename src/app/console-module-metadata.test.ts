import { CONSOLE_MODULE_API_PROTOCOL } from "@lenso/console-module-api";
import type { ConsoleSystemConnection } from "@lenso/console-ui";
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

  test("hides every Surface from a quarantined artifact", () => {
    const artifactDigest = `sha256:${"c".repeat(64)}` as `sha256:${string}`;
    const navigation = navigationFromConsoleModuleMetadata(
      [],
      [],
      [
        {
          artifactDigest,
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
              },
              {
                area: "operations",
                id: "settings",
                label: "Settings",
                path: "/billing/settings",
              },
            ],
          },
          moduleId: "acme/billing",
          moduleReleaseDigest: `sha256:${"d".repeat(64)}`,
        },
      ],
      new Set([`acme/billing:${artifactDigest}`])
    );

    expect(navigation).not.toContainEqual(
      expect.objectContaining({ moduleId: "acme/billing" })
    );
  });

  test("composes only connected exact Module releases", () => {
    const artifactDigest = `sha256:${"a".repeat(64)}` as const;
    const releaseDigest = `sha256:${"b".repeat(64)}` as const;
    const connection: ConsoleSystemConnection = {
      systemId: "support-desk",
      topologyDigest: `sha256:${"c".repeat(64)}`,
      status: "unavailable",
      reason: "billing is unavailable",
      managementBinding: {
        systemId: "support-desk",
        topologyDigest: `sha256:${"c".repeat(64)}`,
        serviceIds: [],
        adapterIds: [],
        permissions: [],
        policy: {
          policyId: "support-desk",
          revision: 1,
          digest: `sha256:${"d".repeat(64)}`,
        },
      },
      services: [],
      modules: [
        {
          moduleId: "acme/billing",
          delivery: "service",
          moduleReleaseDigest: releaseDigest,
          consoleUiArtifactDigest: artifactDigest,
          status: "unavailable",
          reason: "workload_absent",
        },
      ],
    };
    const navigation = navigationFromConsoleModuleMetadata(
      [],
      [],
      [
        {
          artifactDigest,
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
              },
            ],
          },
          moduleId: "acme/billing",
          moduleReleaseDigest: releaseDigest,
        },
      ],
      new Set(),
      connection
    );

    expect(navigation).not.toContainEqual(
      expect.objectContaining({ path: "/billing/invoices" })
    );
    expect(navigation).not.toContainEqual(
      expect.objectContaining({ moduleId: "lenso/platform-story" })
    );
    expect(navigation).toContainEqual(
      expect.objectContaining({ path: "/services" })
    );
  });
});
