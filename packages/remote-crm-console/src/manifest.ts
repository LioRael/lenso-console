import { defineConsolePackageManifest } from "@lenso/console-package-api";

import consoleSurface from "../console-surface.json";

const consoleSurfaceContract = consoleSurface as unknown as {
  readonly area: "data";
  readonly exportName: "remoteCrmConsoleModule";
  readonly icon: "users";
  readonly id: "remote-crm";
  readonly label: "Contacts";
  readonly localizedLabels: { readonly "zh-CN": "联系人" };
  readonly navigation: {
    readonly group: {
      readonly id: "customer-data";
      readonly label: "Customers";
      readonly localizedLabels: { readonly "zh-CN": "客户" };
      readonly order: 10;
    };
    readonly order: 70;
    readonly workspace: {
      readonly icon: "network";
      readonly id: "crm";
      readonly label: "CRM";
    };
  };
  readonly packageName: "@lenso/remote-crm-console";
  readonly requiredCapabilities: readonly ["remote_crm.contacts.read"];
  readonly route: "/data/remote-crm";
  readonly source: "installed";
  readonly surfaceName: "remote-crm";
  readonly version: "workspace";
};

export const remoteCrmConsoleManifest = defineConsolePackageManifest(
  consoleSurfaceContract
);
