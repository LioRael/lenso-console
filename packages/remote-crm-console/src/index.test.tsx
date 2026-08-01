import { describe, expect, test } from "vitest";

import {
  RemoteCrmConsolePage,
  remoteCrmConsoleManifest,
  remoteCrmConsoleModule,
} from ".";

describe("remote crm console package", () => {
  test("declares an installable remote crm console package export", () => {
    expect(remoteCrmConsoleManifest).toMatchObject({
      exportName: "remoteCrmConsoleModule",
      navigation: {
        group: {
          id: "customer-data",
          label: "Customers",
          order: 10,
        },
        order: 70,
        workspace: {
          icon: "network",
          id: "crm",
          label: "CRM",
        },
      },
      packageName: "@lenso/remote-crm-console",
      requiredCapabilities: ["remote_crm.contacts.read"],
      route: "/data/remote-crm",
      source: "installed",
      surfaceName: "remote-crm",
      version: "workspace",
    });
    expect(remoteCrmConsoleModule).toMatchObject({
      id: "remote-crm",
      surfaces: [
        {
          label: "Contacts",
          navigation: remoteCrmConsoleManifest.navigation,
          path: "/data/remote-crm",
        },
        {
          label: "Companies",
          navigation: {
            group: remoteCrmConsoleManifest.navigation?.group,
            order: 80,
            workspace: remoteCrmConsoleManifest.navigation?.workspace,
          },
          path: "/data/remote-crm/companies",
        },
      ],
    });
    expect(RemoteCrmConsolePage).toBeTypeOf("function");
  });
});
